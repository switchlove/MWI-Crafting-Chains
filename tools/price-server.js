/**
 * MWI Crafting Chains – fetch marketplace data locally
 *
 * Downloads the latest marketplace prices from MWI and saves them to
 * docs/data/marketplace.json so the planner can use them without a server.
 *
 * Usage:  npm run prices
 *
 * Also used by the GitHub Actions workflow (.github/workflows/update-marketplace.yml)
 * to keep the committed file fresh automatically.
 */

import { writeFileSync, mkdirSync } from 'fs';

const MARKETPLACE_URL = 'https://www.milkywayidle.com/game_data/marketplace.json';
const OUTPUT = 'docs/data/marketplace.json';

console.log('[prices] Fetching marketplace data from MWI...');
const res = await fetch(MARKETPLACE_URL);
if (!res.ok) {
  console.error(`[prices] HTTP ${res.status} ${res.statusText}`);
  process.exit(1);
}
const json = await res.json();
const data = json.marketData ?? json;
mkdirSync('docs/data', { recursive: true });
writeFileSync(OUTPUT, JSON.stringify({ updatedAt: new Date().toISOString(), marketData: data }));
console.log(`[prices] Saved ${Object.keys(data).length} items to ${OUTPUT}`);

