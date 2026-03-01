/**
 * Normalize Old Transaction Format
 * 
 * Converts old-format transactions (with empty Action fields) to the 
 * standard Fidelity format with proper "YOU BOUGHT" / "YOU SOLD" actions.
 */

import * as fs from 'fs';
import * as path from 'path';

// Symbol to company name mapping
const SYMBOL_NAMES: Record<string, string> = {
  'META': 'META PLATFORMS INC CLASS A COMMON STOCK',
  'GOOGL': 'ALPHABET INC CAP STK CL A',
  'AMZN': 'AMAZON.COM INC',
  'PYPL': 'PAYPAL HLDGS INC COM',
  'TSLA': 'TESLA INC COM',
  'ADBE': 'ADOBE INC COM',
  'AMD': 'ADVANCED MICRO DEVICES INC',
  'NKE': 'NIKE INC CLASS B COM NPV',
  'CRM': 'SALESFORCE INC COM',
  'MELI': 'MERCADOLIBRE INC COM USD0.001',
  'DUOL': 'DUOLINGO INC CL A COM',
  'CELH': 'CELSIUS HLDGS INC COM NEW',
  'MA': 'MASTERCARD INCORPORATED CL A',
  'ASML': 'ASML HOLDING NV EUR0.09 NY REGISTRY SHS',
  'TXRH': 'TEXAS ROADHOUSE INC',
  'SOFI': 'SOFI TECHNOLOGIES INC COM',
  'NICE': 'NICE LTD ADR-EACH CNV INTO 1 ORD ILS1',
  'NVO': 'NOVO NORDISK A/S ADR-EACH CNV INTO 1 CL',
  'COUR': 'COURSERA INC COM',
  'BABA': 'ALIBABA GROUP HOLDING LTD SPON ADS EACH',
  'WIX': 'WIX.COM LTD COM ILS0.01',
  'PINS': 'PINTEREST INC CL A',
  'DBX': 'DROPBOX, INC. CLASS A COMMON STOCK',
  'CRSR': 'CORSAIR GAMING INC COM',
  'CRCT': 'CRICUT INC COM CL A',
  'RVLV': 'REVOLVE GROUP INC CL A',
  'SNBR': 'SLEEP NUMBER CORP COM',
  'SWKS': 'SKYWORKS SOLUTIONS INC',
  'SMLR': 'SEMLER SCIENTIFIC INC COM USD0.001',
  'OLPX': 'OLAPLEX HLDGS INC COM',
  'TIXT': 'TELUS INTERNATIONAL (CDA) INC COM NPV S',
  'TTCFQ': 'TATTOOED CHEF INC COM CL A',
  '87975H100': 'TELUS INTERNATIONAL (CDA) INC COM NPV S',
  '00507V109': 'ACTIVISION BLIZZARD INC COM',
};

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

// Parse date in various formats
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    return new Date(year, month - 1, day);
  }
  
  return null;
}

// Read and normalize transactions
function normalizeTransactions() {
  console.log('Normalizing old transaction formats...\n');
  
  const publicDir = path.join(process.cwd(), 'public');
  const transactionsPath = path.join(publicDir, 'transactions.csv');
  
  const content = fs.readFileSync(transactionsPath, 'utf-8');
  const lines = content.split('\n');
  
  const normalizedLines: string[] = [];
  let headerFound = false;
  let normalizedCount = 0;
  let totalCount = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const fields = parseCSVLine(trimmed);
    
    // Keep header as is
    if (fields[0] === 'Run Date') {
      normalizedLines.push(trimmed);
      headerFound = true;
      continue;
    }
    
    if (!headerFound) continue;
    if (fields.length < 13) continue;
    
    totalCount++;
    
    // Check if this is an old-format entry (empty Action field)
    const action = fields[1];
    const symbol = fields[2];
    
    if (!action && symbol) {
      // Old format - needs normalization
      // Fields: Run Date, Action(empty), Symbol, Description(empty), Type(empty), Quantity, Price, Commission, Fees, Accrued Interest, Amount, Cash Balance, Settlement Date
      
      const quantity = parseFloat(fields[5]) || 0;
      const amount = parseFloat(fields[10]) || 0;
      
      // Determine if buy or sell based on amount (negative = buy, positive = sell)
      const isBuy = amount < 0;
      const companyName = SYMBOL_NAMES[symbol] || symbol;
      const actionType = isBuy ? 'Cash' : 'Cash'; // Default to Cash for old entries
      
      const newAction = isBuy 
        ? `YOU BOUGHT ${companyName} (${symbol}) (${actionType})`
        : `YOU SOLD ${companyName} (${symbol}) (${actionType})`;
      
      // Build normalized transaction
      const normalizedFields = [
        fields[0],  // Run Date
        newAction,  // Action
        symbol,     // Symbol
        companyName, // Description
        actionType, // Type
        fields[5],  // Quantity
        fields[6],  // Price
        fields[7],  // Commission
        fields[8],  // Fees
        fields[9],  // Accrued Interest
        fields[10], // Amount
        fields[11], // Cash Balance
        fields[12], // Settlement Date
      ];
      
      // Escape fields that might contain commas
      const escapedFields = normalizedFields.map(field => {
        if (field && (field.includes(',') || field.includes('"'))) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      });
      
      normalizedLines.push(escapedFields.join(','));
      normalizedCount++;
    } else {
      // Already in new format - keep as is
      normalizedLines.push(trimmed);
    }
  }
  
  // Write output
  fs.writeFileSync(transactionsPath, normalizedLines.join('\n'));
  
  console.log(`Total transactions: ${totalCount}`);
  console.log(`Normalized: ${normalizedCount} old-format entries`);
  console.log(`Already formatted: ${totalCount - normalizedCount} entries`);
  console.log(`\n✓ Written ${normalizedLines.length - 1} transactions to transactions.csv`);
}

normalizeTransactions();
