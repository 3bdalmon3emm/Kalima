-- Exams phase 4: teachers and their links. Additive and idempotent.

-- A teacher added on an exam folder (everything inside it, now and later) or
-- on one exam, with the default dates of the links it gives. Removing the
-- teacher sets removed_at; adding them again brings the same links back.
CREATE TABLE IF NOT EXISTS "ex_teacher_assignments" (
    "id" SERIAL NOT NULL,
    "teacher_user_id" INTEGER NOT NULL,
    "folder_id" INTEGER,
    "exam_id" INTEGER,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "removed_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ex_teacher_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ex_teacher_assignments_one_target" CHECK (("folder_id" IS NULL) <> ("exam_id" IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_ex_teacher_assignments_folder" ON "ex_teacher_assignments" ("teacher_user_id", "folder_id") WHERE "folder_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ux_ex_teacher_assignments_exam" ON "ex_teacher_assignments" ("teacher_user_id", "exam_id") WHERE "exam_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_ex_teacher_assignments_teacher" ON "ex_teacher_assignments" ("teacher_user_id");

DO $$
BEGIN
  ALTER TABLE "ex_teacher_assignments" ADD CONSTRAINT "ex_teacher_assignments_teacher_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE "ex_teacher_assignments" ADD CONSTRAINT "ex_teacher_assignments_folder_fkey" FOREIGN KEY ("folder_id") REFERENCES "ex_folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE "ex_teacher_assignments" ADD CONSTRAINT "ex_teacher_assignments_exam_fkey" FOREIGN KEY ("exam_id") REFERENCES "ex_exams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One permanent link per exam and teacher, so a printed QR keeps working.
-- dates_custom: the admin set this link's dates by hand; folder date changes
-- leave it alone.
ALTER TABLE "ex_links" ADD COLUMN IF NOT EXISTS "dates_custom" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "ux_ex_links_exam_teacher" ON "ex_links" ("exam_id", "teacher_user_id") WHERE "teacher_user_id" IS NOT NULL;

-- Reopening for one student on one link: extra attempts (allowed whatever
-- the score), a later end date, and extra minutes for the next attempt.
CREATE TABLE IF NOT EXISTS "ex_student_overrides" (
    "id" SERIAL NOT NULL,
    "link_id" INTEGER NOT NULL,
    "student_user_id" INTEGER NOT NULL,
    "extra_attempts" INTEGER NOT NULL DEFAULT 0,
    "extra_minutes" INTEGER NOT NULL DEFAULT 0,
    "ends_at" TIMESTAMPTZ(6),
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ex_student_overrides_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_ex_student_overrides" ON "ex_student_overrides" ("link_id", "student_user_id");
DO $$
BEGIN
  ALTER TABLE "ex_student_overrides" ADD CONSTRAINT "ex_student_overrides_link_fkey" FOREIGN KEY ("link_id") REFERENCES "ex_links"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The teacher's cover photo (like Facebook), shown on the exam start page.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cover_url" TEXT;

-- Assistants work for one or more teachers (and a teacher may have many).
CREATE TABLE IF NOT EXISTS "teacher_assistants" (
    "id" SERIAL NOT NULL,
    "teacher_user_id" INTEGER NOT NULL,
    "assistant_user_id" INTEGER NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teacher_assistants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_teacher_assistants" ON "teacher_assistants" ("teacher_user_id", "assistant_user_id");
CREATE INDEX IF NOT EXISTS "ix_teacher_assistants_assistant" ON "teacher_assistants" ("assistant_user_id");
DO $$
BEGIN
  ALTER TABLE "teacher_assistants" ADD CONSTRAINT "teacher_assistants_teacher_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE "teacher_assistants" ADD CONSTRAINT "teacher_assistants_assistant_fkey" FOREIGN KEY ("assistant_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
