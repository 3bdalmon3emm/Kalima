import crypto from "crypto";
import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "../../../libs/errors";
import { examFoldersService } from "./examFolders.service";
import { examsService, groupPassages, pairCount, shuffled } from "./exams.service";
import { questionsService } from "./questions.service";
import { mediaService } from "./media.service";
import { soundsService } from "./sounds.service";
import { teacherLinksService } from "./teacherLinks.service";

// A student's attempts at an exam, reached through a link. An attempt keeps
// its own list of questions and a copy of their content from the moment it
// started, so later edits in the bank never change a running attempt. The
// answers keep exactly what the student chose; grading reads the bank's
// current answer key.

type AttemptQuestion = { section_id: number; question_id: number; mark: number };

// Saves and submits up to this long after the deadline still count (slow
// networks, the last autosave in flight).
const GRACE_MS = 30_000;
const MAX_ESSAY_TEXT = 20_000;
const MAX_FILES_PER_ANSWER = 10;

const num = (d: unknown) => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export type Band = "fail" | "pass" | "good" | "great" | "perfect";

export function bandFor(percent: number, passPercent: number): Band {
  if (percent < passPercent) return "fail";
  if (percent >= 100) return "perfect";
  if (percent >= 80) return "great";
  if (percent >= 70) return "good";
  return "pass";
}

class AttemptsService {
  constructor(private db: PrismaClient = prisma) {}

  // ---------- The link ----------

  private async openLink(code: string) {
    const link = await this.db.ex_links.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: { exam: { include: { folder: { select: { path: true } }, subjects: { select: { id: true, title: true } } } } },
    });
    if (!link) throw new NotFoundError("Exam link not found");
    return link;
  }

  // What the admin or teacher reopened for this student on this link.
  private async overrideFor(linkId: number, studentId: number) {
    return this.db.ex_student_overrides.findUnique({
      where: { link_id_student_user_id: { link_id: linkId, student_user_id: studentId } },
    });
  }

  // The link's end, or the later end given to this student.
  private endFor(link: { ends_at: Date }, override: { ends_at: Date | null } | null) {
    return override?.ends_at && override.ends_at > link.ends_at ? override.ends_at : link.ends_at;
  }

  // Whether the link lets students in right now, and why not. A teacher's
  // link works only while the teacher still has the exam.
  private async linkState(
    link: Awaited<ReturnType<AttemptsService["openLink"]>>,
    now = new Date(),
    override: { ends_at: Date | null } | null = null,
  ) {
    const exam = link.exam;
    if (link.closed_at || exam.archived_at || (await examFoldersService.isHidden(exam.folder.path))) return "closed";
    if (!(await teacherLinksService.linkCovered(link))) return "closed";
    if (!exam.published_at) return "not_published";
    if (now < link.starts_at) return "not_started";
    if (now > this.endFor(link, override)) return "ended";
    return "open";
  }

  // The start page: the exam, the student's attempts and what they can do.
  async linkInfo(code: string, studentId: number) {
    const link = await this.openLink(code);
    await this.finishExpired({ link_id: link.id, student_user_id: studentId });
    const exam = link.exam;
    const override = await this.overrideFor(link.id, studentId);
    const state = await this.linkState(link, new Date(), override);

    const [questions, attempts, teacher, student] = await Promise.all([
      this.db.ex_exam_questions.findMany({ where: { exam_id: exam.id }, select: { mark: true } }),
      this.db.ex_attempts.findMany({
        where: { link_id: link.id, student_user_id: studentId },
        orderBy: { attempt_no: "asc" },
        select: { id: true, attempt_no: true, status: true, started_at: true, submitted_at: true, score: true, total: true },
      }),
      link.teacher_user_id
        ? this.db.users.findUnique({ where: { id: link.teacher_user_id }, select: { id: true, name: true, profile_pic_url: true, cover_url: true } })
        : null,
      this.studentCard(studentId),
    ]);

    const next = this.nextStep(exam, attempts, override?.extra_attempts ?? 0);
    return {
      code: link.code,
      state,
      starts_at: link.starts_at,
      ends_at: this.endFor(link, override),
      teacher,
      student,
      exam: {
        id: exam.id,
        name: exam.name,
        description: exam.description,
        type: exam.type,
        subject: exam.subjects,
        duration_minutes: exam.duration_minutes,
        total: round2(questions.reduce((s, q) => s + num(q.mark), 0)),
        question_count: questions.length,
      },
      attempts: attempts.map((a) => ({ ...a, score: a.score === null ? null : num(a.score), total: num(a.total) })),
      next: state === "open" ? next : { action: "none" as const },
    };
  }

  // What the student may do next: resume, start the first attempt, redo,
  // wait for grading, or nothing.
  // Extra attempts given to one student open a new attempt whatever the
  // score, after the normal redos.
  private nextStep(
    exam: { pass_percent: number; redo_percent: number | null; max_redos: number; redo_required: boolean },
    attempts: { id: number; status: string; score: unknown; total: unknown }[],
    extraAttempts = 0,
  ) {
    if (!attempts.length) return { action: "start" as const };
    const last = attempts[attempts.length - 1];
    if (last.status === "in_progress") return { action: "resume" as const, attempt_id: last.id };
    if (last.status === "pending") return { action: "wait" as const };
    const redos = this.redoState(exam, attempts);
    if (redos.available) return { action: "redo" as const, required: exam.redo_required };
    if (extraAttempts > 0) return { action: "redo" as const, required: false, extra: true };
    return { action: "none" as const };
  }

  // A redo opens while the last score is under the redo mark and redos are
  // left. Graded attempts only.
  redoState(
    exam: { redo_percent: number | null; max_redos: number },
    attempts: { status: string; score: unknown; total: unknown }[],
  ) {
    const last = attempts[attempts.length - 1];
    const used = attempts.length - 1;
    const left = Math.max(exam.max_redos - used, 0);
    if (!last || last.status !== "done" || exam.redo_percent === null || !left) return { available: false, left };
    const percent = num(last.total) ? (num(last.score) / num(last.total)) * 100 : 0;
    return { available: percent < exam.redo_percent, left };
  }

  private async studentCard(userId: number) {
    const user = await this.db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, profile_pic_url: true, students: { select: { sequenced_id: true } } },
    });
    return user && { id: user.id, name: user.name, profile_pic_url: user.profile_pic_url, serial: user.students?.sequenced_id ?? null };
  }

  // ---------- Starting ----------

  async start(code: string, studentId: number) {
    const link = await this.openLink(code);
    await this.finishExpired({ link_id: link.id, student_user_id: studentId });
    const override = await this.overrideFor(link.id, studentId);
    if ((await this.linkState(link, new Date(), override)) !== "open") throw new BadRequestError("This exam is not open now");
    const exam = link.exam;

    const attempts = await this.db.ex_attempts.findMany({
      where: { link_id: link.id, student_user_id: studentId },
      orderBy: { attempt_no: "asc" },
    });
    const next = this.nextStep(exam, attempts, override?.extra_attempts ?? 0);
    if (next.action === "resume") return this.resume(next.attempt_id, studentId);
    if (next.action !== "start" && next.action !== "redo") throw new BadRequestError("You cannot start this exam again");

    const isRedo = attempts.length > 0;
    const picked = await this.pickQuestions(exam, isRedo, attempts[attempts.length - 1]);
    if (!picked.length) throw new BadRequestError("This exam has no questions");
    const content = await this.snapshot(exam.id, picked);
    const now = new Date();
    // The student's own end date and extra minutes count; extra minutes and
    // an extra attempt are used up by this attempt.
    const linkEnd = this.endFor(link, override);
    const extraMinutes = override?.extra_minutes ?? 0;
    const byDuration = exam.duration_minutes ? new Date(now.getTime() + (exam.duration_minutes + extraMinutes) * 60_000) : linkEnd;
    const deadline = byDuration < linkEnd ? byDuration : linkEnd;
    if (override && (extraMinutes || ("extra" in next && next.extra))) {
      await this.db.ex_student_overrides.update({
        where: { id: override.id },
        data: {
          extra_minutes: 0,
          ...("extra" in next && next.extra && { extra_attempts: { decrement: 1 } }),
        },
      });
    }
    const token = crypto.randomBytes(24).toString("hex");

    const attempt = await this.db.ex_attempts.create({
      data: {
        exam_id: exam.id,
        link_id: link.id,
        student_user_id: studentId,
        attempt_no: attempts.length + 1,
        started_at: now,
        deadline_at: deadline,
        questions: picked,
        content: content as any,
        total: round2(picked.reduce((s, q) => s + q.mark, 0)),
        session_token: token,
      },
    });
    return this.payload(attempt.id, token);
  }

  // The questions of a new attempt, in the order this student sees them.
  private async pickQuestions(
    exam: { id: number; mode: string; shuffle: boolean; redo_new_questions: boolean },
    isRedo: boolean,
    previous?: { questions: unknown },
  ): Promise<AttemptQuestion[]> {
    let list: (AttemptQuestion & { passage_id: number | null })[];
    if (isRedo && exam.mode === "random" && exam.redo_new_questions) {
      const { picks } = await examsService.drawQuestions(exam.id);
      list = picks.map(({ section_id, question_id, mark, passage_id }) => ({ section_id, question_id, mark, passage_id }));
    } else {
      const rows = await this.db.ex_exam_questions.findMany({
        where: { exam_id: exam.id },
        orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        include: { question: { select: { passage_id: true, archived_at: true } } },
      });
      list = rows.map((r) => ({ section_id: r.section_id, question_id: r.question_id, mark: num(r.mark), passage_id: r.question.passage_id }));
    }

    const sections = await this.db.ex_sections.findMany({
      where: { exam_id: exam.id },
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const out: AttemptQuestion[] = [];
    for (const s of sections) {
      const inSection = groupPassages(list.filter((q) => q.section_id === s.id), (q) => q.passage_id);
      const blocks: (typeof inSection)[] = [];
      for (const q of inSection) {
        const prev = blocks[blocks.length - 1];
        if (prev && q.passage_id !== null && prev[0].passage_id === q.passage_id) prev.push(q);
        else blocks.push([q]);
      }
      const ordered = exam.shuffle ? shuffled(blocks) : blocks;
      out.push(...ordered.flat().map(({ section_id, question_id, mark }) => ({ section_id, question_id, mark })));
    }
    return out;
  }

  // What the student sees, frozen at the start: no answer keys. Media are
  // kept as ids and turned into links on every load.
  private async snapshot(examId: number, picked: AttemptQuestion[]) {
    const rows = await questionsService.loadFull({ id: { in: picked.map((p) => p.question_id) } });
    const passageIds = [...new Set(rows.map((q) => q.passage_id).filter((p): p is number => p !== null))];
    const passages = passageIds.length ? await questionsService.loadFull({ id: { in: passageIds } }) : [];
    const sections = await this.db.ex_sections.findMany({
      where: { exam_id: examId },
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    });
    const byId = new Map(rows.map((q) => [q.id, q]));

    const questions: Record<number, any> = {};
    for (const p of picked) {
      const q = byId.get(p.question_id);
      if (!q) continue;
      const correctCount = q.options.filter((o) => o.is_correct).length;
      questions[q.id] = {
        id: q.id,
        serial: q.serial,
        type: q.type,
        passage_id: q.passage_id,
        font: q.font,
        mark: p.mark,
        stem_text: q.stem_text,
        stem_image_id: q.stem_image_id,
        stem_audio_id: q.stem_audio_id,
        multiple: q.type === "mcq_multi" || correctCount > 1,
        options: q.options.map((o) => ({ id: o.id, text: o.text, image_id: o.image_id, label: o.label })),
        matching: {
          left: q.matching_items.filter((m) => m.side === "left").map((m) => ({ id: m.id, text: m.text, image_id: m.image_id, audio_id: m.audio_id })),
          right: q.matching_items.filter((m) => m.side === "right").map((m) => ({ id: m.id, text: m.text, image_id: m.image_id, audio_id: m.audio_id })),
        },
      };
    }
    return {
      sections: sections
        .map((s) => ({ id: s.id, name: s.name, question_ids: picked.filter((p) => p.section_id === s.id).map((p) => p.question_id) }))
        .filter((s) => s.question_ids.length),
      questions,
      passages: Object.fromEntries(passages.map((p) => [p.id, {
        id: p.id, serial: p.serial, font: p.font, stem_text: p.stem_text, stem_image_id: p.stem_image_id, stem_audio_id: p.stem_audio_id,
      }])),
    };
  }

  // ---------- Running ----------

  private async ownAttempt(id: number, studentId: number) {
    const attempt = await this.db.ex_attempts.findUnique({ where: { id } });
    if (!attempt || attempt.student_user_id !== studentId) throw new NotFoundError("Attempt not found");
    return attempt;
  }

  // Opening the attempt again (reload, another tab or device) hands out a new
  // token, so only the latest place can keep saving.
  async resume(id: number, studentId: number, token?: string) {
    const attempt = await this.ownAttempt(id, studentId);
    if (attempt.status !== "in_progress") return this.payload(id, null);
    if (Date.now() > attempt.deadline_at.getTime() + GRACE_MS) {
      await this.submit(id, studentId, null, true);
      return this.payload(id, null);
    }
    const keep = token && token === attempt.session_token;
    const next = keep ? token : crypto.randomBytes(24).toString("hex");
    if (!keep) await this.db.ex_attempts.update({ where: { id }, data: { session_token: next } });
    return this.payload(id, next);
  }

  private async payload(id: number, token: string | null) {
    const attempt = await this.db.ex_attempts.findUniqueOrThrow({
      where: { id },
      include: {
        answers: { select: { question_id: true, answer: true, flagged: true } },
        link: { select: { code: true, teacher_user_id: true } },
        exam: { select: { id: true, name: true, type: true, duration_minutes: true } },
      },
    });
    const content = attempt.content as any;
    const ids: number[] = [];
    for (const q of Object.values<any>(content.questions)) {
      ids.push(q.stem_image_id, q.stem_audio_id, ...q.options.map((o: any) => o.image_id));
      for (const m of [...q.matching.left, ...q.matching.right]) ids.push(m.image_id, m.audio_id);
    }
    for (const p of Object.values<any>(content.passages)) ids.push(p.stem_image_id, p.stem_audio_id);
    const media = await mediaService.resolve(ids);
    const m = (mid: number | null) => (mid ? media.get(mid) ?? null : null);

    const files = await this.db.ex_answer_files.findMany({ where: { attempt_id: id } });
    const fileUrls = new Map(await Promise.all(files.map(async (f) => [f.id, await mediaService.url(f.storage_key)] as const)));
    const teacher = attempt.link.teacher_user_id
      ? await this.db.users.findUnique({ where: { id: attempt.link.teacher_user_id }, select: { name: true } })
      : null;

    return {
      id: attempt.id,
      code: attempt.link.code,
      exam: attempt.exam,
      teacher_name: teacher?.name ?? null,
      student: await this.studentCard(attempt.student_user_id),
      attempt_no: attempt.attempt_no,
      status: attempt.status,
      started_at: attempt.started_at,
      deadline_at: attempt.deadline_at,
      server_time: new Date(),
      total: num(attempt.total),
      session_token: token,
      sections: content.sections,
      questions: Object.values<any>(content.questions).map((q) => ({
        ...q,
        stem_image: m(q.stem_image_id),
        stem_audio: m(q.stem_audio_id),
        options: q.options.map((o: any) => ({ ...o, image: m(o.image_id) })),
        matching: {
          left: q.matching.left.map((i: any) => ({ ...i, image: m(i.image_id), audio: m(i.audio_id) })),
          right: q.matching.right.map((i: any) => ({ ...i, image: m(i.image_id), audio: m(i.audio_id) })),
        },
      })),
      passages: Object.values<any>(content.passages).map((p) => ({ ...p, stem_image: m(p.stem_image_id), stem_audio: m(p.stem_audio_id) })),
      answers: attempt.answers,
      files: files.map((f) => ({ id: f.id, url: fileUrls.get(f.id) })),
    };
  }

  private async runningAttempt(id: number, studentId: number, token: string | null) {
    const attempt = await this.ownAttempt(id, studentId);
    if (attempt.status !== "in_progress") throw new BadRequestError("This attempt was already submitted");
    if (!token || token !== attempt.session_token) {
      throw new ConflictError("This exam is open in another tab or device");
    }
    if (Date.now() > attempt.deadline_at.getTime() + GRACE_MS) {
      await this.submit(id, studentId, null, true);
      throw new BadRequestError("Time is up; your answers were submitted");
    }
    return attempt;
  }

  // Autosave: the answers changed since the last save, in one request.
  async saveAnswers(id: number, studentId: number, token: string | null, raw: unknown) {
    const attempt = await this.runningAttempt(id, studentId, token);
    const answers = await this.checkAnswers(attempt, raw);
    await this.db.$transaction(answers.map((a) => this.db.ex_attempt_answers.upsert({
      where: { attempt_id_question_id: { attempt_id: id, question_id: a.question_id } },
      create: { attempt_id: id, question_id: a.question_id, answer: a.answer, flagged: a.flagged },
      update: { answer: a.answer, flagged: a.flagged },
    })));
    return { saved: answers.length };
  }

  // Keeps only what fits the question: options of that question, pairs of
  // its items, essay text and this attempt's photos.
  private async checkAnswers(attempt: { id: number; content: unknown }, raw: unknown) {
    if (!Array.isArray(raw)) throw new BadRequestError("answers must be a list");
    const content = attempt.content as any;
    const fileIds = new Set(
      (await this.db.ex_answer_files.findMany({ where: { attempt_id: attempt.id }, select: { id: true } })).map((f) => f.id),
    );
    return raw.map((item: any) => {
      const q = content.questions[Number(item?.question_id)];
      if (!q) throw new BadRequestError("Question is not in this attempt");
      const given = item.answer ?? {};
      let answer: Record<string, unknown> = {};
      if (["mcq_single", "mcq_multi", "true_false"].includes(q.type)) {
        const allowed = new Set(q.options.map((o: any) => o.id));
        const ids = [...new Set((Array.isArray(given.option_ids) ? given.option_ids : []).map(Number))].filter((oid) => allowed.has(oid));
        answer = { option_ids: q.type === "mcq_multi" || q.multiple ? ids : ids.slice(0, 1) };
      } else if (q.type === "matching") {
        const left = new Set(q.matching.left.map((i: any) => i.id));
        const right = new Set(q.matching.right.map((i: any) => i.id));
        const pairs = (Array.isArray(given.pairs) ? given.pairs : [])
          .map((p: any) => [Number(p?.[0]), Number(p?.[1])])
          .filter(([l, r]: number[]) => left.has(l) && right.has(r));
        const seen = new Set<number>();
        answer = { pairs: pairs.filter(([l]: number[]) => (seen.has(l) ? false : (seen.add(l), true))) };
      } else if (q.type === "essay") {
        const text = typeof given.text === "string" ? given.text.slice(0, MAX_ESSAY_TEXT) : "";
        const files = [...new Set<number>((Array.isArray(given.file_ids) ? given.file_ids : []).map(Number))]
          .filter((fid) => fileIds.has(fid))
          .slice(0, MAX_FILES_PER_ANSWER);
        answer = { text, file_ids: files };
      }
      return { question_id: q.id as number, answer: answer as any, flagged: item.flagged === true };
    });
  }

  // Leaving full screen or the page, and copy/paste attempts, counted quietly
  // for the teacher.
  async recordEvent(id: number, studentId: number, token: string | null, type: unknown) {
    await this.runningAttempt(id, studentId, token);
    if (type === "fullscreen_exit") {
      await this.db.ex_attempts.update({ where: { id }, data: { fullscreen_exits: { increment: 1 } } });
    } else if (type === "tab_leave") {
      await this.db.ex_attempts.update({ where: { id }, data: { tab_leaves: { increment: 1 } } });
    } else if (type === "copy_paste") {
      await this.db.ex_attempts.update({ where: { id }, data: { copy_attempts: { increment: 1 } } });
    } else {
      throw new BadRequestError("Unknown event");
    }
  }

  // ---------- Submitting and grading ----------

  async submit(id: number, studentId: number, token: string | null, auto = false, lastAnswers?: unknown) {
    const attempt = auto ? await this.ownAttempt(id, studentId) : await this.runningAttempt(id, studentId, token);
    if (attempt.status !== "in_progress") return this.result(id, studentId);
    if (lastAnswers !== undefined) await this.saveAnswers(id, studentId, token, lastAnswers);

    const claimed = await this.db.ex_attempts.updateMany({
      where: { id, status: "in_progress" },
      data: { status: "pending", submitted_at: new Date(), auto_submitted: auto, session_token: null },
    });
    if (!claimed.count) return this.result(id, studentId);
    await this.grade(id);
    return this.result(id, studentId);
  }

  // Marks every question from the bank's current answer key. Essays with an
  // answer wait for a grader; an empty essay gets zero.
  async grade(id: number) {
    const attempt = await this.db.ex_attempts.findUniqueOrThrow({ where: { id }, include: { answers: true } });
    const list = attempt.questions as unknown as AttemptQuestion[];
    const keys = await this.db.qb_questions.findMany({
      where: { id: { in: list.map((q) => q.question_id) } },
      include: { options: { where: { removed_at: null } }, matching_items: { where: { removed_at: null } } },
    });
    const keyById = new Map(keys.map((k) => [k.id, k]));
    const answerById = new Map(attempt.answers.map((a) => [a.question_id, a]));

    const writes = [];
    let waiting = false;
    let score = 0;
    for (const item of list) {
      const key = keyById.get(item.question_id);
      const saved = answerById.get(item.question_id);
      const answer = (saved?.answer ?? {}) as any;
      if (saved?.graded_by) {
        score += num(saved.mark);
        continue; // marked by a person; the automatic grade leaves it alone
      }
      let mark: number | null = 0;
      if (key && key.type === "essay") {
        const answered = (answer.text ?? "").trim() || (answer.file_ids ?? []).length;
        mark = answered ? null : 0;
      } else if (key) {
        mark = round2(item.mark * this.fraction(key, answer));
      }
      if (mark === null) waiting = true;
      else score += mark;
      writes.push(this.db.ex_attempt_answers.upsert({
        where: { attempt_id_question_id: { attempt_id: id, question_id: item.question_id } },
        create: { attempt_id: id, question_id: item.question_id, answer: {}, mark, graded_at: mark === null ? null : new Date() },
        update: { mark, graded_at: mark === null ? null : new Date() },
      }));
    }
    await this.db.$transaction([
      ...writes,
      this.db.ex_attempts.update({ where: { id }, data: { score: round2(score), status: waiting ? "pending" : "done" } }),
    ]);
  }

  // Share of the mark earned: all or nothing for choice questions (multiple
  // answers must match exactly), one share per right pair for matching.
  private fraction(
    key: { type: string; options: { id: number; is_correct: boolean }[]; matching_items: { id: number; side: string; match_item_id: number | null }[] },
    answer: any,
  ) {
    if (["mcq_single", "mcq_multi", "true_false"].includes(key.type)) {
      const chosen = new Set<number>((answer.option_ids ?? []).map(Number));
      const correct = new Set(key.options.filter((o) => o.is_correct).map((o) => o.id));
      if (!chosen.size || !correct.size) return 0;
      if (key.type === "mcq_multi") {
        return chosen.size === correct.size && [...chosen].every((c) => correct.has(c)) ? 1 : 0;
      }
      return chosen.size === 1 && correct.has([...chosen][0]) ? 1 : 0;
    }
    if (key.type === "matching") {
      const pairs = pairCount(key.matching_items);
      if (!pairs) return 0;
      const rightOf = new Map(key.matching_items.filter((m) => m.side === "left").map((m) => [m.id, m.match_item_id]));
      const right = (answer.pairs ?? []).filter(([l, r]: number[]) => rightOf.get(l) === r && r !== null).length;
      return right / pairs;
    }
    return 0;
  }

  // Attempts whose time ran out while nobody was there to submit them.
  async finishExpired(where: { link_id?: number; student_user_id?: number } = {}) {
    const due = await this.db.ex_attempts.findMany({
      where: { ...where, status: "in_progress", deadline_at: { lt: new Date(Date.now() - GRACE_MS) } },
      select: { id: true, student_user_id: true },
      take: 200,
    });
    for (const a of due) await this.submit(a.id, a.student_user_id, null, true);
    return due.length;
  }

  startSweeper() {
    const timer = setInterval(() => {
      this.finishExpired().catch((err) => console.error("[exams] auto-submit failed", err));
    }, 60_000);
    timer.unref?.();
  }

  // ---------- Results ----------

  async result(id: number, studentId: number) {
    const attempt = await this.ownAttempt(id, studentId);
    const exam = await this.db.ex_exams.findUniqueOrThrow({ where: { id: attempt.exam_id } });
    const attempts = await this.db.ex_attempts.findMany({
      where: { link_id: attempt.link_id, student_user_id: studentId },
      orderBy: { attempt_no: "asc" },
      select: { id: true, attempt_no: true, status: true, score: true, total: true },
    });
    const link = await this.db.ex_links.findUniqueOrThrow({ where: { id: attempt.link_id }, select: { code: true, ends_at: true, closed_at: true } });
    const base = {
      id: attempt.id,
      code: link.code,
      exam: { id: exam.id, name: exam.name, type: exam.type },
      attempt_no: attempt.attempt_no,
      status: attempt.status,
      submitted_at: attempt.submitted_at,
      auto_submitted: attempt.auto_submitted,
      total: num(attempt.total),
    };
    if (attempt.status !== "done") return { ...base, score: null };

    const score = num(attempt.score);
    const percent = base.total ? round2((score / base.total) * 100) : 0;
    const band = bandFor(percent, exam.pass_percent);
    const latest = attempts[attempts.length - 1]?.id === attempt.id;
    const redo = this.redoState(exam, attempts);
    const best = Math.max(...attempts.filter((a) => a.status === "done").map((a) => num(a.score)));
    const shown = this.answersShown(exam, attempts, link);
    return {
      ...base,
      score,
      percent,
      passed: percent >= exam.pass_percent,
      band,
      best_score: best,
      redo: latest ? { available: redo.available, required: redo.available && exam.redo_required, left: redo.left } : null,
      sound: band === "fail" ? null : await soundsService.randomFor(band),
      answers_shown: shown,
      ...(await this.review(attempt, shown)),
    };
  }

  // Whether the right answers show yet. "after_last": once the student has
  // nothing left to take (no redo, nothing running) or the link has ended.
  private answersShown(
    exam: { show_answers: string; pass_percent: number; redo_percent: number | null; max_redos: number; redo_required: boolean },
    attempts: { id: number; status: string; score: unknown; total: unknown }[],
    link: { ends_at: Date; closed_at: Date | null },
  ) {
    const ended = !!link.closed_at || Date.now() > link.ends_at.getTime();
    switch (exam.show_answers) {
      case "immediately": return true;
      case "never": return false;
      case "after_end": return ended;
      default: return ended || this.nextStep(exam, attempts).action === "none";
    }
  }

  // Each question with the student's answer, the right answer, the marks and
  // the explanation, for after the result shows.
  async review(attempt: { id: number; questions: unknown }, shown: boolean) {
    const list = attempt.questions as unknown as AttemptQuestion[];
    const [rows, answers, files] = await Promise.all([
      questionsService.loadFull({ id: { in: list.map((q) => q.question_id) } }),
      this.db.ex_attempt_answers.findMany({ where: { attempt_id: attempt.id } }),
      this.db.ex_answer_files.findMany({ where: { attempt_id: attempt.id } }),
    ]);
    const shaped = await questionsService.presentFlat(rows);
    const byId = new Map(shaped.map((q) => [q.id, q]));
    const answerById = new Map(answers.map((a) => [a.question_id, a]));
    const fileUrls = new Map(await Promise.all(files.map(async (f) => [f.id, await mediaService.url(f.storage_key)] as const)));
    const passageIds = [...new Set(rows.map((q) => q.passage_id).filter((p): p is number => p !== null))];
    const passages = passageIds.length ? await questionsService.presentFlat(await questionsService.loadFull({ id: { in: passageIds } })) : [];
    // Hidden answers leave the server without any key: no right options or
    // pairs, explanations or model answers.
    const key = <T>(value: T) => (shown ? value : null);
    const review = list.map((item) => {
      const q = byId.get(item.question_id);
      const a = answerById.get(item.question_id);
      const answer = (a?.answer ?? {}) as any;
      return {
        question_id: item.question_id,
        section_id: item.section_id,
        mark: item.mark,
        earned: a?.mark === null || a?.mark === undefined ? null : num(a.mark),
        graded_by: a?.graded_by ?? null,
        answer: answer.file_ids ? { ...answer, files: answer.file_ids.map((fid: number) => ({ id: fid, url: fileUrls.get(fid) })) } : answer,
        question: q && {
          id: q.id, serial: q.serial, type: q.type, passage_id: q.passage_id, font: q.font,
          stem_text: q.stem_text, stem_image: q.stem_image, stem_audio: q.stem_audio,
          explanation_mode: key(q.explanation_mode), explanation_text: key(q.explanation_text), explanation_image: key(q.explanation_image),
          model_answer_text: key(q.model_answer_text), model_answer_image: key(q.model_answer_image),
          options: q.options.map((o) => ({ id: o.id, text: o.text, image: o.image, label: o.label, is_correct: key(o.is_correct), explanation_text: key(o.explanation_text) })),
          matching_items: q.matching_items.map((mi) => ({ id: mi.id, side: mi.side, text: mi.text, image: mi.image, audio: mi.audio, match_item_id: key(mi.match_item_id) })),
        },
      };
    });
    return {
      review,
      passages: passages.map((p) => ({ id: p.id, font: p.font, stem_text: p.stem_text, stem_image: p.stem_image, stem_audio: p.stem_audio })),
    };
  }

  // ---------- Essay photos ----------

  async addFile(id: number, studentId: number, token: string | null, file: Express.Multer.File | undefined) {
    await this.runningAttempt(id, studentId, token);
    if (!file) throw new BadRequestError("File is required");
    return mediaService.storeAnswerPhoto(id, file);
  }
}

export const attemptsService = new AttemptsService();
