# IDLE QUEST

A 3D open-world idle MMO that lives in **one HTML file**. No engine, no build step, no
server, no downloads. The terrain, the orchestral score, the items, the 660 quests and
all **1000 rival adventurers** are generated in your browser the moment you open it.

Open `index.html` on a phone and play.

---

## What it is

You drop into a 2.4 km² continent of twelve zones with a thousand other adventurers who
are genuinely, continuously playing: questing, grinding, hunting world bosses, running
raids, trading, joining clans and fighting clan wars. You see them running past you with
their names, levels, guild tags and gear glow, chatting in world and trade channels.
They keep playing whether your browser is open or not.

Every **seven real days** the world ends. The highest, best-geared, most accomplished
adventurer is crowned **Idle Quest Champion**, their name goes into the Hall of Fame
forever, and everyone — you included — restarts at level 1 with nothing.

There is no level cap and no item cap. The only limit is the seven-day clock.

### Auto Quest

One button hands the whole game to the AI. It picks and accepts quests, walks to them,
fights with a real ability rotation, loots, equips upgrades, sells junk, takes trade
offers, hunts world bosses, clears raids, joins a clan and banks gold — and it keeps
earning while the tab is closed. Turn it off any time and take over mid-fight.

---

## Features

| | |
|---|---|
| **World** | 12 zones, continuous heightfield, rivers, lakes, an ocean rim, a road network linking 12 towns, day/night cycle |
| **Content** | 660 quests, 100 world bosses with named mechanics, 60 raids (5- to 40-player, 3–9 encounters each) |
| **Population** | 1000 AI adventurers across 6 classes and 48 clans, simulated online and offline |
| **Items** | Procedurally generated across 6 rarity tiers — Common, Uncommon, Rare, Epic, Legendary, **Mythic** — with unbounded item level, 11 stats and 16 affixes |
| **Ascendants** | Only **3 adventurers in the entire world** may ever hold Mythic gear in a season. Seats are claimed first-come and never released |
| **Progression** | No level cap. No gear cap. A weekly wipe is the only ceiling |
| **Social** | Clans with respect points, automatic clan wars, a live trade post, incoming trade offers, world/guild/trade chat |
| **Leaderboards** | Hall of Fame top 100 (level, class, gear score, best rarity, clan, gold), top 20 clans with full rosters, the Ascendant registry, and every past season's champion |
| **Audio** | A live procedural orchestral score — motif-based composition that changes for towns, wilds, combat, bosses, raids, night and victory. Not a single recorded sample |
| **Graphics** | Custom WebGL2 renderer: MSAA, HDR pipeline, fitted shadow maps with PCF, instanced geometry, wind-animated grass, animated water with fresnel and sun glints, volumetric-ish sky with clouds and stars, ACES tonemapping, bloom and an unsharp pass for crisp phone panels |
| **Mobile** | Built for touch first: dynamic virtual stick, swipe camera, pinch zoom, tap-to-target, safe-area aware, three quality tiers with resolution scaling |

---

## Controls

**Touch** — drag anywhere on the left half to move (push to the edge to sprint), swipe
on the right to look, pinch to zoom, tap an enemy to target it, tap an adventurer to
inspect them. Abilities are bottom-right; the menu bar is bottom-centre.

**Keyboard** — `WASD` move, `Shift` sprint, `Space` jump, `1`–`6` abilities,
`Tab` target nearest, `F` toggle Auto Quest, `Esc` close panel.

---

## Classes

Warrior (rage bruiser) · Paladin (holy guardian) · Ranger (ranged hunter) ·
Mage (arcane artillery) · Rogue (shadow assassin) · Druid (wild restorer).

Six abilities each, with cooldowns, resource costs, cast times, DoTs, AoEs, gap
closers, defensives and damage cooldowns. The Auto Quest agent plays all six properly.

---

## Running it

```
open index.html          # that's it
```

Requires WebGL2 (any browser from the last few years). The game saves to
`localStorage` every 20 seconds and on exit; it computes what the world — and, if Auto
Quest is on, what you — did while you were away.

## Repo layout

`index.html` is the deliverable and the only file you need. It is generated from the
sources in `src/`, which are kept split for maintainability:

```
src/00_head.html    markup + all CSS
src/01_core.js      math, seeded RNG, gradient noise, formatting
src/02_audio.js     the procedural score engine and synthesised SFX
src/03_content.js   classes, items, quests, bosses, raids, zones, name banks
src/04_world.js     heightfield, biomes, roads, towns, prop scatter, navigation
src/05_gfx.js       WebGL2 core: shaders, render targets, shadows, post
src/06_scene.js     meshes, terrain streaming, character rig, grass, particles
src/07_game.js      physics, combat, mobs, bosses, visible AI players, camera
src/08_meta.js      the 1000-player server sim, clans, wars, seasons, quests
src/09_ui.js        HUD, touch input, nameplates, minimap
src/09b_panels.js   every panel screen
src/10_auto.js      the Auto Quest agent
src/11_main.js      boot, save/load, offline catch-up, frame loop

./build.sh          concatenates src/ -> index.html
./check.js          guards against duplicate top-level declarations
```

Edit under `src/`, run `./build.sh`, and ship `index.html`.
