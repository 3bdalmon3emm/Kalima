-- Platform changes plan. Additive and idempotent.

-- Every impersonation: who, as whom, when it started and when it stopped
-- (no end when the session simply expired). Shown to the Admin only.
CREATE TABLE IF NOT EXISTS "impersonation_logs" (
    "id" SERIAL NOT NULL,
    "actor_user_id" INTEGER NOT NULL,
    "target_user_id" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    CONSTRAINT "impersonation_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ix_impersonation_logs_started" ON "impersonation_logs" ("started_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_impersonation_logs_actor" ON "impersonation_logs" ("actor_user_id", "target_user_id");
