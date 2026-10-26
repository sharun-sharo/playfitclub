import * as THREE from "three";
import { phoneAnisotropy, type PhoneDrawPreset } from "@/components/fitrunner-v2/phone-draw";

const COLOR_MAPS = new Set(["map", "emissiveMap"]);
const MAPS = ["map", "emissiveMap", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "alphaMap"] as const;

/**
 * Sets anisotropy and sRGB on color maps that are already on the scene.
 * Materials stay the objects they are. A skinned mesh is not cloned and not rescaled.
 */
export function applyPhoneTextureClarity(root: THREE.Object3D, preset: PhoneDrawPreset, gpuMaxAnisotropy: number) {
  const anisotropy = phoneAnisotropy(preset, gpuMaxAnisotropy);
  const seen = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const record = material as unknown as Record<string, THREE.Texture | null | undefined>;
      for (const key of MAPS) {
        const texture = record[key];
        if (!texture || seen.has(texture)) continue;
        seen.add(texture);
        if (COLOR_MAPS.has(key) && texture.colorSpace !== THREE.SRGBColorSpace) {
          texture.colorSpace = THREE.SRGBColorSpace;
        }
        if (texture.anisotropy !== anisotropy) {
          texture.anisotropy = anisotropy;
          texture.needsUpdate = true;
        }
      }
    }
  });
  return anisotropy;
}
