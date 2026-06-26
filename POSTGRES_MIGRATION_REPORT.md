# PostgreSQL Migration Report

Database target: `outreach_ai`

Unified tables:

- `leads`
- `lead_status`
- `automation_logs`

## Current Phase Status

### Phase 1 - Parallel Write Mode

Status: implemented for the active Facebook scraper, Email backend, WhatsApp backend, and LinkedIn backend connection target.

What changed:

- Existing JSON writes are still kept.
- Existing Excel upload/download is still kept.
- Facebook scraper writes to JSON and also upserts the same lead data into PostgreSQL.
- Email/WhatsApp backend keeps the old `Customer` flow and also mirrors leads/status actions into PostgreSQL.
- LinkedIn backend connection now targets `outreach_ai`.
- Added database logs:
  - `DB_INSERT_SUCCESS`
  - `DB_UPDATE_SUCCESS`
  - `DB_ERROR`

### Phase 2 - Dashboard Reads PostgreSQL

Status: implemented for the Email/WhatsApp backend dashboard endpoints.

Changed endpoints:

- `GET /api/dashboard`
- `GET /api/whatsapp/dashboard`

These now read from PostgreSQL unified tables instead of deriving card counts from the old `Customer` JSON-like flow.

### Phase 3 - Full PostgreSQL Bot Operations

Status: implemented for Facebook scraper/contact enrichment/LinkedIn URL finder storage.

Current behavior:

- Facebook lead scraper reads existing leads from PostgreSQL.
- Facebook contact enrichment reads its queue from PostgreSQL.
- LinkedIn URL finder reads its queue and final rows from PostgreSQL.
- Facebook status/list/export endpoints read PostgreSQL.
- JSON files are written only as backup snapshots.

Remaining work:

- Move Email/WhatsApp campaign engine away from the old Prisma `Customer` table after a separate parity check.

### Phase 4 - JSON Backup Only

Status: implemented for the Facebook scraper pipeline.

JSON remains as backup/export snapshots only for Facebook scraper data.

## Files Changed

- `C:\Users\ADMIN\Desktop\projects\backend\.env`
  - Added `UNIFIED_DATABASE_URL` pointing to `outreach_ai`.

- `C:\Users\ADMIN\Desktop\projects\backend\unifiedDb.js`
  - Added PostgreSQL helper/repository functions.
  - Added table bootstrap for `leads`, `lead_status`, `automation_logs`.
  - Added dashboard reads from PostgreSQL.
  - Added existing customer backfill helper.

- `C:\Users\ADMIN\Desktop\projects\backend\app.js`
  - Added parallel PostgreSQL writes for Excel import, Email send, WhatsApp send, click tracking, unsubscribe, delete, and follow-ups.
  - Dashboard endpoints now read PostgreSQL.
  - Startup mirrors existing non-deleted customers into PostgreSQL.

- `C:\Users\ADMIN\Desktop\projects\facebook\backend\dbRepository.js`
  - PostgreSQL repository for Facebook scraper parallel writes.
  - Added PostgreSQL read helpers for Facebook rows/final rows.
  - Added startup validation helper.
  - Fixed blank email handling so missing email is stored as `NULL`, not a duplicate empty string.

- `C:\Users\ADMIN\Desktop\projects\facebook\backend\googleScraper.js`
  - Reads operational Facebook leads from PostgreSQL.
  - Reads operational final LinkedIn-enriched leads from PostgreSQL.
  - Reads daily scrape count from PostgreSQL `lead_status`.
  - Writes JSON only through `writeBackupJson`.
  - Removed JSON read dependency.

- `C:\Users\ADMIN\Desktop\projects\facebook\backend\server.js`
  - Awaits PostgreSQL-backed status/list/export/upload functions.
  - Added startup validation. If PostgreSQL is unavailable, backend exits with `POSTGRESQL_STARTUP_ERROR`.

- `C:\Users\ADMIN\Desktop\projects\linkedin\backend\.env`
  - Updated from `linkedin_bot` to `outreach_ai`.

## Queries Added

### Table Bootstrap

- `CREATE TABLE IF NOT EXISTS leads (...)`
- `CREATE TABLE IF NOT EXISTS lead_status (...)`
- `CREATE TABLE IF NOT EXISTS automation_logs (...)`

### Lead Writes

- `SELECT id FROM leads WHERE email = $1 LIMIT 1`
- `INSERT INTO leads (...) VALUES (...)`
- `UPDATE leads SET ... WHERE id = $10`

### Status Writes

- `INSERT INTO lead_status (...) VALUES (...)`

### Automation Logs

- `INSERT INTO automation_logs (...) VALUES (...)`

### Dashboard Reads

- Email dashboard counts from `leads` and `lead_status`
- WhatsApp dashboard counts from `leads` and `lead_status`
- WhatsApp dashboard table rows from `leads`

### Facebook Reads

- `SELECT * FROM leads WHERE facebook_url IS NOT NULL AND facebook_url <> '' ORDER BY created_at DESC, id DESC`
- `SELECT * FROM leads WHERE source = 'final_linkedin_enriched' OR linkedin_url IS NOT NULL ORDER BY updated_at DESC NULLS LAST, created_at DESC, id DESC`
- `SELECT COUNT(*) FROM lead_status WHERE status = 'lead_scraped' AND created_at::date = CURRENT_DATE`

## Functions Migrated / Added

### `backend/unifiedDb.js`

- `upsertUnifiedLead`
- `updateUnifiedLeadStatus`
- `insertAutomationLog`
- `getUnifiedEmailDashboard`
- `getUnifiedWhatsAppDashboard`
- `syncExistingCustomersToUnified`

### `facebook/backend/dbRepository.js`

- `upsertLeadToDb`
- `updateLeadStatusToDb`
- `insertAutomationLog`
- `assertDbReady`
- `listFacebookLeadsFromDb`
- `listFinalLeadsFromDb`
- `countLeadScrapesTodayFromDb`
- `closeDb`

## Remaining JSON Dependencies

Facebook scraper still writes backup snapshots:

- `C:\Users\ADMIN\Desktop\projects\facebook\backend\data\facebook_leads.json`
- `C:\Users\ADMIN\Desktop\projects\facebook\backend\data\final_leads.json`
- `C:\Users\ADMIN\Desktop\projects\facebook\backend\data\lead_scrape_daily_log.json`

Remaining backup-only function in `facebook/backend/googleScraper.js`:

- `writeBackupJson`

There are no remaining `readJson(...)` calls in the Facebook scraper.

Email/WhatsApp note:

- Email/WhatsApp do not use JSON lead stores.
- They still contain old Prisma `Customer` reads/writes in `C:\Users\ADMIN\Desktop\projects\backend\app.js`.
- That is PostgreSQL, but not yet fully migrated to the unified `outreach_ai.leads` queue. It should be migrated only after a separate `Customer` to `leads` parity verification.

## Verification Checklist

### Phase 1

- Start PostgreSQL and confirm `outreach_ai` exists.
- Start Facebook backend.
- Scrape a small lead batch.
- Confirm JSON file updates.
- Confirm same lead appears in `leads`.
- Confirm logs contain `DB_INSERT_SUCCESS` or `DB_UPDATE_SUCCESS`.
- Confirm Excel download still works.

### Phase 2

- Open dashboard.
- Confirm dashboard cards load from PostgreSQL.
- Confirm old Excel/upload buttons still work.
- Confirm Email and WhatsApp pages still show rows.

### Phase 3

- Switch one bot queue at a time to PostgreSQL reads.
- Verify Facebook lead scraper writes and reads from `leads`.
- Verify Facebook contact enrichment updates `email`, `whatsapp_number`, `whatsapp_url`.
- Verify LinkedIn URL finder updates `linkedin_url`, `full_name`, `role`, `company`.
- Verify Email/WhatsApp/LinkedIn actions update `lead_status`.
- Verify every action inserts `automation_logs`.

### Phase 4

- Disable JSON as a normal source.
- Keep JSON only as backup/export.
- Stop processing with a clear error if PostgreSQL is unavailable.
- Run end-to-end test: scrape -> enrich -> find LinkedIn -> outreach -> accepted/message statuses.
