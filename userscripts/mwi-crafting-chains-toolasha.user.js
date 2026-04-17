// ==UserScript==
// @name         MWI Crafting Chains – Toolasha Inventory Bridge
// @namespace    https://switchlove.github.io/
// @version      1.3.0
// @description  Syncs your MWI inventory via Toolasha on the game page, then auto-loads it in Crafting Chains.
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
  const HINTS_CLASS = 'inventory-hints';
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

  // ── Toolasha inventory extraction on MWI page ─────────────────────

  function extractInventoryFromToolashaRuntime() {
    const pageWindow = getPageWindow();
    const inventoryList = pageWindow.Toolasha?.Core?.dataManager?.getInventory?.();
    if (!Array.isArray(inventoryList) || inventoryList.length === 0) return null;

    const inv = {};
    for (const item of inventoryList) {
      if (item.itemLocationHrid !== INVENTORY_LOCATION) continue;
      const n = Number(item.count);
      if (Number.isFinite(n) && n > 0 && item.itemHrid) {
        inv[item.itemHrid] = n;
      }
    }

    if (Object.keys(inv).length === 0) return null;

    const characterName =
      pageWindow.Toolasha?.Core?.dataManager?.getCurrentCharacterName?.() ||
      null;

    return {
      characterName,
      inventory: inv,
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

  function injectButton(hintsRow, label, onClick) {
    const btn = document.createElement('button');
    btn.id = 'toolashaInventoryBtn';
    btn.className = 'btn btn-link-sm toolasha-btn';
    btn.textContent = label;
    btn.style.cssText = 'color:#22a06b;font-weight:700;';
    btn.addEventListener('click', onClick);
    hintsRow.appendChild(btn);
    return btn;
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
    // Wait for the inventory hints row to exist in the DOM
    let hintsRow;
    try {
      hintsRow = await waitForElement(`.${HINTS_CLASS}`);
    } catch {
      return; // Page structure not as expected — bail silently
    }

    let note = document.createElement('span');
    note.style.cssText = 'font-size:0.78rem;color:#9aa;';
    note.textContent = 'Waiting for Toolasha bridge data...';
    hintsRow.appendChild(note);

    let attempts = 0;
    let buttonMounted = false;

    const tryAttach = () => {
      attempts += 1;
      const data = readBridgeData();
      if (!data || !data.inventory || Object.keys(data.inventory).length === 0) {
        const status = readBridgeStatus();
        if (attempts >= PLANNER_MAX_ATTEMPTS) {
          const reason = status?.state || 'unknown';
          note.textContent = `Toolasha bridge data not found (reason: ${reason}). Open MWI with Toolasha active, wait a few seconds, then refresh.`;
          return;
        }

        if (attempts % 10 === 0) {
          const reason = status?.state || 'pending';
          note.textContent = `Still waiting for Toolasha bridge data from MWI... (${reason})`;
        }
        setTimeout(tryAttach, PLANNER_RETRY_MS);
        return;
      }

      const inv = data.inventory;
      const syncedAgo = formatAge(Date.now() - Number(data.syncedAt || 0));
      const name = data.characterName;
      const itemCount = Object.keys(inv).length;
      const label = name
        ? `⬆ Load from Toolasha (${name}, ${itemCount} items, ${syncedAgo})`
        : `⬆ Load from Toolasha (${itemCount} items, ${syncedAgo})`;

      if (!buttonMounted) {
        const btn = injectButton(hintsRow, label, () => {
          fillTextarea(inv);
          btn.textContent = '✓ Loaded!';
          btn.style.color = '#1a8c55';
          setTimeout(() => {
            btn.textContent = label;
            btn.style.color = '#22a06b';
          }, 2500);
        });

        window.__toolashaLoadInventory = () => fillTextarea(inv);
        buttonMounted = true;
      }

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
