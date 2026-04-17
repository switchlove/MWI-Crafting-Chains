# MWI Crafting Chain Calculator

Crafting chain calculator for Milky Way Idle.

This CLI builds full crafting dependency trees, totals base materials, and shows required skill levels.

Repository: [switchlove/MWI-Crafting-Chains](https://github.com/switchlove/MWI-Crafting-Chains)

## Setup

```bash
npm install
```

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

## Notes

- Only production actions are treated as craft recipes.
- If multiple recipes can create an item, the first recipe by sort order is selected.
- Time estimate is the sum of action base times for the whole tree.
- If a name does not match exactly, the CLI prints close item-name suggestions.
