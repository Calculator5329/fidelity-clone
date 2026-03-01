/**
 * Merge Fidelity History Export Files into transactions.csv
 * 
 * This script reads multiple Fidelity History export CSVs and merges them
 * into the main transactions.csv file, handling column order differences
 * and deduplicating entries.
 */

import * as fs from 'fs';
import * as path from 'path';

// History files have columns in this order:
// Run Date,Action,Symbol,Description,Type,Price ($),Quantity,Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date

// transactions.csv has columns in this order:
// Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date

interface Transaction {
  runDate: string;
  action: string;
  symbol: string;
  description: string;
  type: string;
  quantity: string;
  price: string;
  commission: string;
  fees: string;
  accruedInterest: string;
  amount: string;
  cashBalance: string;
  settlementDate: string;
}

// Parse a CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

// Parse date in various formats to a comparable format
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // Handle MM/DD/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    return new Date(year, month - 1, day);
  }
  
  return null;
}

// Format date as MM/DD/YYYY for consistent output
function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

// Check if an action represents a transaction we want to include
function isRelevantTransaction(action: string): boolean {
  const upper = action.toUpperCase();
  return upper.includes('YOU BOUGHT') || 
         upper.includes('YOU SOLD') ||
         upper.includes('ELECTRONIC FUNDS TRANSFER');
}

// Read and parse a History export file (with swapped columns)
function parseHistoryFile(filePath: string): Transaction[] {
  const transactions: Transaction[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  let headerFound = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Skip disclaimer/footer lines
    if (trimmed.startsWith('"The data') || 
        trimmed.startsWith('"informational') ||
        trimmed.startsWith('"recommendation') ||
        trimmed.startsWith('"exported') ||
        trimmed.startsWith('"purposes') ||
        trimmed.startsWith('"Brokerage') ||
        trimmed.startsWith('"Financial') ||
        trimmed.startsWith('"Fidelity') ||
        trimmed.startsWith('Date downloaded')) {
      continue;
    }
    
    const fields = parseCSVLine(trimmed);
    
    // Look for header line
    if (fields[0] === 'Run Date') {
      headerFound = true;
      continue;
    }
    
    if (!headerFound) continue;
    if (fields.length < 13) continue;
    
    // History file column order: Run Date,Action,Symbol,Description,Type,Price ($),Quantity,...
    const action = fields[1] || '';
    
    // Only include relevant transactions (buy/sell/deposits)
    if (!isRelevantTransaction(action)) {
      continue;
    }
    
    // Swap Price and Quantity to match transactions.csv format
    const transaction: Transaction = {
      runDate: fields[0],
      action: fields[1],
      symbol: fields[2],
      description: fields[3],
      type: fields[4],
      quantity: fields[6], // Quantity is at index 6 in history files
      price: fields[5],    // Price is at index 5 in history files
      commission: fields[7],
      fees: fields[8],
      accruedInterest: fields[9],
      amount: fields[10],
      cashBalance: fields[11],
      settlementDate: fields[12],
    };
    
    transactions.push(transaction);
  }
  
  return transactions;
}

// Read and parse the existing transactions.csv
function parseTransactionsFile(filePath: string): Transaction[] {
  const transactions: Transaction[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  let headerFound = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const fields = parseCSVLine(trimmed);
    
    // Look for header line
    if (fields[0] === 'Run Date') {
      headerFound = true;
      continue;
    }
    
    if (!headerFound) continue;
    if (fields.length < 13) continue;
    
    // transactions.csv column order: Run Date,Action,Symbol,Description,Type,Quantity,Price ($),...
    const transaction: Transaction = {
      runDate: fields[0],
      action: fields[1],
      symbol: fields[2],
      description: fields[3],
      type: fields[4],
      quantity: fields[5], // Quantity is at index 5 in transactions.csv
      price: fields[6],    // Price is at index 6 in transactions.csv
      commission: fields[7],
      fees: fields[8],
      accruedInterest: fields[9],
      amount: fields[10],
      cashBalance: fields[11],
      settlementDate: fields[12],
    };
    
    transactions.push(transaction);
  }
  
  return transactions;
}

// Generate a unique key for deduplication
function getTransactionKey(t: Transaction): string {
  // Normalize the date format for comparison
  const date = parseDate(t.runDate);
  const dateStr = date ? formatDate(date) : t.runDate;
  
  // Use date, symbol, quantity, and price for uniqueness
  return `${dateStr}|${t.symbol}|${t.quantity}|${t.price}`;
}

// Format a transaction as a CSV line
function formatTransactionCSV(t: Transaction): string {
  // Escape fields that might contain commas
  const escapeField = (field: string) => {
    if (field.includes(',') || field.includes('"')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };
  
  return [
    t.runDate,
    escapeField(t.action),
    t.symbol,
    escapeField(t.description),
    t.type,
    t.quantity,
    t.price,
    t.commission,
    t.fees,
    t.accruedInterest,
    t.amount,
    t.cashBalance,
    t.settlementDate,
  ].join(',');
}

// Main merge function
function mergeHistoryFiles() {
  console.log('Merging Fidelity History files into transactions.csv...\n');
  
  const publicDir = path.join(process.cwd(), 'public');
  const transactionsPath = path.join(publicDir, 'transactions.csv');
  
  // History files to merge
  const historyFiles = [
    'History_for_Account_Z25424500 (7).csv',
    'History_for_Account_Z25424500 (8).csv',
    'History_for_Account_Z25424500 (9).csv',
    'History_for_Account_Z25424500 (10).csv',
  ];
  
  // Read existing transactions
  console.log('Reading existing transactions.csv...');
  let existingTransactions: Transaction[] = [];
  if (fs.existsSync(transactionsPath)) {
    existingTransactions = parseTransactionsFile(transactionsPath);
    console.log(`  Found ${existingTransactions.length} existing transactions\n`);
  }
  
  // Read all history files
  const allNewTransactions: Transaction[] = [];
  
  for (const historyFile of historyFiles) {
    const filePath = path.join(publicDir, historyFile);
    if (fs.existsSync(filePath)) {
      console.log(`Reading ${historyFile}...`);
      const transactions = parseHistoryFile(filePath);
      console.log(`  Found ${transactions.length} transactions`);
      allNewTransactions.push(...transactions);
    } else {
      console.log(`  Skipping ${historyFile} (not found)`);
    }
  }
  
  console.log(`\nTotal new transactions from History files: ${allNewTransactions.length}`);
  
  // Deduplicate by creating a set of keys from existing transactions
  const existingKeys = new Set<string>();
  for (const t of existingTransactions) {
    existingKeys.add(getTransactionKey(t));
  }
  
  // Add only new transactions that don't exist
  let addedCount = 0;
  const mergedTransactions: Transaction[] = [...existingTransactions];
  
  for (const t of allNewTransactions) {
    const key = getTransactionKey(t);
    if (!existingKeys.has(key)) {
      mergedTransactions.push(t);
      existingKeys.add(key);
      addedCount++;
    }
  }
  
  console.log(`Added ${addedCount} new transactions (${allNewTransactions.length - addedCount} duplicates skipped)`);
  
  // Sort by date descending (newest first)
  mergedTransactions.sort((a, b) => {
    const dateA = parseDate(a.runDate);
    const dateB = parseDate(b.runDate);
    if (!dateA || !dateB) return 0;
    return dateB.getTime() - dateA.getTime();
  });
  
  // Write output
  const header = 'Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date';
  const csvLines = [header, ...mergedTransactions.map(formatTransactionCSV)];
  
  fs.writeFileSync(transactionsPath, csvLines.join('\n'));
  
  console.log(`\n✓ Written ${mergedTransactions.length} transactions to transactions.csv`);
  
  // Show some stats
  const symbols = new Set(mergedTransactions.map(t => t.symbol));
  console.log(`\nUnique symbols: ${symbols.size}`);
  
  const dates = mergedTransactions.map(t => parseDate(t.runDate)).filter(d => d !== null) as Date[];
  if (dates.length > 0) {
    const oldest = new Date(Math.min(...dates.map(d => d.getTime())));
    const newest = new Date(Math.max(...dates.map(d => d.getTime())));
    console.log(`Date range: ${formatDate(oldest)} to ${formatDate(newest)}`);
  }
}

mergeHistoryFiles();
