-- Exams, second round. When a student sees the right answers after an attempt: after the last
-- attempt (no redo left, or the link ended), right away, after the link ends,
-- or never. Additive and idempotent.

ALTER TABLE "ex_exams" ADD COLUMN IF NOT EXISTS "show_answers" VARCHAR(20) NOT NULL DEFAULT 'after_last';

-- Copy, cut and paste attempts during an exam, counted quietly like leaving
-- the page.
ALTER TABLE "ex_attempts" ADD COLUMN IF NOT EXISTS "copy_attempts" INTEGER NOT NULL DEFAULT 0;
