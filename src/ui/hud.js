// HTML overlay: scoreboard, possession and attack direction, status banners, mini-map, game over.
import { TEAMS, COURT, HOOP, ARC_RADIUS } from '../sim/config.js';
import { STATE } from '../sim/rules.js';
import { boxRows } from '../sim/boxscore.js';
import { translate } from '../i18n/strings.js';

const $ = (sel) => document.querySelector(sel);
const SVG_NS = 'http://www.w3.org/2000/svg';
const RIM_X = COURT.halfL - HOOP.fromBaseline;

function svg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function arcPath(side) {
  const pts = [];
  for (let i = 0; i <= 40; i += 1) {
    const a = -Math.PI / 2 + (Math.PI * i) / 40;
    const x = side * (RIM_X - Math.cos(a) * ARC_RADIUS);
    const z = Math.sin(a) * ARC_RADIUS;
    if (Math.abs(x) <= COURT.halfL) pts.push(`${x.toFixed(2)},${z.toFixed(2)}`);
  }
  return `M ${pts.join(' L ')}`;
}

/** Arrow pointing from centre court toward the basket a team attacks. */
function attackArrow(team) {
  const s = team.attackHoop === 1 ? 1 : -1;
  const y = team.id === 0 ? -3.4 : 3.4;
  return svg('path', {
    d: `M ${-4 * s} ${y} L ${5 * s} ${y} M ${3.4 * s} ${y - 1.3} L ${5 * s} ${y} L ${3.4 * s} ${y + 1.3}`,
    class: 'mm-arrow',
    stroke: team.color,
  });
}

/** A colored team name followed by plain text, built without innerHTML. */
function teamLine(el, team, text) {
  const strong = document.createElement('strong');
  strong.style.color = team.color;
  strong.textContent = team.name;
  el.replaceChildren(strong, text);
}

export function createHud({ onRestart, lang: initialLang }) {
  let lang = initialLang;
  const t = (key, params) => translate(lang, key, params);
  const teamEls = TEAMS.map((team) => {
    const root = $(`.team-${team.id}`);
    root.querySelector('.team-name').textContent = team.name.toUpperCase();
    root.querySelector('.team-dir').textContent = team.attackHoop === 1 ? '▶' : '◀';
    return { root, score: root.querySelector('.team-score'), dir: root.querySelector('.team-dir'), team };
  });
  $('#mm-arc-w').setAttribute('d', arcPath(-1));
  $('#mm-arc-e').setAttribute('d', arcPath(1));
  TEAMS.forEach((t) => $('#mm-arrows').append(attackArrow(t)));
  const dots = [...Array(8)].map((_, i) => {
    const c = svg('circle', { r: 0.62, class: 'mm-dot', fill: TEAMS[i < 4 ? 0 : 1].color });
    $('#mm-dots').append(c);
    return c;
  });
  const ballDot = svg('circle', { r: 0.42, class: 'mm-ball' });
  $('#mm-dots').append(ballDot);

  const banner = $('#banner');
  const dialog = $('#gameover');
  let bannerTimer = 0;
  let queued = [];
  let shown = { score: [-1, -1], possession: -1, state: '' };
  let shownSeries = '';
  let shownRotation = '';

  $('#btn-again').addEventListener('click', onRestart);

  /** Queue a banner by i18n key; it is translated when shown, so a language switch applies. */
  function flash(key, team, delay = 0) {
    queued = [...queued, { key, color: team == null ? null : TEAMS[team].color, at: performance.now() + delay }];
  }

  function pumpBanner(now) {
    if (now < bannerTimer || queued.length === 0 || queued[0].at > now) return;
    const [next, ...rest] = queued;
    queued = rest;
    banner.textContent = t(next.key);
    banner.style.setProperty('--banner-c', next.color ?? '#fff6ea');
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    bannerTimer = now + 1100;
  }

  function onEvent(e) {
    switch (e.type) {
      case 'inbound': flash('b.inbound', e.team); break;
      case 'steal': flash('b.steal', e.team); break;
      case 'deflection': flash('b.poked', e.team); break;
      case 'rebound': flash('b.board', e.team); break;
      case 'possession':
        if (e.cause === 'steal' || e.cause === 'defensive_rebound' || e.cause === 'loose_turnover') flash('b.fastBreak', e.team, 380);
        break;
      case 'pass': if (e.ahead) flash('b.hitAhead', e.team); break;
      case 'score':
        flash(e.swish ? 'b.swish' : e.deep ? 'b.deep' : 'b.bucket', e.team);
        if (e.score[e.team] === e.winScore - 1) flash('b.gamePoint', e.team, 900);
        break;
      case 'outOfBounds': flash('b.out', e.team); break;
      case 'restart': queued = []; flash('b.tipoff', null); break;
      default: break;
    }
  }

  /** Fill the stats table; rebuilt only when the card opens, so the final box stays put. */
  function renderBox(box) {
    const body = $('#go-box tbody');
    const rows = boxRows(box).map((row) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = t(`box.${row.key}`);
      tr.append(th);
      row.values.forEach((v, i) => {
        const td = document.createElement('td');
        td.className = `t${i}${row.leader === i ? ' lead' : ''}`;
        td.textContent = v;
        tr.append(td);
      });
      return tr;
    });
    body.replaceChildren(...rows);
  }

  function showGameOver(sim) {
    const { game } = sim;
    const w = TEAMS[game.winner];
    $('#go-title').textContent = t('go.win', { team: w.name.toUpperCase() });
    dialog.style.setProperty('--go-c', w.color);
    $('#go-score').textContent = `${game.score[0]} – ${game.score[1]}`;
    if (!dialog.open) {
      renderBox(sim.box);
      dialog.show();
    }
  }

  /** Per-frame refresh from the sim snapshot; DOM writes only when values change. */
  function update(sim, { yaw, restartIn }) {
    const { game } = sim;
    pumpBanner(performance.now());
    game.score.forEach((s, i) => {
      if (shown.score[i] !== s) {
        teamEls[i].score.textContent = String(s);
        if (shown.score[i] >= 0 && s > shown.score[i]) {
          teamEls[i].score.classList.remove('bump');
          void teamEls[i].score.offsetWidth;
          teamEls[i].score.classList.add('bump');
        }
      }
    });
    const possTeam = game.state === STATE.DEAD && sim.dead ? sim.dead.team : game.possession;
    if (shown.possession !== possTeam || shown.state !== game.state || shown.lang !== lang) {
      teamEls.forEach((t, i) => t.root.classList.toggle('has-ball', i === possTeam && game.state !== STATE.GAME_OVER));
      const team = TEAMS[possTeam];
      const line = $('#possession-line');
      line.style.setProperty('--c', team.color);
      if (game.state === STATE.GAME_OVER) {
        const winner = TEAMS[game.winner];
        teamLine(line, winner, t('hud.takeGame', { team: '', n: game.gameNumber }));
      } else {
        const dir = t(team.attackHoop === 1 ? 'dir.east' : 'dir.west');
        teamLine(line, team, t('hud.ball', { team: '', dir }));
      }
      $('#state-chip').textContent = t(`state.${game.state}`);
      teamEls.forEach((el) => { el.dir.title = t(el.team.attackHoop === 1 ? 'dir.attacksEast' : 'dir.attacksWest'); });
    }
    shown = { score: [...game.score], possession: possTeam, state: game.state, lang };
    const seriesKey = `${game.gameNumber}|${game.wins}|${game.winScore}|${lang}`;
    if (seriesKey !== shownSeries) {
      shownSeries = seriesKey;
      $('#target').textContent = t('hud.firstTo', { n: game.winScore });
      const tag = (team, text) => {
        const b = document.createElement('b');
        b.style.color = team.color;
        b.textContent = text;
        return b;
      };
      $('#series').replaceChildren(
        `${t('hud.game', { n: game.gameNumber })} · ${t('hud.wins')} `,
        tag(TEAMS[0], `${TEAMS[0].short} ${game.wins[0]}`),
        ' – ',
        tag(TEAMS[1], `${game.wins[1]} ${TEAMS[1].short}`),
      );
    }

    sim.players.forEach((p, i) => {
      dots[i].setAttribute('cx', p.pos.x.toFixed(2));
      dots[i].setAttribute('cy', p.pos.z.toFixed(2));
    });
    ballDot.setAttribute('cx', sim.ball.pos.x.toFixed(2));
    ballDot.setAttribute('cy', sim.ball.pos.z.toFixed(2));
    const rotation = `rotate(${((yaw * 180) / Math.PI).toFixed(1)})`;
    if (rotation !== shownRotation) {
      shownRotation = rotation;
      $('#minimap-rot').setAttribute('transform', rotation);
    }

    if (game.state === STATE.GAME_OVER) {
      showGameOver(sim);
      $('#go-next').textContent = sim.rules.autoRestart && restartIn > 0 ? t('go.next', { n: Math.ceil(restartIn) }) : t('go.autoOff');
    } else if (dialog.open) {
      dialog.close();
    }
  }

  /** Switch language; cached strings re-render on the next update. */
  function setLang(next) {
    lang = next;
    shown = { ...shown, lang: null };
    shownSeries = '';
    if (dialog.open) dialog.close();
  }

  return { onEvent, update, setLang };
}
