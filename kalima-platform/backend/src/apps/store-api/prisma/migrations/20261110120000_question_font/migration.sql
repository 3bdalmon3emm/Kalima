-- Font of a question, chosen by the teacher and applied to the whole question
-- (text, options, matching items, explanation). Children of a passage always
-- carry the passage's font. The text size is the student's choice in the exam. Additive and idempotent.

ALTER TABLE "qb_questions" ADD COLUMN IF NOT EXISTS "font" VARCHAR(20) NOT NULL DEFAULT 'default';
