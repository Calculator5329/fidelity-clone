/**
 * Fetch Daily Prices from Yahoo Finance
 * 
 * This script reads the unique symbols from the daily holdings CSV
 * and fetches historical daily prices for each symbol from Yahoo Finance.
 */

import * as fs from 'fs';
import * as path from 'path';
import YahooFinance from 'yahoo-finance2';

// Initialize Yahoo Finance instance
const yahooFinance = new YahooFinance();

// Symbol mapping for tickers that have changed or need special handling
const SYMBOL_MAPPING: Record<string, string> = {
  // CUSIP/special symbols that need mapping
  '87975H100': 'TIXT', // TELUS International
  '00507V109': 'ATVI', // Activision Blizzard (merged with MSFT)
  'TTCFQ': null as any, // Tattooed Chef - delisted/bankrupt
};

// Read the daily holdings CSV to get symbols and date range
function readHoldingsData(filePath: string): { symbols: string[]; startDate: string; endDate: string } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  
  const header = lines[0].split(',');
  const symbols = header.slice(1); // All columns except 'date'
  
  const firstDataLine = lines[1].split(',');
  const lastDataLine = lines[lines.length - 1].split(',');
  
  return {
    symbols,
    startDate: firstDataLine[0],
    endDate: lastDataLine[0],
  };
}

// Fetch historical prices for a symbol
async function fetchSymbolPrices(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  
  // Check for symbol mapping
  const mappedSymbol = SYMBOL_MAPPING.hasOwnProperty(symbol) 
    ? SYMBOL_MAPPING[symbol] 
    : symbol;
  
  if (!mappedSymbol) {
    console.log(`  Skipping ${symbol} (delisted/no data)`);
    return prices;
  }
  
  try {
    const result = await yahooFinance.chart(mappedSymbol, {
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
    
    console.log(`  ${symbol}${mappedSymbol !== symbol ? ` (as ${mappedSymbol})` : ''}: ${prices.size} days of data`);
  } catch (error: any) {
    console.error(`  Error fetching ${symbol}: ${error.message}`);
  }
  
  return prices;
}

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
  symbolPrices: Map<string, Map<string, number>>
): Map<string, Map<string, number>> {
  const filled = new Map<string, Map<string, number>>();
  
  for (const [symbol, prices] of symbolPrices) {
    const filledPrices = new Map<string, number>();
    let lastPrice: number | null = null;
    
    for (const date of allDates) {
      if (prices.has(date)) {
        lastPrice = prices.get(date)!;
      }
      if (lastPrice !== null) {
        filledPrices.set(date, lastPrice);
      }
    }
    
    filled.set(symbol, filledPrices);
  }
  
  return filled;
}

// Main function
async function fetchDailyPrices() {
  console.log('Fetching daily prices from Yahoo Finance...\n');
  
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const holdingsPath = path.join(dataDir, 'daily_holdings.csv');
  
  if (!fs.existsSync(holdingsPath)) {
    console.error('Error: daily_holdings.csv not found. Run generateDailyHoldings.ts first.');
    process.exit(1);
  }
  
  // Read holdings data
  const { symbols, startDate, endDate } = readHoldingsData(holdingsPath);
  console.log(`Date range: ${startDate} to ${endDate}`);
  console.log(`Symbols to fetch: ${symbols.length}\n`);
  
  // Fetch prices for each symbol
  const symbolPrices = new Map<string, Map<string, number>>();
  
  for (const symbol of symbols) {
    const prices = await fetchSymbolPrices(symbol, startDate, endDate);
    symbolPrices.set(symbol, prices);
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Get all dates and forward-fill missing prices
  const allDates = getDateRange(startDate, endDate);
  const filledPrices = forwardFillPrices(allDates, symbolPrices);
  
  // Write to CSV
  const header = ['date', ...symbols];
  const csvRows = [header.join(',')];
  
  for (const date of allDates) {
    const values = [date];
    for (const symbol of symbols) {
      const prices = filledPrices.get(symbol);
      const price = prices?.get(date) ?? 0;
      values.push(price.toFixed(2));
    }
    csvRows.push(values.join(','));
  }
  
  const outputPath = path.join(dataDir, 'daily_prices.csv');
  fs.writeFileSync(outputPath, csvRows.join('\n'));
  
  console.log(`\n✓ Written ${allDates.length} days of prices to ${outputPath}`);
  
  // Summary
  console.log('\nPrice data summary:');
  for (const symbol of symbols) {
    const prices = filledPrices.get(symbol);
    const count = prices?.size ?? 0;
    const lastPrice = prices?.get(endDate);
    if (count > 0) {
      console.log(`  ${symbol}: ${count} days, latest: $${lastPrice?.toFixed(2) ?? 'N/A'}`);
    } else {
      console.log(`  ${symbol}: No data`);
    }
  }
}

fetchDailyPrices().catch(console.error);
