# Deployment

FitPlay is two processes plus Postgres. Do not put the Socket.IO server on a Vercel serverless function. Vercel can host the Next.js app. The realtime process needs a long-lived Node host such as Fly.io, Render, Railway, or a VM.

This repository has not been deployed. A successful local production build does not mean a public URL exists.

## 1. Database

Create a managed Postgres 16 database and set `DATABASE_URL`.

From a trusted machine:

```bash
npm ci
npm run db:generate
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Skip `npm run db:seed` in production unless you intentionally set `SEED_DEMO=true` and replace the demo password first.

## 2. Realtime service

Build context is the repository root. The included `apps/realtime/Dockerfile` installs workspaces, generates Prisma Client, and starts `tsx src/index.ts`.

Required environment:

- `DATABASE_URL`
- `AUTH_SECRET` (same value as the web app)
- `REALTIME_PORT` (default 3001)
- `CORS_ORIGINS` set to the public web origin, comma-separated if needed
- `ALLOW_SHORT_SESSIONS=false`

Expose `GET /health`. It returns `{ "ok": true, "service": "fitplay-realtime" }`.

The process keeps session state in memory and writes final results to Postgres. Restarting the process ends in-progress rounds. Run one instance unless you add a shared session store later.

## 3. Web app on Vercel

Set the project root to `apps/web`, or deploy from the monorepo with that root directory.

Environment:

- `DATABASE_URL`
- `AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL` = the public https origin, not localhost
- `NEXT_PUBLIC_REALTIME_URL` = the public realtime origin
- `REALTIME_URL` = the same realtime origin, used by the server health check
- `NEXT_PUBLIC_ALLOW_SHORT_SESSIONS=false`

`npm run build` in `apps/web` runs `vision:fetch` before `next build`. A plain `next build` fetches the same assets while loading the Next config, which is what the default Vercel Next.js build runs. That copies the wasm files into `public/mediapipe/wasm` and downloads `pose_landmarker_lite.task`. Those files stay gitignored and are not committed.

QR codes call `resolvePublicAppUrl`. If `NEXT_PUBLIC_APP_URL` is missing or points at localhost, production session creation for QR links fails closed.

## 4. Connect the services

Phones and TVs load the Next.js origin. The browser then opens a Socket.IO connection to `NEXT_PUBLIC_REALTIME_URL`. Both services verify tokens with `AUTH_SECRET`. Cookies are httpOnly, `SameSite=Lax`, and `Secure` in production. Mutations check the `Origin` header against the request host.

## 5. Verify

- `GET /api/health` reports database and realtime.
- Open `/play` on the TV origin and confirm the QR code uses the public https host.
- Join from a phone over https and complete the manual camera checklist in `docs/CAMERA.md`.
