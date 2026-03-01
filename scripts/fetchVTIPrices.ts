/**
 * Fetch VTI Daily Prices from Yahoo Finance
 * 
 * This script fetches historical daily prices for VTI (Vanguard Total Stock Market ETF)
 * to be used for comparison with the user's portfolio performance.
 */

import * as fs from 'fs';
import * as path from 'path';
import YahooFinance from 'yahoo-finance2';

// Initialize Yahoo Finance instance
const yahooFinance = new YahooFinance();

// Format date as YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get all dates between start and end
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

// Forward-fill missing prices (for weekends/holidays)
function forwardFillPrices(
  allDates: string[],
  prices: Map<string, number>
): { date: string; price: number }[] {
  const result: { date: string; price: number }[] = [];
  let lastPrice: number | null = null;
  
  for (const date of allDates) {
    if (prices.has(date)) {
      lastPrice = prices.get(date)!;
    }
    if (lastPrice !== null) {
      result.push({ date, price: lastPrice });
    }
  }
  
  return result;
}

// Fetch VTI historical prices
async function fetchVTIPrices(
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  
  try {
    console.log(`Fetching VTI prices from ${startDate} to ${endDate}...`);
    
    const result = await yahooFinance.chart('VTI', {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });
    
    if (result && result.quotes) {
      for (const quote of result.quotes) {
        if (quote.date && quote.close !== null && quote.close !== undefined) {
          const dateStr = formatDate(quote.date);
          prices.set(dateStr, quote.close);
        }
      }
    }
    
    console.log(`  VTI: ${prices.size} days of data fetched`);
  } catch (error: any) {
    console.error(`  Error fetching VTI: ${error.message}`);
  }
  
  return prices;
}

// Main function
async function main() {
  console.log('Fetching VTI daily prices from Yahoo Finance...\n');
  
  const dataDir = path.join(process.cwd(), 'public', 'data');
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Use the same date range as the portfolio data
  // Start from early 2023 (when portfolio started) to current date
  const startDate = '2023-01-01';
  const endDate = '2026-01-10';
  
  // Fetch VTI prices
  const vtiPrices = await fetchVTIPrices(startDate, endDate);
  
  // Get all dates and forward-fill missing prices
  const allDates = getDateRange(startDate, endDate);
  const filledPrices = forwardFillPrices(allDates, vtiPrices);
  
  // Write to JSON file
  const outputPath = path.join(dataDir, 'vti_prices.json');
  fs.writeFileSync(outputPath, JSON.stringify(filledPrices, null, 2));
  
  console.log(`\n✓ Written ${filledPrices.length} days of VTI prices to ${outputPath}`);
  
  // Summary
  if (filledPrices.length > 0) {
    const firstPrice = filledPrices[0];
    const lastPrice = filledPrices[filledPrices.length - 1];
    console.log(`\nPrice range:`);
    console.log(`  First: ${firstPrice.date} - $${firstPrice.price.toFixed(2)}`);
    console.log(`  Last:  ${lastPrice.date} - $${lastPrice.price.toFixed(2)}`);
    console.log(`  Total return: ${(((lastPrice.price - firstPrice.price) / firstPrice.price) * 100).toFixed(2)}%`);
  }
}

main().catch(console.error);
