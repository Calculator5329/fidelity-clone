/**
 * Anonymization script: replaces real account numbers and scales
 * all monetary/quantity values by a constant factor before public deploy.
 *
 * Run once from repo root: node scripts/anonymize.mjs
 * Output goes to public/data/ (overwrites in-place).
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SCALE = 1.73;
const ACCOUNT_MAP = {
  '244509266': 'PORTFOLIO01',
};

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'public', 'data');

function scaleValue(val) {
  if (typeof val === 'number' && isFinite(val)) {
    return Math.round(val * SCALE * 100) / 100;
  }
  return val;
}

// Fields that represent monetary amounts or quantities we want to scale
const MONETARY_FIELDS = new Set([
  'value', 'totalValue', 'currentValue', 'costBasis', 'avgCostBasis',
  'totalGainLoss', 'todayGainLoss', 'amount', 'quantity', 'price',
  'lastPrice', 'lastPriceChange', 'totalGainLossPercent', 'todayGainLossPercent',
  'previousClose', 'change', 'high52', 'low52', 'marketCap',
  'deposits', 'withdrawals', 'dividends', 'fees',
  'totalDeposited', 'totalWithdrawn', 'netDeposited',
  'portfolioValue', 'cash', 'totalCash',
]);

// Fields we explicitly do NOT scale (percentages, ratios stay as-is)
const SKIP_FIELDS = new Set([
  'percentOfAccount', 'changePercent', 'priceChangePercent',
  'todayGainLossPercent', 'totalGainLossPercent', 'allocation',
]);

function anonymizeObj(obj) {
  if (Array.isArray(obj)) {
    return obj.map(anonymizeObj);
  }
  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      // Replace account number keys
      const newKey = ACCOUNT_MAP[k] ?? k;
      if (SKIP_FIELDS.has(k)) {
        result[newKey] = v;
      } else if (MONETARY_FIELDS.has(k)) {
        result[newKey] = scaleValue(v);
      } else {
        result[newKey] = anonymizeObj(v);
      }
    }
    return result;
  }
  // Replace account number strings in values
  if (typeof obj === 'string' && ACCOUNT_MAP[obj]) {
    return ACCOUNT_MAP[obj];
  }
  return obj;
}

// Process all JSON files in public/data/
function processDir(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      processDir(fullPath);
    } else if (entry.name.endsWith('.json')) {
      console.log(`Processing ${fullPath}`);
      try {
        const raw = readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(raw);
        const anonymized = anonymizeObj(parsed);
        writeFileSync(fullPath, JSON.stringify(anonymized, null, 2), 'utf8');
        console.log(`  ✓ Done`);
      } catch (e) {
        console.error(`  ✗ Error: ${e.message}`);
      }
    }
  }
}

processDir(DATA_DIR);
console.log('\nAnonymization complete. All monetary values scaled by', SCALE);
console.log('Account number mapping:', ACCOUNT_MAP);
