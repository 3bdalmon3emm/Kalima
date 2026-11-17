import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";

// An attempt's score, always read fresh from its answers so a grade saved at
// the same moment (an essay mark, an accepted appeal) is never lost. A
// question cancelled in the exam counts its full mark and never keeps the
// result waiting; the answer's own mark is kept, so cancelling can be undone.

type AttemptQuestion = { section_id: number; question_id: number; mark: number };

const num = (d: unknown) => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function cancelledIn(examId: number, db: PrismaClient = prisma) {
  const rows = await db.ex_cancelled_questions.findMany({ where: { exam_id: examId }, select: { question_id: true } });
  return new Set(rows.map((r) => r.question_id));
}

// Sets the score and status (done once nothing waits for a mark) and
// returns the attempt as it was before and after.
export async function rescore(attemptId: number, db: PrismaClient = prisma) {
  const attempt = await db.ex_attempts.findUniqueOrThrow({ where: { id: attemptId }, select: { exam_id: true, questions: true, status: true, score: true } });
  const list = attempt.questions as unknown as AttemptQuestion[];
  const [answers, cancelled] = await Promise.all([
    db.ex_attempt_answers.findMany({ where: { attempt_id: attemptId }, select: { question_id: true, mark: true } }),
    cancelledIn(attempt.exam_id, db),
  ]);
  const markById = new Map(answers.map((a) => [a.question_id, a.mark]));
  let waiting = false;
  let score = 0;
  for (const q of list) {
    if (cancelled.has(q.question_id)) { score += q.mark; continue; }
    const mark = markById.get(q.question_id);
    if (mark === null || mark === undefined) waiting = true;
    else score += num(mark);
  }
  const status = waiting ? "pending" : "done";
  // A running attempt is never touched here.
  await db.ex_attempts.updateMany({ where: { id: attemptId, status: { not: "in_progress" } }, data: { score: round2(score), status } });
  return {
    before: { status: attempt.status, score: attempt.score === null ? null : num(attempt.score) },
    after: { status, score: round2(score) },
  };
}
