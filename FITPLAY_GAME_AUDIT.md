# FitPlay game audit (Phase 1)

Audit only. Nothing in the game was rewritten. Unreal Engine 5 is not the next step.

## 1. What this project is

FitPlay is a browser fitness arcade. A TV or laptop runs the game. A phone joins that session and is the controller.

| Piece | What is in the repo |
| --- | --- |
| Web app | Next.js 16, React 19, TypeScript, Tailwind 4. Play is `/play`. Phone join is `/join/[sessionCode]`. |
| Playfield | Three.js (`three` 0.170) in `apps/web/src/game/fitrunner-scene.ts`, mounted by `FitRunnerStage`. |
| Rules | `@fitplay/game`. The realtime server owns the FitRunner state and the score. Clients cannot submit a score total. |
| Phone pose | MediaPipe Pose Landmarker in the phone browser (`@mediapipe/tasks-vision`, local files under `apps/web/public/mediapipe`). Frames stay on the phone. |
| Commands | The phone sends `movement:event`: `lean_left`, `lean_right`, `jump`, `squat`. Punch and hold are recognized and ignored by FitRunner. Squat becomes a slide. |
| Keyboard | Labeled TV fallback, not body tracking. Player 1: arrows and space. Player 2: A, D, S, W. |
| Two players | One lobby, max 2. Each person uses their own phone. Both share one obstacle seed and race the score. |
| Sockets | Standalone Socket.IO service (`apps/realtime`) at 30 Hz. It checks membership, rate-limits, and drops duplicate events. |

Browser play is a product requirement. The screen is a normal browser page. The phone is a normal browser page. There is no native client.

`README.md` and `apps/web/package.json` still list Phaser 3.90. No source file imports Phaser. The playfield is Three.js.

Accounts, gyms, leaderboards, and results sit beside the game (Prisma / PostgreSQL). They are not the look problem.

## 2. What the running game actually draws

### Character

The loaded player is `apps/web/public/models/jogger.glb` (`fitrunner-assets.ts`).

- Source comment in code: Innerscene / MakeHuman, CC0. The file’s glTF generator is Blender’s glTF exporter. The file has no copyright field.
- Verified clips in the file: **Jog only**.
- Code already lists missing clips: Idle, Jump, Land, Slide, Turn, Hit, GameOver.
- Jump is a sine lift (about 1.05 units over 0.7 s). Slide squashes the model on Y and tilts it. Those are not animation clips.
- If the GLB fails to load, a capsule-and-sphere `RunnerMesh` is the fallback. That mesh is also procedural.

`apps/web/public/models/runner.glb` is a different character (FBX2glTF). Clips inside it: Death, Idle, Jump, Jump2, PickUp, Punch, Running, SitIdle, Sitting, Walking. No Slide, Land, or Hit. No license comment in the repo. The scene does not load it.

### Environment

The street the player sees is generated in `roadChunk`: canvas plank lanes, box shops, cylinder palms, lamps, planters, and cone umbrellas. Eight chunks scroll with distance. Hills and clouds are scaled spheres. There is no mesh collision with buildings.

These files are on disk and are **not** loaded by the scene:

- Houses: `house-a.glb`, `house-c.glb`, `house-e.glb`, `house-l.glb`
- Shops: `shop-a.glb`, `shop-c.glb`, `shop-e.glb`, `shop-h.glb`
- `tram/tram.glb`, `palm.glb`, `palm-tall.glb`, `bush.glb`, `bench.glb`
- Street art JPGs under `apps/web/public/art/` (`facade-*`, `palm-art`, `runner-art`, `tram-art`, `crate-art`)
- Marketing still: `apps/web/public/marketing/fitness-player-hero.jpg` (site image; the homepage says it is not a gameplay capture)

glTF node names on the unused low-poly models match Kenney City Kit object names (`building-type-a`, `building-a`, `tree_palmTall`, `plant_bushLarge`, `train-tram-modern`, `bench`). There is no LICENSE file and no source comment attributing them. Do not treat that license as verified from this repo. `loadStreetArt`, `dressChunks`, and `swapTrain` exist and are never called. A procedural tram is built and then forced invisible.

### Surfaces

`fitrunner-assets.ts` points at ambientCG, CC0 maps:

- `textures/asphalt-color.jpg`, `asphalt-normal.jpg`, `asphalt-rough.jpg`
- `textures/concrete-color.jpg`, `concrete-normal.jpg`
- `textures/wood-color.jpg`, `textures/wood-rough.jpg`

`surfaceMaterial()` would load them. Nothing calls it. The visible road uses a canvas plank texture.

### Camera and light

Chase camera: FOV 44, height 3.6, behind the runner at z 8, looking toward z -10. A small bob and a hit shake. Hemisphere plus one directional light, optional soft shadows. Keys 1–6 switch day/golden/night and quality. Those are debug hooks, not the product UI.

### Collisions and scoring

Rules live on the server, not in Three.js.

- Three lanes. Obstacles: `barrier` (must change lane), `low` (jump), `high` (slide).
- A hit is lane equality when the obstacle’s z crosses 0. It is not a mesh intersection.
- Coins: 10 points. Clean dodge: 25. Combo multiplier grows by 0.25 per streak, capped at 4.
- 3 lives, 1.35 s invulnerability, default round 180 s. Speed starts at 11 and rises toward 24.
- Two runners share the pattern. The view offsets them by ±0.28 so they do not occupy the same pixels.

## 3. Keep this

- Browser TV page, QR join code, phone page, and the Socket.IO session.
- Local MediaPipe. Do not upload camera frames.
- Server-owned rules, score, lives, seed, and two-player race.
- Keyboard fallback, labeled as a test control.
- Lean / jump / squat mapping. Punch and hold stay ignored for FitRunner.
- The lane-and-z rules. A prettier city must not move collision into the renderer.

## 4. Five problems, in order

1. **The city on screen is still simple generated geometry.** Shops, palms, lanes, and hills are boxes, cylinders, cones, and canvas textures. A coherent city kit is not what the player sees.
2. **Animation coverage on the loaded character is incomplete.** `jogger.glb` has one verified clip, Jog. Jump and slide are procedural. Idle, Land, Slide, and Hit are not in that file.
3. **The recording that looks right is Subway Surfers.** That game is not a FitPlay asset and must not be copied: not models, textures, UI, code, or level layout. Matching it by porting it is the wrong fix.
4. **Files under `public` are not the running scene.** Unused house, shop, tram, palm, bush, and bench GLBs, unused street-art JPGs, an unused second runner, and unused ambientCG loaders. `runner.glb` is not a drop-in replacement: no license note here, and it still has no Slide, Land, or Hit clip.
5. **Camera, obstacles, and coins are still a prototype.** The camera is a fixed chase shot. Barriers, bars, crates, coins, and bottles are primitive meshes. Polish on top of the current street will not make a coherent city.

## 5. Implementation order (stay in this web codebase)

Unreal Engine 5 is a poor replacement right now. This product is a browser game with QR pairing and a MediaPipe phone bridge that already talks to server rules. An Unreal third-person template would drop that loop. Unreal can be a later native client. It is not Phase 1, and it is not the next art pass.

Do the next work inside Next.js + Three.js + `@fitplay/game` + the existing phone socket:

1. **One coherent licensed city kit**, loaded by the current scene, one visual style. Keep server lanes and z. The Kenney-like GLBs on disk are unused and are not that kit until a license is on file and the scene actually uses one set. Do not pretend they are already the city.
2. **One rigged human with real clips:** Idle, Run, Jump, Land, Slide, Hit. Retire the procedural jump lift and slide squash only after those clips play. `jogger.glb` does not contain them. `runner.glb` does not either.
3. **Then camera and play-UI polish** on the same chase view and the existing TV overlay (score, lives, QR, countdown). Do this after the kit and the clips, not before.

Assets named in steps 1 and 2 are **not** already in the running game.

## 6. Non-goals

- No destructive rewrite of the game, the socket protocol, or the server rules.
- No Subway Surfers port, and no Subway Surfers assets or code.
- No Unreal Engine 5 replacement in this phase.
- No new game modes, and no claim that pose tracking measures jump height or exercise quality.
