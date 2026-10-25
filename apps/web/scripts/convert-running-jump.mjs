/**
 * Turn game/Running Jump.fbx into the GLB clip FitRunner plays on a jump.
 *
 * The web loader is GLTFLoader. Mixamo ships this clip in centimeters with
 * root translation (hips rise ~0.72 m and travel ~4.45 m forward). The baked
 * runner is a meter-scale Mixamo skeleton, so positions are scaled by 0.01
 * and the hips translation is pinned to the first key. The ballistic arc is
 * the only vertical travel. Quaternion tracks copy straight across: the rest
 * pose matches pulse-robot.glb and xbot.glb.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null;
      this.onloadend = null;
    }
    readAsArrayBuffer(blob) {
      queueMicrotask(async () => {
        this.result = await blob.arrayBuffer();
        this.onloadend?.();
      });
    }
  };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fbxPath = path.join(root, "game/Running Jump.fbx");
const skeletonPath = path.join(root, "apps/web/public/assets/fitrunner/pulse-robot.glb");
const outPath = path.join(root, "apps/web/public/assets/fitrunner/running-jump.glb");

function fileBytes(file) {
  const buf = fs.readFileSync(file);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function parseGlb(file) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(fileBytes(file), "", resolve, reject);
  });
}

function span(values, stride, channel) {
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < values.length; index += stride) {
    const value = values[index + channel];
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return max - min;
}

const fbx = new FBXLoader().parse(fileBytes(fbxPath), "");
const source = fbx.animations.find((clip) => clip.tracks.some((track) => track.name === "mixamorigHips.position"));
if (!source) throw new Error("Running Jump.fbx has no hips clip.");

const tracks = [];
for (const track of source.tracks) {
  if (track.name.endsWith(".quaternion")) {
    tracks.push(track.clone());
    continue;
  }
  if (track.name !== "mixamorigHips.position") continue;
  const values = new Float32Array(track.values.length);
  const originX = track.values[0] * 0.01;
  const originY = track.values[1] * 0.01;
  const originZ = track.values[2] * 0.01;
  for (let index = 0; index < track.times.length; index += 1) {
    values[index * 3] = originX;
    values[index * 3 + 1] = originY;
    values[index * 3 + 2] = originZ;
  }
  tracks.push(new THREE.VectorKeyframeTrack(track.name, track.times.slice(), values));
}
if (!tracks.some((track) => track.name === "mixamorigHips.position")) {
  throw new Error("Running Jump clip is missing mixamorigHips.position.");
}

const clip = new THREE.AnimationClip("RunningJump", source.duration, tracks);
const hips = clip.tracks.find((track) => track.name === "mixamorigHips.position");
const motion = Math.max(span(hips.values, 3, 0), span(hips.values, 3, 1), span(hips.values, 3, 2));
if (motion > 0.001) throw new Error(`Root translation remains (${motion} m).`);

const skeleton = await parseGlb(skeletonPath);
const scene = skeleton.scene.clone(true);
const meshes = [];
scene.traverse((object) => {
  if (object.isMesh) meshes.push(object);
});
for (const mesh of meshes) mesh.removeFromParent();

const exporter = new GLTFExporter();
const arrayBuffer = await exporter.parseAsync(scene, { binary: true, animations: [clip] });
fs.writeFileSync(outPath, Buffer.from(arrayBuffer));

const written = await parseGlb(outPath);
const saved = written.animations.find((item) => item.name === "RunningJump");
if (!saved) throw new Error(`Exported clips: ${written.animations.map((item) => item.name).join(", ") || "none"}.`);
const savedHips = saved.tracks.find((track) => track.name === "mixamorigHips.position");
if (!savedHips) throw new Error("Exported clip has no hips position track.");
const savedMotion = Math.max(span(savedHips.values, 3, 0), span(savedHips.values, 3, 1), span(savedHips.values, 3, 2));
if (savedMotion > 0.001) throw new Error(`Exported root translation remains (${savedMotion} m).`);

const mixer = new THREE.AnimationMixer(skeleton.scene);
mixer.clipAction(saved).play();
mixer.setTime(0.3);
skeleton.scene.updateMatrixWorld(true);
const foot = skeleton.scene.getObjectByName("mixamorigLeftFoot");
if (!foot) throw new Error("Skeleton is missing mixamorigLeftFoot.");

console.log(
  `wrote ${path.relative(root, outPath)} ${fs.statSync(outPath).size} bytes, ${saved.duration.toFixed(3)}s, ${saved.tracks.length} tracks, root span ${savedMotion.toExponential(2)} m`,
);
