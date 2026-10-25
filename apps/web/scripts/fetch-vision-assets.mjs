import { createRequire } from "node:module";
import { cpSync, mkdirSync, createWriteStream, existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const visionEntry = require.resolve("@mediapipe/tasks-vision");
const wasmSource = resolve(dirname(visionEntry), "wasm");
const publicDir = resolve(here, "../public/mediapipe");
const wasmTarget = resolve(publicDir, "wasm");
const modelTarget = resolve(publicDir, "pose_landmarker_lite.task");
const modelUrl = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

mkdirSync(wasmTarget, { recursive: true });
cpSync(wasmSource, wasmTarget, { recursive: true });
if (!existsSync(modelTarget)) {
  const response = await fetch(modelUrl);
  if (!response.ok || !response.body) throw new Error(`Could not download the pose model (${response.status})`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(modelTarget));
}
console.log(JSON.stringify({ level: "info", message: "Vision assets ready", wasmTarget, modelTarget }));
