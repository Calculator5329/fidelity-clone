/**
 * Migration script to convert stock-projections-2-export.json to fair_value_history.json format
 * 
 * Formula (from ReverseDCF.tsx):
 * 1. terminalRevenue = currentRevenue * (1 + revenueGrowth/100)^years
 * 2. terminalEarnings = terminalRevenue * (profitMargin/100)
 * 3. terminalEPS = terminalEarnings / sharesOutstanding
 * 4. terminalPrice (future value) = terminalEPS * peRatio
 * 5. fairValue (present value) = terminalPrice / (1 + discountRate/100)^years
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DISCOUNT_RATE = 10; // 10% discount rate

interface Scenario {
  revenueGrowth: number;
  profitMargin: number;
  peRatio: number;
  dividendAndBuyback: number;
}

interface Projection {
  id: string;
  ticker: string;
  projectionDate: string;
  currentRevenue: number;
  currentNetIncome: number;
  currentNetMargin: number;
  dividendYield: number;
  buybackYield: number;
  sharesOutstanding: number;
  currentPrice: number;
  years: number;
  notes: string;
  scenarios: {
    conservative: Scenario;
    moderate: Scenario;
    aggressive: Scenario;
  };
  ratings: {
    valuation: string;
    moat: string;
    allocation: string;
    financialHealth: string;
    growth: string;
  };
  ratingsOverridden: Record<string, boolean>;
  name: string;
  userId: string;
  createdAt: string;
  lastUpdated: string;
}

interface ProjectionsExport {
  exportedAt: string;
  userId: string;
  collection: string;
  count: number;
  projections: Projection[];
}

interface FairValueEntry {
  date: string;
  fairValue: number;
  futureValue?: number;
  inputs: {
    currentRevenue: number;
    currentEPS: number;
    sharesOutstanding: number;
    revenueGrowth: number;
    targetMargin: number;
    terminalPE: number;
    yearsToTerminal: number;
    discountRate: number;
  };
  scenarios?: {
    conservative: Scenario;
    moderate: Scenario;
    aggressive: Scenario;
  };
  ratings?: {
    valuation: string;
    moat: string;
    allocation: string;
    financialHealth: string;
    growth: string;
  };
}

interface StockFairValueData {
  entries: FairValueEntry[];
  currentInputs: FairValueEntry['inputs'];
}

function calculateFairValue(
  currentRevenue: number,
  sharesOutstanding: number,
  revenueGrowth: number,
  profitMargin: number,
  peRatio: number,
  years: number,
  discountRate: number
): { fairValue: number; futureValue: number } {
  // Project revenue to terminal year
  const terminalRevenue = currentRevenue * Math.pow(1 + revenueGrowth / 100, years);
  
  // Calculate terminal earnings
  const terminalEarnings = terminalRevenue * (profitMargin / 100);
  
  // Calculate terminal EPS
  const terminalEPS = terminalEarnings / sharesOutstanding;
  
  // Apply terminal P/E to get future price
  const futureValue = terminalEPS * peRatio;
  
  // Discount back to present value
  const discountFactor = Math.pow(1 + discountRate / 100, years);
  const fairValue = futureValue / discountFactor;
  
  return { fairValue, futureValue };
}

function convertDateFormat(dateStr: string): string {
  // Convert "12/14/2025" to "2025-12-14"
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return dateStr;
}

async function main() {
  // Read the projections file
  const projectionsPath = path.join(__dirname, '../public/stock-projections-2-export.json');
  const projectionsData: ProjectionsExport = JSON.parse(fs.readFileSync(projectionsPath, 'utf-8'));
  
  // Read existing fair value history
  const fairValuePath = path.join(__dirname, '../public/data/fair_value_history.json');
  let existingFairValue: Record<string, StockFairValueData> = {};
  try {
    existingFairValue = JSON.parse(fs.readFileSync(fairValuePath, 'utf-8'));
  } catch (e) {
    console.log('No existing fair value history found, creating new one');
  }

  console.log(`\nProcessing ${projectionsData.projections.length} projections...\n`);
  console.log('=' .repeat(100));

  for (const proj of projectionsData.projections) {
    const { ticker, projectionDate, currentRevenue, currentNetIncome, sharesOutstanding, years } = proj;
    const moderate = proj.scenarios.moderate;
    
    // Calculate EPS from net income and shares
    const currentEPS = currentNetIncome / sharesOutstanding;
    
    // Calculate fair value using moderate scenario
    const { fairValue, futureValue } = calculateFairValue(
      currentRevenue,
      sharesOutstanding,
      moderate.revenueGrowth,
      moderate.profitMargin,
      moderate.peRatio,
      years,
      DISCOUNT_RATE
    );

    const date = convertDateFormat(projectionDate);

    console.log(`${ticker}:`);
    console.log(`  Revenue: $${currentRevenue}B | Net Income: $${currentNetIncome}B | Shares: ${sharesOutstanding}B`);
    console.log(`  Moderate: ${moderate.revenueGrowth}% growth, ${moderate.profitMargin}% margin, ${moderate.peRatio}x PE, ${years} years`);
    console.log(`  Current Price: $${proj.currentPrice}`);
    console.log(`  Future Value: $${futureValue.toFixed(2)}`);
    console.log(`  Fair Value (PV): $${fairValue.toFixed(2)}`);
    console.log(`  Upside: ${(((fairValue / proj.currentPrice) - 1) * 100).toFixed(1)}%`);
    console.log('-'.repeat(100));

    // Create the fair value entry
    const entry: FairValueEntry = {
      date,
      fairValue: Math.round(fairValue * 100) / 100,
      futureValue: Math.round(futureValue * 100) / 100,
      inputs: {
        currentRevenue: currentRevenue * 1_000_000_000, // Convert to raw number for consistency
        currentEPS: Math.round(currentEPS * 100) / 100,
        sharesOutstanding: sharesOutstanding * 1_000_000_000, // Convert to raw number
        revenueGrowth: moderate.revenueGrowth,
        targetMargin: moderate.profitMargin,
        terminalPE: moderate.peRatio,
        yearsToTerminal: years,
        discountRate: DISCOUNT_RATE,
      },
      scenarios: proj.scenarios,
      ratings: proj.ratings,
    };

    // Initialize stock if not exists
    if (!existingFairValue[ticker]) {
      existingFairValue[ticker] = {
        entries: [],
        currentInputs: entry.inputs,
      };
    }

    // Check if entry for this date already exists
    const existingEntryIndex = existingFairValue[ticker].entries.findIndex(e => e.date === date);
    if (existingEntryIndex >= 0) {
      // Update existing entry
      existingFairValue[ticker].entries[existingEntryIndex] = entry;
    } else {
      // Add new entry
      existingFairValue[ticker].entries.push(entry);
    }

    // Sort entries by date
    existingFairValue[ticker].entries.sort((a, b) => a.date.localeCompare(b.date));

    // Update current inputs to latest entry
    existingFairValue[ticker].currentInputs = entry.inputs;
  }

  // Write updated fair value history
  fs.writeFileSync(fairValuePath, JSON.stringify(existingFairValue, null, 2));
  console.log(`\n✅ Updated ${fairValuePath}`);
}

main().catch(console.error);
