# 🧟 Junktown Nights

A 2-player online co-op first-person zombie survival game with **freeform crafting**.
Scavenge a small town by day, combine junk into whatever you can think of, and hold out
against the horde at night. Built with **Vite + Three.js + PeerJS** (peer-to-peer, no server).
No art or audio files: everything is code-built shapes and Web Audio synth sounds.

## ▶ Run it

```bash
cd junktown
npm install
npm run dev
```

Open http://localhost:5176. **Play Solo**, or **Host Game** and send your friend the code shown
in the top-left. Friends can drop in any time.

## Controls

| Key | Action |
|---|---|
| WASD / Mouse | Move / look (click the game to lock the mouse) |
| Shift / Space | Sprint / jump |
| Left click | Use the held item (swing, shoot, throw, place, heal) |
| 1–0 / wheel | Pick a hotbar slot |
| E | Search containers · pick up items · use the workbench · hold to revive your friend |
| G | Drop the held item (give stuff to your friend) |
| N | Ready for night (skips the rest of the day when both are ready) |

## The crafting system (no recipes)

Every junk item has **properties**: 🔪 sharp, 🔨 blunt, 📏 long, ⭕ hollow, 🧱 sturdy, 🔥 flammable,
✨ spark, 💧 liquid, 💥 explosive, ⚡ electric, 🩹 sticky, 🌀 spin, 🟢 bouncy, 🚀 launch,
🧲 magnetic, 📌 fragment, ☣ toxic, 📢 noise, 💡 light, ➕ heal.

At the workbench, combine any 2–3 items (crafted items count, up to 6 base parts total). Their
properties are added together and `analyze()` in `src/items.js` decides what you made:

| What dominates | You get |
|---|---|
| heal | healing kit |
| lots of sturdy | placeable barricade (spiky if sharp/fragment) |
| spin + sharp/blunt | placeable blender trap |
| magnetic | zombie magnet (pulls them in, hurts them if spiky) |
| launch + hollow/long | launcher (payload = the other properties) |
| hollow + flammable + spark | flamethrower |
| explosive + bouncy | bouncing mine |
| explosive / flammable / toxic / noise | throwable bomb / molotov / gas bomb / decoy |
| anything else | melee weapon |

Extra properties add effects: fire, shock (chains with lots of electric), poison, bleeding, slow,
knockback, light (lights up the night). Names are generated from what's inside, e.g.
*Flaming Shocking Rocket Launcher of Doom*.

Examples: pipe + knife = Spear · pipe + gas can + lighter = Flamethrower · fan + knife =
Blender Trap · propane + nails = Mega Bomb · alarm clock + propane = Screaming Decoy (lures
zombies, then explodes) · magnet + nails = Spike Magnet.

## Nights

Night N spawns `8 + 6×(N−1)` zombies from the edge of town. Runners show up on night 2,
armored brutes on night 3 (only heavy blunt hits or explosions do full damage), exploders
on night 4. At 0 HP you're downed: your friend holds E on you to revive. Both down = game over.
Each dawn about 60% of searched containers restock.

## Code map

| File | What it does |
|---|---|
| `src/items.js` | Base items + properties, the crafting rules (`analyze`), names, item meshes |
| `src/director.js` | Host-only: day/night, waves, zombie AI, loot, structures, explosions, status effects |
| `src/player.js` | First-person movement, inventory, using every kind of item, projectiles |
| `src/town.js` | Town layout, colliders, containers + loot tables, day/night lighting |
| `src/zombies.js` | Zombie types + models |
| `src/game.js` | Main loop, input, networking glue, syncing host state into meshes |
| `src/ui.js`, `src/style.css` | Menus, HUD, workbench screen |
