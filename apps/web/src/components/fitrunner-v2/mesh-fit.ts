import * as THREE from "three";

export function prepareMaterials(root: THREE.Object3D, shadows: { cast: boolean; receive: boolean }) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = shadows.cast;
    mesh.receiveShadow = shadows.receive;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if ("metalness" in material) material.metalness = 0.02;
      if ("roughness" in material) material.roughness = 0.84;
    }
  });
}

export function seat(object: THREE.Object3D, mode: "top" | "bottom") {
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

export function fitHeight(object: THREE.Object3D, height: number) {
  object.scale.set(1, 1, 1);
  const box = new THREE.Box3().setFromObject(object);
  const current = Math.max(0.0001, box.max.y - box.min.y);
  object.scale.setScalar(height / current);
  return seat(object, "bottom").wrapper;
}

export function fitBox(object: THREE.Object3D, target: { x: number; y: number; z: number }) {
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
