// Player and ball meshes, driven each frame from the simulation snapshot.
import * as THREE from 'three';
import { TEAMS, BALL } from '../sim/config.js';
import { jumpHeight } from '../sim/players.js';
import { createNumberTexture, createBallTexture } from './textures.js';

const VISUAL_SCALE = 1.18;
const SKIN = [0x8d5a3b, 0xc68a62, 0x5b3a29, 0xe0b48f, 0x7a4b31, 0xa8704c, 0x4a2f22, 0xd29f7c];
const TRAIL = 14;
// Moving bodies use cheap blob shadows so the sun's shadow map can be baked once.
const BLOB_GEO = new THREE.CircleGeometry(0.4, 20);
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });

function part(geo, material) {
  const m = new THREE.Mesh(geo, material);
  return m;
}

function buildPlayer(p) {
  const team = TEAMS[p.team];
  const jersey = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.6 });
  const shorts = new THREE.MeshStandardMaterial({ color: new THREE.Color(team.color).multiplyScalar(0.55), roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[p.id % SKIN.length], roughness: 0.65 });
  const shoe = new THREE.MeshStandardMaterial({ color: p.team ? 0xf2f2f2 : 0x1d1d24, roughness: 0.5 });
  const h = p.height / 1.95;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hipY = 0.92 * h;
  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, hipY, side * 0.12);
    const leg = part(new THREE.CylinderGeometry(0.075, 0.06, hipY - 0.08, 6), skin);
    leg.position.y = -(hipY - 0.08) / 2;
    const foot = part(new THREE.BoxGeometry(0.26, 0.1, 0.13), shoe);
    foot.position.set(0.05, -hipY + 0.05, 0);
    pivot.add(leg, foot);
    body.add(pivot);
    return pivot;
  });
  const short = part(new THREE.CylinderGeometry(0.2, 0.22, 0.32, 10), shorts);
  short.position.y = hipY;
  const torso = part(new THREE.CylinderGeometry(0.24, 0.19, 0.62 * h, 10), jersey);
  torso.position.y = hipY + 0.42 * h;
  const numMat = new THREE.MeshBasicMaterial({ map: createNumberTexture(p.number, team.trim), transparent: true, depthWrite: false });
  for (const side of [-1, 1]) {
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), numMat);
    num.position.set(side * 0.235, torso.position.y + 0.03, 0);
    num.rotation.y = side * Math.PI / 2;
    body.add(num);
  }
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, hipY + 0.68 * h, side * 0.29);
    const arm = part(new THREE.CylinderGeometry(0.055, 0.045, 0.62 * h, 6), skin);
    arm.position.y = -0.31 * h;
    pivot.add(arm);
    body.add(pivot);
    return pivot;
  });
  const head = part(new THREE.SphereGeometry(0.15, 14, 10), skin);
  head.position.y = hipY + 0.9 * h;
  const band = part(new THREE.CylinderGeometry(0.152, 0.152, 0.05, 14), new THREE.MeshStandardMaterial({ color: team.trim }));
  band.position.y = head.position.y + 0.06;
  body.add(short, torso, head, band);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.56, 28),
    new THREE.MeshBasicMaterial({ color: team.color, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  const blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  root.add(blob, ring);

  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.28, 4),
    new THREE.MeshBasicMaterial({ color: team.color }),
  );
  marker.rotation.x = Math.PI;
  marker.position.y = hipY + 1.35 * h;
  marker.visible = false;
  root.add(marker);

  root.scale.setScalar(VISUAL_SCALE);
  return { root, body, legs, arms, ring, marker, stride: 0 };
}

export function buildActors(sim) {
  const group = new THREE.Group();
  const players = sim.players.map((p) => {
    const a = buildPlayer(p);
    group.add(a.root);
    return a;
  });
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL.radius * 1.35, 24, 16),
    new THREE.MeshStandardMaterial({ map: createBallTexture(), roughness: 0.55, emissive: 0x6a2408 }),
  );
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.035;
  const trailGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: TRAIL }, () => new THREE.Vector3()));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0.55 }));
  trail.frustumCulled = false;
  group.add(ball, shadow, trail);
  return { group, players, ball, shadow, trail, history: [] };
}

/** Copy the sim snapshot onto meshes and run simple limb animation. */
export function updateActors(actors, sim, dt, { trail = true } = {}) {
  sim.players.forEach((p, i) => {
    const a = actors.players[i];
    a.root.position.set(p.pos.x, jumpHeight(p), p.pos.z);
    a.root.rotation.y = -p.facing;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    a.stride += dt * speed * 2.6;
    const swing = Math.sin(a.stride) * Math.min(0.75, speed * 0.16);
    a.legs[0].rotation.z = swing;
    a.legs[1].rotation.z = -swing;
    const airborne = p.jump > 0;
    a.arms[0].rotation.z = airborne ? 2.7 : -swing * 0.8;
    a.arms[1].rotation.z = airborne ? 2.7 : swing * 0.8;
    a.body.rotation.z = -Math.min(0.25, speed * 0.035);
    const handler = sim.ball.holder === p.id;
    a.marker.visible = handler;
    a.marker.position.y = 2.4 + Math.sin(sim.time * 6) * 0.06;
    a.ring.material.opacity = handler ? 1 : 0.6;
    a.ring.scale.setScalar(handler ? 1.25 : 1);
  });
  const b = sim.ball.pos;
  actors.ball.position.set(b.x, b.y, b.z);
  actors.ball.rotation.x += dt * Math.hypot(sim.ball.vel.x, sim.ball.vel.z) * 3;
  actors.shadow.position.set(b.x, 0.035, b.z);
  const s = Math.max(0.35, 1 - b.y * 0.12);
  actors.shadow.scale.setScalar(s);
  actors.shadow.material.opacity = 0.5 * s;

  const flying = trail && (sim.ball.mode === 'shot' || sim.ball.mode === 'pass');
  actors.history = flying ? [...actors.history, b].slice(-TRAIL) : [];
  actors.trail.visible = actors.history.length > 2;
  if (actors.trail.visible) {
    const pos = actors.trail.geometry.attributes.position;
    for (let i = 0; i < TRAIL; i += 1) {
      const h = actors.history[Math.max(0, actors.history.length - TRAIL + i)] ?? b;
      pos.setXYZ(i, h.x, h.y, h.z);
    }
    pos.needsUpdate = true;
  }
}
