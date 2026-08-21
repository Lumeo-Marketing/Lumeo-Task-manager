# Lumeo Task

A Vite + React task intake and tracking dashboard for Lumeo.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` starts both the Vite UI and the local Express API. SQLite is the local source of truth in `data/lumeo-task.sqlite`; task fields, task status, task file metadata, task file bytes, brand assets, and brand asset bytes are stored in the database.

For the API only, use `npm run dev:api`. The local API provides:

- `GET /api/tasks`
- `POST /api/tasks` with multipart form fields and `files[]`
- `PATCH /api/tasks/:id/status` with `{ "status": "Pending" }` or `{ "status": "Completed" }`
- `GET /api/health`
- `GET /api/brands/:brand/assets`
- `POST /api/brands/:brand/assets` with multipart `files[]`
- `GET /api/task-files/:id/download`
- `GET /api/brand-assets/:id/download`

## Railway deployment

Railway should use the commands in `railway.json`:

- Build: `npm run build`
- Start: `npm start`
- Health check: `/api/health`

Set the SMTP variables from `.env.example` in Railway Variables. Do not upload `.env` to the repository. For persistence, attach a Railway Volume and mount it at `/app/data`, because SQLite is file-based.

## Integrations

Set these environment variables when wiring production services:

- `VITE_GHL_WEBHOOK_URL`: GoHighLevel subaccount webhook endpoint.
- `VITE_EMAIL_ENDPOINT`: Your server-side email endpoint. Keep provider credentials on the server.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: Server-side SMTP credentials for request notifications.
- `SMTP_FROM`: Optional sender address.

For SendGrid, use `smtp.sendgrid.net`, port `587`, username `apikey`, and a newly generated SendGrid API key as `SMTP_PASS`. The sender address must be verified in SendGrid. The local `.env` contains a placeholder and is ignored by git.

The integration boundary is `submitToGhlAndEmail` in `src/main.tsx`. GHL/email forwarding is secondary and does not control local success: the app saves the submission to SQLite first, then can forward the payload. If GHL is unavailable, the local task remains saved.

Email routing is handled by the backend after the local save. Video, Online Poster / Flyer, and Print Poster / Flyer go to `stanley@lumeomarketing.com`. Web development, SEO, and Website update go to `godwin@lumeomarketing.com`. Emails include all submitted fields and uploaded files.

The logged-in display name can be provided with `?name=Alex` or `?contactName=Alex` on the embed URL. A GHL parent page can also send `{ name: "Alex" }`, `{ contactName: "Alex" }`, or `{ user: { name: "Alex" } }` with `postMessage` after the iframe loads.

## Information needed to connect GoHighLevel

1. The GHL webhook URL for the destination subaccount/workflow.
2. The desired GHL custom-field mapping, or confirmation that the webhook should receive the field names already used by the form.
3. The email recipient address or server endpoint for notifications.
4. A server-side upload endpoint if the actual file contents should be stored or attached. The current browser payload includes attachment names; credentials and email provider keys should remain server-side.
5. The exact GHL embed user-data method. The current app supports URL parameters and `postMessage`; a signed token or authenticated backend lookup is preferred for production because an iframe cannot safely read a parent GHL session directly.
