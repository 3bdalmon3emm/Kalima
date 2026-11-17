-- Exam appeals: a student asks the teacher to look again at a question they
-- lost marks on. One request and one answer, not a chat. Additive and
-- idempotent.

CREATE TABLE IF NOT EXISTS "ex_appeals" (
    "id" SERIAL NOT NULL,
    "attempt_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "link_id" INTEGER NOT NULL,
    "student_user_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    -- Photos the student added, as storage keys.
    "image_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    -- pending, accepted or rejected.
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- The mark when the student appealed, and the one the teacher gave.
    "old_mark" DECIMAL(7,2) NOT NULL,
    "new_mark" DECIMAL(7,2),
    -- The teacher's note: required when rejecting.
    "reply" TEXT,
    "decided_by" INTEGER,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ex_appeals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ex_appeals_status_check" CHECK ("status" IN ('pending', 'accepted', 'rejected'))
);
-- One waiting appeal per question of an attempt; a new one after an answer.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_ex_appeals_pending" ON "ex_appeals" ("attempt_id", "question_id") WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "ix_ex_appeals_link_status" ON "ex_appeals" ("link_id", "status");
CREATE INDEX IF NOT EXISTS "ix_ex_appeals_attempt" ON "ex_appeals" ("attempt_id");

DO $$
BEGIN
  ALTER TABLE "ex_appeals" ADD CONSTRAINT "ex_appeals_attempt_fkey" FOREIGN KEY ("attempt_id") REFERENCES "ex_attempts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE "ex_appeals" ADD CONSTRAINT "ex_appeals_link_fkey" FOREIGN KEY ("link_id") REFERENCES "ex_links"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- In-platform notifications: a new appeal for the teacher and assistants,
-- and the answer for the student.
ALTER TYPE "notification_key_enum" ADD VALUE IF NOT EXISTS 'EXAM_APPEAL_NEW';
ALTER TYPE "notification_key_enum" ADD VALUE IF NOT EXISTS 'EXAM_APPEAL_ACCEPTED';
ALTER TYPE "notification_key_enum" ADD VALUE IF NOT EXISTS 'EXAM_APPEAL_REJECTED';
