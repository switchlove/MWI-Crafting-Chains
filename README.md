# MWI Crafting Chains

A browser-based crafting planner for [Milky Way Idle](https://www.milkywayidle.com/). Build full recipe trees, calculate base materials and gold cost, estimate crafting time, and plan multi-item production queues.

**[Open the planner →](https://switchlove.github.io/MWI-Crafting-Chains/)**

---

## Features

- Full crafting dependency trees with per-step time estimates
- Multi-item queue — add several targets and calculate them together
- Base materials table with market prices updated hourly
- Skill requirement badges (green ✓ / red ✗ based on your levels)
- Best Drinks suggestion for your crafting chain
- Shareable URLs that encode your entire queue
- [Toolasha Bridge userscript](https://github.com/switchlove/MWI-Crafting-Chains/wiki/Toolasha-Bridge) — auto-syncs inventory, skills, gear, and houses from the game page

Full documentation is on the **[Wiki](https://github.com/switchlove/MWI-Crafting-Chains/wiki)**.

---

## Local development

```bash
git clone https://github.com/switchlove/MWI-Crafting-Chains.git
cd MWI-Crafting-Chains
npm install
npm run dev        # serves docs/ at http://localhost:4173
```

To refresh market prices locally:

```bash
npm run prices
```

---

## Project structure

```
docs/          Static web app (HTML, CSS, JS) — served via GitHub Pages
data/          Game data JSON (init_client_data.json)
tools/         price-server.js — fetches marketplace prices from MWI
userscripts/   Toolasha Inventory Bridge userscript
src/           TypeScript crafting-chain logic
```

---

## Market prices

Prices are fetched hourly by a GitHub Actions workflow and committed to `docs/data/marketplace.json`. The planner shows a price-age badge so you always know how fresh the data is.

---

## License

MIT
