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

-- Who deleted an order and why (the reason is required from now on).
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "deleted_by" INTEGER;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "delete_reason" TEXT;

-- The customer's account level when the order was placed, filled by a
-- trigger on every new order (store and e-booklet), so it stays even if the
-- level changes later. Older orders keep it empty and show the current level.
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "customer_flag" VARCHAR(20);
ALTER TABLE "e_booklet_purchases" ADD COLUMN IF NOT EXISTS "customer_flag" VARCHAR(20);

CREATE OR REPLACE FUNCTION "set_purchase_customer_flag"() RETURNS trigger AS $$
BEGIN
  IF NEW."customer_flag" IS NULL THEN
    SELECT u."flag"::text INTO NEW."customer_flag" FROM "users" u WHERE u."id" = NEW."user_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "set_e_booklet_purchase_customer_flag"() RETURNS trigger AS $$
BEGIN
  IF NEW."customer_flag" IS NULL THEN
    SELECT u."flag"::text INTO NEW."customer_flag" FROM "users" u WHERE u."id" = NEW."teacher_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_purchases_customer_flag" ON "purchases";
CREATE TRIGGER "trg_purchases_customer_flag" BEFORE INSERT ON "purchases"
  FOR EACH ROW EXECUTE FUNCTION "set_purchase_customer_flag"();

DROP TRIGGER IF EXISTS "trg_e_booklet_purchases_customer_flag" ON "e_booklet_purchases";
CREATE TRIGGER "trg_e_booklet_purchases_customer_flag" BEFORE INSERT ON "e_booklet_purchases"
  FOR EACH ROW EXECUTE FUNCTION "set_e_booklet_purchase_customer_flag"();
