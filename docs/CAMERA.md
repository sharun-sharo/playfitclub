# Camera and pose tracking

The phone runs MediaPipe Pose Landmarker in VIDEO mode. Frames stay in the browser. FitPlay does not store images, recordings, or biometric templates.

## Permission

The camera starts only after **Turn camera on**. If permission is denied, the page explains how to allow it and offers the TV keyboard fallback.

Switch camera flips between the front and rear cameras when the browser supports `facingMode`. Front-camera coordinates are mirrored so a lean to the player’s left moves the runner left.

## Calibration

Stand so shoulders, hips, knees, and ankles are visible. The page asks you to step back until the full body fits, then hold still. Neutral position is the average of a stable window. Later leans are measured against that center, not the middle of the image.

Tracking pauses its send loop when you leave the session, and the media tracks are stopped.

## Movement rules

| Movement | What the detector looks for |
| --- | --- |
| Lean left / right | Torso center shifts past a threshold relative to the calibrated stance, then must return near neutral |
| Squat | Hip drop and knee flexion, then a return toward standing before another squat counts |
| Jump | A fast rise of the hips and ankles. This is an estimate. A fixed phone camera cannot measure true height |
| Punch | One arm extends and the other stays bent, then the arm must retract |
| Hold | Both arms stay out to the side for the configured duration |

Smoothing, hysteresis, confidence checks, and cooldowns live in `packages/game/src/movement`. Thresholds are in `DEFAULT_THRESHOLDS`.

FitRunner scores lean, squat, and jump. Punch and hold are detected so later games can reuse them. They do not award FitRunner points.

## HTTPS

`getUserMedia` requires a secure context. `http://localhost` works on the same computer. A phone opening `http://192.168.x.x:3000` will usually block the camera.

For a real phone on your LAN, run `npm run dev:phone` from the repository root. That serves both the site and the realtime server with the certificate in `certs/`. A secure page that still talks to `http://` on port 3001 is blocked as mixed content, so both ports use HTTPS.

1. On the phone, open `https://<computer-ip>:3001/health` and accept the certificate warning.
2. Open the TV at `https://<computer-ip>:3000/play` and accept the same warning there.
3. Scan the QR code. The camera button works after both warnings are accepted.

## Manual test

Automated tests do not prove the camera works. On a phone, with the TV lobby open:

1. Scan the QR code.
2. Join with your name and allow the camera only after tapping the button.
3. Step back until the guidance says to hold still, then wait for calibration.
4. Lean left and right and confirm the TV runner changes lanes once per lean, not continuously.
5. Squat once, stand, squat again. Two slides should be possible, not a stuck slide.
6. Jump. Expect some false negatives in dim light or if your feet leave the frame. Record what failed.
7. Cover the camera and confirm the phone says the body is missing and does not fire movements.
8. Leave the session and confirm the camera indicator turns off.
9. Repeat with a second phone. Both scores should appear on the TV.

Do not mark camera tracking verified from the Playwright test. That test uses the keyboard fallback on purpose.
