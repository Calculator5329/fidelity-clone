/**
 * Generate Daily Portfolio Snapshots
 * 
 * This script combines daily_holdings.csv and daily_prices.csv to create
 * a comprehensive JSON file with full position-level detail for each trading day.
 * This enables "wayback machine" functionality for historical portfolio analysis.
 */

import * as fs from 'fs';
import * as path from 'path';

interface Position {
  symbol: string;
  quantity: number;
  price: number;
  marketValue: number;
  allocation: number;
}

interface DailySnapshot {
  date: string;
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  positions: Position[];
}

interface PortfolioSnapshots {
  version: string;
  lastUpdated: string;
  dateRange: {
    start: string;
    end: string;
  };
  snapshots: DailySnapshot[];
}

// Read CSV file and parse into rows
function readCSV(filePath: string): { headers: string[]; rows: Map<string, Map<string, number>> } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  
  const headers = lines[0].split(',');
  const symbols = headers.slice(1);
  
  const rows = new Map<string, Map<string, number>>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const date = values[0];
    const symbolValues = new Map<string, number>();
    
    for (let j = 1; j < values.length; j++) {
      symbolValues.set(symbols[j - 1], parseFloat(values[j]) || 0);
    }
    
    rows.set(date, symbolValues);
  }
  
  return { headers, rows };
}

// Main function
async function generateDailySnapshots() {
  console.log('Generating daily portfolio snapshots...\n');
  
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const holdingsPath = path.join(dataDir, 'daily_holdings.csv');
  const pricesPath = path.join(dataDir, 'daily_prices.csv');
  
  if (!fs.existsSync(holdingsPath)) {
    console.error('Error: daily_holdings.csv not found. Run generateDailyHoldings.ts first.');
    process.exit(1);
  }
  
  if (!fs.existsSync(pricesPath)) {
    console.error('Error: daily_prices.csv not found. Run fetchDailyPrices.ts first.');
    process.exit(1);
  }
  
  // Read holdings and prices
  const holdings = readCSV(holdingsPath);
  const prices = readCSV(pricesPath);
  
  const symbols = holdings.headers.slice(1);
  console.log(`Processing ${symbols.length} symbols across ${holdings.rows.size} days\n`);
  
  // Generate snapshots
  const snapshots: DailySnapshot[] = [];
  let previousValue = 0;
  
  // Get sorted dates
  const sortedDates = Array.from(holdings.rows.keys()).sort();
  
  for (const date of sortedDates) {
    const holdingsMap = holdings.rows.get(date)!;
    const pricesMap = prices.rows.get(date);
    
    // Skip if no price data for this date
    if (!pricesMap) {
      continue;
    }
    
    // Calculate positions and total value
    const positions: Position[] = [];
    let totalValue = 0;
    
    for (const symbol of symbols) {
      const quantity = holdingsMap.get(symbol) || 0;
      const price = pricesMap.get(symbol) || 0;
      
      // Only include positions with quantity > 0
      if (quantity > 0.0001 && price > 0) {
        const marketValue = quantity * price;
        totalValue += marketValue;
        
        positions.push({
          symbol,
          quantity: Math.round(quantity * 10000) / 10000, // Round to 4 decimal places
          price: Math.round(price * 100) / 100, // Round to 2 decimal places
          marketValue: Math.round(marketValue * 100) / 100,
          allocation: 0, // Will be calculated after we have total value
        });
      }
    }
    
    // Calculate allocation percentages
    for (const position of positions) {
      position.allocation = totalValue > 0 
        ? Math.round((position.marketValue / totalValue) * 10000) / 100 // Round to 2 decimal places
        : 0;
    }
    
    // Sort positions by market value (largest first)
    positions.sort((a, b) => b.marketValue - a.marketValue);
    
    // Calculate day change
    const dayChange = previousValue > 0 ? totalValue - previousValue : 0;
    const dayChangePercent = previousValue > 0 
      ? Math.round((dayChange / previousValue) * 10000) / 100 
      : 0;
    
    snapshots.push({
      date,
      totalValue: Math.round(totalValue * 100) / 100,
      dayChange: Math.round(dayChange * 100) / 100,
      dayChangePercent,
      positions,
    });
    
    previousValue = totalValue;
  }
  
  // Build output object
  const output: PortfolioSnapshots = {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    dateRange: {
      start: snapshots[0]?.date || '',
      end: snapshots[snapshots.length - 1]?.date || '',
    },
    snapshots,
  };
  
  // Write JSON output
  const outputPath = path.join(dataDir, 'daily_portfolio_snapshots.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  
  console.log(`✓ Written ${snapshots.length} daily snapshots to ${outputPath}`);
  
  // Calculate file size
  const fileSizeBytes = fs.statSync(outputPath).size;
  const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
  console.log(`  File size: ${fileSizeMB} MB`);
  
  // Count total positions across all snapshots
  const totalPositions = snapshots.reduce((sum, s) => sum + s.positions.length, 0);
  console.log(`  Total position entries: ${totalPositions.toLocaleString()}`);
  
  // Print summary statistics
  console.log('\n--- Summary ---');
  console.log(`Date range: ${output.dateRange.start} to ${output.dateRange.end}`);
  console.log(`Total snapshots: ${snapshots.length}`);
  
  // Find biggest gain and loss days
  const tradingDays = snapshots.filter(s => s.dayChange !== 0);
  if (tradingDays.length > 0) {
    const biggestGain = tradingDays.reduce((max, s) => s.dayChange > max.dayChange ? s : max);
    const biggestLoss = tradingDays.reduce((min, s) => s.dayChange < min.dayChange ? s : min);
    
    console.log(`\nBiggest gain day: ${biggestGain.date}`);
    console.log(`  +$${biggestGain.dayChange.toLocaleString('en-US', { minimumFractionDigits: 2 })} (+${biggestGain.dayChangePercent}%)`);
    
    console.log(`\nBiggest loss day: ${biggestLoss.date}`);
    console.log(`  -$${Math.abs(biggestLoss.dayChange).toLocaleString('en-US', { minimumFractionDigits: 2 })} (${biggestLoss.dayChangePercent}%)`);
  }
  
  // Print last snapshot for verification
  const lastSnapshot = snapshots[snapshots.length - 1];
  if (lastSnapshot) {
    console.log(`\nLast snapshot (${lastSnapshot.date}):`);
    console.log(`  Total value: $${lastSnapshot.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  Positions: ${lastSnapshot.positions.length}`);
    console.log('  Top 5 positions:');
    lastSnapshot.positions.slice(0, 5).forEach(p => {
      console.log(`    ${p.symbol}: $${p.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${p.allocation}%)`);
    });
  }
}

generateDailySnapshots().catch(console.error);
