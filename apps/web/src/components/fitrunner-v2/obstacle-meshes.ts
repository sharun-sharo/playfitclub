import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fitBox, seat } from "./mesh-fit";
import { assignObstacleTheme, type PaintRole } from "./obstacle-themes";
import { fitRunnerTuning as tuning } from "./tuning";

export type ObstacleKind = "rock" | "log" | "fence";

/**
 * Static arcade meshes. The mesh named "hit" is the only collider.
 * Hurdles and gates keep their previous box size. A lane car scales that
 * collider to the visible body. Extra parts are visual. Phone realtime
 * shadows stay off: these meshes do not enable a shadow map. The ground
 * mark is a blob. The lane blocker picture is a shared road-block model.
 */

const hitMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false,
});

let contactShadow: THREE.MeshBasicMaterial | null = null;
let placeholder: THREE.MeshStandardMaterial | null = null;
const boxes = new Map<string, THREE.BoxGeometry>();
const cylinders = new Map<string, THREE.CylinderGeometry>();
const planes = new Map<string, THREE.PlaneGeometry>();
const scratch = new THREE.Object3D();

type Stamp = { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 };
type Bag = Record<"body" | "frame" | "panel" | "accent" | "stripe" | "stripeAlt" | "bolt", Stamp[]>;
type Painted = { role: PaintRole; geometry: THREE.BufferGeometry };
type Template = {
  name: string;
  hit: { geometry: THREE.BufferGeometry; y: number };
  shadow: THREE.BufferGeometry;
  painted: Painted[];
};

const templates = new Map<ObstacleKind, Template>();

export function createObstacle(kind: ObstacleKind) {
  const template = templateFor(kind);
  const group = new THREE.Group();
  group.name = template.name;

  const hit = new THREE.Mesh(template.hit.geometry, hitMaterial);
  hit.name = "hit";
  hit.position.y = template.hit.y;
  hit.visible = false;
  hit.castShadow = false;
  hit.receiveShadow = false;
  group.add(hit);

  const shadow = new THREE.Mesh(template.shadow, shadowMaterial());
  shadow.name = "shadow";
  shadow.position.y = 0.02;
  shadow.rotation.x = -Math.PI / 2;
  shadow.castShadow = false;
  shadow.receiveShadow = false;
  group.add(shadow);

  for (const part of template.painted) {
    const mesh = new THREE.Mesh(part.geometry, placeholderMaterial());
    mesh.name = "visual";
    mesh.userData.paint = part.role;
    mesh.castShadow = part.role === "body";
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  assignObstacleTheme(group);
  if (kind === "rock") mountRoadBlock(group);
  return group;
}

export function createHurdle() {
  return createObstacle("log");
}

export function createGate() {
  return createObstacle("fence");
}

export function createBlocker() {
  return createObstacle("rock");
}

function templateFor(kind: ObstacleKind) {
  const existing = templates.get(kind);
  if (existing) return existing;
  const template = kind === "log" ? buildHurdle() : kind === "fence" ? buildGate() : buildBlocker();
  templates.set(kind, template);
  return template;
}

/** Low striped bar on two feet. Jump reads from the bar, not from a filled gate. */
function buildHurdle(): Template {
  const width = tuning.props.log.x;
  const depth = tuning.props.log.z;
  const centerY = tuning.props.log.y - 0.055;
  const parts = bag();
  for (let index = 0; index < 8; index += 1) {
    const role = index % 2 === 0 ? parts.stripe : parts.stripeAlt;
    put(role, boxGeo(0.2, 0.062, 0.15), -0.7875 + index * 0.225, centerY, 0);
  }
  put(parts.accent, boxGeo(1.92, 0.016, 0.15), 0, 0.392, 0);
  put(parts.frame, boxGeo(1.92, 0.018, 0.15), 0, 0.302, 0);
  for (const side of [-1, 1]) {
    put(parts.frame, boxGeo(0.07, 0.12, depth), side * 1.01, centerY, 0);
    put(parts.body, boxGeo(0.1, 0.28, 0.1), side * 0.86, 0.18, 0);
    put(parts.frame, boxGeo(0.28, 0.045, 0.26), side * 0.86, 0.028, 0);
    put(parts.frame, boxGeo(0.14, 0.04, 0.14), side * 0.86, 0.33, 0);
    put(parts.panel, boxGeo(0.07, 0.14, 0.018), side * 0.86, 0.18, 0.062);
    put(parts.bolt, cylGeo(0.018, 0.014), side * 0.86, 0.24, 0.07, (object) => {
      object.rotation.x = Math.PI / 2;
    });
  }
  for (const z of [0.34, 0.56]) {
    put(parts.stripe, boxGeo(0.28, 0.012, 0.05), -0.12, 0.016, z, (object) => {
      object.rotation.y = 0.6;
    });
    put(parts.stripe, boxGeo(0.28, 0.012, 0.05), 0.12, 0.016, z, (object) => {
      object.rotation.y = -0.6;
    });
  }
  return {
    name: "hurdle",
    hit: { geometry: boxGeo(width, 0.11, depth), y: centerY },
    shadow: planeGeo(1.85, 0.72),
    painted: paint(parts),
  };
}

/** Overhead beam on two posts. The opening under the beam stays empty. */
function buildGate(): Template {
  const width = tuning.props.fence.x;
  const depth = tuning.props.fence.z;
  const centerY = tuning.fenceGap + 0.08;
  const parts = bag();
  for (let index = 0; index < 8; index += 1) {
    const role = index % 2 === 0 ? parts.stripe : parts.stripeAlt;
    put(role, boxGeo(0.2, 0.1, 0.14), -0.78 + index * 0.222, centerY, 0.01);
  }
  put(parts.frame, boxGeo(1.96, 0.028, 0.16), 0, 1.428, 0);
  put(parts.accent, boxGeo(1.84, 0.02, 0.17), 0, 1.292, 0.01);
  put(parts.frame, boxGeo(1.72, 0.055, 0.12), 0, 1.66, 0);
  put(parts.frame, boxGeo(0.16, 0.02, 0.014), -0.05, centerY, 0.1, (object) => {
    object.rotation.z = 0.75;
  });
  put(parts.frame, boxGeo(0.16, 0.02, 0.014), 0.05, centerY, 0.1, (object) => {
    object.rotation.z = -0.75;
  });
  for (const side of [-1, 1]) {
    put(parts.frame, boxGeo(0.09, 0.18, 0.2), side * 0.96, centerY, 0);
    put(parts.body, boxGeo(0.14, 1.7, 0.16), side * 1.04, 0.85, 0);
    put(parts.frame, boxGeo(0.32, 0.05, 0.28), side * 1.04, 0.03, 0);
    put(parts.accent, boxGeo(0.22, 0.07, 0.22), side * 1.04, 1.7, 0);
    put(parts.panel, boxGeo(0.08, 0.72, 0.02), side * 1.04, 0.78, 0.095);
    put(parts.bolt, cylGeo(0.02, 0.016), side * 0.55, centerY, 0.1, (object) => {
      object.rotation.x = Math.PI / 2;
    });
    put(parts.bolt, cylGeo(0.02, 0.016), side * 0.28, centerY, 0.1, (object) => {
      object.rotation.x = Math.PI / 2;
    });
  }
  return {
    name: "gate",
    hit: { geometry: boxGeo(width, 0.16, depth), y: centerY },
    shadow: planeGeo(2.2, 0.8),
    painted: paint(parts),
  };
}

/**
 * Pictures that replace the cargo crate. Shared geometry, cached materials.
 * Each car keeps its shape: wheels on the road, length down the lane.
 * Roof height is a normal car. Width stays inside one lane.
 * The hidden hit mesh is scaled to that visible body.
 * The road-closed sign stays on disk and out of this rotation so it does not
 * take a turn away from the cars.
 */
const SIGN_BLOCK = "road-closed-sign";
const LANE_CARS = ["old-rusty-car", "old-car-vaz-2107", "car-scene", "destroyed-car-07"] as const;

/** Roof of a lane car, in meters. Uniform scale, so the body is not stretched. */
export const LANE_CAR_HEIGHT_M = 1.5;

/**
 * Widest a lane car may be, in meters.
 * Lanes are 3 m apart, so this still clears a step into the next lane.
 */
export const LANE_CAR_MAX_WIDTH_M = 2.05;

export const ROAD_BLOCK_MODELS = LANE_CARS.map((name) => ({
  url: `/assets/fitrunner/road-blocks/${name}.glb`,
  name,
  flip: false,
}));

/**
 * Which car a lane blocker shows. The first one in a run is a car.
 * With four cars loaded, the next blocker is always a different car.
 * Spawn timing does not use this.
 */
export function roadBlockNameForOrdinal(ordinal: number) {
  const index = ((ordinal % LANE_CARS.length) + LANE_CARS.length) % LANE_CARS.length;
  return LANE_CARS[index] ?? LANE_CARS[0];
}

const blockerVisuals: THREE.Object3D[] = [];
const blockerWaiting = new Set<THREE.Group>();
let blockerLoad: Promise<void> | null = null;

/** Lane blocker. The picture is loaded separately and the hit mesh is fit to it. */
function buildBlocker(): Template {
  const width = tuning.props.blocker.x;
  const height = tuning.props.blocker.y;
  const depth = tuning.props.blocker.z;
  return {
    name: "blocker",
    hit: { geometry: boxGeo(width, height, depth), y: height / 2 },
    shadow: planeGeo(width * 0.92, depth * 0.96),
    painted: [],
  };
}

function mountRoadBlock(group: THREE.Group) {
  if (group.userData.roadBlockOrdinal === undefined) group.userData.roadBlockOrdinal = 0;
  if (blockerVisuals.length) {
    mountPicture(group);
    return;
  }
  blockerWaiting.add(group);
  ensureRoadBlocks();
}

/** Swap the picture when this pooled mesh is placed. The pool slot is not the picture. */
export function presentRoadBlock(object: THREE.Object3D, ordinal: number) {
  object.userData.roadBlockOrdinal = ordinal;
  const group = object as THREE.Group;
  if (!blockerVisuals.length) {
    blockerWaiting.add(group);
    ensureRoadBlocks();
    return;
  }
  mountPicture(group);
}

function ensureRoadBlocks() {
  if (blockerLoad || blockerVisuals.length) return;
  if (typeof window === "undefined") return;
  blockerLoad = loadRoadBlocks().catch((error: unknown) => {
    blockerLoad = null;
    console.warn("Fit Run road blocks failed to load.", error);
  });
}

async function loadRoadBlocks() {
  const loader = new GLTFLoader();
  const loaded: THREE.Object3D[] = [];
  for (const model of ROAD_BLOCK_MODELS) {
    try {
      const gltf = await loader.loadAsync(model.url);
      prepareRoadBlock(gltf.scene);
      const fitted = layoutRoadBlock(gltf.scene, model);
      fitted.name = "road-block";
      fitted.userData.modelName = model.name;
      loaded.push(fitted);
    } catch (error) {
      console.warn("Fit Run road block skipped.", model.url, error);
    }
  }
  blockerVisuals.push(...loaded);
  const waiting = [...blockerWaiting];
  blockerWaiting.clear();
  for (const group of waiting) mountPicture(group);
}

/** Sign fills the hit box, facing the runner. Every car stays a car in the lane. */
export function layoutRoadBlock(scene: THREE.Object3D, model: { name: string; flip: boolean }) {
  if (model.name !== SIGN_BLOCK) return placeCar(scene);
  return fitRoadBlock(scene, model.flip);
}

/**
 * Uniform scale, wheels on the road, length down the lane, centered on the blocker.
 * Height stays near a normal roof. Width stays inside one lane.
 */
function placeCar(scene: THREE.Object3D) {
  scene.rotation.set(0, 0, 0);
  scene.position.set(0, 0, 0);
  scene.scale.set(1, 1, 1);
  scene.updateWorldMatrix(true, true);
  const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
  if (size.x > size.z) scene.rotation.y = Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(scene);
  holder.updateWorldMatrix(true, true);
  const oriented = new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3());
  const heightScale = LANE_CAR_HEIGHT_M / Math.max(oriented.y, 0.0001);
  const widthScale = LANE_CAR_MAX_WIDTH_M / Math.max(oriented.x, 0.0001);
  holder.scale.setScalar(Math.min(heightScale, widthScale));
  return seat(holder, "bottom").wrapper;
}

/** Scale the hidden hit mesh, and its ground mark, to the visible car. */
export function fitLaneCarHit(group: THREE.Group) {
  const visual = group.getObjectByName("road-block");
  const hit = group.getObjectByName("hit") as THREE.Mesh | undefined;
  if (!visual || !hit || !(hit.geometry instanceof THREE.BoxGeometry)) return;
  const box = boundsIn(visual, group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  if (size.x < 0.05 || size.y < 0.05 || size.z < 0.05) return;
  const params = hit.geometry.parameters;
  hit.scale.set(size.x / Math.max(params.width, 0.0001), size.y / Math.max(params.height, 0.0001), size.z / Math.max(params.depth, 0.0001));
  hit.position.copy(center);
  const shadow = group.getObjectByName("shadow") as THREE.Mesh | undefined;
  if (!shadow || !(shadow.geometry instanceof THREE.PlaneGeometry)) return;
  const plane = shadow.geometry.parameters;
  shadow.scale.set(size.x / Math.max(plane.width, 0.0001), size.z / Math.max(plane.height, 0.0001), 1);
  shadow.position.set(center.x, shadow.position.y, center.z);
}

function boundsIn(object: THREE.Object3D, space: THREE.Object3D) {
  object.updateWorldMatrix(true, true);
  space.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(object);
  box.applyMatrix4(space.matrixWorld.clone().invert());
  return box;
}

function prepareRoadBlock(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material.side = THREE.DoubleSide;
  });
}

/** Turn the broad face toward the runner, then scale the picture into the hit box. */
function fitRoadBlock(scene: THREE.Object3D, flip: boolean) {
  scene.rotation.set(0, 0, 0);
  scene.position.set(0, 0, 0);
  scene.scale.set(1, 1, 1);
  scene.updateWorldMatrix(true, true);
  const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
  if (size.x < size.z) scene.rotation.y = Math.PI / 2;
  if (flip) scene.rotation.y += Math.PI;
  const holder = new THREE.Group();
  holder.add(scene);
  return fitBox(holder, tuning.props.blocker);
}

function roadBlockOrdinal(group: THREE.Object3D) {
  const ordinal = group.userData.roadBlockOrdinal;
  return typeof ordinal === "number" ? ordinal : 0;
}

function modelIndexFor(ordinal: number) {
  const name = roadBlockNameForOrdinal(ordinal);
  const match = blockerVisuals.findIndex((item) => item.userData.modelName === name);
  if (match >= 0) return match;
  const cars = blockerVisuals
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.userData.modelName !== SIGN_BLOCK);
  if (!cars.length) return 0;
  return cars[((ordinal % cars.length) + cars.length) % cars.length]?.index ?? 0;
}

function mountPicture(group: THREE.Group) {
  const name = roadBlockNameForOrdinal(roadBlockOrdinal(group));
  const current = group.getObjectByName("road-block");
  if (current?.userData.modelName === name) return;
  if (current) group.remove(current);
  attachRoadBlock(group);
}

function attachRoadBlock(group: THREE.Group) {
  if (!blockerVisuals.length || group.getObjectByName("road-block")) return;
  const source = blockerVisuals[modelIndexFor(roadBlockOrdinal(group))];
  if (!source) return;
  const visual = source.clone(true);
  visual.name = "road-block";
  visual.userData.modelName = source.userData.modelName;
  visual.traverse((child) => {
    child.frustumCulled = false;
    child.castShadow = false;
    child.receiveShadow = false;
  });
  group.add(visual);
  fitLaneCarHit(group);
}

function bag(): Bag {
  return { body: [], frame: [], panel: [], accent: [], stripe: [], stripeAlt: [], bolt: [] };
}

function put(bucket: Stamp[], geometry: THREE.BufferGeometry, x: number, y: number, z: number, compose?: (object: THREE.Object3D) => void) {
  scratch.position.set(x, y, z);
  scratch.rotation.set(0, 0, 0);
  scratch.scale.set(1, 1, 1);
  scratch.updateMatrix();
  if (compose) {
    compose(scratch);
    scratch.updateMatrix();
  }
  bucket.push({ geometry, matrix: scratch.matrix.clone() });
}

function paint(parts: Bag, label?: Stamp) {
  const painted: Painted[] = [];
  const roles = ["body", "frame", "panel", "accent", "stripe", "stripeAlt", "bolt"] as const;
  for (const role of roles) {
    const stamps = parts[role];
    if (!stamps.length) continue;
    painted.push({ role, geometry: mergeStamps(stamps) });
  }
  if (label) painted.push({ role: "label", geometry: mergeStamps([label]) });
  return painted;
}

function mergeStamps(stamps: Stamp[]) {
  const clones = stamps.map((stamp) => {
    const copy = stamp.geometry.clone();
    copy.applyMatrix4(stamp.matrix);
    return copy;
  });
  const merged = mergeGeometries(clones, false);
  for (const copy of clones) copy.dispose();
  if (!merged) throw new Error("Fit Run obstacle parts could not be merged.");
  return merged;
}

function boxGeo(x: number, y: number, z: number) {
  const key = `${x}|${y}|${z}`;
  const cached = boxes.get(key);
  if (cached) return cached;
  const geometry = new THREE.BoxGeometry(x, y, z);
  boxes.set(key, geometry);
  return geometry;
}

function cylGeo(radius: number, length: number) {
  const key = `${radius}|${length}`;
  const cached = cylinders.get(key);
  if (cached) return cached;
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 6);
  cylinders.set(key, geometry);
  return geometry;
}

function planeGeo(width: number, height: number) {
  const key = `${width}|${height}`;
  const cached = planes.get(key);
  if (cached) return cached;
  const geometry = new THREE.PlaneGeometry(width, height);
  planes.set(key, geometry);
  return geometry;
}

function placeholderMaterial() {
  if (!placeholder) {
    placeholder = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7, metalness: 0.04 });
    placeholder.name = "obstacle-placeholder";
  }
  return placeholder;
}

function shadowMaterial() {
  if (contactShadow) return contactShadow;
  contactShadow = new THREE.MeshBasicMaterial({
    color: "#061018",
    map: blobTexture(),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  contactShadow.name = "obstacle-contact-shadow";
  return contactShadow;
}

function blobTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(64, 64, 6, 64, 64, 62);
  gradient.addColorStop(0, "rgba(0,0,0,0.7)");
  gradient.addColorStop(0.55, "rgba(0,0,0,0.28)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

if (typeof window !== "undefined") ensureRoadBlocks();
