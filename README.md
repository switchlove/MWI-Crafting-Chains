# MWI Crafting Chain Calculator

Crafting chain calculator for Milky Way Idle.

This CLI builds full crafting dependency trees, totals base materials, and shows required skill levels.

There is also a browser GUI for GitHub Pages in `docs/`.

Repository: [switchlove/MWI-Crafting-Chains](https://github.com/switchlove/MWI-Crafting-Chains)

## Setup

```bash
npm install
```

Run the local docs site for development:

```bash
npm run dev
```

This serves the app from `docs/` at:

- `http://localhost:4173`

## Data Source

The calculator loads game data in this order:

1. `data/init_client_data.json` (preferred)
2. `vendor/mwi-types/src/sources/game_data.json` (fallback)

To pull the latest data from your MWI data repository:

```bash
mkdir -p data
curl -L https://raw.githubusercontent.com/switchlove/MWI-Data/main/init_client_data.json -o data/init_client_data.json
```

PowerShell equivalent:

```powershell
New-Item -ItemType Directory -Path data -Force | Out-Null
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/switchlove/MWI-Data/main/init_client_data.json" -OutFile "data/init_client_data.json"
```

Optional fallback source (used only when `data/init_client_data.json` is not present):

- `vendor/mwi-types/src/sources/game_data.json`

If you want the fallback file, clone:

```bash
git clone https://github.com/c3d-gg/mwi-types.git vendor/mwi-types
```

## Usage

Type check:

```bash
npm run typecheck
```

By item HRID:

```bash
npm run calc -- --item=/items/wooden_bow --quantity=1
```

By item name:

```bash
npm run calc -- --name="Wooden Bow" --quantity=1
```

With recipe strategy:

```bash
npm run calc -- --name="Wooden Bow" --quantity=1 --recipe-strategy=fastest
```

Example with current data:

```bash
npm run calc -- --name="Basic Food Crate" --quantity=2
```

With inventory to compute missing base mats:

```bash
npm run calc -- --item=/items/wooden_bow --quantity=1 --inventory=inventory.json
```

Example `inventory.json`:

```json
{
  "/items/tree_log": 50,
  "/items/cotton": 40
}
```

## Output Includes

- Crafting chain tree
- Base material totals
- Skill requirements (minimum levels)
- Estimated total crafting time
- Recipe strategy-aware path selection when multiple recipes output the same item

## Notes

- Only production actions are treated as craft recipes.
- Recipe strategies supported: `sort-index`, `fastest`, `fewest-inputs`, `highest-output`.
- Time estimate is the sum of action base times for the whole tree.
- If a name does not match exactly, the CLI prints close item-name suggestions.

## GitHub Pages GUI

The web UI lives in:

- `docs/index.html`
- `docs/styles.css`
- `docs/app.js`

For local development, run:

```bash
npm run dev
```

### Enable Pages

1. Go to repository Settings.
2. Open Pages.
3. Under Build and deployment, set Source to Deploy from a branch.
4. Select branch `main` and folder `/docs`.
5. Save.

GitHub will publish the site at:

- `https://switchlove.github.io/MWI-Crafting-Chains/`

### GUI Features

- Loads MWI data JSON from URL or local file upload
- Search/autocomplete dropdown for item names
- Builds and renders full crafting dependency trees
- Shows base material totals and skill requirements
- Displays estimated total crafting time
- **Inventory tracking** — Have / Missing columns on base materials; input supports:
  - Friendly names: `Sugar: 100`
  - HRID map: `{ "/items/sugar": 100 }`
  - Full Toolasha data paste (`init_character_data` JSON)

### Toolasha Inventory Bridge (userscript)

If you use [Toolasha](https://greasyfork.org/en/scripts/562662-toolasha) with Tampermonkey, an optional companion userscript can auto-load your MWI character inventory directly into the planner — no copy-paste required.

**Install:**

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Install Toolasha from [Greasy Fork](https://greasyfork.org/en/scripts/562662-toolasha) and log into MWI at least once so it captures your character data.
3. Install the companion script by opening the raw file in Tampermonkey:
   [`userscripts/mwi-crafting-chains-toolasha.user.js`](userscripts/mwi-crafting-chains-toolasha.user.js)

Once installed, open the planner and an **"⬆ Load inventory from Toolasha"** button will appear inside the Inventory section, showing your character name and item count.

**No Toolasha / Steam?** Use the "Copy console command" button on the page, run the command in the MWI browser console, and paste the result.

By default, the GUI loads data from:

- `https://raw.githubusercontent.com/switchlove/MWI-Data/main/init_client_data.json`
