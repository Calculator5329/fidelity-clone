/**
 * Generate Daily Holdings CSV
 * 
 * This script parses all transaction history CSVs and generates a daily
 * holdings CSV showing what quantity of each symbol was held on each day.
 */

import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

interface Transaction {
  runDate: string;
  action: string;
  symbol: string;
  quantity: number;
  amount: number;
}

// Parse a single transaction CSV file
function parseTransactionCSV(filePath: string): Transaction[] {
  const csvText = fs.readFileSync(filePath, 'utf-8');
  const transactions: Transaction[] = [];
  
  const results = Papa.parse<string[]>(csvText);
  const rows = results.data;
  
  // Find the header row
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i][0] === 'Run Date') {
      headerIndex = i;
      break;
    }
  }
  
  if (headerIndex === -1) {
    console.warn(`Could not find header row in ${filePath}`);
    return [];
  }
  
  // Parse data rows
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 12 || !row[0]) continue;
    
    // Skip disclaimer rows
    if (row[0].startsWith('The data') || row[0].startsWith('Brokerage') || row[0].startsWith('Date downloaded')) {
      continue;
    }
    
    const runDate = row[0]?.trim();
    if (!runDate || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(runDate)) continue;
    
    transactions.push({
      runDate,
      action: row[1]?.trim() || '',
      symbol: row[2]?.trim() || '',
      quantity: parseFloat(row[5]) || 0,
      amount: parseFloat(row[10]) || 0,
    });
  }
  
  return transactions;
}

// Parse date from MM/DD/YYYY to Date object
function parseDate(dateStr: string): Date {
  const [month, day, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

// Format date as YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get all dates between start and end (inclusive)
function getDateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Main function
async function generateDailyHoldings() {
  console.log('Generating daily holdings...\n');
  
  const publicDir = path.join(process.cwd(), 'public');
  const outputDir = path.join(publicDir, 'data');
  
  // Find all transaction CSV files
  const csvFiles = fs.readdirSync(publicDir)
    .filter(f => (f.startsWith('History_for_Account') || f.startsWith('transactions')) && f.endsWith('.csv'))
    .map(f => path.join(publicDir, f));
  
  console.log(`Found ${csvFiles.length} transaction files:`);
  csvFiles.forEach(f => console.log(`  - ${path.basename(f)}`));
  
  // Parse all transactions
  let allTransactions: Transaction[] = [];
  for (const file of csvFiles) {
    const transactions = parseTransactionCSV(file);
    console.log(`  Parsed ${transactions.length} transactions from ${path.basename(file)}`);
    allTransactions = allTransactions.concat(transactions);
  }
  
  // Deduplicate transactions
  const seen = new Set<string>();
  allTransactions = allTransactions.filter(tx => {
    const key = `${tx.runDate}-${tx.action}-${tx.symbol}-${tx.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  console.log(`\nTotal unique transactions: ${allTransactions.length}`);
  
  // Sort transactions by date
  allTransactions.sort((a, b) => {
    const dateA = parseDate(a.runDate);
    const dateB = parseDate(b.runDate);
    return dateA.getTime() - dateB.getTime();
  });
  
  // Find date range
  const firstDate = parseDate(allTransactions[0].runDate);
  // Use the latest transaction date as the end date
  const lastDate = parseDate(allTransactions[allTransactions.length - 1].runDate);
  
  console.log(`Date range: ${formatDate(firstDate)} to ${formatDate(lastDate)}`);
  
  // Get all symbols that were ever traded
  const allSymbols = new Set<string>();
  for (const tx of allTransactions) {
    if (tx.symbol && tx.symbol !== 'SPAXX') {
      allSymbols.add(tx.symbol);
    }
  }
  const sortedSymbols = Array.from(allSymbols).sort();
  console.log(`\nTracking ${sortedSymbols.length} symbols: ${sortedSymbols.join(', ')}`);
  
  // Initialize holdings map
  const holdings = new Map<string, number>();
  for (const symbol of sortedSymbols) {
    holdings.set(symbol, 0);
  }
  
  // Track holdings for the "TRANSFERRED FROM" transactions at the start
  // These represent initial positions transferred into the account
  for (const tx of allTransactions) {
    if (tx.action.includes('TRANSFERRED FROM') && tx.symbol) {
      // These show shares transferred in - quantity is in the Quantity column
      const current = holdings.get(tx.symbol) || 0;
      holdings.set(tx.symbol, current + tx.quantity);
    }
  }
  
  // Generate all dates in range
  const allDates = getDateRange(firstDate, lastDate);
  console.log(`Generating holdings for ${allDates.length} days...\n`);
  
  // Group transactions by date
  const txByDate = new Map<string, Transaction[]>();
  for (const tx of allTransactions) {
    const dateKey = formatDate(parseDate(tx.runDate));
    if (!txByDate.has(dateKey)) {
      txByDate.set(dateKey, []);
    }
    txByDate.get(dateKey)!.push(tx);
  }
  
  // Build daily holdings data
  const dailyHoldings: { date: string; [symbol: string]: string | number }[] = [];
  
  // Reset holdings to replay from beginning
  holdings.clear();
  for (const symbol of sortedSymbols) {
    holdings.set(symbol, 0);
  }
  
  for (const date of allDates) {
    const dateKey = formatDate(date);
    
    // Apply transactions for this date
    const dayTransactions = txByDate.get(dateKey) || [];
    for (const tx of dayTransactions) {
      if (!tx.symbol || tx.symbol === 'SPAXX') continue;
      
      const action = tx.action.toUpperCase();
      const current = holdings.get(tx.symbol) || 0;
      
      if (action.includes('TRANSFERRED FROM') && tx.quantity > 0) {
        // Shares transferred into the account
        holdings.set(tx.symbol, current + tx.quantity);
      } else if (action.includes('YOU BOUGHT')) {
        holdings.set(tx.symbol, current + tx.quantity);
      } else if (action.includes('YOU SOLD')) {
        holdings.set(tx.symbol, Math.max(0, current - Math.abs(tx.quantity)));
      }
    }
    
    // Record holdings for this date
    const row: { date: string; [symbol: string]: string | number } = { date: dateKey };
    for (const symbol of sortedSymbols) {
      row[symbol] = holdings.get(symbol) || 0;
    }
    dailyHoldings.push(row);
  }
  
  // Write to CSV
  const header = ['date', ...sortedSymbols];
  const csvRows = [header.join(',')];
  
  for (const row of dailyHoldings) {
    const values = [row.date];
    for (const symbol of sortedSymbols) {
      const qty = row[symbol] as number;
      values.push(qty.toFixed(6));
    }
    csvRows.push(values.join(','));
  }
  
  const outputPath = path.join(outputDir, 'daily_holdings.csv');
  fs.writeFileSync(outputPath, csvRows.join('\n'));
  
  console.log(`✓ Written ${dailyHoldings.length} daily records to ${outputPath}`);
  
  // Print final holdings for verification
  console.log('\nFinal holdings (Jan 4, 2026):');
  for (const symbol of sortedSymbols) {
    const qty = holdings.get(symbol) || 0;
    if (qty > 0.001) {
      console.log(`  ${symbol}: ${qty.toFixed(4)}`);
    }
  }
}

generateDailyHoldings().catch(console.error);
