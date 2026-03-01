import fs from 'fs';

// Read the CSV file
const content = fs.readFileSync('./public/transactions (1).csv', 'utf8');
const lines = content.split('\n');

console.log('=== Analyzing transactions (1).csv for swapped quantity/price ===\n');
console.log('Total lines:', lines.length);

const swappedRows = [];
const correctRows = [];

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  if (cols.length < 7) continue;
  
  const date = cols[0];
  const action = cols[1];
  const symbol = cols[2];
  const qty = parseFloat(cols[5]) || 0;
  const price = parseFloat(cols[6]) || 0;
  const amount = parseFloat(cols[10]) || 0;
  
  // Skip non-stock transactions
  if (!symbol || qty === 0) continue;
  
  // Detect swapped: price < 5 and qty > 50 suggests swap
  // Also check if qty looks like a stock price (> 50) and price looks like a quantity (< 5)
  if (price > 0 && price < 5 && qty > 50) {
    swappedRows.push({
      line: i + 1,
      date,
      action: action.substring(0, 40),
      symbol,
      qty,
      price,
      amount,
      correctedQty: price,
      correctedPrice: qty
    });
  } else if (price > 10) {
    correctRows.push({
      line: i + 1,
      date,
      symbol,
      qty,
      price
    });
  }
}

console.log('\n=== SWAPPED ROWS (price < $5, qty > 50) ===');
console.log('Found', swappedRows.length, 'potentially swapped rows:\n');

// Group by symbol
const bySymbol = {};
swappedRows.forEach(r => {
  if (!bySymbol[r.symbol]) bySymbol[r.symbol] = [];
  bySymbol[r.symbol].push(r);
});

Object.keys(bySymbol).sort().forEach(symbol => {
  const rows = bySymbol[symbol];
  console.log(`\n${symbol} (${rows.length} swapped rows):`);
  rows.slice(0, 5).forEach(r => {
    console.log(`  Line ${r.line}: Qty=${r.qty} Price=${r.price} -> Should be Qty=${r.correctedQty} Price=${r.correctedPrice}`);
  });
  if (rows.length > 5) console.log(`  ... and ${rows.length - 5} more`);
});

console.log('\n\n=== SUMMARY ===');
console.log('Total swapped rows:', swappedRows.length);
console.log('Symbols affected:', Object.keys(bySymbol).join(', '));
