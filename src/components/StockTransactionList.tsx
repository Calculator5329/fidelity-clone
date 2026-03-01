import { useMemo } from 'react';
import type { Transaction } from '../utils/parseTransactions';
import './StockTransactionList.css';

interface StockTransactionListProps {
  transactions: Transaction[];
}

interface ProcessedTransaction {
  date: string;
  type: 'buy' | 'sell' | 'dividend' | 'transfer_in' | 'transfer_out';
  quantity: number;
  price: number;
  amount: number;
  description: string;
}

export function StockTransactionList({ transactions }: StockTransactionListProps) {
  const processedTransactions = useMemo(() => {
    const result: ProcessedTransaction[] = [];

    for (const tx of transactions) {
      const action = tx.action.toUpperCase();
      
      let type: 'buy' | 'sell' | 'dividend' | 'transfer_in' | 'transfer_out' | null = null;
      
      if (action.includes('YOU BOUGHT')) {
        type = 'buy';
      } else if (action.includes('YOU SOLD')) {
        type = 'sell';
      } else if (action.includes('DIVIDEND')) {
        type = 'dividend';
      } else if (action.includes('TRANSFERRED FROM') && tx.symbol) {
        // Stock transferred in (shares type indicates a stock transfer, not cash)
        type = 'transfer_in';
      } else if (action.includes('TRANSFERRED TO') && tx.symbol) {
        // Stock transferred out
        type = 'transfer_out';
      }
      
      if (!type) continue;

      // Calculate the correct amount as quantity × price
      // The source CSV data sometimes has incorrect amounts
      const quantity = Math.abs(tx.quantity);
      const price = tx.price;
      
      // For buy/sell, calculate amount from quantity × price
      // For dividends and transfers, use the original amount
      let amount: number;
      if (type === 'buy' || type === 'sell') {
        amount = quantity * price;
      } else {
        amount = Math.abs(tx.amount);
      }

      result.push({
        date: tx.runDate,
        type,
        quantity,
        price,
        amount,
        description: tx.description,
      });
    }

    // Sort by date descending (most recent first)
    result.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });

    return result;
  }, [transactions]);

  // Calculate summary stats
  const summary = useMemo(() => {
    let totalBought = 0;
    let totalBoughtQty = 0;
    let totalSold = 0;
    let totalSoldQty = 0;
    let totalDividends = 0;
    let totalTransferredIn = 0;
    let totalTransferredInQty = 0;

    for (const tx of processedTransactions) {
      if (tx.type === 'buy') {
        totalBought += tx.amount;
        totalBoughtQty += tx.quantity;
      } else if (tx.type === 'sell') {
        totalSold += tx.amount;
        totalSoldQty += tx.quantity;
      } else if (tx.type === 'dividend') {
        totalDividends += tx.amount;
      } else if (tx.type === 'transfer_in') {
        totalTransferredIn += tx.amount;
        totalTransferredInQty += tx.quantity;
      }
    }

    const avgBuyPrice = totalBoughtQty > 0 ? totalBought / totalBoughtQty : 0;

    return {
      totalBought,
      totalBoughtQty,
      avgBuyPrice,
      totalSold,
      totalSoldQty,
      totalDividends,
      totalTransferredIn,
      totalTransferredInQty,
      transactionCount: processedTransactions.length,
    };
  }, [processedTransactions]);

  if (processedTransactions.length === 0) {
    return (
      <div className="stock-transaction-list empty">
        <p>No transactions found for this stock.</p>
      </div>
    );
  }

  return (
    <div className="stock-transaction-list">
      {/* Summary stats */}
      <div className="transaction-summary">
        <div className="summary-stat">
          <span className="summary-label">Total Invested</span>
          <span className="summary-value">${summary.totalBought.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">Avg Buy Price</span>
          <span className="summary-value">${summary.avgBuyPrice.toFixed(2)}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">Shares Bought</span>
          <span className="summary-value">{summary.totalBoughtQty.toFixed(2)}</span>
        </div>
        {summary.totalDividends > 0 && (
          <div className="summary-stat">
            <span className="summary-label">Dividends</span>
            <span className="summary-value positive">${summary.totalDividends.toFixed(2)}</span>
          </div>
        )}
        {summary.totalTransferredInQty > 0 && (
          <div className="summary-stat">
            <span className="summary-label">Shares Transferred In</span>
            <span className="summary-value">{summary.totalTransferredInQty.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Transaction table */}
      <div className="transaction-table-container">
        <table className="transaction-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th className="align-right">Quantity</th>
              <th className="align-right">Price</th>
              <th className="align-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {processedTransactions.map((tx, idx) => {
              const getTypeBadge = () => {
                switch (tx.type) {
                  case 'buy': return 'BUY';
                  case 'sell': return 'SELL';
                  case 'dividend': return 'DIV';
                  case 'transfer_in': return 'XFER IN';
                  case 'transfer_out': return 'XFER OUT';
                  default: return tx.type;
                }
              };
              
              const showQuantity = tx.type !== 'dividend';
              const showPrice = tx.type === 'buy' || tx.type === 'sell';
              const isPositive = tx.type === 'sell' || tx.type === 'dividend';
              const isNegative = tx.type === 'buy';
              const isTransfer = tx.type === 'transfer_in' || tx.type === 'transfer_out';
              
              return (
                <tr key={`${tx.date}-${tx.type}-${idx}`} className={tx.type}>
                  <td>{tx.date}</td>
                  <td>
                    <span className={`type-badge ${tx.type}`}>
                      {getTypeBadge()}
                    </span>
                  </td>
                  <td className="align-right">
                    {showQuantity ? tx.quantity.toFixed(tx.quantity % 1 === 0 ? 0 : 3) : '—'}
                  </td>
                  <td className="align-right">
                    {showPrice ? `$${tx.price.toFixed(2)}` : '—'}
                  </td>
                  <td className={`align-right ${isPositive ? 'positive' : ''}`}>
                    {isTransfer ? (
                      tx.amount > 0 ? `$${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
                    ) : (
                      <>
                        {isNegative ? '-' : '+'}${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="transaction-count">
        Showing {processedTransactions.length} transaction{processedTransactions.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
