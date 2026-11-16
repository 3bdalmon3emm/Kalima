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

-- Orders' soft delete flag. Production already has it (added outside the
-- migrations); databases built only from migrations did not.
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN DEFAULT false;

-- The rest of the columns schema.prisma declares but no migration created
-- (production has them; databases built only from migrations did not).
DO $$
BEGIN
  CREATE TYPE "coupon_type" AS ENUM ('percentage', 'fixed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "user_flag_enum" ADD VALUE IF NOT EXISTS 'ELITE';
ALTER TYPE "user_flag_enum" ADD VALUE IF NOT EXISTS 'PRO';
ALTER TYPE "user_flag_enum" ADD VALUE IF NOT EXISTS 'OBSERVER';
ALTER TYPE "user_flag_enum" ADD VALUE IF NOT EXISTS 'Warned';

ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN DEFAULT false;
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "type" "coupon_type" NOT NULL DEFAULT 'percentage';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN DEFAULT false;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "perks" TEXT;
ALTER TABLE "required_field_definitions" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN DEFAULT false;
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN DEFAULT false;
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN DEFAULT false;
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "final_price" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "coupon_id" INTEGER;
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN DEFAULT false;
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN DEFAULT false;
