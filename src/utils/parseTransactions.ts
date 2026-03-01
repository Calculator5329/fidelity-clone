import Papa from 'papaparse';
import type { 
  TransactionsData, 
  PositionsData,
  Transaction as NewTransaction,
  Position as NewPosition,
  PositionSnapshot
} from '../types/portfolio';

export interface Transaction {
  runDate: string;
  action: string;
  symbol: string;
  description: string;
  type: string;
  price: number;
  quantity: number;
  commission: number;
  fees: number;
  accruedInterest: number;
  amount: number;
  cashBalance: number | string;
  settlementDate: string;
}

export interface Position {
  symbol: string;
  description: string;
  quantity: number;
  costBasis: number;
  averageCost: number;
  lastPrice?: number;
  lastPriceChange?: number;
  currentValue?: number;
  todayGainDollar?: number;
  todayGainPercent?: number;
  totalGainDollar?: number;
  totalGainPercent?: number;
  percentOfAccount?: number;
  type?: string;
}

export interface PortfolioData {
  positions: Position[];
  totalCostBasis: number;
  transactions: Transaction[];
}

// ============================================================
// New JSON Data Loaders
// ============================================================

/**
 * Load transactions from the new unified JSON format
 */
export async function loadTransactionsJSON(accountId?: string): Promise<TransactionsData | null> {
  try {
    const response = await fetch('/data/transactions.json');
    if (!response.ok) return null;
    const data: TransactionsData = await response.json();
    return data;
  } catch (error) {
    console.warn('Error loading transactions.json:', error);
    return null;
  }
}

/**
 * Load positions from the new unified JSON format
 */
export async function loadPositionsJSON(): Promise<PositionsData | null> {
  try {
    const response = await fetch('/data/positions.json');
    if (!response.ok) return null;
    const data: PositionsData = await response.json();
    return data;
  } catch (error) {
    console.warn('Error loading positions.json:', error);
    return null;
  }
}

/**
 * Get latest position snapshot for an account
 */
export function getLatestPositions(
  positionsData: PositionsData, 
  accountId: string
): PositionSnapshot | null {
  const account = positionsData.snapshots[accountId];
  if (!account || account.history.length === 0) return null;
  return account.history[0]; // History is sorted newest first
}

/**
 * Convert new Transaction format to legacy format for compatibility
 */
export function convertToLegacyTransaction(tx: NewTransaction): Transaction {
  // Convert YYYY-MM-DD to MM/DD/YYYY
  const [year, month, day] = tx.date.split('-');
  const runDate = `${month}/${day}/${year}`;
  
  let settlementDate = '';
  if (tx.settlementDate) {
    const [sYear, sMonth, sDay] = tx.settlementDate.split('-');
    settlementDate = `${sMonth}/${sDay}/${sYear}`;
  }
  
  return {
    runDate,
    action: tx.rawAction || `YOU ${tx.action === 'BUY' ? 'BOUGHT' : tx.action === 'SELL' ? 'SOLD' : tx.action} ${tx.description} (${tx.symbol})`,
    symbol: tx.symbol,
    description: tx.description,
    type: tx.type,
    price: tx.price,
    quantity: tx.quantity,
    commission: tx.commission || 0,
    fees: tx.fees || 0,
    accruedInterest: 0,
    amount: tx.amount,
    cashBalance: 0,
    settlementDate,
  };
}

/**
 * Convert new Position format to legacy format for compatibility
 */
export function convertToLegacyPosition(pos: NewPosition): Position {
  return {
    symbol: pos.symbol,
    description: pos.description,
    quantity: pos.quantity,
    costBasis: pos.costBasis,
    averageCost: pos.avgCostBasis,
    lastPrice: pos.lastPrice,
    lastPriceChange: pos.lastPriceChange,
    currentValue: pos.currentValue,
    todayGainDollar: pos.todayGainLoss,
    todayGainPercent: pos.todayGainLossPercent,
    totalGainDollar: pos.totalGainLoss,
    totalGainPercent: pos.totalGainLossPercent,
    percentOfAccount: pos.percentOfAccount,
    type: pos.type,
  };
}

/**
 * Load portfolio data from new JSON format, with fallback to CSV
 */
export async function loadPortfolioDataFromJSON(accountId: string = 'Z25424500'): Promise<PortfolioData | null> {
  try {
    // Try loading from JSON first
    const [transactionsData, positionsData] = await Promise.all([
      loadTransactionsJSON(),
      loadPositionsJSON()
    ]);
    
    if (!transactionsData || !positionsData) {
      console.warn('JSON data not available, will need CSV fallback');
      return null;
    }
    
    // Get account data
    const accountTxData = transactionsData.accounts[accountId];
    const latestSnapshot = getLatestPositions(positionsData, accountId);
    
    if (!accountTxData || !latestSnapshot) {
      console.warn(`Account ${accountId} not found in JSON data`);
      return null;
    }
    
    // Convert to legacy format
    const transactions = accountTxData.transactions.map(convertToLegacyTransaction);
    const positions = latestSnapshot.positions.map(convertToLegacyPosition);
    const totalCostBasis = positions.reduce((sum, p) => sum + p.costBasis, 0);
    
    return {
      positions,
      totalCostBasis,
      transactions,
    };
  } catch (error) {
    console.error('Error loading from JSON:', error);
    return null;
  }
}

/**
 * Load portfolio data for ALL accounts combined
 */
export async function loadAllAccountsData(): Promise<PortfolioData | null> {
  try {
    const [transactionsData, positionsData] = await Promise.all([
      loadTransactionsJSON(),
      loadPositionsJSON()
    ]);
    
    if (!transactionsData || !positionsData) {
      console.warn('JSON data not available for all accounts');
      return null;
    }
    
    // Aggregate all positions from all accounts
    const allPositions: Position[] = [];
    const allTransactions: Transaction[] = [];
    
    // Get positions from each account's latest snapshot
    for (const [accountId, accountData] of Object.entries(positionsData.snapshots)) {
      const latestSnapshot = accountData.history[0]; // History sorted newest first
      if (latestSnapshot) {
        for (const pos of latestSnapshot.positions) {
          // Check if we already have this symbol - if so, aggregate
          const existingPos = allPositions.find(p => p.symbol === pos.symbol);
          if (existingPos) {
            // Aggregate quantities and cost basis
            const totalQuantity = existingPos.quantity + pos.quantity;
            const totalCostBasis = existingPos.costBasis + pos.costBasis;
            const totalCurrentValue = (existingPos.currentValue || 0) + pos.currentValue;
            const totalTodayGain = (existingPos.todayGainDollar || 0) + (pos.todayGainLoss || 0);
            const totalGain = (existingPos.totalGainDollar || 0) + (pos.totalGainLoss || 0);
            
            existingPos.quantity = totalQuantity;
            existingPos.costBasis = totalCostBasis;
            existingPos.averageCost = totalQuantity > 0 ? totalCostBasis / totalQuantity : 0;
            existingPos.currentValue = totalCurrentValue;
            existingPos.todayGainDollar = totalTodayGain;
            existingPos.totalGainDollar = totalGain;
            // Recalculate percentages
            existingPos.todayGainPercent = totalCurrentValue > 0 ? (totalTodayGain / (totalCurrentValue - totalTodayGain)) * 100 : 0;
            existingPos.totalGainPercent = totalCostBasis > 0 ? (totalGain / totalCostBasis) * 100 : 0;
          } else {
            allPositions.push(convertToLegacyPosition(pos));
          }
        }
      }
    }
    
    // Get transactions from all accounts
    for (const [accountId, accountData] of Object.entries(transactionsData.accounts)) {
      for (const tx of accountData.transactions) {
        allTransactions.push(convertToLegacyTransaction(tx));
      }
    }
    
    // Sort transactions by date descending
    allTransactions.sort((a, b) => {
      const dateA = new Date(a.runDate.split('/').reverse().join('-'));
      const dateB = new Date(b.runDate.split('/').reverse().join('-'));
      return dateB.getTime() - dateA.getTime();
    });
    
    // Recalculate percent of account for aggregated positions
    const totalValue = allPositions.reduce((sum, p) => sum + (p.currentValue || 0), 0);
    for (const pos of allPositions) {
      pos.percentOfAccount = totalValue > 0 ? ((pos.currentValue || 0) / totalValue) * 100 : 0;
    }
    
    // Sort positions by current value descending
    allPositions.sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
    
    const totalCostBasis = allPositions.reduce((sum, p) => sum + p.costBasis, 0);
    
    return {
      positions: allPositions,
      totalCostBasis,
      transactions: allTransactions,
    };
  } catch (error) {
    console.error('Error loading all accounts data:', error);
    return null;
  }
}

/**
 * Get list of available accounts from JSON data
 */
export async function getAvailableAccounts(): Promise<{ id: string; name: string; broker: string }[]> {
  try {
    const [transactionsData, positionsData] = await Promise.all([
      loadTransactionsJSON(),
      loadPositionsJSON()
    ]);
    
    const accounts = new Map<string, { id: string; name: string; broker: string }>();
    
    if (transactionsData) {
      for (const [id, account] of Object.entries(transactionsData.accounts)) {
        accounts.set(id, { id, name: account.name, broker: account.broker });
      }
    }
    
    if (positionsData) {
      for (const [id, account] of Object.entries(positionsData.snapshots)) {
        if (!accounts.has(id)) {
          accounts.set(id, { id, name: account.name, broker: account.broker });
        } else {
          // Update with position data (might have better name)
          const existing = accounts.get(id)!;
          if (account.name && account.name !== 'Unknown Account') {
            existing.name = account.name;
          }
        }
      }
    }
    
    return Array.from(accounts.values());
  } catch (error) {
    console.warn('Error getting available accounts:', error);
    return [];
  }
}

/**
 * Parse a Fidelity positions CSV file directly
 */
export async function parsePositionsCSV(csvPath: string): Promise<Position[]> {
  const response = await fetch(csvPath);
  const csvText = await response.text();
  
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(csvText, {
      complete: (results) => {
        const positions: Position[] = [];
        const rows = results.data;
        
        // Find the header row
        let headerIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i][0] === 'Account Number') {
            headerIndex = i;
            break;
          }
        }
        
        if (headerIndex === -1) {
          reject(new Error('Could not find header row'));
          return;
        }
        
        // Parse data rows
        for (let i = headerIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 15 || !row[2]) continue;
          
          // Skip disclaimer rows and non-stock entries
          if (row[0]?.startsWith('The data') || row[0]?.startsWith('Brokerage') || row[0]?.startsWith('Date downloaded')) {
            continue;
          }
          
          const symbol = row[2]?.trim();
          
          // Skip pending activity and money market
          if (!symbol || symbol === 'Pending activity' || symbol.includes('**')) continue;
          
          // Helper to parse currency values (remove $ and + signs)
          const parseCurrency = (val: string | undefined): number => {
            if (!val) return 0;
            return parseFloat(val.replace(/[$+,]/g, '')) || 0;
          };
          
          // Helper to parse percentage values
          const parsePercent = (val: string | undefined): number => {
            if (!val) return 0;
            return parseFloat(val.replace(/[%+,]/g, '')) || 0;
          };
          
          const quantity = parseFloat(row[4]) || 0;
          if (quantity <= 0) continue;
          
          positions.push({
            symbol,
            description: row[3]?.trim() || '',
            quantity,
            lastPrice: parseCurrency(row[5]),
            lastPriceChange: parseCurrency(row[6]),
            currentValue: parseCurrency(row[7]),
            todayGainDollar: parseCurrency(row[8]),
            todayGainPercent: parsePercent(row[9]),
            totalGainDollar: parseCurrency(row[10]),
            totalGainPercent: parsePercent(row[11]),
            percentOfAccount: parsePercent(row[12]),
            costBasis: parseCurrency(row[13]),
            averageCost: parseCurrency(row[14]),
            type: row[15]?.trim() || '',
          });
        }
        
        resolve(positions);
      },
      error: (error) => reject(error),
    });
  });
}

export async function parseCSV(csvPath: string): Promise<Transaction[]> {
  const response = await fetch(csvPath);
  const csvText = await response.text();
  
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(csvText, {
      complete: (results) => {
        const transactions: Transaction[] = [];
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
          reject(new Error('Could not find header row'));
          return;
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
          // Accept both M/D/YYYY and MM/DD/YYYY formats
          if (!runDate || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(runDate)) continue;
          
          transactions.push({
            runDate,
            action: row[1]?.trim() || '',
            symbol: row[2]?.trim() || '',
            description: row[3]?.trim() || '',
            type: row[4]?.trim() || '',
            quantity: parseFloat(row[5]) || 0,
            price: parseFloat(row[6]) || 0,
            commission: parseFloat(row[7]) || 0,
            fees: parseFloat(row[8]) || 0,
            accruedInterest: parseFloat(row[9]) || 0,
            amount: parseFloat(row[10]) || 0,
            cashBalance: row[11]?.trim() === 'Processing' ? 'Processing' : (parseFloat(row[11]) || 0),
            settlementDate: row[12]?.trim() || '',
          });
        }
        
        resolve(transactions);
      },
      error: (error) => reject(error),
    });
  });
}

export function aggregatePositions(transactions: Transaction[]): PortfolioData {
  const positionMap = new Map<string, { quantity: number; totalCost: number; description: string }>();
  
  // Symbols to exclude (money market, etc.)
  const excludeSymbols = new Set(['SPAXX', '']);
  
  for (const tx of transactions) {
    if (excludeSymbols.has(tx.symbol)) continue;
    
    const action = tx.action.toUpperCase();
    const isBuy = action.includes('YOU BOUGHT');
    const isSell = action.includes('YOU SOLD');
    
    if (!isBuy && !isSell) continue;
    
    const symbol = tx.symbol;
    const existing = positionMap.get(symbol) || { quantity: 0, totalCost: 0, description: tx.description };
    
    if (isBuy) {
      existing.quantity += tx.quantity;
      existing.totalCost += Math.abs(tx.amount);
    } else if (isSell) {
      // For sells, reduce quantity and proportionally reduce cost basis
      const sellQuantity = Math.abs(tx.quantity);
      if (existing.quantity > 0) {
        const avgCost = existing.totalCost / existing.quantity;
        existing.quantity -= sellQuantity;
        existing.totalCost = existing.quantity * avgCost;
      }
    }
    
    existing.description = tx.description;
    positionMap.set(symbol, existing);
  }
  
  const positions: Position[] = [];
  let totalCostBasis = 0;
  
  for (const [symbol, data] of positionMap.entries()) {
    if (data.quantity > 0.001) { // Only include positions with meaningful quantity
      const costBasis = data.totalCost;
      positions.push({
        symbol,
        description: data.description,
        quantity: data.quantity,
        costBasis,
        averageCost: costBasis / data.quantity,
      });
      totalCostBasis += costBasis;
    }
  }
  
  // Sort by symbol
  positions.sort((a, b) => a.symbol.localeCompare(b.symbol));
  
  return {
    positions,
    totalCostBasis,
    transactions,
  };
}

// Actual monthly TWRR (Time-Weighted Rate of Return) data from Fidelity
const monthlyTWRRData: { month: string; return: number }[] = [
  { month: '2023-01', return: 1.65 },
  { month: '2023-02', return: 2.51 },
  { month: '2023-03', return: 8.16 },
  { month: '2023-04', return: -2.52 },
  { month: '2023-05', return: 6.44 },
  { month: '2023-06', return: 9.73 },
  { month: '2023-07', return: 7.18 },
  { month: '2023-08', return: -7.22 },
  { month: '2023-09', return: -3.35 },
  { month: '2023-10', return: -3.72 },
  { month: '2023-11', return: 6.36 },
  { month: '2023-12', return: 8.02 },
  { month: '2024-01', return: 0.59 },
  { month: '2024-02', return: 14.62 },
  { month: '2024-03', return: 0.40 },
  { month: '2024-04', return: -3.91 },
  { month: '2024-05', return: 4.56 },
  { month: '2024-06', return: 3.43 },
  { month: '2024-07', return: 0.62 },
  { month: '2024-08', return: 2.44 },
  { month: '2024-09', return: 9.09 },
  { month: '2024-10', return: 0.30 },
  { month: '2024-11', return: 9.68 },
  { month: '2024-12', return: 3.42 },
  { month: '2025-01', return: 8.07 },
  { month: '2025-02', return: -11.53 },
  { month: '2025-03', return: -11.37 },
  { month: '2025-04', return: -1.23 },
  { month: '2025-05', return: 14.39 },
  { month: '2025-06', return: 6.62 },
  { month: '2025-07', return: 2.98 },
  { month: '2025-08', return: -0.38 },
  { month: '2025-09', return: 3.33 },
  { month: '2025-10', return: 2.36 },
  { month: '2025-11', return: -0.57 },
  { month: '2025-12', return: -1.04 },
];

// Current portfolio value (end of Dec 2025)
const CURRENT_VALUE = 61694.25;

/**
 * Load pre-generated daily portfolio values from JSON file
 * This provides accurate daily values calculated from actual holdings × prices
 */
export async function loadDailyPortfolioValues(): Promise<{ date: string; value: number }[]> {
  try {
    const response = await fetch('/data/daily_portfolio_values.json');
    if (!response.ok) {
      console.warn('Daily portfolio values not found, falling back to monthly data');
      return [];
    }
    const data = await response.json();
    return data as { date: string; value: number }[];
  } catch (error) {
    console.warn('Error loading daily portfolio values:', error);
    return [];
  }
}

/**
 * Generate historical data - tries daily data first, falls back to monthly TWRR
 */
export async function generateHistoricalDataAsync(): Promise<{ date: string; value: number }[]> {
  // Try to load pre-generated daily data first
  const dailyData = await loadDailyPortfolioValues();
  if (dailyData.length > 0) {
    return dailyData;
  }
  
  // Fallback to monthly TWRR-based calculation
  return generateHistoricalData([]);
}

/**
 * Legacy synchronous function using monthly TWRR data
 * Used as fallback when daily data is not available
 */
export function generateHistoricalData(_transactions: Transaction[]): { date: string; value: number }[] {
  // Calculate historical values by working backwards from current value
  // If V_current = V_past * (1+r1) * (1+r2) * ... * (1+rn)
  // Then V_past = V_current / ((1+r1) * (1+r2) * ... * (1+rn))
  
  const result: { date: string; value: number }[] = [];
  
  // Start from current value and work backwards
  // For each month, calculate what the value was at the END of that month
  for (let i = 0; i < monthlyTWRRData.length; i++) {
    // Calculate cumulative return multiplier from month i to the end
    let cumulativeMultiplier = 1;
    for (let j = i; j < monthlyTWRRData.length; j++) {
      cumulativeMultiplier *= (1 + monthlyTWRRData[j].return / 100);
    }
    
    // The value at the END of month (i-1) / START of month i
    // is current value divided by cumulative return from month i onwards
    const valueAtStartOfMonth = CURRENT_VALUE / cumulativeMultiplier;
    
    result.push({
      date: monthlyTWRRData[i].month,
      value: valueAtStartOfMonth,
    });
  }
  
  // Add current value as the final point (end of Dec 2025 / start of Jan 2026)
  result.push({
    date: '2026-01',
    value: CURRENT_VALUE,
  });
  
  return result;
}

// ============================================================
// Closed Positions & Dividend Utilities
// ============================================================

export interface SellTransaction {
  date: string;        // MM/DD/YYYY format
  symbol: string;
  description: string;
  quantity: number;    // positive number
  salePrice: number;   // price per share
  proceeds: number;    // total amount received
  costBasis: number;   // estimated cost basis (avg cost * quantity)
  realizedGain: number;
  realizedGainPercent: number;
}

export interface DividendSummary {
  symbol: string;
  description: string;
  totalDividends: number;
  dividendCount: number;
  lastDividendAmount: number;
  lastDividendDate: string;
  estimatedAnnualDividend: number;
  dividendYield: number;  // requires current price
}

/**
 * Extract all sell transactions with realized gain/loss calculations
 * Calculates cost basis based on average cost at time of sale
 */
export function extractSellTransactions(
  transactions: Transaction[],
  year?: number
): SellTransaction[] {
  const sells: SellTransaction[] = [];
  
  // Build up position cost basis as we process transactions chronologically
  // We need to sort transactions by date first (oldest first)
  const sortedTx = [...transactions].sort((a, b) => {
    const dateA = new Date(a.runDate);
    const dateB = new Date(b.runDate);
    return dateA.getTime() - dateB.getTime();
  });
  
  // Track cost basis per symbol: { quantity, totalCost }
  const costBasisMap = new Map<string, { quantity: number; totalCost: number }>();
  
  for (const tx of sortedTx) {
    const action = tx.action.toUpperCase();
    const isBuy = action.includes('YOU BOUGHT');
    const isSell = action.includes('YOU SOLD');
    
    if (!tx.symbol || tx.symbol === 'SPAXX') continue;
    
    const existing = costBasisMap.get(tx.symbol) || { quantity: 0, totalCost: 0 };
    
    if (isBuy) {
      existing.quantity += tx.quantity;
      existing.totalCost += Math.abs(tx.amount);
      costBasisMap.set(tx.symbol, existing);
    } else if (isSell) {
      const sellQuantity = Math.abs(tx.quantity);
      const avgCost = existing.quantity > 0 ? existing.totalCost / existing.quantity : 0;
      const costBasis = avgCost * sellQuantity;
      const proceeds = Math.abs(tx.amount);
      const realizedGain = proceeds - costBasis;
      const realizedGainPercent = costBasis > 0 ? (realizedGain / costBasis) * 100 : 0;
      
      // Filter by year if specified
      const txYear = parseInt(tx.runDate.split('/')[2]);
      if (year && txYear !== year) {
        // Still update cost basis even if we don't include the sell in results
        existing.quantity -= sellQuantity;
        existing.totalCost = existing.quantity * avgCost;
        costBasisMap.set(tx.symbol, existing);
        continue;
      }
      
      sells.push({
        date: tx.runDate,
        symbol: tx.symbol,
        description: tx.description,
        quantity: sellQuantity,
        salePrice: tx.price,
        proceeds,
        costBasis,
        realizedGain,
        realizedGainPercent,
      });
      
      // Update position after sale
      existing.quantity -= sellQuantity;
      existing.totalCost = existing.quantity * avgCost;
      costBasisMap.set(tx.symbol, existing);
    }
  }
  
  // Sort by date descending (most recent first)
  sells.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });
  
  return sells;
}

/**
 * Get unique years that have sell transactions
 */
export function getSellTransactionYears(transactions: Transaction[]): number[] {
  const years = new Set<number>();
  
  for (const tx of transactions) {
    const action = tx.action.toUpperCase();
    if (action.includes('YOU SOLD') && tx.symbol && tx.symbol !== 'SPAXX') {
      const year = parseInt(tx.runDate.split('/')[2]);
      if (!isNaN(year)) {
        years.add(year);
      }
    }
  }
  
  return Array.from(years).sort((a, b) => b - a); // Most recent first
}

/**
 * Extract dividend data grouped by symbol
 */
export function extractDividendsBySymbol(
  transactions: Transaction[],
  positions: Position[]
): DividendSummary[] {
  // Group dividends by symbol
  const dividendMap = new Map<string, {
    symbol: string;
    description: string;
    dividends: { amount: number; date: string }[];
  }>();
  
  for (const tx of transactions) {
    const action = tx.action.toUpperCase();
    if (!action.includes('DIVIDEND RECEIVED')) continue;
    if (!tx.symbol || tx.symbol === 'SPAXX') continue;
    
    const existing = dividendMap.get(tx.symbol) || {
      symbol: tx.symbol,
      description: tx.description,
      dividends: [],
    };
    
    existing.dividends.push({
      amount: tx.amount,
      date: tx.runDate,
    });
    
    dividendMap.set(tx.symbol, existing);
  }
  
  // Create position price lookup
  const priceMap = new Map<string, number>();
  for (const pos of positions) {
    priceMap.set(pos.symbol, pos.lastPrice || 0);
  }
  
  // Calculate summaries
  const summaries: DividendSummary[] = [];
  
  for (const [symbol, data] of dividendMap.entries()) {
    // Sort dividends by date
    data.dividends.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });
    
    const totalDividends = data.dividends.reduce((sum, d) => sum + d.amount, 0);
    const lastDividend = data.dividends[0];
    
    // Estimate annual dividend based on history
    // Get dividends from the past 12 months
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const recentDividends = data.dividends.filter(d => {
      const divDate = new Date(d.date);
      return divDate >= oneYearAgo;
    });
    
    const estimatedAnnual = recentDividends.reduce((sum, d) => sum + d.amount, 0);
    
    // Calculate yield based on current price
    const currentPrice = priceMap.get(symbol) || 0;
    // Get quantity from positions
    const position = positions.find(p => p.symbol === symbol);
    const quantity = position?.quantity || 0;
    const positionValue = currentPrice * quantity;
    const dividendYield = positionValue > 0 ? (estimatedAnnual / positionValue) * 100 : 0;
    
    summaries.push({
      symbol,
      description: data.description,
      totalDividends,
      dividendCount: data.dividends.length,
      lastDividendAmount: lastDividend?.amount || 0,
      lastDividendDate: lastDividend?.date || '',
      estimatedAnnualDividend: estimatedAnnual,
      dividendYield,
    });
  }
  
  // Sort by total dividends descending
  summaries.sort((a, b) => b.totalDividends - a.totalDividends);
  
  return summaries;
}

// ============================================================
// VTI Comparison Utilities
// ============================================================

export interface Deposit {
  date: string;  // YYYY-MM-DD format
  amount: number;
}

export interface VTIPrice {
  date: string;
  price: number;
}

/**
 * Extract all capital inflows (deposits, stock transfers, cash transfers)
 * This captures all money/value that entered the account:
 * - Electronic Funds Transfer Received (cash deposits)
 * - TRANSFERRED FROM (stocks/cash transferred from another account)
 * 
 * Converts dates from MM/DD/YYYY to YYYY-MM-DD format
 */
export function extractDeposits(transactions: Transaction[]): Deposit[] {
  // Use a map to aggregate deposits by date
  const depositMap = new Map<string, number>();
  
  // Find the earliest transaction date (portfolio start date)
  let earliestDate = '9999-12-31';
  for (const tx of transactions) {
    const [month, day, year] = tx.runDate.split('/');
    const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    if (isoDate < earliestDate) {
      earliestDate = isoDate;
    }
  }
  
  // Collect explicit deposits and track earliest explicit deposit date
  let earliestExplicitDeposit = '9999-12-31';
  
  for (const tx of transactions) {
    const action = tx.action.toUpperCase();
    
    // Skip if amount is not positive (withdrawals, fees, purchases)
    if (tx.amount <= 0) continue;
    
    // Skip if this is an outgoing transfer (PAID, JOURNALED out, etc.)
    if (action.includes('PAID') || action.includes('JOURNALED')) continue;
    
    let isDeposit = false;
    
    // 1. Electronic Funds Transfer Received (cash deposits)
    if (action.includes('ELECTRONIC FUNDS TRANSFER RECEIVED')) {
      isDeposit = true;
    }
    
    // 2. Stock/asset transfers IN from another account
    if (action.includes('TRANSFERRED FROM')) {
      isDeposit = true;
    }
    
    if (isDeposit) {
      // Convert date from MM/DD/YYYY to YYYY-MM-DD
      const [month, day, year] = tx.runDate.split('/');
      const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      if (isoDate < earliestExplicitDeposit) {
        earliestExplicitDeposit = isoDate;
      }
      
      // Aggregate deposits on the same date
      const existing = depositMap.get(isoDate) || 0;
      depositMap.set(isoDate, existing + tx.amount);
    }
  }
  
  // Calculate initial deposit: sum of all BUY costs before the first explicit deposit
  // This represents the initial funding that wasn't captured as an explicit deposit
  let initialDeposit = 0;
  
  for (const tx of transactions) {
    const action = tx.action.toUpperCase();
    
    // Only look at BUY transactions (amount is negative for buys)
    if (!action.includes('BOUGHT') && !action.includes('BUY')) continue;
    if (tx.amount >= 0) continue;
    
    // Convert date from MM/DD/YYYY to YYYY-MM-DD
    const [month, day, year] = tx.runDate.split('/');
    const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    
    // Only count buys before the earliest explicit deposit
    if (earliestExplicitDeposit !== '9999-12-31' && isoDate >= earliestExplicitDeposit) continue;
    
    initialDeposit += Math.abs(tx.amount);
  }
  
  // Add the initial deposit as a single deposit on the portfolio start date
  if (initialDeposit > 0) {
    const existing = depositMap.get(earliestDate) || 0;
    depositMap.set(earliestDate, existing + initialDeposit);
  }
  
  // Convert map to sorted array
  const deposits: Deposit[] = Array.from(depositMap.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
  
  return deposits;
}

/**
 * Load VTI historical prices from JSON file
 */
export async function loadVTIPrices(): Promise<VTIPrice[]> {
  try {
    const response = await fetch('/data/vti_prices.json');
    if (!response.ok) {
      console.warn('VTI prices not found');
      return [];
    }
    const data = await response.json();
    return data as VTIPrice[];
  } catch (error) {
    console.warn('Error loading VTI prices:', error);
    return [];
  }
}

/**
 * Calculate hypothetical portfolio value if invested in VTI
 * Returns daily portfolio values based on VTI prices
 * 
 * The calculation starts with the portfolio's actual value at portfolioStartDate,
 * investing that amount in VTI. Then subsequent deposits (after the start date)
 * are added as VTI purchases.
 * 
 * For deposits made on non-trading days (weekends/holidays), the deposit
 * is invested at the next available trading day's price.
 */
export function calculateVTIPortfolioValues(
  deposits: Deposit[],
  vtiPrices: VTIPrice[],
  portfolioStartDate: string,
  portfolioStartValue: number
): { date: string; value: number }[] {
  if (vtiPrices.length === 0 || portfolioStartValue <= 0) {
    return [];
  }
  
  // Create a map of VTI prices by date for quick lookup
  const priceMap = new Map<string, number>();
  for (const p of vtiPrices) {
    priceMap.set(p.date, p.price);
  }
  
  // Find the VTI price on or after the portfolio start date
  let startIndex = vtiPrices.findIndex(p => p.date >= portfolioStartDate);
  if (startIndex === -1) return [];
  
  const startPrice = vtiPrices[startIndex].price;
  if (startPrice <= 0) return [];
  
  // Start with shares bought using the portfolio's starting value
  let totalShares = portfolioStartValue / startPrice;
  
  // Create a map of deposits by date, only including deposits AFTER the start date
  const depositMap = new Map<string, number>();
  for (const d of deposits) {
    // Only count deposits that occur after the portfolio start date
    if (d.date > portfolioStartDate) {
      const existing = depositMap.get(d.date) || 0;
      depositMap.set(d.date, existing + d.amount);
    }
  }
  
  // Find all deposit dates that don't have VTI prices (weekends/holidays)
  // and mark them to be invested on the next available trading day
  const sortedDepositDates = Array.from(depositMap.keys()).sort();
  for (const depositDate of sortedDepositDates) {
    if (!priceMap.has(depositDate)) {
      // Find the next trading day after this deposit date
      const nextTradingDay = vtiPrices.find(p => p.date > depositDate);
      if (nextTradingDay) {
        // Move this deposit to the next trading day
        const amount = depositMap.get(depositDate) || 0;
        const existing = depositMap.get(nextTradingDay.date) || 0;
        depositMap.set(nextTradingDay.date, existing + amount);
        depositMap.delete(depositDate);
      }
    }
  }
  
  // Calculate portfolio value for each date starting from the portfolio start
  const result: { date: string; value: number }[] = [];
  
  for (let i = startIndex; i < vtiPrices.length; i++) {
    const { date, price } = vtiPrices[i];
    
    // Check if there's a deposit on this date (only deposits after start date)
    const depositAmount = depositMap.get(date);
    if (depositAmount && price > 0) {
      // Buy VTI shares with the deposit
      const sharesBought = depositAmount / price;
      totalShares += sharesBought;
    }
    
    // Calculate current portfolio value
    const portfolioValue = totalShares * price;
    
    result.push({
      date,
      value: portfolioValue,
    });
  }
  
  return result;
}