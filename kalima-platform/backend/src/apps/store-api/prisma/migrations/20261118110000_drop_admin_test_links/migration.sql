-- The admin no longer has a link of their own to take an exam: admins and
-- teachers see an exam through its preview. The old admin test links and
-- every attempt made through them (tries, not real students) are removed;
-- answers, photos rows, appeals and overrides go with them by cascade.
-- Safe to run again.
DELETE FROM "ex_attempts" WHERE "link_id" IN (SELECT "id" FROM "ex_links" WHERE "teacher_user_id" IS NULL);
DELETE FROM "ex_links" WHERE "teacher_user_id" IS NULL;
