// ==UserScript==
// @name         MWI Crafting Chains – Toolasha Inventory Bridge
// @namespace    https://switchlove.github.io/
// @version      1.0.0
// @description  Auto-loads your MWI inventory from Toolasha GM storage into the Crafting Chains planner.
// @author       switchlove
// @license      MIT
// @match        https://switchlove.github.io/MWI-Crafting-Chains/*
// @match        http://localhost:*/*
// @match        file:///*
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const TOOLASHA_KEY = 'toolasha_init_character_data';
  const INVENTORY_LOCATION = '/item_locations/inventory';
  const TEXTAREA_ID = 'inventoryJson';
  const HINTS_CLASS = 'inventory-hints';

  // ── Read Toolasha GM storage ──────────────────────────────────────

  function readToolashaData() {
    const raw = GM_getValue(TOOLASHA_KEY, null);
    if (!raw) return null;

    let parsed;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }

    if (!parsed || parsed.type !== 'init_character_data') return null;
    return parsed;
  }

  function extractInventory(data) {
    if (!Array.isArray(data.characterItems)) return null;
    const inv = {};
    for (const item of data.characterItems) {
      if (item.itemLocationHrid !== INVENTORY_LOCATION) continue;
      const n = Number(item.count);
      if (Number.isFinite(n) && n > 0) {
        inv[item.itemHrid] = n;
      }
    }
    return Object.keys(inv).length ? inv : null;
  }

  function getCharacterName(data) {
    return data?.character?.name || data?.characterItems?.[0]?.characterName || null;
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

  // ── Main ──────────────────────────────────────────────────────────

  async function init() {
    // Wait for the inventory hints row to exist in the DOM
    let hintsRow;
    try {
      hintsRow = await waitForElement(`.${HINTS_CLASS}`);
    } catch {
      return; // Page structure not as expected — bail silently
    }

    const data = readToolashaData();
    if (!data) {
      // Toolasha data not found — show a dim info note instead
      const note = document.createElement('span');
      note.style.cssText = 'font-size:0.78rem;color:#9aa;';
      note.textContent = 'Toolasha data not found (play MWI with Toolasha active first)';
      hintsRow.appendChild(note);
      return;
    }

    const inv = extractInventory(data);
    if (!inv) {
      const note = document.createElement('span');
      note.style.cssText = 'font-size:0.78rem;color:#9aa;';
      note.textContent = 'Toolasha: no inventory items found in stored data';
      hintsRow.appendChild(note);
      return;
    }

    const name = getCharacterName(data);
    const itemCount = Object.keys(inv).length;
    const label = name
      ? `⬆ Load inventory from Toolasha (${name}, ${itemCount} items)`
      : `⬆ Load inventory from Toolasha (${itemCount} items)`;

    const btn = injectButton(hintsRow, label, () => {
      fillTextarea(inv);
      btn.textContent = '✓ Loaded!';
      btn.style.color = '#1a8c55';
      setTimeout(() => {
        btn.textContent = label;
        btn.style.color = '#22a06b';
      }, 2500);
    });

    // Also expose a global so the page's own JS could call it
    window.__toolashaLoadInventory = () => fillTextarea(inv);
  }

  init();
})();
