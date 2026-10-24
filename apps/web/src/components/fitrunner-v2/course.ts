import * as THREE from "three";
import { fitRunnerTuning as tuning, type GraphicsQuality } from "@/components/fitrunner-v2/tuning";

export type ObstacleKind = "rock" | "log" | "fence";

const lime = new THREE.MeshStandardMaterial({
  color: "#d6ff3c",
  emissive: "#6c8c10",
  emissiveIntensity: 0.28,
  roughness: 0.42,
  metalness: 0.03,
});
const white = new THREE.MeshStandardMaterial({
  color: "#f7f8f4",
  roughness: 0.48,
  metalness: 0.02,
});
const orange = new THREE.MeshStandardMaterial({
  color: "#ff7a2a",
  emissive: "#a3410d",
  emissiveIntensity: 0.18,
  roughness: 0.46,
  metalness: 0.03,
});
const charcoal = new THREE.MeshStandardMaterial({
  color: "#2c3338",
  roughness: 0.55,
  metalness: 0.08,
});
const hurdleBar = new THREE.MeshStandardMaterial({
  color: "#eaff6a",
  emissive: "#b6e000",
  emissiveIntensity: 0.5,
  roughness: 0.38,
  metalness: 0.02,
});
const gateStripe = new THREE.MeshStandardMaterial({
  color: "#ff7a2a",
  emissive: "#c24a10",
  emissiveIntensity: 0.32,
  roughness: 0.42,
  metalness: 0.03,
});
const crateBody = new THREE.MeshStandardMaterial({
  color: "#20252D",
  roughness: 0.86,
  metalness: 0.06,
});
const crateFrame = new THREE.MeshStandardMaterial({
  color: "#3A424D",
  roughness: 0.32,
  metalness: 0.58,
});
const crateBevel = new THREE.MeshStandardMaterial({
  color: "#b7c0cb",
  roughness: 0.18,
  metalness: 0.46,
});
const cratePanel = new THREE.MeshStandardMaterial({
  color: "#171c24",
  roughness: 0.9,
  metalness: 0.04,
});
const crateOrange = new THREE.MeshStandardMaterial({
  color: "#FF6B24",
  roughness: 0.52,
  metalness: 0.14,
});
const crateRed = new THREE.MeshStandardMaterial({
  color: "#EF3434",
  emissive: "#EF3434",
  emissiveIntensity: 0.18,
  roughness: 0.48,
  metalness: 0.1,
});
const crateLight = new THREE.MeshStandardMaterial({
  color: "#FF6B24",
  emissive: "#FF6B24",
  emissiveIntensity: 0.4,
  roughness: 0.36,
  metalness: 0.16,
});
const crateDark = new THREE.MeshStandardMaterial({
  color: "#14181e",
  roughness: 0.74,
  metalness: 0.08,
});
const crateBolt = new THREE.MeshStandardMaterial({
  color: "#8d96a3",
  roughness: 0.34,
  metalness: 0.7,
});
const crateGhost = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false,
});
const crateShadow = new THREE.MeshBasicMaterial({
  color: "#000000",
  transparent: true,
  opacity: 0.38,
  depthWrite: false,
});
function box(name: string, size: { x: number; y: number; z: number }, material: THREE.Material, y: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.name = name;
  mesh.position.y = y;
  mesh.castShadow = name !== "hit";
  mesh.receiveShadow = false;
  return mesh;
}

/** Low lime bar. The visible bar is the hit volume. Posts stop under it so it does not read as a gate. */
export function createHurdle() {
  const group = new THREE.Group();
  group.name = "hurdle";
  const top = tuning.props.log.y;
  const bar = box("hit", { x: tuning.props.log.x, y: 0.11, z: tuning.props.log.z }, hurdleBar, top - 0.055);
  bar.castShadow = true;
  const postHeight = top - 0.04;
  const postGeo = new THREE.BoxGeometry(0.09, postHeight, 0.09);
  const tickGeo = new THREE.BoxGeometry(0.22, 0.012, 0.045);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, white);
    post.name = "visual";
    post.position.set(side * 0.86, postHeight / 2, 0);
    post.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.045, 0.11), orange);
    band.name = "visual";
    band.position.set(side * 0.86, top - 0.1, 0);
    const tick = new THREE.Mesh(tickGeo, hurdleBar);
    tick.name = "visual";
    tick.position.set(side * 0.36, 0.018, 0.62);
    group.add(post, band, tick);
  }
  group.add(bar);
  return group;
}

/** Overhead bar whose underside is fenceGap. Posts are visual so a roll still clears the same opening. */
export function createGate() {
  const group = new THREE.Group();
  group.name = "gate";
  const gap = tuning.fenceGap;
  const bar = box("hit", { x: tuning.props.fence.x, y: 0.16, z: tuning.props.fence.z }, white, gap + 0.08);
  const stripe = box("visual", { x: 1.72, y: 0.09, z: 0.22 }, gateStripe, gap + 0.1);
  const lip = box("visual", { x: 1.58, y: 0.028, z: 0.2 }, gateStripe, gap + 0.014);
  const postGeo = new THREE.BoxGeometry(0.14, gap + 0.55, 0.16);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, charcoal);
    post.name = "visual";
    post.position.set(side * 1.02, (gap + 0.55) / 2, 0);
    post.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), lime);
    cap.name = "visual";
    cap.position.set(side * 1.02, gap + 0.5, 0);
    group.add(post, cap);
  }
  group.add(bar, stripe, lip);
  return group;
}

function cargoLabelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#1a1f27";
  context.fillRect(0, 0, 512, 128);
  context.strokeStyle = "#FF6B24";
  context.lineWidth = 8;
  context.strokeRect(10, 10, 492, 108);
  context.fillStyle = "#f3f0e8";
  context.font = "600 52px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("PLAYFIT CARGO", 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function cargoShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(64, 32, 8, 64, 32, 60);
  gradient.addColorStop(0, "rgba(0,0,0,0.55)");
  gradient.addColorStop(0.7, "rgba(0,0,0,0.22)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function pulseCargoLight() {
  crateLight.emissiveIntensity = 0.26 + (Math.sin(performance.now() * 0.0034) * 0.5 + 0.5) * 0.38;
}

function addPart(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  name = "visual",
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = name === "visual";
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

/** One shared bevelled crate. Clones reuse its geometries and materials. */
let crateTemplate: THREE.Group | null = null;

function buildCrateTemplate() {
  const group = new THREE.Group();
  group.name = "blocker";
  const width = tuning.props.blocker.x;
  const height = tuning.props.blocker.y;
  const depth = tuning.props.blocker.z;
  const chamfer = 0.085;
  const bevelThick = 0.062;
  const bevelSpan = chamfer * Math.SQRT2;
  const faceZ = depth / 2 - chamfer + 0.028;
  const labelTexture = cargoLabelTexture();
  const labelMaterial = new THREE.MeshStandardMaterial({
    color: "#f4f1ea",
    map: labelTexture,
    roughness: 0.62,
    metalness: 0.04,
  });
  const shadowTexture = cargoShadowTexture();
  if (shadowTexture) crateShadow.map = shadowTexture;

  const shell = chamfer;
  const bodyGeo = new THREE.BoxGeometry(width - shell * 2, height - shell * 2, depth - shell * 2);
  const frontPanelGeo = new THREE.BoxGeometry(width * 0.64, height * 0.42, 0.036);
  const sidePanelGeo = new THREE.BoxGeometry(0.03, height * 0.55, depth * 0.46);
  const topGeo = new THREE.BoxGeometry(width - 0.28, 0.028, depth - 0.24);
  const bevelXGeo = new THREE.BoxGeometry(width - chamfer * 2, bevelSpan, bevelThick);
  const bevelYGeo = new THREE.BoxGeometry(bevelSpan, height - chamfer * 2, bevelThick);
  const bevelZGeo = new THREE.BoxGeometry(bevelThick, bevelSpan, depth - chamfer * 2);
  const railXGeo = new THREE.BoxGeometry(width - chamfer * 2 - 0.16, 0.04, 0.028);
  const railYGeo = new THREE.BoxGeometry(0.04, height - chamfer * 2 - 0.2, 0.028);
  const railZGeo = new THREE.BoxGeometry(0.028, 0.04, depth - chamfer * 2 - 0.1);
  const revealXGeo = new THREE.BoxGeometry(width - chamfer * 2 - 0.24, 0.018, 0.014);
  const revealYGeo = new THREE.BoxGeometry(0.018, height - chamfer * 2 - 0.28, 0.014);
  const revealZGeo = new THREE.BoxGeometry(0.014, 0.018, depth - chamfer * 2 - 0.14);
  const guardFaceGeo = new THREE.BoxGeometry(0.16, 0.22, 0.022);
  const guardSideGeo = new THREE.BoxGeometry(0.022, 0.22, 0.14);
  const collarGeo = new THREE.BoxGeometry(bevelSpan * 0.92, 0.16, bevelThick * 1.08);
  const slatGeo = new THREE.BoxGeometry(width * 0.58, 0.026, 0.016);
  const boltGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.018, 6);
  const stripeGeo = new THREE.BoxGeometry(0.34, 0.05, 0.016);
  const lightGeo = new THREE.BoxGeometry(0.1, 0.07, 0.045);
  const labelGeo = new THREE.PlaneGeometry(0.96, 0.22);
  const shadowGeo = new THREE.PlaneGeometry(width * 0.9, depth * 0.92);
  const hitGeo = new THREE.BoxGeometry(width, height, depth);

  const bevelInset = Math.SQRT1_2 * (bevelThick / 2);
  addPart(group, bodyGeo, crateBody, 0, height / 2, 0);
  addPart(group, topGeo, cratePanel, 0, height - chamfer - 0.01, 0);
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      const vertical = addPart(
        group,
        bevelYGeo,
        crateBevel,
        sideX * (width / 2 - chamfer / 2 - bevelInset),
        height / 2,
        sideZ * (depth / 2 - chamfer / 2 - bevelInset),
      );
      vertical.rotation.y = Math.atan2(sideX, sideZ);
      for (const sideY of [-1, 1]) {
        const guardY = sideY > 0 ? height - chamfer - 0.11 : chamfer + 0.11;
        const cap = addPart(
          group,
          collarGeo,
          crateBevel,
          vertical.position.x,
          sideY > 0 ? height - chamfer - 0.04 : chamfer + 0.04,
          vertical.position.z,
        );
        cap.rotation.y = vertical.rotation.y;
        addPart(
          group,
          guardFaceGeo,
          crateBevel,
          sideX * (width / 2 - chamfer - 0.08),
          guardY,
          sideZ * (depth / 2 - 0.016),
        );
        addPart(
          group,
          guardSideGeo,
          crateBevel,
          sideX * (width / 2 - 0.016),
          guardY,
          sideZ * (depth / 2 - chamfer - 0.07),
        );
      }
    }
  }
  for (const sideY of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      const outerY = sideY > 0 ? height : 0;
      const strip = addPart(
        group,
        bevelXGeo,
        crateBevel,
        0,
        outerY - sideY * (chamfer / 2 + bevelInset),
        sideZ * (depth / 2 - chamfer / 2 - bevelInset),
      );
      strip.rotation.x = -Math.atan2(sideY, sideZ);
    }
  }
  for (const sideX of [-1, 1]) {
    for (const sideY of [-1, 1]) {
      const outerY = sideY > 0 ? height : 0;
      const strip = addPart(
        group,
        bevelZGeo,
        crateBevel,
        sideX * (width / 2 - chamfer / 2 - bevelInset),
        outerY - sideY * (chamfer / 2 + bevelInset),
        0,
      );
      strip.rotation.z = Math.atan2(sideY, sideX);
    }
  }
  for (const sideZ of [-1, 1]) {
    for (const alongTop of [true, false]) {
      const railY = alongTop ? height - chamfer - 0.042 : chamfer + 0.042;
      const revealY = alongTop ? height - chamfer - 0.085 : chamfer + 0.085;
      addPart(group, railXGeo, crateFrame, 0, railY, sideZ * (depth / 2 - 0.026));
      addPart(group, revealXGeo, crateDark, 0, revealY, sideZ * (depth / 2 - chamfer + 0.012));
    }
    for (const sideX of [-1, 1]) {
      addPart(group, railYGeo, crateFrame, sideX * (width / 2 - chamfer - 0.038), height / 2, sideZ * (depth / 2 - 0.026));
      addPart(group, revealYGeo, crateDark, sideX * (width / 2 - chamfer - 0.078), height / 2, sideZ * (depth / 2 - chamfer + 0.012));
    }
  }
  for (const sideX of [-1, 1]) {
    for (const alongTop of [true, false]) {
      const railY = alongTop ? height - chamfer - 0.042 : chamfer + 0.042;
      const revealY = alongTop ? height - chamfer - 0.085 : chamfer + 0.085;
      addPart(group, railZGeo, crateFrame, sideX * (width / 2 - 0.02), railY, 0);
      addPart(group, revealZGeo, crateDark, sideX * (width / 2 - chamfer + 0.01), revealY, 0);
    }
  }
  addPart(group, frontPanelGeo, cratePanel, 0, height * 0.5, faceZ - 0.01);
  for (const sideX of [-1, 1]) {
    addPart(group, sidePanelGeo, cratePanel, sideX * (width / 2 - 0.07), height * 0.52, 0);
  }
  for (let index = 0; index < 5; index += 1) {
    addPart(group, slatGeo, crateFrame, 0, 0.98 + index * 0.18, faceZ + 0.012);
  }
  const label = addPart(group, labelGeo, labelMaterial, 0, height * 0.78, faceZ + 0.01);
  label.castShadow = false;
  for (const sideX of [-1, 1]) {
    for (const sideY of [-1, 1]) {
      const bolt = addPart(group, boltGeo, crateBolt, sideX * width * 0.3, height * 0.5 + sideY * height * 0.2, faceZ + 0.02);
      bolt.rotation.x = Math.PI / 2;
      bolt.castShadow = false;
    }
  }
  for (const side of [-1, 1]) {
    for (let index = -1; index <= 1; index += 1) {
      const stripe = addPart(group, stripeGeo, index === 0 ? crateDark : crateOrange, side * 0.62, 0.36, faceZ);
      stripe.rotation.z = side * 0.62;
      stripe.translateY(index * 0.082);
    }
  }
  for (const sideX of [-1, 1]) {
    const light = addPart(group, lightGeo, crateLight, sideX * width * 0.34, height - 0.2, faceZ);
    light.name = "cargo-light";
    light.castShadow = false;
  }
  const beacon = addPart(group, lightGeo, crateRed, 0, height - 0.2, faceZ);
  beacon.castShadow = false;
  const shadow = addPart(group, shadowGeo, crateShadow, 0, 0.02, 0, "visual");
  shadow.rotation.x = -Math.PI / 2;
  shadow.castShadow = false;
  addPart(group, hitGeo, crateGhost, 0, height / 2, 0, "hit");
  return group;
}

/** Tall one-lane cargo crate. Jump and roll both meet it; the open lanes are the path. */
export function createBlocker() {
  if (!crateTemplate) crateTemplate = buildCrateTemplate();
  const crate = crateTemplate.clone(true);
  crate.traverse((child) => {
    if (child.name === "cargo-light") child.onBeforeRender = pulseCargoLight;
  });
  return crate;
}

export function createObstacle(kind: ObstacleKind) {
  if (kind === "log") return createHurdle();
  if (kind === "fence") return createGate();
  return createBlocker();
}

const tokenRing = new THREE.MeshStandardMaterial({
  color: "#d6ff4a",
  emissive: "#87a814",
  emissiveIntensity: 0.14,
  roughness: 0.4,
  metalness: 0.06,
});
const tokenCore = new THREE.MeshStandardMaterial({
  color: "#f2c14e",
  emissive: "#8a6412",
  emissiveIntensity: 0.08,
  roughness: 0.46,
  metalness: 0.08,
});
const TOKEN_RING_RADIUS = 0.07;
const TOKEN_TUBE = 0.011;
/** Outer radius of the visible ring. Collection uses this, not the old oversized torus. */
export const tokenRadius = TOKEN_RING_RADIUS + TOKEN_TUBE;
const tokenRingGeo = new THREE.TorusGeometry(TOKEN_RING_RADIUS, TOKEN_TUBE, 10, 18);
const tokenCoreGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.014, 14);

export type Token = {
  mesh: THREE.Group;
  baseY: number;
  active: boolean;
  collecting: number;
};

export function createToken(): Token {
  const mesh = new THREE.Group();
  const ring = new THREE.Mesh(tokenRingGeo, tokenRing);
  ring.castShadow = true;
  const core = new THREE.Mesh(tokenCoreGeo, tokenCore);
  core.rotation.x = Math.PI / 2;
  mesh.add(ring, core);
  mesh.visible = false;
  return { mesh, baseY: 1.05, active: false, collecting: 0 };
}

export type TokenSpot = { x: number; y: number; z: number };

/** Patterns stay on open lanes. High arc tokens sit on the jump, not under a running chest. */
export function tokenLayout(spawn: number, blocked: number[]): TokenSpot[] {
  if (spawn < 2) return [];
  const spacing = tuning.laneSpacing;
  const open = [-1, 0, 1].filter((lane) => !blocked.includes(lane));
  if (!open.length) return [];
  const cycle = Math.floor(spawn / 5) % 4;
  const step = ((spawn % 5) + 5) % 5;
  const lane = open[Math.abs(Math.floor(spawn / 5)) % open.length] ?? 0;

  if (cycle === 0 && step > 0) return [{ x: lane * spacing, y: 0.82, z: 0 }];
  if (cycle === 1 && step === 2) {
    return [-1.35, -0.45, 0.45, 1.35].map((z, index) => ({
      x: lane * spacing,
      y: index === 1 || index === 2 ? 1.55 : 0.82,
      z,
    }));
  }
  if (cycle === 2 && step > 0 && step < 4) {
    const path = [-1, 0, 1][step - 1] ?? 0;
    if (blocked.includes(path)) return [];
    return [{ x: path * spacing, y: 0.82, z: 0 }];
  }
  if (cycle === 3 && step === 1) {
    return [
      { x: lane * spacing, y: 0.82, z: -1.2 },
      { x: lane * spacing, y: 0.9, z: 0 },
      { x: lane * spacing, y: 0.82, z: 1.2 },
    ];
  }
  return [];
}

type Particle = {
  life: number;
  max: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};

function popupTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.clearRect(0, 0, 256, 128);
  context.fillStyle = "#d6ff4a";
  context.font = "700 78px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("+25", 128, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export type CourseFx = {
  burst: (position: THREE.Vector3, tint: "lime" | "gold" | "hit") => void;
  popup: (position: THREE.Vector3) => void;
  update: (dt: number) => void;
  collect: () => void;
  clear: () => void;
  hit: () => void;
  setMuted: (muted: boolean) => void;
  prime: () => void;
  dispose: () => void;
};

export function createCourseFx(scene: THREE.Scene, quality: GraphicsQuality): CourseFx {
  const count = quality === "low" ? 48 : 96;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const particles: Particle[] = [];
  for (let index = 0; index < count; index += 1) {
    positions[index * 3 + 1] = -20;
    particles.push({ life: 0, max: 1, x: 0, y: -20, z: 0, vx: 0, vy: 0, vz: 0 });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    }),
  );
  points.frustumCulled = false;
  scene.add(points);

  const texture = popupTexture();
  const popups: { sprite: THREE.Sprite; life: number }[] = [];
  for (let index = 0; index < 6; index += 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 }),
    );
    sprite.scale.set(0.28, 0.14, 1);
    sprite.visible = false;
    sprite.position.y = -20;
    scene.add(sprite);
    popups.push({ sprite, life: 0 });
  }

  let muted = false;
  let audio: AudioContext | null = null;
  const tint = {
    lime: new THREE.Color("#d6ff4a"),
    gold: new THREE.Color("#f2c14e"),
    hit: new THREE.Color("#ff5a3c"),
  };

  function context() {
    if (muted) return null;
    if (!audio) audio = new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    return audio;
  }

  function tone(freq: number, duration: number, type: OscillatorType, gainValue: number) {
    const current = context();
    if (!current) return;
    const oscillator = current.createOscillator();
    const gain = current.createGain();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(gainValue, current.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, current.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(current.destination);
    oscillator.start();
    oscillator.stop(current.currentTime + duration);
  }

  return {
    burst(position, name) {
      const color = tint[name];
      let spawned = 0;
      const budget = quality === "low" ? 8 : 12;
      for (const particle of particles) {
        if (particle.life > 0) continue;
        particle.life = 0.38;
        particle.max = 0.38;
        particle.x = position.x + (Math.random() - 0.5) * 0.25;
        particle.y = position.y + (Math.random() - 0.5) * 0.15;
        particle.z = position.z + (Math.random() - 0.5) * 0.25;
        particle.vx = (Math.random() - 0.5) * 1.4;
        particle.vy = 0.8 + Math.random() * 1.3;
        particle.vz = (Math.random() - 0.5) * 1.4;
        spawned += 1;
        if (spawned >= budget) break;
      }
      colors.fill(0);
      for (let index = 0; index < particles.length; index += 1) {
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      }
      geometry.attributes.color.needsUpdate = true;
    },
    popup(position) {
      const slot = popups.find((item) => item.life <= 0) ?? popups[0];
      if (!slot) return;
      slot.life = 0.65;
      slot.sprite.visible = true;
      slot.sprite.position.copy(position);
      slot.sprite.position.y += 0.2;
      (slot.sprite.material as THREE.SpriteMaterial).opacity = 1;
    },
    update(dt) {
      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        if (!particle || particle.life <= 0) {
          positions[index * 3 + 1] = -20;
          continue;
        }
        particle.life -= dt;
        particle.vy -= 3.2 * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.z += particle.vz * dt;
        positions[index * 3] = particle.x;
        positions[index * 3 + 1] = particle.y;
        positions[index * 3 + 2] = particle.z;
      }
      geometry.attributes.position.needsUpdate = true;
      for (const popup of popups) {
        if (popup.life <= 0) continue;
        popup.life -= dt;
        popup.sprite.position.y += dt * 0.85;
        const material = popup.sprite.material as THREE.SpriteMaterial;
        material.opacity = Math.max(0, popup.life / 0.65);
        if (popup.life <= 0) popup.sprite.visible = false;
      }
    },
    collect() {
      tone(860, 0.07, "sine", 0.045);
      tone(1280, 0.08, "triangle", 0.03);
    },
    clear() {
      tone(620, 0.06, "sine", 0.035);
    },
    hit() {
      tone(120, 0.11, "square", 0.03);
    },
    setMuted(next) {
      muted = next;
    },
    prime() {
      if (muted) return;
      if (!audio) audio = new AudioContext();
      if (audio.state === "suspended") void audio.resume();
    },
    dispose() {
      geometry.dispose();
      (points.material as THREE.Material).dispose();
      texture?.dispose();
      for (const popup of popups) (popup.sprite.material as THREE.Material).dispose();
      void audio?.close();
    },
  };
}
