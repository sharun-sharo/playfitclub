/**
 * Rebuild xbot.glb so the skeleton stays connected.
 *
 * The previous export left Mixamo hips translations in centimeter bone space
 * under a 0.01 armature scale (float32 skinning tears the mesh) and cancelled
 * JumpUp / ForwardRoll hip travel, so those clips rotate around a fixed waist.
 * This restores hip translation from the Mixamo FBX files, bakes the armature
 * into a meter-scale Y-up rest pose, and writes the six original clips back.
 *
 * Safe to re-run: if ForwardRoll hips already travel more than a meter, it exits.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

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
const glbPath = path.join(root, "apps/web/public/assets/fitrunner/xbot.glb");
const CLIP_FILES = {
  Run: "game/Running.fbx",
  JumpUp: "game/Jumping Up.fbx",
  ForwardRoll: "game/Sprinting Forward Roll.fbx",
  LongJump: "game/Jumping.fbx",
  StandUp: "game/Standing Up.fbx",
  WipeSweat: "game/Wiping Sweat.fbx",
};

function parseGlb(file) {
  const buf = fs.readFileSync(file);
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", resolve, reject);
  });
}

function loadFbxClip(file) {
  const buf = fs.readFileSync(path.join(root, file));
  const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
  const clip = obj.animations.find((animation) => animation.name.includes("mixamo.com"));
  if (!clip) throw new Error(`No mixamo.com clip in ${file}`);
  return clip;
}

function sampleVec(track, time) {
  const times = track.times;
  let index = 0;
  while (index < times.length - 1 && times[index + 1] < time - 1e-5) index += 1;
  const next = Math.min(index + 1, times.length - 1);
  const span = times[next] - times[index];
  const weight = span === 0 ? 0 : THREE.MathUtils.clamp((time - times[index]) / span, 0, 1);
  const size = track.getValueSize();
  const out = new Float32Array(size);
  for (let channel = 0; channel < size; channel += 1) {
    out[channel] = track.values[index * size + channel] * (1 - weight) + track.values[next * size + channel] * weight;
  }
  return out;
}

function desiredWorld(bone) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  bone.matrixWorld.decompose(position, quaternion, scale);
  return { position, quaternion };
}

function localFromParents(worlds, bone) {
  const self = worlds.get(bone.name);
  const matrix = new THREE.Matrix4().compose(self.position, self.quaternion, new THREE.Vector3(1, 1, 1));
  if (bone.parent?.isBone) {
    const parent = worlds.get(bone.parent.name);
    const parentMatrix = new THREE.Matrix4().compose(parent.position, parent.quaternion, new THREE.Vector3(1, 1, 1));
    matrix.premultiply(parentMatrix.invert());
  }
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, quaternion };
}

const source = await parseGlb(glbPath);
const existingRoll = source.animations.find((clip) => clip.name === "ForwardRoll");
const existingHips = existingRoll?.tracks.find((track) => track.name === "mixamorigHips.position");
if (existingHips) {
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < existingHips.times.length; index += 1) {
    const value = existingHips.values[index * 3 + 2];
    minZ = Math.min(minZ, value);
    maxZ = Math.max(maxZ, value);
  }
  if (maxZ - minZ > 1) {
    console.log(`Already baked (ForwardRoll hips Z span ${(maxZ - minZ).toFixed(2)} m).`);
    process.exit(0);
  }
}

const fbxHips = {};
for (const [name, file] of Object.entries(CLIP_FILES)) {
  const clip = loadFbxClip(file);
  fbxHips[name] = clip.tracks.find((track) => track.name === "mixamorigHips.position");
  if (!fbxHips[name]) throw new Error(`${name} FBX has no hips position track`);
}

for (const clip of source.animations) {
  const track = clip.tracks.find((item) => item.name === "mixamorigHips.position");
  const src = fbxHips[clip.name];
  if (!track || !src) throw new Error(`Missing hips track for ${clip.name}`);
  for (let index = 0; index < track.times.length; index += 1) {
    const sample = sampleVec(src, track.times[index]);
    track.values[index * 3] = sample[0];
    track.values[index * 3 + 1] = sample[2];
    track.values[index * 3 + 2] = -sample[1];
  }
}

const model = source.scene;
const mesh = model.getObjectByName("Beta_Surface");
const armature = model.getObjectByName("Armature");
if (!mesh?.isSkinnedMesh || !armature) throw new Error("Expected Armature and Beta_Surface.");
const bones = [];
model.traverse((object) => {
  if (object.isBone) bones.push(object);
});

model.updateMatrixWorld(true);
const restWorlds = new Map(bones.map((bone) => [bone.name, desiredWorld(bone)]));
const restLocal = new Map(bones.map((bone) => [bone.name, localFromParents(restWorlds, bone)]));

const baked = [];
for (const clip of source.animations) {
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.play();
  const times = clip.tracks.find((track) => track.name === "mixamorigHips.position").times;
  const positions = new Map(bones.map((bone) => [bone.name, []]));
  const quaternions = new Map(bones.map((bone) => [bone.name, []]));
  for (let index = 0; index < times.length; index += 1) {
    mixer.setTime(times[index]);
    model.updateMatrixWorld(true);
    const worlds = new Map(bones.map((bone) => [bone.name, desiredWorld(bone)]));
    for (const bone of bones) {
      const local = localFromParents(worlds, bone);
      positions.get(bone.name).push(local.position.x, local.position.y, local.position.z);
      quaternions.get(bone.name).push(local.quaternion.x, local.quaternion.y, local.quaternion.z, local.quaternion.w);
    }
  }
  mixer.stopAllAction();
  const tracks = [];
  for (const bone of bones) {
    tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.position`, times, new Float32Array(positions.get(bone.name))));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, new Float32Array(quaternions.get(bone.name))));
  }
  baked.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  console.log(`baked ${clip.name} ${clip.duration.toFixed(3)}s ${times.length} keys`);
}

armature.position.set(0, 0, 0);
armature.quaternion.identity();
armature.scale.set(1, 1, 1);
armature.updateMatrix();
for (const bone of bones) {
  const rest = restLocal.get(bone.name);
  bone.position.copy(rest.position);
  bone.quaternion.copy(rest.quaternion);
  bone.scale.set(1, 1, 1);
}
model.updateMatrixWorld(true);
mesh.bindMatrix.identity();
mesh.bindMatrixInverse.identity();
mesh.skeleton.calculateInverses();

const exporter = new GLTFExporter();
const arrayBuffer = await exporter.parseAsync(model, { binary: true, animations: baked });
const outPath = path.join(root, "tmp/fitrunner-v2-visual/xbot.baked.glb");
fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
console.log(`wrote ${outPath} ${fs.statSync(outPath).size} bytes`);
