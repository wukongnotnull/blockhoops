# Block Hoops — Project Prompt

This prompt describes the project as it is currently built. Every number, name and behavior below comes from the code in this repository. Building from it should reproduce the app.

---

## OVERVIEW

Build **"Block Hoops"**, a polished interactive street-basketball diorama with an autonomous 4v4 full-court simulation.

- **Scene:** a floating city block hangs in a dusk sky. It holds a 28 × 15 m court with two working hoops.
- **Game:** eight AI players play a full-court game to 11. It starts immediately on load and restarts by itself after each game.
- **Viewer controls:**
  - orbit and zoom the 3D view
  - a control panel for playback, rules, team AI styles, camera, time of day, weather and sound
  - a box score at the end of every game

**Teams:** two teams, with attack directions fixed for the whole game.

| Team | Short | Color | Trim | Attacks |
| --- | --- | --- | --- | --- |
| Sparks | SPK | `#ff6a2b` (orange) | `#ffd5b8` | the east hoop (+x) |
| Tides | TDS | `#22c7b8` (teal) | `#c9fff8` | the west hoop (−x) |

**Language:** the whole UI is bilingual, Chinese and English. See LOCALIZATION. The control panel is listed below by its Chinese labels, with English in parentheses.

---

## TECH AND STRUCTURE

### Dependencies

- Plain ES modules with no build step and no npm dependencies.
- Three.js `0.160.0` loads through an import map from jsDelivr:
  - `three` → `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`
  - `three/addons/` → `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/`
  - Addons used: `OrbitControls` and `BufferGeometryUtils.mergeGeometries`.
- Fonts come from Google Fonts:
  - **Bungee** for display: scores, banners, team names and canvas lettering.
  - **Space Grotesk** 400/500/700 for UI text.

### Two halves

- **Simulation (`src/sim/`):**
  - pure, headless and deterministic with a seeded RNG (mulberry32)
  - no DOM and no Three.js
  - state transitions return new objects; only the RNG is shared mutable state
- **Presentation (`src/render/`, `src/ui/`, `src/audio/`, `src/main.js`):**
  - reads sim snapshots and never feeds physics back into the sim

### Layout

| Path | Responsibility |
| --- | --- |
| `src/sim/config.js` | Court, hoop, ball, team, speed, spot and timing constants |
| `src/sim/geometry.js` | Hoop positions, per-hoop local frame, shot value, bounds, inbound spots |
| `src/sim/rules.js` | Game state machine |
| `src/sim/physics.js` | Ball flight plus rim, backboard, net and floor collisions; basket detection |
| `src/sim/ai.js` | Defensive assignment, offensive spots, transition lanes, man defense, retreat spots |
| `src/sim/brain.js` | Per-state movement intents and ball-handler decisions |
| `src/sim/players.js` | Player creation, steering, separation, jumps |
| `src/sim/sim.js` | Fixed-step orchestration: `createSim`, `stepSim`, `restartSim`, `setTuning`, `setNextRules` |
| `src/sim/settings.js` | Rule and AI-tuning defaults plus validation |
| `src/sim/presets.js` | Matchup presets |
| `src/sim/boxscore.js` | Per-game box score reducer and display rows |
| `src/sim/rng.js` | Seeded RNG |
| `src/env/presets.js` | Time-of-day and weather looks as plain data |
| `src/render/*` | Scene and camera, block, court and hoops, players and ball, rain, environment, static merging |
| `src/audio/cues.js` | Pure sound-cue planner |
| `src/audio/sfx.js` | Web Audio synthesis |
| `src/i18n/strings.js` | Chinese and English dictionaries, `translate`, `resolveLang` |
| `src/ui/*` | HUD, control panel, viewer preferences, `data-i18n` applier, localStorage helpers |
| `src/main.js` | Wires everything together and runs the loop |
| `scripts/serve.mjs` | Zero-dependency static dev server (`npm run serve`, port 5173) |
| `scripts/build-artifact.mjs` | Writes `dist/corner-court.html` for claude.ai Artifact publishing |

**File size:** keep files under about 400 lines (800 hard maximum) and functions small.

---

## WORLD, COURT AND HOOPS

### Coordinates

- Units are meters.
- x runs along the court length, z across its width, y up. The origin is center court.
- **Hoop index:** hoop 0 is west (−x) and hoop 1 is east (+x).
- **Per-hoop local frame `(u, v)`:**
  - origin under the rim; u points toward center court; v is lateral
  - `u = RIM_X − s·x`, `v = s·z`, where s = −1 for hoop 0 and +1 for hoop 1, and `RIM_X = 14 − 1.575`
  - both ends are a 180° rotation of the same frame
- **Use this frame for all shooting, spacing, cutting, defense, lanes and inbound logic,** so both ends behave identically.

### Court

- 28 × 15 m: `halfL = 14`, `halfW = 7.5`.
- **Markings:** painted onto one canvas texture, about 72 px per meter, covering the court plus a 1.6 m asphalt apron.
  - sidelines, baselines, center line, and a 1.8 m center circle filled orange
  - keys 4.9 m wide × 5.8 m deep, filled orange
  - free-throw circles, radius 1.8: solid toward center court, dashed toward the baseline
  - restricted-area arcs, radius 1.25
  - lane hash marks at 1.75, 2.85 and 3.95 m from the baseline
- **6 m scoring arcs:** centered on each rim, clipped to the court. Because 6 < 7.5 the arc meets the baseline directly, with no corner lines.
- **Arc zone:** the area inside each arc is a lighter teal (`#216a76`) than the rest of the court (`#1b5560`).
- **Wordmarks:**
  - "BLOCK" / "HOOPS" at center court
  - "NO DUNKS AFTER DARK · EST. 1987 · WINNERS STAY" stenciled on the near apron
- Lines are cream (`#f3ead6`). Add light grain noise.

### Hoops

Two complete, mirrored assemblies.

**Rim**
- Rim center 1.575 m in from each baseline at y = 3.05.
- Rim radius 0.24 m with tube 0.02, orange.

**Backboard**
- Glass face 1.2 m in from the baseline, 1.8 m wide.
- Spans y 2.9 to 3.95, 0.05 m thick.
- Translucent, with a white frame edge and an orange shooter's square.

**Support and net**
- Stanchion pole and padded base 1.2 m behind the baseline, with an arm and brace to the board.
- Bracket from the board to the rim.
- Net of 14 strands × 6 rings, 0.42 m deep, tapering to radius 0.15.
- **Net animation:**
  - sways from ball velocity when the ball enters
  - stretches on makes and bulges around the ball as it passes through
  - the rim shakes briefly on rim contacts

### Floating block

- **Bounds:** x −24…24, z −19…15.
- **Slab:** layered concrete, curb, soil and grass edge, with low-poly rock chunks hanging beneath. Rock tops stay below y −2.4 so nothing pokes through the court. A few small rocks float and bob around the block.
- **Brownstone row on the far side** (−z): eight 5–7 m wide buildings, 8–13 m tall, with:
  - lit-window facade textures (window glow lives in an emissive map)
  - cornices, two water towers, AC units
  - shopfronts with awnings
  - a gradient mural reading "BLOCK / HOOPS — RUN IT FULL. WINNERS STAY."
- **Around the court:**
  - chain-link fence at x ±16.4 and z ±9.7: 3.4 m high on three sides, 1.1 m on the near side so the view stays open
  - four street lamps
  - six low-poly trees
  - wooden bleachers outside the near fence
  - benches, a hydrant, a trash can
  - a road with yellow dashes along the near edge
- **Fireflies:** about 90 point sprites drifting slowly.

---

## GAME RULES

### States

The game runs in explicit states: `inbound`, `live`, `shot`, `rebound`, `dead`, `gameOver`.

- **Pure transitions in `rules.js`:** each returns the same object when it is not allowed in the current state.
  - `createGame`, `beginInbound`, `completeInbound`
  - `releaseShot`, `shotMissed`, `scoreBasket`
  - `gainPossession`, `looseBall`, `outOfBounds`, `restartGame`
- **Possession:** one ball holder at most. While a player holds the ball, `game.possession` always equals that player's team.

### Scoring

- **Shot value:** taken from the release spot, measured to the basket being attacked. Beyond the 6 m arc earns the outside value (default 2); inside earns the inside value (default 1).
- **Basket detection:** each rim separately watches for downward crossings of its rim plane. A ball moving down whose interpolated crossing point lies inside the rim radius counts.
- **Who scores:** points go to the team attacking the basket that was scored on. A ball through the wrong rim is worth the inside value.
- **Once only:** a basket counts only from the `shot` state and only once per shot (`shot.scored`).

### Winning

- First to the win score (default 11) wins, with no win-by-2. A 2 from 10 ends the game at 12.
- Wins are recorded across games.

### Restarts and inbounds

- **Opening possession:** each game opens with a baseline inbound by the first-possession team, from behind the basket it defends. First possession alternates every game.
- **After a made basket:**
  - the conceding team inbounds from behind the baseline of the basket that was just scored on
  - the spot is 0.55 m outside the baseline, at least 2.2 m to the side of center, so never behind the backboard
  - there is a 1.4 s dead ball first
- **Out of bounds:** a free ball out of bounds goes to the team that did not touch it last.
  - **When a ball is out:** it touches the floor outside the lines, or travels more than 3 m beyond them.
  - **Inbound spot:** sideline or baseline, near the exit point and never behind a backboard. Baseline spots keep |z| ≥ 2.2.
  - There is a 1.0 s dead ball first.
- **Inbound sequence:**
  - the inbounder walks to the spot and is allowed out of bounds
  - they hold the ball for 0.8 s, then pass to the best open in-bounds teammate
  - inbound passes cannot be intercepted
  - the inbounder can never catch their own pass
  - an inbound is only completed in bounds
- **Possession changes:**
  - **Defensive rebounds and steals:** start a transition toward the other basket immediately.
  - **Offensive rebounds:** go straight into settled offense.

### Removed and auto-restart

- No half-court check-ball, no make-it-take-it, no clearing past the arc.
- **Auto-restart:** when on, the next game starts 7 s after game over.

---

## FULL-COURT AI

### Movement

- Steering with acceleration 16 m/s², arrival easing, and separation pushes between bodies.
- Players stay on court unless they are inbounding.
- **Speeds (m/s):** sprint 6.6, run 5.0, jog 3.4; dribbling 5.6 fast or 3.8 normal.

### Transition offense

Transition lasts until the handler is within 7.5 m of the rim after 2.2 s, or until 6.5 s have passed.

**Ball handler**
- Drives at the attacking rim.
- **Hit-ahead pass:** at most one per possession, to a teammate who is all of:
  - 3.5 m or more nearer the rim than the handler
  - within 7 m of it
  - open by more than 2.4 m
  - reachable along a clear lane
- Settles early if the lane is blocked inside 7.5 m.
- Shoots a layup inside 1.9 m.

**Teammates**
- Fill distinct lanes, sorted by their lateral position: the widest runners take the wings at (u 2.4, v ±5.9), anyone in between trails at (u 8.2, v −1.2).

### Settled offense

**Spacing**
- Off-ball players take unique spots from this set, chosen by the closest overall matching:
  - top (7.3, 0)
  - wings (5.6, ±4.7)
  - corners (0.9, ±6.7)
  - elbows (4.3, ±2.6)
- Spots within 2.6 m of the handler are skipped.
- Spots are reassigned after every catch.
- **Clustering:** nobody spots up under the rim.

**Cutting**
- One cutter at a time, every 2.5–5 s, to (1.5, ±1.1), for 1.7 s.

**Handler decisions** (every 0.3 s; every 0.2 s in transition)
- Shoot when:
  - within 1.8 m of the rim
  - the shot clock runs out (16 s, scaled by shooting tendency)
  - an open shot is good enough
- Hit the cutter when the cutter is open near the rim.
- Drive when help defense leaves the lane clear. Drives persist for up to 2.2 s.
- Pass to the best open teammate, scored by openness plus that teammate's expected shot value.
- Otherwise jab around their spot. The handler's spot is pulled into the frontcourt, to u 7.6 at most.

### Defense

- **Retreat:** after a possession change, defenders sprint for 1.5 s to deep retreat spots near their own basket: (2.8, ±2.3) and (5.6, ±1.4).
- **Man-to-man:** after the retreat, they set four unique matchups, chosen as the minimum-total-distance assignment over all 24 permutations. Matchups are recomputed when the offense settles.
- **Positioning:**
  - goal-side of their man: 1.0 m on the ball
  - off the ball they sag 1.4–3.0 m and shade 12% toward the ball
  - never within 1.3 m of the rim
  - no full-court press: defenders never go beyond u 11.4
- **On a shot:** offensive crashers go to the rim at (2.0, ±1.5) and defenders box out.
- **Loose balls:** the two nearest players per team chase the predicted landing spot.

### Steals

- **On-ball steal:** each defender within 0.85 m tries at 0.22 per second, scaled by defense intensity.
  - 60% of attempts are clean steals; the rest poke the ball loose.
- **Pass interception:** a defender within 0.65 m of a pass in flight, with the ball below 2.4 m, tries once.
  - success chance 0.4 × defense intensity, capped at 0.9

---

## BALL AND PHYSICS

### Integration

- Four substeps per sim step, gravity 9.81.
- Ball radius 0.13 (drawn slightly larger, at 1.35×, so it reads on phones).

### Collisions

Applied independently at both hoops.

| Contact | Model | Restitution | Tangential friction |
| --- | --- | --- | --- |
| Rim | Sphere against the torus' circular core | 0.5 | 0.88 |
| Backboard | Sphere against an axis-aligned box | 0.62 | 0.9 |
| Floor | Bounce, then rolling friction once bounces fall below 0.35 m/s | 0.72 | — |

- **Net:** drag and centering while the ball is inside the net cylinder. Each entry raises a `net` contact.
- **Stuck ball:** a nearly still ball resting on a rim or wedged against a board is nudged back toward the court.

### Shots

- **Launch velocity:** solved for flight time `T = 0.55 + 0.08 × distance`.
- **Aim error:** Gaussian, along and across the shot line, with sigma:

  ```text
  (0.03 + 0.012 × distance + 0.07 × contest) / accuracy
  ```

  Contest is based on the nearest defender's distance.
- **Jumps:** the shooter jumps, and the closest defender jumps to contest if within 1.7 m.
- **Miss:** declared when the ball:
  - falls 0.6 m below the rim plane
  - drifts more than 1.2 m away while falling below the rim
  - or is still in the air 4 s after release

### Passes and rebounds

- **Passes:** flight time `0.22 + distance / 14`, led to where the receiver is moving.
  - **Catch:** within 0.8 m, by the intended receiver or any teammate within 0.5 m other than the passer.
  - **Failure:** a pass that hits the floor or times out becomes a loose ball.
- **Loose balls and rebounds:**
  - grabbed within 0.75 m and below 2.95 m
  - never grabbed from inside the rim zone

### Shot balance

Aim for roughly 55–60% shooting overall: most layups go in, deep 2s about a quarter to a third. A game should take about 4–6 minutes at 1×.

---

## HUD

### Top

- **Scoreboard:**
  - each team's direction arrow (▶ / ◀), name and score
  - a glowing possession dot on the team with the ball
  - the score bumps when it changes
  - the middle shows a state chip (TIP-OFF, INBOUND, LIVE, SHOT UP, LOOSE BALL, DEAD BALL, FINAL) and "FIRST TO {winScore}"
- **Possession line:** "{Team} ball · attacking east ▶" or "◀ west".

### Status banners

Big Bungee text, team-colored, queued one at a time.

| Banner | When |
| --- | --- |
| INBOUND | An inbound starts |
| STEAL! | A steal |
| POKED LOOSE | A deflection |
| BOARD | A defensive rebound |
| FAST BREAK | After steals, defensive rebounds and loose-ball turnovers |
| HIT AHEAD | An ahead pass |
| SWISH | A make without touching rim or board |
| FROM DEEP | A make from beyond the arc |
| BUCKET | Any other make |
| GAME POINT | The scoring team reaches winScore − 1 |
| OUT OF BOUNDS | The ball goes out |
| TIP-OFF | A new game starts |

### Bottom and game over

- **Mini-map** (bottom left):
  - shows the court, both arcs and hoops
  - each team's arrow points at the basket it attacks
  - live dots for players and ball
  - rotates with the camera's yaw so it always matches the 3D view
- **Bottom right:** game number and series wins ("Game N · Wins SPK a – b TDS"), a pause button, a sound button, and the "控制面板" button.
- **Game-over card:**
  - "{TEAM} WIN" and the final score
  - "本局技术统计", a table with the leading team highlighted per row:
    - 命中率: `55% (11/20)`
    - 弧外命中: made/attempted; the leader is decided by percentage
    - 篮板
    - 抢断
    - 传球: live passes only
  - a "Next game tips off in Ns" countdown, or "Auto restart is off"
  - "Run it again"
- **Box score:** tallied event by event as the game is played, so it survives the trimmed event log (the browser keeps only the last 120 events), and reset on restart.

### Responsive layout

- **Portrait phones:** the camera looks down the court from one end, with a wider field of view and a steeper angle.
- **Narrow screens:**
  - names, chips and buttons shrink
  - the bottom bar stacks at ≤420 px
  - direction arrows hide at ≤360 px
- No horizontal page scroll at 320 px.

---

## CONTROL PANEL (控制面板)

**Form:**
- A right-side drawer (360 px) on desktop.
- A bottom sheet (up to 62 vh) at ≤640 px.
- On wide screens the scoreboard slides left while the drawer is open.

**语言 (language):** a 自动 / 中文 / English selector at the top of the panel.

**Keyboard:** `Space` pauses, `.` steps, `M` toggles sound, `Esc` closes. Segmented controls are radio groups operated with the arrow keys.

### 01 播放 (playback)

- 暂停/继续 (pause/resume)
- 单步 (step): enabled only while paused; advances 0.1 s
- 重开本局 (restart this game)
- 速度 (speed): 0.5× / 1× / 2× / 4×

### 02 比赛规则 (rules)

- 获胜分数 (win score): 7 / 11 / 15 / 21
- 弧内得分 (inside value): 1 / 2
- 弧外得分 (outside value): 2 / 3. Always kept above the inside value.
- 比赛结束后自动开下一局 (auto restart): takes effect immediately.
- **When rule changes apply:** the other rule changes wait for the next game, and a note shows the current game's rules. "按新规则立即开新局" starts a new game with them right away.

### 03 球队 AI (team AI)

**预设阵容 (matchup presets):** one tap sets both teams. The active preset is highlighted; once the sliders no longer match any preset, the note reads "自定义".

| Preset | Sparks | Tides |
| --- | --- | --- |
| 均衡对决 | 均衡 | 均衡 |
| 神射手 vs 铁血防守 | 神射手 | 铁血防守 |
| 跑轰 vs 阵地战 | 跑轰 | 阵地战 |
| 传切大师 vs 单打独斗 | 传切大师 | 单打独斗 |
| 强弱悬殊 | 全明星 | 新人 |

**⇄ 交换两队 (swap sides):** swaps the two teams' styles, and the card labels follow.

**Sliders per team:** SPARKS / TIDES tabs, each slider 25%–200%, applied live.

| Slider | Effect |
| --- | --- |
| 出手倾向 (shooting tendency) | Shot willingness, quality threshold, shot-clock patience |
| 传球倾向 (passing tendency) | Pass, cutter and hit-ahead probabilities |
| 防守强度 (defensive intensity) | Steal rate and interception chance |
| 命中率 (accuracy) | Divides aim error |

"恢复默认" resets the selected team's sliders.

**Balance:** each preset should play visibly in its style. Every preset except 强弱悬殊 should be roughly even over many games; 强弱悬殊 should favor the strong side heavily.

### 04 镜头与画面 (camera and visuals)

- 镜头 (camera presets):
  - 自动 (auto): side view in landscape, baseline view in portrait
  - 侧面 (side)
  - 底线 (baseline)
  - 俯视 (top-down)
  - 跟球 (follow the ball): closer, with the orbit target gliding after the ball
- 自动环绕旋转 (auto-rotate)
- 小地图 (mini-map)
- 实时阴影 (shadows)
- 萤火虫与球轨迹 (fireflies and ball trail)

### 05 时间与天气 (time and weather)

- 时间 (time of day): 白天 / 黄昏 / 夜晚
- 天气 (weather): 晴朗 / 细雨 / 瓢泼大雨

### 06 声音 (sound)

- 音效 (sound effects) switch
- 音量 (volume) 0–100%

### Saved settings

- All preferences and the series record live in localStorage under `corner-court:prefs` and `corner-court:wins`.
- Every stored value is validated on load, and every storage call is wrapped in try/catch.

---

## LOCALIZATION

- **Languages:** Chinese (`zh`) and English (`en`).
- **Choosing a language:**
  - The `lang` preference is `auto`, `zh` or `en`; default `auto`.
  - `auto` follows the browser's first language: Chinese for any `zh*` locale, English otherwise.
  - Switching applies instantly and is saved with the other preferences.
- **Dictionary:** every UI string lives in `src/i18n/strings.js`.
  - Both languages have the same keys and the same `{placeholders}`.
  - `translate(lang, key, params)` falls back to English, then to the key itself.
- **Static markup:** elements carry `data-i18n` (text), `data-i18n-aria` (aria-label) and `data-i18n-title` (title). `applyStaticText(lang)` fills them and sets `<html lang>` to `zh-CN` or `en`.
- **Dynamic text:** the HUD and panel translate their own text at render time.
  - This covers banners, state chips, the possession line, the series line, the game-over card, box-score row labels, the rules note, matchup titles, descriptions and side labels, and pause and sound button labels.
  - Banners are queued by key and translated when shown.
  - The HUD exposes `setLang`, which forces a full refresh.
- **Data stays language-neutral:** matchup presets and box-score rows carry ids (`m.<id>.title|blurb|side0|side1`, `box.<key>`), never display text.
- **Not translated in either language:**
  - "Block Hoops"
  - the team names Sparks and Tides and their SPK / TDS tags
  - the painted court lettering and the mural
- **Chinese typography:** neither Bungee nor Space Grotesk has CJK glyphs, so the font stacks fall back to PingFang SC, Hiragino Sans GB, Noto Sans SC or Microsoft YaHei. Banners, chips and the winner title use weight 900 under `:lang(zh)`.
- **Banners in both languages:**

  | Event | English | Chinese |
  | --- | --- | --- |
  | Inbound | INBOUND | 发界外球 |
  | Steal | STEAL! | 抢断！ |
  | Deflection | POKED LOOSE | 球被捅掉 |
  | Defensive rebound | BOARD | 篮板 |
  | Fast break | FAST BREAK | 快攻 |
  | Ahead pass | HIT AHEAD | 长传推进 |
  | Swish | SWISH | 空心入网 |
  | Make beyond the arc | FROM DEEP | 远投命中 |
  | Other make | BUCKET | 进球 |
  | Game point | GAME POINT | 赛点 |
  | Out of bounds | OUT OF BOUNDS | 出界 |
  | New game | TIP-OFF | 开球 |

---

## TIME OF DAY AND WEATHER

Looks are plain data in `src/env/presets.js`, applied by `src/render/environment.js`. Weather is visual only and never changes gameplay.

### Time of day

**Dusk (default)**
- Sky `#1c1838 → #4a2f5c → #e3825a`, glow `#ffc58f`.
- Warm low sun (`#ffb27a`, 2.4) from the west.
- Lamps 30, window glow 0.9, fireflies on.

**Day**
- Sky `#3f8fd8 → #8cc4ec → #f2e6cf`.
- High white-yellow sun (3.0).
- Lamps off, bulbs dimmed, window glow 0.12, no fireflies.

**Night**
- Sky `#05070f → #0d1530 → #1d2a4d`.
- Cool moonlight (0.9) and a blue hemisphere light (0.85).
- Lamps 90 with a 26 m reach, window glow 1.6, fireflies on, exposure 1.3.
- Players and team rings must stay readable at night.

### Weather

Settings for 晴朗 / 细雨 / 瓢泼大雨:

| Setting | 晴朗 (clear) | 细雨 (drizzle) | 瓢泼大雨 (downpour) |
| --- | --- | --- | --- |
| Rain streaks | 0 | 1800 | 7000 |
| Fall speed | — | 14 | 24 |
| Streak length | — | 0.5 | 0.9 |
| Sun multiplier | 1 | 0.55 | 0.22 |
| Hemisphere multiplier | 1 | 0.85 | 0.7 |
| Sky and fog toward grey | 0% | 35% | 65% |
| Darkening | — | ×0.92 | ×0.8 |
| Fog distance multiplier | 1 | 0.75 | 0.5 |
| Court wetness | 0 | 0.45 | 0.9 |
| Rain-ambience level | 0 | 0.25 | 0.6 |
| Fireflies | follow the time of day | follow the time of day | hidden |

- **Wet court:** wetness lowers the court's roughness, adds a slight metalness and a cool tint.
- **Rain rendering:** one `LineSegments` object whose shader moves static drop positions with a time uniform, slanted slightly. The draw range sets the count. No per-drop CPU work.
- **Applying a look:** the page sky uses CSS variables (`--sky-top`, `--sky-mid`, `--sky-low`, `--sky-glow`). Changing time or weather re-bakes the shadow map once.

---

## SOUND

Everything is synthesized with the Web Audio API; there are no audio files. Sound is off by default and only starts from a user gesture. A saved "on" waits for the first pointer press.

### Cue planning

The pure `planCues(state, { events, contacts, dribbles, now })` maps a frame to sounds. Contacts and dribbles are rate-limited to one per 90 ms per kind and hoop. Dribbles play at most once a frame.

| Trigger | Sound |
| --- | --- |
| Score | `swish` for a swish or `net` for a rim-in, plus `cheer` (louder for deep makes) |
| Out of bounds, restart | `whistle` |
| Steal | `squeak` |
| Game over | `buzzer` |
| Rim contact | `rim` |
| Board contact | `board` |
| Free-ball floor impact | `bounce` |
| Dribble | `dribble`, at each floor touch while dribbling live (bounce phase `sim.time × 8.5`) |

### Voices

| Sound | Synthesis |
| --- | --- |
| Dribble, bounce | Pitch-dropping sine plus a low-passed noise thump |
| Rim | Inharmonic triangle and sine partials |
| Board | Low thud |
| Swish | Rising band-passed noise |
| Whistle | Vibrato sine |
| Squeak | Sawtooth chirps |
| Buzzer | Detuned squares |
| Cheer | Swelling filtered noise |
| Rain ambience | Looping band-limited noise, gain from the weather |

Volume is applied on a master gain.

---

## CAMERA, RENDERING AND PERFORMANCE

### Camera

- Perspective camera with field of view 30 (40 in portrait), plus `OrbitControls` with damping, pan disabled and limited polar angles.
- **Fitting:** frame the whole block by binary-searching the distance until every block bounding-box corner (y −9…13.5) projects inside the viewport with a margin. Refit on resize.
- Fog distances scale with the fit distance.

### Look

- ACES tone mapping, sRGB output.
- Hemisphere light, a warm directional sun with PCF soft shadows (2048 map), a cool rim light, and point lights for two of the four lamps.
- **Players:** low-poly figures, drawn at 1.18× scale.
  - body: jersey cylinder, shorts, legs, feet, arms, head and headband
  - jersey numbers on the front and back
  - team-colored floor ring and blob shadow
  - a floating chevron over the ball handler
  - legs and arms swing with speed; arms go up when jumping
- **Ball:** a canvas-textured ball with a blob shadow, and a short trail during shots and passes.

### Performance rules

These came from measured fan-noise problems; keep all of them.

- **Frame rate:** render at most 60 fps, even on 120 Hz screens. The sim runs at a fixed 1/60 s step with at most 16 steps per frame.
- **When paused:** do not render unless the camera or settings changed.
- **Pixel ratio:** cap at 1.5.
- **Shadows:** `shadowMap.autoUpdate = false`. Only static geometry casts shadows. Re-bake only when shadows are toggled or the environment changes. Players and ball use blob shadows.
- **Static merging:** merge static block meshes by shared material, with materials cached per color and options. Each building is one body box plus one facade plane. Target about 210 draw calls.
- **No backdrop-filter** on HUD elements that sit over the moving canvas.
- **HUD writes:** only touch the DOM when a value changes.
- **Rain:** GPU only.

---

## VISUAL DIRECTION

- **Mood:** a dusk block party. A warm peach-to-indigo sky, a teal court with orange keys, sodium-lamp glow, and low-poly brownstones.
- **Palette:** single, intentionally dark. HUD panels are deep translucent indigo, `rgba(22, 18, 38, ~0.86)`, with a warm hairline border; amber accent `#f4b13d`. Set `color-scheme: dark`.
- **Typography:** Bungee for numbers and banners, Space Grotesk for UI.
- **Motion:** compositor-friendly only, using transform and opacity. Honor `prefers-reduced-motion`: calmer banners, no auto-rotate, no floating rocks, fireflies or rain motion.
- **Accessibility:** visible focus, `aria` labels on icon buttons, live regions for score, possession and status, and keyboard-operable radio groups.

---

## PUBLISHING

- Run `npm run build:artifact`. It strips the outer `<!doctype>`, `<html>`, `<head>` and `<body>` tags plus the charset and viewport metas, and keeps `<title>Block Hoops</title>` first.
- Publish `dist/corner-court.html` as the page, with every file in `src/` alongside it under the same relative paths.
- Keep the output file name so the artifact keeps its URL.
- Only cdn.jsdelivr.net/npm scripts and Google Fonts are external.

---

## TESTING AND ACCEPTANCE CHECKS

Use Node's built-in test runner (`npm test`); `npm run coverage` reports coverage. Sim-module line coverage is about 99%; keep it at 80% or above. Write the failing test first for new behavior.

### Unit tests

- **Geometry:** local frames, shot values, bounds, inbound spots.
- **Rules:** every transition, once-only scoring, win score, wins.
- **Physics:**
  - swishes count once per hoop
  - upward crossings don't count
  - rim and board collisions at both ends
  - floor energy loss
  - the launch solver
- **AI helpers:** unique assignments, unique spots, lanes, man spots, retreat spots.
- **Settings, preferences and presets:** validation, swap, and preset recognition.
- **Box score:** the reducer and display rows.
- **Cue planning:** event mapping and rate limits.
- **Environment:** orderings across all nine combinations.

### Acceptance tests

`tests/acceptance.test.js` plays complete games headless across seeds, plus sim-level control tests. They check that:

1. Both teams score, always through the basket they attack, with shot value matching the release spot.
2. The score only changes through score events, once per shot.
3. Conceding teams inbound from behind the baseline of the basket scored on, never behind the board.
4. Out-of-bounds goes to the other team near the exit and never behind a backboard.
5. More than 75% of steals and defensive rebounds advance the ball toward the new basket (or reach a scoring position) within 5 s.
6. On more than 80% of shots, the defense is closer to the defended basket than the offense.
7. Both hoops record rim, backboard and net contacts.
8. No more than three players stand under either basket on any shot.
9. Possession never conflicts.
10. Passes reach a teammate other than the passer; inbounds are caught in bounds.
11. Games finish, wins are recorded, the game restarts, and a saved record resumes.
12. No check-ball, clearing, make-it-take-it or "TAKE IT BACK" text remains in the code.
13. The control-panel effects hold:
    - custom win scores and point values work
    - rule changes wait for the next game while auto-restart applies at once
    - each slider measurably changes field-goal percentage, steals, passes or time to shoot
    - the 强弱悬殊 preset wins at least 3 of 4 games
14. Both dictionaries share identical keys and placeholders, and every `data-i18n` key in the HTML exists. Every matchup, box-score row, game state and banner has text in both languages. `resolveLang` follows explicit choices, then the browser.
