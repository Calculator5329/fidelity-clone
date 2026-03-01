/**
 * Utilities for loading and working with daily portfolio snapshots
 */

import type { Transaction } from './parseTransactions';

// Portfolio start date - when actual portfolio tracking began (not just historical stock buys)
export const PORTFOLIO_START_DATE = '2023-01-30';

export interface SnapshotPosition {
  symbol: string;
  quantity: number;
  price: number;
  marketValue: number;
  allocation: number;
}

export interface DailySnapshot {
  date: string;
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  positions: SnapshotPosition[];
}

export interface PortfolioSnapshots {
  version: string;
  lastUpdated: string;
  dateRange: {
    start: string;
    end: string;
  };
  snapshots: DailySnapshot[];
}

let cachedSnapshots: PortfolioSnapshots | null = null;

/**
 * Load daily portfolio snapshots from JSON file
 * Results are cached after first load
 */
export async function loadDailySnapshots(): Promise<PortfolioSnapshots> {
  if (cachedSnapshots) {
    return cachedSnapshots;
  }

  try {
    const response = await fetch('/data/daily_portfolio_snapshots.json?v=2');
    if (!response.ok) {
      throw new Error(`Failed to load snapshots: ${response.status}`);
    }
    cachedSnapshots = await response.json();
    return cachedSnapshots!;
  } catch (error) {
    console.error('Error loading daily snapshots:', error);
    throw error;
  }
}

/**
 * Get snapshot for a specific date
 */
export function getSnapshotByDate(snapshots: PortfolioSnapshots, date: string): DailySnapshot | undefined {
  return snapshots.snapshots.find(s => s.date === date);
}

/**
 * Get the closest snapshot to a given date (useful if exact date not found)
 */
export function getClosestSnapshot(snapshots: PortfolioSnapshots, date: string): DailySnapshot | undefined {
  const targetDate = new Date(date).getTime();
  let closest: DailySnapshot | undefined;
  let minDiff = Infinity;

  for (const snapshot of snapshots.snapshots) {
    const diff = Math.abs(new Date(snapshot.date).getTime() - targetDate);
    if (diff < minDiff) {
      minDiff = diff;
      closest = snapshot;
    }
  }

  return closest;
}

/**
 * Get top N best days by gain
 * Filters to only include data from PORTFOLIO_START_DATE onwards
 */
export function getBestDays(snapshots: PortfolioSnapshots, n: number = 10, startDate: string = PORTFOLIO_START_DATE): DailySnapshot[] {
  return [...snapshots.snapshots]
    .filter(s => s.date >= startDate && s.dayChange !== 0) // Exclude days before start date, first day, and weekends
    .sort((a, b) => b.dayChange - a.dayChange)
    .slice(0, n);
}

/**
 * Get top N worst days by loss
 * Filters to only include data from PORTFOLIO_START_DATE onwards
 */
export function getWorstDays(snapshots: PortfolioSnapshots, n: number = 10, startDate: string = PORTFOLIO_START_DATE): DailySnapshot[] {
  return [...snapshots.snapshots]
    .filter(s => s.date >= startDate && s.dayChange !== 0) // Exclude days before start date, first day, and weekends
    .sort((a, b) => a.dayChange - b.dayChange)
    .slice(0, n);
}

/**
 * Get allocation history for a specific symbol
 * Filters to only include data from PORTFOLIO_START_DATE onwards
 */
export function getSymbolAllocationHistory(
  snapshots: PortfolioSnapshots, 
  symbol: string,
  startDate: string = PORTFOLIO_START_DATE
): { date: string; allocation: number; marketValue: number }[] {
  return snapshots.snapshots
    .filter(snapshot => snapshot.date >= startDate)
    .map(snapshot => {
      const position = snapshot.positions.find(p => p.symbol === symbol);
      return {
        date: snapshot.date,
        allocation: position?.allocation ?? 0,
        marketValue: position?.marketValue ?? 0,
      };
    })
    .filter(item => item.allocation > 0 || item.marketValue > 0);
}


/**
 * Get unique symbols that appear in any snapshot
 */
export function getAllSymbols(snapshots: PortfolioSnapshots): string[] {
  const symbols = new Set<string>();
  snapshots.snapshots.forEach(snapshot => {
    snapshot.positions.forEach(p => symbols.add(p.symbol));
  });
  return [...symbols].sort();
}

/**
 * Get concentration metrics over time (top position %, top 3 %)
 * @param symbolFilter - Optional function to filter which symbols to include
 * Filters to only include data from PORTFOLIO_START_DATE onwards
 */
export function getConcentrationOverTime(
  snapshots: PortfolioSnapshots,
  symbolFilter?: (symbol: string) => boolean,
  startDate: string = PORTFOLIO_START_DATE
): { date: string; topPosition: number; top3: number; top5: number }[] {
  return snapshots.snapshots
    .filter(snapshot => snapshot.date >= startDate)
    .map(snapshot => {
    // Filter positions if symbolFilter is provided
    const filteredPositions = symbolFilter 
      ? snapshot.positions.filter(p => symbolFilter(p.symbol))
      : snapshot.positions;
    
    // Calculate total allocation for filtered positions to normalize
    const totalFilteredAllocation = filteredPositions.reduce((sum, p) => sum + p.allocation, 0);
    
    // Sort by allocation (normalized to filtered total)
    const sorted = [...filteredPositions]
      .map(p => ({
        ...p,
        normalizedAllocation: totalFilteredAllocation > 0 
          ? (p.allocation / totalFilteredAllocation) * 100 
          : 0
      }))
      .sort((a, b) => b.normalizedAllocation - a.normalizedAllocation);
    
    return {
      date: snapshot.date,
      topPosition: sorted[0]?.normalizedAllocation ?? 0,
      top3: sorted.slice(0, 3).reduce((sum, p) => sum + p.normalizedAllocation, 0),
      top5: sorted.slice(0, 5).reduce((sum, p) => sum + p.normalizedAllocation, 0),
    };
  });
}

/**
 * Format date for display
 */
export function formatSnapshotDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get symbol allocation history with cost basis merged in
 * Uses the actual average cost per share from positions data for accurate cost basis calculation
 * Filters to only include data from PORTFOLIO_START_DATE onwards
 * 
 * NOTE: The snapshots data is currently aggregated across ALL accounts, not filtered
 * by the selected account. This means the market values shown may not match the
 * current portfolio view. The cost basis calculation uses the account-specific
 * average cost which provides a reasonable approximation.
 */
export function getSymbolHistoryWithCostBasis(
  snapshots: PortfolioSnapshots,
  transactions: Transaction[],
  symbol: string,
  positions?: { symbol: string; averageCost: number; costBasis: number }[],
  startDate: string = PORTFOLIO_START_DATE
): { date: string; allocation: number; marketValue: number; costBasis: number }[] {
  // Get actual average cost from positions data if available
  const currentPosition = positions?.find(p => p.symbol === symbol);
  const actualAverageCost = currentPosition?.averageCost;
  
  // If we have actual average cost, use it for accurate cost basis calculation
  if (actualAverageCost && actualAverageCost > 0) {
    return snapshots.snapshots
      .filter(snapshot => snapshot.date >= startDate)
      .map(snapshot => {
        const position = snapshot.positions.find(p => p.symbol === symbol);
        if (!position || position.quantity <= 0) return null;
        
        // Cost basis = quantity * average cost per share
        // This is accurate because average cost doesn't change with price fluctuations
        const costBasis = position.quantity * actualAverageCost;
        
        return {
          date: snapshot.date,
          allocation: position.allocation ?? 0,
          marketValue: position.marketValue ?? 0,
          costBasis,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }
  
  // Fallback: estimate cost basis from transactions if no positions data
  const symbolTxs = transactions
    .filter(tx => tx.symbol === symbol)
    .map(tx => {
      const [month, day, year] = tx.runDate.split('/');
      return {
        ...tx,
        dateISO: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      };
    })
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  // Build a map of date -> transaction cost changes
  const txByDate = new Map<string, { buyCost: number; sellQty: number }>();
  for (const tx of symbolTxs) {
    const action = tx.action.toUpperCase();
    const isBuy = action.includes('YOU BOUGHT') || action.includes('TRANSFERRED FROM');
    const isSell = action.includes('YOU SOLD') || action.includes('TRANSFERRED TO');
    
    const existing = txByDate.get(tx.dateISO) || { buyCost: 0, sellQty: 0 };
    if (isBuy && tx.quantity > 0) {
      existing.buyCost += Math.abs(tx.amount);
    } else if (isSell && tx.quantity !== 0) {
      existing.sellQty += Math.abs(tx.quantity);
    }
    txByDate.set(tx.dateISO, existing);
  }

  // Process snapshots with transaction-based estimation
  let runningCostBasis = 0;
  let runningQuantity = 0;
  let initialized = false;
  
  const result: { date: string; allocation: number; marketValue: number; costBasis: number }[] = [];
  
  // Filter to only include dates >= startDate
  const filteredSnapshots = snapshots.snapshots.filter(s => s.date >= startDate);
  
  for (const snapshot of filteredSnapshots) {
    const position = snapshot.positions.find(p => p.symbol === symbol);
    
    // Initialize on first day we see a position
    if (!initialized && position && position.quantity > 0) {
      runningCostBasis = position.marketValue;
      runningQuantity = position.quantity;
      initialized = true;
    }
    
    // Apply any transactions that happened on this date
    const dayTx = txByDate.get(snapshot.date);
    if (dayTx && initialized) {
      runningCostBasis += dayTx.buyCost;
      
      if (dayTx.sellQty > 0 && runningQuantity > 0) {
        const avgCost = runningCostBasis / runningQuantity;
        runningCostBasis = Math.max(0, runningCostBasis - avgCost * dayTx.sellQty);
      }
      
      if (position) {
        runningQuantity = position.quantity;
      }
    }
    
    if (position || runningCostBasis > 0) {
      result.push({
        date: snapshot.date,
        allocation: position?.allocation ?? 0,
        marketValue: position?.marketValue ?? 0,
        costBasis: initialized ? runningCostBasis : 0,
      });
    }
  }
  
  return result;
}

// ============================================================================
// ALLOCATION OVER TIME - DYNAMIC STOCK CATEGORIZATION
// ============================================================================

export type AllocationChartMode = 'pillars' | 'top-stocks' | 'all';

/**
 * Calculate total amount invested per symbol from transactions (buy transactions only)
 */
export function getTotalInvestedBySymbol(transactions: Transaction[]): Map<string, number> {
  const invested = new Map<string, number>();
  
  for (const tx of transactions) {
    if (!tx.symbol) continue;
    const action = tx.action.toUpperCase();
    // Support both raw action format ("YOU BOUGHT...") and normalized format ("BUY")
    const isBuy = action.includes('YOU BOUGHT') || 
                  action.includes('TRANSFERRED FROM') ||
                  action === 'BUY';
    
    if (isBuy && tx.amount < 0) {
      // Buy transactions have negative amounts (money going out)
      const current = invested.get(tx.symbol) || 0;
      invested.set(tx.symbol, current + Math.abs(tx.amount));
    }
  }
  
  return invested;
}

/**
 * Get peak allocation percentage for each symbol from snapshots
 * Only considers data from PORTFOLIO_START_DATE onwards
 */
export function getPeakAllocationBySymbol(
  snapshots: PortfolioSnapshots,
  startDate: string = PORTFOLIO_START_DATE
): Map<string, number> {
  const peakAllocation = new Map<string, number>();
  
  for (const snapshot of snapshots.snapshots) {
    if (snapshot.date < startDate) continue;
    
    for (const position of snapshot.positions) {
      const current = peakAllocation.get(position.symbol) || 0;
      if (position.allocation > current) {
        peakAllocation.set(position.symbol, position.allocation);
      }
    }
  }
  
  return peakAllocation;
}

/**
 * Get stocks that qualify as "Pillars" - core portfolio holdings
 * Criteria: $2K+ invested OR was ever 10%+ of portfolio allocation
 */
export function getPillarStocks(
  snapshots: PortfolioSnapshots,
  transactions: Transaction[],
  startDate: string = PORTFOLIO_START_DATE
): string[] {
  const totalInvested = getTotalInvestedBySymbol(transactions);
  const peakAllocation = getPeakAllocationBySymbol(snapshots, startDate);
  
  const pillars = new Set<string>();
  
  // Add stocks with $2K+ invested
  for (const [symbol, amount] of totalInvested) {
    if (amount >= 2000) {
      pillars.add(symbol);
    }
  }
  
  // Add stocks that were ever 10%+ of portfolio
  for (const [symbol, allocation] of peakAllocation) {
    if (allocation >= 10) {
      pillars.add(symbol);
    }
  }
  
  // Sort by current/peak allocation for consistent ordering
  return [...pillars].sort((a, b) => {
    const allocA = peakAllocation.get(a) || 0;
    const allocB = peakAllocation.get(b) || 0;
    return allocB - allocA;
  });
}

/**
 * Get stocks that qualify as "Top Stocks" - significant current investments
 * Criteria: Currently held AND (>$500 invested OR 3%+ current allocation)
 */
export function getTopStocks(
  transactions: Transaction[],
  snapshots?: PortfolioSnapshots,
  _startDate: string = PORTFOLIO_START_DATE
): string[] {
  if (!snapshots || snapshots.snapshots.length === 0) {
    return [];
  }
  
  // Get current holdings from the most recent snapshot
  const latestSnapshot = snapshots.snapshots[snapshots.snapshots.length - 1];
  const currentHoldings = new Set(
    latestSnapshot.positions
      .filter(p => p.quantity > 0)
      .map(p => p.symbol)
  );
  
  const totalInvested = getTotalInvestedBySymbol(transactions);
  
  const topStocksMap = new Map<string, number>();
  
  // Add stocks with >$500 invested (only if currently held)
  for (const [symbol, amount] of totalInvested) {
    if (amount > 500 && currentHoldings.has(symbol)) {
      topStocksMap.set(symbol, amount);
    }
  }
  
  // Add stocks with 3%+ current allocation (even if not much invested)
  for (const pos of latestSnapshot.positions) {
    if (pos.allocation >= 3 && !topStocksMap.has(pos.symbol)) {
      // Use allocation as a proxy for importance
      topStocksMap.set(pos.symbol, pos.allocation * 100);
    }
  }
  
  // Sort by amount/importance (descending)
  return Array.from(topStocksMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([symbol]) => symbol);
}

/**
 * Get all unique stocks ever held in the portfolio
 * Only considers data from PORTFOLIO_START_DATE onwards
 */
export function getAllStocksEverHeld(
  snapshots: PortfolioSnapshots,
  startDate: string = PORTFOLIO_START_DATE
): string[] {
  const stocks = new Set<string>();
  
  for (const snapshot of snapshots.snapshots) {
    if (snapshot.date < startDate) continue;
    
    for (const position of snapshot.positions) {
      if (position.quantity > 0) {
        stocks.add(position.symbol);
      }
    }
  }
  
  return [...stocks].sort();
}

/**
 * Get allocation data for the chart with a dynamic stock list
 * Returns data grouped by date with each symbol as a property
 * Includes "Other" category for stocks not in the provided list
 */
export function getAllocationOverTimeForStocks(
  snapshots: PortfolioSnapshots,
  stockList: string[],
  startDate: string = PORTFOLIO_START_DATE
): { data: { date: string; [symbol: string]: number | string }[]; symbols: string[] } {
  // Filter to only include dates >= startDate
  const filteredSnapshots = snapshots.snapshots.filter(s => s.date >= startDate);
  
  // Build allocation data
  const data = filteredSnapshots.map(snapshot => {
    const result: { date: string; [symbol: string]: number | string } = {
      date: snapshot.date,
    };

    // Add allocation for each stock in the list
    let trackedAllocation = 0;
    for (const symbol of stockList) {
      const position = snapshot.positions.find(p => p.symbol === symbol);
      const allocation = position?.allocation ?? 0;
      result[symbol] = allocation;
      trackedAllocation += allocation;
    }

    // Calculate "Other" as remaining allocation
    // Other = 100% - sum of tracked stocks (but the actual allocations in snapshot should sum to ~100)
    const totalAllocation = snapshot.positions.reduce((sum, p) => sum + p.allocation, 0);
    result['Other'] = Math.max(0, totalAllocation - trackedAllocation);

    return result;
  });

  return { data, symbols: stockList };
}

/**
 * Get the list of symbols in the "Other" category for a given stock list
 * Returns symbols and their allocations from the most recent snapshot
 */
export function getOtherSymbolsForStockList(
  snapshots: PortfolioSnapshots,
  stockList: string[],
  startDate: string = PORTFOLIO_START_DATE
): { symbol: string; allocation: number }[] {
  const stockSet = new Set(stockList);
  
  // Get the most recent snapshot after startDate
  const filteredSnapshots = snapshots.snapshots.filter(s => s.date >= startDate);
  if (filteredSnapshots.length === 0) return [];
  
  const latestSnapshot = filteredSnapshots[filteredSnapshots.length - 1];
  
  return latestSnapshot.positions
    .filter(p => !stockSet.has(p.symbol) && p.allocation > 0)
    .map(p => ({ symbol: p.symbol, allocation: p.allocation }))
    .sort((a, b) => b.allocation - a.allocation);
}
