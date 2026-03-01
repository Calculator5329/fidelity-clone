/**
 * Fix Swapped Price/Quantity Values in Transactions
 * 
 * This script scans transactions.json and fixes entries where the price and quantity
 * values were accidentally swapped during CSV import. 
 * 
 * Strategy:
 * 1. For duplicate entries (same date/symbol/amount), keep the one with reasonable price
 * 2. For single entries of known stocks, check if values look swapped
 * 3. Be conservative - only fix when we're confident
 * 
 * Usage:
 *   npx tsx scripts/fixSwappedTransactions.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Transaction, TransactionsData } from '../src/types/portfolio';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const TRANSACTIONS_JSON = path.join(DATA_DIR, 'transactions.json');

// Known stocks with typical price ranges
// If price is way below minPrice AND quantity is near or above minPrice, they're likely swapped
const STOCK_PRICES: Record<string, { minPrice: number; maxQtyAsPrice: number }> = {
  // High-priced stocks
  'AMZN': { minPrice: 100, maxQtyAsPrice: 10 },
  'GOOGL': { minPrice: 100, maxQtyAsPrice: 10 },
  'META': { minPrice: 200, maxQtyAsPrice: 5 },
  'ADBE': { minPrice: 200, maxQtyAsPrice: 5 },
  'NFLX': { minPrice: 80, maxQtyAsPrice: 20 },   // Netflix can be bought fractionally
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
  // Mid-priced stocks
  'SOFI': { minPrice: 12, maxQtyAsPrice: 20 },   // SoFi trades around $15-25
};

// Generate transaction ID from transaction data
function generateTransactionId(t: Transaction): string {
  const dateClean = t.date.replace(/-/g, '');
  const symbol = t.symbol || 'CASH';
  const price = t.price.toFixed(2);
  const qty = Math.abs(t.quantity).toFixed(4);
  return `${dateClean}-${symbol}-${t.action}-${price}-${qty}`;
}

// Check if values are likely swapped
function isLikelySwapped(symbol: string, price: number, quantity: number): boolean {
  const stockInfo = STOCK_PRICES[symbol];
  if (!stockInfo) return false;
  
  const absPrice = Math.abs(price);
  const absQty = Math.abs(quantity);
  
  // If price is below minimum expected AND quantity looks like a stock price
  const priceIsTooLow = absPrice < stockInfo.minPrice * 0.5;
  const qtyLooksLikePrice = absQty >= stockInfo.minPrice * 0.5 && absQty > stockInfo.maxQtyAsPrice;
  
  // Also check if quantity is unreasonably high for a normal purchase
  // (e.g., 88.89 shares when typical orders are 1-10)
  const qtyIsUnreasonablyHigh = absQty > 50 && absPrice < 20;
  
  return (priceIsTooLow && qtyLooksLikePrice) || (priceIsTooLow && qtyIsUnreasonablyHigh);
}

// Check if a price looks reasonable for a given symbol
function isPriceReasonable(symbol: string, price: number): boolean {
  const stockInfo = STOCK_PRICES[symbol];
  if (!stockInfo) return true; // Unknown stocks - assume reasonable
  
  return Math.abs(price) >= stockInfo.minPrice * 0.5;
}

function fixSwappedTransactions(): void {
  console.log('='.repeat(60));
  console.log('Fixing Swapped Price/Quantity Values in Transactions');
  console.log('='.repeat(60));
  
  // Load transactions data
  if (!fs.existsSync(TRANSACTIONS_JSON)) {
    console.error('transactions.json not found!');
    return;
  }
  
  const data: TransactionsData = JSON.parse(fs.readFileSync(TRANSACTIONS_JSON, 'utf-8'));
  
  let totalFixed = 0;
  let totalRemoved = 0;
  const fixedTransactions: string[] = [];
  const removedTransactions: string[] = [];
  
  for (const [accountNum, account] of Object.entries(data.accounts)) {
    console.log(`\nProcessing account: ${accountNum} (${account.name})`);
    
    const transactions = account.transactions;
    
    // Group transactions by (date, symbol, |amount|) to find duplicates
    const groups = new Map<string, Transaction[]>();
    
    for (const t of transactions) {
      const key = `${t.date}-${t.symbol}-${Math.abs(t.amount).toFixed(2)}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(t);
    }
    
    // Process each group
    const fixedTxns: Transaction[] = [];
    const seenIds = new Set<string>();
    
    for (const [_key, group] of groups) {
      // Handle non-BUY/SELL transactions - keep all
      const nonTradeGroup = group.filter(t => t.action !== 'BUY' && t.action !== 'SELL');
      const tradeGroup = group.filter(t => t.action === 'BUY' || t.action === 'SELL');
      
      for (const t of nonTradeGroup) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          fixedTxns.push(t);
        }
      }
      
      if (tradeGroup.length === 0) continue;
      
      if (tradeGroup.length === 1) {
        // Single transaction - check if it needs fixing
        const t = tradeGroup[0];
        
        if (isLikelySwapped(t.symbol, t.price, t.quantity)) {
          // Swap price and quantity
          const newPrice = Math.abs(t.quantity);
          const newQty = t.action === 'SELL' ? -Math.abs(t.price) : Math.abs(t.price);
          
          const fixedT: Transaction = {
            ...t,
            price: newPrice,
            quantity: newQty,
          };
          fixedT.id = generateTransactionId(fixedT);
          
          totalFixed++;
          fixedTransactions.push(
            `  ${t.symbol} ${t.date}: qty ${t.quantity.toFixed(2)} @ $${t.price.toFixed(2)} -> qty ${fixedT.quantity.toFixed(2)} @ $${fixedT.price.toFixed(2)}`
          );
          
          if (!seenIds.has(fixedT.id)) {
            seenIds.add(fixedT.id);
            fixedTxns.push(fixedT);
          }
        } else {
          // No fix needed
          if (!seenIds.has(t.id)) {
            seenIds.add(t.id);
            fixedTxns.push(t);
          }
        }
      } else {
        // Multiple transactions with same date/symbol/amount - find the best one
        const symbol = tradeGroup[0].symbol;
        const stockInfo = STOCK_PRICES[symbol];
        
        if (stockInfo) {
          // Find the transaction with the most reasonable price
          let bestTx: Transaction | null = null;
          
          for (const t of tradeGroup) {
            if (isPriceReasonable(t.symbol, t.price)) {
              if (!bestTx || Math.abs(t.price) > Math.abs(bestTx.price)) {
                bestTx = t;
              }
            }
          }
          
          if (bestTx) {
            if (!seenIds.has(bestTx.id)) {
              seenIds.add(bestTx.id);
              fixedTxns.push(bestTx);
            }
            
            // Mark others as removed
            for (const t of tradeGroup) {
              if (t.id !== bestTx.id) {
                totalRemoved++;
                removedTransactions.push(
                  `  ${t.symbol} ${t.date}: qty ${t.quantity} @ $${t.price} (kept: qty ${bestTx.quantity} @ $${bestTx.price})`
                );
              }
            }
          } else {
            // No transaction had reasonable price - try to fix the first one
            const t = tradeGroup[0];
            
            if (isLikelySwapped(t.symbol, t.price, t.quantity)) {
              const newPrice = Math.abs(t.quantity);
              const newQty = t.action === 'SELL' ? -Math.abs(t.price) : Math.abs(t.price);
              
              const fixedT: Transaction = {
                ...t,
                price: newPrice,
                quantity: newQty,
              };
              fixedT.id = generateTransactionId(fixedT);
              
              totalFixed++;
              fixedTransactions.push(
                `  ${t.symbol} ${t.date}: qty ${t.quantity.toFixed(2)} @ $${t.price.toFixed(2)} -> qty ${fixedT.quantity.toFixed(2)} @ $${fixedT.price.toFixed(2)}`
              );
              
              if (!seenIds.has(fixedT.id)) {
                seenIds.add(fixedT.id);
                fixedTxns.push(fixedT);
              }
              
              totalRemoved += tradeGroup.length - 1;
            } else {
              // Keep first one as-is
              if (!seenIds.has(t.id)) {
                seenIds.add(t.id);
                fixedTxns.push(t);
              }
              totalRemoved += tradeGroup.length - 1;
            }
          }
        } else {
          // Not a known stock - just keep the first transaction, remove duplicates
          const t = tradeGroup[0];
          if (!seenIds.has(t.id)) {
            seenIds.add(t.id);
            fixedTxns.push(t);
          }
          if (tradeGroup.length > 1) {
            totalRemoved += tradeGroup.length - 1;
          }
        }
      }
    }
    
    // Replace transactions with fixed ones
    account.transactions = fixedTxns;
    
    // Re-sort by date descending
    account.transactions.sort((a, b) => b.date.localeCompare(a.date));
  }
  
  // Save fixed data
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(TRANSACTIONS_JSON, JSON.stringify(data, null, 2));
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Transactions with swapped values fixed: ${totalFixed}`);
  console.log(`Duplicate/malformed transactions removed: ${totalRemoved}`);
  
  if (fixedTransactions.length > 0) {
    console.log('\nFixed transactions:');
    fixedTransactions.forEach(t => console.log(t));
  }
  
  if (removedTransactions.length > 0) {
    console.log('\nRemoved duplicates (kept correct version):');
    removedTransactions.slice(0, 30).forEach(t => console.log(t));
    if (removedTransactions.length > 30) {
      console.log(`  ... and ${removedTransactions.length - 30} more`);
    }
  }
  
  console.log('\n✓ Saved fixed transactions to transactions.json');
}

fixSwappedTransactions();
