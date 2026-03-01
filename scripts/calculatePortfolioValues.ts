/**
 * Calculate Daily Portfolio Values
 * 
 * This script combines the daily holdings and daily prices CSVs
 * to calculate the portfolio value for each day.
 */

import * as fs from 'fs';
import * as path from 'path';

interface DailyValue {
  date: string;
  value: number;
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
async function calculatePortfolioValues() {
  console.log('Calculating daily portfolio values...\n');
  
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
  
  // Calculate daily values
  const dailyValues: DailyValue[] = [];
  let previousValue = 0;
  
  for (const [date, holdingsMap] of holdings.rows) {
    const pricesMap = prices.rows.get(date);
    
    if (!pricesMap) {
      // Use previous value if no price data for this date
      dailyValues.push({ date, value: previousValue });
      continue;
    }
    
    let totalValue = 0;
    
    for (const symbol of symbols) {
      const quantity = holdingsMap.get(symbol) || 0;
      const price = pricesMap.get(symbol) || 0;
      totalValue += quantity * price;
    }
    
    // Add cash balance approximation (we don't have exact daily cash, so use minimal)
    // The chart focuses on investment value
    
    dailyValues.push({ date, value: totalValue });
    previousValue = totalValue;
  }
  
  // Write JSON output
  const jsonPath = path.join(dataDir, 'daily_portfolio_values.json');
  fs.writeFileSync(jsonPath, JSON.stringify(dailyValues, null, 2));
  
  console.log(`✓ Written ${dailyValues.length} daily values to ${jsonPath}`);
  
  // Also write a CSV version
  const csvPath = path.join(dataDir, 'daily_portfolio_values.csv');
  const csvContent = ['date,value', ...dailyValues.map(d => `${d.date},${d.value.toFixed(2)}`)].join('\n');
  fs.writeFileSync(csvPath, csvContent);
  
  console.log(`✓ Written ${dailyValues.length} daily values to ${csvPath}`);
  
  // Print summary statistics
  const values = dailyValues.map(d => d.value).filter(v => v > 0);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  const totalReturn = ((lastValue - firstValue) / firstValue) * 100;
  
  console.log('\n--- Summary ---');
  console.log(`Date range: ${dailyValues[0].date} to ${dailyValues[dailyValues.length - 1].date}`);
  console.log(`Starting value: $${firstValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`Ending value: $${lastValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`Min value: $${minValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`Max value: $${maxValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`Total return: ${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`);
  
  // Print last 5 values for verification
  console.log('\nLast 5 values:');
  dailyValues.slice(-5).forEach(d => {
    console.log(`  ${d.date}: $${d.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  });
}

calculatePortfolioValues().catch(console.error);
