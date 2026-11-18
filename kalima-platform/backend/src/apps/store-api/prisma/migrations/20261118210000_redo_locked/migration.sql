-- A re-grade that lowers a score never reopens a redo the student had
-- closed after seeing the answers. Additive and idempotent.

ALTER TABLE "ex_attempts" ADD COLUMN IF NOT EXISTS "redo_locked" BOOLEAN NOT NULL DEFAULT false;
