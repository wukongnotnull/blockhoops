import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBall, stepBall, solveLaunch } from '../src/sim/physics.js';
import { hoopPosition } from '../src/sim/geometry.js';
import { HOOP, BALL } from '../src/sim/config.js';

const DT = 1 / 120;

function run(ball, seconds) {
  let b = ball;
  const contacts = [];
  const baskets = [];
  for (let t = 0; t < seconds; t += DT) {
    const r = stepBall(b, DT);
    b = r.ball;
    contacts.push(...r.contacts);
    baskets.push(...r.baskets);
  }
  return { ball: b, contacts, baskets };
}

test('stepBall does not mutate its input', () => {
  const b = createBall({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 });
  const snapshot = JSON.stringify(b);
  stepBall(b, DT);
  assert.equal(JSON.stringify(b), snapshot);
});

test('a ball dropped through the centre of each rim counts once for that hoop only', () => {
  for (const h of [0, 1]) {
    const hp = hoopPosition(h);
    const r = run(createBall({ x: hp.x, y: hp.y + 1, z: 0 }, { x: 0, y: 0, z: 0 }), 2);
    assert.deepEqual(r.baskets, [h], `hoop ${h}`);
    assert.ok(!r.contacts.some((c) => c.type === 'rim'), 'clean swish should not touch rim');
    assert.ok(r.contacts.some((c) => c.type === 'net' && c.hoop === h), 'net should react');
  }
});

test('a ball moving up through the rim is not a basket', () => {
  const hp = hoopPosition(1);
  const r = run(createBall({ x: hp.x, y: hp.y - 0.6, z: 0 }, { x: 0, y: 4, z: 0 }), 0.25);
  assert.deepEqual(r.baskets, []);
});

test('rim collisions work at both hoops', () => {
  for (const h of [0, 1]) {
    const hp = hoopPosition(h);
    // Drop straight onto the front of the rim tube
    const frontX = hp.x - Math.sign(hp.x) * HOOP.rimRadius;
    const r = run(createBall({ x: frontX, y: hp.y + 0.8, z: 0 }, { x: 0, y: 0, z: 0 }), 0.6);
    assert.ok(r.contacts.some((c) => c.type === 'rim' && c.hoop === h), `rim contact at hoop ${h}`);
    assert.ok(!r.contacts.some((c) => c.hoop === 1 - h), 'no contacts on the far hoop');
  }
});

test('backboards reflect the ball back toward the court at both ends', () => {
  for (const h of [0, 1]) {
    const hp = hoopPosition(h);
    const s = Math.sign(hp.x);
    const start = createBall({ x: hp.x - s * 0.1, y: 3.5, z: 0 }, { x: s * 6, y: 0, z: 0 });
    const r = run(start, 0.2);
    assert.ok(r.contacts.some((c) => c.type === 'board' && c.hoop === h), `board contact at hoop ${h}`);
    assert.equal(Math.sign(r.ball.vel.x), -s, 'ball heads back to court');
  }
});

test('floor bounce keeps the ball above the floor and loses energy', () => {
  const r = run(createBall({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }), 1.2);
  assert.ok(r.ball.pos.y >= BALL.radius - 1e-6);
  assert.ok(r.contacts.some((c) => c.type === 'floor'));
  const apex = run(createBall({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }), 3).ball.pos.y;
  assert.ok(apex < 1.5);
});

test('solveLaunch lands the ball on the target after the flight time', () => {
  const from = { x: 0, y: 2.3, z: 1 };
  const to = { x: 5, y: 3.05, z: -2 };
  const T = 1.1;
  const v = solveLaunch(from, to, T);
  // Integrate in free flight (far from hoops) analytically
  const g = 9.81;
  assert.ok(Math.abs(from.x + v.x * T - to.x) < 1e-9);
  assert.ok(Math.abs(from.y + v.y * T - 0.5 * g * T * T - to.y) < 1e-9);
  assert.ok(Math.abs(from.z + v.z * T - to.z) < 1e-9);
});
