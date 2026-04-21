# MWI Crafting Chains — TODO

## Features

### UX / QoL
- [ ] Shareable URL — encode item name, quantity, and strategy into the URL hash so a link pre-fills the form

---

### Recipe Pinning
- [ ] When an item has multiple recipe options, allow the user to manually pin a specific recipe for that item (overrides the global sort strategy for that node)
- [ ] Persist pinned recipes in the session

---

### Multi-Item Queue
- [ ] Allow queuing multiple target items in a single run (e.g. 3x Potion A + 2x Potion B)
- [ ] Combine base material requirements across all queued items into a single shopping list
- [ ] Show per-item subtotals alongside the combined total in the materials table
- [ ] Aggregate skill requirements across all queued items

---

### Time to Gather
- [ ] Estimate how long gathering missing base materials would take given skill levels and gear (requires action lookup for gathering nodes)

---

## Completed ✓

- [x] Apply `noncombatStats.*Efficiency` (e.g. `brewingEfficiency`) and `skillingEfficiency` from gear to reduce expected `craftsNeeded` — efficiency gives a chance at bonus output, effectively multiplying output count by `(1 + efficiency)`
- [x] Show efficiency bonuses in "Bonuses Applied" panel alongside speed bonuses
- [x] Missing materials highlight in tree — shade nodes red/yellow where base materials are short, so you can see which branches you can't start yet
- [x] Quantity presets — quick-select buttons (×1, ×10, ×100) next to the quantity field
- [x] "Have enough" summary line above the materials table (e.g. "✓ You have all materials" or "✗ Missing 3 kinds")
- [x] Show coin cost of base materials using market price data (if available in game data)
- [x] Show total estimated gold cost for missing materials
- [x] Market price flag on correct column (Missing, not Total Cost)
- [x] Market prices served as static `docs/data/marketplace.json`; auto-refreshed every 6 h via GitHub Actions
- [x] Inventory import (multi-format: JSON HRID map, characterItems array, friendly name lines)
- [x] Skill Levels import via bridge
- [x] Gear Loadout import via bridge
- [x] House Levels import via bridge (v1.6.4 — fixed Map extraction + `/house_rooms/` → `/houses/` normalisation)
- [x] Collapsible Player Data sections (Inventory, Skill Levels, Houses, Gear Loadout)
- [x] Skill indicators (green ✓ / red ✗) in crafting tree badges and Skill Requirements table
- [x] Centered Skill Requirements table columns
- [x] 3-column layout for Skill Levels and Houses
- [x] Session save/restore: auto-save all Player Data + item inputs to `localStorage`; Export Session (→ `.json` download) and Import Session (← file picker)
- [x] Add Map-aware extraction to `extractCharacterSkills` and `extractCharacterEquipment` in case Toolasha switches those to Maps too 
- [x] Apply house room action bonuses to craft-time calculations (efficiency/action_speed, filtered by action type)
- [x] Use selected skill tool items (`noncombatStats.*Speed` + `skillingSpeed`) to adjust time estimates; shown in tree as `(tool: +X% speed)`
- [x] Use selected gear (`noncombatStats.*Speed`) to adjust time estimates; bonuses listed in "Bonuses Applied" panel, filtered to chain action types
- [x] Press Enter in the item name field (or quantity field) to trigger Calculate
- [x] Add "Total Actions" stat (sum of all `craftsNeeded` across crafted nodes) alongside Estimated Total Time
- [x] Show per-craft action time in each crafting tree node (e.g. `12s each`)
- [x] Let user specify active drinks (from `itemDetailMap` drink items) to factor their speed/efficiency bonuses into time estimates
- [x] Copy base materials list to clipboard as plain text
- [x] Load Example fills in example skill levels, house levels, and gear without overwriting existing data
- [x] Clear button on each Player Data section header to wipe that section's inputs
- [x] Collapsible Crafting Tree, Base Materials, Skill Requirements, and Player Data panels
- [x] Flat Crafting Order panel (Step-by-Step): topological sort, one row per crafted item with total crafts needed

