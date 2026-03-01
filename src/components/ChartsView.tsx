import { useMemo, useState, useEffect } from 'react';
import {
  ResponsiveContainer, Tooltip, Cell, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
  AreaChart, Area, Treemap, LineChart, Line
} from 'recharts';
import { monthlyTWRR } from '../data/mockPrices';
import { extractDeposits } from '../utils/parseTransactions';
import { 
  loadDailySnapshots, 
  getBestDays, 
  getWorstDays, 
  getConcentrationOverTime,
  getSymbolHistoryWithCostBasis,
  getPillarStocks,
  getTopStocks,
  getAllStocksEverHeld,
  getAllocationOverTimeForStocks,
  getOtherSymbolsForStockList,
  type PortfolioSnapshots,
  type AllocationChartMode
} from '../utils/loadSnapshots';
import type { Position, Transaction } from '../utils/parseTransactions';
import './ChartsView.css';

interface ChartsViewProps {
  positions: Position[];
  transactions: Transaction[];
  totalValue: number;
}

// Vibrant color palette for treemap
const COLORS = [
  '#0d9488', '#4ECDC4', '#0284c7', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#f97316', '#6366f1', '#06b6d4',
  '#84cc16', '#14b8a6', '#a855f7', '#eab308', '#ef4444'
];

// Position category definitions
const LEVERAGED_FUNDS = new Set([
  'TQQQ', 'TNA', 'SPXL', 'QLD', 'CURE', 'SPUU', 'SOXL', 'WEBL', 'TMF',
  'AMZU', 'DUOG', 'PYPG', 'KMLI', 'GGLL', 'AMDL', 'ADBG', 'CELT', 'BULZ',
  'SSO', 'UPRO', 'UDOW', 'TECL', 'LABU', 'FAS', 'FNGU', 'NAIL', 'RETL'
]);

const MARKET_FUNDS = new Set([
  'VTI', 'FSKAX', 'SPSM', 'QQQ', 'VOO', 'SPY', 'IVV', 'VT', 'VXUS',
  'FZROX', 'FNILX', 'FXAIX', 'ITOT', 'SCHB', 'SWTSX', 'VTV', 'VUG',
  'IJR', 'IJH', 'IWM', 'IWF', 'IWD', 'VBK', 'VBR', 'VB', 'VO', 'VV'
]);

type AllocationFilter = 'all' | 'stocks' | 'leveraged' | 'market';

// Custom content renderer for Treemap cells
interface TreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  name?: string;
  percent?: number;
  value?: number;
}

const CustomTreemapContent = (props: TreemapContentProps) => {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, name = '', percent = 0, value = 0 } = props;
  
  const displayPercent = percent.toFixed(1);
  const numPercent = percent;
  const isLargeHolding = numPercent >= 5.0;

  // Determine size constraints for rendering details
  const showLogo = width > 50 && height > 50;
  const showText = width > 70 && height > 55;
  const showValue = width > 100 && height > 80;
  
  // Determine logo size based on holding size and available space
  let logoSize = 28;
  if (showText) {
    if (isLargeHolding && width > 120 && height > 120) {
      logoSize = 56;
    } else if (width > 100 && height > 100) {
      logoSize = 42;
    } else {
      logoSize = 32;
    }
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    target.style.display = 'none';
    const parent = target.parentElement;
    if (parent) {
      parent.innerHTML = `<span style="font-size: ${logoSize * 0.35}px; font-weight: 800; color: #64748b;">${name.substring(0, 2)}</span>`;
    }
  };

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: COLORS[index % COLORS.length],
          stroke: '#1a1a1a',
          strokeWidth: 2,
          rx: 6,
          ry: 6,
        }}
      />
      {showLogo && (
        <foreignObject x={x} y={y} width={width} height={height} style={{ overflow: 'hidden', pointerEvents: 'none' }}>
          <div className="treemap-cell-content">
            <div 
              className="treemap-logo-container"
              style={{ width: logoSize, height: logoSize }}
            >
              <img 
                src={`https://assets.parqet.com/logos/symbol/${name}?format=png`} 
                alt={name}
                className="treemap-logo"
                onError={handleImageError}
              />
            </div>
            {showText && (
              <div className="treemap-text-container">
                <span className={`treemap-symbol ${isLargeHolding ? 'large' : ''}`}>
                  {name}
                </span>
                <span className={`treemap-percent ${isLargeHolding ? 'large' : ''}`}>
                  {displayPercent}%
                </span>
                {showValue && (
                  <span className="treemap-value">
                    ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                )}
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
};

// Stacked area chart colors
const ALLOCATION_COLORS = [
  '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#64748b'  // "Other" color
];

export function ChartsView({ positions, transactions, totalValue }: ChartsViewProps) {
  const [snapshots, setSnapshots] = useState<PortfolioSnapshots | null>(null);
  const [allocationMode, setAllocationMode] = useState<AllocationChartMode>('pillars');
  const [allocationFilter, setAllocationFilter] = useState<AllocationFilter>('all');
  const [selectedAllocationSymbol, setSelectedAllocationSymbol] = useState<string | null>(null);
  const [showCostBasis, setShowCostBasis] = useState(false);

  // Load snapshots data
  useEffect(() => {
    loadDailySnapshots()
      .then(setSnapshots)
      .catch(err => console.error('Failed to load snapshots:', err));
  }, []);

  // Best and worst days
  const bestDays = useMemo(() => {
    if (!snapshots) return [];
    return getBestDays(snapshots, 10);
  }, [snapshots]);

  const worstDays = useMemo(() => {
    if (!snapshots) return [];
    return getWorstDays(snapshots, 10);
  }, [snapshots]);

  // Create symbol filter function based on current filter
  const createSymbolFilter = (filter: AllocationFilter) => {
    if (filter === 'all') return undefined;
    return (symbol: string) => {
      if (filter === 'leveraged') return LEVERAGED_FUNDS.has(symbol);
      if (filter === 'market') return MARKET_FUNDS.has(symbol);
      // stocks = not leveraged and not market
      return !LEVERAGED_FUNDS.has(symbol) && !MARKET_FUNDS.has(symbol);
    };
  };

  // Calculate stock lists for each mode
  const stockLists = useMemo(() => {
    if (!snapshots) return { pillars: [], topStocks: [], all: [] };
    return {
      pillars: getPillarStocks(snapshots, transactions),
      topStocks: getTopStocks(transactions, snapshots),
      all: getAllStocksEverHeld(snapshots),
    };
  }, [snapshots, transactions]);

  // Allocation over time data (dynamically calculated based on mode)
  const allocationOverTimeData = useMemo(() => {
    if (!snapshots) return { data: [], symbols: [] };
    
    // Map allocation mode to stockLists key (handle 'top-stocks' -> 'topStocks')
    const modeToKey: Record<AllocationChartMode, keyof typeof stockLists> = {
      'pillars': 'pillars',
      'top-stocks': 'topStocks',
      'all': 'all',
    };
    const stockList = stockLists[modeToKey[allocationMode]];
    return getAllocationOverTimeForStocks(snapshots, stockList);
  }, [snapshots, stockLists, allocationMode]);

  // Get single stock investment history when a symbol is selected (includes cost basis)
  const selectedSymbolHistory = useMemo(() => {
    if (!snapshots || !selectedAllocationSymbol) return [];
    // Pass positions data so we can use actual average cost for accurate cost basis
    return getSymbolHistoryWithCostBasis(snapshots, transactions, selectedAllocationSymbol, positions);
  }, [snapshots, transactions, selectedAllocationSymbol, positions]);

  // Get "Other" symbols for tooltip
  const otherSymbolsList = useMemo(() => {
    if (!snapshots) return [];
    // Map allocation mode to stockLists key (handle 'top-stocks' -> 'topStocks')
    const modeToKey: Record<AllocationChartMode, keyof typeof stockLists> = {
      'pillars': 'pillars',
      'top-stocks': 'topStocks',
      'all': 'all',
    };
    const stockList = stockLists[modeToKey[allocationMode]];
    return getOtherSymbolsForStockList(snapshots, stockList);
  }, [snapshots, stockLists, allocationMode]);

  // Concentration over time data (filtered)
  const concentrationData = useMemo(() => {
    if (!snapshots) return [];
    const symbolFilter = createSymbolFilter(allocationFilter);
    return getConcentrationOverTime(snapshots, symbolFilter);
  }, [snapshots, allocationFilter]);

  // Helper function to categorize positions
  const getPositionCategory = (symbol: string): 'stocks' | 'leveraged' | 'market' => {
    if (LEVERAGED_FUNDS.has(symbol)) return 'leveraged';
    if (MARKET_FUNDS.has(symbol)) return 'market';
    return 'stocks';
  };

  // Prepare allocation data for treemap
  const allocationData = useMemo(() => {
    const filteredPositions = positions.filter(p => {
      if (p.currentValue <= 0) return false;
      if (p.symbol === 'CASH') return false; // Exclude cash from allocation chart
      if (allocationFilter === 'all') return true;
      return getPositionCategory(p.symbol) === allocationFilter;
    });

    // Calculate total for filtered positions to get accurate percentages
    const filteredTotal = filteredPositions.reduce((sum, p) => sum + p.currentValue, 0);

    return filteredPositions
      .map(p => ({
        name: p.symbol,
        value: p.currentValue,
        percent: filteredTotal > 0 ? (p.currentValue / filteredTotal) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [positions, totalValue, allocationFilter]);

  // Calculate category totals for display
  const categoryTotals = useMemo(() => {
    const totals = { stocks: 0, leveraged: 0, market: 0 };
    positions.forEach(p => {
      if (p.currentValue > 0 && p.symbol !== 'CASH') {
        const category = getPositionCategory(p.symbol);
        totals[category] += p.currentValue;
      }
    });
    return totals;
  }, [positions]);

  // Prepare gain/loss data for bar chart (filtered)
  const gainLossData = useMemo(() => {
    return positions
      .filter(p => {
        if (p.currentValue <= 0) return false;
        if (p.symbol === 'CASH') return false;
        if (allocationFilter === 'all') return true;
        return getPositionCategory(p.symbol) === allocationFilter;
      })
      .map(p => ({
        symbol: p.symbol,
        gainDollar: p.totalGainDollar,
        gainPercent: p.totalGainPercent,
      }))
      .sort((a, b) => (b.gainDollar ?? 0) - (a.gainDollar ?? 0));
  }, [positions, allocationFilter]);

  // Prepare monthly returns for calendar heatmap
  const monthlyReturnsData = useMemo(() => {
    const years: { [year: string]: { [month: string]: number } } = {};
    
    monthlyTWRR.forEach(({ month, return: ret }) => {
      const [year, m] = month.split('-');
      if (!years[year]) years[year] = {};
      years[year][m] = ret;
    });
    
    return years;
  }, []);

  // Prepare deposits data using extractDeposits utility
  const depositsData = useMemo(() => {
    const deposits = extractDeposits(transactions);
    const depositsByMonth: { [month: string]: number } = {};
    
    deposits.forEach(d => {
      const month = d.date.substring(0, 7); // YYYY-MM from YYYY-MM-DD
      depositsByMonth[month] = (depositsByMonth[month] || 0) + d.amount;
    });
    
    // Convert to array and calculate cumulative
    let cumulative = 0;
    return Object.entries(depositsByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => {
        cumulative += amount;
        return { month, amount, cumulative };
      });
  }, [transactions]);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Custom tooltip for treemap
  const TreemapTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; value: number; percent: number } }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="chart-tooltip treemap-tooltip">
          <p className="tooltip-label">{data.name}</p>
          <p className="tooltip-value">${data.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          <p className="tooltip-percent">{data.percent.toFixed(1)}% of portfolio</p>
        </div>
      );
    }
    return null;
  };

  // Get color for heatmap cell based on return value - refined palette for dark theme
  const getHeatmapColor = (value: number | undefined): string => {
    if (value === undefined) return 'transparent';
    // Rich greens for gains
    if (value >= 10) return '#10b981';  // Emerald 500
    if (value >= 5) return '#34d399';   // Emerald 400
    if (value >= 2) return '#6ee7b7';   // Emerald 300
    if (value >= 0) return '#a7f3d0';   // Emerald 200
    // Rich reds for losses
    if (value >= -2) return '#fca5a5';  // Red 300
    if (value >= -5) return '#f87171';  // Red 400
    if (value >= -10) return '#ef4444'; // Red 500
    return '#dc2626';                   // Red 600
  };

  const formatMonth = (monthStr: string) => {
    const [, m] = monthStr.split('-');
    return monthNames[parseInt(m) - 1];
  };

  // Get filter label for display
  const getFilterLabel = () => {
    switch (allocationFilter) {
      case 'stocks': return 'Individual Stocks';
      case 'leveraged': return 'Leveraged Funds';
      case 'market': return 'Index Funds';
      default: return 'All Positions';
    }
  };

  return (
    <div className="charts-view">
      {/* Global Filter Toolbar */}
      <div className="charts-filter-toolbar">
        <span className="filter-label">Filter by category:</span>
        <div className="filter-btn-group">
          <button 
            className={`filter-btn ${allocationFilter === 'all' ? 'active' : ''}`}
            onClick={() => setAllocationFilter('all')}
          >
            All
          </button>
          <button 
            className={`filter-btn ${allocationFilter === 'stocks' ? 'active' : ''}`}
            onClick={() => setAllocationFilter('stocks')}
            title={`$${categoryTotals.stocks.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
          >
            <span className="filter-dot stocks"></span>
            Stocks
          </button>
          <button 
            className={`filter-btn ${allocationFilter === 'leveraged' ? 'active' : ''}`}
            onClick={() => setAllocationFilter('leveraged')}
            title={`$${categoryTotals.leveraged.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
          >
            <span className="filter-dot leveraged"></span>
            Leveraged
          </button>
          <button 
            className={`filter-btn ${allocationFilter === 'market' ? 'active' : ''}`}
            onClick={() => setAllocationFilter('market')}
            title={`$${categoryTotals.market.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
          >
            <span className="filter-dot market"></span>
            Index Funds
          </button>
        </div>
      </div>

      <div className="charts-grid">
        {/* Position Allocation Treemap */}
        <div className="chart-card allocation-treemap">
          <div className="chart-header">
            <h3>Position Allocation</h3>
            <span className="chart-subtitle">
              {allocationFilter === 'all' ? 'Current portfolio breakdown by holding' : `Showing ${getFilterLabel()} only`}
            </span>
          </div>
          {allocationData.length > 0 ? (
            <div className="chart-content treemap-content">
              <ResponsiveContainer width="100%" height={380}>
                <Treemap
                  data={allocationData}
                  dataKey="value"
                  aspectRatio={4 / 3}
                  stroke="#1a1a1a"
                  content={<CustomTreemapContent />}
                >
                  <Tooltip content={<TreemapTooltip />} />
                </Treemap>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-content empty-chart">
              <p>No positions in this category</p>
            </div>
          )}
        </div>

        {/* Total Gain/Loss by Position */}
        <div className="chart-card gain-loss-chart">
          <div className="chart-header">
            <h3>Total Gain/Loss by Position</h3>
            <span className="chart-subtitle">
              {allocationFilter === 'all' ? 'Unrealized gains and losses in dollars' : `Showing ${getFilterLabel()} only`}
            </span>
          </div>
          {gainLossData.length > 0 ? (
            <div className="chart-content">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={gainLossData}
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 50, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                  <XAxis 
                    type="number" 
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                    tick={{ fill: '#888', fontSize: 11 }}
                    axisLine={{ stroke: '#444' }}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="symbol" 
                    tick={{ fill: '#ccc', fontSize: 11 }}
                    axisLine={{ stroke: '#444' }}
                    width={45}
                  />
                  <ReferenceLine x={0} stroke="#666" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 4 }}
                    formatter={(value) => [typeof value === 'number' ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$0', 'Gain/Loss' as const]}
                    labelFormatter={(label) => label}
                  />
                  <Bar 
                    dataKey="gainDollar" 
                    fill="#4caf50"
                    radius={[0, 4, 4, 0]}
                  >
                    {gainLossData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={(entry.gainDollar ?? 0) >= 0 ? '#4caf50' : '#ef5350'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-content empty-chart">
              <p>No {getFilterLabel().toLowerCase()} in this portfolio</p>
            </div>
          )}
        </div>

        {/* Monthly Returns Heatmap */}
        <div className="chart-card heatmap-chart">
          <div className="chart-header">
            <h3>Monthly Returns Heatmap</h3>
            <span className="chart-subtitle">TWRR by month and year</span>
          </div>
          <div className="chart-content">
            <div className="heatmap-container">
              <div className="heatmap-header">
                <div className="heatmap-year-label"></div>
                {monthNames.map(m => (
                  <div key={m} className="heatmap-month-label">{m}</div>
                ))}
              </div>
              {Object.entries(monthlyReturnsData).sort(([a], [b]) => a.localeCompare(b)).map(([year, months]) => (
                <div key={year} className="heatmap-row">
                  <div className="heatmap-year-label">{year}</div>
                  {monthNames.map((_, idx) => {
                    const monthKey = String(idx + 1).padStart(2, '0');
                    const value = months[monthKey];
                    return (
                      <div 
                        key={monthKey} 
                        className="heatmap-cell"
                        style={{ backgroundColor: getHeatmapColor(value) }}
                        title={value !== undefined ? `${year}-${monthKey}: ${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : 'No data'}
                      >
                        {value !== undefined && (
                          <span className={`heatmap-value ${value >= 0 ? 'positive' : 'negative'}`}>
                            {value >= 0 ? '+' : ''}{value.toFixed(1)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="heatmap-legend">
                <span className="legend-label">Loss</span>
                <div className="legend-gradient"></div>
                <span className="legend-label">Gain</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cumulative Deposits */}
        <div className="chart-card deposits-chart">
          <div className="chart-header">
            <h3>Cumulative Contributions</h3>
            <span className="chart-subtitle">Total capital deposited over time</span>
          </div>
          <div className="chart-content">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={depositsData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                <defs>
                  <linearGradient id="depositGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#45B7D1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#45B7D1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis 
                  dataKey="month" 
                  tickFormatter={formatMonth}
                  tick={{ fill: '#888', fontSize: 11 }}
                  axisLine={{ stroke: '#444' }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                  tick={{ fill: '#888', fontSize: 11 }}
                  axisLine={{ stroke: '#444' }}
                  width={55}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 4 }}
                  formatter={(value) => [typeof value === 'number' ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$0', 'Total Contributed' as const]}
                  labelFormatter={(label) => {
                    const [year, month] = label.split('-');
                    return `${monthNames[parseInt(month) - 1]} ${year}`;
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="cumulative" 
                  stroke="#45B7D1" 
                  strokeWidth={2}
                  fill="url(#depositGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Best/Worst Days Analysis */}
        <div className="chart-card best-worst-days">
          <div className="chart-header">
            <h3>Best & Worst Days</h3>
            <span className="chart-subtitle">Top 10 portfolio performance extremes</span>
          </div>
          <div className="chart-content best-worst-content">
            <div className="days-columns">
              <div className="days-column best-days">
                <h4>
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>
                  </svg>
                  Best Days
                </h4>
                <div className="days-table">
                  {bestDays.map((day, index) => (
                    <div key={day.date} className="day-row">
                      <span className="day-rank">#{index + 1}</span>
                      <span className="day-date">{day.date}</span>
                      <span className="day-change positive">
                        +${day.dayChange.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </span>
                      <span className="day-percent positive">+{day.dayChangePercent.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="days-column worst-days">
                <h4>
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M16 18l2.29-2.29-4.88-4.88-4 4L2 7.41 3.41 6l6 6 4-4 6.3 6.29L22 12v6z"/>
                  </svg>
                  Worst Days
                </h4>
                <div className="days-table">
                  {worstDays.map((day, index) => (
                    <div key={day.date} className="day-row">
                      <span className="day-rank">#{index + 1}</span>
                      <span className="day-date">{day.date}</span>
                      <span className="day-change negative">
                        ${day.dayChange.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </span>
                      <span className="day-percent negative">{day.dayChangePercent.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Allocation Over Time */}
        <div className="chart-card allocation-time-chart">
          <div className="chart-header">
            <div className="chart-header-row">
              <div>
                {selectedAllocationSymbol ? (
                  <>
                    <button 
                      className="back-btn"
                      onClick={() => setSelectedAllocationSymbol(null)}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                      </svg>
                      Back to Allocation
                    </button>
                    <h3>{selectedAllocationSymbol} Investment Over Time</h3>
                    <span className="chart-subtitle">Market value of position over time</span>
                  </>
                ) : (
                  <>
                    <h3>Allocation Over Time</h3>
                    <span className="chart-subtitle">Growth portfolio stocks - click legend to see investment history</span>
                  </>
                )}
              </div>
              {selectedAllocationSymbol ? (
                <label className="cost-basis-toggle">
                  <input
                    type="checkbox"
                    checked={showCostBasis}
                    onChange={(e) => setShowCostBasis(e.target.checked)}
                  />
                  <span className="toggle-label">Show Cost Basis</span>
                </label>
              ) : (
                <div className="chart-controls">
                  <button 
                    className={`control-btn ${allocationMode === 'pillars' ? 'active' : ''}`}
                    onClick={() => setAllocationMode('pillars')}
                    title="Stocks with $4K+ invested or 15%+ allocation"
                  >
                    Pillars ({stockLists.pillars.length})
                  </button>
                  <button 
                    className={`control-btn ${allocationMode === 'top-stocks' ? 'active' : ''}`}
                    onClick={() => setAllocationMode('top-stocks')}
                    title="Stocks with >$1K invested"
                  >
                    Top Stocks ({stockLists.topStocks.length})
                  </button>
                  <button 
                    className={`control-btn ${allocationMode === 'all' ? 'active' : ''}`}
                    onClick={() => setAllocationMode('all')}
                    title="All stocks ever held"
                  >
                    All ({stockLists.all.length})
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="chart-content">
            {selectedAllocationSymbol ? (
              // Single stock investment history view
              selectedSymbolHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart 
                    data={selectedSymbolHistory} 
                    margin={{ top: 10, right: 30, left: 0, bottom: 10 }}
                  >
                    <defs>
                      <linearGradient id="investmentGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="costBasisGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: '#888', fontSize: 10 }}
                      axisLine={{ stroke: '#444' }}
                      tickFormatter={(date) => {
                        const d = new Date(date);
                        return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`;
                      }}
                      interval="preserveStartEnd"
                      minTickGap={50}
                    />
                    <YAxis 
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                      tick={{ fill: '#888', fontSize: 11 }}
                      axisLine={{ stroke: '#444' }}
                      width={55}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 4 }}
                      formatter={(value, name) => {
                        const v = typeof value === 'number' ? value : 0;
                        if (name === 'marketValue') return [`$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Market Value' as const];
                        if (name === 'costBasis') return [`$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Cost Basis' as const];
                        return [`${v.toFixed(1)}%`, 'Allocation' as const];
                      }}
                      labelFormatter={(label) => label}
                    />
                    {showCostBasis && (
                      <Area 
                        type="monotone" 
                        dataKey="costBasis" 
                        stroke="#f59e0b" 
                        strokeWidth={2}
                        fill="url(#costBasisGradient)"
                        name="costBasis"
                      />
                    )}
                    <Area 
                      type="monotone" 
                      dataKey="marketValue" 
                      stroke="#0ea5e9" 
                      strokeWidth={2}
                      fill="url(#investmentGradient)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-chart">
                  <p>No investment history for {selectedAllocationSymbol}</p>
                </div>
              )
            ) : (
              // Stacked allocation chart view
              allocationOverTimeData.data.length > 0 && allocationOverTimeData.symbols.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart 
                      data={allocationOverTimeData.data} 
                      margin={{ top: 10, right: 30, left: 0, bottom: 10 }}
                      stackOffset="expand"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fill: '#888', fontSize: 10 }}
                        axisLine={{ stroke: '#444' }}
                        tickFormatter={(date) => {
                          const d = new Date(date);
                          return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`;
                        }}
                        interval="preserveStartEnd"
                        minTickGap={50}
                      />
                      <YAxis 
                        tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                        tick={{ fill: '#888', fontSize: 11 }}
                        axisLine={{ stroke: '#444' }}
                        width={45}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 4 }}
                        formatter={(value, name) => [typeof value === 'number' ? `${value.toFixed(1)}%` : '0%', String(name)]}
                        labelFormatter={(label) => label}
                      />
                      {allocationOverTimeData.symbols.map((symbol, index) => (
                        <Area
                          key={symbol}
                          type="monotone"
                          dataKey={symbol}
                          stackId="1"
                          stroke={ALLOCATION_COLORS[index % ALLOCATION_COLORS.length]}
                          fill={ALLOCATION_COLORS[index % ALLOCATION_COLORS.length]}
                          fillOpacity={0.8}
                        />
                      ))}
                      <Area
                        type="monotone"
                        dataKey="Other"
                        stackId="1"
                        stroke={ALLOCATION_COLORS[10]}
                        fill={ALLOCATION_COLORS[10]}
                        fillOpacity={0.6}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  {/* Custom clickable legend */}
                  <div className="allocation-legend">
                    {allocationOverTimeData.symbols.map((symbol, index) => (
                      <button
                        key={symbol}
                        className="legend-item"
                        onClick={() => setSelectedAllocationSymbol(symbol)}
                        title={`Click to see ${symbol} investment history`}
                      >
                        <span 
                          className="legend-color" 
                          style={{ backgroundColor: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length] }}
                        />
                        <span className="legend-label">{symbol}</span>
                      </button>
                    ))}
                    <div className="legend-item other-legend">
                      <span 
                        className="legend-color" 
                        style={{ backgroundColor: ALLOCATION_COLORS[10] }}
                      />
                      <span className="legend-label">Other</span>
                      {otherSymbolsList.length > 0 && (
                        <span className="other-tooltip">
                          <span className="tooltip-title">Other stocks:</span>
                          {otherSymbolsList.slice(0, 8).map(s => (
                            <span key={s.symbol} className="tooltip-stock">
                              {s.symbol}: {s.allocation.toFixed(1)}%
                            </span>
                          ))}
                          {otherSymbolsList.length > 8 && (
                            <span className="tooltip-more">+{otherSymbolsList.length - 8} more</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-chart">
                  <p>Loading allocation data...</p>
                </div>
              )
            )}
          </div>
        </div>

        {/* Concentration Risk */}
        <div className="chart-card concentration-chart">
          <div className="chart-header">
            <h3>Concentration Risk</h3>
            <span className="chart-subtitle">
              {allocationFilter === 'all' ? 'Portfolio concentration over time' : `Concentration within ${getFilterLabel().toLowerCase()}`}
            </span>
          </div>
          <div className="chart-content">
            {concentrationData.length > 0 && concentrationData.some(d => d.topPosition > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={concentrationData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: '#888', fontSize: 10 }}
                    axisLine={{ stroke: '#444' }}
                    tickFormatter={(date) => {
                      const d = new Date(date);
                      return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`;
                    }}
                    interval="preserveStartEnd"
                    minTickGap={50}
                  />
                  <YAxis 
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    tick={{ fill: '#888', fontSize: 11 }}
                    axisLine={{ stroke: '#444' }}
                    width={45}
                    domain={[0, 100]}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 4 }}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = {
                        topPosition: 'Top Position',
                        top3: 'Top 3 Positions',
                        top5: 'Top 5 Positions',
                      };
                      const n = String(name);
                      return [typeof value === 'number' ? `${value.toFixed(1)}%` : '0%', labels[n] || n];
                    }}
                    labelFormatter={(label) => label}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '10px' }}
                    formatter={(value) => {
                      const labels: Record<string, string> = {
                        topPosition: 'Top Position',
                        top3: 'Top 3',
                        top5: 'Top 5',
                      };
                      return <span style={{ color: '#ccc', fontSize: '11px' }}>{labels[value] || value}</span>;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="topPosition" 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="top3" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="top5" 
                    stroke="#22c55e" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="5 5" label={{ value: '30%', fill: '#ef4444', fontSize: 10 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-chart">
                <p>{allocationFilter === 'all' ? 'Loading concentration data...' : `No ${getFilterLabel().toLowerCase()} history available`}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
