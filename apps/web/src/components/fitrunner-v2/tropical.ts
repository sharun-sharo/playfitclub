import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { fitBox, fitHeight, prepareMaterials } from "@/components/fitrunner-v2/mesh-fit";
import { roadLayout } from "@/components/fitrunner-v2/road-width";
import { ROADSIDE_PLANTS, roadsidePlantX, roadsideVariant } from "@/components/fitrunner-v2/roadside-plants";
import { SIDE_FIT_HEIGHT, SIDE_PROP_IDS, sidePlacements, type SidePropId } from "@/components/fitrunner-v2/side-scenery";
import { fitRunnerTuning as tuning, type GraphicsQuality } from "@/components/fitrunner-v2/tuning";

const SPAN = tuning.tileSize * 1.08;
/**
 * Asphalt, lip, and ground distances from the road center.
 * Both sides use these magnitudes. Lanes stay at ±laneSpacing.
 */
const road = roadLayout();
const ROAD_EDGE = road.roadEdge;
const VERGE_WIDTH = road.vergeWidth;
const GROUND_EDGE = road.groundEdge;
const SHOULDER_INNER = road.shoulderInner;
const SHOULDER_OUTER = road.shoulderOuter;
const SHOULDER_WIDTH = road.shoulderWidth;
/** White edge line, kept on the asphalt just inside the lip. */
const EDGE_LINE_INSET = 0.15;
/** GrassPatch_Square from the side-area folder. Repeated across the left green plane. */
const LEFT_GRASS_PATCH_URL = "/assets/fitrunner/side-area/grass-patch.glb";
/** Width of the left field, measured from the grass line outward. */
const GREEN_WIDTH = 46;
/** World x where the left grass starts. Mirrors the right sand line. */
const LEFT_GRASS_EDGE = -GROUND_EDGE;
const LEFT_FIELD_EDGE = LEFT_GRASS_EDGE - GREEN_WIDTH;
const LEFT_FIELD_WIDTH = LEFT_GRASS_EDGE - LEFT_FIELD_EDGE;
const MODULES = ["beachfront", "market", "garden", "boardwalk"] as const;

export function coastModule(spawn: number) {
  const index = ((spawn % MODULES.length) + MODULES.length) % MODULES.length;
  return MODULES[index] ?? "beachfront";
}

function allows(tier: number, quality: GraphicsQuality) {
  if (quality === "high") return true;
  if (quality === "medium") return tier < 2;
  return tier < 1;
}

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function paint(label: string, background: string, foreground: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = background;
  context.fillRect(0, 0, 256, 128);
  context.strokeStyle = foreground;
  context.lineWidth = 10;
  context.strokeRect(8, 8, 240, 112);
  context.fillStyle = foreground;
  context.font = "700 64px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 128, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function boardTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#1497a8";
  context.fillRect(0, 0, 64, 256);
  context.fillStyle = "#f4f7f2";
  context.fillRect(26, 0, 8, 256);
  context.fillStyle = "#ff7a2a";
  context.beginPath();
  context.arc(32, 36, 9, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export type TropicalAssets = {
  palms: THREE.Object3D[];
  bush: THREE.Object3D;
  rock: THREE.Object3D;
  rockSmall: THREE.Object3D;
  log: THREE.Object3D;
  fence: THREE.Object3D;
  fencePlanks: THREE.Object3D;
  stall: THREE.Object3D;
  fruit: THREE.Object3D;
  bread: THREE.Object3D;
  shelf: THREE.Object3D;
  basket: THREE.Object3D;
  pathWood: THREE.Object3D;
  flowerYellow: THREE.Object3D;
  flowerRed: THREE.Object3D;
  grass: THREE.Object3D;
  /** Static city meshes. Cloned as side dressing, never as obstacles. Geometry is shared. */
  side: Record<SidePropId, THREE.Object3D>;
};

type PalmSlot = {
  id: number;
  index: number;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  phase: number;
  tier: number;
  active: boolean;
};

type PalmPlacement = Omit<PalmSlot, "id" | "index" | "active"> & { variant: number };

const PLANT_INSTANCES = 160;

function bakedGeometry(mesh: THREE.Mesh, start = 0, count = mesh.geometry.getAttribute("position")?.count ?? 0) {
  const source = mesh.geometry;
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const uv = source.getAttribute("uv");
  if (!position) throw new Error("Roadside plant is missing positions.");
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const normals = normal ? new Float32Array(count * 3) : null;
  const uvs = uv ? new Float32Array(count * 2) : null;
  const vertex = new THREE.Vector3();
  const norm = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for (let index = 0; index < count; index += 1) {
    vertex.fromBufferAttribute(position, start + index).applyMatrix4(mesh.matrixWorld);
    positions[index * 3] = vertex.x;
    positions[index * 3 + 1] = vertex.y;
    positions[index * 3 + 2] = vertex.z;
    if (normals && normal) {
      norm.fromBufferAttribute(normal, start + index).applyMatrix3(normalMatrix).normalize();
      normals[index * 3] = norm.x;
      normals[index * 3 + 1] = norm.y;
      normals[index * 3 + 2] = norm.z;
    }
    if (uvs && uv) {
      uvs[index * 2] = uv.getX(start + index);
      uvs[index * 2 + 1] = uv.getY(start + index);
    }
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (normals) geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  if (uvs) geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

/**
 * Static scenery meshes. Geometry is shared by every instance of that plant.
 * Skinned meshes are refused: scaling a skeleton breaks the bind pose.
 * These models are already meter-scale, so they are not fit to one height.
 */
function bakePlant(source: THREE.Object3D) {
  prepareMaterials(source, { cast: false, receive: false });
  source.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(source);
  const halfReach = Math.hypot((box.max.x - box.min.x) / 2, (box.max.z - box.min.z) / 2);
  if (!Number.isFinite(halfReach) || halfReach > 12) throw new Error("Roadside plant extent is not in meters.");
  const identity = new THREE.Matrix4();
  const parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  source.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      throw new Error("Roadside plant is skinned. Geometry is not rescaled.");
    }
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(
      (material): material is THREE.Material => Boolean(material),
    );
    const groups = materials.length > 1 && mesh.geometry.groups.length > 0 ? mesh.geometry.groups : null;
    if (!groups) {
      const material = materials[0];
      if (!material) return;
      const geometry = mesh.matrixWorld.equals(identity) ? mesh.geometry : bakedGeometry(mesh);
      parts.push({ geometry, material });
      return;
    }
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0] ?? materials[0];
      if (!material) continue;
      parts.push({ geometry: bakedGeometry(mesh, group.start, group.count), material });
    }
  });
  if (parts.length === 0) throw new Error("Roadside plant has no mesh.");
  return { parts, halfReach };
}

function heightProp(source: THREE.Object3D, height: number, shadows: { cast: boolean; receive: boolean } = { cast: true, receive: true }) {
  const clone = source.clone(true);
  prepareMaterials(clone, shadows);
  return fitHeight(clone, height);
}

function boxProp(source: THREE.Object3D, target: { x: number; y: number; z: number }) {
  const clone = source.clone(true);
  prepareMaterials(clone, { cast: true, receive: true });
  return fitBox(clone, target);
}

function signTemplate(label: string, background: string, foreground: string) {
  const group = new THREE.Group();
  const map = paint(label, background, foreground);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 0.68),
    new THREE.MeshStandardMaterial({ map, roughness: 0.7, metalness: 0, side: THREE.DoubleSide }),
  );
  board.position.y = 1.52;
  board.castShadow = true;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 1.5, 8),
    new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.6 }),
  );
  pole.position.y = 0.75;
  pole.castShadow = true;
  group.add(pole, board);
  return group;
}

function umbrellaTemplate() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.05, 1.7, 8),
    new THREE.MeshStandardMaterial({ color: "#f7f4ee", roughness: 0.55 }),
  );
  pole.position.y = 0.85;
  pole.castShadow = true;
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(1.08, 0.36, 14),
    new THREE.MeshStandardMaterial({ color: "#f07167", roughness: 0.68 }),
  );
  canopy.position.y = 1.78;
  canopy.castShadow = true;
  group.add(pole, canopy);
  return group;
}

function boardTemplate() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.7);
  shape.bezierCurveTo(0.2, -0.5, 0.2, 0.42, 0.015, 0.7);
  shape.bezierCurveTo(-0.17, 0.48, -0.17, -0.48, 0, -0.7);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 1,
  });
  geometry.translate(0, 0.7, -0.025);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ map: boardTexture(), color: "#ffffff", roughness: 0.55 }),
  );
  mesh.castShadow = true;
  mesh.rotation.z = 0.42;
  mesh.position.y = 0.05;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

type Prop = { object: THREE.Object3D; tier: number };

export type SegmentDressing = {
  group: THREE.Group;
  spawn: number;
  apply: (spawn: number) => void;
};

export type TropicalWorld = {
  dressing: () => SegmentDressing;
  update: (focus: THREE.Vector3, camera: THREE.Camera, time: number) => void;
  setQuality: (quality: GraphicsQuality) => void;
  dispose: () => void;
};

export function createTropical(
  scene: THREE.Scene,
  assets: TropicalAssets,
  renderer: THREE.WebGLRenderer,
  sun: THREE.DirectionalLight,
  initialQuality: GraphicsQuality,
): TropicalWorld {
  let quality = initialQuality;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(240, 28, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uHorizon: { value: new THREE.Color("#d5eef8") },
        uWarm: { value: new THREE.Color("#f6e3b4") },
        uMid: { value: new THREE.Color("#79c4ea") },
        uTop: { value: new THREE.Color("#3e93d4") },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 uHorizon;
        uniform vec3 uWarm;
        uniform vec3 uMid;
        uniform vec3 uTop;
        void main() {
          float h = normalize(vPos).y;
          vec3 col = mix(uHorizon, uWarm, smoothstep(0.0, 0.09, h));
          col = mix(col, uMid, smoothstep(0.04, 0.34, h));
          col = mix(col, uTop, smoothstep(0.28, 0.9, h));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  sky.frustumCulled = false;
  scene.add(sky);

  const oceanUniforms = {
    uTime: { value: 0 },
    uDetail: { value: quality === "low" ? 0.4 : quality === "medium" ? 0.75 : 1 },
    uShallow: { value: new THREE.Color("#3ee0c4") },
    uDeep: { value: new THREE.Color("#0b4f88") },
    uFoam: { value: new THREE.Color("#eefcff") },
    uSun: { value: new THREE.Color("#fff3c4") },
  };
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(56, 210, 40, 64),
    new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, oceanUniforms]),
      vertexShader: `
        #include <fog_pars_vertex>
        uniform float uTime;
        uniform float uDetail;
        varying float vShore;
        varying vec3 vWorld;
        void main() {
          vec3 pos = position;
          float detail = clamp(uDetail, 0.25, 1.0);
          pos.y += sin(pos.z * 0.16 + uTime * 1.1) * 0.05 * detail;
          pos.y += sin(pos.x * 0.28 + pos.z * 0.1 + uTime * 0.72) * 0.03 * detail;
          vec4 world = modelMatrix * vec4(pos, 1.0);
          vWorld = world.xyz;
          vShore = clamp((position.x + 28.0) / 24.0, 0.0, 1.0);
          vec4 mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <fog_pars_fragment>
        varying float vShore;
        varying vec3 vWorld;
        uniform float uTime;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uFoam;
        uniform vec3 uSun;
        void main() {
          vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 1.0, vShore));
          float band = sin(vWorld.z * 0.62 + uTime * 1.5);
          float foam = smoothstep(0.62, 0.95, band) * (1.0 - smoothstep(0.08, 0.48, vShore));
          col = mix(col, uFoam, foam * 0.7);
          float glint = pow(max(0.0, sin(vWorld.x * 0.45 + vWorld.z * 0.25 + uTime * 0.65)), 28.0);
          col += uSun * glint * 0.4;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  ocean.geometry.rotateX(-Math.PI / 2);
  ocean.position.set(16.5 + 28, -0.18, 0);
  ocean.frustumCulled = false;
  ocean.receiveShadow = false;
  scene.add(ocean);

  const catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshStandardMaterial({ color: "#c5e0ee", roughness: 1, metalness: 0 }),
  );
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = -0.6;
  catcher.receiveShadow = true;
  scene.add(catcher);

  const grassGeo = new THREE.PlaneGeometry(LEFT_FIELD_WIDTH, SPAN);
  grassGeo.rotateX(-Math.PI / 2);
  const sandGeo = new THREE.PlaneGeometry(14, SPAN);
  sandGeo.rotateX(-Math.PI / 2);
  const wetGeo = new THREE.PlaneGeometry(4.2, SPAN);
  wetGeo.rotateX(-Math.PI / 2);
  const grassMat = new THREE.MeshStandardMaterial({ color: "#6eae45", roughness: 0.94, metalness: 0 });
  const sandMat = new THREE.MeshStandardMaterial({ color: "#efd29a", roughness: 0.92, metalness: 0 });
  const wetMat = new THREE.MeshStandardMaterial({ color: "#d2b06a", roughness: 0.88, metalness: 0 });
  const shoulderMat = new THREE.MeshStandardMaterial({ color: "#6a7168", roughness: 0.94, metalness: 0 });
  const dashGeo = new THREE.BoxGeometry(0.042, 0.008, 0.56);
  const tickGeo = new THREE.BoxGeometry(0.16, 0.008, 0.04);
  const vergeGeo = new THREE.BoxGeometry(VERGE_WIDTH, 0.016, tuning.tileSize);
  const shoulderGeo = new THREE.BoxGeometry(SHOULDER_WIDTH, 0.02, tuning.tileSize);
  const edgeGeo = new THREE.BoxGeometry(0.04, 0.008, 1.05);
  const paintMat = new THREE.MeshStandardMaterial({
    color: "#f4f7f2",
    roughness: 0.74,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const tickMat = new THREE.MeshStandardMaterial({
    color: "#d6ff4a",
    emissive: "#6a8a12",
    emissiveIntensity: 0.1,
    roughness: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  /**
   * Left grass, from just outside the asphalt out to the far field.
   * Tiles of the grass patch fill that span. The right side stays plain sand.
   */
  type LeftGrass = { group: THREE.Group; patch: THREE.InstancedMesh | null; spawn: () => number };
  const leftGrass: LeftGrass[] = [];
  let grassGeometry: THREE.BufferGeometry | null = null;
  let grassSurface: THREE.Material | null = null;
  let grassWidth = 2;
  let grassCenterX = 0;
  let grassTiles = 1;
  let grassAlive = true;
  const grassMark = new THREE.Object3D();

  function grassField() {
    return { right: LEFT_GRASS_EDGE, left: LEFT_FIELD_EDGE };
  }

  function parkGrass(entry: LeftGrass) {
    const patch = entry.patch;
    if (!patch) return;
    const spawn = entry.spawn();
    const { right, left } = grassField();
    const count = patch.count;
    const step = count <= 1 ? 0 : (right - left - grassWidth) / (count - 1);
    for (let index = 0; index < count; index += 1) {
      const tileRight = right - index * step;
      const flip = Math.abs(spawn + index) % 2 === 1;
      grassMark.position.set(tileRight - grassWidth / 2 - grassCenterX, 0.02, 0);
      grassMark.rotation.set(0, flip ? Math.PI : 0, 0);
      grassMark.scale.set(1, 1, 1);
      grassMark.updateMatrix();
      patch.setMatrixAt(index, grassMark.matrix);
    }
    patch.instanceMatrix.needsUpdate = true;
  }

  function dressGrass(root: THREE.Object3D) {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        // The blade color lives in the texture. Its alpha is only a partial mask
        // and would throw away most of the patch, so the blades stay opaque.
        material.alphaTest = 0;
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.side = THREE.DoubleSide;
        material.metalness = 0;
        material.roughness = 0.94;
        material.needsUpdate = true;
      }
    });
  }

  function mountGrass(entry: LeftGrass) {
    if (!grassGeometry || !grassSurface || entry.patch) return;
    const patch = new THREE.InstancedMesh(grassGeometry, grassSurface, grassTiles);
    patch.castShadow = false;
    patch.receiveShadow = false;
    patch.frustumCulled = true;
    entry.group.add(patch);
    entry.patch = patch;
    parkGrass(entry);
  }

  const grassLoader = new GLTFLoader();
  grassLoader.load(
    LEFT_GRASS_PATCH_URL,
    (gltf) => {
      if (!grassAlive) return;
      const meshes: THREE.Mesh[] = [];
      gltf.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) meshes.push(mesh);
      });
      const source = meshes[0];
      if (!source) return;
      source.updateWorldMatrix(true, true);
      dressGrass(source);
      const box = new THREE.Box3().setFromObject(source);
      grassWidth = Math.max(0.001, box.max.x - box.min.x);
      grassCenterX = (box.min.x + box.max.x) / 2;
      const field = grassField();
      grassTiles = Math.max(1, Math.ceil((field.right - field.left) / grassWidth));
      grassGeometry = source.geometry;
      grassSurface = Array.isArray(source.material) ? source.material[0] ?? null : source.material;
      if (!grassSurface) return;
      for (const entry of leftGrass) mountGrass(entry);
    },
    undefined,
    () => {
      grassGeometry = null;
    },
  );

  const bakedPlants = assets.palms.map((plant) => bakePlant(plant));
  const plantReach = bakedPlants.map((plant) => plant.halfReach);
  const palmSets = bakedPlants.map((plant) =>
    plant.parts.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, PLANT_INSTANCES);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      scene.add(mesh);
      return mesh;
    }),
  );
  const palmSlots: PalmSlot[][] = palmSets.map(() => []);
  const anchors = new Map<number, THREE.Object3D>();
  const dummy = new THREE.Object3D();

  function placePalms(id: number, placements: PalmPlacement[]) {
    for (const list of palmSlots) {
      for (const slot of list) {
        if (slot.id === id) slot.active = false;
      }
    }
    for (const placement of placements) {
      const list = palmSlots[placement.variant];
      if (!list) continue;
      let slot = list.find((item) => !item.active);
      if (!slot) {
        slot = {
          id,
          index: list.length,
          x: 0,
          z: 0,
          yaw: 0,
          scale: 1,
          phase: 0,
          tier: 0,
          active: false,
        };
        list.push(slot);
      }
      slot.id = id;
      slot.x = placement.x;
      slot.z = placement.z;
      slot.yaw = placement.yaw;
      slot.scale = placement.scale;
      slot.phase = placement.phase;
      slot.tier = placement.tier;
      slot.active = true;
    }
  }

  const templates = {
    rock: heightProp(assets.rock, 0.9),
    rockSmall: heightProp(assets.rockSmall, 0.42),
    log: boxProp(assets.log, { x: 1.45, y: 0.32, z: 0.5 }),
    fence: boxProp(assets.fence, tuning.props.sceneryFence),
    fencePlanks: boxProp(assets.fencePlanks, { x: 0.22, y: 0.95, z: SPAN }),
    path: boxProp(assets.pathWood, { x: 1.55, y: 0.1, z: SPAN }),
    flowerYellow: heightProp(assets.flowerYellow, 0.42),
    flowerRed: heightProp(assets.flowerRed, 0.4),
    grass: heightProp(assets.grass, 0.62),
    umbrella: umbrellaTemplate(),
    board: boardTemplate(),
    surfSign: signTemplate("RUN", "#147a86", "#f3fffd"),
    iceSign: signTemplate("ICE", "#dff6ff", "#16324a"),
  };
  const sideTemplates = {} as Record<SidePropId, THREE.Object3D>;
  for (const id of SIDE_PROP_IDS) {
    sideTemplates[id] = heightProp(assets.side[id], SIDE_FIT_HEIGHT[id], { cast: false, receive: false });
  }

  const made: SegmentDressing[] = [];
  let nextId = 0;

  function dressing(): SegmentDressing {
    const id = nextId;
    nextId += 1;
    const group = new THREE.Group();
    anchors.set(id, group);
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.position.set((LEFT_FIELD_EDGE + LEFT_GRASS_EDGE) / 2, 0, 0);
    grass.receiveShadow = true;
    const sand = new THREE.Mesh(sandGeo, sandMat);
    sand.position.set(GROUND_EDGE + 7, 0, 0);
    sand.receiveShadow = true;
    const wet = new THREE.Mesh(wetGeo, wetMat);
    wet.position.set(17.4, -0.07, 0);
    wet.receiveShadow = true;
    group.add(grass, sand, wet);

    const dashes: THREE.Mesh[] = [];
    for (let index = 0; index < 6; index += 1) {
      const dash = new THREE.Mesh(dashGeo, paintMat);
      dash.castShadow = false;
      dash.receiveShadow = false;
      group.add(dash);
      dashes.push(dash);
    }
    const ticks: THREE.Mesh[] = [];
    for (let index = 0; index < 3; index += 1) {
      const tick = new THREE.Mesh(tickGeo, tickMat);
      tick.castShadow = false;
      tick.receiveShadow = false;
      group.add(tick);
      ticks.push(tick);
    }
    const edges: THREE.Mesh[] = [];
    for (let index = 0; index < 4; index += 1) {
      const edge = new THREE.Mesh(edgeGeo, paintMat);
      edge.castShadow = false;
      edge.receiveShadow = false;
      group.add(edge);
      edges.push(edge);
    }
    const shoulderY = -0.004;
    const shoulderX = (SHOULDER_INNER + SHOULDER_OUTER) / 2;
    const leftShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    const rightShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    leftShoulder.position.set(-shoulderX, shoulderY, 0);
    rightShoulder.position.set(shoulderX, shoulderY, 0);
    leftShoulder.receiveShadow = true;
    rightShoulder.receiveShadow = true;
    leftShoulder.castShadow = false;
    rightShoulder.castShadow = false;
    const vergeX = ROAD_EDGE + VERGE_WIDTH / 2;
    const grassVerge = new THREE.Mesh(vergeGeo, grassMat);
    const sandVerge = new THREE.Mesh(vergeGeo, sandMat);
    grassVerge.position.set(-vergeX, 0.018, 0);
    sandVerge.position.set(vergeX, 0.018, 0);
    grassVerge.receiveShadow = true;
    sandVerge.receiveShadow = true;
    group.add(leftShoulder, rightShoulder, grassVerge, sandVerge);

    const take = (object: THREE.Object3D, tier: number): Prop => {
      const clone = object.clone(true);
      clone.visible = false;
      group.add(clone);
      return { object: clone, tier };
    };
    const props = {
      rockA: take(templates.rock, 0),
      rockB: take(templates.rockSmall, 1),
      log: take(templates.log, 0),
      fenceA: take(templates.fence, 0),
      fenceB: take(templates.fencePlanks, 0),
      fenceC: take(templates.fencePlanks, 1),
      path: take(templates.path, 0),
      flowerA: take(templates.flowerYellow, 1),
      flowerB: take(templates.flowerRed, 2),
      grass: take(templates.grass, 1),
      umbrella: take(templates.umbrella, 0),
      board: take(templates.board, 0),
      surf: take(templates.surfSign, 0),
      ice: take(templates.iceSign, 0),
    };
    const kit = {} as Record<SidePropId, Prop>;
    for (const id of SIDE_PROP_IDS) kit[id] = take(sideTemplates[id], 0);
    const all = [...Object.values(props), ...Object.values(kit)];

    const piece: SegmentDressing = {
      group,
      spawn: 0,
      apply(spawn: number) {
        piece.spawn = spawn;
        const random = rng(spawn * 9176 + 11);
        const moduleName = coastModule(spawn);
        const phase = ((spawn % 4) + 4) % 4;
        const shift = (phase - 1.5) * 0.22;
        dashes.forEach((dash, index) => {
          const side = index < 3 ? -1 : 1;
          const slot = index % 3;
          dash.position.set(side * 1.5, 0.022, -0.78 + slot * 0.78 + shift);
        });
        ticks.forEach((tick, index) => {
          const lane = index - 1;
          const tickShift = (((spawn + index * 2) % 3) + 3) % 3;
          tick.position.set(lane * tuning.laneSpacing, 0.024, (tickShift - 1) * 0.48);
        });
        edges.forEach((edge, index) => {
          const side = index < 2 ? -1 : 1;
          const slot = index % 2;
          edge.position.set(side * (ROAD_EDGE - EDGE_LINE_INSET), 0.026, (slot === 0 ? -0.62 : 0.62) + shift * 0.6);
        });
        for (const prop of all) prop.object.visible = false;
        const aside = (x: number) => {
          const mag = Math.abs(x);
          if (mag < 4.8 || mag >= 10.5) return x;
          return Math.sign(x) * (mag + 1.2);
        };
        const show = (prop: Prop, x: number, z: number, yaw = 0) => {
          if (!allows(prop.tier, quality)) return;
          prop.object.visible = true;
          prop.object.position.set(aside(x), 0, z);
          prop.object.rotation.y = yaw;
        };
        const showExact = (prop: Prop, x: number, z: number, yaw = 0) => {
          if (!allows(prop.tier, quality)) return;
          prop.object.visible = true;
          prop.object.position.set(x, 0, z);
          prop.object.rotation.y = yaw;
        };
        const faceRoad = (x: number) => (x > 0 ? -Math.PI / 2 : Math.PI / 2);
        const palms: PalmPlacement[] = [];
        let plantOrdinal = 0;
        const placePlant = (side: -1 | 1, z: number) => {
          const variant = roadsideVariant(spawn, plantOrdinal, palmSets.length);
          plantOrdinal += 1;
          const scale = 0.96 + random() * 0.1;
          palms.push({
            variant,
            x: roadsidePlantX(side, plantReach[variant] ?? 1, scale),
            z,
            yaw: random() * Math.PI * 2,
            scale,
            phase: random() * Math.PI * 2,
            tier: ROADSIDE_PLANTS[variant]?.tier ?? 0,
          });
        };
        const zShift = moduleName === "garden" ? 0.16 : moduleName === "market" ? -0.12 : 0;
        placePlant(1, -0.62 + zShift);
        placePlant(1, 0.58 + zShift);
        placePlant(-1, -0.28 + zShift);
        placePlant(-1, 0.84 + zShift);

        if (moduleName === "beachfront") {
          show(props.rockA, 12.6, 0.7, random() * 3);
          show(props.rockB, 6.9, -0.55, 0.4);
          show(props.log, 10.4, 0.85, 0.8);
          show(props.umbrella, 9.1, -0.15);
          show(props.board, 7.35, 0.45, 0.6);
          show(props.surf, 6.55, -0.95, faceRoad(6.55));
        } else if (moduleName === "market") {
          show(props.ice, 8.5, 0.15, faceRoad(8.5));
          show(props.fenceA, 6.35, 0, Math.PI / 2);
          show(props.rockB, 12.2, -0.7, 1);
        } else if (moduleName === "garden") {
          show(props.flowerA, -6.4, 0.7);
          show(props.flowerB, 6.8, -0.35);
          show(props.grass, 9.4, 0.8, random());
          show(props.rockA, -12.4, -0.2, 0.6);
          show(props.rockB, 12.8, 0.4, 1.4);
        } else {
          show(props.path, 7.15, 0);
          show(props.fenceB, 8.55, 0);
          show(props.fenceC, 5.85, 0);
          show(props.surf, 6.2, 0.15, faceRoad(6.2));
          show(props.rockA, 13.2, 0.65, 0.9);
          show(props.flowerA, 9.6, 0.85);
        }
        placePalms(id, palms);
        for (const placement of sidePlacements(spawn)) {
          showExact(kit[placement.id], placement.x, placement.z, placement.yaw);
        }
        parkGrass(grassEntry);
      },
    };
    const grassEntry: LeftGrass = { group, patch: null, spawn: () => piece.spawn };
    leftGrass.push(grassEntry);
    mountGrass(grassEntry);
    made.push(piece);
    return piece;
  }

  function applyShadowQuality() {
    const size = quality === "high" ? 2048 : quality === "medium" ? 1024 : 0;
    renderer.shadowMap.enabled = size > 0;
    sun.castShadow = size > 0;
    if (size > 0 && sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      (sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    }
    oceanUniforms.uDetail.value = quality === "low" ? 0.4 : quality === "medium" ? 0.75 : 1;
    for (const parts of palmSets) {
      for (const mesh of parts) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    }
  }
  applyShadowQuality();

  return {
    dressing,
    update(focus, camera, time) {
      sky.position.copy(camera.position);
      ocean.position.z = focus.z;
      catcher.position.x = focus.x;
      catcher.position.z = focus.z;
      oceanUniforms.uTime.value = time;
      for (let variant = 0; variant < palmSets.length; variant += 1) {
        const parts = palmSets[variant];
        const list = palmSlots[variant];
        if (!parts || !list) continue;
        for (const slot of list) {
          const anchor = anchors.get(slot.id);
          const visible = slot.active && anchor && allows(slot.tier, quality);
          if (!visible || !anchor) {
            dummy.position.set(0, -40, 0);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.setScalar(0);
            dummy.updateMatrix();
          } else {
            dummy.position.set(slot.x, 0, slot.z);
            dummy.rotation.set(Math.sin(time * 1.25 + slot.phase) * 0.035, slot.yaw, Math.cos(time * 1.05 + slot.phase) * 0.02);
            dummy.scale.setScalar(slot.scale);
            dummy.updateMatrix();
            anchor.updateWorldMatrix(true, false);
            dummy.matrix.premultiply(anchor.matrixWorld);
          }
          for (const mesh of parts) mesh.setMatrixAt(slot.index, dummy.matrix);
        }
        for (const mesh of parts) {
          mesh.count = list.length;
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
    },
    setQuality(next) {
      quality = next;
      applyShadowQuality();
      for (const piece of made) piece.apply(piece.spawn);
    },
    dispose() {
      grassAlive = false;
      grassGeo.dispose();
      sandGeo.dispose();
      wetGeo.dispose();
      dashGeo.dispose();
      tickGeo.dispose();
      vergeGeo.dispose();
      shoulderGeo.dispose();
      edgeGeo.dispose();
      grassMat.dispose();
      sandMat.dispose();
      wetMat.dispose();
      shoulderMat.dispose();
      paintMat.dispose();
      tickMat.dispose();
      for (const entry of leftGrass) entry.patch?.dispose();
      grassGeometry?.dispose();
      if (grassSurface) {
        const textured = grassSurface as THREE.MeshStandardMaterial;
        textured.map?.dispose();
        grassSurface.dispose();
      }
      for (const parts of palmSets) {
        for (const mesh of parts) {
          mesh.geometry.dispose();
          const material = mesh.material as THREE.Material;
          material.dispose();
        }
      }
    },
  };
}
