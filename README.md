# Block Hoops

A floating street-basketball diorama that runs an autonomous 4v4 full-court game to 11.

- **Court:** 28 × 15 m with two complete hoops, a center line and circle, and matching keys, free-throw circles, restricted areas and 6 m arcs at both ends.
- **Scoring:** baskets from inside the arc are worth 1, from beyond it 2. First to 11 wins, with no two-point margin needed.
- **Teams:** the Sparks (orange) always attack the east basket and the Tides (teal) the west one.
- **Flow:** after a made basket, the conceding team inbounds from behind that baseline. Steals and defensive rebounds start a fast break.

## Languages

The whole UI is available in Chinese and English. By default it follows the browser language: Chinese for any `zh` locale, English otherwise. Switch it with 自动 / 中文 / English at the top of the control panel. The choice is remembered. All text lives in `src/i18n/strings.js`.

## Control panel

Open it with the **控制面板** button at the bottom right. It is a drawer on desktop and a bottom sheet on phones.

- **播放 (Playback):** pause, single step of 0.1 s while paused, restart the current game, and speed 0.5× / 1× / 2× / 4×.
- **比赛规则 (Rules):** win score (7 / 11 / 15 / 21), point values inside and outside the arc, and auto-restart. Rule changes take effect next game. Use **按新规则立即开新局** to start a new game with them right away.
- **球队 AI (Team AI):**
  - One-tap matchup presets set both teams at once: 均衡对决, 神射手 vs 铁血防守, 跑轰 vs 阵地战, 传切大师 vs 单打独斗 and 强弱悬殊.
  - **⇄ 交换两队** swaps the two sides' styles.
  - Per-team sliders from 25% to 200% for shooting tendency, passing tendency, defensive intensity and accuracy fine-tune from there. They apply live, and the panel shows "自定义" once the sliders no longer match a preset.
- **镜头与画面 (Camera and visuals):** camera presets (auto / side / baseline / top-down / follow the ball), auto-rotate, and toggles for the mini-map, shadows and effects.

When a game ends, the result card shows a box score for that game: FG%, made/attempted beyond the arc, rebounds, steals and passes. The leading team is highlighted on each row. It makes it easy to compare how different presets actually play.

- **时间与天气 (Time and weather):**
  - Times of day: 白天 / 黄昏 / 夜晚 (day / dusk / night). Each changes the sky, sun or moon, street lamps, lit windows and fireflies.
  - Weather: 晴朗 / 细雨 / 瓢泼大雨 (clear / drizzle / downpour). Rain adds streaks, an overcast sky, closer fog, a wet court sheen and, with sound on, rain ambience.
  - Rain is animated on the GPU. The look is visual only: weather does not change gameplay.
- **声音 (Sound):** synthesized effects for dribbles, rim and backboard hits, swishes, whistles, steals, cheers and the final buzzer. No audio files are involved. Sound is off by default because browsers need a click before playing anything. Turn it on in the panel, with the speaker button, or with `M`. Volume is adjustable.

Keyboard: `Space` pauses, `.` steps, `M` toggles sound, `Esc` closes the panel. Settings are saved in the browser's local storage.

## Run

```bash
npm run serve
```

Then open http://localhost:5173. There are no dependencies to install: Three.js loads from jsDelivr.

## Test

```bash
npm test
```

```bash
npm run coverage
```

The simulation in `src/sim/` is pure JavaScript and runs headless. `tests/acceptance.test.js` plays complete games and checks the acceptance criteria:

- scoring at the correct basket
- inbounds after conceding
- transitions after steals and defensive rebounds
- collisions at both hoops
- no conflicting possession

## Layout

| Path | What lives there |
| --- | --- |
| `src/sim/rules.js` | Game state machine: inbound, live, shot, rebound, dead, gameOver |
| `src/sim/physics.js` | Ball flight with rim, backboard and net collisions for each hoop |
| `src/sim/ai.js`, `src/sim/brain.js` | Transition lanes, settled spacing, man-to-man defense, ball-handler decisions |
| `src/sim/sim.js` | Fixed-step simulation that ties rules, physics and AI together |
| `src/sim/boxscore.js` | Per-game box score, tallied event by event |
| `src/render/` | Three.js diorama: block, court texture, hoops and nets, players |
| `src/env/presets.js` | Time-of-day and weather looks as testable data |
| `src/i18n/strings.js` | Chinese and English UI text, language resolution |
| `src/audio/` | Sound cue planning (pure, tested) and Web Audio synthesis |
| `src/ui/hud.js` | Scoreboard, possession and attack direction, status banners, mini-map |

In the browser, `window.__cornerCourt.sim` exposes the live state. `window.__cornerCourt.advance(seconds)` fast-forwards the game for debugging.
