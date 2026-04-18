const DEFAULT_DATA_URL =
  "https://raw.githubusercontent.com/switchlove/MWI-Data/main/init_client_data.json";
const DEFAULT_RECIPE_STRATEGY = "sort-index";
const GEAR_SLOT_TO_EQUIPMENT_TYPES = {
  "head": ["/equipment_types/head"],
  "necklace": ["/equipment_types/neck", "/equipment_types/trinket"],
  "earrings": ["/equipment_types/earrings"],
  "body": ["/equipment_types/body"],
  "legs": ["/equipment_types/legs"],
  "feet": ["/equipment_types/feet"],
  "hands": ["/equipment_types/hands"],
  "ring": ["/equipment_types/ring"],
  "main-hand": [
    "/equipment_types/main_hand",
    "/equipment_types/two_hand",
  ],
  "off-hand": ["/equipment_types/off_hand"],
  "pouch": ["/equipment_types/pouch"],
  "back": ["/equipment_types/back"],
  "charm": ["/equipment_types/charm"],
  "brush": ["/equipment_types/milking_tool"],
  "shears": ["/equipment_types/foraging_tool"],
  "hatchet": ["/equipment_types/woodcutting_tool"],
  "hammer": ["/equipment_types/cheesesmithing_tool"],
  "chisel": ["/equipment_types/crafting_tool"],
  "spatula": ["/equipment_types/cooking_tool"],
  "pot": ["/equipment_types/brewing_tool"],
  "alembic": ["/equipment_types/alchemy_tool"],
  "enhancer": ["/equipment_types/enhancing_tool"],
};

const state = {
  itemDetailMap: null,
  skillDetailMap: null,
  actionDetailMap: null,
  houseRoomDetailMap: null,
  actionByOutput: new Map(),
  itemMap: new Map(),
  skillMap: new Map(),
  houseRoomMap: new Map(),
  lastResult: null,
};

const elements = {
  dataUrl: document.getElementById("dataUrl"),
  dataFile: document.getElementById("dataFile"),
  loadDataBtn: document.getElementById("loadDataBtn"),
  dataStatus: document.getElementById("dataStatus"),
  itemName: document.getElementById("itemName"),
  itemNameOptions: document.getElementById("itemNameOptions"),
  itemHrid: document.getElementById("itemHrid"),
  quantity: document.getElementById("quantity"),
  recipeStrategy: document.getElementById("recipeStrategy"),
  inventoryJson: document.getElementById("inventoryJson"),
  calculateBtn: document.getElementById("calculateBtn"),
  exampleBtn: document.getElementById("exampleBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  copyMaterialsBtn: document.getElementById("copyMaterialsBtn"),
  exportSessionBtn: document.getElementById("exportSessionBtn"),
  importSessionFile: document.getElementById("importSessionFile"),
  tree: document.getElementById("tree"),
  materials: document.getElementById("materials"),
  skills: document.getElementById("skills"),
  statTime: document.getElementById("statTime"),
  statActions: document.getElementById("statActions"),
  statBase: document.getElementById("statBase"),
  statSkills: document.getElementById("statSkills"),
  statBonuses: document.getElementById("statBonuses"),
};

elements.dataUrl.value = DEFAULT_DATA_URL;

function setStatus(message, isError = false) {
  elements.dataStatus.textContent = message;
  elements.dataStatus.style.color = isError ? "#b8412d" : "#38544d";
}

function formatDuration(seconds) {
  const whole = Math.round(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getOutputCount(action, itemHrid) {
  return (action.outputItems || []).find((o) => o.itemHrid === itemHrid)?.count || 1;
}

function chooseRecipeForOutput(itemHrid, candidates, strategy) {
  if (candidates.length === 1) return candidates[0];

  const sorted = [...candidates].sort((a, b) => {
    if (strategy === "sort-index") {
      return (a.sortIndex || Number.MAX_SAFE_INTEGER) - (b.sortIndex || Number.MAX_SAFE_INTEGER);
    }

    if (strategy === "fastest") {
      const aPerOutput = (a.baseTimeCost || 0) / getOutputCount(a, itemHrid);
      const bPerOutput = (b.baseTimeCost || 0) / getOutputCount(b, itemHrid);
      if (aPerOutput !== bPerOutput) return aPerOutput - bPerOutput;
    }

    if (strategy === "fewest-inputs") {
      const aInputs = (a.inputItems || []).reduce((sum, input) => sum + (input.count || 0), 0);
      const bInputs = (b.inputItems || []).reduce((sum, input) => sum + (input.count || 0), 0);
      const aPerOutput = aInputs / getOutputCount(a, itemHrid);
      const bPerOutput = bInputs / getOutputCount(b, itemHrid);
      if (aPerOutput !== bPerOutput) return aPerOutput - bPerOutput;
    }

    if (strategy === "highest-output") {
      const outputDiff = getOutputCount(b, itemHrid) - getOutputCount(a, itemHrid);
      if (outputDiff !== 0) return outputDiff;
    }

    return (a.sortIndex || Number.MAX_SAFE_INTEGER) - (b.sortIndex || Number.MAX_SAFE_INTEGER);
  });

  return sorted[0];
}

function buildActionLookup(actions) {
  const map = new Map();

  Object.values(actions).forEach((action) => {
    if (action.function !== "/action_functions/production") return;
    if (!Array.isArray(action.outputItems) || action.outputItems.length === 0) return;

    action.outputItems.forEach((output) => {
      const list = map.get(output.itemHrid) || [];
      list.push(action);
      map.set(output.itemHrid, list);
    });
  });

  map.forEach((list, key) => {
    list.sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
    map.set(key, list);
  });

  return map;
}

function getHouseActionTimeBonus(action, userHouseLevels) {
  if (!action || !userHouseLevels || userHouseLevels.size === 0 || state.houseRoomMap.size === 0) {
    return 0;
  }

  let totalBonus = 0;
  const actionType = action.type;

  userHouseLevels.forEach((level, houseHrid) => {
    if (!Number.isFinite(level) || level <= 0 || typeof houseHrid !== "string") return;

    const roomHrid = houseHrid.replace("/houses/", "/house_rooms/");
    const room = state.houseRoomMap.get(roomHrid);
    if (!room) return;

    const usable = room.usableInActionTypeMap;
    if (!usable || typeof usable !== "object" || !usable[actionType]) return;

    const actionBuffs = Array.isArray(room.actionBuffs) ? room.actionBuffs : [];
    actionBuffs.forEach((buff) => {
      if (!buff || typeof buff !== "object") return;
      const buffType = buff.typeHrid;
      if (buffType !== "/buff_types/efficiency" && buffType !== "/buff_types/action_speed") return;

      const lvl = Math.max(1, Math.floor(level));
      const perLevel = lvl - 1;
      const flat = Number(buff.flatBoost || 0) + Number(buff.flatBoostLevelBonus || 0) * perLevel;
      const ratio = Number(buff.ratioBoost || 0) + Number(buff.ratioBoostLevelBonus || 0) * perLevel;
      totalBonus += (Number.isFinite(flat) ? flat : 0) + (Number.isFinite(ratio) ? ratio : 0);
    });
  });

  return Math.max(0, totalBonus);
}

function getUserGearStats() {
  const stats = new Map();
  if (!state.itemMap.size) return stats;
  document.querySelectorAll("input[data-gear-slot]").forEach((el) => {
    if (!el.value) return;
    const hrid = findItemByName(state.itemMap, el.value);
    if (!hrid) return;
    const item = state.itemMap.get(hrid);
    const ncs = item?.equipmentDetail?.noncombatStats;
    if (!ncs) return;
    Object.entries(ncs).forEach(([k, v]) => {
      if (Number.isFinite(v) && v !== 0) {
        stats.set(k, (stats.get(k) || 0) + v);
      }
    });
  });
  return stats;
}

function getGearActionTimeBonus(action, gearStats) {
  if (!action || !gearStats || gearStats.size === 0) return 0;
  const segment = action.type?.split("/").pop();
  if (!segment) return 0;
  const speed = gearStats.get(segment + "Speed") || 0;
  const skillingSpeed = gearStats.get("skillingSpeed") || 0;
  return Math.max(0, speed + skillingSpeed);
}

function getUserDrinkBonuses() {
  const bonuses = new Map(); // actionTypeHrid -> total bonus
  if (!state.itemMap.size) return bonuses;
  document.querySelectorAll("input[data-drink-slot]").forEach((el) => {
    if (!el.value) return;
    const hrid = findItemByName(state.itemMap, el.value);
    if (!hrid) return;
    const item = state.itemMap.get(hrid);
    const cd = item?.consumableDetail;
    if (!cd) return;
    const buffs = Array.isArray(cd.buffs) ? cd.buffs : [];
    const relevant = buffs.filter(
      (b) => b.typeHrid === "/buff_types/efficiency" || b.typeHrid === "/buff_types/action_speed",
    );
    if (relevant.length === 0) return;
    let total = 0;
    relevant.forEach((buff) => { total += Number(buff.flatBoost || 0) + Number(buff.ratioBoost || 0); });
    if (total <= 0) return;
    const actionTypes = cd.usableInActionTypeMap ? Object.keys(cd.usableInActionTypeMap) : [];
    actionTypes.forEach((t) => { bonuses.set(t, (bonuses.get(t) || 0) + total); });
  });
  return bonuses;
}

function getDrinkActionTimeBonus(action, drinkBonuses) {
  if (!action || !drinkBonuses || drinkBonuses.size === 0) return 0;
  return Math.max(0, drinkBonuses.get(action.type) || 0);
}

function populateDrinkOptions(itemMap) {
  const datalist = document.getElementById("drink-options");
  if (!datalist) return;
  const drinks = [];
  itemMap.forEach((item) => {
    const cd = item?.consumableDetail;
    if (!cd) return;
    const buffs = Array.isArray(cd.buffs) ? cd.buffs : [];
    const hasRelevant = buffs.some(
      (b) => b.typeHrid === "/buff_types/efficiency" || b.typeHrid === "/buff_types/action_speed",
    );
    if (hasRelevant) drinks.push(item.name);
  });
  drinks.sort();
  datalist.innerHTML = "";
  const frag = document.createDocumentFragment();
  drinks.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    frag.appendChild(opt);
  });
  datalist.appendChild(frag);
}

function collectBonusLines(userHouseLevels, userGearStats, userDrinkBonuses, chainActionTypes) {
  const lines = [];

  // Gear speed bonuses — only stats relevant to action types in this chain
  document.querySelectorAll("input[data-gear-slot]").forEach((el) => {
    if (!el.value) return;
    const hrid = findItemByName(state.itemMap, el.value);
    if (!hrid) return;
    const item = state.itemMap.get(hrid);
    const ncs = item?.equipmentDetail?.noncombatStats;
    if (!ncs) return;
    Object.entries(ncs)
      .filter(([k, v]) => {
        if (!k.endsWith("Speed") || !Number.isFinite(v) || v <= 0) return false;
        if (k === "skillingSpeed") return chainActionTypes.size > 0;
        const actionType = "/action_types/" + k.slice(0, -5); // strip "Speed"
        return chainActionTypes.has(actionType);
      })
      .forEach(([k, v]) => {
        const label = k.replace("Speed", "").replace(/([A-Z])/g, " $1").trim().toLowerCase();
        lines.push(`${item.name}: +${Math.round(v * 1000) / 10}% ${label} speed`);
      });
  });

  // House bonuses — only rooms applicable to action types in this chain
  userHouseLevels.forEach((level, houseHrid) => {
    if (!Number.isFinite(level) || level <= 0) return;
    const roomHrid = houseHrid.replace("/houses/", "/house_rooms/");
    const room = state.houseRoomMap.get(roomHrid);
    if (!room) return;
    const usable = room.usableInActionTypeMap;
    const appliesToChain = usable && typeof usable === "object"
      && [...chainActionTypes].some((t) => usable[t]);
    if (!appliesToChain) return;
    const actionBuffs = Array.isArray(room.actionBuffs) ? room.actionBuffs : [];
    const relevant = actionBuffs.filter(
      (b) => b.typeHrid === "/buff_types/efficiency" || b.typeHrid === "/buff_types/action_speed",
    );
    if (relevant.length === 0) return;
    const lvl = Math.max(1, Math.floor(level));
    const perLevel = lvl - 1;
    let total = 0;
    relevant.forEach((buff) => {
      const flat = Number(buff.flatBoost || 0) + Number(buff.flatBoostLevelBonus || 0) * perLevel;
      const ratio = Number(buff.ratioBoost || 0) + Number(buff.ratioBoostLevelBonus || 0) * perLevel;
      total += flat + ratio;
    });
    if (total > 0) {
      const name = room.name || roomHrid.split("/").pop().replace(/_/g, " ");
      lines.push(`${name} Lv ${level}: +${Math.round(total * 1000) / 10}% speed`);
    }
  });

  // Drink bonuses — only drinks applicable to action types in this chain
  document.querySelectorAll("input[data-drink-slot]").forEach((el) => {
    if (!el.value) return;
    const hrid = findItemByName(state.itemMap, el.value);
    if (!hrid) return;
    const item = state.itemMap.get(hrid);
    const cd = item?.consumableDetail;
    if (!cd) return;
    const actionTypes = cd.usableInActionTypeMap ? Object.keys(cd.usableInActionTypeMap) : [];
    const appliesToChain = actionTypes.some((t) => chainActionTypes.has(t));
    if (!appliesToChain) return;
    const buffs = Array.isArray(cd.buffs) ? cd.buffs : [];
    const relevant = buffs.filter(
      (b) => b.typeHrid === "/buff_types/efficiency" || b.typeHrid === "/buff_types/action_speed",
    );
    if (relevant.length === 0) return;
    let total = 0;
    relevant.forEach((buff) => { total += Number(buff.flatBoost || 0) + Number(buff.ratioBoost || 0); });
    if (total > 0) {
      lines.push(`${item.name}: +${Math.round(total * 1000) / 10}% speed`);
    }
  });

  return lines;
}

function findItemByName(itemMap, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return undefined;

  let exact = undefined;
  itemMap.forEach((item) => {
    if (!exact && item.name.toLowerCase() === normalized) {
      exact = item.hrid;
    }
  });
  if (exact) return exact;

  let partial = undefined;
  itemMap.forEach((item) => {
    if (!partial && item.name.toLowerCase().includes(normalized)) {
      partial = item.hrid;
    }
  });

  return partial;
}

function suggestItems(itemMap, query, max = 8) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const terms = normalized.split(/\s+/).filter(Boolean);

  const ranked = [];
  itemMap.forEach((item) => {
    const lower = item.name.toLowerCase();
    let score = 0;

    if (lower.includes(normalized)) score += 100;
    terms.forEach((term) => {
      if (lower.includes(term)) score += 12;
    });

    if (score > 0) ranked.push({ item, score });
  });

  return ranked
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, max)
    .map((entry) => entry.item);
}

function populateItemAutocomplete(itemMap) {
  const options = Array.from(itemMap.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8000);

  const fragment = document.createDocumentFragment();
  options.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.name;
    option.label = item.hrid;
    fragment.appendChild(option);
  });

  elements.itemNameOptions.innerHTML = "";
  elements.itemNameOptions.appendChild(fragment);
}

function getOrCreateGearDatalist(slotKey) {
  const listId = `gear-options-${slotKey}`;
  let datalist = document.getElementById(listId);
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = listId;
    document.body.appendChild(datalist);
  }
  return datalist;
}

function populateGearOptions(itemMap) {
  const gearInputs = Array.from(document.querySelectorAll("input[data-gear-slot]"));
  if (gearInputs.length === 0) return;

  const itemsByType = new Map();
  itemMap.forEach((item) => {
    const type = item?.equipmentDetail?.type;
    if (!type) return;

    if (!itemsByType.has(type)) {
      itemsByType.set(type, []);
    }
    itemsByType.get(type).push(item);
  });

  gearInputs.forEach((input) => {
    const slotKey = input.dataset.gearSlot || "";
    const equipmentTypes = GEAR_SLOT_TO_EQUIPMENT_TYPES[slotKey] || [];
    const matches = [];

    equipmentTypes.forEach((type) => {
      const items = itemsByType.get(type) || [];
      items.forEach((item) => matches.push(item));
    });

    matches.sort((a, b) => a.name.localeCompare(b.name));

    const datalist = getOrCreateGearDatalist(slotKey);
    datalist.innerHTML = "";

    const seen = new Set();
    const fragment = document.createDocumentFragment();
    matches.forEach((item) => {
      if (seen.has(item.hrid)) return;
      seen.add(item.hrid);

      const option = document.createElement("option");
      option.value = item.name;
      option.label = item.hrid;
      fragment.appendChild(option);
    });

    datalist.appendChild(fragment);
    input.setAttribute("list", datalist.id);
  });
}

/**
 * Build a lowercase-name -> hrid lookup map from state.itemMap.
 * Used for friendly "Item Name: qty" parsing.
 */
function buildNameToHridMap() {
  const map = new Map();
  for (const [hrid, detail] of state.itemMap) {
    if (detail && detail.name) {
      map.set(detail.name.toLowerCase(), hrid);
    }
  }
  return map;
}

/**
 * Parse inventory input in any of the supported formats:
 *  1. Toolasha full init_character_data message  { type: "init_character_data", characterItems: [...] }
 *  2. characterItems array  [{ itemHrid, count, itemLocationHrid }, ...]
 *  3. HRID map (original format)  { "/items/sugar": 100, ... }
 *  4. Friendly "Item Name: qty" lines  (one per line, case-insensitive)
 */
function parseInventoryInput(rawText) {
  const text = rawText.trim();
  if (!text) return { inventory: new Map(), error: null };

  // ── Try JSON first ──────────────────────────────────────────────
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }

  if (parsed !== null) {
    const inventory = new Map();

    // Format 1: full init_character_data message
    if (parsed && typeof parsed === "object" && parsed.type === "init_character_data") {
      const items = parsed.characterItems;
      if (!Array.isArray(items)) {
        return { inventory: new Map(), error: "Pasted init_character_data has no characterItems array." };
      }
      items.forEach(({ itemHrid, count, itemLocationHrid }) => {
        if (itemLocationHrid !== "/item_locations/inventory") return;
        const n = Number(count);
        if (Number.isFinite(n) && n > 0) inventory.set(itemHrid, n);
      });
      return { inventory, error: null };
    }

    // Format 2: characterItems array  [{ itemHrid, count, itemLocationHrid }]
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0] && "itemHrid" in parsed[0]) {
      parsed.forEach(({ itemHrid, count, itemLocationHrid }) => {
        // Accept both inventory-tagged entries and untagged arrays
        if (itemLocationHrid && itemLocationHrid !== "/item_locations/inventory") return;
        const n = Number(count);
        if (Number.isFinite(n) && n > 0) inventory.set(itemHrid, n);
      });
      return { inventory, error: null };
    }

    // Format 3: plain object HRID map  { "/items/sugar": 100 }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.entries(parsed).forEach(([itemHrid, count]) => {
        const n = Number(count);
        if (Number.isFinite(n) && n > 0) inventory.set(itemHrid, n);
      });
      return { inventory, error: null };
    }

    return { inventory: new Map(), error: "Unrecognised JSON format. See the hint below the input." };
  }

  // ── Format 4: friendly "Item Name: qty" lines ───────────────────
  if (!state.itemMap.size) {
    return { inventory: new Map(), error: "Load game data first before using item-name format." };
  }
  const nameToHrid = buildNameToHridMap();
  const inventory = new Map();
  const unmatched = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // Accept "Name: qty", "Name qty", or "qty Name"
    const sepMatch = line.match(/^(.+?)[\s:]+(\d[\d,]*)$/) || line.match(/^(\d[\d,]*)\s+(.+)$/);
    if (!sepMatch) { unmatched.push(line); continue; }

    let namePart = sepMatch[1].trim();
    let qtyPart  = sepMatch[2].trim();
    // Handle reversed "qty name" pattern
    if (/^\d/.test(sepMatch[1])) { [namePart, qtyPart] = [sepMatch[2].trim(), sepMatch[1].trim()]; }

    const n = Number(qtyPart.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) { unmatched.push(line); continue; }

    const hrid = nameToHrid.get(namePart.toLowerCase());
    if (!hrid) { unmatched.push(namePart); continue; }

    inventory.set(hrid, (inventory.get(hrid) || 0) + n);
  }

  if (inventory.size === 0 && unmatched.length > 0) {
    return { inventory: new Map(), error: `No items recognised. Unknown: ${unmatched.slice(0, 3).join(", ")}` };
  }

  const error = unmatched.length
    ? `Some lines not recognised and were skipped: ${unmatched.slice(0, 3).join(", ")}`
    : null;

  return { inventory, error };
}

function buildCraftTree(itemHrid, quantity, strategy, userHouseLevels, userGearStats, userDrinkBonuses, path = new Set()) {
  if (path.has(itemHrid)) {
    throw new Error(`Circular dependency detected at ${itemHrid}`);
  }

  const item = state.itemMap.get(itemHrid);
  const candidates = state.actionByOutput.get(itemHrid) || [];

  if (candidates.length === 0) {
    return {
      itemHrid,
      itemName: item ? item.name : itemHrid,
      quantityRequested: quantity,
      quantityProducedPerCraft: 0,
      craftsNeeded: 0,
      isBaseMaterial: true,
      action: null,
      children: [],
      totalTimeSeconds: 0,
    };
  }

  const action = chooseRecipeForOutput(itemHrid, candidates, strategy);
  const outputCount = getOutputCount(action, itemHrid);
  const craftsNeeded = Math.ceil(quantity / outputCount);

  const nextPath = new Set(path);
  nextPath.add(itemHrid);

  const children = [];

  if (action.upgradeItemHrid) {
    children.push(buildCraftTree(action.upgradeItemHrid, craftsNeeded, strategy, userHouseLevels, userGearStats, userDrinkBonuses, nextPath));
  }

  (action.inputItems || []).forEach((input) => {
    children.push(buildCraftTree(input.itemHrid, input.count * craftsNeeded, strategy, userHouseLevels, userGearStats, userDrinkBonuses, nextPath));
  });

  const houseBonus = getHouseActionTimeBonus(action, userHouseLevels);
  const gearBonus = getGearActionTimeBonus(action, userGearStats);
  const drinkBonus = getDrinkActionTimeBonus(action, userDrinkBonuses);
  const ownTime = ((action.baseTimeCost || 0) / 1000000000) * craftsNeeded / (1 + houseBonus + gearBonus + drinkBonus);
  const childTime = children.reduce((sum, child) => sum + child.totalTimeSeconds, 0);

  return {
    itemHrid,
    itemName: item ? item.name : itemHrid,
    quantityRequested: quantity,
    quantityProducedPerCraft: outputCount,
    craftsNeeded,
    isBaseMaterial: false,
    action,
    children,
    totalTimeSeconds: ownTime + childTime,
  };
}

function collectTotalActions(node) {
  if (node.isBaseMaterial) return 0;
  return node.craftsNeeded + node.children.reduce((sum, child) => sum + collectTotalActions(child), 0);
}

function collectBaseMaterials(node, totals = new Map()) {
  if (node.isBaseMaterial) {
    totals.set(node.itemHrid, (totals.get(node.itemHrid) || 0) + node.quantityRequested);
    return totals;
  }

  node.children.forEach((child) => collectBaseMaterials(child, totals));
  return totals;
}

function collectSkills(node, totals = new Map()) {
  const req = node.action?.levelRequirement;
  if (req && req.skillHrid) {
    const current = totals.get(req.skillHrid) || 0;
    totals.set(req.skillHrid, Math.max(current, req.level || 0));
  }

  node.children.forEach((child) => collectSkills(child, totals));
  return totals;
}

function collectAlternativeRecipeItems(node, out = new Set()) {
  const candidates = state.actionByOutput.get(node.itemHrid) || [];
  if (candidates.length > 1) {
    out.add(node.itemHrid);
  }

  node.children.forEach((child) => collectAlternativeRecipeItems(child, out));
  return out;
}

function collectActionTypes(node, out = new Set()) {
  if (!node.isBaseMaterial && node.action?.type) {
    out.add(node.action.type);
  }
  node.children.forEach((child) => collectActionTypes(child, out));
  return out;
}

function getUserSkillLevels() {
  const levels = new Map();
  const inputs = document.querySelectorAll("input[data-skill-hrid]");

  inputs.forEach((input) => {
    const skillHrid = input.dataset.skillHrid;
    const value = Number(input.value);
    if (!skillHrid || !Number.isFinite(value) || value <= 0) return;
    levels.set(skillHrid, Math.floor(value));
  });

  return levels;
}

function getUserHouseLevels() {
  const levels = new Map();
  const inputs = document.querySelectorAll("input[data-house-hrid]");

  inputs.forEach((input) => {
    const houseHrid = input.dataset.houseHrid;
    const value = Number(input.value);
    if (!houseHrid || !Number.isFinite(value) || value <= 0) return;
    levels.set(houseHrid, Math.floor(value));
  });

  return levels;
}

function renderTree(node, userSkillLevels, userHouseLevels, userGearStats, userDrinkBonuses) {
  elements.tree.innerHTML = "";
  const rootList = document.createElement("ul");
  rootList.appendChild(renderTreeNode(node, userSkillLevels, userHouseLevels, userGearStats, userDrinkBonuses));
  elements.tree.appendChild(rootList);
}

function makeItemIcon(itemHrid) {
  const iconId = itemHrid.replace("/items/", "");
  const frame = document.createElement("span");
  frame.className = "item-icon-frame";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("item-icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${iconId}`);
  svg.appendChild(use);
  frame.appendChild(svg);
  return frame;
}

function renderTreeNode(node, userSkillLevels, userHouseLevels, userGearStats, userDrinkBonuses) {
  const li = document.createElement("li");
  const line = document.createElement("div");
  line.className = node.isBaseMaterial ? "node-line node-line--base" : "node-line";

  const title = `${node.itemName} x${node.quantityRequested}`;
  let meta;
  if (node.isBaseMaterial) {
    meta = "base material";
  } else {
    const skillHrid = node.action.levelRequirement?.skillHrid;
    const skillName = skillHrid
      ? (state.skillMap.get(skillHrid)?.name ?? skillHrid.split("/").pop().replace(/_/g, " "))
      : node.action.hrid.split("/")[2]?.replace(/_/g, " ");
    const capitalised = skillName
      ? skillName.charAt(0).toUpperCase() + skillName.slice(1)
      : "Unknown";
    meta = `via ${capitalised} \u2192 ${node.action.name} x${node.craftsNeeded}`;
    const houseBonus = getHouseActionTimeBonus(node.action, userHouseLevels);
    const gearBonus = getGearActionTimeBonus(node.action, userGearStats);
    const drinkBonus = getDrinkActionTimeBonus(node.action, userDrinkBonuses);
    const perCraftSeconds = ((node.action.baseTimeCost || 0) / 1e9) / (1 + houseBonus + gearBonus + drinkBonus);
    if (perCraftSeconds > 0) {
      meta += ` \u00b7 ${formatDuration(perCraftSeconds)}/craft`;
    }
  }

  line.appendChild(makeItemIcon(node.itemHrid));
  line.appendChild(document.createTextNode(title));

  if (!node.isBaseMaterial && node.action?.levelRequirement) {
    const req = node.action.levelRequirement;
    const skillName = state.skillMap.get(req.skillHrid)?.name
      ?? req.skillHrid.split("/").pop().replace(/_/g, " ");
    const userLevel = userSkillLevels.get(req.skillHrid);
    const hasUserLevel = Number.isFinite(userLevel);
    const meetsReq = hasUserLevel && userLevel >= req.level;

    const badge = document.createElement("span");
    badge.className = "skill-badge";
    if (hasUserLevel) {
      badge.classList.add(meetsReq ? "skill-badge--met" : "skill-badge--missing");
    }
    badge.title = skillName;
    badge.textContent = `${skillName} ${req.level}`;
    if (hasUserLevel) {
      badge.title = `${skillName}: need ${req.level}, have ${userLevel}`;
    }
    line.appendChild(badge);
  }

  const metaSpan = document.createElement("span");
  metaSpan.className = "node-meta";
  metaSpan.textContent = ` - ${meta}`;
  line.appendChild(metaSpan);

  if (node.children.length > 0) {
    const chevron = document.createElement("button");
    chevron.className = "node-toggle";
    chevron.setAttribute("aria-label", "Toggle subtree");
    chevron.textContent = "▼";
    line.appendChild(chevron);

    const childList = document.createElement("ul");
    childList.className = "node-children";
    node.children.forEach((child) => childList.appendChild(renderTreeNode(child, userSkillLevels, userHouseLevels, userGearStats, userDrinkBonuses)));

    chevron.addEventListener("click", (e) => {
      e.stopPropagation();
      const collapsed = childList.classList.toggle("node-children--collapsed");
      chevron.textContent = collapsed ? "▶" : "▼";
      chevron.classList.toggle("node-toggle--collapsed", collapsed);
    });

    li.appendChild(line);
    li.appendChild(childList);
  } else {
    li.appendChild(line);
  }

  return li;
}

function renderSkillsTable(target, skillRows) {
  if (skillRows.length === 0) {
    target.innerHTML = "<p>No data</p>";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");

  ["Skill", "Min Level", "Your Level", "Status"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    trHead.appendChild(th);
  });

  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  skillRows.forEach((row) => {
    const tr = document.createElement("tr");
    if (row.hasLevel) {
      tr.classList.add(row.meets ? "row-skill-met" : "row-skill-missing");
    }

    const tdSkill = document.createElement("td");
    tdSkill.textContent = row.skill;
    tr.appendChild(tdSkill);

    const tdRequired = document.createElement("td");
    tdRequired.textContent = String(row.minLevel);
    tr.appendChild(tdRequired);

    const tdHave = document.createElement("td");
    tdHave.textContent = row.hasLevel ? String(row.userLevel) : "-";
    tr.appendChild(tdHave);

    const tdStatus = document.createElement("td");
    tdStatus.className = "skill-status-cell";
    if (!row.hasLevel) {
      tdStatus.textContent = "-";
      tdStatus.classList.add("skill-status-cell--unknown");
    } else if (row.meets) {
      tdStatus.textContent = "✓";
      tdStatus.classList.add("skill-status-cell--ok");
    } else {
      tdStatus.textContent = "✗";
      tdStatus.classList.add("skill-status-cell--bad");
    }
    tr.appendChild(tdStatus);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  target.innerHTML = "";
  target.appendChild(table);
}

function renderMaterialsTable(target, materialRows) {
  if (materialRows.length === 0) {
    target.innerHTML = "<p>No data</p>";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");

  ["Material", "HRID", "Need", "Have", "Missing"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  materialRows.forEach((row) => {
    const tr = document.createElement("tr");    if (row.missing > 0) tr.classList.add("row-missing");
    // Icon + name cell
    const tdName = document.createElement("td");
    tdName.classList.add("material-name-cell");
    tdName.appendChild(makeItemIcon(row.hrid));
    tdName.appendChild(document.createTextNode(row.name));
    tr.appendChild(tdName);

    [row.hrid, row.need, row.have, row.missing].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  target.innerHTML = "";
  target.appendChild(table);
}

function renderTable(target, headers, rows) {
  if (rows.length === 0) {
    target.innerHTML = "<p>No data</p>";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");

  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    trHead.appendChild(th);
  });

  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  target.innerHTML = "";
  target.appendChild(table);
}

function setExportEnabled(enabled) {
  elements.exportJsonBtn.disabled = !enabled;
  elements.exportCsvBtn.disabled = !enabled;
  elements.copyMaterialsBtn.disabled = !enabled;
}

function copyMaterialsToClipboard() {
  if (!state.lastResult) return;
  const lines = state.lastResult.materialRows
    .map((row) => `${row.need}x ${row.name}`)
    .join("\n");
  navigator.clipboard.writeText(lines).then(() => {
    const btn = elements.copyMaterialsBtn;
    const prev = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = prev; }, 1500);
  });
}

function slugifyForFilename(text) {
  return String(text || "result")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "result";
}

function toExportTree(node) {
  const action = node.action
    ? {
        name: node.action.name,
        hrid: node.action.hrid,
        sortIndex: node.action.sortIndex ?? null,
      }
    : null;

  return {
    itemHrid: node.itemHrid,
    itemName: node.itemName,
    quantityRequested: node.quantityRequested,
    quantityProducedPerCraft: node.quantityProducedPerCraft,
    craftsNeeded: node.craftsNeeded,
    isBaseMaterial: node.isBaseMaterial,
    totalTimeSeconds: node.totalTimeSeconds,
    action,
    children: node.children.map(toExportTree),
  };
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsvFromLastResult(result) {
  const lines = [];
  const stamp = new Date().toISOString();

  lines.push("MWI Crafting Chain Export");
  lines.push(`Generated At,${escapeCsv(stamp)}`);
  lines.push(`Target Item,${escapeCsv(result.target.itemName)}`);
  lines.push(`Target HRID,${escapeCsv(result.target.itemHrid)}`);
  lines.push(`Quantity,${escapeCsv(result.target.quantity)}`);
  lines.push(`Recipe Strategy,${escapeCsv(result.target.strategy)}`);
  lines.push(`Total Time Seconds,${escapeCsv(Math.round(result.stats.totalTimeSeconds))}`);
  lines.push("");

  lines.push("Base Materials");
  lines.push("Material,HRID,Need,Have,Missing");
  result.materialRows.forEach((row) => {
    lines.push([
      row.name,
      row.hrid,
      row.need,
      row.have,
      row.missing,
    ].map(escapeCsv).join(","));
  });
  lines.push("");

  lines.push("Skill Requirements");
  lines.push("Skill,Min Level");
  result.skillRows.forEach((row) => {
    lines.push([row.skill, row.minLevel].map(escapeCsv).join(","));
  });

  return lines.join("\n");
}

function exportJson() {
  if (!state.lastResult) {
    setStatus("Run Calculate Chain before exporting.", true);
    return;
  }

  const result = state.lastResult;
  const payload = {
    generatedAt: new Date().toISOString(),
    target: result.target,
    stats: result.stats,
    materials: result.materialRows,
    skills: result.skillRows,
    craftTree: toExportTree(result.tree),
  };

  const filename = `${slugifyForFilename(result.target.itemName)}-chain.json`;
  downloadTextFile(filename, JSON.stringify(payload, null, 2), "application/json");
  setStatus(`Exported ${filename}`);
}

function exportCsv() {
  if (!state.lastResult) {
    setStatus("Run Calculate Chain before exporting.", true);
    return;
  }

  const result = state.lastResult;
  const filename = `${slugifyForFilename(result.target.itemName)}-chain.csv`;
  const csv = buildCsvFromLastResult(result);
  downloadTextFile(filename, csv, "text/csv");
  setStatus(`Exported ${filename}`);
}

async function loadData() {
  try {
    setStatus("Loading data...");

    let raw;
    const file = elements.dataFile.files && elements.dataFile.files[0];
    if (file) {
      raw = await file.text();
    } else {
      const response = await fetch(elements.dataUrl.value.trim());
      if (!response.ok) throw new Error(`Failed to fetch JSON (${response.status})`);
      raw = await response.text();
    }

    const data = JSON.parse(raw);

    if (!data.itemDetailMap || !data.actionDetailMap || !data.skillDetailMap) {
      throw new Error("JSON file is missing itemDetailMap, skillDetailMap, or actionDetailMap");
    }

    state.itemDetailMap = data.itemDetailMap;
    state.skillDetailMap = data.skillDetailMap;
    state.actionDetailMap = data.actionDetailMap;
    state.houseRoomDetailMap = data.houseRoomDetailMap || {};
    state.itemMap = new Map(Object.entries(data.itemDetailMap));
    state.skillMap = new Map(Object.entries(data.skillDetailMap));
    state.houseRoomMap = new Map(Object.entries(state.houseRoomDetailMap));
    state.actionByOutput = buildActionLookup(data.actionDetailMap);
    state.lastResult = null;
    setExportEnabled(false);
    populateItemAutocomplete(state.itemMap);
    populateGearOptions(state.itemMap);
    populateDrinkOptions(state.itemMap);

    setStatus(
      `Loaded ${Object.keys(state.itemDetailMap).length} items, ${Object.keys(state.skillDetailMap).length} skills, ${Object.keys(state.actionDetailMap).length} actions, and ${Object.keys(state.houseRoomDetailMap).length} house rooms.`,
    );
  } catch (error) {
    setStatus(error.message, true);
  }
}

function calculate() {
  if (!state.itemDetailMap || !state.actionDetailMap) {
    setStatus("Load data before calculating.", true);
    return;
  }

  const name = elements.itemName.value.trim();
  const hrid = elements.itemHrid.value.trim();
  const quantity = Number(elements.quantity.value || "1");
  const strategy = elements.recipeStrategy.value || DEFAULT_RECIPE_STRATEGY;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    setStatus("Quantity must be a positive number.", true);
    return;
  }

  const itemHrid = hrid || findItemByName(state.itemMap, name);
  if (!itemHrid) {
    const suggestions = suggestItems(state.itemMap, name);
    const message =
      suggestions.length > 0
        ? `No match. Try: ${suggestions.map((s) => s.name).join(", ")}`
        : "No matching item found.";
    setStatus(message, true);
    return;
  }

  try {
    setExportEnabled(false);
    const parsedInventory = parseInventoryInput(elements.inventoryJson.value || "");
    if (parsedInventory.error) {
      setStatus(parsedInventory.error, true);
      return;
    }

    const userHouseLevels = getUserHouseLevels();
    const userGearStats = getUserGearStats();
    const userDrinkBonuses = getUserDrinkBonuses();
    const tree = buildCraftTree(itemHrid, quantity, strategy, userHouseLevels, userGearStats, userDrinkBonuses);
    const materials = collectBaseMaterials(tree);
    const skills = collectSkills(tree);
    const totalActions = collectTotalActions(tree);
    const alternativeItems = collectAlternativeRecipeItems(tree);
    const inventory = parsedInventory.inventory;
    const userSkillLevels = getUserSkillLevels();

    renderTree(tree, userSkillLevels, userHouseLevels, userGearStats, userDrinkBonuses);

    const materialRows = Array.from(materials.entries())
      .map(([materialHrid, count]) => {
        const have = inventory.get(materialHrid) || 0;
        const missing = Math.max(0, count - have);
        return {
          name: state.itemMap.get(materialHrid)?.name || materialHrid,
          hrid: materialHrid,
          need: count,
          have,
          missing,
        };
      })
      .sort((a, b) => b.missing - a.missing || b.need - a.need);

    const skillRows = Array.from(skills.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([skillHrid, level]) => {
        const userLevel = userSkillLevels.get(skillHrid);
        const hasLevel = Number.isFinite(userLevel);
        return {
          skillHrid,
          skill: state.skillMap.get(skillHrid)?.name || skillHrid,
          minLevel: level,
          userLevel: hasLevel ? userLevel : null,
          hasLevel,
          meets: hasLevel ? userLevel >= level : false,
        };
      });

    renderMaterialsTable(elements.materials, materialRows);
    renderSkillsTable(elements.skills, skillRows);

    elements.statTime.textContent = formatDuration(tree.totalTimeSeconds);
    elements.statActions.textContent = String(totalActions);
    elements.statBase.textContent = String(materialRows.length);
    elements.statSkills.textContent = String(skillRows.length);

    const bonusLines = collectBonusLines(userHouseLevels, userGearStats, userDrinkBonuses, collectActionTypes(tree));
    elements.statBonuses.innerHTML = "";
    if (bonusLines.length === 0) {
      elements.statBonuses.textContent = "None";
    } else {
      bonusLines.forEach((line) => {
        const span = document.createElement("span");
        span.textContent = line;
        elements.statBonuses.appendChild(span);
      });
    }

    state.lastResult = {
      target: {
        itemHrid,
        itemName: state.itemMap.get(itemHrid)?.name || itemHrid,
        quantity,
        strategy,
      },
      stats: {
        totalTimeSeconds: tree.totalTimeSeconds,
        baseMaterialKinds: materialRows.length,
        skillKinds: skillRows.length,
      },
      tree,
      materialRows,
      skillRows: skillRows.map((row) => ({ skill: row.skill, minLevel: row.minLevel })),
    };
    setExportEnabled(true);

    const missingKinds = materialRows.filter((row) => row.missing > 0).length;
    const missingTotal = materialRows.reduce((sum, row) => sum + row.missing, 0);

    if (alternativeItems.size === 0) {
      setStatus(
        `Calculated chain for ${state.itemMap.get(itemHrid)?.name || itemHrid}. Missing: ${missingKinds} material type(s), ${Math.round(missingTotal)} total units. No alternate recipes in this chain.`,
      );
    } else {
      setStatus(
        `Calculated chain for ${state.itemMap.get(itemHrid)?.name || itemHrid}. Missing: ${missingKinds} material type(s), ${Math.round(missingTotal)} total units. Alternate recipe options exist for ${alternativeItems.size} item(s).`,
      );
    }
  } catch (error) {
    setExportEnabled(false);
    setStatus(error.message, true);
  }
}

function loadExample() {
  elements.itemName.value = "Expert Tea Crate";
  elements.quantity.value = "3";
  elements.itemHrid.value = "";
  // Friendly line format — demonstrates the parser
  elements.inventoryJson.value = [
    "Sugar: 100",
    "Black Tea Leaf: 50",
    "Coin: 500",
  ].join("\n");
}

function initializeUserDataCollapsibles() {
  const STORAGE_PREFIX = "mwi_section_collapsed_";
  const toggles = document.querySelectorAll(".section-toggle-btn[data-collapse-target]");

  toggles.forEach((toggle) => {
    const targetId = toggle.dataset.collapseTarget;
    if (!targetId) return;

    const body = document.getElementById(targetId);
    if (!body) return;

    const storageKey = STORAGE_PREFIX + targetId;

    const setExpanded = (expanded, persist = true) => {
      body.hidden = !expanded;
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.textContent = expanded ? "Collapse" : "Expand";
      if (persist) {
        try { localStorage.setItem(storageKey, expanded ? "1" : "0"); } catch { /* storage unavailable */ }
      }
    };

    // Restore saved state; fall back to default (expanded)
    let savedExpanded = true;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "0") savedExpanded = false;
    } catch { /* storage unavailable */ }

    setExpanded(savedExpanded, false);

    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      setExpanded(!expanded);
    });
  });
}

elements.loadDataBtn.addEventListener("click", loadData);
elements.calculateBtn.addEventListener("click", calculate);
elements.itemName.addEventListener("keydown", (e) => { if (e.key === "Enter") calculate(); });
elements.quantity.addEventListener("keydown", (e) => { if (e.key === "Enter") calculate(); });
elements.exampleBtn.addEventListener("click", loadExample);
elements.exportJsonBtn.addEventListener("click", exportJson);
elements.exportCsvBtn.addEventListener("click", exportCsv);
elements.copyMaterialsBtn.addEventListener("click", copyMaterialsToClipboard);
elements.exportSessionBtn.addEventListener("click", exportSession);
elements.importSessionFile.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      restoreSession(data);
    } catch {
      alert("Invalid session file.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

// ── Session: auto-save on input ──────────────────────────────────────
const SESSION_KEY = "mwi_crafting_session";

function captureSession() {
  const skills = {};
  document.querySelectorAll("input[data-skill-hrid]").forEach((el) => {
    if (el.value) skills[el.dataset.skillHrid] = el.value;
  });
  const houses = {};
  document.querySelectorAll("input[data-house-hrid]").forEach((el) => {
    if (el.value) houses[el.dataset.houseHrid] = el.value;
  });
  const gear = {};
  document.querySelectorAll("input[data-gear-slot]").forEach((el) => {
    if (el.value) gear[el.dataset.gearSlot] = el.value;
  });
  const drinks = {};
  document.querySelectorAll("input[data-drink-slot]").forEach((el) => {
    if (el.value) drinks[el.dataset.drinkSlot] = el.value;
  });
  return {
    version: 1,
    itemName: elements.itemName.value,
    itemHrid: elements.itemHrid.value,
    quantity: elements.quantity.value,
    recipeStrategy: elements.recipeStrategy.value,
    inventory: elements.inventoryJson.value,
    skills,
    houses,
    gear,
    drinks,
  };
}

function restoreSession(data) {
  if (!data || typeof data !== "object") return;
  if (data.itemName !== undefined) elements.itemName.value = data.itemName;
  if (data.itemHrid !== undefined) elements.itemHrid.value = data.itemHrid;
  if (data.quantity !== undefined) elements.quantity.value = data.quantity;
  if (data.recipeStrategy !== undefined) elements.recipeStrategy.value = data.recipeStrategy;
  if (data.inventory !== undefined) {
    elements.inventoryJson.value = data.inventory;
    elements.inventoryJson.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (data.skills && typeof data.skills === "object") {
    document.querySelectorAll("input[data-skill-hrid]").forEach((el) => {
      const v = data.skills[el.dataset.skillHrid];
      if (v !== undefined) el.value = v;
    });
  }
  if (data.houses && typeof data.houses === "object") {
    document.querySelectorAll("input[data-house-hrid]").forEach((el) => {
      const v = data.houses[el.dataset.houseHrid];
      if (v !== undefined) el.value = v;
    });
  }
  if (data.gear && typeof data.gear === "object") {
    document.querySelectorAll("input[data-gear-slot]").forEach((el) => {
      const v = data.gear[el.dataset.gearSlot];
      if (v !== undefined) el.value = v;
    });
  }
  if (data.drinks && typeof data.drinks === "object") {
    document.querySelectorAll("input[data-drink-slot]").forEach((el) => {
      const v = data.drinks[el.dataset.drinkSlot];
      if (v !== undefined) el.value = v;
    });
  }
}

function saveSession() {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(captureSession())); } catch { /* quota exceeded */ }
}

function exportSession() {
  const data = captureSession();
  const name = data.itemName || data.itemHrid || "session";
  const slug = name.replace(/[^\w-]/g, "_").toLowerCase();
  downloadTextFile(`mwi-session-${slug}.json`, JSON.stringify(data, null, 2), "application/json");
}

// Auto-save on any player-data input change (debounced)
let _saveTimer = null;
function debouncedSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveSession, 400);
}
[
  elements.itemName, elements.itemHrid, elements.quantity,
  elements.recipeStrategy, elements.inventoryJson,
].forEach((el) => el.addEventListener("input", debouncedSave));
document.querySelectorAll("input[data-skill-hrid], input[data-house-hrid], input[data-gear-slot], input[data-drink-slot]")
  .forEach((el) => el.addEventListener("input", debouncedSave));

// Restore saved session on load
try {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) restoreSession(JSON.parse(raw));
} catch { /* ignore */ }

initializeUserDataCollapsibles();
setExportEnabled(false);

loadData();
