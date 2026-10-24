// Matchup presets: one tap sets both teams' AI tuning to contrasting styles.
// Titles and descriptions live in i18n/strings.js under m.<id>.*.
// tuning[0] is the Sparks, tuning[1] the Tides; swapTuning flips the sides.
import { DEFAULT_TUNING } from './settings.js';

const style = (patch) => Object.freeze({ ...DEFAULT_TUNING, ...patch });

export const MATCHUPS = Object.freeze([
  {
    id: 'balanced',
    tuning: [style({}), style({})],
  },
  {
    id: 'sharpshooters-vs-wall',
    tuning: [
      style({ shooting: 1.4, passing: 0.9, defense: 0.8, accuracy: 1.9 }),
      style({ shooting: 0.8, passing: 1.1, defense: 1.9, accuracy: 0.9 }),
    ],
  },
  {
    id: 'run-vs-set-play',
    tuning: [
      style({ shooting: 1.8, passing: 0.7, defense: 1, accuracy: 1.2 }),
      style({ shooting: 0.7, passing: 1.6, defense: 0.9, accuracy: 0.9 }),
    ],
  },
  {
    id: 'ball-movement-vs-iso',
    tuning: [
      style({ shooting: 0.8, passing: 2, defense: 1, accuracy: 1.2 }),
      style({ shooting: 1.5, passing: 0.4, defense: 1, accuracy: 1 }),
    ],
  },
  {
    id: 'mismatch',
    tuning: [
      style({ shooting: 1.2, passing: 1.3, defense: 1.6, accuracy: 1.6 }),
      style({ shooting: 0.9, passing: 0.7, defense: 0.5, accuracy: 0.6 }),
    ],
  },
]);

const same = (a, b) => Object.keys(DEFAULT_TUNING).every((k) => Math.abs(a[k] - b[k]) < 1e-6);

/** Fresh copies of a matchup's tuning for [Sparks, Tides], or null for an unknown id. */
export function matchupTuning(id) {
  const m = MATCHUPS.find((x) => x.id === id);
  return m ? m.tuning.map((t) => ({ ...t })) : null;
}

export const swapTuning = (tuning) => [{ ...tuning[1] }, { ...tuning[0] }];

/** Which preset the current tuning matches, and whether the sides are flipped; null if custom. */
export function findMatchup(tuning) {
  for (const m of MATCHUPS) {
    if (same(tuning[0], m.tuning[0]) && same(tuning[1], m.tuning[1])) return { id: m.id, swapped: false };
    if (same(tuning[0], m.tuning[1]) && same(tuning[1], m.tuning[0])) return { id: m.id, swapped: true };
  }
  return null;
}
