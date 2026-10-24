// Shared constants for the Block Hoops simulation. Units are metres and seconds.
// World frame: x runs along the court length (west hoop at -x, east hoop at +x),
// z runs across the width, y is up.

export const COURT = Object.freeze({ length: 28, width: 15, halfL: 14, halfW: 7.5 });

export const HOOP = Object.freeze({
  rimHeight: 3.05,
  rimRadius: 0.24,
  rimTube: 0.02,
  fromBaseline: 1.575,
  boardFromBaseline: 1.2,
  boardHalfWidth: 0.9,
  boardBottom: 2.9,
  boardTop: 3.95,
  boardThickness: 0.05,
  netDepth: 0.42,
});

export const BALL = Object.freeze({ radius: 0.13, restitution: 0.72, rimRestitution: 0.5, boardRestitution: 0.62 });
export const GRAVITY = 9.81;

export const ARC_RADIUS = 6;
export const KEY = Object.freeze({ width: 4.9, length: 5.8, ftCircleR: 1.8, restrictedR: 1.25 });
export const CENTER_CIRCLE_R = 1.8;

// Baseline inbounds stay clear of the backboard and its stanchion.
export const BEHIND_BOARD_HALF = 2.2;
export const INBOUND_OFFSET = 0.55;

export const WIN_SCORE = 11;
export const TEAM_SIZE = 4;

export const TEAMS = Object.freeze([
  Object.freeze({ id: 0, name: 'Sparks', short: 'SPK', color: '#ff6a2b', trim: '#ffd5b8', attackHoop: 1 }),
  Object.freeze({ id: 1, name: 'Tides', short: 'TDS', color: '#22c7b8', trim: '#c9fff8', attackHoop: 0 }),
]);

export const SPEED = Object.freeze({ sprint: 6.6, run: 5.0, jog: 3.4, dribbleFast: 5.6, dribble: 3.8 });
export const PLAYER_RADIUS = 0.45;

// Settled offense spots in the attacking hoop's local frame (u toward centre court, v lateral).
export const OFFENSE_SPOTS = Object.freeze([
  { u: 7.3, v: 0 },
  { u: 5.6, v: -4.7 },
  { u: 5.6, v: 4.7 },
  { u: 0.9, v: -6.7 },
  { u: 0.9, v: 6.7 },
  { u: 4.3, v: -2.6 },
  { u: 4.3, v: 2.6 },
]);

export const TIMING = Object.freeze({
  deadAfterScore: 1.4,
  deadAfterOut: 1.0,
  inboundHold: 0.8,
  transitionMax: 6.5,
  possessionLimit: 16,
  gameOverRestart: 7,
});
