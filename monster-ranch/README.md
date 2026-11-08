# 🐾 Monster Ranch

A 2-player online co-op first-person creature-sanctuary game. Explore the wilds, befriend
original monsters, raise them on your shared ranch. Built with **Vite + Three.js** (+ PeerJS
for co-op later). No art or audio files: everything is code-built low-poly shapes and
Web Audio synth sounds.

## ▶ Run it

```bash
cd monster-ranch
npm install
npm run dev
```

Open http://localhost:5174. Click **New Ranch**, then click the game to capture the mouse.

## Controls

| Key | Action |
|---|---|
| WASD / Mouse | Move / look |
| Space / Shift | Jump / sprint |
| E | Interact (pick berries, touch landmarks, open the Shop / Notice Board / Barn, sleep at the farmhouse) |
| Left click | Use held item (throw orb/treat, swing tool) |
| Right click (hold) | Aim: zoom + throw arc preview, accurate throws |
| 1–6 / wheel | Switch item: Bond Orb, Treat, Brush, Watering Can, Hammer, Partner |
| 6 then click | Send out your lead partner at the wild creature you're aiming at (starts a battle, or joins your friend's) |
| Q | Cycle which partner leads |
| F (or 6 + click on nothing) | Send your lead partner out to walk with you / call it back. E on it to pet it |
| 6 + click on your friend | Challenge them to a friendly battle (Y/N to accept). Everyone is healed afterwards |
| B (on the ranch) | Build mode: 1–0/wheel choose, R rotate, click place, X demolish |
| Tap E / hold E on a ranch creature | Feed (treat if held, else berries) / pet |
| In battle | On your turn the mouse is freed: **click a move** (or press 1–4) or **Run** (R). Click the game to aim and throw a Bond Orb |
| M | World map (zones, landmarks, guardians, you and your friend) - a minimap is always shown top-right |
| Tab | Inventory / Party / Dex |
| Esc | Pause (save, export/import, volume, sensitivity) |

Debug: in the browser console, `game.unlockAll()` opens every zone.

## Build stages

- [x] **1. First-person movement, the ranch hub, one wild zone**
- [x] **2. Creatures: 30 original 3D designs, roaming AI, personalities, Dex**
- [x] **3. Battles + physical Bond Orb catching**: starter partner, in-world turn-based battles (1v1, or 2v2 team battles in co-op), XP/levels, catching with sneak/behind/co-op bonuses, rare creatures need teamwork
- [x] **4. Ranch**: build mode (pens, troughs, pond, decorations), Barn to move creatures to the ranch, roaming/playing/sleeping ranch creatures, feeding/petting/brushing/cleaning, happiness, resource production
- [x] **5. Online multiplayer (PeerJS)**: host/join, shared world, avatars, chat (pulled forward; 2v2 battles and co-op catching arrive with stages 3 and 6)
- [x] **6. Breeding pen → eggs → incubator → hatching (move inheritance, bred shinies), Training Yard XP, evolution by level or happiness, co-op combo moves**
- [x] **7. Shop (supplies, shared upgrades, zone passes, selling), Notice Board requests, 4 Zone Guardian boss battles (Galeheart, Elderbark, Tidecrown, Pyrokhan), legendary Solstara at max Ranch Rating (teamwork only), full save/export of everything**
- [ ] 8. Polish: menus, music, particles, juice

## Code layout

```
src/
  main.js            boot: game + main menu
  game/game.js       orchestrator: loop, states, inventory, save glue
  game/interact.js   look-at raycast, highlight, E / tool dispatch
  game/fx.js         particles
  core/              input (pointer lock), audio (synth sfx), noise/rng helpers
  world/             terrain, zones, sky (day/night), colliders, props, resources, world builder
  player/            first-person controller, held items + viewmodels
  physics/           thrown-object physics (orbs, treats)
  ui/                HUD, tab panel + pause menu, main menu
  save/              localStorage + JSON export/import
  data/              item catalogue
```

Coming in later stages: `creatures/`, `battle/`, `catching/`, `ranch/`, `breeding/`, `net/`.
