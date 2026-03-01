import { useState, useMemo, useEffect } from 'react';
import { BalanceChart, type ChartPeriod } from './BalanceChart';
import { AssetAllocation } from './AssetAllocation';
import { TWRRChart } from './TWRRChart';
import { getPerformanceData, calculateCumulativeTWRR, type PerformancePeriod } from '../data/mockPrices';
import { 
  extractDeposits, 
  loadVTIPrices, 
  calculateVTIPortfolioValues,
  type PortfolioData,
  type VTIPrice 
} from '../utils/parseTransactions';
import './SummaryView.css';

interface SummaryViewProps {
  portfolioData: PortfolioData;
  historicalData: { date: string; value: number }[];
  currentValue: number;
  todayChange: number;
  todayChangePercent: number;
}

export function SummaryView({ 
  portfolioData, 
  historicalData, 
  currentValue, 
  todayChange, 
  todayChangePercent 
}: SummaryViewProps) {
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('ALL');
  const [perfPeriod, setPerfPeriod] = useState<PerformancePeriod>('1D');
  const [showVTIComparison, setShowVTIComparison] = useState(false);
  const [vtiPrices, setVTIPrices] = useState<VTIPrice[]>([]);

  // Load VTI prices on mount
  useEffect(() => {
    loadVTIPrices().then(setVTIPrices);
  }, []);

  // Extract deposits from transactions
  const deposits = useMemo(() => {
    return extractDeposits(portfolioData.transactions);
  }, [portfolioData.transactions]);

  // Calculate VTI portfolio values starting from the portfolio's initial value
  const vtiPortfolioData = useMemo(() => {
    if (vtiPrices.length === 0 || historicalData.length === 0) {
      return [];
    }
    // Use the portfolio's starting date and value as the initial VTI investment
    const startDate = historicalData[0].date;
    const startValue = historicalData[0].value;
    return calculateVTIPortfolioValues(deposits, vtiPrices, startDate, startValue);
  }, [deposits, vtiPrices, historicalData]);

  // Calculate performance data based on selected period
  const performanceData = useMemo(() => getPerformanceData(perfPeriod), [perfPeriod]);

  // Calculate return based on selected period
  const getPeriodReturn = (period: ChartPeriod): number => {
    switch (period) {
      case '1M': return calculateCumulativeTWRR(1);
      case '3M': return calculateCumulativeTWRR(3);
      case '6M': return calculateCumulativeTWRR(6);
      case 'YTD': return calculateCumulativeTWRR(12); // Approximation for YTD
      case '1Y': return calculateCumulativeTWRR(12);
      case '2Y': return calculateCumulativeTWRR(24);
      case '3Y': return calculateCumulativeTWRR(36);
      case 'ALL': return calculateCumulativeTWRR('all');
      default: return 0;
    }
  };

  const periodReturn = getPeriodReturn(chartPeriod);
  const isPositiveReturn = periodReturn >= 0;

  const getPeriodLabel = (period: ChartPeriod): string => {
    switch (period) {
      case '1M': return 'in the past month';
      case '3M': return 'in the past 3 months';
      case '6M': return 'in the past 6 months';
      case 'YTD': return 'year to date';
      case '1Y': return 'in the past year';
      case '2Y': return 'in the past 2 years';
      case '3Y': return 'in the past 3 years';
      case 'ALL': return 'since inception';
      default: return '';
    }
  };

  // Calculate VTI comparison stats
  const getVTIStats = () => {
    if (vtiPortfolioData.length === 0 || historicalData.length === 0) {
      return null;
    }
    
    const lastVTI = vtiPortfolioData[vtiPortfolioData.length - 1]?.value || 0;
    const lastPortfolio = historicalData[historicalData.length - 1]?.value || 0;
    const difference = lastPortfolio - lastVTI;
    const percentDiff = lastVTI > 0 ? ((lastPortfolio - lastVTI) / lastVTI) * 100 : 0;
    
    return {
      vtiValue: lastVTI,
      portfolioValue: lastPortfolio,
      difference,
      percentDiff,
      outperforming: difference > 0
    };
  };

  const vtiStats = showVTIComparison ? getVTIStats() : null;

  return (
    <div className="summary-view">
      <div className="summary-grid">
        {/* Balance Card */}
        <div className="card balance-card">
          <div className="card-header">
            <h3 className="card-title">Balance</h3>
            <button className="info-btn">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
                <path fill="currentColor" d="M11 7h2v2h-2zm0 4h2v6h-2z"/>
              </svg>
            </button>
          </div>
          <div className="balance-amount">
            ${currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={`balance-change ${todayChange >= 0 ? 'positive' : 'negative'}`}>
            {todayChange >= 0 ? '+' : ''}{todayChange.toFixed(2)} ({todayChange >= 0 ? '+' : ''}{todayChangePercent.toFixed(2)}%)
            <span className="change-label">Today's gain/loss</span>
          </div>

          <BalanceChart 
            data={historicalData} 
            period={chartPeriod}
            vtiData={vtiPortfolioData}
            showVTI={showVTIComparison}
          />

          <div className="chart-footer">
            <span className={`period-return ${isPositiveReturn ? 'positive' : 'negative'}`}>
              {isPositiveReturn ? '+' : ''}{periodReturn.toFixed(2)}% {getPeriodLabel(chartPeriod)}
            </span>
          </div>

          <div className="period-selector">
            {(['1M', '3M', '6M', 'YTD', '1Y', '2Y', '3Y', 'ALL'] as ChartPeriod[]).map((period) => (
              <button
                key={period}
                className={`period-btn ${chartPeriod === period ? 'active' : ''}`}
                onClick={() => setChartPeriod(period)}
              >
                {period === 'ALL' ? 'Inception' : period}
              </button>
            ))}
          </div>

          {/* VTI Comparison Toggle */}
          <div className="vti-comparison-toggle">
            <label>
              <input 
                type="checkbox" 
                checked={showVTIComparison}
                onChange={(e) => setShowVTIComparison(e.target.checked)}
              />
              Compare to VTI (Total Stock Market)
              <svg className="vti-info-icon" viewBox="0 0 24 24" aria-label="Shows what your portfolio would be worth if you invested the same amounts into VTI instead">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
                <path fill="currentColor" d="M11 7h2v2h-2zm0 4h2v6h-2z"/>
              </svg>
            </label>
          </div>

          {/* VTI Comparison Stats */}
          {showVTIComparison && vtiStats && (
            <div className="vti-comparison-stats">
              <div className="vti-stat">
                <span className="vti-stat-dot portfolio"></span>
                <span className="vti-stat-label">You:</span>
                <span className={`vti-stat-value ${vtiStats.outperforming ? 'positive' : 'negative'}`}>
                  ${vtiStats.portfolioValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="vti-stat">
                <span className="vti-stat-dot vti"></span>
                <span className="vti-stat-label">VTI:</span>
                <span className="vti-stat-value">
                  ${vtiStats.vtiValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="vti-stat">
                <span className="vti-stat-label">Diff:</span>
                <span className={`vti-stat-value ${vtiStats.outperforming ? 'positive' : 'negative'}`}>
                  {vtiStats.outperforming ? '+' : ''}{vtiStats.percentDiff.toFixed(1)}%
                </span>
              </div>
            </div>
          )}

        </div>

        {/* Performance Card */}
        <div className="card performance-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Performance</h3>
              <div className="perf-date">As of Jan-02-2026 ET</div>
            </div>
            <button className="info-btn">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
                <path fill="currentColor" d="M11 7h2v2h-2zm0 4h2v6h-2z"/>
              </svg>
            </button>
          </div>

          <div className="performance-list">
            {performanceData.map((item, index) => (
              <div key={index} className="perf-row">
                <span className="perf-name">{item.name}</span>
                <span className={`perf-value ${item.value >= 0 ? 'positive' : 'negative'}`}>
                  {item.value >= 0 ? '+' : ''}{item.value.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>

          <div className="period-selector perf-period">
            {(['1D', '1M', '3M', '6M', 'YTD', '1Y', '2Y', 'All'] as const).map((period) => (
              <button
                key={period}
                className={`period-btn ${perfPeriod === period ? 'active' : ''}`}
                onClick={() => setPerfPeriod(period)}
              >
                {period === 'All' ? 'Inception' : period}
              </button>
            ))}
          </div>

          <a href="#" className="see-details">See details</a>
        </div>

        {/* Asset Allocation Card */}
        <div className="card allocation-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Asset allocation</h3>
              <div className="alloc-date">As of 01/04/2026</div>
            </div>
            <button className="info-btn">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
                <path fill="currentColor" d="M11 7h2v2h-2zm0 4h2v6h-2z"/>
              </svg>
            </button>
          </div>
          <AssetAllocation />
        </div>
      </div>

      {/* Top Movers Card */}
      <div className="card movers-card">
        <h3 className="card-title">Your top and bottom movers</h3>
        <div className="movers-table">
          <div className="movers-header">
            <span>Symbol</span>
            <span>Today's gain/loss</span>
            <span>Last price</span>
          </div>
          <div className="mover-row positive">
            <span className="mover-symbol">
              <span className="mover-dot up"></span>
              ASML
            </span>
            <span className="mover-change">+$164.36 (+8.77%)</span>
            <span className="mover-price">$1,163.78</span>
          </div>
          <div className="mover-row positive">
            <span className="mover-symbol">
              <span className="mover-dot up"></span>
              TXRH
            </span>
            <span className="mover-change">+$117.92 (+3.22%)</span>
            <span className="mover-price">$171.36</span>
          </div>
          <div className="mover-row negative">
            <span className="mover-symbol">
              <span className="mover-dot down"></span>
              META
            </span>
            <span className="mover-change">-$251.68 (-1.47%)</span>
            <span className="mover-price">$650.41</span>
          </div>
          <div className="mover-row negative">
            <span className="mover-symbol">
              <span className="mover-dot down"></span>
              AMZN
            </span>
            <span className="mover-change">-$180.61 (-1.83%)</span>
            <span className="mover-price">$226.50</span>
          </div>
        </div>
      </div>

      {/* TWRR Chart */}
      <TWRRChart />
    </div>
  );
}
