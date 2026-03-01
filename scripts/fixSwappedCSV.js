import fs from 'fs';

// Read the CSV file
const inputPath = './public/transactions (1).csv';
const content = fs.readFileSync(inputPath, 'utf8');
const lines = content.split('\n');

console.log('=== Fixing swapped quantity/price in transactions CSV ===\n');
console.log('Input file:', inputPath);
console.log('Total lines:', lines.length);

const fixedLines = [lines[0]]; // Keep header
let fixedCount = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) {
    fixedLines.push(line);
    continue;
  }
  
  const cols = line.split(',');
  if (cols.length < 7) {
    fixedLines.push(line);
    continue;
  }
  
  const symbol = cols[2];
  let qty = parseFloat(cols[5]) || 0;
  let price = parseFloat(cols[6]) || 0;
  
  // Skip non-stock transactions
  if (!symbol || qty === 0) {
    fixedLines.push(line);
    continue;
  }
  
  // Detect swapped values using multiple heuristics:
  // 1. Price < 5 and qty > 50 suggests swap
  // 2. For known high-priced stocks, if price is unreasonably low and qty looks like a price
  const highPricedStocks = ['NFLX', 'AMZN', 'GOOGL', 'META', 'ADBE', 'ASML', 'MELI', 'MA', 'CRM'];
  const isHighPricedStock = highPricedStocks.includes(symbol);
  
  // Check if values look swapped
  const basicSwap = price > 0 && price < 5 && qty > 50;
  const highStockSwap = isHighPricedStock && price > 0 && price < 20 && qty > 50;
  
  if (basicSwap || highStockSwap) {
    console.log(`Line ${i + 1}: Fixing ${symbol} - Qty=${qty} Price=${price} -> Qty=${price} Price=${qty}`);
    
    // Swap the values
    cols[5] = String(price);
    cols[6] = String(qty);
    fixedLines.push(cols.join(','));
    fixedCount++;
  } else {
    fixedLines.push(line);
  }
}

// Write the fixed CSV
const outputContent = fixedLines.join('\n');
fs.writeFileSync(inputPath, outputContent, 'utf8');

console.log('\n=== DONE ===');
console.log('Fixed', fixedCount, 'rows');
console.log('Output written to:', inputPath);
