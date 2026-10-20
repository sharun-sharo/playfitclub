# FitPlay

FitPlay turns a television browser into a fitness arcade. A phone joins with a QR code, tracks the player’s body locally, and sends movement events to a TV game. Camera frames are not uploaded or stored.

The first game is **FitRunner**: a three-lane runner controlled by leans, jumps, and squats.

## What is implemented

- TV lobby at `/play` with a QR code, join code, fullscreen, countdown, pause, and results.
- Phone join at `/join/[sessionCode]` with camera permission, calibration, landmark overlay, and movement events.
- FitRunner gameplay, deterministic obstacles, combos, lives, and a three-minute default round.
- Keyboard fallback on the TV, labeled as a test control.
- Two-player sessions. Each player uses their own phone. One camera does not track two people.
- A separate Socket.IO service that validates membership, rate-limits movements, rejects duplicate events, and owns the score.
- PostgreSQL models for users, gyms, sessions, results, achievements, feature flags, and operational events.
- Player, gym-owner, and admin pages backed by the database.
- Guest home play without a gym subscription.
- Unit tests for movement detection, FitRunner rules, and realtime session rules.
- A Playwright test for the TV lobby, phone join, keyboard fallback, and result screen.

## What is not verified on a physical device

Automated tests mock or bypass the camera. A real phone has not been signed off in this environment. Use the manual camera procedure in [docs/CAMERA.md](docs/CAMERA.md) before treating pose tracking as production-ready.

Jump detection is a monocular estimate from image motion. It is not a measurement of jump height. FitPlay does not judge exercise form and cannot prevent injury.

## Stack

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4, shadcn-style UI
- Phaser 3.90 for the TV playfield
- MediaPipe Pose Landmarker (`@mediapipe/tasks-vision` 0.10) in the phone browser
- Zod 3 for payloads
- Socket.IO 4 on a standalone Node service
- PostgreSQL 16 and Prisma 6
- Vitest and Playwright
- Signed httpOnly session cookies (`jose`) and bcrypt password hashes

Socket.IO is not hosted inside a Vercel serverless function. Deploy it as its own long-running Node process.

## Local setup

Requirements: Node.js 20.9 or newer, npm, and PostgreSQL 16.

```bash
npm install
cp .env.example .env
cp .env apps/web/.env
cp .env packages/db/.env
```

Edit `DATABASE_URL` if your local Postgres user is not the one in `.env.example`. This workspace uses the local Homebrew user.

```bash
npm run db:migrate
npm run db:seed
npm run vision:fetch
npm run dev
```

- TV and site: http://localhost:3000
- Realtime health: http://127.0.0.1:3001/health

`npm run dev` starts the Next.js app and the Socket.IO server together.

### Demo accounts

Development only, after seeding. Password `fitplay-demo` unless `DEMO_PASSWORD` is changed. The sign-in page also has one-click demo buttons that are disabled in production.

| Email | Role |
| --- | --- |
| player@fitplay.dev | Player |
| owner@fitplay.dev | Gym owner, Pulse District |
| admin@fitplay.dev | Platform admin |

Home play does not need an account. Signed-in players keep personal bests and achievements.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Web and realtime together |
| `npm run typecheck` | Strict TypeScript across packages |
| `npm test` | Vitest unit and realtime tests |
| `npm run test:e2e -w @fitplay/web` | Playwright browser test |
| `npm run lint` | Next.js ESLint |
| `npm run build` | Production typecheck of realtime and `next build` |
| `npm run db:migrate` | Create or apply a dev migration |
| `npm run db:seed` | Safe demo data. Refuses production unless `SEED_DEMO=true` |
| `npm run db:prune-guests` | Delete ended guest sessions older than `GUEST_RETENTION_DAYS` (default 30) |
| `npm run vision:fetch` | Copy MediaPipe wasm and download the lite pose model |

## How a round works

1. The TV creates a session. The server stores it and returns a join code.
2. The QR code uses `NEXT_PUBLIC_APP_URL` when that URL is public. In development it uses the browser origin, so a LAN address stays a LAN address. Production refuses to encode `localhost`.
3. The phone joins, optionally signs in, and calibrates against a neutral stance.
4. The TV starts a three-second countdown.
5. The phone sends `MovementEvent` messages. The server applies them to a deterministic FitRunner instance and broadcasts snapshots.
6. The server stores the final score. Clients cannot submit a score total.

Keyboard fallback: on the phone, choose **Use TV keyboard**. Player 1 then uses the arrow keys and space. Player 2 uses A, D, S, and W. The TV labels this as fallback, not camera tracking.

## Environment

See `.env.example`. Secrets required in every environment:

- `DATABASE_URL`
- `AUTH_SECRET` (at least 32 characters)
- `NEXT_PUBLIC_APP_URL` (public https origin in production)
- `NEXT_PUBLIC_REALTIME_URL` and `REALTIME_URL`
- `CORS_ORIGINS`
- `ALLOW_SHORT_SESSIONS` (`false` in production)

No admin password is hardcoded. Demo buttons and `/api/auth/demo` return 404 in production.

## More docs

- [Deployment](docs/DEPLOYMENT.md)
- [Camera and HTTPS](docs/CAMERA.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
