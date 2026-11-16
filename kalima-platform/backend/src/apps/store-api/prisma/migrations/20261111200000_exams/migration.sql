-- Exams (phase 3 of the exam system): exam folders, exams with sections,
-- picked or drawn questions, draw rules, links (a link without a teacher is
-- the admin test link), attempts with their answers and essay photos, and
-- celebration sounds. Additive and idempotent.

DO $$
BEGIN
  CREATE TYPE "ex_exam_type_enum" AS ENUM ('exam', 'homework');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ex_exam_mode_enum" AS ENUM ('manual', 'random');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ex_attempt_status_enum" AS ENUM ('in_progress', 'pending', 'done');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ex_folders" (
    "id" SERIAL NOT NULL,
    "parent_id" INTEGER,
    "path" VARCHAR(1000) NOT NULL DEFAULT '',
    "name" VARCHAR(255) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "archived_by" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ex_folders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ex_exams" (
    "id" SERIAL NOT NULL,
    "folder_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "serial" VARCHAR(50),
    "subject_id" INTEGER,
    "type" "ex_exam_type_enum" NOT NULL,
    "mode" "ex_exam_mode_enum" NOT NULL,
    "target_total" DECIMAL(7,2),
    "duration_minutes" INTEGER,
    "pass_percent" INTEGER NOT NULL DEFAULT 50,
    "redo_percent" INTEGER,
    "max_redos" INTEGER NOT NULL DEFAULT 0,
    "redo_required" BOOLEAN NOT NULL DEFAULT false,
    "redo_new_questions" BOOLEAN NOT NULL DEFAULT false,
    "shuffle" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "archived_by" INTEGER,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ex_exams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ex_sections" (
    "id" SERIAL NOT NULL,
    "exam_id" INTEGER NOT NULL,
    "name" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ex_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ex_exam_questions" (
    "id" SERIAL NOT NULL,
    "exam_id" INTEGER NOT NULL,
    "section_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "mark" DECIMAL(7,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "rule_id" INTEGER,

    CONSTRAINT "ex_exam_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ex_draw_rules" (
    "id" SERIAL NOT NULL,
    "section_id" INTEGER NOT NULL,
    "folder_ids" INTEGER[],
    "category_id" INTEGER,
    "subcategory_id" INTEGER,
    "easy_count" INTEGER NOT NULL DEFAULT 0,
    "medium_count" INTEGER NOT NULL DEFAULT 0,
    "hard_count" INTEGER NOT NULL DEFAULT 0,
    "very_hard_count" INTEGER NOT NULL DEFAULT 0,
    "easy_mark" DECIMAL(7,2) NOT NULL DEFAULT 1,
    "medium_mark" DECIMAL(7,2) NOT NULL DEFAULT 1,
    "hard_mark" DECIMAL(7,2) NOT NULL DEFAULT 1,
    "very_hard_mark" DECIMAL(7,2) NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ex_draw_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ex_links" (
    "id" SERIAL NOT NULL,
    "exam_id" INTEGER NOT NULL,
    "teacher_user_id" INTEGER,
    "code" VARCHAR(16) NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ex_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ex_attempts" (
    "id" SERIAL NOT NULL,
    "exam_id" INTEGER NOT NULL,
    "link_id" INTEGER NOT NULL,
    "student_user_id" INTEGER NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "ex_attempt_status_enum" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "auto_submitted" BOOLEAN NOT NULL DEFAULT false,
    "questions" JSONB NOT NULL,
    "content" JSONB NOT NULL,
    "score" DECIMAL(7,2),
    "total" DECIMAL(7,2) NOT NULL,
    "session_token" VARCHAR(64),
    "fullscreen_exits" INTEGER NOT NULL DEFAULT 0,
    "tab_leaves" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ex_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ex_attempt_answers" (
    "attempt_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "answer" JSONB NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "mark" DECIMAL(7,2),
    "graded_at" TIMESTAMPTZ(6),
    "graded_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ex_attempt_answers_pkey" PRIMARY KEY ("attempt_id","question_id")
);

CREATE TABLE IF NOT EXISTS "ex_answer_files" (
    "id" SERIAL NOT NULL,
    "attempt_id" INTEGER NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(150) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ex_answer_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ex_celebration_sounds" (
    "id" SERIAL NOT NULL,
    "band" VARCHAR(20) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(150) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_filename" VARCHAR(255),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ex_celebration_sounds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ix_ex_folders_parent" ON "ex_folders"("parent_id", "sort_order");

CREATE INDEX IF NOT EXISTS "ix_ex_folders_path" ON "ex_folders"("path");

CREATE INDEX IF NOT EXISTS "ix_ex_exams_folder" ON "ex_exams"("folder_id", "sort_order");

CREATE INDEX IF NOT EXISTS "ix_ex_exams_serial" ON "ex_exams"("serial");

CREATE INDEX IF NOT EXISTS "ix_ex_sections_exam" ON "ex_sections"("exam_id", "sort_order");

CREATE INDEX IF NOT EXISTS "ix_ex_exam_questions_section" ON "ex_exam_questions"("section_id", "sort_order");

CREATE INDEX IF NOT EXISTS "ix_ex_exam_questions_question" ON "ex_exam_questions"("question_id");

CREATE UNIQUE INDEX IF NOT EXISTS "ux_ex_exam_questions_exam_question" ON "ex_exam_questions"("exam_id", "question_id");

CREATE INDEX IF NOT EXISTS "ix_ex_draw_rules_section" ON "ex_draw_rules"("section_id", "sort_order");

CREATE UNIQUE INDEX IF NOT EXISTS "ex_links_code_key" ON "ex_links"("code");

CREATE INDEX IF NOT EXISTS "ix_ex_links_exam" ON "ex_links"("exam_id");

CREATE INDEX IF NOT EXISTS "ix_ex_attempts_student" ON "ex_attempts"("student_user_id", "exam_id");

CREATE INDEX IF NOT EXISTS "ix_ex_attempts_status_deadline" ON "ex_attempts"("status", "deadline_at");

CREATE UNIQUE INDEX IF NOT EXISTS "ux_ex_attempts_no" ON "ex_attempts"("link_id", "student_user_id", "attempt_no");

CREATE UNIQUE INDEX IF NOT EXISTS "ex_answer_files_storage_key_key" ON "ex_answer_files"("storage_key");

CREATE INDEX IF NOT EXISTS "ix_ex_answer_files_attempt" ON "ex_answer_files"("attempt_id");

CREATE UNIQUE INDEX IF NOT EXISTS "ex_celebration_sounds_storage_key_key" ON "ex_celebration_sounds"("storage_key");

CREATE INDEX IF NOT EXISTS "ix_ex_celebration_sounds_band" ON "ex_celebration_sounds"("band");

DO $$
BEGIN
  ALTER TABLE "ex_folders" ADD CONSTRAINT "ex_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ex_folders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ex_exams" ADD CONSTRAINT "ex_exams_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "ex_folders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ex_exams" ADD CONSTRAINT "ex_exams_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ex_sections" ADD CONSTRAINT "ex_sections_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "ex_exams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ex_exam_questions" ADD CONSTRAINT "ex_exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "ex_exams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ex_exam_questions" ADD CONSTRAINT "ex_exam_questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "ex_sections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ex_exam_questions" ADD CONSTRAINT "ex_exam_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "qb_questions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ex_draw_rules" ADD CONSTRAINT "ex_draw_rules_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "ex_sections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ex_links" ADD CONSTRAINT "ex_links_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "ex_exams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ex_attempts" ADD CONSTRAINT "ex_attempts_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "ex_exams"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ex_attempts" ADD CONSTRAINT "ex_attempts_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "ex_links"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ex_attempt_answers" ADD CONSTRAINT "ex_attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "ex_attempts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ex_answer_files" ADD CONSTRAINT "ex_answer_files_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "ex_attempts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
