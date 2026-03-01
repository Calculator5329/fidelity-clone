/**
 * Unified Data Merge Script
 * 
 * This script handles merging of Fidelity export files (History and Positions)
 * into unified JSON data files that support multiple accounts.
 * 
 * Usage:
 *   npx ts-node scripts/mergeData.ts [files...]
 *   npx ts-node scripts/mergeData.ts --migrate  (migrate existing CSV to JSON)
 * 
 * Features:
 * - Auto-detects file type (History vs Positions) by parsing headers
 * - Extracts account number from filename or first data row
 * - Normalizes data to consistent JSON format
 * - Merges with existing JSON files, deduplicating by transaction ID
 * - Handles column order differences in Fidelity exports
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  Transaction,
  TransactionAction,
  AccountType,
  TransactionsData,
  Position,
  PositionSnapshot,
  PositionsData,
  ImportResult,
} from '../src/types/portfolio';

// =============================================================================
// Constants
// =============================================================================

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const TRANSACTIONS_JSON = path.join(DATA_DIR, 'transactions.json');
const POSITIONS_JSON = path.join(DATA_DIR, 'positions.json');
const SCHEMA_VERSION = '1.0';

// =============================================================================
// CSV Parsing Utilities
// =============================================================================

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

function parseNumber(value: string): number {
  if (!value) return 0;
  // Remove $ signs, commas, and handle percentages
  const cleaned = value.replace(/[$,%+]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// =============================================================================
// Date Utilities
// =============================================================================

function parseDateMMDDYYYY(dateStr: string): Date | null {
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

function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDateFromString(dateStr: string): string {
  const date = parseDateMMDDYYYY(dateStr);
  if (date) {
    return formatDateISO(date);
  }
  // Try parsing other formats (e.g., "Jan-05-2026")
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return formatDateISO(parsed);
  }
  return dateStr;
}

// =============================================================================
// File Type Detection
// =============================================================================

type FileType = 'history' | 'positions' | 'unknown';

interface FileDetectionResult {
  type: FileType;
  accountNumber: string;
  accountName: string;
  headerLine: string;
  headerIndex: number;
  columnOrder: 'history' | 'transactions' | 'positions';
}

function detectFileType(content: string, filename: string): FileDetectionResult {
  const lines = content.split('\n');
  
  // Try to extract account number from filename
  // Pattern: "History_for_Account_Z25424500" or "History_for_Account_244509266"
  const accountMatch = filename.match(/Account[_\s]([A-Z]?\d+)/i);
  let accountNumber = accountMatch ? accountMatch[1] : '';
  let accountName = '';
  
  // Look for header line
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const fields = parseCSVLine(line);
    
    // Position file detection
    if (fields[0] === 'Account Number') {
      // Get account info from first data row
      const nextLine = lines[i + 1]?.trim();
      if (nextLine) {
        const dataFields = parseCSVLine(nextLine);
        accountNumber = accountNumber || dataFields[0] || '';
        accountName = dataFields[1] || '';
      }
      
      return {
        type: 'positions',
        accountNumber,
        accountName,
        headerLine: line,
        headerIndex: i,
        columnOrder: 'positions',
      };
    }
    
    // History/Transaction file detection
    if (fields[0] === 'Run Date') {
      // Detect column order by checking field 5
      // History files: Price ($) at index 5, Quantity at index 6
      // Transactions.csv: Quantity at index 5, Price ($) at index 6
      const columnOrder = fields[5] === 'Price ($)' ? 'history' : 'transactions';
      
      return {
        type: 'history',
        accountNumber,
        accountName: accountName || 'Unknown Account',
        headerLine: line,
        headerIndex: i,
        columnOrder,
      };
    }
  }
  
  return {
    type: 'unknown',
    accountNumber: '',
    accountName: '',
    headerLine: '',
    headerIndex: -1,
    columnOrder: 'transactions',
  };
}

// =============================================================================
// Action Normalization
// =============================================================================

function normalizeAction(rawAction: string): TransactionAction {
  const upper = rawAction.toUpperCase();
  
  if (upper.includes('YOU BOUGHT')) return 'BUY';
  if (upper.includes('YOU SOLD')) return 'SELL';
  if (upper.includes('ELECTRONIC FUNDS TRANSFER RECEIVED')) return 'DEPOSIT';
  if (upper.includes('ELECTRONIC FUNDS TRANSFER PAID')) return 'WITHDRAWAL';
  if (upper.includes('DIVIDEND RECEIVED')) return 'DIVIDEND';
  if (upper.includes('INTEREST')) return 'INTEREST';
  if (upper.includes('FEE CHARGED')) return 'FEE';
  if (upper.includes('REINVESTMENT')) return 'REINVESTMENT';
  if (upper.includes('TRANSFER') || upper.includes('JOURNALED')) return 'TRANSFER';
  
  return 'OTHER';
}

function normalizeAccountType(type: string): AccountType {
  const upper = type.toUpperCase();
  if (upper === 'MARGIN') return 'Margin';
  if (upper === 'CASH') return 'Cash';
  if (upper.includes('ROTH')) return 'Roth IRA';
  if (upper.includes('IRA')) return 'IRA';
  return 'Other';
}

// =============================================================================
// Transaction Parsing
// =============================================================================

// Known stocks with typical price ranges for detecting swapped values
const STOCK_PRICE_RANGES: Record<string, { minPrice: number; maxQtyAsPrice: number }> = {
  'AMZN': { minPrice: 100, maxQtyAsPrice: 10 },
  'GOOGL': { minPrice: 100, maxQtyAsPrice: 10 },
  'META': { minPrice: 200, maxQtyAsPrice: 5 },
  'ADBE': { minPrice: 200, maxQtyAsPrice: 5 },
  'NFLX': { minPrice: 80, maxQtyAsPrice: 20 },
  'MELI': { minPrice: 800, maxQtyAsPrice: 1 },
  'ASML': { minPrice: 400, maxQtyAsPrice: 2 },
  'CRM': { minPrice: 150, maxQtyAsPrice: 10 },
  'MA': { minPrice: 300, maxQtyAsPrice: 3 },
  'DUOL': { minPrice: 100, maxQtyAsPrice: 5 },
  'CELH': { minPrice: 20, maxQtyAsPrice: 20 },
  'PYPL': { minPrice: 35, maxQtyAsPrice: 20 },
  'AMD': { minPrice: 70, maxQtyAsPrice: 10 },
  'TXRH': { minPrice: 80, maxQtyAsPrice: 10 },
  'NKE': { minPrice: 40, maxQtyAsPrice: 20 },
  'SOFI': { minPrice: 12, maxQtyAsPrice: 20 },
};

// Check if price/quantity values are likely swapped and fix if needed
function fixSwappedValues(symbol: string, price: number, quantity: number): { price: number; quantity: number } {
  const stockInfo = STOCK_PRICE_RANGES[symbol];
  if (!stockInfo) return { price, quantity };
  
  const absPrice = Math.abs(price);
  const absQty = Math.abs(quantity);
  
  // If price is way below minimum AND quantity looks like a stock price, swap them
  const priceIsTooLow = absPrice < stockInfo.minPrice * 0.5;
  const qtyLooksLikePrice = absQty >= stockInfo.minPrice * 0.5 && absQty > stockInfo.maxQtyAsPrice;
  const qtyIsUnreasonablyHigh = absQty > 50 && absPrice < 20;
  
  if ((priceIsTooLow && qtyLooksLikePrice) || (priceIsTooLow && qtyIsUnreasonablyHigh)) {
    // Swap the values, preserving signs
    return {
      price: absQty,
      quantity: price < 0 ? -absPrice : absPrice,
    };
  }
  
  return { price, quantity };
}

function generateTransactionId(t: Transaction): string {
  // Format: YYYYMMDD-SYMBOL-ACTION-PRICE-QUANTITY
  const dateClean = t.date.replace(/-/g, '');
  const symbol = t.symbol || 'CASH';
  const price = t.price.toFixed(2);
  const qty = Math.abs(t.quantity).toFixed(4);
  return `${dateClean}-${symbol}-${t.action}-${price}-${qty}`;
}

function parseHistoryFile(
  content: string,
  detection: FileDetectionResult,
  accountNumber: string
): Transaction[] {
  const transactions: Transaction[] = [];
  const lines = content.split('\n');
  
  for (let i = detection.headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Skip footer/disclaimer lines
    if (line.startsWith('"The data') || 
        line.startsWith('"informational') ||
        line.startsWith('"Brokerage') ||
        line.startsWith('"Financial') ||
        line.startsWith('"Fidelity') ||
        line.startsWith('Date downloaded')) {
      continue;
    }
    
    const fields = parseCSVLine(line);
    if (fields.length < 13) continue;
    
    // Extract fields based on column order
    let quantity: number, price: number;
    if (detection.columnOrder === 'history') {
      // History file: Price at 5, Quantity at 6
      price = parseNumber(fields[5]);
      quantity = parseNumber(fields[6]);
    } else {
      // transactions.csv: Quantity at 5, Price at 6
      quantity = parseNumber(fields[5]);
      price = parseNumber(fields[6]);
    }
    
    const rawAction = fields[1] || '';
    const action = normalizeAction(rawAction);
    const symbol = fields[2] || '';
    
    // Fix swapped price/quantity values for known stocks
    if ((action === 'BUY' || action === 'SELL') && symbol) {
      const fixed = fixSwappedValues(symbol, price, quantity);
      price = fixed.price;
      quantity = action === 'SELL' ? -Math.abs(fixed.quantity) : Math.abs(fixed.quantity);
    }
    
    // Parse date
    const dateStr = formatDateFromString(fields[0]);
    const settlementDateStr = fields[12] ? formatDateFromString(fields[12]) : undefined;
    
    const transaction: Transaction = {
      id: '', // Will be set after
      date: dateStr,
      settlementDate: settlementDateStr,
      action,
      symbol,
      description: fields[3] || '',
      quantity,
      price,
      amount: parseNumber(fields[10]),
      type: normalizeAccountType(fields[4] || 'Margin'),
      commission: parseNumber(fields[7]) || undefined,
      fees: parseNumber(fields[8]) || undefined,
      rawAction,
    };
    
    transaction.id = generateTransactionId(transaction);
    transactions.push(transaction);
  }
  
  return transactions;
}

// =============================================================================
// Position Parsing
// =============================================================================

function parsePositionsFile(
  content: string,
  detection: FileDetectionResult
): { accountNumber: string; accountName: string; snapshot: PositionSnapshot } {
  const positions: Position[] = [];
  const lines = content.split('\n');
  let accountNumber = detection.accountNumber;
  let accountName = detection.accountName;
  let snapshotDate = formatDateISO(new Date());
  
  // Try to extract date from filename (e.g., "Portfolio_Positions_2026-01-10.csv")
  const dateMatch = content.match(/(\d{4}-\d{2}-\d{2})|([A-Z][a-z]+-\d{2}-\d{4})/);
  if (dateMatch) {
    snapshotDate = formatDateFromString(dateMatch[0]);
  }
  
  for (let i = detection.headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Skip footer/disclaimer lines
    if (line.startsWith('"The data') || 
        line.startsWith('"informational') ||
        line.startsWith('"Brokerage') ||
        line.startsWith('"Financial') ||
        line.startsWith('"Fidelity') ||
        line.startsWith('Date downloaded')) {
      continue;
    }
    
    const fields = parseCSVLine(line);
    if (fields.length < 10) continue;
    
    // Skip non-position rows (like "Pending activity")
    if (!fields[2] || fields[2] === 'Pending activity') continue;
    
    // Skip money market (SPAXX**)
    if (fields[2].includes('SPAXX')) continue;
    
    // Extract account info from first valid row
    if (!accountNumber) {
      accountNumber = fields[0];
      accountName = fields[1];
    }
    
    const position: Position = {
      symbol: fields[2],
      description: fields[3] || '',
      quantity: parseNumber(fields[4]),
      currentValue: parseNumber(fields[7]),
      lastPrice: parseNumber(fields[5]),
      lastPriceChange: parseNumber(fields[6]),
      todayGainLoss: parseNumber(fields[8]),
      todayGainLossPercent: parseNumber(fields[9]),
      costBasis: parseNumber(fields[13]),
      avgCostBasis: parseNumber(fields[14]),
      totalGainLoss: parseNumber(fields[10]),
      totalGainLossPercent: parseNumber(fields[11]),
      percentOfAccount: parseNumber(fields[12]),
      type: normalizeAccountType(fields[15] || 'Margin'),
    };
    
    if (position.quantity > 0) {
      positions.push(position);
    }
  }
  
  // Calculate total value
  const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
  
  return {
    accountNumber,
    accountName,
    snapshot: {
      date: snapshotDate,
      totalValue,
      positions,
    },
  };
}

// =============================================================================
// Data Loading/Saving
// =============================================================================

function loadTransactionsData(): TransactionsData {
  if (fs.existsSync(TRANSACTIONS_JSON)) {
    const content = fs.readFileSync(TRANSACTIONS_JSON, 'utf-8');
    return JSON.parse(content);
  }
  
  return {
    version: SCHEMA_VERSION,
    lastUpdated: new Date().toISOString(),
    accounts: {},
  };
}

function saveTransactionsData(data: TransactionsData): void {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(TRANSACTIONS_JSON, JSON.stringify(data, null, 2));
}

function loadPositionsData(): PositionsData {
  if (fs.existsSync(POSITIONS_JSON)) {
    const content = fs.readFileSync(POSITIONS_JSON, 'utf-8');
    return JSON.parse(content);
  }
  
  return {
    version: SCHEMA_VERSION,
    lastUpdated: new Date().toISOString(),
    snapshots: {},
  };
}

function savePositionsData(data: PositionsData): void {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(POSITIONS_JSON, JSON.stringify(data, null, 2));
}

// =============================================================================
// Merge Logic
// =============================================================================

function mergeTransactions(
  existing: TransactionsData,
  accountNumber: string,
  accountName: string,
  broker: string,
  newTransactions: Transaction[]
): { added: number; skipped: number } {
  // Initialize account if needed
  if (!existing.accounts[accountNumber]) {
    existing.accounts[accountNumber] = {
      name: accountName,
      broker,
      transactions: [],
    };
  }
  
  const account = existing.accounts[accountNumber];
  const existingIds = new Set(account.transactions.map(t => t.id));
  
  let added = 0;
  let skipped = 0;
  
  for (const t of newTransactions) {
    if (!existingIds.has(t.id)) {
      account.transactions.push(t);
      existingIds.add(t.id);
      added++;
    } else {
      skipped++;
    }
  }
  
  // Sort by date descending (newest first)
  account.transactions.sort((a, b) => b.date.localeCompare(a.date));
  
  return { added, skipped };
}

function mergePositions(
  existing: PositionsData,
  accountNumber: string,
  accountName: string,
  broker: string,
  snapshot: PositionSnapshot
): { added: boolean; skipped: boolean } {
  // Initialize account if needed
  if (!existing.snapshots[accountNumber]) {
    existing.snapshots[accountNumber] = {
      name: accountName,
      broker,
      history: [],
    };
  }
  
  const account = existing.snapshots[accountNumber];
  
  // Check if snapshot for this date already exists
  const existingIndex = account.history.findIndex(h => h.date === snapshot.date);
  
  if (existingIndex >= 0) {
    // Replace existing snapshot with new data
    account.history[existingIndex] = snapshot;
    return { added: false, skipped: true };
  }
  
  // Add new snapshot
  account.history.push(snapshot);
  
  // Sort by date descending (newest first)
  account.history.sort((a, b) => b.date.localeCompare(a.date));
  
  return { added: true, skipped: false };
}

// =============================================================================
// File Processing
// =============================================================================

function processFile(filePath: string): ImportResult {
  const filename = path.basename(filePath);
  console.log(`\nProcessing: ${filename}`);
  
  const result: ImportResult = {
    success: false,
    fileType: 'history',
    accountNumber: '',
    accountName: '',
    recordsProcessed: 0,
    recordsAdded: 0,
    recordsSkipped: 0,
    errors: [],
  };
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const detection = detectFileType(content, filename);
    
    if (detection.type === 'unknown') {
      result.errors.push('Could not detect file type');
      return result;
    }
    
    result.fileType = detection.type;
    result.accountNumber = detection.accountNumber;
    result.accountName = detection.accountName;
    
    if (detection.type === 'history') {
      // Process transaction history
      const transactions = parseHistoryFile(content, detection, detection.accountNumber);
      result.recordsProcessed = transactions.length;
      
      const existingData = loadTransactionsData();
      const accountNumber = detection.accountNumber || 'UNKNOWN';
      const accountName = detection.accountName || 'Unknown Account';
      
      const mergeResult = mergeTransactions(
        existingData,
        accountNumber,
        accountName,
        'Fidelity',
        transactions
      );
      
      result.recordsAdded = mergeResult.added;
      result.recordsSkipped = mergeResult.skipped;
      result.accountNumber = accountNumber;
      
      saveTransactionsData(existingData);
      result.success = true;
      
      console.log(`  Type: History/Transactions`);
      console.log(`  Account: ${accountNumber} (${accountName})`);
      console.log(`  Processed: ${result.recordsProcessed}, Added: ${result.recordsAdded}, Skipped: ${result.recordsSkipped}`);
      
    } else if (detection.type === 'positions') {
      // Process positions snapshot
      const { accountNumber, accountName, snapshot } = parsePositionsFile(content, detection);
      result.recordsProcessed = snapshot.positions.length;
      result.accountNumber = accountNumber;
      result.accountName = accountName;
      
      const existingData = loadPositionsData();
      const mergeResult = mergePositions(
        existingData,
        accountNumber,
        accountName,
        'Fidelity',
        snapshot
      );
      
      result.recordsAdded = mergeResult.added ? snapshot.positions.length : 0;
      result.recordsSkipped = mergeResult.skipped ? snapshot.positions.length : 0;
      
      savePositionsData(existingData);
      result.success = true;
      
      console.log(`  Type: Positions Snapshot`);
      console.log(`  Account: ${accountNumber} (${accountName})`);
      console.log(`  Date: ${snapshot.date}`);
      console.log(`  Positions: ${snapshot.positions.length}, Total Value: $${snapshot.totalValue?.toFixed(2)}`);
    }
    
  } catch (error) {
    result.errors.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`  Error: ${result.errors[0]}`);
  }
  
  return result;
}

// =============================================================================
// Migration from existing CSV files
// =============================================================================

function migrateExistingData(): void {
  console.log('='.repeat(60));
  console.log('Migrating existing CSV data to JSON format');
  console.log('='.repeat(60));
  
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const results: ImportResult[] = [];
  
  // Process existing transactions.csv
  const transactionsCSV = path.join(PUBLIC_DIR, 'transactions.csv');
  if (fs.existsSync(transactionsCSV)) {
    console.log('\n--- Migrating transactions.csv ---');
    const result = processFile(transactionsCSV);
    results.push(result);
  }
  
  // Process transactions (1).csv if exists
  const transactions1CSV = path.join(PUBLIC_DIR, 'transactions (1).csv');
  if (fs.existsSync(transactions1CSV)) {
    console.log('\n--- Migrating transactions (1).csv ---');
    const result = processFile(transactions1CSV);
    results.push(result);
  }
  
  // Process any History files
  const historyFiles = fs.readdirSync(PUBLIC_DIR).filter(f => 
    f.startsWith('History_for_Account') && f.endsWith('.csv')
  );
  
  for (const historyFile of historyFiles) {
    console.log(`\n--- Migrating ${historyFile} ---`);
    const result = processFile(path.join(PUBLIC_DIR, historyFile));
    results.push(result);
  }
  
  // Process any Position files
  const positionFiles = fs.readdirSync(PUBLIC_DIR).filter(f => 
    f.startsWith('Portfolio_Positions') && f.endsWith('.csv')
  );
  
  for (const posFile of positionFiles) {
    console.log(`\n--- Migrating ${posFile} ---`);
    const result = processFile(path.join(PUBLIC_DIR, posFile));
    results.push(result);
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  const totalRecords = results.reduce((sum, r) => sum + r.recordsAdded, 0);
  
  console.log(`Files processed: ${results.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Total records added: ${totalRecords}`);
  
  // Show final data stats
  const transData = loadTransactionsData();
  const posData = loadPositionsData();
  
  console.log(`\nTransactions JSON:`);
  for (const [accountNum, account] of Object.entries(transData.accounts)) {
    console.log(`  ${accountNum} (${account.name}): ${account.transactions.length} transactions`);
  }
  
  console.log(`\nPositions JSON:`);
  for (const [accountNum, account] of Object.entries(posData.snapshots)) {
    console.log(`  ${accountNum} (${account.name}): ${account.history.length} snapshots`);
  }
}

// =============================================================================
// Main
// =============================================================================

function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--migrate')) {
    migrateExistingData();
    return;
  }
  
  if (args.includes('--help')) {
    console.log(`
Unified Data Merge Script

Usage:
  npx ts-node scripts/mergeData.ts [files...]
  npx ts-node scripts/mergeData.ts --migrate

Options:
  --migrate    Migrate all existing CSV files to JSON format
  --help       Show this help message

Examples:
  npx ts-node scripts/mergeData.ts public/History_for_Account_Z25424500.csv
  npx ts-node scripts/mergeData.ts public/Portfolio_Positions_2026-01-10.csv
  npx ts-node scripts/mergeData.ts --migrate
`);
    return;
  }
  
  // Process specified files
  for (const arg of args) {
    if (arg.startsWith('--')) continue;
    
    const filePath = path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg);
    if (fs.existsSync(filePath)) {
      processFile(filePath);
    } else {
      console.error(`File not found: ${filePath}`);
    }
  }
}

main();
