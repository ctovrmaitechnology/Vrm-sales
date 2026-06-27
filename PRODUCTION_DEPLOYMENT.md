# Production Deployment Checklist

This project has three deployable surfaces:

- `backend`: Email, WhatsApp, click tracking, dashboards, PostgreSQL writes.
- `frontend`: Vite dashboard.
- `facebook` / `linkedin`: separate automation backends if those modules are used.

## Backend

Install and prepare:

```powershell
cd backend
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run check
npm start
```

Required production environment:

```env
PORT=5002
NODE_ENV=production
DATABASE_URL="postgresql://postgres.rdxaymtpzvkgbeogntmo:[YOUR-PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
UNIFIED_DATABASE_URL="postgresql://postgres.rdxaymtpzvkgbeogntmo:[YOUR-PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
BACKEND_BASE_URL=https://api.your-domain.com
FRONTEND_BASE_URL=https://your-domain.com
POSTER_URL=https://drive.google.com/file/d/.../view?usp=drive_link
BREVO_API_KEY=...
ENABLE_FOLLOW_UP_CRON=false
ENABLE_WHATSAPP=false
```

`BACKEND_BASE_URL` must reach the Express backend. Email click tracking cannot work if this URL points only to the frontend or returns `502`.

## Reverse Proxy

If frontend and backend share one domain, route `/api/` to the backend:

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:5002/api/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

If the backend has its own subdomain, set:

```env
BACKEND_BASE_URL=https://api.your-domain.com
```

## Frontend

Build:

```powershell
cd frontend
npm ci
npm run build
```

Deploy `frontend/dist` to the web host.

## Poster Click Tracking Test

After backend deployment:

```text
https://api.your-domain.com/api/health
```

Expected response:

```json
{"ok":true,"service":"email-whatsapp-backend"}
```

Then test poster redirect:

```text
https://api.your-domain.com/api/poster?ref=dGVzdEBleGFtcGxlLmNvbQ%3D%3D
```

Expected behavior:

```text
HTTP 302 -> POSTER_URL
```

For a real email recipient:

```text
Email Book a Demo button
-> BACKEND_BASE_URL/api/poster?ref=<encoded-email>
-> lead_status row inserted with clicked=true
-> leads.status becomes clicked
-> redirects to Google Drive poster
```

## Campaign Safety Checks

Before sending a campaign:

- Open `BACKEND_BASE_URL/api/health`.
- Send one test email to yourself.
- Confirm the Book a Demo button URL starts with `BACKEND_BASE_URL/api/poster`.
- Click it and confirm the poster opens.
- Confirm the lead no longer appears in follow-up candidates.

## Production Notes

- Do not deploy `.env` from a public repository.
- Keep `ENABLE_WHATSAPP=false` if WhatsApp follow-ups should remain disabled.
- Keep `ENABLE_FOLLOW_UP_CRON=false` if follow-up emails should run only from the Email dashboard button.
- Restart backend after environment changes.
- Old emails with direct Google Drive links cannot be tracked; send new emails after deployment.
