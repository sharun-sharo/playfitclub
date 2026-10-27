import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { assignObstacleTheme, type PaintRole } from "./obstacle-themes";
import { fitRunnerTuning as tuning } from "./tuning";

export type ObstacleKind = "rock" | "log" | "fence";

/**
 * Static arcade meshes. The mesh named "hit" is the only collider and keeps
 * the previous box size. Extra parts are visual. Phone realtime shadows stay
 * off: these meshes do not enable a shadow map. The ground mark is a blob.
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

/** Tall one-lane cargo block. Bevels, rails, and stripes sit inside the same hit box. */
function buildBlocker(): Template {
  const width = tuning.props.blocker.x;
  const height = tuning.props.blocker.y;
  const depth = tuning.props.blocker.z;
  const chamfer = 0.085;
  const bevelThick = 0.062;
  const bevelSpan = chamfer * Math.SQRT2;
  const faceZ = depth / 2 - chamfer + 0.028;
  const bevelInset = Math.SQRT1_2 * (bevelThick / 2);
  const shell = chamfer;
  const parts = bag();

  put(parts.body, boxGeo(width - shell * 2, height - shell * 2, depth - shell * 2), 0, height / 2, 0);
  put(parts.panel, boxGeo(width - 0.28, 0.028, depth - 0.24), 0, height - chamfer - 0.01, 0);
  put(parts.panel, boxGeo(width * 0.64, height * 0.42, 0.036), 0, height * 0.5, faceZ - 0.01);
  for (const sideX of [-1, 1]) {
    put(parts.panel, boxGeo(0.03, height * 0.55, depth * 0.46), sideX * (width / 2 - 0.07), height * 0.52, 0);
  }

  const bevelY = boxGeo(bevelSpan, height - chamfer * 2, bevelThick);
  const collar = boxGeo(bevelSpan * 0.92, 0.16, bevelThick * 1.08);
  const guardFace = boxGeo(0.16, 0.22, 0.022);
  const guardSide = boxGeo(0.022, 0.22, 0.14);
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      const x = sideX * (width / 2 - chamfer / 2 - bevelInset);
      const z = sideZ * (depth / 2 - chamfer / 2 - bevelInset);
      const yaw = Math.atan2(sideX, sideZ);
      put(parts.frame, bevelY, x, height / 2, z, (object) => {
        object.rotation.y = yaw;
      });
      for (const sideY of [-1, 1]) {
        const guardY = sideY > 0 ? height - chamfer - 0.11 : chamfer + 0.11;
        put(parts.frame, collar, x, sideY > 0 ? height - chamfer - 0.04 : chamfer + 0.04, z, (object) => {
          object.rotation.y = yaw;
        });
        put(parts.frame, guardFace, sideX * (width / 2 - chamfer - 0.08), guardY, sideZ * (depth / 2 - 0.016));
        put(parts.frame, guardSide, sideX * (width / 2 - 0.016), guardY, sideZ * (depth / 2 - chamfer - 0.07));
      }
    }
  }

  const bevelX = boxGeo(width - chamfer * 2, bevelSpan, bevelThick);
  for (const sideY of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      const outerY = sideY > 0 ? height : 0;
      put(parts.frame, bevelX, 0, outerY - sideY * (chamfer / 2 + bevelInset), sideZ * (depth / 2 - chamfer / 2 - bevelInset), (object) => {
        object.rotation.x = -Math.atan2(sideY, sideZ);
      });
    }
  }
  const bevelZ = boxGeo(bevelThick, bevelSpan, depth - chamfer * 2);
  for (const sideX of [-1, 1]) {
    for (const sideY of [-1, 1]) {
      const outerY = sideY > 0 ? height : 0;
      put(parts.frame, bevelZ, sideX * (width / 2 - chamfer / 2 - bevelInset), outerY - sideY * (chamfer / 2 + bevelInset), 0, (object) => {
        object.rotation.z = Math.atan2(sideY, sideX);
      });
    }
  }

  const railX = boxGeo(width - chamfer * 2 - 0.16, 0.04, 0.028);
  const revealX = boxGeo(width - chamfer * 2 - 0.24, 0.018, 0.014);
  const railY = boxGeo(0.04, height - chamfer * 2 - 0.2, 0.028);
  const revealY = boxGeo(0.018, height - chamfer * 2 - 0.28, 0.014);
  for (const sideZ of [-1, 1]) {
    for (const alongTop of [true, false]) {
      const railCenter = alongTop ? height - chamfer - 0.042 : chamfer + 0.042;
      const revealCenter = alongTop ? height - chamfer - 0.085 : chamfer + 0.085;
      put(parts.frame, railX, 0, railCenter, sideZ * (depth / 2 - 0.026));
      put(parts.stripeAlt, revealX, 0, revealCenter, sideZ * (depth / 2 - chamfer + 0.012));
    }
    for (const sideX of [-1, 1]) {
      put(parts.frame, railY, sideX * (width / 2 - chamfer - 0.038), height / 2, sideZ * (depth / 2 - 0.026));
      put(parts.stripeAlt, revealY, sideX * (width / 2 - chamfer - 0.078), height / 2, sideZ * (depth / 2 - chamfer + 0.012));
    }
  }
  const railZ = boxGeo(0.028, 0.04, depth - chamfer * 2 - 0.1);
  const revealZ = boxGeo(0.014, 0.018, depth - chamfer * 2 - 0.14);
  for (const sideX of [-1, 1]) {
    for (const alongTop of [true, false]) {
      const railCenter = alongTop ? height - chamfer - 0.042 : chamfer + 0.042;
      const revealCenter = alongTop ? height - chamfer - 0.085 : chamfer + 0.085;
      put(parts.frame, railZ, sideX * (width / 2 - 0.02), railCenter, 0);
      put(parts.stripeAlt, revealZ, sideX * (width / 2 - chamfer + 0.01), revealCenter, 0);
    }
  }

  const slat = boxGeo(width * 0.58, 0.026, 0.016);
  for (let index = 0; index < 5; index += 1) {
    put(parts.frame, slat, 0, 0.98 + index * 0.18, faceZ + 0.012);
  }
  const bolt = cylGeo(0.026, 0.018);
  for (const sideX of [-1, 1]) {
    for (const sideY of [-1, 1]) {
      put(parts.bolt, bolt, sideX * width * 0.3, height * 0.5 + sideY * height * 0.2, faceZ + 0.02, (object) => {
        object.rotation.x = Math.PI / 2;
      });
    }
  }
  const stripe = boxGeo(0.34, 0.05, 0.016);
  for (const side of [-1, 1]) {
    for (let index = -1; index <= 1; index += 1) {
      const role = index === 0 ? parts.stripeAlt : parts.stripe;
      put(role, stripe, side * 0.62, 0.36, faceZ, (object) => {
        object.rotation.z = side * 0.62;
        object.translateY(index * 0.082);
      });
    }
  }
  const lamp = boxGeo(0.1, 0.07, 0.045);
  for (const sideX of [-1, 1]) {
    put(parts.accent, lamp, sideX * width * 0.34, height - 0.2, faceZ);
  }
  put(parts.stripe, lamp, 0, height - 0.2, faceZ);
  put(parts.accent, boxGeo(width * 0.7, 0.04, 0.018), 0, 0.62, faceZ + 0.016);

  const label = { geometry: planeGeo(0.96, 0.22), matrix: new THREE.Matrix4() };
  scratch.position.set(0, height * 0.78, faceZ + 0.01);
  scratch.rotation.set(0, 0, 0);
  scratch.scale.set(1, 1, 1);
  scratch.updateMatrix();
  label.matrix.copy(scratch.matrix);

  return {
    name: "blocker",
    hit: { geometry: boxGeo(width, height, depth), y: height / 2 },
    shadow: planeGeo(width * 0.92, depth * 0.96),
    painted: paint(parts, label),
  };
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
