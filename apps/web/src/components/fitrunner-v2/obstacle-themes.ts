import * as THREE from "three";

/**
 * Six curated Fit Run obstacle palettes. A spawn or recycle picks one palette
 * and one arrangement of its four colors. Materials are cached by
 * palette × arrangement × role. Nothing here picks a random RGB channel.
 */

export const OBSTACLE_PALETTES = [
  { id: "tropical", name: "Tropical Pop", primary: "#12C8C2", secondary: "#FFE14A", trim: "#FF6A3D", accent: "#10244F" },
  { id: "neon", name: "Neon Arcade", primary: "#C8FF3A", secondary: "#9B40FF", trim: "#FF2E8A", accent: "#1C1C22" },
  { id: "sunset", name: "Coastal Sunset", primary: "#FF8C2A", secondary: "#FF4B4B", trim: "#5EC8FF", accent: "#1A1468" },
  { id: "cyber", name: "Cyber Sport", primary: "#2F80FF", secondary: "#3DFF6E", trim: "#FF7A18", accent: "#16181C" },
  { id: "candy", name: "Candy Rush", primary: "#FF6BB5", secondary: "#B388FF", trim: "#5CFFC2", accent: "#FFD23A" },
  { id: "racing", name: "Industrial Racing", primary: "#FFD000", secondary: "#E10600", trim: "#9AA3AD", accent: "#141414" },
] as const;

type Swatch = "primary" | "secondary" | "trim" | "accent";

/** Each arrangement uses all four palette colors, on different parts. */
export const OBSTACLE_VARIANTS: readonly Record<"body" | "frame" | "panel" | "accent" | "stripe" | "stripeAlt" | "bolt", Swatch>[] = [
  { body: "primary", frame: "trim", panel: "secondary", accent: "accent", stripe: "secondary", stripeAlt: "accent", bolt: "trim" },
  { body: "secondary", frame: "primary", panel: "accent", accent: "trim", stripe: "primary", stripeAlt: "accent", bolt: "primary" },
  { body: "trim", frame: "accent", panel: "primary", accent: "secondary", stripe: "secondary", stripeAlt: "primary", bolt: "accent" },
];

export type PaintRole = "body" | "frame" | "panel" | "accent" | "stripe" | "stripeAlt" | "bolt" | "label";
export type ThemePick = { palette: number; variant: number };

/** Fixed inks. These are not palette colors and they are not random. */
const NEUTRAL_HEX = ["000000", "ffffff", "f4f1ea", "14181e", "061018", "f7f4ee"];

const SURFACE: Record<Exclude<PaintRole, "label">, { roughness: number; metalness: number; emissive: number }> = {
  body: { roughness: 0.74, metalness: 0.06, emissive: 0 },
  frame: { roughness: 0.32, metalness: 0.55, emissive: 0 },
  panel: { roughness: 0.66, metalness: 0.08, emissive: 0 },
  accent: { roughness: 0.38, metalness: 0.12, emissive: 0.4 },
  stripe: { roughness: 0.44, metalness: 0.06, emissive: 0.18 },
  stripeAlt: { roughness: 0.5, metalness: 0.05, emissive: 0.08 },
  bolt: { roughness: 0.3, metalness: 0.7, emissive: 0 },
};

const materials = new Map<string, THREE.MeshStandardMaterial>();
const labelTextures = new Map<string, THREE.CanvasTexture | null>();
let previousPalette = -1;

export function resetObstacleThemeSequence() {
  previousPalette = -1;
}

export function obstacleMaterialCacheSize() {
  return materials.size;
}

export function isCuratedObstacleHex(hex: string) {
  const needle = hex.replace("#", "").toLowerCase();
  if (NEUTRAL_HEX.includes(needle)) return true;
  return OBSTACLE_PALETTES.some((palette) =>
    [palette.primary, palette.secondary, palette.trim, palette.accent].some((color) => color.slice(1).toLowerCase() === needle),
  );
}

export function takeObstacleTheme(random: () => number = Math.random): ThemePick {
  const count = OBSTACLE_PALETTES.length;
  const span = previousPalette >= 0 ? count - 1 : count;
  let index = roll(random, span);
  if (previousPalette >= 0 && index >= previousPalette) index += 1;
  previousPalette = index;
  return { palette: index, variant: roll(random, OBSTACLE_VARIANTS.length) };
}

/** Point painted meshes at cached materials. Call this when a mesh is placed, not while it approaches. */
export function applyObstacleTheme(root: THREE.Object3D, pick?: ThemePick) {
  const choice = normalize(pick ?? takeObstacleTheme());
  const palette = OBSTACLE_PALETTES[choice.palette] ?? OBSTACLE_PALETTES[0];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const role = mesh.userData.paint as PaintRole | undefined;
    if (!role) return;
    mesh.material = materialFor(choice, role);
  });
  root.userData.themeId = palette.id;
  root.userData.themeVariant = choice.variant;
  return { id: palette.id, name: palette.name, variant: choice.variant, palette: choice.palette };
}

export function assignObstacleTheme(root: THREE.Object3D) {
  return applyObstacleTheme(root, takeObstacleTheme());
}

function materialFor(pick: ThemePick, role: PaintRole) {
  const palette = OBSTACLE_PALETTES[pick.palette] ?? OBSTACLE_PALETTES[0];
  if (role === "label") return labelMaterial(palette);
  const variant = OBSTACLE_VARIANTS[pick.variant] ?? OBSTACLE_VARIANTS[0];
  const color = palette[variant[role]];
  const key = `${palette.id}:${pick.variant}:${role}`;
  const cached = materials.get(key);
  if (cached) return cached;
  const surface = SURFACE[role];
  const glow = surface.emissive > 0 && bright(color) ? surface.emissive : 0;
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: glow > 0 ? color : "#000000",
    emissiveIntensity: glow,
    roughness: surface.roughness,
    metalness: surface.metalness,
  });
  material.name = key;
  materials.set(key, material);
  return material;
}

function labelMaterial(palette: (typeof OBSTACLE_PALETTES)[number]) {
  const key = `label:${palette.id}`;
  const cached = materials.get(key);
  if (cached) return cached;
  const material = new THREE.MeshStandardMaterial({
    color: "#f4f1ea",
    map: labelTexture(palette),
    roughness: 0.62,
    metalness: 0.04,
  });
  material.name = key;
  materials.set(key, material);
  return material;
}

function labelTexture(palette: (typeof OBSTACLE_PALETTES)[number]) {
  const cached = labelTextures.get(palette.id);
  if (cached !== undefined) return cached;
  if (typeof document === "undefined") {
    labelTextures.set(palette.id, null);
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) {
    labelTextures.set(palette.id, null);
    return null;
  }
  context.fillStyle = "#14181e";
  context.fillRect(0, 0, 512, 128);
  context.strokeStyle = palette.accent;
  context.lineWidth = 10;
  context.strokeRect(14, 14, 484, 100);
  context.fillStyle = "#f7f4ee";
  context.font = "600 42px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("PLAYFIT CARGO", 256, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  labelTextures.set(palette.id, texture);
  return texture;
}

function bright(hex: string) {
  const color = new THREE.Color(hex);
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722 >= 0.22;
}

function normalize(pick: ThemePick): ThemePick {
  return {
    palette: clamp(pick.palette, OBSTACLE_PALETTES.length),
    variant: clamp(pick.variant, OBSTACLE_VARIANTS.length),
  };
}

function roll(random: () => number, span: number) {
  if (span <= 1) return 0;
  const raw = random();
  const unit = Number.isFinite(raw) ? Math.min(0.999999, Math.max(0, raw)) : 0;
  return Math.min(span - 1, Math.floor(unit * span));
}

function clamp(index: number, count: number) {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(count - 1, Math.floor(index)));
}
