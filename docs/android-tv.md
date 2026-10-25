# Android TV / Google TV shell

This is a proof of concept. It opens the existing FitRunner page in a television WebView. It does not rebuild the game, the pose engine, sign-in, or billing.

The launcher artwork in this module is a **placeholder**. It is not a screenshot from a television and it is not store art.

## What the shell loads

`apps/android-tv` is a Kotlin app with a Leanback launcher intent. The WebView opens `TV_START_URL`, which defaults to `https://playfitclub.com/tv`. Play at home on that page opens the live FitRunner session at `/tv/play`. There is no phone app in this repo. The player joins from the phone browser by scanning the QR code.

`/tv` is the television home. It uses the same homepage look as the website: the PlayFit Club logo, the three-line headline, the living-room picture, and the same three actions. Play at home opens `/tv/play`.

`/tv/play` mounts the existing `FitRunnerV2` component. The phone still pairs with the real session QR from `useTvSession`. Pose detection stays on the phone. The television does not request a camera. Back or Escape on `/tv/play` returns to `/tv` and the page unmount leaves the Socket.IO session.

## Build

Requirements: Android Studio (or the Android SDK command-line tools), JDK 17, and an SDK with platform 35.

From `apps/android-tv`:

```bash
./gradlew :app:assembleDebug
./gradlew :app:assembleRelease
./gradlew :app:bundleRelease
```

The default page is `https://playfitclub.com/tv`. `TV_START_URL` must be `https` and must not be localhost. Release signing uses `PLAYFIT_TV_STORE_FILE`, `PLAYFIT_TV_STORE_PASSWORD`, `PLAYFIT_TV_KEY_ALIAS`, and `PLAYFIT_TV_KEY_PASSWORD` when those are set in the environment. The keystore stays off this machine's git history. Store upload steps are in `docs/STORE_APPS.md`.

Install a debug APK with `adb install -r app/build/outputs/apk/debug/app-debug.apk` when a television is attached. This repository was not run on a television, and no frame rate was measured.

## Certificates

Debug and release both use system certificate authorities, refuse cleartext, and cancel SSL errors. The shell opens `https://playfitclub.com`. Do not install a build that disables those checks.

A signed release bundle is produced only when the `PLAYFIT_TV_STORE_*` environment variables point at a local keystore. Nothing in git is a signing key.

## Phone controller (unchanged)

1. The television page calls the existing `useTvSession` hook.
2. The hook opens Socket.IO at `browserRealtimeUrl`. Production uses `NEXT_PUBLIC_REALTIME_URL` as its own origin and refuses a missing or loopback value. It emits `session:create` for `fitrunner`.
3. The server returns a join code. The page draws a QR for `/join/{code}` with the `qrcode` library. The code is the live session code.
4. The phone opens that URL. `PhoneSession` joins with `session:join`, then opens the phone camera and runs MediaPipe in `PoseEstimator`.
5. Accepted moves are emitted as `movement:event`. The realtime server checks the player and relays the event to the television socket.
6. `useTvSession` passes the command into the existing FitRunner scene.

Do not run MediaPipe on the television.

## Entitlements

`/tv/play` calls the existing `fitRunnerAccess()` helper, which uses `playDecisionForUser`. Guests and unpaid accounts get the same demo limit as `/dev/fitrunner-v2`. An expired paid individual or gym subscription sees the existing “Play is paused” screen, plus a note that renewal is the current WhatsApp message sent from the phone. There is no checkout on the television and no new public signup. `PUBLIC_SELF_REGISTRATION` stays closed.

Sign-in on the TV home links to the existing `/login` page and returns to `/tv/play`.

## Publishing checklist

Do these before a Play listing. This proof of concept did not do them.

- Capture the banner (320×180) and screenshots on a real Android TV or Google TV. Replace the placeholder banner. Do not upload art that was drawn for this proof of concept as if it were the game.
- Build a signed release app bundle from a release keystore. Confirm the release variant still cancels SSL errors and blocks cleartext.
- The default `TV_START_URL` is already `https://playfitclub.com/tv`. Production QR codes refuse a missing or localhost `NEXT_PUBLIC_APP_URL`.
- Host Socket.IO on a long-lived process. Do not put it on a Vercel serverless function. Production uses `NEXT_PUBLIC_REALTIME_URL` as its own origin.
- Confirm `/tv/play` is the production route. `/dev/fitrunner-v2` returns 404 when `NODE_ENV` is production.
- Play Console: Leanback launcher, landscape, touchscreen not required, no camera permission, TV banner, feature graphic, data safety, content rating, privacy policy.
- Exercise D-pad, Back, loading, certificate failure, an expired account, and a guest demo on hardware.
- Decide whether WebGL on that device’s WebView is acceptable before promising the Three.js scene. If it is not, the renderer still needs a separate decision. This shell does not replace it.

## Known limits

- Android TV WebView WebGL is device-dependent. Some devices expose no GPU to the WebView, or only a slow software path. The existing Three.js FitRunner scene can fail to start or be too slow. This project does not change that renderer and does not claim a frame rate.
- No television, Play certification, input latency, or pose-to-screen latency was measured here.
- The default URL is `https://playfitclub.com/tv`. The television app does not open localhost.
- The phone controller is the normal browser on `https://playfitclub.com`, after the player scans the QR. This repository does not add a phone app.
- The dev FitRunner route is not a production route.
- The in-page D-pad mover does not take arrow keys while a run or keyboard practice owns them. Those keys stay with the existing game.
- The placeholder banner is labeled PLACEHOLDER in the image.
