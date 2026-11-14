ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_status_at timestamptz;
-- best-effort backfill for leads that already have a status
UPDATE leads SET lead_status_at = COALESCE(converted_at, interested_at, updated_at)
WHERE lead_status IS NOT NULL AND lead_status_at IS NULL;