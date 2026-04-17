const DEFAULT_DATA_URL =
  "https://raw.githubusercontent.com/switchlove/MWI-Data/main/init_client_data.json";
const DEFAULT_RECIPE_STRATEGY = "sort-index";

const state = {
  itemDetailMap: null,
  skillDetailMap: null,
  actionDetailMap: null,
  actionByOutput: new Map(),
  itemMap: new Map(),
  skillMap: new Map(),
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
  inventoryJson: document.getElementById("inventoryJson"),
  calculateBtn: document.getElementById("calculateBtn"),
  exampleBtn: document.getElementById("exampleBtn"),
  tree: document.getElementById("tree"),
  materials: document.getElementById("materials"),
  skills: document.getElementById("skills"),
  statTime: document.getElementById("statTime"),
  statBase: document.getElementById("statBase"),
  statSkills: document.getElementById("statSkills"),
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

function buildCraftTree(itemHrid, quantity, strategy, path = new Set()) {
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
    children.push(buildCraftTree(action.upgradeItemHrid, craftsNeeded, strategy, nextPath));
  }

  (action.inputItems || []).forEach((input) => {
    children.push(buildCraftTree(input.itemHrid, input.count * craftsNeeded, strategy, nextPath));
  });

  const ownTime = ((action.baseTimeCost || 0) / 1000000000) * craftsNeeded;
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

function renderTree(node) {
  elements.tree.innerHTML = "";
  const rootList = document.createElement("ul");
  rootList.appendChild(renderTreeNode(node));
  elements.tree.appendChild(rootList);
}

function renderTreeNode(node) {
  const li = document.createElement("li");
  const line = document.createElement("div");
  line.className = "node-line";

  const title = `${node.itemName} x${node.quantityRequested}`;
  const meta = node.isBaseMaterial
    ? "base material"
    : `via ${node.action.name} (${node.action.hrid}) x${node.craftsNeeded}`;

  line.textContent = title;
  const metaSpan = document.createElement("span");
  metaSpan.className = "node-meta";
  metaSpan.textContent = ` - ${meta}`;
  line.appendChild(metaSpan);

  li.appendChild(line);

  if (node.children.length > 0) {
    const childList = document.createElement("ul");
    node.children.forEach((child) => childList.appendChild(renderTreeNode(child)));
    li.appendChild(childList);
  }

  return li;
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
    state.itemMap = new Map(Object.entries(data.itemDetailMap));
    state.skillMap = new Map(Object.entries(data.skillDetailMap));
    state.actionByOutput = buildActionLookup(data.actionDetailMap);
    populateItemAutocomplete(state.itemMap);

    setStatus(
      `Loaded ${Object.keys(state.itemDetailMap).length} items, ${Object.keys(state.skillDetailMap).length} skills, and ${Object.keys(state.actionDetailMap).length} actions.`,
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
  const strategy = DEFAULT_RECIPE_STRATEGY;

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
    const parsedInventory = parseInventoryInput(elements.inventoryJson.value || "");
    if (parsedInventory.error) {
      setStatus(parsedInventory.error, true);
      return;
    }

    const tree = buildCraftTree(itemHrid, quantity, strategy);
    const materials = collectBaseMaterials(tree);
    const skills = collectSkills(tree);
    const alternativeItems = collectAlternativeRecipeItems(tree);
    const inventory = parsedInventory.inventory;

    renderTree(tree);

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
      .map(([skillHrid, level]) => [state.skillMap.get(skillHrid)?.name || skillHrid, level]);

    renderTable(
      elements.materials,
      ["Material", "HRID", "Need", "Have", "Missing"],
      materialRows.map((row) => [row.name, row.hrid, row.need, row.have, row.missing]),
    );
    renderTable(elements.skills, ["Skill", "Min Level"], skillRows);

    elements.statTime.textContent = formatDuration(tree.totalTimeSeconds);
    elements.statBase.textContent = String(materialRows.length);
    elements.statSkills.textContent = String(skillRows.length);

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

elements.loadDataBtn.addEventListener("click", loadData);
elements.calculateBtn.addEventListener("click", calculate);
elements.exampleBtn.addEventListener("click", loadExample);

loadData();
