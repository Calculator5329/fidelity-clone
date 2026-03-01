/**
 * Generates completely synthetic portfolio sample data.
 * Replaces all real data with a fictional "Growth Portfolio" using
 * AAPL, MSFT, NVDA, TSLA, SPY — no relation to any real portfolio.
 *
 * Run from repo root: node scripts/generate-sample-data.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'public', 'data');
const PRICES_DIR = join(DATA_DIR, 'stock_prices');
mkdirSync(PRICES_DIR, { recursive: true });

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt2(n) { return Math.round(n * 100) / 100; }

/** Generate business days between two dates */
function businessDays(startStr, endStr) {
  const days = [];
  const d = new Date(startStr);
  const end = new Date(endStr);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(d.toISOString().slice(0, 10));
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Seeded pseudo-random for reproducibility */
function makeRng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rng = makeRng(42);

/**
 * Generate a synthetic stock price series using geometric Brownian motion.
 * drift: annual return (e.g. 0.18 = 18%), vol: annual volatility (e.g. 0.30)
 */
function generatePrices(days, startPrice, drift, vol) {
  const dt = 1 / 252;
  const mu = drift * dt;
  const sigma = vol * Math.sqrt(dt);
  const prices = [];
  let p = startPrice;
  for (const date of days) {
    const z = (rng() + rng() + rng() + rng() - 2) * Math.SQRT2; // approx normal
    p = p * Math.exp(mu - 0.5 * sigma * sigma + sigma * z);
    prices.push({ date, close: fmt2(Math.max(p, 1)) });
  }
  return prices;
}

// ─── simulation parameters ───────────────────────────────────────────────────

const START = '2022-01-03';
const END   = '2026-01-31';
const DAYS  = businessDays(START, END);

const STOCKS = {
  AAPL:  { start: 182,  drift: 0.14, vol: 0.28, desc: 'APPLE INC',                 descFull: 'APPLE INC COM STK' },
  MSFT:  { start: 335,  drift: 0.18, vol: 0.25, desc: 'MICROSOFT CORP',             descFull: 'MICROSOFT CORP COM' },
  NVDA:  { start: 28,   drift: 0.55, vol: 0.60, desc: 'NVIDIA CORP',                descFull: 'NVIDIA CORP COM' },
  TSLA:  { start: 355,  drift: 0.08, vol: 0.65, desc: 'TESLA INC',                  descFull: 'TESLA INC COM STK' },
  SPY:   { start: 460,  drift: 0.12, vol: 0.18, desc: 'SPDR S&P 500 ETF TRUST',     descFull: 'SPDR S&P 500 ETF TR' },
};

// Generate daily prices for each stock
const allPrices = {};
for (const [sym, cfg] of Object.entries(STOCKS)) {
  allPrices[sym] = generatePrices(DAYS, cfg.start, cfg.drift, cfg.vol);
}

// Helper: get price for a symbol on a date (or nearest prior)
function priceOn(sym, date) {
  const arr = allPrices[sym];
  // binary-ish: find last entry <= date
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].date <= date) return arr[i].close;
  }
  return arr[0].close;
}

// ─── transactions ─────────────────────────────────────────────────────────────

// Monthly deposit + diversified buys
// ~$400/month contribution, starting Jan 2022
// Build up holdings over time
const DEPOSITS = [];
const BUYS = [];

const monthlyContrib = 400;
const startDate = new Date(START);

// Helper to find first business day of each month
function firstBizDay(year, month) {
  const d = new Date(year, month, 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Holdings accumulation (shares owned at each point)
const holdings = { AAPL: 0, MSFT: 0, NVDA: 0, TSLA: 0, SPY: 0 };
let cashBalance = 0;

// Track all transactions in chronological order
const txList = [];

// Buy schedule: rotate through stocks each month
const buyRotation = ['SPY', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'SPY', 'AAPL', 'MSFT', 'NVDA', 'SPY'];

// Add initial lump sum Jan 2022
const initDate = '2022-01-03';
cashBalance += 5000;
txList.push({
  id: `20220103-CASH-DEPOSIT-0.00-0.0000`,
  date: initDate,
  settlementDate: '2022-01-05',
  action: 'DEPOSIT',
  symbol: 'CASH',
  description: 'ELECTRONIC FUNDS TRANSFER',
  quantity: 0,
  price: 0,
  amount: 5000,
  type: 'Cash',
  rawAction: 'ELECTRONIC FUNDS TRANSFER RECEIVED',
});

// Buy with initial cash (spread across 4 positions)
const initBuys = [
  { sym: 'SPY',  qty: 3 },
  { sym: 'AAPL', qty: 7 },
  { sym: 'MSFT', qty: 4 },
  { sym: 'NVDA', qty: 20 },
];
for (const { sym, qty } of initBuys) {
  const p = priceOn(sym, initDate);
  const cost = fmt2(p * qty);
  cashBalance -= cost;
  holdings[sym] += qty;
  txList.push({
    id: `20220103-${sym}-BUY-${p.toFixed(2)}-${qty.toFixed(4)}`,
    date: initDate,
    settlementDate: '2022-01-05',
    action: 'BUY',
    symbol: sym,
    description: STOCKS[sym].descFull,
    quantity: qty,
    price: p,
    amount: -cost,
    type: 'Cash',
    rawAction: `YOU BOUGHT ${STOCKS[sym].descFull} (${sym}) (Cash)`,
  });
}

// Monthly contributions from Feb 2022 onwards
let rotIdx = 0;
for (let yr = 2022; yr <= 2025; yr++) {
  const startMonth = (yr === 2022) ? 1 : 0;
  const endMonth   = (yr === 2025) ? 11 : 11;
  for (let mo = startMonth; mo <= endMonth; mo++) {
    const depDate = firstBizDay(yr, mo);
    if (depDate > END) break;

    // Deposit
    cashBalance += monthlyContrib;
    const dId = depDate.replace(/-/g, '');
    txList.push({
      id: `${dId}-CASH-DEPOSIT-0.00-0.0000`,
      date: depDate,
      settlementDate: depDate,
      action: 'DEPOSIT',
      symbol: 'CASH',
      description: 'ELECTRONIC FUNDS TRANSFER',
      quantity: 0,
      price: 0,
      amount: monthlyContrib,
      type: 'Cash',
      rawAction: 'ELECTRONIC FUNDS TRANSFER RECEIVED',
    });

    // Buy into one stock
    const sym = buyRotation[rotIdx % buyRotation.length];
    rotIdx++;
    const p = priceOn(sym, depDate);
    // Spend ~$350 (keep $50 cash buffer)
    const spend = 350;
    const qty = fmt2(spend / p);
    if (qty < 0.001) continue;
    const cost = fmt2(p * qty);
    cashBalance -= cost;
    holdings[sym] += qty;
    txList.push({
      id: `${dId}-${sym}-BUY-${p.toFixed(2)}-${qty.toFixed(4)}`,
      date: depDate,
      settlementDate: depDate,
      action: 'BUY',
      symbol: sym,
      description: STOCKS[sym].descFull,
      quantity: qty,
      price: p,
      amount: -cost,
      type: 'Cash',
      rawAction: `YOU BOUGHT ${STOCKS[sym].descFull} (${sym}) (Cash)`,
    });
  }
}

// Add a few sells to make the history more interesting (TSLA partial sell 2023, NVDA partial sell 2024)
const sells = [
  { date: '2023-06-05', sym: 'TSLA', qty: 1.5 },
  { date: '2024-02-12', sym: 'NVDA', qty: 5 },
];
for (const { date, sym, qty } of sells) {
  const p = priceOn(sym, date);
  const proceeds = fmt2(p * qty);
  holdings[sym] = Math.max(0, holdings[sym] - qty);
  cashBalance += proceeds;
  const dId = date.replace(/-/g, '');
  txList.push({
    id: `${dId}-${sym}-SELL-${p.toFixed(2)}-${qty.toFixed(4)}`,
    date,
    settlementDate: date,
    action: 'SELL',
    symbol: sym,
    description: STOCKS[sym].descFull,
    quantity: -qty,
    price: p,
    amount: proceeds,
    type: 'Cash',
    rawAction: `YOU SOLD ${STOCKS[sym].descFull} (${sym}) (Cash)`,
  });
}

// Sort transactions newest-first (as the app expects)
txList.sort((a, b) => b.date.localeCompare(a.date));

// ─── daily portfolio values ────────────────────────────────────────────────────

// Reconstruct approximate portfolio value each day
// (simplified: use end-of-period holdings, apply historical prices)

// For simplicity, use final holdings to compute daily values from all days
// This gives the right overall shape (not perfect but very convincing)
const finalHoldings = { ...holdings };

const dailyValues = DAYS.map(date => {
  let val = 0;
  for (const [sym, qty] of Object.entries(finalHoldings)) {
    val += priceOn(sym, date) * qty;
  }
  // Add approximate cash over time (grows with deposits, shrinks with buys)
  return { date, value: fmt2(val) };
});

// Scale to start near $5k and make the portfolio growth story compelling
// The raw values are based on final holdings * historical prices which
// underestimates early portfolio value (fewer shares than today).
// Add a simple ramp to account for this.
const firstVal = dailyValues[0].value;
const adjustedValues = dailyValues.map((row, i) => {
  const progressFraction = i / (dailyValues.length - 1);
  // Early values need boosting since we had similar dollar amounts but fewer shares
  const adjustment = (1 - progressFraction) * 0.12 + 1;
  return { date: row.date, value: fmt2(row.value * adjustment) };
});

// ─── positions snapshot ────────────────────────────────────────────────────────

const LAST_DATE = END;
const positions = Object.entries(finalHoldings)
  .filter(([, qty]) => qty > 0.001)
  .map(([sym, qty]) => {
    const p = priceOn(sym, LAST_DATE);
    const pPrev = priceOn(sym, '2026-01-30');
    const cv = fmt2(p * qty);
    const cb = fmt2(allPrices[sym][0].close * qty * 0.9); // approximate cost basis
    const tgl = fmt2(cv - cb);
    const tglPct = fmt2((tgl / cb) * 100);
    const dayGain = fmt2((p - pPrev) * qty);
    const dayGainPct = fmt2(((p - pPrev) / pPrev) * 100);
    const totalVal = adjustedValues[adjustedValues.length - 1].value;
    return {
      symbol: sym,
      description: STOCKS[sym].desc,
      quantity: fmt2(qty),
      currentValue: cv,
      lastPrice: p,
      lastPriceChange: fmt2(p - pPrev),
      todayGainLoss: dayGain,
      todayGainLossPercent: dayGainPct,
      costBasis: cb,
      avgCostBasis: fmt2(cb / qty),
      totalGainLoss: tgl,
      totalGainLossPercent: tglPct,
      percentOfAccount: fmt2((cv / totalVal) * 100),
      type: 'Cash',
    };
  });

const totalPortfolioValue = fmt2(positions.reduce((s, p) => s + p.currentValue, 0));

// ─── daily portfolio snapshots (weekly granularity to keep file small) ─────────

// Only include every 5th day to keep the file a manageable size
const snapshotDays = DAYS.filter((_, i) => i % 5 === 0 || i === DAYS.length - 1);

const snapshots = snapshotDays.map(date => {
  let tv = 0;
  const pos = Object.entries(finalHoldings)
    .filter(([, qty]) => qty > 0.001)
    .map(([sym, qty]) => {
      const p = priceOn(sym, date);
      const mv = fmt2(p * qty);
      tv += mv;
      return { symbol: sym, quantity: fmt2(qty), price: p, marketValue: mv, allocation: 0 };
    });
  pos.forEach(p => { p.allocation = fmt2((p.marketValue / tv) * 100); });
  const idx = DAYS.indexOf(date);
  const prevIdx = Math.max(0, idx - 1);
  const prevVal = adjustedValues[prevIdx]?.value ?? tv;
  const curVal = adjustedValues[idx]?.value ?? tv;
  return {
    date,
    totalValue: fmt2(curVal),
    dayChange: fmt2(curVal - prevVal),
    dayChangePercent: fmt2(((curVal - prevVal) / prevVal) * 100),
    positions: pos,
  };
});

// ─── VTI prices (use SPY prices as benchmark proxy) ─────────────────────────────

const vtiPrices = allPrices.SPY.filter((_, i) => i % 5 === 0).map(row => ({
  date: row.date,
  close: row.close,
}));

// ─── fair value history ────────────────────────────────────────────────────────

const fairValueHistory = {};
for (const [sym, cfg] of Object.entries(STOCKS)) {
  if (sym === 'SPY') continue;
  const startP = cfg.start;
  fairValueHistory[sym] = {
    entries: [
      {
        date: '2022-01-01',
        fairValue: fmt2(startP * 1.08),
        inputs: { currentRevenue: 1e11, currentEPS: 6, sharesOutstanding: 1.5e10, revenueGrowth: 12, targetMargin: 25, terminalPE: 22, yearsToTerminal: 5, discountRate: 10 },
      },
      {
        date: '2023-06-01',
        fairValue: fmt2(priceOn(sym, '2023-06-01') * 1.05),
        inputs: { currentRevenue: 1.1e11, currentEPS: 7, sharesOutstanding: 1.45e10, revenueGrowth: 13, targetMargin: 26, terminalPE: 22, yearsToTerminal: 5, discountRate: 10 },
      },
      {
        date: '2025-01-01',
        fairValue: fmt2(priceOn(sym, '2025-01-01') * 1.03),
        inputs: { currentRevenue: 1.3e11, currentEPS: 9, sharesOutstanding: 1.4e10, revenueGrowth: 14, targetMargin: 28, terminalPE: 24, yearsToTerminal: 5, discountRate: 10 },
      },
    ],
  };
}

// ─── stock thesis ──────────────────────────────────────────────────────────────

const stockThesis = {
  AAPL: {
    thesis: "Apple remains one of the most profitable businesses ever built, with an ecosystem of hardware, software, and services that creates exceptional customer retention. The iPhone continues to generate enormous cash flows that fund buybacks and dividends. Services revenue (App Store, iCloud, Apple TV+, Apple Pay) is growing faster than hardware and commands higher margins. The Vision Pro represents Apple's bet on spatial computing, following their playbook of entering markets late but with a superior product. The company consistently returns capital to shareholders and has reduced share count significantly over the past decade.",
    lastUpdated: "2025-12-01",
  },
  MSFT: {
    thesis: "Microsoft's transformation under Satya Nadella from a legacy software company to a cloud-first AI leader is one of the most impressive pivots in corporate history. Azure is the #2 cloud provider and growing faster than Amazon Web Services. Copilot AI integration across the Office 365 suite creates a compelling upsell opportunity across 300M+ commercial seats. The Activision acquisition adds gaming scale. LinkedIn remains a dominant professional network with strong monetization. The balance sheet is fortress-like, supporting continued R&D investment and shareholder returns.",
    lastUpdated: "2025-11-15",
  },
  NVDA: {
    thesis: "NVIDIA has emerged as the defining infrastructure company of the AI era. Their H100 and B100 GPUs are the de facto standard for AI training workloads, and demand continues to vastly outpace supply. The CUDA software ecosystem creates an enormous switching cost — AI researchers and companies have years of code written for NVIDIA hardware. Data center revenue has grown from negligible to the majority of revenues in just a few years. The automotive and robotics segments represent large optionality. The main risk is competition from AMD, Google TPUs, and custom chips from hyperscalers — but NVIDIA's software moat remains underappreciated.",
    lastUpdated: "2025-10-05",
  },
  TSLA: {
    thesis: "Tesla is best understood as an AI and energy company that manufactures cars, not a traditional automaker. Full Self-Driving (FSD) subscriptions could become a massive recurring revenue stream if achieved at scale. The Supercharger network has become an industry standard, with Ford and GM adopting the NACS connector. Energy storage (Megapack) is growing rapidly as utilities invest in grid stabilization. The valuation remains high relative to current auto margins, requiring execution on FSD, Optimus robotaxi, and energy to justify. Elon Musk's attention across multiple companies is a key risk to monitor.",
    lastUpdated: "2025-12-10",
  },
};

// ─── write files ───────────────────────────────────────────────────────────────

function write(name, data) {
  const path = join(DATA_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  console.log(`✓ Wrote ${name} (${(JSON.stringify(data).length / 1024).toFixed(1)} KB)`);
}

// daily_portfolio_values.json
write('daily_portfolio_values.json', adjustedValues);

// positions.json
write('positions.json', {
  version: '1.0',
  lastUpdated: `${END}T00:00:00.000Z`,
  snapshots: {
    DEMO001: {
      name: 'Growth Portfolio',
      broker: 'Sample Broker',
      history: [{
        date: END,
        totalValue: totalPortfolioValue,
        positions,
      }],
    },
  },
});

// transactions.json
write('transactions.json', {
  version: '1.0',
  lastUpdated: `${END}T00:00:00.000Z`,
  accounts: {
    DEMO001: {
      name: 'Growth Portfolio',
      broker: 'Sample Broker',
      transactions: txList,
    },
  },
});

// daily_portfolio_snapshots.json
write('daily_portfolio_snapshots.json', {
  version: '1.0',
  lastUpdated: `${END}T00:00:00.000Z`,
  dateRange: { start: DAYS[0], end: DAYS[DAYS.length - 1] },
  snapshots,
});

// vti_prices.json (SPY used as benchmark)
write('vti_prices.json', vtiPrices);

// fair_value_history.json
write('fair_value_history.json', fairValueHistory);

// stock_thesis.json
write('stock_thesis.json', stockThesis);

// individual stock prices
for (const [sym, prices] of Object.entries(allPrices)) {
  const simplified = prices.filter((_, i) => i % 3 === 0).map(r => ({ date: r.date, close: r.close }));
  writeFileSync(join(PRICES_DIR, `${sym}.json`), JSON.stringify(simplified, null, 2), 'utf8');
  console.log(`✓ Wrote stock_prices/${sym}.json`);
}

// daily_portfolio_values.csv (app may read this too)
const csvLines = ['date,value', ...adjustedValues.map(r => `${r.date},${r.value}`)];
writeFileSync(join(DATA_DIR, 'daily_portfolio_values.csv'), csvLines.join('\n'), 'utf8');
console.log(`✓ Wrote daily_portfolio_values.csv`);

// daily_holdings.csv (simplified version)
const holdingsCsvLines = ['date,' + Object.keys(finalHoldings).join(',')];
for (const day of DAYS.filter((_, i) => i % 10 === 0)) {
  const vals = Object.entries(finalHoldings).map(([sym, qty]) => fmt2(priceOn(sym, day) * qty));
  holdingsCsvLines.push(`${day},${vals.join(',')}`);
}
writeFileSync(join(DATA_DIR, 'daily_holdings.csv'), holdingsCsvLines.join('\n'), 'utf8');
console.log(`✓ Wrote daily_holdings.csv`);

// Remove old stock price files that are no longer relevant
import { readdirSync, unlinkSync, existsSync } from 'fs';
const oldPriceFiles = readdirSync(PRICES_DIR);
const newSymbols = new Set(Object.keys(STOCKS));
for (const f of oldPriceFiles) {
  const sym = f.replace('.json', '');
  if (!newSymbols.has(sym)) {
    unlinkSync(join(PRICES_DIR, f));
    console.log(`✗ Removed stock_prices/${f} (old data)`);
  }
}

console.log('\n✅ Sample data generation complete!');
console.log(`   Portfolio: Growth Portfolio (DEMO001)`);
console.log(`   Stocks: ${Object.keys(STOCKS).join(', ')}`);
console.log(`   Period: ${START} → ${END}`);
console.log(`   Final value: $${totalPortfolioValue.toLocaleString()}`);
