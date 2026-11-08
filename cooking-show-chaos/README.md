# 🍳 Cooking Show Chaos

A goofy 2-player online co-op first-person cooking show. One chef cooks, the other films. Everything goes wrong, and that's good for views.

Built with **Vite + Three.js + cannon-es + PeerJS**. There are no art or audio files: every model is made from code-built low-poly shapes, and every sound is synthesized with the Web Audio API.

---

## ▶ Run it locally

You need [Node.js](https://nodejs.org) (LTS). Then, in this folder:

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173 in Chrome, Edge or Firefox.

To test multiplayer on one PC, open the page in **two separate browser windows** side by side. Click **Host Game** in one and **Join Game** in the other, then type the code. (Use separate windows, not tabs: a background tab pauses its game loop.)

## 🎮 Controls

| Key | Action |
| --- | --- |
| WASD / Mouse | Move / look (click the game to lock the mouse) |
| Shift / Space | Sprint / jump |
| Left click | Pick up · drop · put into a plate/pot/pan · grab from crates · serve at the window |
| Right click | Throw the held item (throwing a finished dish through the serving window counts, with a bonus!) |
| E | Use: **hold** to chop on a cutting board, burners on/off, fill a pot at the sink, stop a flooding sink, unplug the mixer, **hold** to spray the extinguisher |
| Q | Pick up / put down the show camera |
| R | Start / stop **recording** (while holding the camera; E on a set-down camera also works) |
| V | Mute / unmute your mic |
| TAB (hold) | Step-by-step recipe book |
| Esc | Pause / release the mouse |

## 🍔 Recipes

* **Burger** (on a plate): bun + cooked patty + lettuce + tomato. Patties come from the fridge; cook them in a pan on a lit burner and pour the pan onto the plate.
* **Salad** (in a bowl): chopped lettuce + chopped tomato + chopped cucumber.
* **Soup** (in a bowl): fill a pot at the sink, add chopped carrot + chopped onion, boil it on a lit burner, then pour it into an empty bowl.

Cooking goes **raw → cooked → burnt → 🔥 ON FIRE**. Watch the progress bars above the pans.

## 🎥 The show camera, the tape & ChefTube

* The show isn't live. You **record** it. Grab the camera (Q) and press **R** to record. The tape is limited (90 s, more with camera upgrades), so save it for the good stuff.
* Only moments that happen **inside the camera's view while recording** make it into the video. Perfect dishes are good; disasters (fires, burnt food, ragdolling your partner with a thrown pan) are better.
* Put the camera down (Q) for a static tripod shot, worth half the hype. Press E on it to start or stop recording.
* After the episode, the host clicks **Post to ChefTube** and you both watch the video together. You see exactly what the camera saw, with the view count climbing, chat reacting, and **your voice chat** playing back.
* **Voice chat** connects automatically in multiplayer. Voices get quieter the farther apart you are. Toggle it in the lobby, mute with V.

---

## ✅ Testing each stage

| Stage | What to check |
| --- | --- |
| **1 · Movement & physics** | Play Solo → Start. Walk/sprint/jump, look around. Left-click a plate to pick it up, click again to drop it, right-click to throw it. Things bounce, stack and knock each other over. |
| **2 · Cooking** | Grab a patty at the fridge, click the pan, press E on the burner. Grab bun/lettuce/tomato from the crates and click them onto a plate. When the patty bar turns green, pick up the pan and click the plate. Carry the plate to **SERVE HERE**. Also try a salad (chop with hold-E) and a soup. Leave a pan on too long and it catches fire. |
| **3 · Camera, viewers, chat** | Press Q at the camera on the little table. A LIVE feed appears bottom-right. Serve a dish while filming the window and watch the viewer count jump and chat react. Serve one off camera and get nothing. |
| **4 · Chaos events** | The first event fires after ~28 seconds, then every 30–60 s, getting faster: grease fire (grab the 🧯, hold E), sink flood (slippery! press E on the sink), earthquake, runaway mixer (E to unplug), lights out, and a rogue chicken (click it to catch it, or throw something at it). |
| **5 · Multiplayer** | Window A: Host Game, which shows a code. Window B: Join Game and type the code. Host picks a set and presses Start. Both chefs see each other (pink vs blue), held items and the camera. Close one window and the other shows "Signal lost!" and returns to the menu. |
| **6 · Results, shop, saving** | Finish an episode (5 min) to see dishes, best moment, peak viewers and money. Buy upgrades or new kitchen sets (⛵ boat that rocks, 🌭 windy BBQ). Reload the page and your money and upgrades are still there. |
| **7 · Polish** | Sounds (sizzle, fire, chops, dings, chicken squawks, crowd cheers), confetti on perfect dishes, screen shake, foam particles, banners. |

---

## 🌍 Deploy it for free (so your friend can play from anywhere)

The game is a static website. The multiplayer connection goes **directly between your two browsers** (WebRTC). PeerJS's free public server only introduces you to each other, so you don't run any server of your own.

### Option A: Netlify Drop (easiest, about 2 minutes, no Git needed)

1. In this folder, build the game:
   ```bash
   npm run build
   ```
   This creates a `dist` folder.
2. Go to **https://app.netlify.com/drop** and sign up for free (GitHub/Google/email).
3. Drag the **`dist` folder** onto the page.
4. Netlify gives you a link like `https://jolly-pancake-123.netlify.app`. Send it to your friend.
5. To update later, run `npm run build` again and drag the new `dist` folder onto your site's **Deploys** tab.

### Option B: GitHub Pages (auto-deploys every time you push)

1. Create a free account at https://github.com and a **new empty repository** (e.g. `cooking-show-chaos`).
2. Install Git from https://git-scm.com, then in this folder run each of these:
   ```bash
   git init
   ```
   ```bash
   git add .
   ```
   ```bash
   git commit -m "Cooking Show Chaos"
   ```
   ```bash
   git branch -M main
   ```
   ```bash
   git remote add origin https://github.com/YOUR-NAME/cooking-show-chaos.git
   ```
   ```bash
   git push -u origin main
   ```
3. On GitHub, open the repo → **Settings → Pages** → under "Build and deployment" set **Source: GitHub Actions**.
4. The included workflow (`.github/workflows/deploy.yml`) builds and publishes automatically. After a minute or two your game is at `https://YOUR-NAME.github.io/cooking-show-chaos/`.

### Playing together

1. Both open the link (desktop Chrome/Edge/Firefox).
2. You click **Host Game** and read the 5-letter code to your friend (Discord, text, etc.).
3. Your friend clicks **Join Game**, types the code, and you press **Start Episode**.

**If joining fails:** check the code. Make sure you're both on the same version of the site (refresh). Some strict school/office networks block WebRTC, so try a home network. PeerJS's public TURN relay is used automatically as a fallback.

> Progress (money, upgrades, sets) is saved per browser. In multiplayer, the **host's** upgrades and kitchen set are used, and both players bank the episode's earnings into their own save.

---

## 🗂 Code structure

```
src/
  main.js            app flow: menus ↔ lobby ↔ game ↔ results, main loop
  audio.js           Web Audio synth sound effects + ambient loops
  save.js            localStorage progress, upgrade & kitchen-set definitions
  core/input.js      keyboard/mouse + pointer lock
  net/network.js     PeerJS host/join, room codes, heartbeat & disconnects
  ui/hud.js          viewers, timer, orders, chat, banners, toasts, progress bars, PIP frame
  ui/menus.js        main menu, join, lobby, shop, results, pause screens
  game/game.js       one episode: host-authoritative simulation, actions, snapshots/interpolation, rendering
  game/kitchen.js    builds the kitchen sets (geometry, colliders, stations, lights)
  game/items.js      item definitions + procedural low-poly meshes
  game/player.js     first-person controller + chef avatar
  game/cooking.js    recipes, dish judging, stove/chopping/fire/orders
  game/showcam.js    show camera visibility tests + picture-in-picture
  game/viewers.js    viewer counter, hype moments, fake chat
  game/events.js     chaos director: fire, flood, quake, mixer, lights, chicken, wind
  game/fx.js         particles, flames, puddle, chicken model
```

**Networking model:** the host runs all physics and game logic and sends snapshots 20×/sec. The joiner simulates only their own movement locally (so it feels instant), sends their position/look 30×/sec plus action events (click/throw/E/Q), and renders everything else interpolated ~110 ms behind.

**Adding stuff:** new recipe → `RECIPES` + `evaluateDish` in `cooking.js`. New chaos event → add to `EVENTS` and the `switch` in `events.js`. New ingredient → `ITEM_DEFS` + a mesh case in `items.js` + a crate in `kitchen.js`. New upgrade → `UPGRADES` in `save.js`, then read `game.upgrades.<id>` where it matters.
