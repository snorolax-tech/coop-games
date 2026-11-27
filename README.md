# COOP games

Separate browser games. Each has its own folder, `package.json` and `node_modules`.

| Game | Play | Folder | Dev server |
|---|---|---|---|
| 🍳 Cooking Show Chaos | [▶ Play](https://snorolax-tech.github.io/coop-games/) | [cooking-show-chaos/](cooking-show-chaos/) | `cd cooking-show-chaos; npm install; npm run dev` → http://localhost:5173 |
| 🐾 Monster Ranch | [▶ Play](https://snorolax-tech.github.io/coop-games/monster-ranch/) | [monster-ranch/](monster-ranch/) | `cd monster-ranch; npm install; npm run dev` → http://localhost:5174 |
| 🔩 Scrap Brawl | [▶ Play](https://snorolax-tech.github.io/coop-games/scrap-brawl/) | [scrap-brawl/](scrap-brawl/) | `cd scrap-brawl; npm install; npm run dev` → http://localhost:5175 |
| 🧟 Junktown Nights | [▶ Play](https://snorolax-tech.github.io/coop-games/junktown/) | [junktown/](junktown/) | `cd junktown; npm install; npm run dev` → http://localhost:5176 |

## Deploying

`.github/workflows/deploy.yml` builds every game on every push to `main` and publishes them to GitHub Pages:

- Cooking Show Chaos → `https://snorolax-tech.github.io/coop-games/`
- Monster Ranch → `https://snorolax-tech.github.io/coop-games/monster-ranch/`
- Scrap Brawl → `https://snorolax-tech.github.io/coop-games/scrap-brawl/`
- Junktown Nights → `https://snorolax-tech.github.io/coop-games/junktown/`
