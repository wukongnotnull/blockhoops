// Collapse the static diorama into a few draw calls: meshes sharing a material
// (and shadow flags) are baked into one geometry in the group's space.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse((obj) => {
    if (!obj.isMesh || Array.isArray(obj.material) || obj.userData.float) return;
    const geo = obj.geometry;
    const key = `${obj.material.uuid}|${obj.castShadow}|${obj.receiveShadow}|${geo.index ? 'i' : 'n'}`;
    if (!buckets.has(key)) buckets.set(key, { material: obj.material, cast: obj.castShadow, receive: obj.receiveShadow, items: [] });
    buckets.get(key).items.push(obj);
  });
  for (const bucket of buckets.values()) {
    if (bucket.items.length < 2) continue;
    const geos = bucket.items.map((m) => {
      const g = m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, m.matrixWorld));
      return g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    bucket.items.forEach((m) => m.parent.remove(m));
    const mesh = new THREE.Mesh(merged, bucket.material);
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.receive;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}
