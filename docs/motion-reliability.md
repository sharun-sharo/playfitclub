# FitRunner motion reliability

Audit of the live pipeline, then the changes that follow from it. This document does not claim the phone path is fixed, and it does not claim a phone will pass the checklist below. No phone was used. The timings below are synthetic 30fps landmark sequences, not on-device latency.

## Front-camera jump and squat: image leg length

The depth-unit change did not work on the phone. The user tried again after it and jump and squat still did not fire. No phone was used for this pass either. The numbers below come from calling `alignLandmarkDepth` and `classifyPose` the way `pose-estimator.ts` does, on stacked front-camera landmarks. They are not a device log.

What the estimator actually feeds the classifier:

- `landmarks.x` is a fraction of image width. `landmarks.y` is a fraction of image height.
- `landmarks.z` is depth on the image-width scale. Smaller means closer to the camera. It is not meters. Sample magnitudes in the MediaPipe types are about 0.07–0.13, and a small offset is about 0.02.
- `worldLandmarks` are meters, hip midpoint at the origin, same z sign (smaller is closer). The estimator passes them into `alignLandmarkDepth` when the array is present. When it is missing, normalized z is multiplied by image width / image height. On a 720×1280 frame that factor is 0.5625, so a z of −0.02 becomes about −0.011 of image height.

Measured on the same stacked squat image, before image leg length was used. The squat gate is a knee angle under 156°. Jump prep needs 12° of flexion from the standing knee.

| Depth fed in | Knee angle | Knee flex | Shin flex | Squat gate | Jump prep |
| --- | --- | --- | --- | --- | --- |
| z = 0 | 175.1° | 2.0° | 4.9° | fail | fail |
| world missing, normalized z −0.02, then ×0.5625 | 163.6° | 13.6° | 9.0° | fail | pass |
| world knee 0.05 m toward the camera | 157.3° | 19.8° | 11.8° | fail | pass |
| world knee 0.05 m with the sign flipped | 159.1° | 18.0° | 8.8° | fail | pass |
| world knee 0.18 m (the previous synthetic fixture) | 121.3° | 55.8° | 26.5° | pass | pass |

The previous fixture passed because it used 0.18 m of knee depth. A 0.05 m world knee, which is a modest bend on this scale, stays at 157.3° and never enters. Flipping the sign does not rescue it. A missing world array makes the small normalized z even smaller. The scaler does not produce NaN: a world torso under 0.05 m skips the meter scale and uses the normalized fallback. Jump speed is still image y over the torso, not z. On the small hop below it peaks at **1.95 torso-lengths per second**, so `jumpRise` stays **0.32**.

The flight path still wants straight knees, hips near baseline, and ankle rise on the speed frame. A small hop's fast frame happens while the knees are still bent, and a frame in between can drop the dip before the speed crosses 0.32. That is why a real dip-then-rise emitted nothing once the knee gate had failed, and could still miss if the dip was cleared early.

The classifier now also compares the image length of the thigh and shin with the lengths saved at calibration. The first 8% of shortening is ignored. A front squat shortens both segments even when z is ~0, so the knee reads about **108°** and the shin about **26°**. One squat is emitted at **363 ms** (the 200 ms hold after the hips cross 0.16 torso, plus smoothing). Standing up emits no jump. The same sequence emits with world landmarks missing, with a 0.05 m world knee, and with that z sign flipped. A forward bend, which shortens the torso and not the legs, emits nothing.

A small hop on the missing-world stream, knees still bent on the fast frame, peaks at 1.95 torso/s and emits one jump at **297 ms**. The second hop is the next scripted dip and emits at **891 ms**. Both ids differ. No squat is emitted. An armed dip is kept until that rise or until the body is quiet, so the speed frame does not also have to show straight knees. `jumpRise` was not lowered.

The send path was checked and not changed. The phone emits `movementType` `"jump"` or `"squat"` only when `gameplaySendAllowed` is true (`phase === "running"`, ready, not paused). That is the same gate as a lane change. The server accepts both names and still rejects a duplicate event id. The TV maps `jump` to the ballistic arc and `squat` to the roll when the runner is in the run clip. The arc (takeoff 5.6 m/s, gravity 18, about 0.62 s in the air) was not changed.

What a squat still requires: hips down more than 0.16 torso, a real knee bend (image shortening or depth), shin flexion of at least 8°, planted ankles, and a 200 ms hold.

Still unverified, because no phone was attached: the z values MediaPipe actually returns for this player, whether `worldLandmarks` is missing on that device, and whether knee or ankle visibility falls under 0.45 during the squat. A joint under that floor still drops the frame. A missing landmark still does not invent a command.

## Follow-up: squat, second jump, second lane change

Three failures were reported after an earlier phone try. The causes below were found by replaying indoor frame sequences through the detector. The squat sequence in that pass used a made-up knee depth, and the phone still failed after the world-meter scaler. No phone was used for that replay, and these sequences do not prove the phone will pass.

### 1. Squat never emitted

A front-camera squat drops the hips and bends the knees toward the camera. The image x of the knee stays nearly stacked over the ankle, so the old 2D knee angle stayed at 164° (only 13° of flexion). The adapted enter gate was 156°. The squat never entered the band. Shin flex in that same 2D pose was 8.6°, just over the 8° floor, so the shin gate was not the blocker. The 200ms hold and the 0.16 hip-drop floor were not the blocker either. Because the squat never confirmed, standing back up was read as a dip-then-rise and emitted a jump at 693ms.

Knee angle and shin flex now include landmark depth. On the same sequence the 3D knee angle is 94.9° and shin flex is 38.7°. Hip drop at the bottom is 0.50 torso. Ankle rise stays 0. One squat is emitted at 330ms, which is the 200ms hold after the hips cross 0.16 torso, plus about one smoothed frame. Standing up emits no jump. `jumpRise` was not lowered.

What a squat requires, unchanged except for the depth measurement:

- Hips down more than 0.16 torso.
- Knee angle, including depth, under the adapted gate (156° for this standing pose).
- Shin flexed at least 8° from vertical, including depth, over a planted ankle.
- Ankles not risen (under about 0.04 torso).
- Held 200ms. One squat. The way back up is not a jump.

### 2. The second jump was swallowed

A spaced pair, about 0.8s apart, with a full return to the calibrated stance, already emitted both jumps. Two closer cases did not.

- Quick second dip: the first jump landed, and the next dip started while recovery was still open. Recovery stayed open for the whole dip because calm required the hips to be above the squat-exit line, and a dip is the hips going down. The rise then happened while recovery was still true, so the second jump was not emitted. After the fix, that second jump fires 165ms after the body is grounded again. That 165ms is the scripted dip plus the rise frame, not an extra lock. A grounded player can start the next dip immediately.
- High landing: the body settled 0.012 of the frame above the calibrated ankles. The old latch required the hips within 0.05 torso of baseline, ankle rise under 0.04, and hip velocity under 0.144 on the same frame, so it stayed in `JUMPING` / `WAIT_RESET` and the next rise never armed. After the fix, that landing is grounded and the next scripted jump fires.

`jumpRise` stays 0.32. The synthetic rise moves the hips 0.035 of the frame in 33ms, about 5.3 torso-lengths per second, which is above 0.32. The gate was not lowered. A no-dip hop still needs the flight gates. Standing up from a confirmed squat still does not emit a jump.

### 3. The second lane change waited for the hand to return to the seam

A chest raise, then the hand down at the hip but still slightly outside the calibrated hang, stayed in `WAIT_FOR_RELEASE`. The old halfway release kept any hand whose height was under 1.15 torso and whose outward travel was still above 0.18. A hand at the hip (about 1.05 torso down, travel still above 0.18) never released, so the next raise was the same hold and sent nothing. Overhead release also treated an arm only 40° up, with a long reach, as still raised. There was no multi-second cooldown in the arm machine. `cooldownMs` is not applied between raises.

Release is now the chest-to-waist band itself (height above 0.95 torso lets go) and outward travel of 0.30, not 0.18. Sideways release is about 50° from hanging. Overhead release stays overhead (100°), so dropping through shoulder height is not still "up" by that path. On the synthetic hip lower, the latch clears within one 33ms frame of the hand reaching the hip. The next raise then emits 132ms after it is back out: the 100ms hold plus one smoothed frame. In the script that leaves the hand at the hip for the rest of a ~200ms lower before raising again, the second command is 297ms after release. That is not a 1s lock. A held arm still sends one command. Both arms together still send nothing.

## Earlier audit

Pipeline that was traced:

Camera frame → MediaPipe landmarks → gesture recognition → gesture event → Socket.IO → server validation → game command → character animation.

## Root causes

Confidence floor 0.6 and visibility floor 0.45 are not the cause. They still reject only weak or missing landmarks. MediaPipe `numPoses` is 1. The selfie mirror is not swapping lanes. Jump speed 0.32 torso-lengths/s was not lowered.

### 1. An arm raise was still too close to a straight, high arm

The first detector required a shoulder-height T-pose: reach at least 0.68 shoulder-widths, the wrist near shoulder height, and an elbow of at least 122°. That was replaced with reach plus elevation plus the same 122° elbow. A hand at waist-to-chest height, with a bent elbow and an outward move, still failed that conjunction. A locked straight arm or a hand above the head was not supposed to be required, and it no longer is.

### 2. A jump had to satisfy four gates on the velocity frame

`jumpRise` of 0.32 torso-lengths/s is still the rule. The old bug was requiring straight knees, hips already back at the baseline, and ankle rise on the same frame as the speed peak. The temporal machine (grounded, preparing, takeoff, airborne, landing, recovery) remains. This pass did not find a later drop: `pushPose` emits one jump id, the phone sends that id once, `shouldRetryMovement` is always false, and the server rejects a repeated event id. FitRunner, scoring, and obstacles were not changed. A command that arrives while the runner cannot take it still expires after 400ms and is not resent.

### 3. Ready and calibration demanded a centered standing box

`classifyRaw` rejected a fully visible body whose torso was more than 0.08 of the frame away from the center during setup, or 0.18 during play. It also required a nose-to-ankle span of 65–85% before calibration. `assessFraming` required the shoulders in the top half of the image and the ankles below y = 0.68. A person standing in the left or right third, with head, shoulders, hips, knees, and ankles inside the image, was not allowed to become ready. The phone also drew a fixed human outline (`drawGuide`) and placed the camera in a `max-w-md` column under a header and a footer, so the preview was a small rectangle.

### 4. What was already sound

- Tracking loss returns no event.
- Both arms that qualify in one window reject both.
- One latched arm or jump does not repeat until release.
- Keyboard play is labeled keyboard and does not grant fitness XP.
- Pose stays on the phone. Frames are not uploaded.
- The game applies `lean_left` as lane −1 and `lean_right` as lane +1. Jump plays `JumpUp`. Squat plays `ForwardRoll`.
- Local Socket.IO stays on `https://localhost:3000`, which proxies `/socket.io`. TLS was not disabled.

## What changed

The camera stage on `/join/[sessionCode]` is the visible viewport (`fixed inset-0`, `h-dvh`, `w-dvw`, safe-area insets on the floating text). There is no site nav and no layout footer. The video and the skeleton canvas share one box from `containFrame`, so a landscape stream is letterboxed and not stretched. Feet are not cropped to fill the screen. The skeleton is the detected landmarks in that box: each joint is `landmark * canvas size`, and the selfie CSS mirror flips the video and the canvas together. There is no fixed outline and no Guide button.

Lane changes are two gestures per side, measured from the shoulders, elbows, wrists, and hips, in shoulder-widths and torso-lengths, against the session neutral pose.

- Halfway: the wrist is between chest and waist (0.28–0.95 torso below the shoulder) and has moved outward from the calibrated hang by at least 0.42 shoulder-widths. The elbow only has to clear 70°, so a bent arm counts. The wrist does not have to rise above the shoulder.
- Sideways: elevation from hanging is about horizontal (62–120°), shoulder-to-wrist reach is at least 0.9 shoulder-widths, and the elbow clears 100°. That is an extended point with a soft elbow. The stored 122° elbow gate is not this check.
- A hand above the head can still count. It is not required.

Arm state is NEUTRAL → ARM_RISING → TRIGGERED → WAIT_FOR_RELEASE → NEUTRAL. Confirmation is 100ms. Release uses the lower outward and reach gates. One lane change per raise. A hold does not repeat. Lowering resets. Both arms in one window send nothing. A running pump in front of the body, and a walk across the frame, do not change lanes. Jump and squat still suppress an arm raise.

Jump and squat stay body-relative. Squat hold is 200ms. A squat does not emit a jump. `jumpRise` stays 0.32.

Framing is ready when the head, shoulders, hips, knees, and ankles are visible inside the image. Center tolerance, the 65–85% size band, the wrist inset, and the fixed shoulder and ankle screen lines are gone. A joint on the image edge can still ask for a step, a tilt, or more room for the feet. Missing landmarks do not invent a gesture. If the landmarker actually returns a second pose, gestures pause and the phone says "One person at a time." `numPoses` stays 1. The phone does not switch to the other body.

The neutral pose updates slowly (`neutralDrift` 0.02) only while the player is quiet and standing. A jump, a squat, or an arm raise freezes it. Walking across the frame does not clear calibration or restart it.

Status copy is "Looking for player...", then "Player detected", then "Motion tracking active". Hands-free start is unchanged in structure: camera on, one person, confidence at least 0.6, a neutral baseline, two seconds stable, then the server's 3-second countdown. There is no Start button and no "stand in the box."

Development builds keep Diagnostics, including LEFT READY, LEFT DETECTED, RIGHT READY, RIGHT DETECTED, WAITING FOR ARM RELEASE, wrist height, outward displacement, confidence, and the accept or reject reason. Gesture detected, command sent, command accepted, and command executed stay on separate phone, server, and TV clocks. Production hides that button.

## Measured limits

From synthetic landmarks only. Not from a phone.

| Gate | Value | Meaning |
| --- | --- | --- |
| Visibility floor | 0.45 | Unchanged. |
| Confidence floor | 0.6 | Unchanged. |
| Halfway outward enter / exit | 0.42 / 0.30 shoulder-widths | Travel from the calibrated hang. A hand back near the hip releases. Not a screen X. |
| Halfway height | 0.28–0.95 torso below the shoulder | Chest to waist. Dropping below the waist releases. Above the shoulder is not required. |
| Halfway elbow | 70° | Bent arm. The old 122° gate is not used here. |
| Sideways elevation | 62–120° from hanging | About horizontal. Not overhead. |
| Sideways reach enter / exit | 0.9 / 0.72 shoulder-widths | Extended. A short poke does not count. |
| Sideways elbow | 100° enter, 85° while held | Soft elbow. Not a locked straight arm. |
| Arm hold | 100ms | Unchanged. |
| Jump velocity | 0.32 torso-lengths/s | Unchanged. The synthetic dip-then-rise reached about 5.3 torso-lengths/s. |
| Squat hold | 200ms | Unchanged. Knee and shin angles now include depth. A squat is not a jump. |
| Neutral drift | 0.02 per quiet frame | Frozen during a jump, squat, or arm raise. |
| Command stale window | 400ms | Unchanged. Not retried. |
| Pose count | 1 | A second returned pose pauses. It is not tracked. |

Smoothing alpha stays 0.78. On a 33ms synthetic frame, an arm just past the sideways reach line was emitted 165ms after the pose stepped. That number is the smoother in the unit test, not a phone round trip.

The same squat, two-jump, and re-raise sequences were run with the body in the left third, the center, and the right third. The event counts matched.

`vitest` on the movement, indoor-sequence, session-calibration, phone-command, and framing files: 104 passed, 0 failed. No phone was attached. This does not mean the phone will pass.

## Play Again and pause

The first run can detect squat and jump. After game over, Play Again does not reload the phone, and pause does not reload it either. A fresh page load creates a new detector, which is why the first run worked. Two pieces of state were still the previous run's:

- The phone movement machine. After a jump, `jump.phase` stays `CONFIRMED`, `SENT`, or `WAIT_RESET` and `jumpMotion` stays airborne until the feet are back on the floor. The machine returns before it will arm another squat or jump. A lane change is ignored for that same stretch. A latched squat and an armed dip stay set too. Play Again and pause used to leave all of that in place.
- The TV body. `motion` stays `jump`, `fall`, or `roll`, and the jump arc stays active. Pause stops the course clock before that arc can finish, so the body never returns to the run clip. Jump and squat are accepted only while the clip is the run. A lane change does not check the clip, so left and right still move. A jump or squat that was waiting in the buffer could play when the clip returned to the run.

Play Again, the start of a pause, and the return to running now reset the phone to standing ready: grounded, squat not latched, jump not armed, neutral free to drift. The calibrated stance and the event sequence stay. Hip history is cleared, so the pose already in frame is not a new jump. Pause and resume also put the course body on the ground in the run clip and drop a waiting jump or squat. Play Again already builds a new course, and that course starts from the same grounded run. `jumpRise` is still 0.32. A pause snapshot is sent immediately, so a movement in the same moment cannot hide the pause. This pass: movement 62, indoor sequences 9, course body 1, realtime sessions 13, all passed. No phone was used.

## Phone checklist

Run this on a phone against the TV. A green unit test is not a pass. No phone was used to write this list, and nothing here claims the phone will pass.

- First run: squat, jump, left, right work.
- Game over, Play Again, do not reload the phone: squat and jump work again.
- Pause, wait, resume: squat and jump work again.

## Remaining limits

- One pose only. A second returned pose pauses the controller. It is not identified or followed.
- Jump height is a monocular image estimate. The camera cannot prove both feet left the floor.
- No phone was used here, so recognition rate and end-to-end latency are unknown. The 165ms figure above is only the synthetic smoother.
- A lane command at the outer lane does not move the runner farther.
- A jump or duck that arrives while the clip is still playing waits at most 400ms, then it is dropped and not retried.
- Event-id memory lives in the realtime process. A server restart forgets it.
- Session samples and the drifting neutral pose are wiped on recalibrate, leave, or reload. They are not a user profile.
- This pass did not open the camera in a browser. The local HTTPS certificate was not accepted by the browser tool. The join HTML from the running dev server is a full-viewport page with no site nav.
