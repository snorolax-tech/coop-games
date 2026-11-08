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
| 1–6 / wheel | Switch item: Bond Orb, Treat, Brush, Watering Can, Hammer, Partner |
| 6 then click | Send out your lead partner at the wild creature you're aiming at (starts a battle, or joins your friend's) |
| Q | Cycle which partner leads |
| In battle: 1–4 / R | Pick a move / run away (throw a Bond Orb any time to try to befriend) |
| Tab | Inventory / Party / Dex |
| Esc | Pause (save, export/import, volume, sensitivity) |

Debug: in the browser console, `game.unlockAll()` opens every zone.

## Build stages

- [x] **1. First-person movement, the ranch hub, one wild zone**
- [x] **2. Creatures: 30 original 3D designs, roaming AI, personalities, Dex**
- [x] **3. Battles + physical Bond Orb catching**: starter partner, in-world turn-based battles (1v1, or 2v2 team battles in co-op), XP/levels, catching with sneak/behind/co-op bonuses, rare creatures need teamwork
- [ ] 4. Ranch building mode, pens, care, happiness, production
- [x] **5. Online multiplayer (PeerJS)**: host/join, shared world, avatars, chat (pulled forward; 2v2 battles and co-op catching arrive with stages 3 and 6)
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
