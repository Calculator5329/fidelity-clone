/**
 * Import Fidelity CSV Files
 * 
 * Unified script to import multi-account Fidelity CSV exports (Positions and History),
 * de-duplicate records, and update transactions.json and positions.json.
 * 
 * Supports:
 * - Portfolio_Positions_*.csv (positions snapshot)
 * - Accounts_History*.csv (multi-account transaction history)
 * - History_for_Account_*.csv (single-account transaction history)
 * 
 * Usage:
 *   npx ts-node scripts/importFidelityCSV.ts <file1.csv> [file2.csv] ...
 *   npx ts-node scripts/importFidelityCSV.ts ~/Downloads/Portfolio_Positions_Jan-20-2026.csv
 *   npx ts-node scripts/importFidelityCSV.ts ~/Downloads/Accounts_History*.csv
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
} from '../src/types/portfolio';

// =============================================================================
// Constants
// =============================================================================

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const TRANSACTIONS_JSON = path.join(DATA_DIR, 'transactions.json');
const POSITIONS_JSON = path.join(DATA_DIR, 'positions.json');
const SCHEMA_VERSION = '1.0';

// Account number to name mapping
const ACCOUNT_NAMES: Record<string, string> = {
  'Z25424500': 'Growth Portfolio',
  '244509266': 'ROTH IRA',
  'Z25426285': 'YOLO Portfolio',
  'Z24468360': 'Index Portfolio',
  'Z27316070': 'Yield Portfolio',
};

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
  // Try MM/DD/YYYY format first
  const date = parseDateMMDDYYYY(dateStr);
  if (date) {
    return formatDateISO(date);
  }
  
  // Try "Jan-20-2026" format
  const monthNames: Record<string, number> = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };
  
  const match = dateStr.match(/([A-Z][a-z]{2})-(\d{2})-(\d{4})/);
  if (match) {
    const month = monthNames[match[1]];
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    if (month !== undefined) {
      return formatDateISO(new Date(year, month, day));
    }
  }
  
  // Try parsing other formats
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return formatDateISO(parsed);
  }
  
  return dateStr;
}

// Extract date from filename like "Portfolio_Positions_Jan-20-2026.csv"
function extractDateFromFilename(filename: string): string {
  // Try "Jan-20-2026" format
  const monthMatch = filename.match(/([A-Z][a-z]{2})-(\d{2})-(\d{4})/);
  if (monthMatch) {
    return formatDateFromString(monthMatch[0]);
  }
  
  // Try "2026-01-20" format
  const isoMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }
  
  // Default to today
  return formatDateISO(new Date());
}

// =============================================================================
// File Type Detection
// =============================================================================

type FileType = 'positions' | 'history-multi' | 'history-single' | 'unknown';

interface FileDetectionResult {
  type: FileType;
  headerIndex: number;
  headers: string[];
}

function detectFileType(content: string): FileDetectionResult {
  const lines = content.split('\n');
  
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const fields = parseCSVLine(line);
    
    // Position file: starts with "Account Number"
    if (fields[0] === 'Account Number') {
      return {
        type: 'positions',
        headerIndex: i,
        headers: fields,
      };
    }
    
    // Multi-account history: "Run Date,Account,Account Number,Action,..."
    if (fields[0] === 'Run Date' && fields[1] === 'Account' && fields[2] === 'Account Number') {
      return {
        type: 'history-multi',
        headerIndex: i,
        headers: fields,
      };
    }
    
    // Single-account history: "Run Date,Action,Symbol,..."
    if (fields[0] === 'Run Date' && fields[1] === 'Action') {
      return {
        type: 'history-single',
        headerIndex: i,
        headers: fields,
      };
    }
  }
  
  return {
    type: 'unknown',
    headerIndex: -1,
    headers: [],
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
  if (upper.includes('CASH CONTRIBUTION')) return 'DEPOSIT';
  
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
// Transaction ID Generation
// =============================================================================

function generateTransactionId(t: {
  date: string;
  symbol: string;
  action: TransactionAction;
  price: number;
  quantity: number;
}): string {
  const dateClean = t.date.replace(/-/g, '');
  const symbol = t.symbol || 'CASH';
  const price = t.price.toFixed(2);
  const qty = Math.abs(t.quantity).toFixed(4);
  return `${dateClean}-${symbol}-${t.action}-${price}-${qty}`;
}

// =============================================================================
// Multi-Account History Parsing
// =============================================================================

interface ParsedTransaction {
  accountNumber: string;
  accountName: string;
  transaction: Transaction;
}

function parseMultiAccountHistory(content: string, detection: FileDetectionResult): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const lines = content.split('\n');
  
  for (let i = detection.headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Skip footer/disclaimer lines
    if (isFooterLine(line)) continue;
    
    const fields = parseCSVLine(line);
    if (fields.length < 14) continue;
    
    // Multi-account format columns:
    // 0: Run Date, 1: Account, 2: Account Number, 3: Action, 4: Symbol, 
    // 5: Description, 6: Type, 7: Price ($), 8: Quantity, 9: Commission ($),
    // 10: Fees ($), 11: Accrued Interest ($), 12: Amount ($), 13: Settlement Date
    
    const runDate = fields[0];
    if (!runDate || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(runDate)) continue;
    
    const accountName = fields[1] || '';
    const accountNumber = fields[2] || '';
    const rawAction = fields[3] || '';
    const symbol = fields[4] || '';
    const description = fields[5] || '';
    const type = fields[6] || '';
    const price = parseNumber(fields[7]);
    const quantity = parseNumber(fields[8]);
    const commission = parseNumber(fields[9]);
    const fees = parseNumber(fields[10]);
    const amount = parseNumber(fields[12]);
    const settlementDate = fields[13] || '';
    
    const action = normalizeAction(rawAction);
    const dateISO = formatDateFromString(runDate);
    const settlementDateISO = settlementDate ? formatDateFromString(settlementDate) : undefined;
    
    // Adjust quantity sign for sells
    const adjustedQuantity = action === 'SELL' ? -Math.abs(quantity) : quantity;
    
    const transaction: Transaction = {
      id: '', // Will be set below
      date: dateISO,
      settlementDate: settlementDateISO,
      action,
      symbol,
      description,
      quantity: adjustedQuantity,
      price,
      amount,
      type: normalizeAccountType(type),
      commission: commission || undefined,
      fees: fees || undefined,
      rawAction,
    };
    
    transaction.id = generateTransactionId(transaction);
    
    results.push({
      accountNumber,
      accountName,
      transaction,
    });
  }
  
  return results;
}

// =============================================================================
// Single-Account History Parsing
// =============================================================================

function parseSingleAccountHistory(
  content: string,
  detection: FileDetectionResult,
  filename: string
): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const lines = content.split('\n');
  
  // Try to extract account number from filename
  const accountMatch = filename.match(/Account[_\s]([A-Z]?\d+)/i);
  const accountNumber = accountMatch ? accountMatch[1] : 'UNKNOWN';
  const accountName = ACCOUNT_NAMES[accountNumber] || 'Unknown Account';
  
  // Detect column order: check if Price is at index 5 or 6
  const isPriceFirst = detection.headers[5] === 'Price ($)';
  
  for (let i = detection.headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (isFooterLine(line)) continue;
    
    const fields = parseCSVLine(line);
    if (fields.length < 13) continue;
    
    const runDate = fields[0];
    if (!runDate || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(runDate)) continue;
    
    // Single-account format columns (varies based on source):
    // 0: Run Date, 1: Action, 2: Symbol, 3: Description, 4: Type,
    // 5: Price/Quantity, 6: Quantity/Price, 7: Commission, 8: Fees, 
    // 9: Accrued Interest, 10: Amount, 11: Cash Balance, 12: Settlement Date
    
    const rawAction = fields[1] || '';
    const symbol = fields[2] || '';
    const description = fields[3] || '';
    const type = fields[4] || '';
    
    let price: number, quantity: number;
    if (isPriceFirst) {
      price = parseNumber(fields[5]);
      quantity = parseNumber(fields[6]);
    } else {
      quantity = parseNumber(fields[5]);
      price = parseNumber(fields[6]);
    }
    
    const commission = parseNumber(fields[7]);
    const fees = parseNumber(fields[8]);
    const amount = parseNumber(fields[10]);
    const settlementDate = fields[12] || '';
    
    const action = normalizeAction(rawAction);
    const dateISO = formatDateFromString(runDate);
    const settlementDateISO = settlementDate ? formatDateFromString(settlementDate) : undefined;
    
    const adjustedQuantity = action === 'SELL' ? -Math.abs(quantity) : quantity;
    
    const transaction: Transaction = {
      id: '',
      date: dateISO,
      settlementDate: settlementDateISO,
      action,
      symbol,
      description,
      quantity: adjustedQuantity,
      price,
      amount,
      type: normalizeAccountType(type),
      commission: commission || undefined,
      fees: fees || undefined,
      rawAction,
    };
    
    transaction.id = generateTransactionId(transaction);
    
    results.push({
      accountNumber,
      accountName,
      transaction,
    });
  }
  
  return results;
}

// =============================================================================
// Positions Parsing
// =============================================================================

interface ParsedPositionSnapshot {
  accountNumber: string;
  accountName: string;
  snapshot: PositionSnapshot;
}

function parsePositionsFile(content: string, detection: FileDetectionResult, filename: string): ParsedPositionSnapshot[] {
  const lines = content.split('\n');
  const snapshotDate = extractDateFromFilename(filename);
  
  // Group positions by account
  const accountPositions: Map<string, { name: string; positions: Position[] }> = new Map();
  
  for (let i = detection.headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (isFooterLine(line)) continue;
    
    const fields = parseCSVLine(line);
    if (fields.length < 10) continue;
    
    // Positions format columns:
    // 0: Account Number, 1: Account Name, 2: Symbol, 3: Description, 4: Quantity,
    // 5: Last Price, 6: Last Price Change, 7: Current Value, 8: Today's Gain/Loss $,
    // 9: Today's Gain/Loss %, 10: Total Gain/Loss $, 11: Total Gain/Loss %,
    // 12: % of Account, 13: Cost Basis Total, 14: Average Cost Basis, 15: Type
    
    const accountNumber = fields[0] || '';
    const accountName = fields[1] || '';
    const symbol = fields[2] || '';
    
    // Skip non-position rows
    if (!symbol || symbol === 'Pending activity' || symbol.includes('**')) continue;
    
    const quantity = parseNumber(fields[4]);
    if (quantity <= 0) continue;
    
    const position: Position = {
      symbol,
      description: fields[3] || '',
      quantity,
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
    
    if (!accountPositions.has(accountNumber)) {
      accountPositions.set(accountNumber, { name: accountName, positions: [] });
    }
    accountPositions.get(accountNumber)!.positions.push(position);
  }
  
  // Convert to snapshots
  const results: ParsedPositionSnapshot[] = [];
  
  for (const [accountNumber, data] of accountPositions) {
    const totalValue = data.positions.reduce((sum, p) => sum + p.currentValue, 0);
    
    results.push({
      accountNumber,
      accountName: data.name,
      snapshot: {
        date: snapshotDate,
        totalValue,
        positions: data.positions,
      },
    });
  }
  
  return results;
}

// =============================================================================
// Footer Detection
// =============================================================================

function isFooterLine(line: string): boolean {
  return line.startsWith('"The data') ||
         line.startsWith('"informational') ||
         line.startsWith('"recommendation') ||
         line.startsWith('"exported') ||
         line.startsWith('"purposes') ||
         line.startsWith('"Brokerage') ||
         line.startsWith('"Financial') ||
         line.startsWith('"Fidelity') ||
         line.startsWith('Date downloaded') ||
         line.startsWith('The data');
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

interface MergeStats {
  transactionsAdded: number;
  transactionsSkipped: number;
  positionsAdded: number;
  positionsUpdated: number;
  accountsAffected: Set<string>;
}

function mergeTransactions(
  existingData: TransactionsData,
  parsedTransactions: ParsedTransaction[]
): MergeStats {
  const stats: MergeStats = {
    transactionsAdded: 0,
    transactionsSkipped: 0,
    positionsAdded: 0,
    positionsUpdated: 0,
    accountsAffected: new Set(),
  };
  
  for (const parsed of parsedTransactions) {
    const { accountNumber, accountName, transaction } = parsed;
    
    // Initialize account if needed
    if (!existingData.accounts[accountNumber]) {
      existingData.accounts[accountNumber] = {
        name: accountName || ACCOUNT_NAMES[accountNumber] || 'Unknown Account',
        broker: 'Fidelity',
        transactions: [],
      };
    }
    
    const account = existingData.accounts[accountNumber];
    const existingIds = new Set(account.transactions.map(t => t.id));
    
    if (!existingIds.has(transaction.id)) {
      account.transactions.push(transaction);
      stats.transactionsAdded++;
      stats.accountsAffected.add(accountNumber);
    } else {
      stats.transactionsSkipped++;
    }
  }
  
  // Sort transactions by date descending for each account
  for (const accountNumber of stats.accountsAffected) {
    existingData.accounts[accountNumber].transactions.sort(
      (a, b) => b.date.localeCompare(a.date)
    );
  }
  
  return stats;
}

function mergePositions(
  existingData: PositionsData,
  parsedSnapshots: ParsedPositionSnapshot[]
): MergeStats {
  const stats: MergeStats = {
    transactionsAdded: 0,
    transactionsSkipped: 0,
    positionsAdded: 0,
    positionsUpdated: 0,
    accountsAffected: new Set(),
  };
  
  for (const parsed of parsedSnapshots) {
    const { accountNumber, accountName, snapshot } = parsed;
    
    // Initialize account if needed
    if (!existingData.snapshots[accountNumber]) {
      existingData.snapshots[accountNumber] = {
        name: accountName || ACCOUNT_NAMES[accountNumber] || 'Unknown Account',
        broker: 'Fidelity',
        history: [],
      };
    }
    
    const account = existingData.snapshots[accountNumber];
    const existingIndex = account.history.findIndex(h => h.date === snapshot.date);
    
    if (existingIndex >= 0) {
      // Replace existing snapshot
      account.history[existingIndex] = snapshot;
      stats.positionsUpdated++;
    } else {
      // Add new snapshot
      account.history.push(snapshot);
      stats.positionsAdded++;
    }
    
    stats.accountsAffected.add(accountNumber);
    
    // Sort history by date descending
    account.history.sort((a, b) => b.date.localeCompare(a.date));
  }
  
  return stats;
}

// =============================================================================
// File Processing
// =============================================================================

interface ProcessResult {
  filename: string;
  fileType: FileType;
  transactionsAdded: number;
  transactionsSkipped: number;
  positionsAdded: number;
  positionsUpdated: number;
  accountsAffected: string[];
  error?: string;
}

function processFile(filePath: string): ProcessResult {
  const filename = path.basename(filePath);
  const result: ProcessResult = {
    filename,
    fileType: 'unknown',
    transactionsAdded: 0,
    transactionsSkipped: 0,
    positionsAdded: 0,
    positionsUpdated: 0,
    accountsAffected: [],
  };
  
  try {
    console.log(`\nProcessing: ${filename}`);
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const detection = detectFileType(content);
    
    if (detection.type === 'unknown') {
      result.error = 'Could not detect file type';
      console.log(`  Error: ${result.error}`);
      return result;
    }
    
    result.fileType = detection.type;
    console.log(`  Type: ${detection.type}`);
    
    if (detection.type === 'positions') {
      // Process positions file
      const parsedSnapshots = parsePositionsFile(content, detection, filename);
      console.log(`  Parsed ${parsedSnapshots.length} account snapshots`);
      
      const existingData = loadPositionsData();
      const stats = mergePositions(existingData, parsedSnapshots);
      savePositionsData(existingData);
      
      result.positionsAdded = stats.positionsAdded;
      result.positionsUpdated = stats.positionsUpdated;
      result.accountsAffected = [...stats.accountsAffected];
      
      console.log(`  Positions: ${stats.positionsAdded} added, ${stats.positionsUpdated} updated`);
      
    } else if (detection.type === 'history-multi' || detection.type === 'history-single') {
      // Process history/transactions file
      let parsedTransactions: ParsedTransaction[];
      
      if (detection.type === 'history-multi') {
        parsedTransactions = parseMultiAccountHistory(content, detection);
      } else {
        parsedTransactions = parseSingleAccountHistory(content, detection, filename);
      }
      
      console.log(`  Parsed ${parsedTransactions.length} transactions`);
      
      const existingData = loadTransactionsData();
      const stats = mergeTransactions(existingData, parsedTransactions);
      saveTransactionsData(existingData);
      
      result.transactionsAdded = stats.transactionsAdded;
      result.transactionsSkipped = stats.transactionsSkipped;
      result.accountsAffected = [...stats.accountsAffected];
      
      console.log(`  Transactions: ${stats.transactionsAdded} added, ${stats.transactionsSkipped} duplicates skipped`);
    }
    
    if (result.accountsAffected.length > 0) {
      console.log(`  Accounts: ${result.accountsAffected.map(a => ACCOUNT_NAMES[a] || a).join(', ')}`);
    }
    
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`  Error: ${result.error}`);
  }
  
  return result;
}

// =============================================================================
// Main
// =============================================================================

function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Fidelity CSV Import Tool

Usage:
  npx ts-node scripts/importFidelityCSV.ts <file1.csv> [file2.csv] ...

Supported file types:
  - Portfolio_Positions_*.csv  (positions snapshot)
  - Accounts_History*.csv      (multi-account transaction history)
  - History_for_Account_*.csv  (single-account transaction history)

Examples:
  npx ts-node scripts/importFidelityCSV.ts ~/Downloads/Portfolio_Positions_Jan-20-2026.csv
  npx ts-node scripts/importFidelityCSV.ts "~/Downloads/Accounts_History (9).csv"
  npx ts-node scripts/importFidelityCSV.ts file1.csv file2.csv file3.csv

Features:
  - Auto-detects file type (positions vs history) and format
  - De-duplicates transactions based on date/symbol/action/price/quantity
  - Merges with existing data in transactions.json and positions.json
  - Supports multi-account files with automatic routing
`);
    return;
  }
  
  console.log('='.repeat(60));
  console.log('Fidelity CSV Import');
  console.log('='.repeat(60));
  
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const results: ProcessResult[] = [];
  
  for (const arg of args) {
    // Handle paths with spaces (wrapped in quotes) and expand home directory
    let filePath = arg.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '');
    filePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (fs.existsSync(filePath)) {
      const result = processFile(filePath);
      results.push(result);
    } else {
      console.error(`\nFile not found: ${filePath}`);
      results.push({
        filename: path.basename(arg),
        fileType: 'unknown',
        transactionsAdded: 0,
        transactionsSkipped: 0,
        positionsAdded: 0,
        positionsUpdated: 0,
        accountsAffected: [],
        error: 'File not found',
      });
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Import Summary');
  console.log('='.repeat(60));
  
  const totalTransactionsAdded = results.reduce((sum, r) => sum + r.transactionsAdded, 0);
  const totalTransactionsSkipped = results.reduce((sum, r) => sum + r.transactionsSkipped, 0);
  const totalPositionsAdded = results.reduce((sum, r) => sum + r.positionsAdded, 0);
  const totalPositionsUpdated = results.reduce((sum, r) => sum + r.positionsUpdated, 0);
  const successCount = results.filter(r => !r.error).length;
  const allAccounts = new Set(results.flatMap(r => r.accountsAffected));
  
  console.log(`Files processed: ${results.length} (${successCount} successful)`);
  console.log(`Transactions: ${totalTransactionsAdded} added, ${totalTransactionsSkipped} duplicates skipped`);
  console.log(`Positions: ${totalPositionsAdded} snapshots added, ${totalPositionsUpdated} updated`);
  console.log(`Accounts affected: ${allAccounts.size}`);
  
  if (allAccounts.size > 0) {
    console.log(`\nAccount Details:`);
    for (const accountNum of allAccounts) {
      const name = ACCOUNT_NAMES[accountNum] || 'Unknown';
      console.log(`  - ${accountNum}: ${name}`);
    }
  }
  
  // Show current data stats
  const transData = loadTransactionsData();
  const posData = loadPositionsData();
  
  console.log(`\nCurrent Data:`);
  console.log(`Transactions JSON:`);
  for (const [accountNum, account] of Object.entries(transData.accounts)) {
    console.log(`  ${accountNum} (${account.name}): ${account.transactions.length} transactions`);
  }
  
  console.log(`Positions JSON:`);
  for (const [accountNum, account] of Object.entries(posData.snapshots)) {
    console.log(`  ${accountNum} (${account.name}): ${account.history.length} snapshots`);
  }
}

main();
