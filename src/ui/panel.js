// Control panel drawer: playback, rules, team AI tuning, camera and visuals.
// Holds no game state of its own; it calls back into main.js and re-renders from prefs.
import { TEAMS } from '../sim/config.js';
import { MATCHUPS, findMatchup } from '../sim/presets.js';
import { translate } from '../i18n/strings.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const CLOSE_DELAY = 400;

const asValue = (raw) => (Number.isNaN(Number(raw)) ? raw : Number(raw));

function setChecked(group, value) {
  group.querySelectorAll('button').forEach((b) => {
    const on = asValue(b.dataset.value) === value;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

/** Arrow keys move the selection inside a segmented radio group. */
function bindSegment(group, onPick) {
  const buttons = [...group.querySelectorAll('button')];
  buttons.forEach((b, i) => {
    b.addEventListener('click', () => onPick(asValue(b.dataset.value)));
    b.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = buttons[(i + step + buttons.length) % buttons.length];
      next.focus();
      onPick(asValue(next.dataset.value));
    });
  });
}

/** One radio card per matchup, built from data with textContent only. */
function buildMatchupCards(container) {
  return MATCHUPS.map((m) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'matchup';
    card.setAttribute('role', 'radio');
    card.dataset.value = m.id;
    const title = document.createElement('span');
    title.className = 'matchup-title';
    const sides = document.createElement('span');
    sides.className = 'matchup-sides';
    const labels = TEAMS.map((t, i) => {
      const side = document.createElement('span');
      side.className = `s${i}`;
      const tag = document.createElement('b');
      tag.textContent = t.short;
      const label = document.createElement('span');
      side.append(tag, ' ', label);
      sides.append(side);
      return label;
    });
    card.append(title, sides);
    container.append(card);
    return { card, matchup: m, title, labels };
  });
}

export function createPanel(actions) {
  const panel = $('#panel');
  const toggle = $('#btn-panel');
  let team = 0;
  let closeTimer = 0;

  const open = () => {
    clearTimeout(closeTimer);
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('open'));
    document.body.classList.add('panel-open');
    toggle.setAttribute('aria-expanded', 'true');
    $('#btn-panel-close').focus({ preventScroll: true });
  };
  const close = () => {
    panel.classList.remove('open');
    document.body.classList.remove('panel-open');
    toggle.setAttribute('aria-expanded', 'false');
    closeTimer = setTimeout(() => { panel.hidden = true; }, CLOSE_DELAY);
    toggle.focus({ preventScroll: true });
  };
  const isOpen = () => panel.classList.contains('open');

  toggle.addEventListener('click', () => (isOpen() ? close() : open()));
  $('#btn-panel-close').addEventListener('click', close);

  $('#btn-pause').addEventListener('click', actions.onPause);
  $('#btn-quick-pause').addEventListener('click', actions.onPause);
  $('#btn-step').addEventListener('click', actions.onStep);
  $('#btn-restart').addEventListener('click', actions.onRestart);
  $('#btn-apply-rules').addEventListener('click', actions.onApplyRules);

  bindSegment($('[data-setting="speed"]'), (speed) => actions.onPrefs({ speed }));
  bindSegment($('[data-setting="view"]'), (view) => actions.onPrefs({ view }));
  bindSegment($('[data-setting="time"]'), (time) => actions.onPrefs({ time }));
  bindSegment($('[data-setting="lang"]'), (lang) => actions.onPrefs({ lang }));
  bindSegment($('[data-setting="weather"]'), (weather) => actions.onPrefs({ weather }));
  for (const key of ['winScore', 'insideValue', 'outsideValue']) {
    bindSegment($(`[data-setting="${key}"]`), (value) => actions.onRules({ [key]: value }));
  }
  $('#chk-autorestart').addEventListener('change', (e) => actions.onRules({ autoRestart: e.target.checked }));
  const flags = { '#chk-rotate': 'autoRotate', '#chk-minimap': 'minimap', '#chk-shadows': 'shadows', '#chk-effects': 'effects' };
  Object.entries(flags).forEach(([sel, key]) => {
    $(sel).addEventListener('change', (e) => actions.onPrefs({ [key]: e.target.checked }));
  });

  $$('.team-tabs button').forEach((b) => b.addEventListener('click', () => {
    team = Number(b.dataset.team);
    actions.onRefresh();
  }));
  $$('[data-tune]').forEach((input) => input.addEventListener('input', () => {
    actions.onTuning(team, { [input.dataset.tune]: Number(input.value) });
  }));
  $('#btn-tune-reset').addEventListener('click', () => actions.onResetTuning(team));
  const toggleSound = () => actions.onPrefs({ sound: !$('#chk-sound').checked });
  $('#btn-quick-sound').addEventListener('click', toggleSound);
  $('#chk-sound').addEventListener('change', (e) => actions.onPrefs({ sound: e.target.checked }));
  $('#rng-volume').addEventListener('input', (e) => actions.onPrefs({ volume: Number(e.target.value) }));
  const cards = buildMatchupCards($('#matchups'));
  bindSegment($('#matchups'), (id) => actions.onMatchup(id));
  $('#btn-swap').addEventListener('click', actions.onSwapTeams);

  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, button, [role="radio"], [role="tab"]');
    if (e.key === 'Escape' && isOpen()) close();
    else if (e.key === ' ' && !typing) { e.preventDefault(); actions.onPause(); }
    else if (e.key === '.' && !typing) actions.onStep();
    else if ((e.key === 'm' || e.key === 'M') && !typing) toggleSound();
  });

  /** Sync every control with the current prefs and playback status. */
  function render(prefs, { paused, rules, nextRules, lang }) {
    const t = (key, params) => translate(lang, key, params);
    setChecked($('[data-setting="lang"]'), prefs.lang);
    const pauseLabel = t(paused ? 'play.resume' : 'play.pause');
    $('#btn-pause').textContent = pauseLabel;
    $('#btn-pause').setAttribute('aria-pressed', String(paused));
    $('#btn-quick-pause').setAttribute('aria-pressed', String(paused));
    $('#btn-quick-pause').setAttribute('aria-label', t(paused ? 'quick.play' : 'quick.pause'));
    $('#btn-quick-pause').setAttribute('title', t(paused ? 'quick.play' : 'quick.pause'));
    $('#btn-step').disabled = !paused;

    setChecked($('[data-setting="speed"]'), prefs.speed);
    setChecked($('[data-setting="view"]'), prefs.view);
    setChecked($('[data-setting="time"]'), prefs.time);
    setChecked($('[data-setting="weather"]'), prefs.weather);
    for (const key of ['winScore', 'insideValue', 'outsideValue']) setChecked($(`[data-setting="${key}"]`), prefs.rules[key]);
    $('#chk-autorestart').checked = prefs.rules.autoRestart;
    const pending = nextRules && ['winScore', 'insideValue', 'outsideValue'].some((k) => nextRules[k] !== rules[k]);
    $('#rules-note').textContent = pending
      ? t('rules.pending', { win: rules.winScore, inside: rules.insideValue, outside: rules.outsideValue })
      : t('rules.note');
    $('#rules-note').classList.toggle('pending', Boolean(pending));

    $('#chk-rotate').checked = prefs.autoRotate;
    $('#chk-minimap').checked = prefs.minimap;
    $('#chk-shadows').checked = prefs.shadows;
    $('#chk-effects').checked = prefs.effects;
    $('#chk-sound').checked = prefs.sound;
    $('#btn-quick-sound').setAttribute('aria-pressed', String(prefs.sound));
    const soundLabel = t(prefs.sound ? 'quick.soundOff' : 'quick.soundOn');
    $('#btn-quick-sound').setAttribute('aria-label', soundLabel);
    $('#btn-quick-sound').setAttribute('title', soundLabel);
    const volume = $('#rng-volume');
    if (Number(volume.value) !== prefs.volume) volume.value = String(prefs.volume);
    volume.disabled = !prefs.sound;
    volume.style.setProperty('--fill', `${prefs.volume * 100}%`);
    $('#out-volume').textContent = `${Math.round(prefs.volume * 100)}%`;

    const active = findMatchup(prefs.tuning);
    setChecked($('#matchups'), active?.id);
    cards.forEach(({ card, matchup, title, labels }) => {
      title.textContent = t(`m.${matchup.id}.title`);
      card.title = t(`m.${matchup.id}.blurb`);
      const flip = active?.id === matchup.id && active.swapped;
      labels.forEach((el, i) => { el.textContent = t(`m.${matchup.id}.side${flip ? 1 - i : i}`); });
    });
    if (!active) $('#matchups button').tabIndex = 0;
    const current = active && MATCHUPS.find((m) => m.id === active.id);
    $('#matchup-note').textContent = current ? t(`m.${current.id}.blurb`) : t('ai.custom');

    $$('.team-tabs button').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.team) === team)));
    panel.style.setProperty('--tune-c', TEAMS[team].color);
    $('#tuning').setAttribute('aria-labelledby', `tab-${team}`);
    $$('[data-tune]').forEach((input) => {
      const v = prefs.tuning[team][input.dataset.tune];
      if (Number(input.value) !== v) input.value = String(v);
      const pct = ((v - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
      input.style.setProperty('--fill', `${pct}%`);
      input.nextElementSibling.textContent = `${Math.round(v * 100)}%`;
    });
  }

  return { render, open, close, isOpen };
}
