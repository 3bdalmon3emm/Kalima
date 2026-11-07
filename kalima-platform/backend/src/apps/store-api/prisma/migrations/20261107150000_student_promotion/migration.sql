-- Yearly student promotion (after 30/6, Cairo time).
-- students.graduated: finished the last level of the last stage; never
--   promoted again until an admin moves them to another level.
-- students.promotion_notice: signed up in June of the promotion year, so the
--   level they picked may already have been the new one. They see a notice
--   once and may correct their level themselves.
-- level_promotions: one row per year, so a promotion runs at most once.
-- Additive and idempotent.

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "graduated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "promotion_notice" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "level_promotions" (
  "year" INTEGER PRIMARY KEY,
  "ran_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "promoted" INTEGER NOT NULL DEFAULT 0,
  "graduated" INTEGER NOT NULL DEFAULT 0,
  "baseline" BOOLEAN NOT NULL DEFAULT false
);

-- The promotion of the most recent 30/6 already happened outside the system
-- (students picked their current level themselves), so it is marked done.
-- Otherwise the first deploy would promote everyone immediately.
INSERT INTO "level_promotions" ("year", "baseline")
VALUES (EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Cairo') - INTERVAL '6 months')::int, true)
ON CONFLICT ("year") DO NOTHING;
