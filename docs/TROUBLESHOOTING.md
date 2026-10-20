# Troubleshooting

## The QR code opens localhost on my phone

The TV was opened at `http://localhost:3000`, so the development QR uses that origin. Open the TV from the computer’s LAN IP or https origin instead. Production will not encode localhost.

## The phone says the camera needs HTTPS

Use localhost on the same machine, or serve the app with HTTPS. See `docs/CAMERA.md`.

## Session code is invalid or expired

Codes expire after two hours in the lobby, and they cannot be reused after the session is closed. Create a new lobby. Letters that look like O, I, 0, and 1 are not in the alphabet.

## The TV says it is reconnecting

The Socket.IO process is down or `NEXT_PUBLIC_REALTIME_URL` is wrong. Check `http://127.0.0.1:3001/health` locally, and confirm `CORS_ORIGINS` includes the web origin.

## Players join but Start stays disabled

Every connected player must be ready. Camera players become ready after calibration. Keyboard-fallback players become ready when they choose **Use TV keyboard** or when the TV adds a keyboard player.

## Movements do nothing

The round must be in the running phase, not the countdown or lobby. The phone must be calibrated, and the event has to belong to that player. Edge-lane leans and a second jump before landing are rejected on purpose.

## Scores look wrong

The server applies movements to FitRunner and ignores client score totals. Refreshing the TV after a realtime restart loses the in-memory round. The saved result is whatever reached `game:ended`.

## Database errors on boot

`DATABASE_URL` must be visible to both `apps/web` and `packages/db`. Apply migrations with `npm run db:migrate` in development or `prisma migrate deploy` in production, then `npm run db:seed` for local demo data.

## Prisma wants a config file

Prisma 6 prints a deprecation notice about `package.json#prisma`. The project stays on Prisma 6.19.3 because Prisma 7/8 were still release candidates when this was built. Do not upgrade the client past the pinned version without a migration plan.

## Build cannot find the pose model

Run `npm run vision:fetch`. The wasm files are copied from `@mediapipe/tasks-vision` and the lite `.task` model is downloaded from Google’s MediaPipe storage. Both are gitignored.

## Guest data

`npm run db:prune-guests` deletes ended, expired, or closed sessions that have no owner and no signed-in players and are older than 30 days. It does not delete accounts or gym history.
