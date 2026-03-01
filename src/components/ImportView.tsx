import { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import type { Transaction, Position } from '../utils/parseTransactions';
import './ImportView.css';

interface ImportViewProps {
  currentPositions: Position[];
  currentTransactions: Transaction[];
  onDataImported: (positions: Position[], transactions: Transaction[]) => void;
}

interface ParsedPositionRow {
  symbol: string;
  description: string;
  quantity: number;
  lastPrice: number;
  lastPriceChange: number;
  currentValue: number;
  todayGainDollar: number;
  todayGainPercent: number;
  totalGainDollar: number;
  totalGainPercent: number;
  percentOfAccount: number;
  costBasis: number;
  averageCost: number;
  type: string;
}

interface ParsedTransactionRow {
  runDate: string;
  action: string;
  symbol: string;
  description: string;
  type: string;
  quantity: number;
  price: number;
  commission: number;
  fees: number;
  accruedInterest: number;
  amount: number;
  cashBalance: number | string;
  settlementDate: string;
}

interface ImportStats {
  newPositions: number;
  updatedPositions: number;
  newTransactions: number;
  duplicateTransactions: number;
}

export function ImportView({ currentPositions, currentTransactions, onDataImported }: ImportViewProps) {
  const [positionsFile, setPositionsFile] = useState<File | null>(null);
  const [activityFile, setActivityFile] = useState<File | null>(null);
  const [parsedPositions, setParsedPositions] = useState<ParsedPositionRow[]>([]);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransactionRow[]>([]);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const positionsInputRef = useRef<HTMLInputElement>(null);
  const activityInputRef = useRef<HTMLInputElement>(null);

  // Helper to parse currency values
  const parseCurrency = (val: string | undefined): number => {
    if (!val) return 0;
    return parseFloat(val.replace(/[$+,]/g, '')) || 0;
  };

  // Helper to parse percentage values
  const parsePercent = (val: string | undefined): number => {
    if (!val) return 0;
    return parseFloat(val.replace(/[%+,]/g, '')) || 0;
  };

  // Parse positions CSV file
  const parsePositionsFile = useCallback((file: File): Promise<ParsedPositionRow[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvText = e.target?.result as string;
        Papa.parse<string[]>(csvText, {
          complete: (results) => {
            const positions: ParsedPositionRow[] = [];
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
              reject(new Error('Could not find header row in positions file'));
              return;
            }
            
            // Parse data rows
            for (let i = headerIndex + 1; i < rows.length; i++) {
              const row = rows[i];
              if (!row || row.length < 15 || !row[2]) continue;
              
              // Skip disclaimer rows
              if (row[0]?.startsWith('The data') || row[0]?.startsWith('Brokerage') || row[0]?.startsWith('Date downloaded')) {
                continue;
              }
              
              const symbol = row[2]?.trim();
              if (!symbol || symbol === 'Pending activity' || symbol.includes('**')) continue;
              
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
          error: (err: Error) => reject(err),
        });
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }, []);

  // Parse activity/transactions CSV file
  const parseActivityFile = useCallback((file: File): Promise<ParsedTransactionRow[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvText = e.target?.result as string;
        Papa.parse<string[]>(csvText, {
          complete: (results) => {
            const transactions: ParsedTransactionRow[] = [];
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
              reject(new Error('Could not find header row in activity file'));
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
          error: (err: Error) => reject(err),
        });
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }, []);

  // Handle positions file selection
  const handlePositionsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setPositionsFile(file);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const parsed = await parsePositionsFile(file);
      setParsedPositions(parsed);
    } catch (err) {
      setError(`Error parsing positions file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setParsedPositions([]);
    }
  };

  // Handle activity file selection
  const handleActivityFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setActivityFile(file);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const parsed = await parseActivityFile(file);
      setParsedTransactions(parsed);
    } catch (err) {
      setError(`Error parsing activity file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setParsedTransactions([]);
    }
  };

  // Create unique transaction key for deduplication
  const getTransactionKey = (tx: Transaction | ParsedTransactionRow): string => {
    return `${tx.runDate}|${tx.symbol}|${tx.action}|${tx.quantity}|${tx.amount}`;
  };

  // Merge and apply data
  const handleMergeData = useCallback(async () => {
    setIsProcessing(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      let newPositions: Position[] = [...currentPositions];
      let newTransactions: Transaction[] = [...currentTransactions];
      const stats: ImportStats = {
        newPositions: 0,
        updatedPositions: 0,
        newTransactions: 0,
        duplicateTransactions: 0,
      };
      
      // Merge positions (replace with new data if positions file provided)
      if (parsedPositions.length > 0) {
        const existingSymbols = new Set(currentPositions.map(p => p.symbol));
        
        newPositions = parsedPositions.map(p => ({
          symbol: p.symbol,
          description: p.description,
          quantity: p.quantity,
          costBasis: p.costBasis,
          averageCost: p.averageCost,
          lastPrice: p.lastPrice,
          lastPriceChange: p.lastPriceChange,
          currentValue: p.currentValue,
          todayGainDollar: p.todayGainDollar,
          todayGainPercent: p.todayGainPercent,
          totalGainDollar: p.totalGainDollar,
          totalGainPercent: p.totalGainPercent,
          percentOfAccount: p.percentOfAccount,
          type: p.type,
        }));
        
        for (const p of parsedPositions) {
          if (existingSymbols.has(p.symbol)) {
            stats.updatedPositions++;
          } else {
            stats.newPositions++;
          }
        }
      }
      
      // Merge transactions (add only new ones)
      if (parsedTransactions.length > 0) {
        const existingKeys = new Set(currentTransactions.map(getTransactionKey));
        
        for (const tx of parsedTransactions) {
          const key = getTransactionKey(tx);
          if (!existingKeys.has(key)) {
            newTransactions.push(tx);
            existingKeys.add(key);
            stats.newTransactions++;
          } else {
            stats.duplicateTransactions++;
          }
        }
        
        // Sort transactions by date (newest first)
        newTransactions.sort((a, b) => {
          const dateA = new Date(a.runDate);
          const dateB = new Date(b.runDate);
          return dateB.getTime() - dateA.getTime();
        });
      }
      
      setImportStats(stats);
      
      // Call the callback to update the app state
      onDataImported(newPositions, newTransactions);
      
      // Generate downloadable files
      await generateDownloadableFiles(newPositions, newTransactions);
      
      setSuccessMessage('Data imported successfully! Download links are available below.');
      
    } catch (err) {
      setError(`Error merging data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  }, [currentPositions, currentTransactions, parsedPositions, parsedTransactions, onDataImported]);

  // Generate downloadable CSV files
  const generateDownloadableFiles = async (positions: Position[], transactions: Transaction[]) => {
    // Generate positions CSV
    const positionsHeaders = [
      'Account Number', 'Account Name', 'Symbol', 'Description', 'Quantity',
      'Last Price', 'Last Price Change', 'Current Value', "Today's Gain/Loss Dollar",
      "Today's Gain/Loss Percent", 'Total Gain/Loss Dollar', 'Total Gain/Loss Percent',
      'Percent Of Account', 'Cost Basis Total', 'Average Cost Basis', 'Type'
    ];
    
    const positionsRows = positions.map(p => [
      'DEMO001',
      'Growth Portfolio',
      p.symbol,
      p.description,
      p.quantity.toString(),
      p.lastPrice ? `$${p.lastPrice.toFixed(2)}` : '',
      p.lastPriceChange ? (p.lastPriceChange >= 0 ? `+$${p.lastPriceChange.toFixed(2)}` : `-$${Math.abs(p.lastPriceChange).toFixed(2)}`) : '',
      p.currentValue ? `$${p.currentValue.toFixed(2)}` : '',
      p.todayGainDollar ? (p.todayGainDollar >= 0 ? `+$${p.todayGainDollar.toFixed(2)}` : `-$${Math.abs(p.todayGainDollar).toFixed(2)}`) : '',
      p.todayGainPercent ? `${p.todayGainPercent >= 0 ? '+' : ''}${p.todayGainPercent.toFixed(2)}%` : '',
      p.totalGainDollar ? (p.totalGainDollar >= 0 ? `+$${p.totalGainDollar.toFixed(2)}` : `-$${Math.abs(p.totalGainDollar).toFixed(2)}`) : '',
      p.totalGainPercent ? `${p.totalGainPercent >= 0 ? '+' : ''}${p.totalGainPercent.toFixed(2)}%` : '',
      p.percentOfAccount ? `${p.percentOfAccount.toFixed(2)}%` : '',
      `$${p.costBasis.toFixed(2)}`,
      `$${p.averageCost.toFixed(2)}`,
      p.type || 'Margin',
    ]);
    
    const positionsCsv = Papa.unparse({
      fields: positionsHeaders,
      data: positionsRows
    });
    
    // Generate transactions CSV
    const transactionHeaders = [
      'Run Date', 'Action', 'Symbol', 'Description', 'Type', 'Quantity',
      'Price ($)', 'Commission ($)', 'Fees ($)', 'Accrued Interest ($)',
      'Amount ($)', 'Cash Balance ($)', 'Settlement Date'
    ];
    
    const transactionRows = transactions.map(t => [
      t.runDate,
      t.action,
      t.symbol,
      t.description,
      t.type,
      t.quantity.toString(),
      t.price.toString(),
      t.commission.toString(),
      t.fees.toString(),
      t.accruedInterest.toString(),
      t.amount.toString(),
      t.cashBalance.toString(),
      t.settlementDate,
    ]);
    
    const transactionsCsv = Papa.unparse({
      fields: transactionHeaders,
      data: transactionRows
    });
    
    // Create download links
    const positionsBlob = new Blob([positionsCsv], { type: 'text/csv' });
    const transactionsBlob = new Blob([transactionsCsv], { type: 'text/csv' });
    
    const positionsUrl = URL.createObjectURL(positionsBlob);
    const transactionsUrl = URL.createObjectURL(transactionsBlob);
    
    // Store URLs for download buttons
    setDownloadUrls({
      positions: positionsUrl,
      transactions: transactionsUrl,
    });
  };

  const [downloadUrls, setDownloadUrls] = useState<{ positions: string | null; transactions: string | null }>({
    positions: null,
    transactions: null,
  });

  // Clear selections
  const handleClear = () => {
    setPositionsFile(null);
    setActivityFile(null);
    setParsedPositions([]);
    setParsedTransactions([]);
    setImportStats(null);
    setError(null);
    setSuccessMessage(null);
    setDownloadUrls({ positions: null, transactions: null });
    
    if (positionsInputRef.current) positionsInputRef.current.value = '';
    if (activityInputRef.current) activityInputRef.current.value = '';
  };

  return (
    <div className="import-view">
      <div className="import-header">
        <h2>Import Portfolio Data</h2>
        <p className="import-description">
          Upload new Positions and Activity CSV files from Fidelity to update your portfolio data.
          New transactions will be merged with existing data, and positions will be updated.
        </p>
      </div>

      <div className="import-sections">
        {/* Positions Upload Section */}
        <div className="import-section">
          <div className="section-header">
            <div className="section-icon">
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                <path fill="currentColor" d="M7 12h2v5H7zm4-3h2v8h-2zm4-3h2v11h-2z"/>
              </svg>
            </div>
            <h3>Positions CSV</h3>
          </div>
          
          <div className="file-upload-area" onClick={() => positionsInputRef.current?.click()}>
            <input
              ref={positionsInputRef}
              type="file"
              accept=".csv"
              onChange={handlePositionsFileChange}
              style={{ display: 'none' }}
            />
            <div className="upload-icon">
              <svg viewBox="0 0 24 24" width="48" height="48">
                <path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
              </svg>
            </div>
            {positionsFile ? (
              <div className="file-selected">
                <span className="file-name">{positionsFile.name}</span>
                <span className="file-info">{parsedPositions.length} positions found</span>
              </div>
            ) : (
              <div className="upload-prompt">
                <span>Click to upload Positions CSV</span>
                <span className="file-hint">Portfolio_Positions_*.csv</span>
              </div>
            )}
          </div>
          
          {parsedPositions.length > 0 && (
            <div className="preview-table">
              <h4>Preview ({parsedPositions.length} positions)</h4>
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Quantity</th>
                    <th>Last Price</th>
                    <th>Value</th>
                    <th>Cost Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedPositions.slice(0, 5).map((p, i) => (
                    <tr key={i}>
                      <td className="symbol">{p.symbol}</td>
                      <td>{p.quantity.toFixed(4)}</td>
                      <td>${p.lastPrice.toFixed(2)}</td>
                      <td>${p.currentValue.toFixed(2)}</td>
                      <td>${p.costBasis.toFixed(2)}</td>
                    </tr>
                  ))}
                  {parsedPositions.length > 5 && (
                    <tr className="more-rows">
                      <td colSpan={5}>...and {parsedPositions.length - 5} more</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Activity Upload Section */}
        <div className="import-section">
          <div className="section-header">
            <div className="section-icon">
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
              </svg>
            </div>
            <h3>Activity CSV</h3>
          </div>
          
          <div className="file-upload-area" onClick={() => activityInputRef.current?.click()}>
            <input
              ref={activityInputRef}
              type="file"
              accept=".csv"
              onChange={handleActivityFileChange}
              style={{ display: 'none' }}
            />
            <div className="upload-icon">
              <svg viewBox="0 0 24 24" width="48" height="48">
                <path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
              </svg>
            </div>
            {activityFile ? (
              <div className="file-selected">
                <span className="file-name">{activityFile.name}</span>
                <span className="file-info">{parsedTransactions.length} transactions found</span>
              </div>
            ) : (
              <div className="upload-prompt">
                <span>Click to upload Activity CSV</span>
                <span className="file-hint">History_for_Account_*.csv</span>
              </div>
            )}
          </div>
          
          {parsedTransactions.length > 0 && (
            <div className="preview-table">
              <h4>Preview ({parsedTransactions.length} transactions)</h4>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Symbol</th>
                    <th>Action</th>
                    <th>Qty</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedTransactions.slice(0, 5).map((t, i) => (
                    <tr key={i}>
                      <td>{t.runDate}</td>
                      <td className="symbol">{t.symbol}</td>
                      <td className="action">{t.action.includes('BOUGHT') ? 'BUY' : t.action.includes('SOLD') ? 'SELL' : 'OTHER'}</td>
                      <td>{t.quantity.toFixed(4)}</td>
                      <td className={t.amount >= 0 ? 'positive' : 'negative'}>
                        ${Math.abs(t.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {parsedTransactions.length > 5 && (
                    <tr className="more-rows">
                      <td colSpan={5}>...and {parsedTransactions.length - 5} more</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="message error-message">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          {error}
        </div>
      )}
      
      {successMessage && (
        <div className="message success-message">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          {successMessage}
        </div>
      )}

      {/* Import Stats */}
      {importStats && (
        <div className="import-stats">
          <h4>Import Summary</h4>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-value">{importStats.newPositions}</span>
              <span className="stat-label">New Positions</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{importStats.updatedPositions}</span>
              <span className="stat-label">Updated Positions</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{importStats.newTransactions}</span>
              <span className="stat-label">New Transactions</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{importStats.duplicateTransactions}</span>
              <span className="stat-label">Duplicates Skipped</span>
            </div>
          </div>
        </div>
      )}

      {/* Download Links */}
      {downloadUrls.positions && downloadUrls.transactions && (
        <div className="download-section">
          <h4>Download Updated Files</h4>
          <p className="download-hint">
            Save these files to your <code>public/</code> folder to persist the changes.
          </p>
          <div className="download-buttons">
            <a 
              href={downloadUrls.positions} 
              download={`Portfolio_Positions_${new Date().toISOString().split('T')[0]}.csv`}
              className="download-btn"
            >
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
              Download Positions CSV
            </a>
            <a 
              href={downloadUrls.transactions} 
              download="transactions.csv"
              className="download-btn"
            >
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
              Download Transactions CSV
            </a>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="import-actions">
        <button 
          className="btn-secondary"
          onClick={handleClear}
          disabled={isProcessing}
        >
          Clear All
        </button>
        <button 
          className="btn-primary"
          onClick={handleMergeData}
          disabled={isProcessing || (parsedPositions.length === 0 && parsedTransactions.length === 0)}
        >
          {isProcessing ? (
            <>
              <span className="spinner"></span>
              Processing...
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              Merge & Import Data
            </>
          )}
        </button>
      </div>

      {/* Current Data Info */}
      <div className="current-data-info">
        <h4>Current Portfolio Data</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-value">{currentPositions.length}</span>
            <span className="info-label">Positions</span>
          </div>
          <div className="info-item">
            <span className="info-value">{currentTransactions.length}</span>
            <span className="info-label">Transactions</span>
          </div>
        </div>
      </div>
    </div>
  );
}
