import { useState, useMemo, useCallback, useEffect } from 'react';
import type { DCFInputs, FairValueEntry } from './StockOverviewView';
import './ReverseDCF.css';

interface ReverseDCFProps {
  symbol: string;
  currentPrice: number;
  initialInputs?: DCFInputs;
  fairValueHistory: FairValueEntry[];
  onSave?: (entry: FairValueEntry) => void;
}

const DEFAULT_INPUTS: DCFInputs = {
  currentRevenue: 0,
  currentEPS: 0,
  sharesOutstanding: 0,
  revenueGrowth: 10,
  targetMargin: 20,
  terminalPE: 20,
  yearsToTerminal: 5,
  discountRate: 10,
  dividendYield: 0,
  buybackYield: 0,
};

export function ReverseDCF({ symbol, currentPrice, initialInputs, fairValueHistory, onSave }: ReverseDCFProps) {
  const [inputs, setInputs] = useState<DCFInputs>(initialInputs || DEFAULT_INPUTS);
  const [showHistory, setShowHistory] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // Sync inputs when initialInputs changes (e.g., switching stocks)
  useEffect(() => {
    if (initialInputs) {
      setInputs(initialInputs);
    }
  }, [initialInputs]);

  // Calculate fair value based on inputs
  const calculatedFairValue = useMemo(() => {
    const {
      currentRevenue,
      sharesOutstanding,
      revenueGrowth,
      targetMargin,
      terminalPE,
      yearsToTerminal,
      discountRate,
      dividendYield = 0,
      buybackYield = 0,
    } = inputs;

    if (currentRevenue <= 0 || sharesOutstanding <= 0) {
      return 0;
    }

    // Project revenue to terminal year
    const terminalRevenue = currentRevenue * Math.pow(1 + revenueGrowth / 100, yearsToTerminal);
    
    // Calculate terminal earnings
    const terminalEarnings = terminalRevenue * (targetMargin / 100);
    
    // Calculate terminal EPS
    const terminalEPS = terminalEarnings / sharesOutstanding;
    
    // Apply terminal P/E to get terminal price
    const terminalPrice = terminalEPS * terminalPE;
    
    // Discount back to present value
    const discountFactor = Math.pow(1 + discountRate / 100, yearsToTerminal);
    const presentValue = terminalPrice / discountFactor;
    
    // Add cumulative shareholder yield (dividends + buybacks) over the holding period
    // This represents additional returns from dividends and share buybacks
    const shareholderYield = (dividendYield + buybackYield) / 100;
    const cumulativeYieldBonus = presentValue * shareholderYield * yearsToTerminal;
    
    return presentValue + cumulativeYieldBonus;
  }, [inputs]);
  
  // Calculate total shareholder yield
  const totalShareholderYield = (inputs.dividendYield || 0) + (inputs.buybackYield || 0);

  // Calculate upside/downside
  const upside = useMemo(() => {
    if (currentPrice <= 0 || calculatedFairValue <= 0) return 0;
    return ((calculatedFairValue - currentPrice) / currentPrice) * 100;
  }, [calculatedFairValue, currentPrice]);

  const handleInputChange = useCallback((field: keyof DCFInputs, value: string) => {
    const numValue = parseFloat(value) || 0;
    setInputs(prev => ({ ...prev, [field]: numValue }));
    setSaveStatus('idle');
  }, []);

  const handleSave = useCallback(() => {
    setSaveStatus('saving');
    
    try {
      const newEntry: FairValueEntry = {
        date: new Date().toISOString().split('T')[0],
        fairValue: calculatedFairValue,
        inputs: { ...inputs },
      };
      
      // Call the parent's onSave to persist to localStorage
      if (onSave) {
        onSave(newEntry);
      }
      
      setSaveStatus('saved');
      
      // Reset status after 3 seconds
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Error saving fair value:', error);
      setSaveStatus('error');
    }
  }, [calculatedFairValue, inputs, onSave]);

  return (
    <div className="reverse-dcf">
      {/* Results */}
      <div className="dcf-results">
        <div className="result-row main-result">
          <span className="result-label">Fair Value</span>
          <span className="result-value">
            ${calculatedFairValue > 0 ? calculatedFairValue.toFixed(2) : '—'}
          </span>
        </div>
        
        <div className="result-row">
          <span className="result-label">Current Price</span>
          <span className="result-value">${currentPrice.toFixed(2)}</span>
        </div>
        
        <div className="result-row">
          <span className="result-label">Upside / Downside</span>
          <span className={`result-value ${upside >= 0 ? 'positive' : 'negative'}`}>
            {upside >= 0 ? '+' : ''}{upside.toFixed(1)}%
          </span>
        </div>

        {totalShareholderYield > 0 && (
          <div className="result-row">
            <span className="result-label">Shareholder Yield</span>
            <span className="result-value yield-value">
              {totalShareholderYield.toFixed(1)}%
              <span className="yield-breakdown">
                ({inputs.dividendYield || 0}% div + {inputs.buybackYield || 0}% buyback)
              </span>
            </span>
          </div>
        )}

        <div className="result-indicator">
          <div 
            className={`indicator-badge ${upside >= 20 ? 'buy' : upside >= 0 ? 'hold' : upside >= -20 ? 'caution' : 'sell'}`}
          >
            {upside >= 20 ? 'UNDERVALUED' : upside >= 0 ? 'FAIRLY VALUED' : upside >= -20 ? 'CAUTION' : 'OVERVALUED'}
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="dcf-inputs">
        <div className="input-row">
          <label>Current Revenue</label>
          <input
            type="number"
            value={inputs.currentRevenue || ''}
            onChange={(e) => handleInputChange('currentRevenue', e.target.value)}
            placeholder="e.g., 150000000000"
          />
        </div>

        <div className="input-row">
          <label>Current EPS</label>
          <input
            type="number"
            step="0.01"
            value={inputs.currentEPS || ''}
            onChange={(e) => handleInputChange('currentEPS', e.target.value)}
            placeholder="e.g., 24.50"
          />
        </div>

        <div className="input-row">
          <label>Shares Outstanding</label>
          <input
            type="number"
            value={inputs.sharesOutstanding || ''}
            onChange={(e) => handleInputChange('sharesOutstanding', e.target.value)}
            placeholder="e.g., 2500000000"
          />
        </div>

        <div className="input-divider"></div>

        <div className="input-row">
          <label>Revenue Growth (%)</label>
          <input
            type="number"
            step="0.5"
            value={inputs.revenueGrowth}
            onChange={(e) => handleInputChange('revenueGrowth', e.target.value)}
          />
        </div>

        <div className="input-row">
          <label>Target Net Margin (%)</label>
          <input
            type="number"
            step="0.5"
            value={inputs.targetMargin}
            onChange={(e) => handleInputChange('targetMargin', e.target.value)}
          />
        </div>

        <div className="input-row">
          <label>Terminal P/E</label>
          <input
            type="number"
            step="0.5"
            value={inputs.terminalPE}
            onChange={(e) => handleInputChange('terminalPE', e.target.value)}
          />
        </div>

        <div className="input-row">
          <label>Years to Terminal</label>
          <input
            type="number"
            value={inputs.yearsToTerminal}
            onChange={(e) => handleInputChange('yearsToTerminal', e.target.value)}
          />
        </div>

        <div className="input-row">
          <label>Discount Rate (%)</label>
          <input
            type="number"
            step="0.5"
            value={inputs.discountRate}
            onChange={(e) => handleInputChange('discountRate', e.target.value)}
          />
        </div>

        <div className="input-divider"></div>

        <div className="input-row">
          <label>Dividend Yield (%)</label>
          <input
            type="number"
            step="0.1"
            value={inputs.dividendYield || 0}
            onChange={(e) => handleInputChange('dividendYield', e.target.value)}
          />
        </div>

        <div className="input-row">
          <label>Buyback Yield (%)</label>
          <input
            type="number"
            step="0.1"
            value={inputs.buybackYield || 0}
            onChange={(e) => handleInputChange('buybackYield', e.target.value)}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="dcf-actions">
        <button 
          className="save-btn"
          onClick={handleSave}
          disabled={saveStatus === 'saving' || calculatedFairValue <= 0}
        >
          {saveStatus === 'saving' ? 'Saving...' : 
           saveStatus === 'saved' ? '✓ Saved!' : 
           saveStatus === 'error' ? 'Error' : 
           'Save Fair Value'}
        </button>
        
        <button 
          className="history-btn"
          onClick={() => setShowHistory(!showHistory)}
          disabled={fairValueHistory.length === 0}
        >
          {showHistory ? 'Hide History' : `History (${fairValueHistory.length})`}
        </button>
      </div>

      {/* History */}
      {showHistory && fairValueHistory.length > 0 && (
        <div className="dcf-history">
          <h4>Fair Value History</h4>
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="align-right">Fair Value</th>
                <th className="align-right">Growth</th>
                <th className="align-right">Margin</th>
                <th className="align-right">P/E</th>
              </tr>
            </thead>
            <tbody>
              {[...fairValueHistory].reverse().map((entry, idx) => (
                <tr key={entry.date + idx}>
                  <td>{formatHistoryDate(entry.date)}</td>
                  <td className="align-right">${entry.fairValue.toFixed(2)}</td>
                  <td className="align-right">{entry.inputs.revenueGrowth}%</td>
                  <td className="align-right">{entry.inputs.targetMargin}%</td>
                  <td className="align-right">{entry.inputs.terminalPE}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatHistoryDate(dateStr: string): string {
  const date = new Date(dateStr);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
