// The floating city block: layered slab, sidewalks, brownstones, fence, lamps and props.
import * as THREE from 'three';
import { COURT } from '../sim/config.js';
import { createWindowTextures, createChainLinkTexture, createMuralTexture } from './textures.js';
import { mergeStatic } from './merge.js';

export const BLOCK = Object.freeze({ minX: -24, maxX: 24, minZ: -19, maxZ: 15, top: 0 });
const FENCE = Object.freeze({ x: COURT.halfL + 2.4, z: COURT.halfW + 2.2, height: 3.4 });

// Shared per color/options so static meshes can be merged by material.
const materialCache = new Map();
const mat = (color, opts = {}) => {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!materialCache.has(key)) materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }));
  return materialCache.get(key);
};

function mesh(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function place(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}

function buildSlab(group) {
  const w = BLOCK.maxX - BLOCK.minX;
  const d = BLOCK.maxZ - BLOCK.minZ;
  const cz = (BLOCK.maxZ + BLOCK.minZ) / 2;
  group.add(place(mesh(new THREE.BoxGeometry(w, 0.4, d), mat(0xb9b0a2)), 0, -0.2, cz));
  group.add(place(mesh(new THREE.BoxGeometry(w - 0.2, 0.18, d - 0.2), mat(0x8f877b), { cast: false }), 0, -0.47, cz));
  group.add(place(mesh(new THREE.BoxGeometry(w - 0.6, 1.8, d - 0.6), mat(0x5d3f33)), 0, -1.45, cz));
  group.add(place(mesh(new THREE.BoxGeometry(w - 1.4, 0.25, d - 1.4), mat(0x3f6b3a), { cast: false }), 0, -2.45, cz));

  const rock = mat(0x463c4f, { flatShading: true, roughness: 1 });
  const rng = mulberry(7);
  for (let i = 0; i < 26; i += 1) {
    const t = i / 26;
    const r = 3 + rng() * 5 * (1 - t * 0.5);
    const sy = 0.6 + rng() * 0.5;
    const chunk = mesh(new THREE.DodecahedronGeometry(r, 0), rock, { cast: false });
    chunk.scale.set(1.3, sy, 1);
    chunk.rotation.set(0, rng() * 3, 0);
    const spread = 1 - t * 0.75;
    const topY = -2.4 - t * 7;
    chunk.position.set((rng() - 0.5) * (w - 14) * spread, topY - r * sy, cz + (rng() - 0.5) * (d - 12) * spread);
    group.add(chunk);
  }
  for (let i = 0; i < 6; i += 1) {
    const pebble = mesh(new THREE.DodecahedronGeometry(0.6 + rng() * 1.1, 0), rock, { cast: false });
    const a = rng() * Math.PI * 2;
    pebble.position.set(Math.cos(a) * 30, -4 - rng() * 6, cz + Math.sin(a) * 22);
    pebble.userData.float = { base: pebble.position.y, phase: rng() * 6 };
    group.add(pebble);
  }
}

function mulberry(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Materials the environment retunes: lit windows per building and the shared lamp bulbs.
const facades = [];
const BULB = new THREE.MeshBasicMaterial({ color: 0xffd59a });

const FACADES = [0x8a3b2e, 0xa4553a, 0xd8c3a0, 0x4f6d74, 0xc9973f, 0x6d3a4a, 0x9a4b32];

function buildBuilding(x, width, height, depth, color, seed, opts = {}) {
  const g = new THREE.Group();
  const cols = Math.max(2, Math.round(width / 1.6));
  const rows = Math.max(2, Math.round(height / 2.6));
  const { map, emissive } = createWindowTextures(cols, rows, seed, opts.shop);
  const facade = new THREE.MeshStandardMaterial({
    color, map, emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.9,
  });
  facades.push(facade);
  const body = mesh(new THREE.BoxGeometry(width, height, depth), mat(color));
  body.position.y = height / 2;
  const front = mesh(new THREE.PlaneGeometry(width, height), facade, { cast: false });
  front.position.set(0, height / 2, depth / 2 + 0.01);
  g.add(body, front);
  const cornice = mesh(new THREE.BoxGeometry(width + 0.3, 0.35, depth + 0.3), mat(0xe9dfcf));
  cornice.position.y = height + 0.17;
  g.add(cornice);
  if (opts.shop) {
    const stripes = new THREE.MeshStandardMaterial({ color: opts.awning ?? 0x22c7b8, roughness: 0.7 });
    const awning = mesh(new THREE.BoxGeometry(width * 0.9, 0.12, 1.4), stripes);
    awning.position.set(0, 2.9, depth / 2 + 0.6);
    awning.rotation.x = 0.35;
    g.add(awning);
  }
  if (opts.waterTower) {
    const wood = mat(0x7a5236);
    const tank = mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 14), wood);
    tank.position.set(width * 0.2, height + 2.3, 0);
    const roof = mesh(new THREE.ConeGeometry(1.25, 0.9, 14), mat(0x3a3a44));
    roof.position.set(width * 0.2, height + 3.65, 0);
    g.add(tank, roof);
    for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      const leg = mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), mat(0x2b2b33));
      leg.position.set(width * 0.2 + lx, height + 0.7, lz);
      g.add(leg);
    }
  }
  if (opts.ac) {
    for (let i = 0; i < 2; i += 1) {
      const ac = mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), mat(0xb8bcc4));
      ac.position.set(-width * 0.25 + i * 1.2, height + 0.5, -depth * 0.2);
      g.add(ac);
    }
  }
  g.position.x = x;
  return g;
}

function buildStreetRow(group) {
  const specs = [
    { w: 6, h: 9, shop: true },
    { w: 5, h: 12, waterTower: true },
    { w: 7, h: 8, mural: true },
    { w: 5.5, h: 11, ac: true },
    { w: 6, h: 10, shop: true, awning: 0xff6a2b },
    { w: 5, h: 13, waterTower: true },
    { w: 6.5, h: 9, ac: true },
    { w: 6, h: 11.5 },
  ];
  const total = specs.reduce((s, b) => s + b.w, 0);
  let x = -total / 2;
  const depth = 5;
  const z = BLOCK.minZ + depth / 2 + 0.3;
  specs.forEach((spec, i) => {
    const b = buildBuilding(x + spec.w / 2, spec.w, spec.h, depth, FACADES[i % FACADES.length], 1000 + i * 77, spec);
    b.position.z = z;
    if (spec.mural) {
      const mural = mesh(new THREE.PlaneGeometry(spec.w * 0.86, spec.h * 0.55), new THREE.MeshStandardMaterial({ map: createMuralTexture(), roughness: 0.9 }), { cast: false });
      mural.position.set(0, spec.h * 0.45, depth / 2 + 0.02);
      b.add(mural);
    }
    group.add(b);
    x += spec.w;
  });
}

function buildTree(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.14, 0.2, 2.4, 6), mat(0x5a3d2b));
  trunk.position.y = 1.2;
  const leaves = mat(0x2f6b45, { flatShading: true });
  const crown = mesh(new THREE.IcosahedronGeometry(1.5, 0), leaves);
  crown.position.y = 3.2;
  const crown2 = mesh(new THREE.IcosahedronGeometry(1.0, 0), mat(0x3d8452, { flatShading: true }));
  crown2.position.set(0.6, 3.9, 0.3);
  const pit = mesh(new THREE.BoxGeometry(1.4, 0.1, 1.4), mat(0x3b2a20), { cast: false });
  pit.position.y = 0.05;
  g.add(trunk, crown, crown2, pit);
  g.scale.setScalar(scale);
  return place(g, x, 0, z);
}

function buildLamp(x, z, facing) {
  const g = new THREE.Group();
  const steel = mat(0x262a33, { metalness: 0.5, roughness: 0.5 });
  const pole = mesh(new THREE.CylinderGeometry(0.08, 0.12, 6.5, 8), steel);
  pole.position.y = 3.25;
  const arm = mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), steel);
  arm.position.set(facing * 0.65, 6.4, 0);
  const head = mesh(new THREE.BoxGeometry(0.6, 0.18, 0.35), steel);
  head.position.set(facing * 1.3, 6.3, 0);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.28), BULB);
  bulb.position.set(facing * 1.3, 6.2, 0);
  g.add(pole, arm, head, bulb);
  return place(g, x, 0, z);
}

function buildFence(group) {
  const link = createChainLinkTexture();
  const posts = mat(0x5b6270, { metalness: 0.6, roughness: 0.45 });
  const make = (len, height, rx, ry) => {
    const tex = link.clone();
    tex.needsUpdate = true;
    tex.repeat.set(len / 0.18, height / 0.18);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(len, height),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.5 }),
    );
    m.rotation.y = ry;
    m.position.set(rx.x, height / 2, rx.z);
    return m;
  };
  group.add(make(FENCE.x * 2, FENCE.height, { x: 0, z: -FENCE.z }, 0));
  group.add(make(FENCE.z * 2, FENCE.height, { x: -FENCE.x, z: 0 }, Math.PI / 2));
  group.add(make(FENCE.z * 2, FENCE.height, { x: FENCE.x, z: 0 }, Math.PI / 2));
  group.add(make(FENCE.x * 2, 1.1, { x: 0, z: FENCE.z }, 0));
  for (let x = -FENCE.x; x <= FENCE.x + 0.01; x += FENCE.x / 6) {
    group.add(place(mesh(new THREE.CylinderGeometry(0.05, 0.05, FENCE.height, 6), posts), x, FENCE.height / 2, -FENCE.z));
    group.add(place(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), posts), x, 0.55, FENCE.z));
  }
  for (let z = -FENCE.z; z <= FENCE.z + 0.01; z += FENCE.z / 3) {
    for (const sx of [-1, 1]) group.add(place(mesh(new THREE.CylinderGeometry(0.05, 0.05, FENCE.height, 6), posts), sx * FENCE.x, FENCE.height / 2, z));
  }
}

function buildBleachers(x, z) {
  const g = new THREE.Group();
  const wood = mat(0xc28b54);
  const frame = mat(0x30343e, { metalness: 0.4 });
  for (let i = 0; i < 3; i += 1) {
    const plank = mesh(new THREE.BoxGeometry(7, 0.12, 0.45), wood);
    plank.position.set(0, 0.45 + i * 0.42, i * 0.55);
    g.add(plank);
  }
  for (const sx of [-3.2, 0, 3.2]) {
    const leg = mesh(new THREE.BoxGeometry(0.1, 1.4, 1.7), frame);
    leg.position.set(sx, 0.7, 0.55);
    g.add(leg);
  }
  return place(g, x, 0, z);
}

function buildProps(group) {
  const hydrant = new THREE.Group();
  const red = mat(0xc8322b, { roughness: 0.5 });
  hydrant.add(place(mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.7, 10), red), 0, 0.35, 0));
  hydrant.add(place(mesh(new THREE.SphereGeometry(0.2, 10, 8), red), 0, 0.72, 0));
  group.add(place(hydrant, 20.5, 0, 11.6));
  const can = mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.9, 12), mat(0x3b5d46));
  group.add(place(can, -20.5, 0.45, 11.2));
  for (const [x, z, rot] of [[-20.5, 4, Math.PI / 2], [20.5, -3.5, -Math.PI / 2]]) {
    const bench = new THREE.Group();
    bench.add(place(mesh(new THREE.BoxGeometry(2.4, 0.1, 0.5), mat(0x8a5a36)), 0, 0.5, 0));
    bench.add(place(mesh(new THREE.BoxGeometry(2.4, 0.5, 0.08), mat(0x8a5a36)), 0, 0.8, -0.25));
    bench.rotation.y = rot;
    group.add(place(bench, x, 0, z));
  }
  const road = mesh(new THREE.BoxGeometry(BLOCK.maxX - BLOCK.minX, 0.02, 2.6), mat(0x2d2f36), { cast: false });
  group.add(place(road, 0, 0.01, BLOCK.maxZ - 1.5));
  for (let x = -22; x < 22; x += 3) {
    group.add(place(mesh(new THREE.BoxGeometry(1.4, 0.03, 0.14), new THREE.MeshBasicMaterial({ color: 0xe8c45a }), { cast: false }), x, 0.025, BLOCK.maxZ - 1.5));
  }
}

function buildFireflies() {
  const count = 90;
  const positions = new Float32Array(count * 3);
  const rng = mulberry(42);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (rng() - 0.5) * 60;
    positions[i * 3 + 1] = rng() * 16 - 6;
    positions[i * 3 + 2] = (rng() - 0.5) * 46 - 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.18, transparent: true, opacity: 0.7, depthWrite: false }));
  points.userData.fireflies = true;
  return points;
}

/** Build the whole static diorama. Returns the group plus lamp positions for lights. */
export function buildBlock() {
  const group = new THREE.Group();
  buildSlab(group);
  buildStreetRow(group);
  buildFence(group);
  group.add(buildBleachers(0, COURT.halfW + 2.7));
  for (const [x, z, s] of [[-20, -8, 1.1], [-21, 1, 0.9], [-19.5, 9, 1], [20, -9, 1], [21, 4, 1.15], [19.5, 10, 0.85]]) {
    group.add(buildTree(x, z, s));
  }
  const lamps = [[-FENCE.x - 0.8, -FENCE.z + 1, 1], [FENCE.x + 0.8, -FENCE.z + 1, -1], [-FENCE.x - 0.8, FENCE.z - 1, 1], [FENCE.x + 0.8, FENCE.z - 1, -1]];
  for (const [x, z, f] of lamps) group.add(buildLamp(x, z, f));
  buildProps(group);
  mergeStatic(group);
  const fireflies = buildFireflies();
  group.add(fireflies);
  return {
    group,
    fireflies,
    facades: [...facades],
    bulbs: [BULB],
    lamps: lamps.map(([x, z, f]) => new THREE.Vector3(x + f * 1.3, 6.1, z)),
  };
}

export function animateBlock(block, t, reducedMotion) {
  if (reducedMotion) return;
  block.group.children.forEach((c) => {
    if (c.userData.float) c.position.y = c.userData.float.base + Math.sin(t * 0.6 + c.userData.float.phase) * 0.4;
  });
  const pos = block.fireflies.geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setY(i, pos.getY(i) + Math.sin(t * 0.8 + i) * 0.004);
  }
  pos.needsUpdate = true;
}
