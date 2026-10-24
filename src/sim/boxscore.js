// Per-game box score, tallied event by event so it survives event-log trimming.

const blankLine = () => ({ fga: 0, fgm: 0, deepA: 0, deepM: 0, rebounds: 0, steals: 0, passes: 0 });

export const emptyBox = () => [blankLine(), blankLine()];

function bump(box, team, patch) {
  return box.map((line, i) => (i === team
    ? Object.fromEntries(Object.entries(line).map(([k, v]) => [k, v + (patch[k] ?? 0)]))
    : line));
}

/** Reducer: fold one sim event into the box score, returning a new box. */
export function tallyEvent(box, e) {
  switch (e.type) {
    case 'shot': return bump(box, e.team, { fga: 1, deepA: e.deep ? 1 : 0 });
    case 'score': return bump(box, e.team, { fgm: 1, deepM: e.deep ? 1 : 0 });
    case 'steal': return bump(box, e.team, { steals: 1 });
    case 'pass': return e.inbound ? box : bump(box, e.team, { passes: 1 });
    case 'possession':
      return e.cause === 'defensive_rebound' || e.cause === 'offensive_rebound' ? bump(box, e.team, { rebounds: 1 }) : box;
    default: return box;
  }
}

const pct = (made, att) => (att > 0 ? made / att : null);

function leaderOf(a, b) {
  if (a == null || b == null || a === b) return a == null && b != null ? 1 : b == null && a != null ? 0 : null;
  return a > b ? 0 : 1;
}

/** Display rows for the game-over card: i18n key (box.<key>), both teams' values, and which side leads. */
export function boxRows(box) {
  const [a, b] = box;
  const fg = box.map((l) => pct(l.fgm, l.fga));
  const deep = box.map((l) => pct(l.deepM, l.deepA));
  const fmtPct = (l, p) => (p == null ? '—' : `${Math.round(p * 100)}% (${l.fgm}/${l.fga})`);
  const count = (key) => ({ values: [String(a[key]), String(b[key])], leader: leaderOf(a[key], b[key]) });
  return [
    { key: 'fg', values: [fmtPct(a, fg[0]), fmtPct(b, fg[1])], leader: leaderOf(fg[0], fg[1]) },
    { key: 'deep', values: box.map((l) => `${l.deepM}/${l.deepA}`), leader: leaderOf(deep[0], deep[1]) },
    { key: 'rebounds', ...count('rebounds') },
    { key: 'steals', ...count('steals') },
    { key: 'passes', ...count('passes') },
  ];
}
