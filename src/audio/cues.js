// Decides which sounds a frame should play from sim events, ball contacts and dribble
// bounces. Pure: returns the cues plus the next rate-limit state; sfx.js plays them.

export const RATE_LIMIT_MS = 90;

const EVENT_CUES = {
  outOfBounds: [{ name: 'whistle', gain: 0.7 }],
  restart: [{ name: 'whistle', gain: 0.7 }],
  steal: [{ name: 'squeak', gain: 0.6 }],
  gameOver: [{ name: 'buzzer', gain: 0.8 }],
};

const CONTACT_CUES = {
  rim: { name: 'rim', gain: 0.8 },
  board: { name: 'board', gain: 0.7 },
  floor: { name: 'bounce', gain: 0.6 },
};

const DRIBBLE = { name: 'dribble', gain: 0.35 };

export const createCueState = () => ({ lastPlayed: {} });

function cuesForEvent(e) {
  if (e.type === 'score') {
    return [
      { name: e.swish ? 'swish' : 'net', gain: 0.8 },
      { name: 'cheer', gain: e.deep ? 0.75 : 0.5 },
    ];
  }
  return EVENT_CUES[e.type] ?? [];
}

/**
 * @param {{lastPlayed: Record<string, number>}} state
 * @param {{events: object[], contacts: {type: string, hoop: number}[], dribbles: number, now: number}} frame
 */
export function planCues(state, { events, contacts, dribbles, now }) {
  const lastPlayed = { ...state.lastPlayed };
  const limited = (key, cue) => {
    if (now - (lastPlayed[key] ?? -Infinity) <= RATE_LIMIT_MS) return [];
    lastPlayed[key] = now;
    return [cue];
  };
  const cues = [
    ...events.flatMap(cuesForEvent),
    ...contacts.flatMap((c) => (CONTACT_CUES[c.type] ? limited(`${c.type}:${c.hoop}`, CONTACT_CUES[c.type]) : [])),
    ...(dribbles > 0 ? limited('dribble', DRIBBLE) : []),
  ];
  return { state: { lastPlayed }, cues };
}
