import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hoopPosition, toLocal, fromLocal, shotValue, isInBounds, inboundSpotFromExit, baselineInboundSpot,
} from '../src/sim/geometry.js';
import { COURT, HOOP, ARC_RADIUS, BEHIND_BOARD_HALF } from '../src/sim/config.js';

test('hoops sit at opposite ends, 1.575 m in from each baseline', () => {
  const west = hoopPosition(0);
  const east = hoopPosition(1);
  assert.ok(Math.abs(west.x + (COURT.halfL - HOOP.fromBaseline)) < 1e-9);
  assert.ok(Math.abs(east.x - (COURT.halfL - HOOP.fromBaseline)) < 1e-9);
  assert.equal(west.y, HOOP.rimHeight);
  assert.equal(east.z, 0);
});

test('local frame points u toward center court for both hoops and round-trips', () => {
  for (const h of [0, 1]) {
    const center = toLocal(h, 0, 0);
    assert.ok(center.u > 12, `hoop ${h} center u=${center.u}`);
    const p = fromLocal(h, 3.2, -1.7);
    const back = toLocal(h, p.x, p.z);
    assert.ok(Math.abs(back.u - 3.2) < 1e-9 && Math.abs(back.v + 1.7) < 1e-9);
  }
});

test('shot value is 2 beyond the 6 m arc and 1 inside, per basket', () => {
  const east = hoopPosition(1);
  assert.equal(shotValue(1, east.x - (ARC_RADIUS + 0.3), 0), 2);
  assert.equal(shotValue(1, east.x - (ARC_RADIUS - 0.3), 0), 1);
  // A spot that is deep for the east hoop is a layup for nobody at the west hoop
  assert.equal(shotValue(0, east.x - 2, 0), 2);
  const west = hoopPosition(0);
  assert.equal(shotValue(0, west.x + 1, 0.5), 1);
});

test('in-bounds check uses court lines', () => {
  assert.equal(isInBounds(0, 0), true);
  assert.equal(isInBounds(COURT.halfL + 0.01, 0), false);
  assert.equal(isInBounds(0, -COURT.halfW - 0.01), false);
});

test('sideline exit gives a sideline inbound spot just outside the line', () => {
  const spot = inboundSpotFromExit(3, COURT.halfW + 0.4);
  assert.equal(spot.line, 'sideline');
  assert.ok(spot.z > COURT.halfW && spot.z < COURT.halfW + 1);
  assert.ok(Math.abs(spot.x - 3) < 1e-9);
});

test('baseline exit never produces a spot behind the backboard', () => {
  const spot = inboundSpotFromExit(COURT.halfL + 0.5, 0.2);
  assert.equal(spot.line, 'baseline');
  assert.ok(spot.x > COURT.halfL);
  assert.ok(Math.abs(spot.z) >= BEHIND_BOARD_HALF);
  const spotNeg = inboundSpotFromExit(-COURT.halfL - 0.5, -0.1);
  assert.ok(spotNeg.x < -COURT.halfL && spotNeg.z <= -BEHIND_BOARD_HALF);
});

test('baseline inbound spot is behind the requested basket, off to the side', () => {
  for (const h of [0, 1]) {
    const spot = baselineInboundSpot(h, 1);
    const hp = hoopPosition(h);
    assert.ok(Math.abs(spot.x) > COURT.halfL, 'outside baseline');
    assert.equal(Math.sign(spot.x), Math.sign(hp.x));
    assert.ok(Math.abs(spot.z) >= BEHIND_BOARD_HALF);
  }
});
