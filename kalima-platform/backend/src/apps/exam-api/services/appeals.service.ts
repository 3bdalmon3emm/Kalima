import type { Server as SocketIOServer } from "socket.io";
import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "../../../libs/errors";
import { NOTIFICATION_CATEGORY, notification_key_enum, notificationService } from "../../store-api/services/notification.service";
import { attemptsService } from "./attempts.service";
import { mediaService } from "./media.service";
import { rescore } from "./results.service";

// Appeals: on a question the student lost marks on, they write why and may
// add photos. The teacher (or assistant, or the admin) accepts with a new
// mark in halves or rejects with a reason. One request and one answer, not a
// chat; after an answer the student may appeal again. A mark given here is
// marked as set by a person, so automatic re-grades leave it alone.

type AttemptQuestion = { section_id: number; question_id: number; mark: number };

const MAX_TEXT = 5_000;
const PAGE_SIZE = 30;

const num = (d: unknown) => Number(d ?? 0);

export type Decision = { accept: boolean; mark?: number; reply?: string };

class AppealsService {
  constructor(private db: PrismaClient = prisma) {}

  private async present(rows: { id: number; question_id: number; text: string; image_keys: string[]; status: string; old_mark: unknown; new_mark: unknown; reply: string | null; decided_at: Date | null; created_at: Date }[]) {
    return Promise.all(rows.map(async (a) => ({
      id: a.id,
      question_id: a.question_id,
      text: a.text,
      images: await Promise.all(a.image_keys.map((k) => mediaService.url(k))),
      status: a.status,
      old_mark: num(a.old_mark),
      new_mark: a.new_mark === null ? null : num(a.new_mark),
      reply: a.reply,
      decided_at: a.decided_at,
      created_at: a.created_at,
    })));
  }

  // Every appeal of an attempt, oldest first, for the paper and the result.
  async forAttempt(attemptId: number) {
    const rows = await this.db.ex_appeals.findMany({ where: { attempt_id: attemptId }, orderBy: { id: "asc" } });
    return this.present(rows);
  }

  // ---------- The student ----------

  async create(
    io: SocketIOServer | null,
    attemptId: number,
    studentId: number,
    body: { question_id?: unknown; text?: unknown },
    files: Express.Multer.File[] = [],
  ) {
    const attempt = await this.db.ex_attempts.findUnique({
      where: { id: attemptId },
      include: { link: { select: { id: true, code: true, teacher_user_id: true } } },
    });
    if (!attempt || attempt.student_user_id !== studentId) throw new NotFoundError("Attempt not found");
    if (attempt.status !== "done") throw new BadRequestError("You can appeal once the result is out");
    if (!(await attemptsService.answersShownFor(attempt))) throw new BadRequestError("You can appeal once the answers are shown");

    const questionId = Number(body.question_id);
    const item = (attempt.questions as unknown as AttemptQuestion[]).find((q) => q.question_id === questionId);
    if (!item) throw new BadRequestError("Question is not in this attempt");
    const answer = await this.db.ex_attempt_answers.findUnique({
      where: { attempt_id_question_id: { attempt_id: attemptId, question_id: questionId } },
      select: { mark: true },
    });
    const earned = num(answer?.mark);
    if (answer?.mark === null || earned >= item.mark) throw new BadRequestError("You can only appeal a question you lost marks on");

    const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
    if (!text && !files.length) throw new BadRequestError("Write why or add a photo");
    const waiting = await this.db.ex_appeals.findFirst({ where: { attempt_id: attemptId, question_id: questionId, status: "pending" } });
    if (waiting) throw new ConflictError("You already have an appeal waiting on this question");

    const keys = [];
    for (const f of files) keys.push(await mediaService.storeAppealPhoto(attemptId, f));
    let appeal;
    try {
      appeal = await this.db.ex_appeals.create({
        data: {
          attempt_id: attemptId, question_id: questionId, link_id: attempt.link_id, student_user_id: studentId,
          text, image_keys: keys, old_mark: earned,
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") throw new ConflictError("You already have an appeal waiting on this question");
      throw err;
    }

    // The teacher and their assistants hear about it; the admin test link
    // has no teacher, so its appeals wait on the paper for the admin.
    const teacherId = attempt.link.teacher_user_id;
    if (teacherId) {
      const assistants = await this.db.teacher_assistants.findMany({ where: { teacher_user_id: teacherId }, select: { assistant_user_id: true } });
      notificationService
        .sendToUsers(io, [teacherId, ...assistants.map((a) => a.assistant_user_id)], NOTIFICATION_CATEGORY.CUSTOM,
          notification_key_enum.EXAM_APPEAL_NEW,
          { entityType: "exam_appeal", entityId: appeal.id, targetLink: "/teacher/appeals", createdBy: studentId })
        .catch((err) => console.error("[exams] appeal notification failed", err));
    }
    return (await this.present([appeal]))[0];
  }

  // ---------- The teacher, assistant or admin ----------

  // Appeals on these links (null = every link, for the admin), newest
  // first, with the counts for the tabs.
  async list(linkIds: number[] | null, filter: { status?: string; page?: number } = {}) {
    const scope = linkIds ? { link_id: { in: linkIds } } : {};
    const status = filter.status === "answered" ? { status: { in: ["accepted", "rejected"] } } : { status: "pending" };
    const page = Math.max(Number(filter.page) || 1, 1);
    const [rows, pending, answered] = await Promise.all([
      this.db.ex_appeals.findMany({
        where: { ...scope, ...status },
        orderBy: filter.status === "answered" ? { decided_at: "desc" } : { created_at: "asc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          attempt: { select: { id: true, attempt_no: true, score: true, total: true, questions: true, exam: { select: { id: true, name: true } } } },
          link: { select: { teacher_user_id: true } },
        },
      }),
      this.db.ex_appeals.count({ where: { ...scope, status: "pending" } }),
      this.db.ex_appeals.count({ where: { ...scope, status: { in: ["accepted", "rejected"] } } }),
    ]);
    const people = await this.db.users.findMany({
      where: { id: { in: [...new Set(rows.flatMap((r) => [r.student_user_id, ...(r.link.teacher_user_id ? [r.link.teacher_user_id] : [])]))] } },
      select: { id: true, name: true, phone: true, profile_pic_url: true, students: { select: { sequenced_id: true } } },
    });
    const byId = new Map(people.map((u) => [u.id, u]));
    const shown = await this.present(rows);
    return {
      counts: { pending, answered },
      page,
      page_size: PAGE_SIZE,
      appeals: rows.map((r, i) => {
        const list = r.attempt.questions as unknown as AttemptQuestion[];
        const index = list.findIndex((q) => q.question_id === r.question_id);
        const s = byId.get(r.student_user_id);
        return {
          ...shown[i],
          question: { id: r.question_id, n: index + 1, mark: index >= 0 ? list[index].mark : null },
          attempt: { id: r.attempt.id, attempt_no: r.attempt.attempt_no, score: num(r.attempt.score), total: num(r.attempt.total) },
          exam: r.attempt.exam,
          student: s ? { id: s.id, name: s.name, phone: s.phone, profile_pic_url: s.profile_pic_url, serial: s.students?.sequenced_id ?? null } : null,
          teacher: r.link.teacher_user_id ? byId.get(r.link.teacher_user_id)?.name ?? null : null,
        };
      }),
    };
  }

  // The appeal with its question as the grader sees it (answer key shown).
  async detail(id: number) {
    const appeal = await this.db.ex_appeals.findUnique({ where: { id }, include: { attempt: true } });
    if (!appeal) throw new NotFoundError("Appeal not found");
    const { review, passages } = await attemptsService.review(appeal.attempt, true);
    const item = review.find((r) => r.question_id === appeal.question_id) ?? null;
    return {
      ...(await this.present([appeal]))[0],
      item,
      passage: item?.question?.passage_id ? passages.find((p) => p.id === item.question!.passage_id) ?? null : null,
    };
  }

  async linkOf(id: number) {
    const appeal = await this.db.ex_appeals.findUnique({ where: { id }, select: { link_id: true } });
    if (!appeal) throw new NotFoundError("Appeal not found");
    return appeal.link_id;
  }

  // Accept with a new mark (0 to the question's mark, in halves) or reject
  // with a reason. Only a waiting appeal can be answered, once.
  async decide(io: SocketIOServer | null, id: number, decision: Decision, userId: number) {
    const appeal = await this.db.ex_appeals.findUnique({
      where: { id },
      include: { attempt: { select: { id: true, questions: true, link: { select: { code: true } } } } },
    });
    if (!appeal) throw new NotFoundError("Appeal not found");
    if (appeal.status !== "pending") throw new ConflictError("This appeal was already answered");
    const item = (appeal.attempt.questions as unknown as AttemptQuestion[]).find((q) => q.question_id === appeal.question_id);
    if (!item) throw new BadRequestError("Question is not in this attempt");
    const reply = typeof decision.reply === "string" ? decision.reply.trim().slice(0, MAX_TEXT) : "";

    const now = new Date();
    if (decision.accept) {
      const mark = Number(decision.mark);
      if (!Number.isFinite(mark) || !Number.isInteger(mark * 2)) throw new BadRequestError("Marks go in halves");
      if (mark < 0 || mark > item.mark) throw new BadRequestError("Mark is out of range");
      const claimed = await this.db.ex_appeals.updateMany({
        where: { id, status: "pending" },
        data: { status: "accepted", new_mark: mark, reply: reply || null, decided_by: userId, decided_at: now },
      });
      if (!claimed.count) throw new ConflictError("This appeal was already answered");
      await this.db.ex_attempt_answers.update({
        where: { attempt_id_question_id: { attempt_id: appeal.attempt_id, question_id: appeal.question_id } },
        data: { mark, graded_by: userId, graded_at: now },
      });
      await rescore(appeal.attempt_id, this.db);
    } else {
      if (!reply) throw new BadRequestError("Write the reason for rejecting");
      const claimed = await this.db.ex_appeals.updateMany({
        where: { id, status: "pending" },
        data: { status: "rejected", reply, decided_by: userId, decided_at: now },
      });
      if (!claimed.count) throw new ConflictError("This appeal was already answered");
    }

    notificationService
      .sendToUser(io, appeal.student_user_id, NOTIFICATION_CATEGORY.CUSTOM,
        decision.accept ? notification_key_enum.EXAM_APPEAL_ACCEPTED : notification_key_enum.EXAM_APPEAL_REJECTED,
        { entityType: "exam_appeal", entityId: id, targetLink: `/e/${appeal.attempt.link.code}/result/${appeal.attempt_id}`, createdBy: userId })
      .catch((err) => console.error("[exams] appeal notification failed", err));
    return this.detail(id);
  }

  // Waiting appeals per link, for the badges on the teacher's exams.
  async pendingByLink(linkIds: number[]) {
    if (!linkIds.length) return new Map<number, number>();
    const rows = await this.db.ex_appeals.groupBy({ by: ["link_id"], where: { link_id: { in: linkIds }, status: "pending" }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.link_id, r._count._all]));
  }
}

export const appealsService = new AppealsService();
