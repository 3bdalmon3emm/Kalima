-- Question bank (phase 1 of the exam system).
-- Banks are root folders; folders nest and hold either folders or questions.
-- Passages are questions of type "passage" with child questions under them.
-- Options and matching items keep their ids across edits (removed_at instead
-- of delete), so later attempts and re-grading can point at them.
-- Additive and idempotent: enums and constraints ignore "already exists".

DO $$
BEGIN
  CREATE TYPE "qb_question_type_enum" AS ENUM ('mcq_single', 'mcq_multi', 'true_false', 'essay', 'matching', 'passage');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "qb_difficulty_enum" AS ENUM ('easy', 'medium', 'hard', 'very_hard');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "qb_explanation_mode_enum" AS ENUM ('none', 'combined_text', 'per_option', 'image');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "qb_matching_side_enum" AS ENUM ('left', 'right');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "qb_media" (
    "id" SERIAL NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "mime_type" VARCHAR(150) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_filename" VARCHAR(255),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qb_media_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "qb_folders" (
    "id" SERIAL NOT NULL,
    "bank_id" INTEGER,
    "parent_id" INTEGER,
    "path" VARCHAR(1000) NOT NULL DEFAULT '',
    "name" VARCHAR(255) NOT NULL,
    "subject_id" INTEGER,
    "copy_status" VARCHAR(20),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "archived_by" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qb_folders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "qb_folder_levels" (
    "folder_id" INTEGER NOT NULL,
    "level_id" INTEGER NOT NULL,

    CONSTRAINT "qb_folder_levels_pkey" PRIMARY KEY ("folder_id","level_id")
);

CREATE TABLE IF NOT EXISTS "qb_categories" (
    "id" SERIAL NOT NULL,
    "bank_id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "name" VARCHAR(255) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qb_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "qb_questions" (
    "id" SERIAL NOT NULL,
    "serial" VARCHAR(12) NOT NULL,
    "reference_no" VARCHAR(50),
    "folder_id" INTEGER NOT NULL,
    "passage_id" INTEGER,
    "type" "qb_question_type_enum" NOT NULL,
    "difficulty" "qb_difficulty_enum",
    "category_id" INTEGER,
    "subcategory_id" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "stem_text" TEXT,
    "stem_image_id" INTEGER,
    "stem_audio_id" INTEGER,
    "explanation_mode" "qb_explanation_mode_enum" NOT NULL DEFAULT 'none',
    "explanation_text" TEXT,
    "explanation_image_id" INTEGER,
    "model_answer_text" TEXT,
    "model_answer_image_id" INTEGER,
    "archived_at" TIMESTAMPTZ(6),
    "archived_by" INTEGER,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qb_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "qb_question_options" (
    "id" SERIAL NOT NULL,
    "question_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT,
    "image_id" INTEGER,
    "label" VARCHAR(20),
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "explanation_text" TEXT,
    "removed_at" TIMESTAMPTZ(6),

    CONSTRAINT "qb_question_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "qb_matching_items" (
    "id" SERIAL NOT NULL,
    "question_id" INTEGER NOT NULL,
    "side" "qb_matching_side_enum" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT,
    "image_id" INTEGER,
    "audio_id" INTEGER,
    "match_item_id" INTEGER,
    "removed_at" TIMESTAMPTZ(6),

    CONSTRAINT "qb_matching_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "qb_media_storage_key_key" ON "qb_media"("storage_key");

CREATE INDEX IF NOT EXISTS "ix_qb_folders_bank" ON "qb_folders"("bank_id");

CREATE INDEX IF NOT EXISTS "ix_qb_folders_parent" ON "qb_folders"("parent_id", "sort_order");

CREATE INDEX IF NOT EXISTS "ix_qb_folders_path" ON "qb_folders"("path");

CREATE INDEX IF NOT EXISTS "ix_qb_categories_bank" ON "qb_categories"("bank_id", "parent_id");

CREATE UNIQUE INDEX IF NOT EXISTS "qb_questions_serial_key" ON "qb_questions"("serial");

CREATE INDEX IF NOT EXISTS "ix_qb_questions_folder" ON "qb_questions"("folder_id", "passage_id", "sort_order");

CREATE INDEX IF NOT EXISTS "ix_qb_questions_passage" ON "qb_questions"("passage_id", "sort_order");

CREATE INDEX IF NOT EXISTS "ix_qb_questions_category" ON "qb_questions"("category_id");

CREATE INDEX IF NOT EXISTS "ix_qb_questions_subcategory" ON "qb_questions"("subcategory_id");

CREATE INDEX IF NOT EXISTS "ix_qb_questions_reference_no" ON "qb_questions"("reference_no");

CREATE INDEX IF NOT EXISTS "ix_qb_question_options_question" ON "qb_question_options"("question_id", "sort_order");

CREATE INDEX IF NOT EXISTS "ix_qb_matching_items_question" ON "qb_matching_items"("question_id", "side", "sort_order");

DO $$
BEGIN
  ALTER TABLE "qb_folders" ADD CONSTRAINT "qb_folders_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "qb_folders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_folders" ADD CONSTRAINT "qb_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "qb_folders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_folders" ADD CONSTRAINT "qb_folders_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_folder_levels" ADD CONSTRAINT "qb_folder_levels_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "qb_folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_folder_levels" ADD CONSTRAINT "qb_folder_levels_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_categories" ADD CONSTRAINT "qb_categories_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "qb_folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_categories" ADD CONSTRAINT "qb_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "qb_categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_questions" ADD CONSTRAINT "qb_questions_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "qb_folders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_questions" ADD CONSTRAINT "qb_questions_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "qb_questions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_questions" ADD CONSTRAINT "qb_questions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "qb_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_questions" ADD CONSTRAINT "qb_questions_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "qb_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_questions" ADD CONSTRAINT "qb_questions_stem_image_id_fkey" FOREIGN KEY ("stem_image_id") REFERENCES "qb_media"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_questions" ADD CONSTRAINT "qb_questions_stem_audio_id_fkey" FOREIGN KEY ("stem_audio_id") REFERENCES "qb_media"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_questions" ADD CONSTRAINT "qb_questions_explanation_image_id_fkey" FOREIGN KEY ("explanation_image_id") REFERENCES "qb_media"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_questions" ADD CONSTRAINT "qb_questions_model_answer_image_id_fkey" FOREIGN KEY ("model_answer_image_id") REFERENCES "qb_media"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_question_options" ADD CONSTRAINT "qb_question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "qb_questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_question_options" ADD CONSTRAINT "qb_question_options_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "qb_media"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_matching_items" ADD CONSTRAINT "qb_matching_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "qb_questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_matching_items" ADD CONSTRAINT "qb_matching_items_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "qb_media"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_matching_items" ADD CONSTRAINT "qb_matching_items_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "qb_media"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qb_matching_items" ADD CONSTRAINT "qb_matching_items_match_item_id_fkey" FOREIGN KEY ("match_item_id") REFERENCES "qb_matching_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
