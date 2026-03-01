import { useState, useEffect, useCallback } from 'react';
import type { Transaction, Position } from '../utils/parseTransactions';
import { StockPriceChart } from './StockPriceChart';
import { StockTransactionList } from './StockTransactionList';
import { InvestmentThesis } from './InvestmentThesis';
import { ReverseDCF } from './ReverseDCF';
import './StockOverviewView.css';

const FAIR_VALUE_STORAGE_KEY = 'fidelity_clone_fair_value_history';

export interface StockPriceData {
  date: string;
  close: number;
}

export interface FairValueEntry {
  date: string;
  fairValue: number;
  inputs: DCFInputs;
}

export interface DCFInputs {
  currentRevenue: number;
  currentEPS: number;
  sharesOutstanding: number;
  revenueGrowth: number;
  targetMargin: number;
  terminalPE: number;
  yearsToTerminal: number;
  discountRate: number;
  dividendYield?: number;
  buybackYield?: number;
}

export interface StockFairValueData {
  entries: FairValueEntry[];
  currentInputs: DCFInputs;
}

export interface ThesisData {
  thesis: string;
  lastUpdated: string;
}

interface StockOverviewViewProps {
  symbol: string;
  positions: Position[];
  transactions: Transaction[];
  onBack: () => void;
}

// Helper to load fair value data from localStorage
function loadFairValueFromStorage(): Record<string, StockFairValueData> {
  try {
    const stored = localStorage.getItem(FAIR_VALUE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

// Helper to save fair value data to localStorage
function saveFairValueToStorage(data: Record<string, StockFairValueData>) {
  try {
    localStorage.setItem(FAIR_VALUE_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
}

export function StockOverviewView({ symbol, positions, transactions, onBack }: StockOverviewViewProps) {
  const [priceData, setPriceData] = useState<StockPriceData[]>([]);
  const [thesisData, setThesisData] = useState<ThesisData | null>(null);
  const [fairValueData, setFairValueData] = useState<StockFairValueData | null>(null);
  const [loading, setLoading] = useState(true);

  // Get position info for this stock
  const position = positions.find(p => p.symbol === symbol);
  
  // Filter transactions for this stock
  const stockTransactions = transactions.filter(tx => tx.symbol === symbol);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Load price data
        const priceResponse = await fetch(`/data/stock_prices/${symbol}.json`);
        if (priceResponse.ok) {
          const prices = await priceResponse.json();
          setPriceData(prices);
        }

        // Load thesis data
        const thesisResponse = await fetch('/data/stock_thesis.json');
        if (thesisResponse.ok) {
          const allThesis = await thesisResponse.json();
          if (allThesis[symbol]) {
            setThesisData(allThesis[symbol]);
          }
        }

        // Load fair value history from JSON first
        const fvResponse = await fetch('/data/fair_value_history.json');
        let baseFairValue: StockFairValueData | null = null;
        if (fvResponse.ok) {
          const allFairValue = await fvResponse.json();
          if (allFairValue[symbol]) {
            baseFairValue = allFairValue[symbol];
          }
        }

        // Merge with localStorage data (localStorage entries take precedence)
        const storedData = loadFairValueFromStorage();
        if (storedData[symbol]) {
          // Merge: start with base JSON entries, add localStorage entries
          const baseEntries = baseFairValue?.entries || [];
          const storedEntries = storedData[symbol].entries || [];
          
          // Get all unique dates from both sources
          const entriesByDate = new Map<string, FairValueEntry>();
          baseEntries.forEach(e => entriesByDate.set(e.date, e));
          storedEntries.forEach(e => entriesByDate.set(e.date, e)); // localStorage overwrites
          
          const mergedEntries = Array.from(entriesByDate.values())
            .sort((a, b) => a.date.localeCompare(b.date));
          
          setFairValueData({
            entries: mergedEntries,
            currentInputs: storedData[symbol].currentInputs || baseFairValue?.currentInputs || {
              currentRevenue: 0, currentEPS: 0, sharesOutstanding: 0,
              revenueGrowth: 10, targetMargin: 20, terminalPE: 20,
              yearsToTerminal: 5, discountRate: 10,
            },
          });
        } else if (baseFairValue) {
          setFairValueData(baseFairValue);
        }
      } catch (error) {
        console.error('Error loading stock data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [symbol]);

  // Handle saving a new fair value entry
  const handleSaveFairValue = useCallback((newEntry: FairValueEntry) => {
    setFairValueData(prev => {
      const currentEntries = prev?.entries || [];
      
      // Check if entry for this date already exists
      const existingIndex = currentEntries.findIndex(e => e.date === newEntry.date);
      let updatedEntries: FairValueEntry[];
      
      if (existingIndex >= 0) {
        // Update existing entry
        updatedEntries = [...currentEntries];
        updatedEntries[existingIndex] = newEntry;
      } else {
        // Add new entry
        updatedEntries = [...currentEntries, newEntry].sort((a, b) => a.date.localeCompare(b.date));
      }
      
      const updatedData: StockFairValueData = {
        entries: updatedEntries,
        currentInputs: newEntry.inputs,
      };
      
      // Persist to localStorage
      const allStoredData = loadFairValueFromStorage();
      allStoredData[symbol] = updatedData;
      saveFairValueToStorage(allStoredData);
      
      return updatedData;
    });
  }, [symbol]);

  // Extract buy transactions for chart markers (including transfers in)
  const buyTransactions = stockTransactions.filter(tx => {
    const action = tx.action.toUpperCase();
    return action.includes('YOU BOUGHT') || 
           (action.includes('TRANSFERRED FROM') && tx.symbol);
  }).map(tx => {
    // Convert MM/DD/YYYY to YYYY-MM-DD
    const [month, day, year] = tx.runDate.split('/');
    const action = tx.action.toUpperCase();
    const isTransfer = action.includes('TRANSFERRED FROM');
    
    return {
      date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      // For transfers, price is 0 in the CSV, so we calculate from amount/quantity
      price: isTransfer && tx.quantity > 0 ? tx.amount / tx.quantity : tx.price,
      quantity: Math.abs(tx.quantity),
    };
  }).map(tx => {
    // Detect and fix swapped quantity/price values in CSV data
    // If price < $5 and quantity > 50, the values are likely swapped
    let { price, quantity } = tx;
    if (price > 0 && price < 5 && quantity > 50) {
      [price, quantity] = [quantity, price];
    }
    return { ...tx, price, quantity };
  }).filter(tx => tx.quantity > 0 && tx.price > 0 && !isNaN(tx.price)); // Filter out invalid entries

  // Debug: log buy transactions with prices to verify swap fix
  console.log(`[${symbol}] stockTransactions:`, stockTransactions.length, 'buyTransactions:', buyTransactions.length);
  console.log(`[${symbol}] sample buy prices:`, buyTransactions.slice(0, 5).map(tx => ({ date: tx.date, price: tx.price, qty: tx.quantity })));

  if (loading) {
    return (
      <div className="stock-overview-view">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Loading {symbol} data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stock-overview-view">
      {/* Header */}
      <div className="stock-header">
        <button className="back-button" onClick={onBack}>
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
          Back to Positions
        </button>
        <div className="stock-title">
          <h1>{symbol}</h1>
          <span className="stock-description">{position?.description || ''}</span>
        </div>
        {position && (
          <div className="stock-quick-stats">
            <div className="quick-stat">
              <span className="stat-label">Current Price</span>
              <span className="stat-value">${position.lastPrice?.toFixed(2) || '—'}</span>
            </div>
            <div className="quick-stat">
              <span className="stat-label">Your Shares</span>
              <span className="stat-value">{position.quantity.toFixed(position.quantity % 1 === 0 ? 0 : 2)}</span>
            </div>
            <div className="quick-stat">
              <span className="stat-label">Market Value</span>
              <span className="stat-value">${position.currentValue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '—'}</span>
            </div>
            <div className="quick-stat">
              <span className="stat-label">Total Return</span>
              <span className={`stat-value ${(position.totalGainPercent ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                {(position.totalGainPercent ?? 0) >= 0 ? '+' : ''}{position.totalGainPercent?.toFixed(2) || '0'}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="stock-content">
        <div className="stock-column left-column">
          {/* Price Chart */}
          <div className="card stock-chart-card">
            <div className="card-header">
              <h2 className="card-title">Price Chart</h2>
            </div>
            <StockPriceChart
              priceData={priceData}
              buyTransactions={buyTransactions}
              fairValueEntries={fairValueData?.entries || []}
            />
          </div>

          {/* Investment Thesis */}
          <div className="card stock-thesis-card">
            <div className="card-header">
              <h2 className="card-title">Investment Thesis</h2>
            </div>
            <InvestmentThesis 
              thesis={thesisData?.thesis || ''} 
              lastUpdated={thesisData?.lastUpdated || ''} 
            />
          </div>
        </div>

        <div className="stock-column right-column">
          {/* Reverse DCF */}
          <div className="card stock-dcf-card">
            <div className="card-header">
              <h2 className="card-title">Reverse DCF Calculator</h2>
            </div>
            <ReverseDCF
              symbol={symbol}
              currentPrice={position?.lastPrice || 0}
              initialInputs={fairValueData?.currentInputs}
              fairValueHistory={fairValueData?.entries || []}
              onSave={handleSaveFairValue}
            />
          </div>
        </div>
      </div>

      {/* Transaction History - Full Width */}
      <div className="card stock-transactions-card full-width-card">
        <div className="card-header">
          <h2 className="card-title">Transaction History</h2>
        </div>
        <StockTransactionList transactions={stockTransactions} />
      </div>
    </div>
  );
}
