const DEFAULT_DATA_URL =
  "https://raw.githubusercontent.com/switchlove/MWI-Data/main/init_client_data.json";

const state = {
  itemDetailMap: null,
  actionDetailMap: null,
  actionByOutput: new Map(),
  itemMap: new Map(),
};

const elements = {
  dataUrl: document.getElementById("dataUrl"),
  dataFile: document.getElementById("dataFile"),
  loadDataBtn: document.getElementById("loadDataBtn"),
  dataStatus: document.getElementById("dataStatus"),
  itemName: document.getElementById("itemName"),
  itemHrid: document.getElementById("itemHrid"),
  quantity: document.getElementById("quantity"),
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

function chooseRecipeForOutput(candidates) {
  return candidates[0];
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

function buildCraftTree(itemHrid, quantity, path = new Set()) {
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

  const action = chooseRecipeForOutput(candidates);
  const outputCount = (action.outputItems || []).find((o) => o.itemHrid === itemHrid)?.count || 1;
  const craftsNeeded = Math.ceil(quantity / outputCount);

  const nextPath = new Set(path);
  nextPath.add(itemHrid);

  const children = [];

  if (action.upgradeItemHrid) {
    children.push(buildCraftTree(action.upgradeItemHrid, craftsNeeded, nextPath));
  }

  (action.inputItems || []).forEach((input) => {
    children.push(buildCraftTree(input.itemHrid, input.count * craftsNeeded, nextPath));
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
    totals.set(req.skillHrid, Math.max(totals.get(req.skillHrid) || 0, req.level || 0));
  }

  node.children.forEach((child) => collectSkills(child, totals));
  return totals;
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

    if (!data.itemDetailMap || !data.actionDetailMap) {
      throw new Error("JSON file is missing itemDetailMap or actionDetailMap");
    }

    state.itemDetailMap = data.itemDetailMap;
    state.actionDetailMap = data.actionDetailMap;
    state.itemMap = new Map(Object.entries(data.itemDetailMap));
    state.actionByOutput = buildActionLookup(data.actionDetailMap);

    setStatus(
      `Loaded ${Object.keys(state.itemDetailMap).length} items and ${Object.keys(state.actionDetailMap).length} actions.`,
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
    const tree = buildCraftTree(itemHrid, quantity);
    const materials = collectBaseMaterials(tree);
    const skills = collectSkills(tree);

    renderTree(tree);

    const materialRows = Array.from(materials.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([materialHrid, count]) => [state.itemMap.get(materialHrid)?.name || materialHrid, materialHrid, count]);

    const skillRows = Array.from(skills.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([skillHrid, level]) => [skillHrid, level]);

    renderTable(elements.materials, ["Material", "HRID", "Count"], materialRows);
    renderTable(elements.skills, ["Skill", "Min Level"], skillRows);

    elements.statTime.textContent = formatDuration(tree.totalTimeSeconds);
    elements.statBase.textContent = String(materialRows.length);
    elements.statSkills.textContent = String(skillRows.length);

    setStatus(`Calculated chain for ${state.itemMap.get(itemHrid)?.name || itemHrid}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function loadExample() {
  elements.itemName.value = "Basic Food Crate";
  elements.quantity.value = "2";
  elements.itemHrid.value = "";
}

elements.loadDataBtn.addEventListener("click", loadData);
elements.calculateBtn.addEventListener("click", calculate);
elements.exampleBtn.addEventListener("click", loadExample);

loadData();
