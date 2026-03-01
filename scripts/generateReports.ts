/**
 * Generate Portfolio Report Documents
 * 
 * Creates yearly and quarterly HTML reports for the Growth Portfolio
 * with comprehensive metrics, holdings, and transaction activity.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface PositionSnapshot {
  symbol: string;
  quantity: number;
  price: number;
  marketValue: number;
  allocation: number;
}

interface DailySnapshot {
  date: string;
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  positions: PositionSnapshot[];
}

interface SnapshotsData {
  version: string;
  lastUpdated: string;
  dateRange: { start: string; end: string };
  snapshots: DailySnapshot[];
}

interface Transaction {
  id: string;
  date: string;
  settlementDate?: string;
  action: string;
  symbol: string;
  description: string;
  quantity: number;
  price: number;
  amount: number;
  type: string;
  rawAction?: string;
}

interface AccountTransactions {
  name: string;
  broker: string;
  transactions: Transaction[];
}

interface TransactionsData {
  version: string;
  lastUpdated: string;
  accounts: Record<string, AccountTransactions>;
}

interface StockThesis {
  thesis: string;
  lastUpdated: string;
}

interface ReportManifest {
  version: string;
  lastUpdated: string;
  reports: {
    id: string;
    type: 'annual' | 'quarterly';
    year: number;
    quarter?: number;
    title: string;
    filename: string;
    periodStart: string;
    periodEnd: string;
  }[];
}

// Monthly TWRR data (same as in mockPrices.ts)
const monthlyTWRR = [
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

// VTI prices will be loaded from file
interface VTIPrice {
  date: string;
  price: number;
}

let vtiPrices: VTIPrice[] = [];

// ============================================================================
// Helper Functions
// ============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getQuarterMonths(year: number, quarter: number): string[] {
  const startMonth = (quarter - 1) * 3 + 1;
  return [
    `${year}-${String(startMonth).padStart(2, '0')}`,
    `${year}-${String(startMonth + 1).padStart(2, '0')}`,
    `${year}-${String(startMonth + 2).padStart(2, '0')}`,
  ];
}

function getQuarterDateRange(year: number, quarter: number): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const endDay = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][endMonth - 1];
  
  // Handle leap year for February
  const adjustedEndDay = endMonth === 2 && year % 4 === 0 ? 29 : endDay;
  
  return {
    start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${year}-${String(endMonth).padStart(2, '0')}-${String(adjustedEndDay).padStart(2, '0')}`,
  };
}

function getYearDateRange(year: number): { start: string; end: string } {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

function calculateTWRR(months: string[]): number {
  const relevantReturns = monthlyTWRR.filter(m => months.includes(m.month));
  if (relevantReturns.length === 0) return 0;
  
  const cumulative = relevantReturns.reduce((acc, { return: ret }) => acc * (1 + ret / 100), 1);
  return (cumulative - 1) * 100;
}

function calculateVTIReturn(startDate: string, endDate: string): number {
  if (vtiPrices.length === 0) return 0;
  
  // Find the closest price to start date (on or after)
  let startPrice: number | null = null;
  for (const p of vtiPrices) {
    if (p.date >= startDate) {
      startPrice = p.price;
      break;
    }
  }
  
  // Find the closest price to end date (on or before)
  let endPrice: number | null = null;
  for (let i = vtiPrices.length - 1; i >= 0; i--) {
    if (vtiPrices[i].date <= endDate) {
      endPrice = vtiPrices[i].price;
      break;
    }
  }
  
  if (!startPrice || !endPrice) return 0;
  
  return ((endPrice - startPrice) / startPrice) * 100;
}

function getClosestSnapshot(
  snapshots: DailySnapshot[],
  targetDate: string,
  direction: 'before' | 'after'
): DailySnapshot | null {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  
  if (direction === 'before') {
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].date <= targetDate) return sorted[i];
    }
    return sorted[0] || null;
  } else {
    for (const snapshot of sorted) {
      if (snapshot.date >= targetDate) return snapshot;
    }
    return sorted[sorted.length - 1] || null;
  }
}

function filterTransactionsByPeriod(
  transactions: Transaction[],
  startDate: string,
  endDate: string
): Transaction[] {
  return transactions.filter(t => t.date >= startDate && t.date <= endDate);
}

function groupTransactionsByType(transactions: Transaction[]): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {
    BUY: [],
    SELL: [],
    DIVIDEND: [],
    DEPOSIT: [],
    WITHDRAWAL: [],
    OTHER: [],
  };
  
  for (const t of transactions) {
    const type = groups[t.action] ? t.action : 'OTHER';
    groups[type].push(t);
  }
  
  return groups;
}

// ============================================================================
// HTML Template Generator
// ============================================================================

function generateReportHTML(
  reportType: 'annual' | 'quarterly',
  year: number,
  quarter: number | null,
  periodStart: string,
  periodEnd: string,
  startSnapshot: DailySnapshot | null,
  endSnapshot: DailySnapshot | null,
  transactions: Transaction[],
  twrr: number,
  sp500Return: number,
  thesisData: Record<string, StockThesis>
): string {
  const title = quarter
    ? `Q${quarter} ${year} Portfolio Report`
    : `${year} Annual Portfolio Report`;
  
  const periodLabel = quarter
    ? `Q${quarter} ${year}`
    : `Full Year ${year}`;
  
  const startValue = startSnapshot?.totalValue || 0;
  const endValue = endSnapshot?.totalValue || 0;
  const valueChange = endValue - startValue;
  
  const groupedTransactions = groupTransactionsByType(transactions);
  const totalBuys = groupedTransactions.BUY.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalSells = groupedTransactions.SELL.reduce((sum, t) => sum + t.amount, 0);
  const totalDividends = groupedTransactions.DIVIDEND.reduce((sum, t) => sum + t.amount, 0);
  const totalDeposits = groupedTransactions.DEPOSIT.reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawals = groupedTransactions.WITHDRAWAL.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  // Get top holdings at end of period
  const topHoldings = endSnapshot?.positions
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 10) || [];
  
  // Calculate top gainers/losers if we have start and end snapshots
  const holdingsComparison: { symbol: string; startValue: number; endValue: number; change: number; changePercent: number }[] = [];
  if (startSnapshot && endSnapshot) {
    const startMap = new Map(startSnapshot.positions.map(p => [p.symbol, p]));
    for (const endPos of endSnapshot.positions) {
      const startPos = startMap.get(endPos.symbol);
      if (startPos) {
        const change = endPos.marketValue - startPos.marketValue;
        const changePercent = startPos.marketValue > 0 ? (change / startPos.marketValue) * 100 : 0;
        holdingsComparison.push({
          symbol: endPos.symbol,
          startValue: startPos.marketValue,
          endValue: endPos.marketValue,
          change,
          changePercent,
        });
      }
    }
  }
  
  const topGainers = holdingsComparison
    .filter(h => h.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 5);
  
  const topLosers = holdingsComparison
    .filter(h => h.change < 0)
    .sort((a, b) => a.change - b.change)
    .slice(0, 5);
  
  // Get unique symbols with thesis
  const heldSymbols = endSnapshot?.positions.map(p => p.symbol) || [];
  const symbolsWithThesis = heldSymbols.filter(s => thesisData[s]);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Growth Portfolio</title>
  <style>
    :root {
      --bg-primary: #0a0f1a;
      --bg-secondary: #111827;
      --bg-card: #1a2236;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent-primary: #3b82f6;
      --accent-success: #10b981;
      --accent-danger: #ef4444;
      --accent-warning: #f59e0b;
      --border-color: #334155;
      --font-display: 'Playfair Display', Georgia, serif;
      --font-body: 'Source Sans Pro', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Sans+Pro:wght@300;400;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    
    body {
      font-family: var(--font-body);
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      min-height: 100vh;
    }
    
    .report {
      max-width: 1100px;
      margin: 0 auto;
      padding: 48px 32px;
    }
    
    /* Header */
    .report-header {
      text-align: center;
      margin-bottom: 48px;
      padding-bottom: 32px;
      border-bottom: 1px solid var(--border-color);
    }
    
    .report-header h1 {
      font-family: var(--font-display);
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    
    .report-header .subtitle {
      font-size: 1.125rem;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }
    
    .report-header .period {
      font-family: var(--font-mono);
      font-size: 0.875rem;
      color: var(--text-muted);
    }
    
    /* Section */
    .section {
      margin-bottom: 48px;
    }
    
    .section-title {
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 2px solid var(--accent-primary);
      display: inline-block;
    }
    
    /* Summary Cards */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }
    
    .summary-card {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 24px;
      border: 1px solid var(--border-color);
    }
    
    .summary-card .label {
      font-size: 0.8125rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }
    
    .summary-card .value {
      font-family: var(--font-mono);
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text-primary);
    }
    
    .summary-card .change {
      font-size: 0.875rem;
      margin-top: 4px;
    }
    
    .positive { color: var(--accent-success); }
    .negative { color: var(--accent-danger); }
    
    /* Performance Comparison */
    .performance-bars {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .performance-bar {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    
    .performance-bar .label {
      width: 120px;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }
    
    .performance-bar .bar-container {
      flex: 1;
      height: 24px;
      background: var(--bg-secondary);
      border-radius: 4px;
      position: relative;
      overflow: hidden;
    }
    
    .performance-bar .bar {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    
    .performance-bar .bar.portfolio { background: var(--accent-primary); }
    .performance-bar .bar.benchmark { background: var(--text-muted); }
    
    .performance-bar .value {
      width: 80px;
      text-align: right;
      font-family: var(--font-mono);
      font-size: 0.875rem;
    }
    
    /* Tables */
    .table-container {
      overflow-x: auto;
      border-radius: 12px;
      border: 1px solid var(--border-color);
      background: var(--bg-card);
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th {
      text-align: left;
      padding: 16px;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
    }
    
    td {
      padding: 14px 16px;
      font-size: 0.875rem;
      border-bottom: 1px solid var(--border-color);
    }
    
    tr:last-child td {
      border-bottom: none;
    }
    
    tr:hover {
      background: rgba(59, 130, 246, 0.05);
    }
    
    .mono {
      font-family: var(--font-mono);
    }
    
    .text-right {
      text-align: right;
    }
    
    /* Thesis Cards */
    .thesis-grid {
      display: grid;
      gap: 24px;
    }
    
    .thesis-card {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 24px;
      border: 1px solid var(--border-color);
    }
    
    .thesis-card .symbol {
      font-family: var(--font-mono);
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--accent-primary);
      margin-bottom: 8px;
    }
    
    .thesis-card .updated {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 12px;
    }
    
    .thesis-card .content {
      font-size: 0.875rem;
      color: var(--text-secondary);
      line-height: 1.7;
      white-space: pre-wrap;
    }
    
    /* Transaction Summary */
    .transaction-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    
    .transaction-stat {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    
    .transaction-stat .type {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    
    .transaction-stat .amount {
      font-family: var(--font-mono);
      font-size: 1.125rem;
      font-weight: 600;
    }
    
    .transaction-stat .count {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 2px;
    }
    
    /* Footer */
    .report-footer {
      margin-top: 64px;
      padding-top: 24px;
      border-top: 1px solid var(--border-color);
      text-align: center;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    
    /* Print styles */
    @media print {
      body {
        background: white;
        color: #1a1a1a;
      }
      
      .report {
        max-width: none;
        padding: 0;
      }
      
      .summary-card,
      .thesis-card,
      .table-container {
        border: 1px solid #e5e5e5;
        background: #f9f9f9;
      }
      
      .positive { color: #059669; }
      .negative { color: #dc2626; }
    }
  </style>
</head>
<body>
  <div class="report">
    <header class="report-header">
      <h1>${title}</h1>
      <p class="subtitle">Growth Portfolio</p>
      <p class="period">${formatDate(periodStart)} — ${formatDate(periodEnd)}</p>
    </header>
    
    <!-- Performance Summary -->
    <section class="section">
      <h2 class="section-title">Performance Summary</h2>
      
      <div class="summary-grid">
        <div class="summary-card">
          <div class="label">Starting Value</div>
          <div class="value">${formatCurrency(startValue)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Ending Value</div>
          <div class="value">${formatCurrency(endValue)}</div>
          <div class="change ${valueChange >= 0 ? 'positive' : 'negative'}">
            ${formatCurrency(valueChange)} (${formatPercent((valueChange / startValue) * 100 || 0)})
          </div>
        </div>
        <div class="summary-card">
          <div class="label">Period Return (TWRR)</div>
          <div class="value ${twrr >= 0 ? 'positive' : 'negative'}">${formatPercent(twrr)}</div>
        </div>
        <div class="summary-card">
          <div class="label">VTI (Total Market) Return</div>
          <div class="value ${sp500Return >= 0 ? 'positive' : 'negative'}">${formatPercent(sp500Return)}</div>
        </div>
      </div>
      
      <div class="performance-bars">
        <div class="performance-bar">
          <span class="label">Portfolio</span>
          <div class="bar-container">
            <div class="bar portfolio" style="width: ${Math.min(Math.max(twrr, 0), 100) * 2}%"></div>
          </div>
          <span class="value ${twrr >= 0 ? 'positive' : 'negative'}">${formatPercent(twrr)}</span>
        </div>
        <div class="performance-bar">
          <span class="label">VTI</span>
          <div class="bar-container">
            <div class="bar benchmark" style="width: ${Math.min(Math.max(sp500Return, 0), 100) * 2}%"></div>
          </div>
          <span class="value ${sp500Return >= 0 ? 'positive' : 'negative'}">${formatPercent(sp500Return)}</span>
        </div>
      </div>
    </section>
    
    <!-- Holdings Breakdown -->
    <section class="section">
      <h2 class="section-title">Holdings at Period End</h2>
      
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th class="text-right">Shares</th>
              <th class="text-right">Price</th>
              <th class="text-right">Market Value</th>
              <th class="text-right">Allocation</th>
            </tr>
          </thead>
          <tbody>
            ${topHoldings.map(h => `
              <tr>
                <td class="mono">${h.symbol}</td>
                <td class="text-right mono">${h.quantity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</td>
                <td class="text-right mono">${formatCurrency(h.price)}</td>
                <td class="text-right mono">${formatCurrency(h.marketValue)}</td>
                <td class="text-right mono">${h.allocation.toFixed(1)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
    
    ${holdingsComparison.length > 0 ? `
    <!-- Top Gainers & Losers -->
    <section class="section">
      <h2 class="section-title">Top Gainers & Losers</h2>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th colspan="3" style="text-align: center; color: var(--accent-success);">Top Gainers</th>
              </tr>
              <tr>
                <th>Symbol</th>
                <th class="text-right">Gain</th>
                <th class="text-right">%</th>
              </tr>
            </thead>
            <tbody>
              ${topGainers.map(h => `
                <tr>
                  <td class="mono">${h.symbol}</td>
                  <td class="text-right mono positive">${formatCurrency(h.change)}</td>
                  <td class="text-right mono positive">${formatPercent(h.changePercent)}</td>
                </tr>
              `).join('') || '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No gainers</td></tr>'}
            </tbody>
          </table>
        </div>
        
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th colspan="3" style="text-align: center; color: var(--accent-danger);">Top Losers</th>
              </tr>
              <tr>
                <th>Symbol</th>
                <th class="text-right">Loss</th>
                <th class="text-right">%</th>
              </tr>
            </thead>
            <tbody>
              ${topLosers.map(h => `
                <tr>
                  <td class="mono">${h.symbol}</td>
                  <td class="text-right mono negative">${formatCurrency(h.change)}</td>
                  <td class="text-right mono negative">${formatPercent(h.changePercent)}</td>
                </tr>
              `).join('') || '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No losers</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </section>
    ` : ''}
    
    <!-- Transaction Activity -->
    <section class="section">
      <h2 class="section-title">Transaction Activity</h2>
      
      <div class="transaction-summary">
        <div class="transaction-stat">
          <div class="type">Purchases</div>
          <div class="amount negative">${formatCurrency(totalBuys)}</div>
          <div class="count">${groupedTransactions.BUY.length} transactions</div>
        </div>
        <div class="transaction-stat">
          <div class="type">Sales</div>
          <div class="amount positive">${formatCurrency(totalSells)}</div>
          <div class="count">${groupedTransactions.SELL.length} transactions</div>
        </div>
        <div class="transaction-stat">
          <div class="type">Dividends</div>
          <div class="amount positive">${formatCurrency(totalDividends)}</div>
          <div class="count">${groupedTransactions.DIVIDEND.length} payments</div>
        </div>
        <div class="transaction-stat">
          <div class="type">Deposits</div>
          <div class="amount positive">${formatCurrency(totalDeposits)}</div>
          <div class="count">${groupedTransactions.DEPOSIT.length} deposits</div>
        </div>
        <div class="transaction-stat">
          <div class="type">Withdrawals</div>
          <div class="amount negative">${formatCurrency(totalWithdrawals)}</div>
          <div class="count">${groupedTransactions.WITHDRAWAL.length} withdrawals</div>
        </div>
      </div>
      
      ${transactions.length > 0 ? `
      <details>
        <summary style="cursor: pointer; color: var(--accent-primary); margin-bottom: 16px;">
          View All Transactions (${transactions.length})
        </summary>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Symbol</th>
                <th class="text-right">Shares</th>
                <th class="text-right">Price</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.slice(0, 50).map(t => `
                <tr>
                  <td class="mono">${t.date}</td>
                  <td>${t.action}</td>
                  <td class="mono">${t.symbol || '—'}</td>
                  <td class="text-right mono">${t.quantity ? t.quantity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 }) : '—'}</td>
                  <td class="text-right mono">${t.price ? formatCurrency(t.price) : '—'}</td>
                  <td class="text-right mono ${t.amount >= 0 ? 'positive' : 'negative'}">${formatCurrency(t.amount)}</td>
                </tr>
              `).join('')}
              ${transactions.length > 50 ? `
                <tr>
                  <td colspan="6" style="text-align: center; color: var(--text-muted);">
                    ... and ${transactions.length - 50} more transactions
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      </details>
      ` : '<p style="color: var(--text-muted);">No transactions during this period.</p>'}
    </section>
    
    ${symbolsWithThesis.length > 0 ? `
    <!-- Investment Thesis -->
    <section class="section">
      <h2 class="section-title">Investment Thesis</h2>
      
      <div class="thesis-grid">
        ${symbolsWithThesis.slice(0, 5).map(symbol => {
          const thesis = thesisData[symbol];
          return `
            <div class="thesis-card">
              <div class="symbol">${symbol}</div>
              <div class="updated">Last updated: ${formatDate(thesis.lastUpdated)}</div>
              <div class="content">${thesis.thesis.split('\n\n')[0]}</div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
    ` : ''}
    
    <footer class="report-footer">
      <p>Growth Portfolio Report • Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <p style="margin-top: 4px;">This report is for informational purposes only and does not constitute financial advice.</p>
    </footer>
  </div>
</body>
</html>`;
}

// ============================================================================
// Main Generator
// ============================================================================

async function main() {
  console.log('Generating Portfolio Reports...\n');
  
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const reportsDir = path.join(process.cwd(), 'public', 'reports');
  
  // Ensure reports directory exists
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  // Load data
  console.log('Loading data...');
  
  const snapshotsData: SnapshotsData = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'daily_portfolio_snapshots.json'), 'utf-8')
  );
  
  const transactionsData: TransactionsData = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'transactions.json'), 'utf-8')
  );
  
  const thesisData: Record<string, StockThesis> = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'stock_thesis.json'), 'utf-8')
  );
  
  // Load VTI prices for benchmark comparison
  vtiPrices = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'vti_prices.json'), 'utf-8')
  );
  
  const snapshots = snapshotsData.snapshots;
  const growthTransactions = transactionsData.accounts['Z25424500']?.transactions || [];
  
  console.log(`  Loaded ${snapshots.length} daily snapshots`);
  console.log(`  Loaded ${growthTransactions.length} transactions`);
  console.log(`  Loaded ${Object.keys(thesisData).length} stock theses`);
  console.log(`  Loaded ${vtiPrices.length} VTI prices\n`);
  
  const manifest: ReportManifest = {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    reports: [],
  };
  
  // Generate reports for years 2023, 2024, 2025
  const years = [2023, 2024, 2025];
  
  for (const year of years) {
    console.log(`Generating ${year} reports...`);
    
    // Generate quarterly reports
    for (let quarter = 1; quarter <= 4; quarter++) {
      const { start, end } = getQuarterDateRange(year, quarter);
      const months = getQuarterMonths(year, quarter);
      
      // Check if we have data for this period
      const hasData = snapshots.some(s => s.date >= start && s.date <= end);
      if (!hasData && year === 2023 && quarter < 2) {
        console.log(`  Skipping Q${quarter} ${year} (no data)`);
        continue;
      }
      
      const startSnapshot = getClosestSnapshot(snapshots, start, 'after');
      const endSnapshot = getClosestSnapshot(snapshots, end, 'before');
      const periodTransactions = filterTransactionsByPeriod(growthTransactions, start, end);
      const twrr = calculateTWRR(months);
      const sp500Return = calculateVTIReturn(start, end);
      
      const filename = `${year}-Q${quarter}.html`;
      const html = generateReportHTML(
        'quarterly',
        year,
        quarter,
        start,
        end,
        startSnapshot,
        endSnapshot,
        periodTransactions,
        twrr,
        sp500Return,
        thesisData
      );
      
      fs.writeFileSync(path.join(reportsDir, filename), html);
      console.log(`  ✓ ${filename}`);
      
      manifest.reports.push({
        id: `${year}-Q${quarter}`,
        type: 'quarterly',
        year,
        quarter,
        title: `Q${quarter} ${year}`,
        filename,
        periodStart: start,
        periodEnd: end,
      });
    }
    
    // Generate annual report
    const { start, end } = getYearDateRange(year);
    const months = Array.from({ length: 12 }, (_, i) => 
      `${year}-${String(i + 1).padStart(2, '0')}`
    );
    
    const startSnapshot = getClosestSnapshot(snapshots, start, 'after');
    const endSnapshot = getClosestSnapshot(snapshots, end, 'before');
    const periodTransactions = filterTransactionsByPeriod(growthTransactions, start, end);
    const twrr = calculateTWRR(months);
    const sp500Return = calculateVTIReturn(start, end);
    
    const filename = `${year}-annual.html`;
    const html = generateReportHTML(
      'annual',
      year,
      null,
      start,
      end,
      startSnapshot,
      endSnapshot,
      periodTransactions,
      twrr,
      sp500Return,
      thesisData
    );
    
    fs.writeFileSync(path.join(reportsDir, filename), html);
    console.log(`  ✓ ${filename}`);
    
    manifest.reports.push({
      id: `${year}-annual`,
      type: 'annual',
      year,
      title: `${year} Annual Report`,
      filename,
      periodStart: start,
      periodEnd: end,
    });
  }
  
  // Write manifest
  fs.writeFileSync(
    path.join(reportsDir, 'reports.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('\n✓ reports.json manifest created');
  
  console.log(`\n✓ Generated ${manifest.reports.length} reports!`);
}

main().catch(console.error);
