-- Every student gets a serial (students.sequenced_id), shown on the exam page
-- and its watermark. A sequence numbers new students; existing students
-- without one are numbered by account age. Numbers already set are kept, and
-- new ones start after the highest of them (at 1001 at the least). Additive
-- and idempotent.

CREATE SEQUENCE IF NOT EXISTS "students_sequenced_id_seq" AS INTEGER;

SELECT setval(
  '"students_sequenced_id_seq"',
  GREATEST(COALESCE((SELECT MAX("sequenced_id") FROM "students"), 0), 1000),
  true
);

UPDATE "students" AS s
SET "sequenced_id" = n.serial
FROM (
  SELECT st."user_id", nextval('"students_sequenced_id_seq"') AS serial
  FROM (
    SELECT s2."user_id"
    FROM "students" s2
    JOIN "users" u ON u."id" = s2."user_id"
    WHERE s2."sequenced_id" IS NULL
    ORDER BY u."created_at" NULLS LAST, s2."user_id"
  ) st
) n
WHERE s."user_id" = n."user_id";

ALTER TABLE "students" ALTER COLUMN "sequenced_id" SET DEFAULT nextval('"students_sequenced_id_seq"');
ALTER SEQUENCE "students_sequenced_id_seq" OWNED BY "students"."sequenced_id";
