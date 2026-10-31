-- School stages (Primary / Preparatory / Secondary) as a real table, and
-- levels gain an Arabic title, a stage and a global order. The order drives
-- the yearly promotion (next level = next sort_order) and every level list.
-- Additive and idempotent: existing columns and rows are left untouched.

CREATE TABLE IF NOT EXISTS "stages" (
  "id" SERIAL PRIMARY KEY,
  "title" VARCHAR(255) NOT NULL UNIQUE,
  "title_ar" VARCHAR(255) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "stages" ("title", "title_ar", "sort_order") VALUES
  ('Primary', 'ابتدائي', 1),
  ('Preparatory', 'إعدادي', 2),
  ('Secondary', 'ثانوي', 3)
ON CONFLICT ("title") DO NOTHING;

ALTER TABLE "levels" ADD COLUMN IF NOT EXISTS "title_ar" VARCHAR(255);
ALTER TABLE "levels" ADD COLUMN IF NOT EXISTS "stage_id" INTEGER;
ALTER TABLE "levels" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER;

DO $$
BEGIN
  ALTER TABLE "levels"
  ADD CONSTRAINT "levels_stage_id_fkey"
  FOREIGN KEY ("stage_id") REFERENCES "stages"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Map the existing English titles. Only fills rows that are still empty, so
-- re-running never overwrites what an admin edited later.
UPDATE "levels" l
SET "title_ar" = COALESCE(l."title_ar", m.title_ar),
    "stage_id" = COALESCE(l."stage_id", s."id"),
    "sort_order" = COALESCE(l."sort_order", m.sort_order)
FROM (VALUES
  ('1st Primary', 'الصف الأول الابتدائي', 'Primary', 1),
  ('2nd Primary', 'الصف الثاني الابتدائي', 'Primary', 2),
  ('3rd Primary', 'الصف الثالث الابتدائي', 'Primary', 3),
  ('4th Primary', 'الصف الرابع الابتدائي', 'Primary', 4),
  ('5th Primary', 'الصف الخامس الابتدائي', 'Primary', 5),
  ('6th Primary', 'الصف السادس الابتدائي', 'Primary', 6),
  ('1st Preparatory', 'الصف الأول الإعدادي', 'Preparatory', 7),
  ('2nd Preparatory', 'الصف الثاني الإعدادي', 'Preparatory', 8),
  ('3rd Preparatory', 'الصف الثالث الإعدادي', 'Preparatory', 9),
  ('1st Secondary', 'الصف الأول الثانوي', 'Secondary', 10),
  ('2nd Secondary', 'الصف الثاني الثانوي', 'Secondary', 11),
  ('3rd Secondary', 'الصف الثالث الثانوي', 'Secondary', 12)
) AS m(title, title_ar, stage, sort_order)
JOIN "stages" s ON s."title" = m.stage
WHERE l."title" = m.title;
