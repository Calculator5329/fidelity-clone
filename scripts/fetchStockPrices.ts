/**
 * Fetch Stock Daily Prices from Yahoo Finance
 * 
 * This script fetches historical daily prices for all stocks in the portfolio
 * to be used for the Stock Overview chart.
 */

import * as fs from 'fs';
import * as path from 'path';
import YahooFinance from 'yahoo-finance2';

// Initialize Yahoo Finance instance
const yahooFinance = new YahooFinance();

// List of stock symbols in the portfolio
const PORTFOLIO_SYMBOLS = [
  'META',
  'GOOGL',
  'AMZN',
  'PYPL',
  'TXRH',
  'DUOL',
  'AMD',
  'ASML',
  'MELI',
  'NKE',
  'ADBE',
  'CRM',
  'MA',
  'CELH',
  'SOFI',
];

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
): { date: string; close: number }[] {
  const result: { date: string; close: number }[] = [];
  let lastPrice: number | null = null;
  
  for (const date of allDates) {
    if (prices.has(date)) {
      lastPrice = prices.get(date)!;
    }
    if (lastPrice !== null) {
      result.push({ date, close: lastPrice });
    }
  }
  
  return result;
}

// Fetch historical prices for a single stock
async function fetchStockPrices(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  
  try {
    console.log(`  Fetching ${symbol}...`);
    
    const result = await yahooFinance.chart(symbol, {
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
    
    console.log(`    ✓ ${prices.size} days of data`);
  } catch (error: any) {
    console.error(`    ✗ Error: ${error.message}`);
  }
  
  return prices;
}

// Main function
async function main() {
  console.log('Fetching stock daily prices from Yahoo Finance...\n');
  
  const dataDir = path.join(process.cwd(), 'public', 'data', 'stock_prices');
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Fetch data going back to 2020 to cover all fair value history
  const startDate = '2020-01-01';
  const endDate = '2026-01-10';
  const allDates = getDateRange(startDate, endDate);
  
  console.log(`Date range: ${startDate} to ${endDate}\n`);
  
  // Fetch prices for each symbol
  for (const symbol of PORTFOLIO_SYMBOLS) {
    const prices = await fetchStockPrices(symbol, startDate, endDate);
    
    if (prices.size > 0) {
      // Forward-fill missing prices
      const filledPrices = forwardFillPrices(allDates, prices);
      
      // Write to JSON file
      const outputPath = path.join(dataDir, `${symbol}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(filledPrices, null, 2));
      
      console.log(`    Written to ${symbol}.json\n`);
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n✓ All stock prices fetched successfully!');
}

main().catch(console.error);
