import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { fitRunnerTuning as tuning } from "@/components/fitrunner-v2/tuning";

const ASSETS = {
  xbot: "/assets/fitrunner/xbot.glb",
  roads: ["/assets/fitrunner/kenney/road/roadTile_162.gltf"],
  trees: [
    "/assets/fitrunner/kenney/nature/tree_tall.glb",
    "/assets/fitrunner/kenney/nature/tree_default.glb",
    "/assets/fitrunner/kenney/nature/tree_oak.glb",
  ],
  bush: "/assets/fitrunner/kenney/nature/plant_bushLarge.glb",
  rock: "/assets/fitrunner/kenney/nature/rock_largeF.glb",
  log: "/assets/fitrunner/kenney/nature/log_large.glb",
  fence: "/assets/fitrunner/kenney/nature/fence_simple.glb",
  sceneryRock: "/assets/fitrunner/kenney/fantasy/rock-large.glb",
  sceneryFence: "/assets/fitrunner/kenney/fantasy/fence.glb",
  stall: "/assets/fitrunner/kenney/fantasy/stall-red.glb",
  fruit: "/assets/fitrunner/kenney/market/display-fruit.glb",
  bread: "/assets/fitrunner/kenney/market/display-bread.glb",
  shelf: "/assets/fitrunner/kenney/market/shelf-boxes.glb",
  basket: "/assets/fitrunner/kenney/market/shopping-basket.glb",
} as const;

const CLIPS = ["Run", "JumpUp", "ForwardRoll", "LongJump", "StandUp", "WipeSweat"] as const;
type ClipName = (typeof CLIPS)[number];
type Motion = "run" | "jump" | "fall" | "roll" | "celebrate" | "stand" | "longJump";
type ObstacleKind = "rock" | "log" | "fence";

export type FitRunnerHud = {
  clip: HTMLElement | null;
  lane: HTMLElement | null;
  motion: HTMLElement | null;
  speed: HTMLElement | null;
  score: HTMLElement | null;
};

export type FitRunnerHandle = {
  dispose: () => void;
  playClip: (clip: "StandUp" | "WipeSweat" | "LongJump") => void;
};

type Segment = {
  group: THREE.Group;
  spawn: number;
  obstacleKind: ObstacleKind | "none";
  obstacleLane: number;
  obstacles: Record<ObstacleKind, THREE.Object3D>;
  coin: THREE.Object3D;
  coinLane: number;
  coinActive: boolean;
};

const laneNames = ["left", "center", "right"] as const;

function laneLabel(lane: number) {
  return laneNames[lane + 1] ?? "center";
}

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function prepareMaterials(root: THREE.Object3D, shadows: { cast: boolean; receive: boolean }) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = shadows.cast;
    mesh.receiveShadow = shadows.receive;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if ("metalness" in material) material.metalness = 0;
      if ("roughness" in material) material.roughness = 1;
    }
  });
}

function seat(object: THREE.Object3D, mode: "top" | "bottom") {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  object.position.x -= (box.min.x + box.max.x) / 2;
  object.position.z -= (box.min.z + box.max.z) / 2;
  object.position.y -= mode === "top" ? box.max.y : box.min.y;
  const wrapper = new THREE.Group();
  wrapper.add(object);
  return { wrapper, size };
}

function fitHeight(object: THREE.Object3D, height: number) {
  object.scale.set(1, 1, 1);
  const box = new THREE.Box3().setFromObject(object);
  const current = Math.max(0.0001, box.max.y - box.min.y);
  object.scale.setScalar(height / current);
  return seat(object, "bottom").wrapper;
}

function fitBox(object: THREE.Object3D, target: { x: number; y: number; z: number }) {
  object.scale.set(1, 1, 1);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  object.scale.set(
    target.x / Math.max(size.x, 0.0001),
    target.y / Math.max(size.y, 0.0001),
    target.z / Math.max(size.z, 0.0001),
  );
  return seat(object, "bottom").wrapper;
}

type RootCurve = {
  times: Float32Array;
  y: Float32Array;
  z: Float32Array;
};

function sampleCurve(times: Float32Array, values: Float32Array, time: number) {
  const last = times.length - 1;
  if (last < 0) return 0;
  const startTime = times[0] ?? 0;
  const endTime = times[last] ?? startTime;
  const clamped = Math.min(Math.max(time, startTime), endTime);
  let index = 0;
  while (index < last && (times[index + 1] ?? endTime) < clamped) index += 1;
  const next = Math.min(index + 1, last);
  const from = times[index] ?? startTime;
  const to = times[next] ?? from;
  const span = to - from;
  const weight = span <= 1e-5 ? 0 : (clamped - from) / span;
  const a = values[index] ?? 0;
  const b = values[next] ?? a;
  return a + (b - a) * weight;
}

/** Mixamo loop clips repeat the first pose on the last key. Playing that key snaps the body back. */
function endBeforeLoop(curve: RootCurve): number {
  const last = curve.z.length - 1;
  if (last <= 0) return 0;
  let peak = 0;
  for (let index = 0; index < curve.z.length; index += 1) peak = Math.max(peak, Math.abs(curve.z[index] ?? 0));
  if (peak > 0.4 && Math.abs(curve.z[last] ?? 0) < peak * 0.25) return curve.times[last - 1] ?? 0;
  return curve.times[last] ?? 0;
}

/** Keep skeletal pose motion. Move large horizontal travel, and JumpUp's vertical arc, onto the parent. */
function extractRoot(clip: THREE.AnimationClip, liftVertical: boolean): RootCurve {
  const track = clip.tracks.find((item) => item.name === "mixamorigHips.position");
  if (!track) throw new Error(`${clip.name} has no hips position track.`);
  const times = track.times;
  const values = track.values;
  const originX = values[0] ?? 0;
  const originY = values[1] ?? 0;
  const originZ = values[2] ?? 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let index = 0; index < times.length; index += 1) {
    const x = values[index * 3] ?? 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  const stripLateral = maxX - minX > 0.5;
  const curve: RootCurve = {
    times: Float32Array.from(times),
    y: new Float32Array(times.length),
    z: new Float32Array(times.length),
  };
  for (let index = 0; index < times.length; index += 1) {
    const x = values[index * 3] ?? 0;
    const y = values[index * 3 + 1] ?? 0;
    const z = values[index * 3 + 2] ?? 0;
    curve.y[index] = y - originY;
    curve.z[index] = z - originZ;
    values[index * 3 + 2] = originZ;
    if (stripLateral) values[index * 3] = originX;
    if (liftVertical) values[index * 3 + 1] = originY;
  }
  return curve;
}

function shadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(32, 32, 4, 32, 32, 32);
  gradient.addColorStop(0, "rgba(0,0,0,0.5)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

async function loadAsset(url: string) {
  try {
    return await new GLTFLoader().loadAsync(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load ${url}: ${message}`);
  }
}

export async function startFitRunner(canvas: HTMLCanvasElement, hud: FitRunnerHud): Promise<FitRunnerHandle> {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor("#b7d3e6");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#b7d3e6");
  scene.fog = new THREE.Fog("#b7d3e6", 26, 68);

  const camera = new THREE.PerspectiveCamera(tuning.camera.fov, 1, 0.1, 120);
  camera.position.set(0, tuning.camera.height, tuning.camera.distance);

  scene.add(new THREE.HemisphereLight("#e7f4ff", "#6f8b49", 1.15));
  scene.add(new THREE.AmbientLight("#ffffff", 0.28));
  const sun = new THREE.DirectionalLight("#fff3d8", 2.05);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 28;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshStandardMaterial({ color: "#6f8f45", roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  scene.add(ground);

  try {
    const [xbot, bushGltf, rockGltf, logGltf, fenceGltf, sceneryRockGltf, sceneryFenceGltf, stallGltf, fruitGltf, breadGltf, shelfGltf, basketGltf, ...roadGltfs] =
      await Promise.all([
        loadAsset(ASSETS.xbot),
        loadAsset(ASSETS.bush),
        loadAsset(ASSETS.rock),
        loadAsset(ASSETS.log),
        loadAsset(ASSETS.fence),
        loadAsset(ASSETS.sceneryRock),
        loadAsset(ASSETS.sceneryFence),
        loadAsset(ASSETS.stall),
        loadAsset(ASSETS.fruit),
        loadAsset(ASSETS.bread),
        loadAsset(ASSETS.shelf),
        loadAsset(ASSETS.basket),
        ...ASSETS.roads.map((url) => loadAsset(url)),
        ...ASSETS.trees.map((url) => loadAsset(url)),
      ]);

    const treeGltfs = roadGltfs.splice(ASSETS.roads.length);
    if (xbot.animations.length !== CLIPS.length) {
      throw new Error(`Expected ${CLIPS.length} clips, found ${xbot.animations.map((clip) => clip.name).join(", ") || "none"}.`);
    }
    const roots = {} as Record<ClipName, RootCurve>;
    for (const clip of xbot.animations) {
      if (!CLIPS.includes(clip.name as ClipName)) {
        throw new Error(`Unexpected clip ${clip.name}.`);
      }
      roots[clip.name as ClipName] = extractRoot(clip, clip.name === "JumpUp");
    }

    const model = xbot.scene;
    const mixer = new THREE.AnimationMixer(model);
    const actions = {} as Record<ClipName, THREE.AnimationAction>;
    for (const clip of xbot.animations) {
      if (!CLIPS.includes(clip.name as ClipName)) {
        throw new Error(`Unexpected clip ${clip.name}.`);
      }
      const action = mixer.clipAction(clip);
      action.enabled = true;
      actions[clip.name as ClipName] = action;
    }
    const missing = CLIPS.filter((name) => !actions[name]);
    if (missing.length) throw new Error(`X Bot GLB is missing ${missing.join(", ")}.`);

    let skinnedCount = 0;
    let bodyMesh: THREE.SkinnedMesh | null = null;
    const skinMaterials: THREE.MeshStandardMaterial[] = [];
    model.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      bodyMesh = mesh;
      skinnedCount += 1;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) skinMaterials.push(material);
      }
    });
    if (skinnedCount !== 1) throw new Error(`Expected one skinned mesh, found ${skinnedCount}.`);

    const runAction = actions.Run;
    runAction.setLoop(THREE.LoopRepeat, Infinity);
    runAction.timeScale = tuning.runTimeScale;
    runAction.play();
    let jumpApex = 0;
    for (let index = 1; index < roots.JumpUp.y.length; index += 1) {
      if ((roots.JumpUp.y[index] ?? 0) > (roots.JumpUp.y[jumpApex] ?? 0)) jumpApex = index;
    }
    const jumpApexTime = roots.JumpUp.times[jumpApex] ?? actions.JumpUp.getClip().duration;
    const rollEndTime = endBeforeLoop(roots.ForwardRoll);
    actions.JumpUp.getClip().duration = jumpApexTime;
    actions.ForwardRoll.getClip().duration = rollEndTime;
    mixer.update(0);

    model.rotation.y = tuning.modelYaw;
    model.updateWorldMatrix(true, true);
    model.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh) mesh.computeBoundingBox();
    });
    const posed = new THREE.Box3().setFromObject(model);
    model.position.x -= (posed.min.x + posed.max.x) / 2;
    model.position.z -= (posed.min.z + posed.max.z) / 2;
    model.position.y -= posed.min.y;

    const visual = new THREE.Group();
    visual.add(model);
    const runner = new THREE.Group();
    runner.add(visual);
    scene.add(runner);

    const shadowMap = shadowTexture();
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({
        map: shadowMap,
        transparent: true,
        depthWrite: false,
        color: "#000000",
      }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.04;
    scene.add(blob);

    const landing = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.38, 24),
      new THREE.MeshBasicMaterial({ color: "#f2f6ef", transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    landing.rotation.x = -Math.PI / 2;
    landing.position.y = 0.05;
    scene.add(landing);

    function roadTemplate(gltfScene: THREE.Group) {
      prepareMaterials(gltfScene, { cast: false, receive: true });
      // These tiles run along X. Turn them so the asphalt continues down the -Z track.
      gltfScene.rotation.y = -Math.PI / 2;
      const seated = seat(gltfScene, "top");
      seated.wrapper.scale.setScalar((tuning.tileSize * 1.02) / Math.max(seated.size.x, 0.0001));
      return seated.wrapper;
    }

    const roads = roadGltfs.map((gltf) => roadTemplate(gltf.scene));

    const trees = treeGltfs.map((gltf) => {
      prepareMaterials(gltf.scene, { cast: true, receive: true });
      return fitHeight(gltf.scene, tuning.props.treeHeight);
    });
    prepareMaterials(bushGltf.scene, { cast: true, receive: true });
    const bush = fitHeight(bushGltf.scene, tuning.props.bushHeight);
    prepareMaterials(rockGltf.scene, { cast: true, receive: true });
    const rock = fitHeight(rockGltf.scene, tuning.props.rockHeight);
    prepareMaterials(logGltf.scene, { cast: true, receive: true });
    const log = fitBox(logGltf.scene, tuning.props.log);
    prepareMaterials(fenceGltf.scene, { cast: true, receive: true });
    const fence = fitBox(fenceGltf.scene, tuning.props.fence);
    prepareMaterials(sceneryRockGltf.scene, { cast: true, receive: true });
    const sceneryRock = fitHeight(sceneryRockGltf.scene, tuning.props.sceneryRockHeight);
    prepareMaterials(sceneryFenceGltf.scene, { cast: true, receive: true });
    const sceneryFence = fitBox(sceneryFenceGltf.scene, tuning.props.sceneryFence);
    prepareMaterials(stallGltf.scene, { cast: true, receive: true });
    const stall = fitHeight(stallGltf.scene, tuning.props.stallHeight);
    prepareMaterials(fruitGltf.scene, { cast: true, receive: true });
    const fruit = fitHeight(fruitGltf.scene, tuning.props.marketHeight);
    prepareMaterials(breadGltf.scene, { cast: true, receive: true });
    const bread = fitHeight(breadGltf.scene, tuning.props.marketHeight);
    prepareMaterials(shelfGltf.scene, { cast: true, receive: true });
    const shelf = fitHeight(shelfGltf.scene, tuning.props.marketHeight + 0.35);
    prepareMaterials(basketGltf.scene, { cast: true, receive: true });
    const basket = fitHeight(basketGltf.scene, tuning.props.basketHeight);

    const shop = new THREE.Group();
    const stallClone = stall.clone(true);
    const fruitClone = fruit.clone(true);
    fruitClone.position.set(1.7, 0, 0.3);
    const breadClone = bread.clone(true);
    breadClone.position.set(-1.55, 0, 0.45);
    const shelfClone = shelf.clone(true);
    shelfClone.position.set(0.15, 0, -1.25);
    const basketClone = basket.clone(true);
    basketClone.position.set(1.7, 0, 1.1);
    shop.add(stallClone, fruitClone, breadClone, shelfClone, basketClone);

    const coinGeometry = new THREE.TorusGeometry(0.28, 0.09, 10, 18);
    const coinMaterial = new THREE.MeshStandardMaterial({
      color: "#f0c14a",
      emissive: "#8a6414",
      roughness: 0.45,
      metalness: 0.15,
    });
    const discGeometry = new THREE.CircleGeometry(0.55, 20);
    const discMaterials: Record<ObstacleKind, THREE.MeshBasicMaterial> = {
      rock: new THREE.MeshBasicMaterial({ color: "#4e463e", transparent: true, opacity: 0.4, depthWrite: false }),
      log: new THREE.MeshBasicMaterial({ color: "#6a4528", transparent: true, opacity: 0.4, depthWrite: false }),
      fence: new THREE.MeshBasicMaterial({ color: "#8d3b3b", transparent: true, opacity: 0.45, depthWrite: false }),
    };

    function makeSegment(spawn: number): Segment {
      const group = new THREE.Group();
      const road = roads[Math.abs(spawn) % roads.length] ?? roads[0];
      if (!road) throw new Error("No road tile loaded.");
      for (const lane of [-1, 0, 1]) {
        const tile = road.clone(true);
        tile.position.set(lane * tuning.tileSize, 0, 0);
        group.add(tile);
      }
      const side = spawn % 2 === 0 ? 1 : -1;
      const tree = trees[Math.abs(spawn) % trees.length]?.clone(true);
      if (tree && spawn % 2 === 0) {
        tree.position.set(side * tuning.sceneryX.tree, 0, 0);
        tree.rotation.y = spawn * 0.7;
        group.add(tree);
      }
      if (spawn % 4 === 1) {
        const plant = bush.clone(true);
        plant.position.set(-side * (tuning.sceneryX.tree - 1.2), 0, 0.4);
        group.add(plant);
      }
      if (spawn % 5 === 2) {
        const market = shop.clone(true);
        market.position.set(side * tuning.sceneryX.shop, 0, 0);
        market.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        group.add(market);
      }
      if (spawn % 4 === 0) {
        const edgeFence = sceneryFence.clone(true);
        edgeFence.position.set(side * tuning.sceneryX.fence, 0, 0);
        group.add(edgeFence);
        const edgeRock = sceneryRock.clone(true);
        edgeRock.position.set(-side * tuning.sceneryX.rock, 0, 0.2);
        group.add(edgeRock);
      }

      const obstacles = {
        rock: rock.clone(true),
        log: log.clone(true),
        fence: fence.clone(true),
      } satisfies Record<ObstacleKind, THREE.Object3D>;
      for (const kind of Object.keys(obstacles) as ObstacleKind[]) {
        const marker = new THREE.Mesh(discGeometry, discMaterials[kind]);
        marker.name = "ground-disc";
        marker.rotation.x = -Math.PI / 2;
        marker.position.y = kind === "fence" ? 0.03 - tuning.fenceGap : 0.03;
        obstacles[kind].add(marker);
        obstacles[kind].visible = false;
        group.add(obstacles[kind]);
      }
      const coin = new THREE.Mesh(coinGeometry, coinMaterial);
      coin.position.y = 1.05;
      coin.castShadow = true;
      coin.visible = false;
      group.add(coin);

      const segment: Segment = {
        group,
        spawn,
        obstacleKind: "none",
        obstacleLane: 0,
        obstacles,
        coin,
        coinLane: 0,
        coinActive: false,
      };
      refill(segment, spawn);
      scene.add(group);
      return segment;
    }

    function refill(segment: Segment, spawn: number) {
      segment.spawn = spawn;
      segment.group.position.z = segment.group.position.z;
      const random = rng(spawn * 9176 + 42);
      const kinds: ObstacleKind[] = ["rock", "log", "fence"];
      const placeObstacle = spawn >= tuning.obstacleLeadIn && spawn % tuning.obstacleEvery === 0;
      for (const kind of kinds) segment.obstacles[kind].visible = false;
      if (placeObstacle) {
        const kind = kinds[Math.floor(random() * kinds.length)] ?? "rock";
        const lane = Math.floor(random() * 3) - 1;
        segment.obstacleKind = kind;
        segment.obstacleLane = lane;
        const mesh = segment.obstacles[kind];
        mesh.visible = true;
        mesh.position.set(lane * tuning.laneSpacing, kind === "fence" ? tuning.fenceGap : 0, 0);
      } else {
        segment.obstacleKind = "none";
      }

      const placeCoin = spawn % tuning.coinEvery === 1 && spawn > 1;
      segment.coinActive = placeCoin;
      segment.coin.visible = placeCoin;
      if (placeCoin) {
        let lane = Math.floor(random() * 3) - 1;
        if (lane === segment.obstacleLane && segment.obstacleKind !== "none") {
          lane = lane === 1 ? -1 : lane + 1;
        }
        segment.coinLane = lane;
        segment.coin.position.x = lane * tuning.laneSpacing;
        segment.coin.position.y = 1.05;
      }
    }

    const segments: Segment[] = [];
    for (let index = 0; index < tuning.segmentCount; index += 1) {
      const segment = makeSegment(index);
      segment.group.position.z = tuning.tileSize * 2 - index * tuning.tileSize;
      segments.push(segment);
    }
    let nextSpawn = tuning.segmentCount;

    let lane = 0;
    let laneFrom = 0;
    let laneTo = 0;
    let laneT = 1;
    let visualLane = 0;
    let motion: Motion = "run";
    let activeClip: ClipName = "Run";
    let current: THREE.AnimationAction = runAction;
    let motionEndsAt = 0;
    let elapsed = 0;
    let distance = 0;
    let coins = 0;
    let speedMul = 1;
    let invuln = 0;
    let landingLife = 0;
    let shake = 0;
    let flash = 0;
    let fallSpeed = 0;
    let rollCursor = 0;
    let nearestAhead = "none";
    let stopped = false;
    let frame = 0;
    const clock = new THREE.Clock();

    function fadeTo(action: THREE.AnimationAction, fade = tuning.crossfade) {
      if (current !== action) current.fadeOut(fade);
      action.reset();
      action.fadeIn(fade).play();
      current = action;
    }

    function playRun() {
      if (motion === "run" && current === runAction) return;
      runAction.setLoop(THREE.LoopRepeat, Infinity);
      runAction.clampWhenFinished = false;
      runAction.timeScale = tuning.runTimeScale;
      fadeTo(runAction, motion === "fall" ? 0.16 : tuning.crossfade);
      motion = "run";
      activeClip = "Run";
    }

    function playOnce(clip: ClipName, duration: number, nextMotion: Motion) {
      if (motion !== "run") return false;
      const action = actions[clip];
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = 1;
      fadeTo(action);
      motion = nextMotion;
      activeClip = clip;
      motionEndsAt = elapsed + duration;
      return true;
    }

    function jump() {
      if (motion !== "run") return false;
      const action = actions.JumpUp;
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = 1;
      fadeTo(action, 0.06);
      motion = "jump";
      activeClip = "JumpUp";
      motionEndsAt = Number.POSITIVE_INFINITY;
      fallSpeed = 0;
      return true;
    }

    function roll() {
      if (motion !== "run") return false;
      const action = actions.ForwardRoll;
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = 1;
      action.paused = false;
      fadeTo(action, 0.08);
      motion = "roll";
      activeClip = "ForwardRoll";
      motionEndsAt = elapsed + rollEndTime;
      rollCursor = 0;
      return true;
    }

    function playClip(clip: "StandUp" | "WipeSweat" | "LongJump") {
      const duration = Math.max(0.05, actions[clip].getClip().duration);
      const nextMotion: Motion = clip === "WipeSweat" ? "celebrate" : clip === "StandUp" ? "stand" : "longJump";
      playOnce(clip, duration, nextMotion);
    }

    function stepLane(direction: -1 | 1) {
      const next = Math.max(-1, Math.min(1, lane + direction));
      if (next === lane && laneT >= 1) return;
      lane = next;
      laneFrom = visualLane;
      laneTo = next;
      laneT = 0;
    }

    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const code = event.code;
      if (code === "ArrowLeft" || code === "KeyA") {
        event.preventDefault();
        stepLane(-1);
      } else if (code === "ArrowRight" || code === "KeyD") {
        event.preventDefault();
        stepLane(1);
      } else if (code === "Space" || code === "ArrowUp") {
        event.preventDefault();
        jump();
      } else if (code === "ArrowDown" || code === "KeyS") {
        event.preventDefault();
        roll();
      } else if (code === "KeyC") {
        event.preventDefault();
        playClip("WipeSweat");
      }
    }

    function resize() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 2 || height < 2) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function publish() {
      const speed = Math.min(tuning.maxSpeed, tuning.forwardSpeed + elapsed * tuning.speedGain) * speedMul;
      const score = Math.floor(distance * tuning.distancePoints + coins * tuning.coinPoints);
      canvas.dataset.ready = "true";
      canvas.dataset.clip = activeClip;
      canvas.dataset.lane = laneLabel(lane);
      canvas.dataset.motion = motion;
      canvas.dataset.score = String(score);
      canvas.dataset.ahead = nearestAhead;
      canvas.dataset.jumpTime = `${actions.JumpUp.time.toFixed(2)}/${actions.JumpUp.getClip().duration.toFixed(2)}/${runner.position.y.toFixed(2)}`;
      canvas.dataset.animTime = current.time.toFixed(3);
      canvas.dataset.hit = invuln > 0 ? "1" : "0";
      if (hud.clip) hud.clip.textContent = activeClip;
      if (hud.lane) hud.lane.textContent = laneLabel(lane);
      if (hud.motion) hud.motion.textContent = invuln > 0 ? `${motion} · hit` : motion;
      if (hud.speed) hud.speed.textContent = `${speed.toFixed(1)} m/s`;
      if (hud.score) hud.score.textContent = String(score);
    }

    function recycle() {
      for (let guard = 0; guard < segments.length; guard += 1) {
        let back = segments[0];
        let front = segments[0];
        if (!back || !front) return;
        for (const segment of segments) {
          if (segment.group.position.z > back.group.position.z) back = segment;
          if (segment.group.position.z < front.group.position.z) front = segment;
        }
        if (back.group.position.z <= runner.position.z + tuning.recycleBehind) break;
        back.group.position.z = front.group.position.z - tuning.tileSize;
        refill(back, nextSpawn);
        nextSpawn += 1;
      }
    }

    const skinVertex = new THREE.Vector3();
    const skinAccum = new THREE.Vector3();
    const skinInfluenced = new THREE.Vector3();
    const skinMatrix = new THREE.Matrix4();
    const flashColor = new THREE.Color(1, 0.28, 0.2);

    function bodyBox() {
      const box = new THREE.Box3();
      if (!bodyMesh) return box;
      const position = bodyMesh.geometry.attributes.position;
      const skinIndex = bodyMesh.geometry.attributes.skinIndex;
      const skinWeight = bodyMesh.geometry.attributes.skinWeight;
      if (!position || !skinIndex || !skinWeight) return box;
      bodyMesh.updateWorldMatrix(true, false);
      bodyMesh.skeleton.update();
      const bones = bodyMesh.skeleton.boneMatrices;
      for (let index = 0; index < position.count; index += 8) {
        skinVertex.fromBufferAttribute(position, index);
        skinAccum.set(0, 0, 0);
        for (let influence = 0; influence < 4; influence += 1) {
          const weight = skinWeight.getComponent(index, influence);
          if (weight === 0) continue;
          skinMatrix.fromArray(bones, skinIndex.getComponent(index, influence) * 16);
          skinInfluenced.copy(skinVertex).applyMatrix4(skinMatrix).multiplyScalar(weight);
          skinAccum.add(skinInfluenced);
        }
        box.expandByPoint(skinAccum);
      }
      return box;
    }

    function obstacleBox(object: THREE.Object3D) {
      const box = new THREE.Box3();
      object.updateWorldMatrix(true, true);
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || mesh.name === "ground-disc" || !mesh.geometry) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const bounds = mesh.geometry.boundingBox;
        if (!bounds) return;
        box.union(bounds.clone().applyMatrix4(mesh.matrixWorld));
      });
      return box;
    }

    function collide() {
      for (const segment of segments) {
        if (!segment.coinActive) continue;
        const sameLane = Math.abs(visualLane - segment.coinLane) < tuning.laneStick;
        const depth = Math.abs(segment.group.position.z - runner.position.z);
        if (sameLane && depth < tuning.coinDepth) {
          segment.coinActive = false;
          segment.coin.visible = false;
          coins += 1;
        }
      }

      nearestAhead = "none";
      let aheadDistance = Number.POSITIVE_INFINITY;
      const body = bodyBox();
      for (const segment of segments) {
        if (segment.obstacleKind === "none") continue;
        const kind = segment.obstacleKind;
        const distance = runner.position.z - segment.group.position.z;
        if (distance > -0.4 && distance < aheadDistance) {
          aheadDistance = distance;
          nearestAhead = `${kind}:${laneLabel(segment.obstacleLane)}:${distance.toFixed(2)}`;
        }
        const bounds = obstacleBox(segment.obstacles[kind]);
        if (bounds.isEmpty() || !body.intersectsBox(bounds)) continue;
        const separation = bounds.max.z + 0.22 - body.min.z;
        if (separation > 0) runner.position.z += separation;
        if (invuln > 0) continue;
        invuln = tuning.invulnerable;
        speedMul = tuning.hitSlowMultiplier;
        shake = 0.28;
        flash = 1;
      }
    }

    function tick() {
      if (stopped) return;
      frame = window.requestAnimationFrame(tick);
      if (canvas.dataset.hold === "1") {
        clock.getDelta();
        return;
      }
      const dt = Math.min(0.05, clock.getDelta());
      elapsed += dt;
      if ((motion === "roll" || motion === "celebrate" || motion === "stand" || motion === "longJump") && elapsed >= motionEndsAt) {
        playRun();
      }

      if (laneT < 1) {
        laneT = Math.min(1, laneT + dt / tuning.laneChangeDuration);
        const shaped = laneT * laneT * (3 - 2 * laneT);
        visualLane = laneFrom + (laneTo - laneFrom) * shaped;
      }
      const leanTarget = (laneTo - visualLane) * tuning.leanRadians * 3;
      visual.rotation.z = THREE.MathUtils.damp(visual.rotation.z, leanTarget, tuning.leanDamp, dt);
      runner.position.x = visualLane * tuning.laneSpacing;

      if (motion === "jump") {
        if (actions.JumpUp.time > jumpApexTime) {
          actions.JumpUp.time = jumpApexTime;
          actions.JumpUp.paused = true;
        }
        runner.position.y = sampleCurve(roots.JumpUp.times, roots.JumpUp.y, Math.min(actions.JumpUp.time, jumpApexTime));
        if (actions.JumpUp.time >= jumpApexTime - 0.02) {
          motion = "fall";
          fallSpeed = 0;
        }
      } else if (motion === "fall") {
        fallSpeed += tuning.fallGravity * dt;
        runner.position.y -= fallSpeed * dt;
      } else if (motion !== "roll") {
        runner.position.y = THREE.MathUtils.damp(runner.position.y, 0, 16, dt);
      }

      speedMul = Math.min(1, speedMul + dt * tuning.hitRecovery);
      invuln = Math.max(0, invuln - dt);
      flash = Math.max(0, flash - dt * 2.2);
      for (const material of skinMaterials) {
        const base = material.userData.baseColor ?? (material.userData.baseColor = material.color.clone());
        material.color.copy(base).lerp(flashColor, flash * 0.65);
        material.emissive.setRGB(flash * 1.4, flash * 0.25, flash * 0.12);
      }

      const speed = Math.min(tuning.maxSpeed, tuning.forwardSpeed + elapsed * tuning.speedGain) * speedMul;
      if (motion === "roll") {
        if (actions.ForwardRoll.time > rollEndTime) {
          actions.ForwardRoll.time = rollEndTime;
          actions.ForwardRoll.paused = true;
        }
        const rollTime = Math.min(actions.ForwardRoll.time, rollEndTime);
        const traveled = sampleCurve(roots.ForwardRoll.times, roots.ForwardRoll.z, rollTime);
        const step = traveled - rollCursor;
        runner.position.z -= step;
        distance += Math.max(0, step);
        rollCursor = traveled;
      } else {
        runner.position.z -= speed * dt;
        distance += speed * dt;
      }
      mixer.update(dt);
      if (motion === "fall" && fallSpeed > 0.2) {
        const lowest = bodyBox().min.y;
        if (lowest <= 0.02) {
          runner.position.y -= lowest;
          fallSpeed = 0;
          landingLife = 0.28;
          landing.position.set(runner.position.x, 0.05, runner.position.z);
          landing.scale.setScalar(0.55);
          playRun();
        }
      }
      recycle();
      collide();

      for (const segment of segments) {
        if (!segment.coin.visible) continue;
        segment.coin.rotation.y += dt * 2.4;
        segment.coin.position.y = 1.05 + Math.sin(elapsed * 4 + segment.spawn) * 0.08;
      }

      const jumpLift = Math.max(0, runner.position.y);
      const jumpScale = 1 - Math.min(1, jumpLift / 0.7) * 0.45;
      blob.position.set(runner.position.x, 0.04, runner.position.z);
      blob.scale.setScalar(jumpScale);
      const blobMaterial = blob.material as THREE.MeshBasicMaterial;
      blobMaterial.opacity = 0.35 + 0.4 * jumpScale;

      if (landingLife > 0) {
        landingLife -= dt;
        landing.scale.setScalar(0.4 + (0.35 - landingLife) * 6);
        const landingMaterial = landing.material as THREE.MeshBasicMaterial;
        landingMaterial.opacity = Math.max(0, landingLife * 2);
      }

      shake = Math.max(0, shake - dt);
      if (camera.fov !== tuning.camera.fov) {
        camera.fov = tuning.camera.fov;
        camera.updateProjectionMatrix();
      }
      const desired = new THREE.Vector3(
        runner.position.x + Math.sin(elapsed * 48) * shake,
        tuning.camera.height,
        runner.position.z + tuning.camera.distance,
      );
      const follow = 1 - Math.exp(-tuning.camera.smooth * dt);
      camera.position.lerp(desired, follow);
      camera.lookAt(runner.position.x, tuning.camera.lookHeight, runner.position.z - tuning.camera.lookAhead);

      sun.position.set(runner.position.x + 5, 11, runner.position.z + 7);
      sun.target.position.set(runner.position.x, 0, runner.position.z - 2);
      publish();
      renderer.render(scene, camera);
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", resize);
    resize();
    publish();
    frame = window.requestAnimationFrame(tick);

    return {
      playClip,
      dispose() {
        stopped = true;
        window.cancelAnimationFrame(frame);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", resize);
        mixer.stopAllAction();
        renderer.dispose();
        coinGeometry.dispose();
        coinMaterial.dispose();
        discGeometry.dispose();
        for (const material of Object.values(discMaterials)) material.dispose();
      },
    };
  } catch (error) {
    renderer.dispose();
    throw error;
  }
}
