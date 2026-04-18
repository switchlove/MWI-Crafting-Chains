// ==UserScript==
// @name         MWI Crafting Chains – Toolasha Inventory Bridge
// @namespace    https://switchlove.github.io/
// @version      1.6.5
// @description  Syncs your MWI inventory, skills, equipment, and houses via Toolasha on the game page, then auto-loads it in Crafting Chains.
// @author       switchlove
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/switchlove/MWI-Crafting-Chains/main/userscripts/mwi-crafting-chains-toolasha.user.js
// @updateURL    https://raw.githubusercontent.com/switchlove/MWI-Crafting-Chains/main/userscripts/mwi-crafting-chains-toolasha.user.js
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://switchlove.github.io/MWI-Crafting-Chains/*
// @match        http://localhost:*/*
// @match        file:///*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const BRIDGE_KEY = 'mwi_crafting_toolasha_bridge_inventory';
  const BRIDGE_STATUS_KEY = 'mwi_crafting_toolasha_bridge_status';
  const INVENTORY_LOCATION = '/item_locations/inventory';
  const TEXTAREA_ID = 'inventoryJson';
  const HEADER_LINK_CLASS = 'inventory-userscript-link';
  const INSTALLED_ATTR = 'data-toolasha-bridge-installed';
  const SYNC_RETRY_MS = 2000;
  const SYNC_MAX_ATTEMPTS = 60;
  const PLANNER_RETRY_MS = 2500;
  const PLANNER_MAX_ATTEMPTS = 180;

  function isMwiPage() {
    const host = window.location.hostname;
    return host === 'www.milkywayidle.com' || host === 'test.milkywayidle.com';
  }

  function isPlannerPage() {
    return !!document.getElementById(TEXTAREA_ID);
  }

  // ── Bridge storage helpers ────────────────────────────────────────

  function writeBridgeData(payload) {
    GM_setValue(BRIDGE_KEY, JSON.stringify(payload));
  }

  function writeBridgeStatus(status) {
    GM_setValue(BRIDGE_STATUS_KEY, JSON.stringify({
      ...status,
      updatedAt: Date.now(),
    }));
  }

  function readBridgeData() {
    const raw = GM_getValue(BRIDGE_KEY, null);
    if (!raw) return null;

    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

  function readBridgeStatus() {
    const raw = GM_getValue(BRIDGE_STATUS_KEY, null);
    if (!raw) return null;
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

  function getPageWindow() {
    return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  }

  function toHridMap(raw, keyCandidates, valueCandidates) {
    const out = {};
    if (!raw) return out;

    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;

        const key = keyCandidates
          .map((k) => entry[k])
          .find((v) => typeof v === 'string' && v.length > 0);
        const value = valueCandidates
          .map((k) => entry[k])
          .find((v) => Number.isFinite(Number(v)));

        if (!key || !Number.isFinite(Number(value))) continue;
        out[key] = Number(value);
      }
      return out;
    }

    if (typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw)) {
        if (!key || !Number.isFinite(Number(value))) continue;
        out[key] = Number(value);
      }
    }

    return out;
  }

  function toStringMap(raw, keyCandidates, valueCandidates) {
    const out = {};
    if (!raw) return out;

    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;

        const key = keyCandidates
          .map((k) => entry[k])
          .find((v) => typeof v === 'string' && v.length > 0);
        const value = valueCandidates
          .map((k) => entry[k])
          .find((v) => typeof v === 'string' && v.length > 0);

        if (!key || !value) continue;
        out[key] = value;
      }
      return out;
    }

    if (typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw)) {
        if (!key || typeof value !== 'string' || value.length === 0) continue;
        out[key] = value;
      }
    }

    return out;
  }

  function extractCharacterSkills(pageWindow) {
    const dm = pageWindow.Toolasha?.Core?.dataManager;

    // Handle if characterSkills is a Map<hrid, {skillHrid, level}>
    const skillsMap = dm?.characterSkills;
    if (skillsMap instanceof Map && skillsMap.size > 0) {
      const out = {};
      for (const [, entry] of skillsMap) {
        const hrid = entry?.skillHrid || entry?.hrid;
        const level = Number(entry?.level ?? entry?.currentLevel);
        if (typeof hrid === 'string' && hrid.length > 0 && Number.isFinite(level)) {
          out[hrid] = level;
        }
      }
      if (Object.keys(out).length > 0) return out;
    }

    const candidates = [
      dm?.getCharacterSkills?.(),
      dm?.getSkills?.(),
      dm?.characterSkills,
      dm?.state?.characterSkills,
      dm?.characterData?.characterSkills,
    ];

    for (const candidate of candidates) {
      const parsed = toHridMap(candidate, ['skillHrid', 'hrid', 'id'], ['level', 'currentLevel', 'value']);
      if (Object.keys(parsed).length > 0) return parsed;
    }

    return {};
  }
  function extractCharacterHouses(pageWindow) {
    const dm = pageWindow.Toolasha?.Core?.dataManager;

    // characterHouseRooms is a Map<hrid, {houseRoomHrid, level}>
    const roomsMap = dm?.characterHouseRooms;
    if (roomsMap instanceof Map && roomsMap.size > 0) {
      const out = {};
      for (const [, entry] of roomsMap) {
        const hrid = entry?.houseRoomHrid;
        const level = Number(entry?.level);
        if (typeof hrid === 'string' && hrid.length > 0 && Number.isFinite(level)) {
          // Normalise /house_rooms/X → /houses/X to match our input attributes
          const normHrid = hrid.replace('/house_rooms/', '/houses/');
          out[normHrid] = level;
        }
      }
      if (Object.keys(out).length > 0) return out;
    }

    const candidates = [
      dm?.getCharacterHouseRooms?.(),
      dm?.getCharacterHouseInfos?.(),
      dm?.getCharacterHouses?.(),
      dm?.getHouses?.(),
      dm?.characterData?.characterHouseRooms,
      dm?.characterHouseInfos,
      dm?.state?.characterHouseInfos,
      dm?.characterData?.characterHouseInfos,
      dm?.characterHouses,
      dm?.state?.characterHouses,
      dm?.characterData?.characterHouses,
    ];

    for (const candidate of candidates) {
      const parsed = toHridMap(candidate, ['houseRoomHrid', 'houseHrid', 'hrid', 'id'], ['level', 'currentLevel', 'value']);
      if (Object.keys(parsed).length > 0) return parsed;
    }

    return {};
  }
  function extractEquipmentFromCharacterItems(items) {
    const equipment = {};
    if (!Array.isArray(items)) return equipment;

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const itemHrid = item.itemHrid;
      const location = item.itemLocationHrid;
      if (!itemHrid || !location || location === INVENTORY_LOCATION) continue;
      if (!location.startsWith('/item_locations/')) continue;

      equipment[location] = itemHrid;
    }

    return equipment;
  }

  function extractCharacterEquipment(pageWindow) {
    const dm = pageWindow.Toolasha?.Core?.dataManager;

    // Handle if characterEquipment is a Map<slot, {itemLocationHrid/slotHrid, itemHrid}>
    const equipMap = dm?.characterEquipment;
    if (equipMap instanceof Map && equipMap.size > 0) {
      const out = {};
      for (const [, entry] of equipMap) {
        if (!entry || typeof entry !== 'object') continue;
        const slot = entry?.equipmentTypeHrid || entry?.itemLocationHrid || entry?.slotHrid;
        const itemHrid = entry?.itemHrid;
        if (typeof slot === 'string' && slot.length > 0 && typeof itemHrid === 'string' && itemHrid.length > 0) {
          out[slot] = itemHrid;
        }
      }
      if (Object.keys(out).length > 0) return out;
    }

    const candidates = [
      dm?.getCharacterEquipment?.(),
      dm?.getEquipment?.(),
      dm?.characterEquipment,
      dm?.state?.characterEquipment,
      dm?.characterData?.characterEquipment,
    ];

    for (const candidate of candidates) {
      const parsed = toStringMap(candidate, ['equipmentTypeHrid', 'itemLocationHrid', 'slotHrid', 'slot'], ['itemHrid']);
      if (Object.keys(parsed).length > 0) return parsed;
    }

    const characterItems = dm?.getCharacterItems?.() || dm?.characterItems || dm?.state?.characterItems;
    return extractEquipmentFromCharacterItems(characterItems);
  }

  // ── Toolasha inventory extraction on MWI page ─────────────────────

  function extractInventoryFromToolashaRuntime() {
    const pageWindow = getPageWindow();
    const dataManager = pageWindow.Toolasha?.Core?.dataManager;
    if (!dataManager) return null;

    const inventoryList = dataManager.getInventory?.();

    const inv = {};
    if (Array.isArray(inventoryList)) {
      for (const item of inventoryList) {
        if (item.itemLocationHrid !== INVENTORY_LOCATION) continue;
        const n = Number(item.count);
        if (Number.isFinite(n) && n > 0 && item.itemHrid) {
          inv[item.itemHrid] = n;
        }
      }
    }

    const characterName =
      dataManager.getCurrentCharacterName?.() ||
      null;

    const characterSkills = extractCharacterSkills(pageWindow);
    const characterEquipment = extractCharacterEquipment(pageWindow);
    const characterHouses = extractCharacterHouses(pageWindow);

    if (
      Object.keys(inv).length === 0 &&
      Object.keys(characterSkills).length === 0 &&
      Object.keys(characterEquipment).length === 0 &&
      Object.keys(characterHouses).length === 0
    ) {
      return null;
    }

    return {
      characterName,
      inventory: inv,
      characterSkills,
      characterEquipment,
      characterHouses,
      syncedAt: Date.now(),
      source: 'toolasha-runtime',
    };
  }

  function startMwiSyncLoop() {
    let attempts = 0;

    const tick = () => {
      attempts += 1;
      const pageWindow = getPageWindow();
      const toolashaPresent = !!pageWindow.Toolasha;

      const payload = extractInventoryFromToolashaRuntime();
      if (payload) {
        writeBridgeData(payload);
        writeBridgeStatus({
          state: 'synced',
          attempts,
          itemCount: Object.keys(payload.inventory || {}).length,
          skillCount: Object.keys(payload.characterSkills || {}).length,
          equipmentCount: Object.keys(payload.characterEquipment || {}).length,
          houseCount: Object.keys(payload.characterHouses || {}).length,
          characterName: payload.characterName || null,
        });
        // Keep refreshing occasionally so counts stay current while playing.
        setTimeout(tick, 15000);
        return;
      }

      writeBridgeStatus({
        state: toolashaPresent ? 'toolasha-found-no-inventory-yet' : 'toolasha-not-found-yet',
        attempts,
      });

      if (attempts < SYNC_MAX_ATTEMPTS) {
        setTimeout(tick, SYNC_RETRY_MS);
      } else {
        writeBridgeStatus({
          state: toolashaPresent ? 'sync-timeout-no-inventory' : 'sync-timeout-no-toolasha',
          attempts,
        });
      }
    };

    tick();
  }

  // ── DOM helpers ───────────────────────────────────────────────────

  function waitForElement(selector, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) { resolve(el); return; }

      const obs = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { obs.disconnect(); resolve(found); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error(`Timeout waiting for ${selector}`)); }, timeout);
    });
  }

  function getPlannerAction() {
    const existing = document.querySelector(`.${HEADER_LINK_CLASS}`);
    if (existing) {
      existing.id = 'toolashaInventoryBtn';
      return existing;
    }

    return null;
  }

  function ensureActionStack(link) {
    if (!link || !link.parentElement) return null;

    if (link.parentElement.classList.contains('toolasha-action-stack')) {
      return link.parentElement;
    }

    const stack = document.createElement('div');
    stack.className = 'toolasha-action-stack';
    link.parentElement.insertBefore(stack, link);
    stack.appendChild(link);
    return stack;
  }

  function setPendingAction(link, label) {
    if (!link) return;
    link.classList.add('toolasha-ready', 'toolasha-pending');
    link.removeAttribute('href');
    link.removeAttribute('target');
    link.removeAttribute('rel');
    link.setAttribute('role', 'button');
    link.setAttribute('aria-disabled', 'true');
    link.title = 'Toolasha Bridge detected. Waiting for inventory data from the game page.';
    link.textContent = label;
    link.onclick = (event) => event.preventDefault();
  }

  function setActiveAction(link, label, onClick) {
    if (!link) return;
    link.classList.add('toolasha-ready');
    link.classList.remove('toolasha-pending');
    link.removeAttribute('href');
    link.removeAttribute('target');
    link.removeAttribute('rel');
    link.setAttribute('role', 'button');
    link.setAttribute('aria-disabled', 'false');
    link.title = 'Load synced Toolasha inventory, skills, and equipment into the planner.';
    link.textContent = label;
    link.onclick = (event) => {
      event.preventDefault();
      onClick();
    };
  }

  function fillTextarea(inv) {
    const textarea = document.getElementById(TEXTAREA_ID);
    if (!textarea) return;

    // Build friendly "Item Name: qty" lines if item names not yet loaded,
    // otherwise write HRID JSON which the multi-format parser also handles.
    textarea.value = JSON.stringify(inv, null, 2);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillSkillInputs(characterSkills) {
    const skillInputs = document.querySelectorAll('input[data-skill-hrid]');
    if (!skillInputs.length || !characterSkills || typeof characterSkills !== 'object') return;

    for (const input of skillInputs) {
      const skillHrid = input.dataset.skillHrid;
      if (!skillHrid) continue;

      const direct = characterSkills[skillHrid];
      let value = Number(direct);

      if (!Number.isFinite(value)) {
        const fallbackKey = Object.keys(characterSkills).find(
          (k) => typeof k === 'string' && (k === skillHrid || k.endsWith(skillHrid.split('/').pop())),
        );
        value = Number(fallbackKey ? characterSkills[fallbackKey] : NaN);
      }

      if (!Number.isFinite(value)) continue;
      input.value = String(Math.max(1, Math.floor(value)));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function mapEquipmentKeyToSlot(key) {
    if (typeof key !== 'string' || !key) return null;

    const equipmentTypeMap = {
      head: 'head',
      neck: 'necklace',
      trinket: 'necklace',
      earrings: 'earrings',
      body: 'body',
      legs: 'legs',
      feet: 'feet',
      hands: 'hands',
      ring: 'ring',
      main_hand: 'main-hand',
      two_hand: 'main-hand',
      off_hand: 'off-hand',
      pouch: 'pouch',
      back: 'back',
      charm: 'charm',
      milking_tool: 'brush',
      foraging_tool: 'shears',
      woodcutting_tool: 'hatchet',
      cheesesmithing_tool: 'hammer',
      crafting_tool: 'chisel',
      cooking_tool: 'spatula',
      brewing_tool: 'pot',
      alchemy_tool: 'alembic',
      enhancing_tool: 'enhancer',
      tailoring_tool: 'main-hand',
    };

    let suffix = key;
    if (key.includes('/equipment_types/')) {
      suffix = key.split('/equipment_types/')[1] || key;
    } else if (key.includes('/item_locations/')) {
      suffix = key.split('/item_locations/')[1] || key;
    }

    suffix = suffix
      .toLowerCase()
      .replace(/^equipment_/, '')
      .replace(/^slot_/, '');

    return equipmentTypeMap[suffix] || null;
  }

  function fillGearInputs(characterEquipment) {
    if (!characterEquipment || typeof characterEquipment !== 'object') return;

    const inputsBySlot = {};
    document.querySelectorAll('input[data-gear-slot]').forEach((input) => {
      const slot = input.dataset.gearSlot;
      if (slot) inputsBySlot[slot] = input;
    });

    for (const [key, itemHrid] of Object.entries(characterEquipment)) {
      if (typeof itemHrid !== 'string' || !itemHrid) continue;
      const slot = mapEquipmentKeyToSlot(key);
      if (!slot) continue;

      const input = inputsBySlot[slot];
      if (!input) continue;

      const listId = input.getAttribute('list');
      let displayValue = itemHrid;
      if (listId) {
        const datalist = document.getElementById(listId);
        const options = datalist ? Array.from(datalist.querySelectorAll('option')) : [];
        const matched = options.find((option) => {
          const label = option.getAttribute('label') || '';
          const value = option.getAttribute('value') || '';
          return label === itemHrid || value === itemHrid;
        });
        if (matched) {
          displayValue = matched.getAttribute('value') || itemHrid;
        }
      }

      input.value = displayValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function fillHouseInputs(characterHouses) {
    const houseInputs = document.querySelectorAll('input[data-house-hrid]');
    if (!houseInputs.length || !characterHouses || typeof characterHouses !== 'object') return;

    for (const input of houseInputs) {
      const houseHrid = input.dataset.houseHrid;
      if (!houseHrid) continue;

      const direct = characterHouses[houseHrid];
      let value = Number(direct);

      if (!Number.isFinite(value)) {
        const fallbackKey = Object.keys(characterHouses).find(
          (k) => typeof k === 'string' && (k === houseHrid || k.endsWith(houseHrid.split('/').pop())),
        );
        value = Number(fallbackKey ? characterHouses[fallbackKey] : NaN);
      }

      if (!Number.isFinite(value)) continue;
      input.value = String(Math.max(1, Math.floor(value)));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function fillPlannerData(data) {
    const inventory = data?.inventory || {};
    const characterSkills = data?.characterSkills || {};
    const characterEquipment = data?.characterEquipment || {};
    const characterHouses = data?.characterHouses || {};

    fillTextarea(inventory);
    fillSkillInputs(characterSkills);
    fillGearInputs(characterEquipment);
    fillHouseInputs(characterHouses);
  }

  function formatAge(ms) {
    if (!Number.isFinite(ms)) return 'unknown';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  // ── Main ──────────────────────────────────────────────────────────

  async function initPlannerUi() {
    document.documentElement.setAttribute(INSTALLED_ATTR, 'true');

    // Wait for the Player Data action link to exist in the DOM
    let actionLink;
    try {
      actionLink = await waitForElement(`.${HEADER_LINK_CLASS}`);
    } catch {
      return; // Page structure not as expected — bail silently
    }

    actionLink = getPlannerAction() || actionLink;
    const actionStack = ensureActionStack(actionLink);
    setPendingAction(actionLink, 'Waiting for Toolasha bridge...');

    let note = document.createElement('span');
    note.className = 'toolasha-note toolasha-note--header';
    note.textContent = 'Waiting for Toolasha bridge data...';
    if (actionStack) {
      actionStack.appendChild(note);
    }

    let attempts = 0;

    const tryAttach = () => {
      attempts += 1;
      const data = readBridgeData();
      const invCount = Object.keys(data?.inventory || {}).length;
      const bridgeSkillCount = Object.keys(data?.characterSkills || {}).length;
      const bridgeEquipCount = Object.keys(data?.characterEquipment || {}).length;
      const bridgeHouseCount = Object.keys(data?.characterHouses || {}).length;
      if (!data || (invCount === 0 && bridgeSkillCount === 0 && bridgeEquipCount === 0 && bridgeHouseCount === 0)) {
        const status = readBridgeStatus();
        if (attempts >= PLANNER_MAX_ATTEMPTS) {
          const reason = status?.state || 'unknown';
          setPendingAction(actionLink, 'Toolasha bridge not ready');
          note.textContent = `Toolasha bridge data not found (reason: ${reason}). Open MWI with Toolasha active, wait a few seconds, then refresh.`;
          return;
        }

        if (attempts % 10 === 0) {
          const reason = status?.state || 'pending';
          setPendingAction(actionLink, 'Waiting for Toolasha bridge...');
          note.textContent = `Still waiting for Toolasha bridge data from MWI... (${reason})`;
        }
        setTimeout(tryAttach, PLANNER_RETRY_MS);
        return;
      }

      const syncedAgo = formatAge(Date.now() - Number(data.syncedAt || 0));
      const name = data.characterName;
      const itemCount = Object.keys(data.inventory || {}).length;
      const skillCount = Object.keys(data.characterSkills || {}).length;
      const equipmentCount = Object.keys(data.characterEquipment || {}).length;
      const houseCount = Object.keys(data.characterHouses || {}).length;
      const label = name
        ? `⬆ Load from Toolasha (${name}, ${itemCount} items, ${skillCount} skills, ${equipmentCount} gear, ${houseCount} houses, ${syncedAgo})`
        : `⬆ Load from Toolasha (${itemCount} items, ${skillCount} skills, ${equipmentCount} gear, ${houseCount} houses, ${syncedAgo})`;

      setActiveAction(actionLink, label, () => {
          fillPlannerData(data);
          actionLink.textContent = '✓ Loaded!';
          setTimeout(() => {
            setActiveAction(actionLink, label, () => fillPlannerData(data));
          }, 2500);
        });

      window.__toolashaLoadInventory = () => fillPlannerData(data);

      note.textContent = `Bridge synced ${syncedAgo}.`;
    };

    tryAttach();
  }

  function init() {
    if (isMwiPage()) {
      startMwiSyncLoop();
    }

    if (isPlannerPage()) {
      initPlannerUi();
    }
  }

  init();
})();
