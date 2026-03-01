import { useState, useMemo } from 'react';
import type { Transaction } from '../utils/parseTransactions';
import './ActivityView.css';

interface ActivityViewProps {
  transactions: Transaction[];
}

type TransactionCategory = 'all' | 'buy' | 'sell' | 'dividend' | 'transfer' | 'other';
type SortKey = 'date' | 'symbol' | 'amount';
type SortDir = 'asc' | 'desc';

function categorizeTransaction(action: string): TransactionCategory {
  const upper = action.toUpperCase();
  if (upper.includes('YOU BOUGHT')) return 'buy';
  if (upper.includes('YOU SOLD')) return 'sell';
  if (upper.includes('DIVIDEND') || upper.includes('REINVESTMENT')) return 'dividend';
  if (upper.includes('ELECTRONIC FUNDS TRANSFER') || upper.includes('TRANSFERRED') || upper.includes('JOURNALED')) return 'transfer';
  return 'other';
}

function getTransactionTypeLabel(category: TransactionCategory): string {
  switch (category) {
    case 'buy': return 'Buy';
    case 'sell': return 'Sell';
    case 'dividend': return 'Dividend';
    case 'transfer': return 'Transfer';
    case 'other': return 'Other';
    default: return 'All';
  }
}

function formatDate(dateStr: string): string {
  // Convert MM/DD/YYYY to more readable format
  const [month, day, year] = dateStr.split('/');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = months[parseInt(month, 10) - 1] || month;
  return `${monthName} ${parseInt(day, 10)}, ${year}`;
}

function parseTransactionDate(dateStr: string): Date {
  const [month, day, year] = dateStr.split('/');
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

function getSimplifiedAction(action: string): string {
  const upper = action.toUpperCase();
  if (upper.includes('YOU BOUGHT')) return 'Bought';
  if (upper.includes('YOU SOLD')) return 'Sold';
  if (upper.includes('DIVIDEND RECEIVED')) return 'Dividend';
  if (upper.includes('REINVESTMENT')) return 'Reinvestment';
  if (upper.includes('ELECTRONIC FUNDS TRANSFER RECEIVED')) return 'Deposit';
  if (upper.includes('ELECTRONIC FUNDS TRANSFER PAID')) return 'Withdrawal';
  if (upper.includes('TRANSFERRED FROM')) return 'Transfer In';
  if (upper.includes('TRANSFERRED TO')) return 'Transfer Out';
  if (upper.includes('JOURNALED')) return 'Journal';
  if (upper.includes('FEE CHARGED')) return 'Fee';
  return 'Activity';
}

export function ActivityView({ transactions }: ActivityViewProps) {
  const [filter, setFilter] = useState<TransactionCategory>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'date' ? 'desc' : 'asc');
    }
  };

  const filteredAndSortedTransactions = useMemo(() => {
    let result = transactions.filter(tx => {
      // Filter by category
      if (filter !== 'all' && categorizeTransaction(tx.action) !== filter) {
        return false;
      }
      // Filter by search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          tx.symbol.toLowerCase().includes(term) ||
          tx.description.toLowerCase().includes(term) ||
          tx.action.toLowerCase().includes(term)
        );
      }
      return true;
    });

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case 'date':
          comparison = parseTransactionDate(a.runDate).getTime() - parseTransactionDate(b.runDate).getTime();
          break;
        case 'symbol':
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
      }
      return sortDir === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [transactions, filter, sortKey, sortDir, searchTerm]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const buys = transactions.filter(tx => categorizeTransaction(tx.action) === 'buy');
    const sells = transactions.filter(tx => categorizeTransaction(tx.action) === 'sell');
    const dividends = transactions.filter(tx => categorizeTransaction(tx.action) === 'dividend');
    
    return {
      totalTransactions: transactions.length,
      buyCount: buys.length,
      sellCount: sells.length,
      dividendCount: dividends.length,
      totalDividends: dividends.reduce((sum, tx) => sum + tx.amount, 0),
    };
  }, [transactions]);

  const filterOptions: { value: TransactionCategory; label: string; count?: number }[] = [
    { value: 'all', label: 'All Activity', count: transactions.length },
    { value: 'buy', label: 'Buys', count: stats.buyCount },
    { value: 'sell', label: 'Sells', count: stats.sellCount },
    { value: 'dividend', label: 'Dividends', count: stats.dividendCount },
    { value: 'transfer', label: 'Transfers' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <div className="activity-view">
      <div className="activity-header">
        <div className="activity-title">
          <h2>Activity & Orders</h2>
          <span className="account-number">DEMO001</span>
        </div>
        <div className="activity-stats">
          <div className="stat-item">
            <span className="stat-label">Total Transactions</span>
            <span className="stat-value">{stats.totalTransactions}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Total Dividends</span>
            <span className="stat-value positive">
              ${stats.totalDividends.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      <div className="activity-toolbar">
        <div className="toolbar-left">
          <div className="filter-buttons">
            {filterOptions.map(option => (
              <button
                key={option.value}
                className={`filter-btn ${filter === option.value ? 'active' : ''}`}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
                {option.count !== undefined && (
                  <span className="filter-count">{option.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-right">
          <div className="search-box">
            <svg viewBox="0 0 24 24" width="16" height="16" className="search-icon">
              <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              type="text"
              placeholder="Search symbol or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <button className="toolbar-btn" title="Refresh">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </button>
          <button className="toolbar-btn" title="Download">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="activity-table-container">
        <table className="activity-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('date')} className="sortable">
                Date
                {sortKey === 'date' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </th>
              <th>Action</th>
              <th onClick={() => handleSort('symbol')} className="sortable">
                Symbol
                {sortKey === 'symbol' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </th>
              <th>Description</th>
              <th className="align-right">Price</th>
              <th className="align-right">Quantity</th>
              <th onClick={() => handleSort('amount')} className="sortable align-right">
                Amount
                {sortKey === 'amount' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </th>
              <th className="align-right">Cash Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedTransactions.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  No transactions found matching your criteria.
                </td>
              </tr>
            ) : (
              filteredAndSortedTransactions.map((tx, index) => {
                const category = categorizeTransaction(tx.action);
                const isProcessing = tx.cashBalance === 'Processing';
                
                return (
                  <tr key={`${tx.runDate}-${tx.symbol}-${tx.amount}-${index}`} className={isProcessing ? 'processing' : ''}>
                    <td className="date-cell">{formatDate(tx.runDate)}</td>
                    <td>
                      <span className={`action-badge ${category}`}>
                        {getSimplifiedAction(tx.action)}
                      </span>
                    </td>
                    <td>
                      {tx.symbol ? (
                        <a href="#" className="symbol-link">{tx.symbol}</a>
                      ) : (
                        <span className="no-symbol">—</span>
                      )}
                    </td>
                    <td className="description-cell">
                      <span className="description-text" title={tx.description}>
                        {tx.description || 'No Description'}
                      </span>
                    </td>
                    <td className="align-right">
                      {tx.price > 0 ? `$${tx.price.toFixed(2)}` : '—'}
                    </td>
                    <td className="align-right">
                      {tx.quantity !== 0 ? (
                        <span className={tx.quantity < 0 ? 'negative' : ''}>
                          {tx.quantity > 0 ? tx.quantity.toFixed(tx.quantity % 1 === 0 ? 0 : 3) : tx.quantity.toFixed(tx.quantity % 1 === 0 ? 0 : 3)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className={`align-right font-medium ${tx.amount >= 0 ? 'positive' : 'negative'}`}>
                      {tx.amount >= 0 ? '+' : ''}${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="align-right">
                      {isProcessing ? (
                        <span className="processing-badge">Processing</span>
                      ) : typeof tx.cashBalance === 'number' ? (
                        `$${tx.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`status-badge ${isProcessing ? 'pending' : 'completed'}`}>
                        {isProcessing ? 'Pending' : 'Completed'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="activity-footer">
        <span className="results-count">
          Showing {filteredAndSortedTransactions.length} of {transactions.length} transactions
        </span>
      </div>
    </div>
  );
}
