# COOP games

Two separate browser games. Each has its own folder, `package.json` and `node_modules`.

| Game | Folder | Dev server |
|---|---|---|
| 🍳 Cooking Show Chaos | [cooking-show-chaos/](cooking-show-chaos/) | `cd cooking-show-chaos; npm install; npm run dev` → http://localhost:5173 |
| 🐾 Monster Ranch | [monster-ranch/](monster-ranch/) | `cd monster-ranch; npm install; npm run dev` → http://localhost:5174 |

## Deploying

`.github/workflows/deploy.yml` builds both games on every push to `main` and publishes them to GitHub Pages:

- Cooking Show Chaos → `https://<user>.github.io/<repo>/`
- Monster Ranch → `https://<user>.github.io/<repo>/monster-ranch/`
