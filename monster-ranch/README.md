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
| E | Interact (pick berries, touch landmarks, sell at shop, sleep at the farmhouse) |
| Left click | Use held item (throw orb/treat, swing tool) |
| Right click (hold) | Aim: zoom + throw arc preview, accurate throws |
| 1–5 / wheel | Switch item: Bond Orb, Treat, Brush, Watering Can, Hammer |
| Tab | Inventory / Party / Dex |
| Esc | Pause (save, export/import, volume, sensitivity) |

Debug: in the browser console, `game.unlockAll()` opens every zone.

## Build stages

- [x] **1. First-person movement, the ranch hub, one wild zone**
- [ ] 2. Creatures: 3D designs, roaming AI, personalities, Dex
- [ ] 3. Battles + physical Bond Orb catching
- [ ] 4. Ranch building mode, pens, care, happiness, production
- [ ] 5. Online multiplayer (PeerJS)
- [ ] 6. Breeding, eggs, training, evolution, combo moves
- [ ] 7. Shop, notice board, more zones, guardians, saving
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
