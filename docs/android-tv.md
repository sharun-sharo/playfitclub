# Android TV / Google TV shell

This is a proof of concept. It opens the live site in a television WebView. It does not rebuild the game, the pose engine, sign-in, or billing. It is not listed on Google Play.

The launcher artwork in this module is a **placeholder**. It is not a screenshot from a television and it is not store art.

## What the shell loads

`apps/android-tv` is a Kotlin app with a Leanback launcher intent. The WebView opens `TV_START_URL`, which defaults to `https://playfitclub.com`. The game runs on the phone. A television shows that phone when the phone OS mirrors the screen. This shell is not a second playable game.

`/tv` and `/tv/play` on the site permanently redirect to the homepage. A future build does not open those paths. If the WebView is still on `/tv/play`, Back loads the site root. Back from the first page exits the app. There is no phone app in this repo.

## Build

Requirements: Android Studio (or the Android SDK command-line tools), JDK 17, and an SDK with platform 35.

From `apps/android-tv`:

```bash
./gradlew :app:assembleDebug
./gradlew :app:assembleRelease
./gradlew :app:bundleRelease
```

The default page is `https://playfitclub.com`. `TV_START_URL` must be `https` and must not be localhost. Release signing uses `PLAYFIT_TV_STORE_FILE`, `PLAYFIT_TV_STORE_PASSWORD`, `PLAYFIT_TV_KEY_ALIAS`, and `PLAYFIT_TV_KEY_PASSWORD` when those are set in the environment. The keystore stays off this machine's git history. Store upload steps are in `docs/STORE_APPS.md`.

Install a debug APK with `adb install -r app/build/outputs/apk/debug/app-debug.apk` when a television is attached. This repository was not run on a television, and no frame rate was measured.

## Certificates

Debug and release both use system certificate authorities, refuse cleartext, and cancel SSL errors. The shell opens `https://playfitclub.com`. Do not install a build that disables those checks.

A signed release bundle is produced only when the `PLAYFIT_TV_STORE_*` environment variables point at a local keystore. Nothing in git is a signing key.

## Phone

The game runs in the phone browser. Pose detection stays on the phone. The television WebView does not request a camera. Do not run MediaPipe on the television.

## Publishing checklist

Do these before a Play listing. This proof of concept did not do them, and this app is not in the store.

- Capture the banner (320×180) and screenshots on a real Android TV or Google TV. Replace the placeholder banner. Do not upload art that was drawn for this proof of concept as if it were the game.
- Build a signed release app bundle from a release keystore. Confirm the release variant still cancels SSL errors and blocks cleartext.
- The default `TV_START_URL` is `https://playfitclub.com`.
- Host Socket.IO on a long-lived process. Do not put it on a Vercel serverless function. Production uses `NEXT_PUBLIC_REALTIME_URL` as its own origin.
- `/dev/fitrunner-v2` returns 404 when `NODE_ENV` is production.
- Play Console: Leanback launcher, landscape, touchscreen not required, no camera permission, TV banner, feature graphic, data safety, content rating, privacy policy.
- Exercise D-pad, Back, loading, and certificate failure on hardware.

## Known limits

- Android TV WebView WebGL is device-dependent. Some devices expose no GPU to the WebView, or only a slow software path. This project does not change the phone renderer and does not claim a frame rate.
- No television, Play certification, input latency, or pose-to-screen latency was measured here.
- The default URL is `https://playfitclub.com`. The television app does not open localhost.
- The phone is the normal browser. This repository does not add a phone app.
- The dev FitRunner route is not a production route.
- The placeholder banner is labeled PLACEHOLDER in the image.
