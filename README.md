# MWI Crafting Chain Calculator

Crafting chain calculator using data from [c3d-gg/mwi-types](https://github.com/c3d-gg/mwi-types).

## Setup

```bash
npm install
```

The repository data source is expected at:

- `vendor/mwi-types/src/sources/game_data.json`

If missing, clone it:

```bash
git clone https://github.com/c3d-gg/mwi-types.git vendor/mwi-types
```

## Usage

By item HRID:

```bash
npm run calc -- --item=/items/wooden_bow --quantity=1
```

By item name:

```bash
npm run calc -- --name="Wooden Bow" --quantity=1
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

## Notes

- Only production actions are treated as craft recipes.
- If multiple recipes can create an item, the first recipe by sort order is selected.
- Time estimate is the sum of action base times for the whole tree.
