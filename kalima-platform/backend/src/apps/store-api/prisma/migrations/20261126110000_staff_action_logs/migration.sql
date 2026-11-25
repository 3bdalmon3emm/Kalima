-- Staff action log: who changed an account's flag, returned an order,
-- removed an item from an order, deleted an order or cancelled/rejected an
-- e-booklet order, and why. Read by staff only; never part of what a
-- customer's own endpoints return. Additive and idempotent.
CREATE TABLE IF NOT EXISTS "staff_action_logs" (
    "id" SERIAL NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "reason" TEXT,
    "actor_user_id" INTEGER,
    "as_user_id" INTEGER,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_action_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ix_staff_action_logs_entity" ON "staff_action_logs" ("entity_type", "entity_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_staff_action_logs_actor" ON "staff_action_logs" ("actor_user_id", "created_at" DESC);
