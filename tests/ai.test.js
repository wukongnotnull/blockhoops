import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignDefenders, assignSpots, transitionLanes, manDefenseSpot, retreatSpot } from '../src/sim/ai.js';
import { toLocal, fromLocal } from '../src/sim/geometry.js';
import { OFFENSE_SPOTS } from '../src/sim/config.js';

const mk = (id, team, x, z) => ({ id, team, pos: { x, z } });

test('defensive assignments are unique and pick the closest overall matching', () => {
  const offense = [mk(0, 0, 0, 0), mk(1, 0, 5, 5), mk(2, 0, -5, 5), mk(3, 0, 5, -5)];
  const defense = [mk(4, 1, 5.2, 4.8), mk(5, 1, 0.3, 0), mk(6, 1, 5, -4.6), mk(7, 1, -5.3, 5)];
  const a = assignDefenders(defense, offense);
  assert.deepEqual(a, { 4: 1, 5: 0, 6: 3, 7: 2 });
  assert.equal(new Set(Object.values(a)).size, 4);
});

test('off-ball spots are unique, never reuse the handler spot, and stay away from the rim', () => {
  const hoop = 1;
  const handler = mk(0, 0, ...Object.values(fromLocal(hoop, 7.2, 0.3)));
  const others = [mk(1, 0, 8, 6), mk(2, 0, 8, -6), mk(3, 0, 11, 0)];
  const spots = assignSpots(hoop, handler, others);
  const keys = Object.values(spots).map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`);
  assert.equal(new Set(keys).size, 3);
  for (const s of Object.values(spots)) {
    const l = toLocal(hoop, s.x, s.z);
    assert.ok(Math.hypot(l.u, l.v) > 3, 'no spot under the basket');
    const hl = toLocal(hoop, handler.pos.x, handler.pos.z);
    assert.ok(Math.hypot(l.u - hl.u, l.v - hl.v) > 2.5, 'not on top of the handler');
  }
  assert.ok(OFFENSE_SPOTS.length >= 5);
});

test('transition lanes give each runner a distinct lane, wide on both sides plus a trailer', () => {
  const hoop = 0;
  const runners = [mk(1, 1, 5, -3), mk(2, 1, 6, 4), mk(3, 1, 7, 0)];
  const lanes = transitionLanes(hoop, runners);
  const vs = Object.values(lanes).map((p) => toLocal(hoop, p.x, p.z).v).sort((a, b) => a - b);
  assert.ok(vs[0] < -4 && vs[2] > 4, `wide lanes ${vs}`);
  assert.ok(Math.abs(vs[1]) < 3, 'trailer stays middle');
});

test('man defense sits between the man and the basket being defended', () => {
  for (const hoop of [0, 1]) {
    const man = fromLocal(hoop, 6, 2);
    const spot = manDefenseSpot(hoop, man, man, true);
    const l = toLocal(hoop, spot.x, spot.z);
    assert.ok(Math.hypot(l.u, l.v) < Math.hypot(6, 2), 'closer to the basket than the man');
    assert.ok(Math.hypot(l.u, l.v) > 1.3, 'not camping under the rim');
  }
});

test('retreat spots are deep on the defended side and distinct per slot', () => {
  const spots = [0, 1, 2, 3].map((slot) => retreatSpot(1, slot));
  for (const s of spots) assert.ok(toLocal(1, s.x, s.z).u < 7.5);
  assert.equal(new Set(spots.map((s) => `${s.x},${s.z}`)).size, 4);
});
