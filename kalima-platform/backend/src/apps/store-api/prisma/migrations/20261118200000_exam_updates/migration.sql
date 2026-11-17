-- Updating a published exam: questions cancelled in an exam (every student
-- gets their marks), finding the attempts that hold a question, and the
-- notifications of results and re-grades. Additive and idempotent.

CREATE TABLE IF NOT EXISTS "ex_cancelled_questions" (
    "exam_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "cancelled_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ex_cancelled_questions_pkey" PRIMARY KEY ("exam_id", "question_id")
);
DO $$
BEGIN
  ALTER TABLE "ex_cancelled_questions" ADD CONSTRAINT "ex_cancelled_questions_exam_fkey" FOREIGN KEY ("exam_id") REFERENCES "ex_exams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Attempts holding a question: questions @> '[{"question_id": 5}]'.
CREATE INDEX IF NOT EXISTS "ix_ex_attempts_questions" ON "ex_attempts" USING GIN ("questions" jsonb_path_ops);

ALTER TYPE "notification_key_enum" ADD VALUE IF NOT EXISTS 'EXAM_RESULT_READY';
ALTER TYPE "notification_key_enum" ADD VALUE IF NOT EXISTS 'EXAM_SCORE_RAISED';
ALTER TYPE "notification_key_enum" ADD VALUE IF NOT EXISTS 'EXAM_ESSAY_TO_GRADE';
ALTER TYPE "notification_key_enum" ADD VALUE IF NOT EXISTS 'EXAM_ESSAY_EDITED';
