-- Moderators were created with their role on the academy portal only, so
-- the dashboard (which reads the store portal) treated them as customers:
-- they landed on the home page and every staff page refused them. Give
-- every staff role on the academy portal its store twin, like the Admin and
-- the SubAdmin already have. Adds rows only; safe to run again.

INSERT INTO "user_roles" ("user_id", "portal", "role")
SELECT r."user_id", 'store', r."role"
FROM "user_roles" r
WHERE r."portal" = 'academy'
  AND r."role" IN ('Admin', 'SubAdmin', 'Moderator')
ON CONFLICT ("user_id", "portal", "role") DO NOTHING;
