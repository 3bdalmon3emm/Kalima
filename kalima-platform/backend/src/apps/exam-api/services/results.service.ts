import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { attemptsService, bandFor } from "./attempts.service";
import { rescore } from "./scoring";
import { examNotify } from "./examNotify";

// The results side of an exam: every attempt with its score and how often
// the student left the page, full screen or tried to copy, and grading the
// essays by hand. Reading never touches an attempt's session token, so
// opening a running attempt here does not interrupt the student.

type AttemptQuestion = { section_id: number; question_id: number; mark: number };

const num = (d: unknown) => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export type Grade = { question_id: number; mark: number };

class ResultsService {
  constructor(private db: PrismaClient = prisma) {}

  private async students(ids: number[]) {
    const users = await this.db.users.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true, phone: true, profile_pic_url: true, students: { select: { sequenced_id: true, levels: { select: { title: true, title_ar: true } } } } },
    });
    return new Map(users.map((u) => [u.id, {
      id: u.id, name: u.name, phone: u.phone, profile_pic_url: u.profile_pic_url,
      serial: u.students?.sequenced_id ?? null, level: u.students?.levels?.title_ar || u.students?.levels?.title || null,
    }]));
  }

  private row(a: {
    id: number; student_user_id: number; attempt_no: number; status: string; started_at: Date; submitted_at: Date | null;
    auto_submitted: boolean; score: unknown; total: unknown; tab_leaves: number; fullscreen_exits: number; copy_attempts: number;
  }, passPercent: number) {
    const total = num(a.total);
    const score = a.status === "done" ? num(a.score) : null;
    const percent = score !== null && total ? round2((score / total) * 100) : null;
    return {
      id: a.id,
      attempt_no: a.attempt_no,
      status: a.status,
      started_at: a.started_at,
      submitted_at: a.submitted_at,
      auto_submitted: a.auto_submitted,
      score,
      total,
      percent,
      band: percent === null ? null : bandFor(percent, passPercent),
      tab_leaves: a.tab_leaves,
      fullscreen_exits: a.fullscreen_exits,
      copy_attempts: a.copy_attempts,
    };
  }

  // Every attempt at an exam, newest first; `pending` keeps only those
  // waiting for essay marks.
  // `teacherIds` limits to those teachers' links.
  linkWhere(teacherIds?: number[]) {
    if (!teacherIds) return {};
    return { link: { teacher_user_id: { in: teacherIds.filter((t) => t > 0) } } };
  }

  async list(examId: number, filter: { status?: string; teacherIds?: number[] } = {}) {
    const exam = await this.db.ex_exams.findUnique({ where: { id: examId }, select: { id: true, pass_percent: true } });
    if (!exam) throw new NotFoundError("Exam not found");
    const status = ["in_progress", "pending", "done"].includes(filter.status ?? "") ? (filter.status as any) : undefined;
    const attempts = await this.db.ex_attempts.findMany({
      where: { exam_id: examId, ...(status && { status }), ...this.linkWhere(filter.teacherIds) },
      orderBy: [{ started_at: "desc" }, { id: "desc" }],
      include: { link: { select: { code: true, teacher_user_id: true } } },
      take: 1000,
    });
    const people = await this.students([
      ...attempts.map((a) => a.student_user_id),
      ...attempts.map((a) => a.link.teacher_user_id).filter((id): id is number => id !== null),
    ]);
    const counts = await this.db.ex_attempts.groupBy({ by: ["status"], where: { exam_id: examId, ...this.linkWhere(filter.teacherIds) }, _count: { _all: true } });
    return {
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      attempts: attempts.map((a) => ({
        ...this.row(a, exam.pass_percent),
        student: people.get(a.student_user_id) ?? null,
        link: { code: a.link.code, teacher: a.link.teacher_user_id ? people.get(a.link.teacher_user_id)?.name ?? null : null },
      })),
    };
  }

  // One attempt for the grader: every answer with the answer key shown.
  async detail(id: number) {
    const attempt = await this.db.ex_attempts.findUnique({
      where: { id },
      include: { exam: { select: { id: true, name: true, pass_percent: true } }, link: { select: { code: true, teacher_user_id: true } } },
    });
    if (!attempt) throw new NotFoundError("Attempt not found");
    const people = await this.students([attempt.student_user_id, ...(attempt.link.teacher_user_id ? [attempt.link.teacher_user_id] : [])]);
    return {
      ...this.row(attempt, attempt.exam.pass_percent),
      exam: { id: attempt.exam.id, name: attempt.exam.name },
      student: people.get(attempt.student_user_id) ?? null,
      link: { code: attempt.link.code, teacher: attempt.link.teacher_user_id ? people.get(attempt.link.teacher_user_id)?.name ?? null : null },
      ...(await attemptsService.review(attempt, true)),
    };
  }

  // Marks for essay answers, in halves from 0 to the question's mark. Only
  // the given essays change; the other questions keep the marks they got at
  // submission. The attempt is done once no answer is waiting for a mark.
  async grade(id: number, grades: Grade[], graderId: number) {
    const attempt = await this.db.ex_attempts.findUnique({ where: { id }, include: { answers: true } });
    if (!attempt) throw new NotFoundError("Attempt not found");
    if (attempt.status === "in_progress") throw new BadRequestError("This attempt is still running");

    const list = attempt.questions as unknown as AttemptQuestion[];
    const markOf = new Map(list.map((q) => [q.question_id, q.mark]));
    const types = new Map(
      (await this.db.qb_questions.findMany({ where: { id: { in: list.map((q) => q.question_id) } }, select: { id: true, type: true } }))
        .map((q) => [q.id, q.type]),
    );
    for (const g of grades) {
      const max = markOf.get(g.question_id);
      if (max === undefined) throw new BadRequestError("Question is not in this attempt");
      if (types.get(g.question_id) !== "essay") throw new BadRequestError("Only essay questions are graded by hand");
      if (g.mark < 0 || g.mark > max) throw new BadRequestError("Mark is out of range");
    }

    const now = new Date();
    await this.db.$transaction(grades.map((g) => this.db.ex_attempt_answers.upsert({
      where: { attempt_id_question_id: { attempt_id: id, question_id: g.question_id } },
      create: { attempt_id: id, question_id: g.question_id, answer: {}, mark: g.mark, graded_by: graderId, graded_at: now },
      update: { mark: g.mark, graded_by: graderId, graded_at: now },
    })));

    const { before, after } = await rescore(id, this.db);
    if (before.status === "pending" && after.status === "done") examNotify.resultReady(id, true);
    else if (before.status === "done" && after.status === "done" && after.score !== before.score) {
      // The student hears when a finished result changes.
      if (after.score > (before.score ?? 0)) examNotify.scoreRaised(id);
      else {
        await attemptsService.keepRedoClosed(id, before.score ?? 0);
        examNotify.scoreChanged(id);
      }
    }
    return this.detail(id);
  }
}

// ---------- Reopening for one student ----------

export type Reopen = { extraAttempts?: number; extraMinutes?: number; endsAt?: Date | null };

export async function reopenForStudent(linkId: number, studentId: number, change: Reopen, userId: number, db: PrismaClient = prisma) {
  const link = await db.ex_links.findUnique({ where: { id: linkId } });
  if (!link) throw new NotFoundError("Link not found");
  const current = await db.ex_student_overrides.findUnique({
    where: { link_id_student_user_id: { link_id: linkId, student_user_id: studentId } },
  });
  let extraMinutes = Math.max(change.extraMinutes ?? 0, 0);
  // Extra minutes go to the running attempt if there is one; otherwise to
  // the next attempt.
  if (extraMinutes) {
    const running = await db.ex_attempts.findFirst({ where: { link_id: linkId, student_user_id: studentId, status: "in_progress" } });
    if (running) {
      await db.ex_attempts.update({
        where: { id: running.id },
        data: { deadline_at: new Date(running.deadline_at.getTime() + extraMinutes * 60_000) },
      });
      extraMinutes = 0;
    }
  }
  const data = {
    extra_attempts: (current?.extra_attempts ?? 0) + Math.max(change.extraAttempts ?? 0, 0),
    extra_minutes: (current?.extra_minutes ?? 0) + extraMinutes,
    ends_at: change.endsAt === undefined ? current?.ends_at ?? null : change.endsAt,
    updated_by: userId,
  };
  return db.ex_student_overrides.upsert({
    where: { link_id_student_user_id: { link_id: linkId, student_user_id: studentId } },
    create: { link_id: linkId, student_user_id: studentId, ...data },
    update: data,
  });
}

export const resultsService = new ResultsService();
