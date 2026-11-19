-- Team-to-team lead transfers
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "transferred_at" TIMESTAMPTZ(6);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "transferred_from_user_id" INTEGER;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "transferred_from_team_id" INTEGER;

CREATE TABLE IF NOT EXISTS "lead_transfers" (
  "id" SERIAL PRIMARY KEY,
  "batch_id" TEXT NOT NULL,
  "lead_id" INTEGER NOT NULL,
  "from_user_id" INTEGER,
  "to_user_id" INTEGER,
  "from_team_id" INTEGER,
  "to_team_id" INTEGER,
  "transferred_by_user_id" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "lead_transfers_lead_id_idx" ON "lead_transfers"("lead_id");
CREATE INDEX IF NOT EXISTS "lead_transfers_from_user_id_idx" ON "lead_transfers"("from_user_id");
CREATE INDEX IF NOT EXISTS "lead_transfers_to_user_id_idx" ON "lead_transfers"("to_user_id");
CREATE INDEX IF NOT EXISTS "lead_transfers_created_at_idx" ON "lead_transfers"("created_at");

-- Only grants when the live server role exists (skipped on other databases)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vrm_sales_user') THEN
    EXECUTE 'GRANT ALL ON TABLE "lead_transfers" TO vrm_sales_user';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE "lead_transfers_id_seq" TO vrm_sales_user';
  END IF;
END
$$;