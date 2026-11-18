import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { attemptsService } from "./attempts.service";
import { examNotify } from "./examNotify";

// Updating a published exam. Exams point at the bank's questions, so an edit
// to a question shows everywhere at once, and every submitted attempt that
// has it is marked again from the current answer key: a higher score is
// announced, a lower one changes quietly. Marks set by a person (essays,
// accepted appeals) stay as they are; an edited essay only alerts the
// teachers who marked it. Running attempts finish on the copy they started
// with and are marked when submitted, like everyone else.

class RegradeService {
  constructor(private db: PrismaClient = prisma) {}

  // Submitted attempts holding the question, in one exam or everywhere.
  async attemptsWith(questionId: number, examId?: number) {
    const probe = JSON.stringify([{ question_id: questionId }]);
    const rows = examId
      ? await this.db.$queryRaw<{ id: number }[]>`SELECT id FROM kalima.ex_attempts WHERE status <> 'in_progress' AND exam_id = ${examId} AND questions @> ${probe}::jsonb ORDER BY id`
      : await this.db.$queryRaw<{ id: number }[]>`SELECT id FROM kalima.ex_attempts WHERE status <> 'in_progress' AND questions @> ${probe}::jsonb ORDER BY id`;
    return rows.map((r) => Number(r.id));
  }

  // Marks the attempts again and tells the students whose result changed
  // for the better.
  async regrade(attemptIds: number[]) {
    let raised = 0;
    for (const id of attemptIds) {
      const change = await attemptsService.grade(id);
      if (!change) continue;
      const { before, after } = change;
      if (before.status === "pending" && after.status === "done") {
        examNotify.resultReady(id, true);
      } else if (before.status === "done" && after.status === "done" && after.score > (before.score ?? 0)) {
        examNotify.scoreRaised(id);
        raised++;
      } else if (before.status === "done" && after.status === "done" && after.score < (before.score ?? 0)) {
        await attemptsService.keepRedoClosed(id, before.score ?? 0);
      }
    }
    return { attempts: attemptIds.length, raised };
  }

  // After a question is saved in the bank. Runs in the background so the
  // save stays quick; failures are logged.
  afterQuestionEdit(questionId: number) {
    setImmediate(async () => {
      try {
        const question = await this.db.qb_questions.findUnique({ where: { id: questionId }, select: { type: true } });
        if (!question || question.type === "passage") return;
        if (question.type === "essay") await examNotify.essayEdited(questionId);
        const ids = await this.attemptsWith(questionId);
        if (ids.length) {
          const result = await this.regrade(ids);
          console.log(`[exams] question ${questionId} edited: re-graded ${result.attempts} attempts, ${result.raised} raised`);
        }
      } catch (err) {
        console.error(`[exams] re-grade after editing question ${questionId} failed`, err);
      }
    });
  }

  // ---------- Cancelling a question in an exam ----------

  private async assertInExam(examId: number, questionId: number) {
    const exam = await this.db.ex_exams.findUnique({ where: { id: examId }, select: { id: true } });
    if (!exam) throw new NotFoundError("Exam not found");
    const inExam = await this.db.ex_exam_questions.findFirst({ where: { exam_id: examId, question_id: questionId }, select: { id: true } });
    if (!inExam && !(await this.attemptsWith(questionId, examId)).length) throw new BadRequestError("Question is not in this exam");
  }

  // Every student who has the question gets its full mark.
  async cancel(examId: number, questionId: number, userId: number) {
    await this.assertInExam(examId, questionId);
    await this.db.ex_cancelled_questions.upsert({
      where: { exam_id_question_id: { exam_id: examId, question_id: questionId } },
      create: { exam_id: examId, question_id: questionId, cancelled_by: userId },
      update: {},
    });
    return this.regrade(await this.attemptsWith(questionId, examId));
  }

  // Back to the marks the answers earned (or were given).
  async restore(examId: number, questionId: number) {
    await this.assertInExam(examId, questionId);
    await this.db.ex_cancelled_questions.deleteMany({ where: { exam_id: examId, question_id: questionId } });
    return this.regrade(await this.attemptsWith(questionId, examId));
  }
}

export const regradeService = new RegradeService();
