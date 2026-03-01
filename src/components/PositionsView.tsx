import { useState, useMemo } from 'react';
import type { Position, Transaction } from '../utils/parseTransactions';
import { 
  extractSellTransactions, 
  getSellTransactionYears, 
  extractDividendsBySymbol 
} from '../utils/parseTransactions';
import './PositionsView.css';

interface PositionsViewProps {
  positions: Position[];
  transactions: Transaction[];
  totalValue: number;
  onStockSelect?: (symbol: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastUpdateTime?: string;
}

type ViewMode = 'overview' | 'closed' | 'dividends';
type SortKey = 'symbol' | 'lastPrice' | 'priceChange' | 'todayGain' | 'todayGainPercent' | 'totalGain' | 'totalGainPercent' | 'currentValue' | 'percentOfAccount' | 'quantity' | 'averageCost' | 'costBasis';
type SortDir = 'asc' | 'desc';

export function PositionsView({ 
  positions, 
  transactions, 
  totalValue, 
  onStockSelect,
  onRefresh,
  isRefreshing = false,
  lastUpdateTime = 'As of Jan-04-2026 11:41 p.m. ET'
}: PositionsViewProps) {
  const currentYear = new Date().getFullYear();
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [sortKey, setSortKey] = useState<SortKey>('currentValue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Get available years for closed positions filter
  const availableYears = useMemo(() => {
    const years = getSellTransactionYears(transactions);
    if (!years.includes(currentYear)) {
      years.unshift(currentYear);
    }
    return years;
  }, [transactions, currentYear]);

  // Get sell transactions for selected year
  const sellTransactions = useMemo(() => {
    return extractSellTransactions(transactions, selectedYear);
  }, [transactions, selectedYear]);

  // Get dividend summaries
  const dividendSummaries = useMemo(() => {
    return extractDividendsBySymbol(transactions, positions);
  }, [transactions, positions]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Use data directly from the positions CSV
  const enrichedPositions = positions.map(pos => {
    const lastPrice = pos.lastPrice ?? 0;
    const priceChange = pos.lastPriceChange ?? 0;
    const currentValue = pos.currentValue ?? (pos.quantity * lastPrice);
    const todayGain = pos.todayGainDollar ?? (pos.quantity * priceChange);
    const todayGainPercent = pos.todayGainPercent ?? (lastPrice > 0 ? (priceChange / lastPrice) * 100 : 0);
    const totalGain = pos.totalGainDollar ?? (currentValue - pos.costBasis);
    const totalGainPercent = pos.totalGainPercent ?? (pos.costBasis > 0 ? (totalGain / pos.costBasis) * 100 : 0);
    const percentOfAccount = pos.percentOfAccount ?? (totalValue > 0 ? (currentValue / totalValue) * 100 : 0);

    return {
      ...pos,
      lastPrice,
      priceChange,
      priceChangePercent: todayGainPercent,
      currentValue,
      todayGain,
      todayGainPercent,
      totalGain,
      totalGainPercent,
      percentOfAccount,
    };
  });

  // Sort positions
  const sortedPositions = [...enrichedPositions].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;

    switch (sortKey) {
      case 'symbol':
        aVal = a.symbol;
        bVal = b.symbol;
        break;
      case 'lastPrice':
        aVal = a.lastPrice;
        bVal = b.lastPrice;
        break;
      case 'priceChange':
        aVal = a.priceChange;
        bVal = b.priceChange;
        break;
      case 'todayGain':
        aVal = a.todayGain;
        bVal = b.todayGain;
        break;
      case 'todayGainPercent':
        aVal = a.todayGainPercent;
        bVal = b.todayGainPercent;
        break;
      case 'totalGain':
        aVal = a.totalGain;
        bVal = b.totalGain;
        break;
      case 'totalGainPercent':
        aVal = a.totalGainPercent;
        bVal = b.totalGainPercent;
        break;
      case 'currentValue':
        aVal = a.currentValue;
        bVal = b.currentValue;
        break;
      case 'percentOfAccount':
        aVal = a.percentOfAccount;
        bVal = b.percentOfAccount;
        break;
      case 'quantity':
        aVal = a.quantity;
        bVal = b.quantity;
        break;
      case 'averageCost':
        aVal = a.averageCost;
        bVal = b.averageCost;
        break;
      case 'costBasis':
        aVal = a.costBasis;
        bVal = b.costBasis;
        break;
      default:
        return 0;
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  return (
    <div className="positions-view">
      <div className="positions-toolbar">
        <div className="toolbar-left">
          <select 
            className="view-select"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
          >
            <option value="overview">Overview</option>
            <option value="closed">Closed Positions</option>
            <option value="dividends">Dividends</option>
          </select>
          {viewMode === 'closed' && (
            <select 
              className="year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          )}
        </div>
        <div className="toolbar-right">
          <span className="last-update">{lastUpdateTime}</span>
          <button className="toolbar-btn" title="Search">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </button>
          <button className="toolbar-btn" title="Filter">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>
            </svg>
          </button>
          <button 
            className={`toolbar-btn refresh-btn ${isRefreshing ? 'refreshing' : ''}`} 
            title="Refresh stock prices"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </button>
          <button className="toolbar-btn" title="More">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Overview - Open Positions */}
      {viewMode === 'overview' && (
        <div className="positions-table-container">
          <table className="positions-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('symbol')} className="sortable">
                  Symbol
                  {sortKey === 'symbol' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => handleSort('lastPrice')} className="sortable align-right">
                  Last price
                  {sortKey === 'lastPrice' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => handleSort('priceChange')} className="sortable align-right">
                  Last price change
                  {sortKey === 'priceChange' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => handleSort('todayGain')} className="sortable align-right">
                  Today's gain/loss $
                  {sortKey === 'todayGain' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => handleSort('todayGainPercent')} className="sortable align-right">
                  Today's gain/loss %
                  {sortKey === 'todayGainPercent' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => handleSort('totalGain')} className="sortable align-right">
                  Total gain/loss $
                  {sortKey === 'totalGain' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => handleSort('totalGainPercent')} className="sortable align-right">
                  Total gain/loss %
                  {sortKey === 'totalGainPercent' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => handleSort('currentValue')} className="sortable align-right">
                  Current value
                  {sortKey === 'currentValue' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => handleSort('percentOfAccount')} className="sortable align-right">
                  % of account
                  {sortKey === 'percentOfAccount' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => handleSort('quantity')} className="sortable align-right">
                  Quantity
                  {sortKey === 'quantity' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => handleSort('averageCost')} className="sortable align-right">
                  Average cost basis
                  {sortKey === 'averageCost' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => handleSort('costBasis')} className="sortable align-right">
                  Cost basis total
                  {sortKey === 'costBasis' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPositions.map((pos) => (
                <tr key={pos.symbol}>
                  <td>
                    <div className="symbol-cell">
                      <button 
                        className="symbol-link"
                        onClick={() => onStockSelect?.(pos.symbol)}
                      >
                        {pos.symbol}
                      </button>
                      <div className="symbol-desc">{pos.description}</div>
                    </div>
                  </td>
                  <td className="align-right">${pos.lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className={`align-right ${pos.priceChange >= 0 ? 'positive' : 'negative'}`}>
                    {pos.priceChange >= 0 ? '+' : ''}${pos.priceChange.toFixed(2)}
                  </td>
                  <td className={`align-right ${pos.todayGain >= 0 ? 'positive' : 'negative'}`}>
                    {pos.todayGain >= 0 ? '+' : ''}{pos.todayGain.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </td>
                  <td className={`align-right ${pos.todayGainPercent >= 0 ? 'positive' : 'negative'}`}>
                    {pos.todayGainPercent >= 0 ? '+' : ''}{pos.todayGainPercent.toFixed(2)}%
                  </td>
                  <td className={`align-right ${pos.totalGain >= 0 ? 'positive' : 'negative'}`}>
                    {pos.totalGain >= 0 ? '+' : ''}{pos.totalGain.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </td>
                  <td className={`align-right ${pos.totalGainPercent >= 0 ? 'positive' : 'negative'}`}>
                    {pos.totalGainPercent >= 0 ? '+' : ''}{pos.totalGainPercent.toFixed(2)}%
                  </td>
                  <td className="align-right font-medium">
                    ${pos.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="align-right">{pos.percentOfAccount.toFixed(2)}%</td>
                  <td className="align-right">
                    <span className="quantity-badge">{pos.quantity.toFixed(pos.quantity % 1 === 0 ? 0 : 2)}</span>
                  </td>
                  <td className="align-right">${pos.averageCost.toFixed(2)}</td>
                  <td className="align-right">${pos.costBasis.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Closed Positions */}
      {viewMode === 'closed' && (
        <div className="positions-table-container">
          {sellTransactions.length === 0 ? (
            <div className="empty-state">
              <p>No closed positions for {selectedYear}</p>
            </div>
          ) : (
            <>
              <table className="positions-table closed-positions-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Symbol</th>
                    <th className="align-right">Qty Sold</th>
                    <th className="align-right">Sale Price</th>
                    <th className="align-right">Proceeds</th>
                    <th className="align-right">Cost Basis</th>
                    <th className="align-right">Realized Gain/Loss</th>
                    <th className="align-right">Return %</th>
                  </tr>
                </thead>
                <tbody>
                  {sellTransactions.map((sale, idx) => (
                    <tr key={`${sale.symbol}-${sale.date}-${idx}`}>
                      <td>{sale.date}</td>
                      <td>
                        <div className="symbol-cell">
                          <button 
                            className="symbol-link"
                            onClick={() => onStockSelect?.(sale.symbol)}
                          >
                            {sale.symbol}
                          </button>
                          <div className="symbol-desc">{sale.description}</div>
                        </div>
                      </td>
                      <td className="align-right">{sale.quantity.toFixed(sale.quantity % 1 === 0 ? 0 : 3)}</td>
                      <td className="align-right">${sale.salePrice.toFixed(2)}</td>
                      <td className="align-right">${sale.proceeds.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="align-right">${sale.costBasis.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className={`align-right font-medium ${sale.realizedGain >= 0 ? 'positive' : 'negative'}`}>
                        {sale.realizedGain >= 0 ? '+' : ''}{sale.realizedGain.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                      </td>
                      <td className={`align-right ${sale.realizedGainPercent >= 0 ? 'positive' : 'negative'}`}>
                        {sale.realizedGainPercent >= 0 ? '+' : ''}{sale.realizedGainPercent.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="totals-row">
                    <td colSpan={4}><strong>Total ({selectedYear})</strong></td>
                    <td className="align-right font-medium">
                      ${sellTransactions.reduce((sum, s) => sum + s.proceeds, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="align-right font-medium">
                      ${sellTransactions.reduce((sum, s) => sum + s.costBasis, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`align-right font-medium ${sellTransactions.reduce((sum, s) => sum + s.realizedGain, 0) >= 0 ? 'positive' : 'negative'}`}>
                      {sellTransactions.reduce((sum, s) => sum + s.realizedGain, 0) >= 0 ? '+' : ''}
                      {sellTransactions.reduce((sum, s) => sum + s.realizedGain, 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                    <td className={`align-right ${(() => {
                      const totalCost = sellTransactions.reduce((sum, s) => sum + s.costBasis, 0);
                      const totalGain = sellTransactions.reduce((sum, s) => sum + s.realizedGain, 0);
                      return totalGain >= 0 ? 'positive' : 'negative';
                    })()}`}>
                      {(() => {
                        const totalCost = sellTransactions.reduce((sum, s) => sum + s.costBasis, 0);
                        const totalGain = sellTransactions.reduce((sum, s) => sum + s.realizedGain, 0);
                        const pct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
                        return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
                      })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      )}

      {/* Dividends */}
      {viewMode === 'dividends' && (
        <div className="positions-table-container">
          {dividendSummaries.length === 0 ? (
            <div className="empty-state">
              <p>No dividend history available</p>
            </div>
          ) : (
            <>
              <table className="positions-table dividends-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th className="align-right">Total Received</th>
                    <th className="align-right"># Payments</th>
                    <th className="align-right">Last Payment</th>
                    <th className="align-right">Last Date</th>
                    <th className="align-right">Est. Annual</th>
                    <th className="align-right">Yield %</th>
                  </tr>
                </thead>
                <tbody>
                  {dividendSummaries.map((div) => (
                    <tr key={div.symbol}>
                      <td>
                        <div className="symbol-cell">
                          <button 
                            className="symbol-link"
                            onClick={() => onStockSelect?.(div.symbol)}
                          >
                            {div.symbol}
                          </button>
                          <div className="symbol-desc">{div.description}</div>
                        </div>
                      </td>
                      <td className="align-right font-medium positive">
                        ${div.totalDividends.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="align-right">{div.dividendCount}</td>
                      <td className="align-right">
                        ${div.lastDividendAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="align-right">{div.lastDividendDate}</td>
                      <td className="align-right">
                        ${div.estimatedAnnualDividend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="align-right">
                        {div.dividendYield > 0 ? `${div.dividendYield.toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="totals-row">
                    <td><strong>Total</strong></td>
                    <td className="align-right font-medium positive">
                      ${dividendSummaries.reduce((sum, d) => sum + d.totalDividends, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="align-right">
                      {dividendSummaries.reduce((sum, d) => sum + d.dividendCount, 0)}
                    </td>
                    <td colSpan={2}></td>
                    <td className="align-right font-medium">
                      ${dividendSummaries.reduce((sum, d) => sum + d.estimatedAnnualDividend, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
