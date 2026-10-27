import * as THREE from "three";
import { fitRunnerTuning as tuning, type GraphicsQuality } from "@/components/fitrunner-v2/tuning";

export type { ObstacleKind } from "./obstacle-meshes";
export { createBlocker, createGate, createHurdle, createObstacle } from "./obstacle-meshes";

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
