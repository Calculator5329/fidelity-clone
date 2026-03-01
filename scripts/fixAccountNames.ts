/**
 * Fix account names in transactions.json after migration
 * - Assigns proper account names
 * - Moves UNKNOWN transactions to Z25424500 (Growth Portfolio)
 */

import * as fs from 'fs';
import * as path from 'path';

const TRANSACTIONS_JSON = path.join(process.cwd(), 'public', 'data', 'transactions.json');

// Account name mapping
const ACCOUNT_NAMES: Record<string, string> = {
  'Z25424500': 'Growth Portfolio',
  'Z24468360': 'Index Portfolio',
  'Z27316070': 'Yield Portfolio',
  '244509266': 'ROTH IRA',
  'Z25426285': 'YOLO Portfolio',
};

function main() {
  console.log('Fixing account names in transactions.json...\n');
  
  const content = fs.readFileSync(TRANSACTIONS_JSON, 'utf-8');
  const data = JSON.parse(content);
  
  // Fix account names
  for (const [accountNum, account] of Object.entries(data.accounts)) {
    const typedAccount = account as { name: string; transactions: unknown[] };
    if (ACCOUNT_NAMES[accountNum]) {
      console.log(`  ${accountNum}: "${typedAccount.name}" -> "${ACCOUNT_NAMES[accountNum]}"`);
      typedAccount.name = ACCOUNT_NAMES[accountNum];
    }
  }
  
  // Move UNKNOWN transactions to Z25424500 (Growth Portfolio)
  if (data.accounts['UNKNOWN']) {
    const unknownTransactions = data.accounts['UNKNOWN'].transactions;
    console.log(`\n  Moving ${unknownTransactions.length} transactions from UNKNOWN to Z25424500`);
    
    if (!data.accounts['Z25424500']) {
      data.accounts['Z25424500'] = {
        name: 'Growth Portfolio',
        broker: 'Fidelity',
        transactions: [],
      };
    }
    
    // Merge transactions and dedupe by ID
    const existingIds = new Set(data.accounts['Z25424500'].transactions.map((t: { id: string }) => t.id));
    let added = 0;
    
    for (const t of unknownTransactions) {
      if (!existingIds.has(t.id)) {
        data.accounts['Z25424500'].transactions.push(t);
        existingIds.add(t.id);
        added++;
      }
    }
    
    console.log(`  Added ${added} new transactions to Growth Portfolio`);
    
    // Sort by date descending
    data.accounts['Z25424500'].transactions.sort((a: { date: string }, b: { date: string }) => 
      b.date.localeCompare(a.date)
    );
    
    // Remove UNKNOWN account
    delete data.accounts['UNKNOWN'];
  }
  
  // Update timestamp
  data.lastUpdated = new Date().toISOString();
  
  // Save
  fs.writeFileSync(TRANSACTIONS_JSON, JSON.stringify(data, null, 2));
  
  console.log('\n✓ Transactions JSON updated successfully');
  
  // Print summary
  console.log('\nFinal account summary:');
  for (const [accountNum, account] of Object.entries(data.accounts)) {
    const typedAccount = account as { name: string; transactions: unknown[] };
    console.log(`  ${accountNum} (${typedAccount.name}): ${typedAccount.transactions.length} transactions`);
  }
}

main();
