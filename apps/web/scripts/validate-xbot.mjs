import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const glbPath = path.resolve(here, "../public/assets/fitrunner/xbot.glb");
const bytes = fs.readFileSync(glbPath);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

const loader = new GLTFLoader();
const gltf = await new Promise((resolve, reject) => {
  loader.parse(arrayBuffer, "", resolve, reject);
});

const meshes = [];
const skinned = [];
const names = [];
gltf.scene.traverse((object) => {
  names.push(`${object.type}:${object.name}`);
  if (object.isMesh) meshes.push(object);
  if (object.isSkinnedMesh) skinned.push(object);
});

const box = new THREE.Box3().setFromObject(gltf.scene);
const size = box.getSize(new THREE.Vector3());
const clips = gltf.animations.map((clip) => ({
  name: clip.name,
  duration: Number(clip.duration.toFixed(4)),
  tracks: clip.tracks.length,
}));

const skeleton = skinned[0]?.skeleton;
const jointNames = skeleton ? skeleton.bones.map((bone) => bone.name) : [];
const report = {
  file: glbPath,
  bytes: bytes.length,
  meshCount: meshes.length,
  skinnedMeshCount: skinned.length,
  meshNames: meshes.map((mesh) => mesh.name),
  skeletonCount: new Set(skinned.map((mesh) => mesh.skeleton)).size,
  boneCount: jointNames.length,
  hasBetaJoints: names.some((name) => /beta_joints/i.test(name)) || jointNames.some((name) => /beta_joints/i.test(name)),
  hasTake001: clips.some((clip) => /take 001/i.test(clip.name)),
  heightY: Number(size.y.toFixed(4)),
  size: {
    x: Number(size.x.toFixed(4)),
    y: Number(size.y.toFixed(4)),
    z: Number(size.z.toFixed(4)),
  },
  clips,
  materials: meshes.flatMap((mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])).map((material) => ({
    name: material?.name ?? "",
    map: Boolean(material?.map),
    color: material?.color ? `#${material.color.getHexString()}` : null,
  })),
};

console.log(JSON.stringify(report, null, 2));

const expected = {
  Run: 0.7,
  JumpUp: 0.833,
  ForwardRoll: 1.167,
  LongJump: 2.867,
  StandUp: 3.933,
  WipeSweat: 2.633,
};
const problems = [];
if (report.skinnedMeshCount !== 1) problems.push(`skinned meshes ${report.skinnedMeshCount}`);
if (report.meshCount !== 1) problems.push(`meshes ${report.meshCount}`);
if (report.skeletonCount !== 1) problems.push(`skeletons ${report.skeletonCount}`);
if (report.boneCount !== 65) problems.push(`bones ${report.boneCount}`);
if (report.hasBetaJoints) problems.push("Beta_Joints present");
if (report.hasTake001) problems.push("Take 001 present");
if (report.heightY < 1.7 || report.heightY > 1.95) problems.push(`height ${report.heightY}`);
for (const [name, duration] of Object.entries(expected)) {
  const clip = clips.find((item) => item.name === name);
  if (!clip) problems.push(`missing ${name}`);
  else if (Math.abs(clip.duration - duration) > 0.02) problems.push(`${name} duration ${clip.duration} != ${duration}`);
}
if (clips.length !== 6) problems.push(`clip count ${clips.length}`);
if (problems.length) {
  console.error("VALIDATION_FAIL", problems.join("; "));
  process.exit(1);
}
console.log("VALIDATION_OK");
