// Court surface plus two complete hoop assemblies with animated nets.
import * as THREE from 'three';
import { COURT, HOOP, BALL } from '../sim/config.js';
import { hoopPosition, hoopSide } from '../sim/geometry.js';
import { createCourtTexture, APRON } from './textures.js';

const NET_STRANDS = 14;
const NET_RINGS = 6;
const NET_BOTTOM_R = 0.15;

export function buildCourt(renderer) {
  const tex = createCourtTexture(renderer);
  const geo = new THREE.PlaneGeometry(COURT.length + APRON * 2, COURT.width + APRON * 2);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildNet() {
  const base = [];
  for (let r = 0; r < NET_RINGS; r += 1) {
    const t = r / (NET_RINGS - 1);
    const radius = HOOP.rimRadius + (NET_BOTTOM_R - HOOP.rimRadius) * t;
    for (let s = 0; s < NET_STRANDS; s += 1) {
      const a = ((s + (r % 2) * 0.5) / NET_STRANDS) * Math.PI * 2;
      base.push(new THREE.Vector3(Math.cos(a) * radius, -t * HOOP.netDepth, Math.sin(a) * radius));
    }
  }
  const idx = [];
  for (let r = 0; r < NET_RINGS - 1; r += 1) {
    for (let s = 0; s < NET_STRANDS; s += 1) {
      const a = r * NET_STRANDS + s;
      const down = (r + 1) * NET_STRANDS + s;
      const downSide = (r + 1) * NET_STRANDS + ((s + (r % 2 ? 1 : NET_STRANDS - 1)) % NET_STRANDS);
      idx.push(a, down, a, downSide);
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(base);
  geo.setIndex(idx);
  const net = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xf5f1e8, transparent: true, opacity: 0.9 }));
  return { net, base };
}

function buildHoop(index, materials) {
  const s = hoopSide(index);
  const rim = hoopPosition(index);
  const g = new THREE.Group();
  const boardFace = s * (COURT.halfL - HOOP.boardFromBaseline);
  const poleX = s * (COURT.halfL + 1.2);
  const boardH = HOOP.boardTop - HOOP.boardBottom;
  const boardY = HOOP.boardBottom + boardH / 2;

  const base = box(1.1, 0.5, 1.4, materials.pad);
  base.position.set(poleX + s * 0.2, 0.25, 0);
  const pole = box(0.2, 3.5, 0.2, materials.steel);
  pole.position.set(poleX, 1.75, 0);
  const padWrap = box(0.34, 1.8, 0.34, materials.pad);
  padWrap.position.set(poleX, 0.9, 0);
  const armLen = Math.abs(poleX - boardFace) - HOOP.boardThickness;
  const arm = box(armLen, 0.14, 0.14, materials.steel);
  arm.position.set((poleX + boardFace + s * HOOP.boardThickness) / 2, boardY + 0.15, 0);
  const brace = box(armLen * 0.9, 0.08, 0.08, materials.steel);
  brace.position.set(arm.position.x + s * 0.1, boardY - 0.35, 0);
  brace.rotation.z = s * 0.35;

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(HOOP.boardThickness, boardH, HOOP.boardHalfWidth * 2),
    materials.glass,
  );
  board.position.set(boardFace + (s * HOOP.boardThickness) / 2, boardY, 0);
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(board.geometry),
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  );
  frame.position.copy(board.position);
  const square = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.59, 0.45)),
    new THREE.LineBasicMaterial({ color: 0xff6a2b }),
  );
  square.rotation.y = Math.PI / 2;
  square.position.set(boardFace - s * 0.002, HOOP.rimHeight + 0.15 + 0.225, 0);

  const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(HOOP.rimRadius, HOOP.rimTube * 1.4, 10, 40), materials.rim);
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.position.set(rim.x, rim.y, rim.z);
  rimMesh.castShadow = true;
  const bracket = box(Math.abs(boardFace - rim.x) - HOOP.rimRadius + 0.02, 0.05, 0.12, materials.rim);
  bracket.position.set((boardFace + rim.x + s * HOOP.rimRadius) / 2, rim.y - 0.02, 0);

  const { net, base: netBase } = buildNet();
  net.position.set(rim.x, rim.y, rim.z);

  g.add(base, pole, padWrap, arm, brace, board, frame, square, rimMesh, bracket, net);
  return { group: g, net, netBase, rimMesh, sway: new THREE.Vector2(), swayVel: new THREE.Vector2(), stretch: 0, shake: 0 };
}

export function buildHoops() {
  const materials = {
    steel: new THREE.MeshStandardMaterial({ color: 0x2f3542, metalness: 0.6, roughness: 0.4 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x1b6f7a, roughness: 0.8 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0, depthWrite: false }),
    rim: new THREE.MeshStandardMaterial({ color: 0xff5a1f, metalness: 0.5, roughness: 0.35, emissive: 0x401000 }),
  };
  return [0, 1].map((i) => buildHoop(i, materials));
}

/** React to physics contacts reported by the sim for each hoop. */
export function excite(hoops, contacts, ball) {
  for (const c of contacts ?? []) {
    const h = hoops[c.hoop];
    if (!h) continue;
    if (c.type === 'net') {
      h.stretch = Math.min(1, h.stretch + 0.9);
      h.swayVel.x += ball.vel.x * 0.15;
      h.swayVel.y += ball.vel.z * 0.15;
    }
    if (c.type === 'rim') h.shake = Math.min(1, h.shake + 0.5);
  }
}

/** Spring the nets back toward rest and bulge them around a ball passing through. */
export function animateHoops(hoops, ball, dt) {
  for (const h of hoops) {
    h.swayVel.addScaledVector(h.sway, -60 * dt).multiplyScalar(Math.max(0, 1 - 5 * dt));
    h.sway.addScaledVector(h.swayVel, dt);
    h.stretch = Math.max(0, h.stretch - dt * 1.6);
    h.shake = Math.max(0, h.shake - dt * 3);
    h.rimMesh.position.y = HOOP.rimHeight + Math.sin(performance.now() * 0.06) * 0.012 * h.shake;
    const pos = h.net.geometry.attributes.position;
    const local = new THREE.Vector3(ball.pos.x, ball.pos.y, ball.pos.z).sub(h.net.position);
    h.netBase.forEach((b, i) => {
      const t = -b.y / HOOP.netDepth;
      let x = b.x + h.sway.x * t;
      let z = b.z + h.sway.y * t;
      const y = b.y * (1 + h.stretch * 0.35 * Math.sin(t * Math.PI));
      const dx = x - local.x;
      const dy = y - local.y;
      const dz = z - local.z;
      const d = Math.hypot(dx, dy, dz);
      const reach = BALL.radius + 0.06;
      if (d < reach && d > 1e-4) {
        const push = (reach - d) / d;
        x += dx * push;
        z += dz * push;
      }
      pos.setXYZ(i, x, y, z);
    });
    pos.needsUpdate = true;
  }
}
