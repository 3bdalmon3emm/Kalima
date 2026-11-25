-- Staff shifts: the SubAdmin and the Moderator start a shift and end it from
-- their dashboard. No schedule, breaks or absence, only worked time. A shift
-- left open for 12 hours is closed on its own (auto_closed). Additive and
-- idempotent.
CREATE TABLE IF NOT EXISTS "staff_shifts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "auto_closed" BOOLEAN NOT NULL DEFAULT false,
    "edited_by" INTEGER,
    "edited_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_shifts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ix_staff_shifts_user_started" ON "staff_shifts" ("user_id", "started_at");
CREATE INDEX IF NOT EXISTS "ix_staff_shifts_started" ON "staff_shifts" ("started_at");
-- One open shift per person at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_staff_shifts_open" ON "staff_shifts" ("user_id") WHERE "ended_at" IS NULL;
