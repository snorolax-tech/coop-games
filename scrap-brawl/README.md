# 🔩 Scrap Brawl

A 2-player online **versus** mech brawler. Each round you grab junk off a conveyor belt,
bolt it onto your mech, then fight your friend with whatever you built. Built with
**Vite + Three.js + PeerJS** (peer-to-peer, no server). No art or audio files: everything is
code-built low-poly shapes and Web Audio synth sounds.

## ▶ Run it

```bash
cd scrap-brawl
npm install
npm run dev
```

Open http://localhost:5175. **Practice vs Bot** to play solo, or **Host Game** and send the
5-letter code to your friend, who types it in and clicks **Join**.

## How a match works

1. **Build phase (45s)**: parts ride a shared conveyor belt. Click one to bolt it on. Both
   players grab from the same belt, so you can snipe the part your friend wanted.
   The loser of the last round gets a 4-second **first pick** where only they can grab.
2. **Countdown**, then **fight** (2 min). Knock their HP to 0 to win the round
   (on timeout, higher HP % wins).
3. **Best of 5** (first to 3). Every round starts from a bare frame.

Parts take damage and **break off** mid-fight. Dropped parts lie in the arena: walk over and
press **E** to bolt them onto yourself (arms fill an empty arm slot, otherwise replace your left arm).

## Controls

| Key | Action |
|---|---|
| Click part on belt | Bolt it on (arms: **left-click** = left arm, **right-click** = right arm) |
| WASD / Mouse | Move / aim (click the game to lock the mouse) |
| LMB / RMB | Use left / right arm (hold for drill, flamethrower, magnet) |
| Space | Jump |
| Shift | Back part (jetpack: hold to fly) |
| Q | Dash (Ram Horn makes it hurt) |
| E | Bolt on a dropped part |
| Esc | Release the mouse |

## Parts

| Slot | Parts |
|---|---|
| Arms | Drill, Saw Blade, Spring Glove, Magnet (pulls + rips parts off), Flamethrower (default: Stubby Fist) |
| Legs | Tank Treads (slow, +HP, knockback resist), Spider Legs (climb walls), Rocket Boots (fast, slippery), Pogo Stick (always bouncing, slam landings) |
| Back | Jetpack, Shield Generator, Missile Pod, Extra Arms (spin attack) |
| Head | Armored Helmet (+HP), Ram Horn, Radar Dish (faster cooldowns), Googly Eyes |

**Weight matters**: heavy builds are slower but hit harder; light builds are quick but weak.

## Arena hazards

- **Car crusher** in the middle slams every 10s (flashes red first).
- **Lava pits** on both sides burn and pop you up.
- **Giant magnet** turns on every 25s and drags everyone toward the crusher.

## Code map

| File | What it does |
|---|---|
| `src/parts.js` | Every part's stats + its mesh, and the weight/speed/power stat formula |
| `src/match.js` | Host-only match authority: phases, belt, HP, part damage/detach, pickups, hazards |
| `src/pilot.js` | Movement, physics and weapons for one mech (local player or bot) |
| `src/mech.js` | Mech model + animations |
| `src/world.js` | Arena + junkyard scenes, belt/pickup visuals |
| `src/game.js` | Main loop, input, camera, networking glue |
| `src/net.js` | PeerJS wrapper (same as Monster Ranch) |
| `src/bot.js` | Practice bot |
| `src/ui.js`, `src/style.css` | Menus + HUD |

Tuning lives at the top of `match.js` (round times, wins needed) and in `PARTS` in `parts.js`.
