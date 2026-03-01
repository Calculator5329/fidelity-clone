/**
 * Export Transactions JSON to CSV
 * 
 * Exports transactions from transactions.json to CSV format so that
 * the daily holdings generation scripts can use the latest data.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TransactionsData, Transaction } from '../src/types/portfolio';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const TRANSACTIONS_JSON = path.join(DATA_DIR, 'transactions.json');
const OUTPUT_CSV = path.join(PUBLIC_DIR, 'transactions.csv');

// Format date from YYYY-MM-DD to MM/DD/YYYY
function formatDateForCSV(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${month}/${day}/${year}`;
}

// Generate the action string for CSV export
function getActionString(tx: Transaction): string {
  if (tx.rawAction) return tx.rawAction;
  
  const symbol = tx.symbol || '';
  const desc = tx.description || symbol;
  const type = tx.type || 'Margin';
  
  switch (tx.action) {
    case 'BUY':
      return `YOU BOUGHT ${desc} (${symbol}) (${type})`;
    case 'SELL':
      return `YOU SOLD ${desc} (${symbol}) (${type})`;
    case 'DEPOSIT':
      return 'Electronic Funds Transfer Received (Cash)';
    case 'WITHDRAWAL':
      return 'Electronic Funds Transfer Paid (Cash)';
    case 'DIVIDEND':
      return `DIVIDEND RECEIVED ${desc} (${symbol}) (${type})`;
    case 'FEE':
      return `FEE CHARGED ${desc} (${symbol}) (${type})`;
    case 'REINVESTMENT':
      return `REINVESTMENT ${desc} (${symbol}) (${type})`;
    case 'TRANSFER':
      return `JOURNALED JNL VS A/C TYPES (${type})`;
    default:
      return tx.rawAction || tx.action;
  }
}

// Escape CSV field if needed
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function main(): void {
  console.log('Exporting transactions from JSON to CSV...\n');
  
  // Load transactions JSON
  if (!fs.existsSync(TRANSACTIONS_JSON)) {
    console.error('transactions.json not found!');
    process.exit(1);
  }
  
  const data: TransactionsData = JSON.parse(fs.readFileSync(TRANSACTIONS_JSON, 'utf-8'));
  
  // Collect all transactions from all accounts
  const allTransactions: Transaction[] = [];
  
  for (const [accountNumber, account] of Object.entries(data.accounts)) {
    console.log(`  ${accountNumber} (${account.name}): ${account.transactions.length} transactions`);
    allTransactions.push(...account.transactions);
  }
  
  // Sort by date descending
  allTransactions.sort((a, b) => b.date.localeCompare(a.date));
  
  // Remove duplicates (by ID)
  const seen = new Set<string>();
  const uniqueTransactions = allTransactions.filter(tx => {
    if (seen.has(tx.id)) return false;
    seen.add(tx.id);
    return true;
  });
  
  console.log(`\nTotal unique transactions: ${uniqueTransactions.length}`);
  
  // Generate CSV
  const header = 'Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date';
  
  const rows = uniqueTransactions.map(tx => {
    const runDate = formatDateForCSV(tx.date);
    const action = escapeCSV(getActionString(tx));
    const symbol = tx.symbol || '';
    const description = escapeCSV(tx.description || '');
    const type = tx.type || '';
    const quantity = tx.quantity.toString();
    const price = tx.price.toString();
    const commission = (tx.commission || 0).toString();
    const fees = (tx.fees || 0).toString();
    const accruedInterest = '0';
    const amount = tx.amount.toString();
    const cashBalance = '';
    const settlementDate = tx.settlementDate ? formatDateForCSV(tx.settlementDate) : '';
    
    return [runDate, action, symbol, description, type, quantity, price, commission, fees, accruedInterest, amount, cashBalance, settlementDate].join(',');
  });
  
  const csvContent = [header, ...rows].join('\n');
  
  // Write to file
  fs.writeFileSync(OUTPUT_CSV, csvContent);
  
  console.log(`\n✓ Exported ${uniqueTransactions.length} transactions to ${OUTPUT_CSV}`);
  
  // Show date range
  if (uniqueTransactions.length > 0) {
    const dates = uniqueTransactions.map(tx => tx.date).sort();
    console.log(`Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
  }
}

main();
