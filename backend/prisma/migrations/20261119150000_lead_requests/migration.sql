-- Lead requests: a user asks another user for leads. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "lead_requests" (
  "id" SERIAL PRIMARY KEY,
  "from_user_id" INTEGER NOT NULL,
  "to_user_id" INTEGER NOT NULL,
  "leads_requested" INTEGER NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "done_at" TIMESTAMPTZ(6),
  "done_by_user_id" INTEGER
);
CREATE INDEX IF NOT EXISTS "lead_requests_from_user_id_idx" ON "lead_requests"("from_user_id");
CREATE INDEX IF NOT EXISTS "lead_requests_to_user_id_idx" ON "lead_requests"("to_user_id");
CREATE INDEX IF NOT EXISTS "lead_requests_status_idx" ON "lead_requests"("status");
CREATE INDEX IF NOT EXISTS "lead_requests_created_at_idx" ON "lead_requests"("created_at");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vrm_sales_user') THEN
    EXECUTE 'GRANT ALL ON TABLE "lead_requests" TO vrm_sales_user';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE "lead_requests_id_seq" TO vrm_sales_user';
  END IF;
END
$$;
