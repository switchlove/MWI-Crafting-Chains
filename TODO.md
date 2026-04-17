# MWI Crafting Chains — TODO

## Features

### Multi-Item Queue
- [ ] Allow queuing multiple target items in a single run (e.g. 3x Potion A + 2x Potion B)
- [ ] Combine base material requirements across all queued items into a single shopping list
- [ ] Show per-item subtotals alongside the combined total in the materials table
- [ ] Aggregate skill requirements across all queued items

---

### Flat Crafting Order Panel
- [ ] Add a collapsible "Step-by-Step" section below the crafting tree
- [ ] Resolve dependency order (topological sort — leaves first)
- [ ] List each unique crafted item once with total crafts needed
- [ ] Make the panel useful for in-game execution without reading the tree

---

### User Data Section (combine Inventory + Skills + Gear)
Merge the current Inventory panel and new Skills/Gear inputs into a single **"Your Character"** (or "User Data") collapsible panel.

#### Inventory (existing, moved here)
- [ ] Move current inventory textarea into the unified User Data section
- [ ] Retain Toolasha bridge "Load" button and hint chips

#### Skill Levels
- [ ] Add manual skill level inputs (one per skill, numeric)
- [ ] Add bridge support: extend Toolasha userscript to also pull `characterSkills` and store via `GM_setValue`
- [ ] Add a "Load from Toolasha" button in the skills sub-section (mirrors inventory bridge UX)
- [ ] Skill level indicator in **Skill Requirements table**: green check / red X per row based on user's level vs. required level
- [ ] Skill badge in **Crafting Tree nodes**: colour badge green if user meets the level, red if not (grey/default when no user data)

#### Gear Selection
- [ ] Add a gear sub-section listing relevant equipment slots (tool, outfit, etc.)
- [ ] Populate gear options from `itemDetailMap` filtered to equipment items
- [ ] Store selected gear in state alongside inventory/skills
- [ ] (Future) Use selected gear to adjust time estimates or unlock alternative recipes
