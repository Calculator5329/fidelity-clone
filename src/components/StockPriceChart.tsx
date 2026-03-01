import { useState, useMemo, memo } from 'react';
import { 
  ComposedChart, 
  Line, 
  Area,
  Scatter,
  XAxis, 
  YAxis, 
  ResponsiveContainer, 
  Tooltip,
  Legend
} from 'recharts';
import type { StockPriceData, FairValueEntry } from './StockOverviewView';
import './StockPriceChart.css';

type ChartPeriod = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | 'ALL';

interface BuyTransaction {
  date: string;
  price: number;
  quantity: number;
}

interface StockPriceChartProps {
  priceData: StockPriceData[];
  buyTransactions: BuyTransaction[];
  fairValueEntries: FairValueEntry[];
}

interface ChartDataPoint {
  date: string;
  formattedDate: string;
  tooltipDate: string;
  close: number;
  buyPrice?: number;
  buyQty?: number;
  fairValue?: number;
}

// Downsample data to weekly intervals while preserving important dates
function downsampleToWeekly<T extends { date: string }>(
  data: T[], 
  importantDates: Set<string>
): T[] {
  if (data.length === 0) return data;
  
  const result: T[] = [];
  let lastIncludedDate: Date | null = null;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  
  for (let i = 0; i < data.length; i++) {
    const currentDate = new Date(data[i].date);
    const isFirstOrLast = i === 0 || i === data.length - 1;
    const isImportant = importantDates.has(data[i].date);
    const isWeeklyInterval = lastIncludedDate === null || 
      (currentDate.getTime() - lastIncludedDate.getTime()) >= WEEK_MS;
    
    if (isFirstOrLast || isImportant || isWeeklyInterval) {
      result.push(data[i]);
      lastIncludedDate = currentDate;
    }
  }
  
  return result;
}

export function StockPriceChart({ priceData, buyTransactions, fairValueEntries }: StockPriceChartProps) {
  const [period, setPeriod] = useState<ChartPeriod>('1Y');
  const [showBuys, setShowBuys] = useState(true);

  // Filter data by period
  const filteredData = useMemo(() => {
    if (priceData.length === 0) return [];
    if (period === 'ALL') return priceData;

    const currentDate = new Date(2026, 0, 10); // Jan 10, 2026
    let cutoffDate: Date;

    switch (period) {
      case '1M':
        cutoffDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, currentDate.getDate());
        break;
      case '3M':
        cutoffDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 3, currentDate.getDate());
        break;
      case '6M':
        cutoffDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 6, currentDate.getDate());
        break;
      case 'YTD':
        cutoffDate = new Date(currentDate.getFullYear(), 0, 1);
        break;
      case '1Y':
        cutoffDate = new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), currentDate.getDate());
        break;
      case '2Y':
        cutoffDate = new Date(currentDate.getFullYear() - 2, currentDate.getMonth(), currentDate.getDate());
        break;
      default:
        return priceData;
    }

    return priceData.filter(d => {
      const dataDate = new Date(d.date);
      return dataDate >= cutoffDate;
    });
  }, [priceData, period]);

  // Create chart data with buy markers and fair value - optimized
  const chartData = useMemo(() => {
    if (filteredData.length === 0) return [];

    // Create a map of buy transactions by date
    const buyMap = new Map<string, BuyTransaction>();
    for (const tx of buyTransactions) {
      buyMap.set(tx.date, tx);
    }
    
    // Debug: log buyMap info
    console.log('StockPriceChart buyMap size:', buyMap.size, 'sample dates:', Array.from(buyMap.keys()).slice(0, 5));

    // Collect important dates that must be preserved when downsampling
    const importantDates = new Set<string>();
    for (const tx of buyTransactions) importantDates.add(tx.date);
    for (const fv of fairValueEntries) importantDates.add(fv.date);

    // Downsample to weekly intervals
    const sampledData = downsampleToWeekly(filteredData, importantDates);

    // Sort fair value entries by date and add projected end point
    const sortedFV = [...fairValueEntries].sort((a, b) => a.date.localeCompare(b.date));
    
    // Project fair value to the end using 10% annual growth if there's data beyond the last FV entry
    if (sortedFV.length > 0 && sampledData.length > 0) {
      const lastFV = sortedFV[sortedFV.length - 1];
      const lastDataDate = sampledData[sampledData.length - 1].date;
      
      // Only project if the chart extends beyond the last fair value entry
      if (lastDataDate > lastFV.date) {
        const lastFVDate = new Date(lastFV.date);
        const endDate = new Date(lastDataDate);
        const yearsDiff = (endDate.getTime() - lastFVDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        
        // Calculate projected fair value at 10% annual growth
        const projectedFV = lastFV.fairValue * Math.pow(1.10, yearsDiff);
        
        // Add projected point to sortedFV for interpolation
        sortedFV.push({ date: lastDataDate, fairValue: projectedFV, inputs: lastFV.inputs });
      }
    }

    // Interpolate fair value for each data point
    function interpolateFairValue(date: string): number | undefined {
      if (sortedFV.length === 0) return undefined;
      
      // Before first FV entry - no fair value
      if (date < sortedFV[0].date) return undefined;
      
      // Find the two FV entries to interpolate between
      for (let i = 0; i < sortedFV.length - 1; i++) {
        if (date >= sortedFV[i].date && date <= sortedFV[i + 1].date) {
          const startFV = sortedFV[i];
          const endFV = sortedFV[i + 1];
          
          const startTime = new Date(startFV.date).getTime();
          const endTime = new Date(endFV.date).getTime();
          const currentTime = new Date(date).getTime();
          
          // Linear interpolation
          const progress = (currentTime - startTime) / (endTime - startTime);
          return startFV.fairValue + (endFV.fairValue - startFV.fairValue) * progress;
        }
      }
      
      // After last FV entry - return last fair value
      if (date >= sortedFV[sortedFV.length - 1].date) {
        return sortedFV[sortedFV.length - 1].fairValue;
      }
      
      return undefined;
    }

    // Build chart data with interpolated fair values
    const result: ChartDataPoint[] = [];
    let matchedBuys = 0;

    for (let i = 0; i < sampledData.length; i++) {
      const d = sampledData[i];
      const buy = buyMap.get(d.date);
      if (buy) matchedBuys++;
      
      result.push({
        date: d.date,
        formattedDate: formatDate(d.date, period),
        tooltipDate: formatTooltipDate(d.date),
        close: d.close,
        buyPrice: buy?.price,
        buyQty: buy?.quantity,
        fairValue: interpolateFairValue(d.date),
      });
    }
    
    console.log('Chart data: sampledData.length=', sampledData.length, 'matchedBuys=', matchedBuys, 'from buyMap.size=', buyMap.size);

    return result;
  }, [filteredData, buyTransactions, fairValueEntries, period]);

  // Calculate return for the period
  const periodReturn = useMemo(() => {
    if (chartData.length < 2) return 0;
    const first = chartData[0].close;
    const last = chartData[chartData.length - 1].close;
    return ((last - first) / first) * 100;
  }, [chartData]);

  const isPositive = periodReturn >= 0;

  // Calculate tick interval
  const tickInterval = useMemo(() => {
    const len = chartData.length;
    if (len <= 10) return 0;
    if (period === '1M') return Math.floor(len / 5);
    if (period === '3M') return Math.floor(len / 6);
    if (period === '6M' || period === 'YTD') return Math.floor(len / 8);
    if (period === '1Y') return Math.floor(len / 10);
    return Math.floor(len / 12);
  }, [chartData.length, period]);

  // Calculate Y axis domain
  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];
    
    let min = Infinity;
    let max = -Infinity;
    
    for (const d of chartData) {
      if (d.close < min) min = d.close;
      if (d.close > max) max = d.close;
      if (d.fairValue !== undefined) {
        if (d.fairValue < min) min = d.fairValue;
        if (d.fairValue > max) max = d.fairValue;
      }
      // Only include buy prices in domain calculation if showing buys
      if (showBuys && d.buyPrice !== undefined) {
        if (d.buyPrice < min) min = d.buyPrice;
        if (d.buyPrice > max) max = d.buyPrice;
      }
    }
    
    const padding = (max - min) * 0.1;
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [chartData, showBuys]);

  if (priceData.length === 0) {
    return (
      <div className="stock-price-chart empty">
        <p>No price data available for this stock.</p>
      </div>
    );
  }

  return (
    <div className="stock-price-chart">
      {/* Period selector */}
      <div className="period-selector">
        {(['1M', '3M', '6M', 'YTD', '1Y', '2Y', 'ALL'] as ChartPeriod[]).map((p) => (
          <button
            key={p}
            className={`period-btn ${period === p ? 'active' : ''}`}
            onClick={() => setPeriod(p)}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isPositive ? "#4caf50" : "#ef5350"} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={isPositive ? "#4caf50" : "#ef5350"} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="formattedDate" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#707070', fontSize: 11 }}
            interval={tickInterval}
            minTickGap={40}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#707070', fontSize: 11 }}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
            domain={yDomain}
            width={55}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
            }}
            content={<CustomTooltip />}
          />
          <Legend 
            verticalAlign="top"
            height={30}
            formatter={(value) => {
              if (value === 'close') return 'Stock Price';
              if (value === 'fairValue') return 'Fair Value';
              if (value === 'buyPrice') return 'Your Buys';
              return value;
            }}
            wrapperStyle={{ fontSize: '11px', color: '#a0a0a0' }}
          />
          
          {/* Price area and line */}
          <Area 
            type="linear" 
            dataKey="close" 
            stroke={isPositive ? "#4caf50" : "#ef5350"} 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorPrice)"
            name="close"
            dot={false}
            isAnimationActive={false}
          />
          
          {/* Fair value line */}
          <Line
            type="linear"
            dataKey="fairValue"
            stroke="#ffc107"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="fairValue"
            connectNulls={true}
            isAnimationActive={false}
          />
          
          {/* Buy transaction markers */}
          {showBuys && (
            <Scatter
              dataKey="buyPrice"
              fill="#42a5f5"
              shape="circle"
              name="buyPrice"
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Period return */}
      <div className="chart-footer">
        <span className={`period-return ${isPositive ? 'positive' : 'negative'}`}>
          {period} Return: {isPositive ? '+' : ''}{periodReturn.toFixed(2)}%
        </span>
      </div>

      {/* Legend with toggles */}
      <div className="chart-legend-info">
        <div className="legend-item">
          <span className="legend-dot price"></span>
          <span>Stock Price</span>
        </div>
        <div className="legend-item">
          <span className="legend-line fair-value"></span>
          <span>Your Fair Value Estimate</span>
        </div>
        <label className="legend-item toggle">
          <input
            type="checkbox"
            checked={showBuys}
            onChange={(e) => setShowBuys(e.target.checked)}
          />
          <span className="legend-dot buy"></span>
          <span>Show Purchases/Transfers</span>
        </label>
      </div>
    </div>
  );
}

// Memoized custom tooltip component for performance
const CustomTooltip = memo(function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="custom-tooltip">
      <p className="tooltip-date">{data.tooltipDate}</p>
      <p className="tooltip-price">
        <span className="tooltip-label">Price:</span>
        <span className="tooltip-value">${data.close.toFixed(2)}</span>
      </p>
      {data.fairValue !== undefined && (
        <p className="tooltip-fair-value">
          <span className="tooltip-label">Fair Value:</span>
          <span className="tooltip-value">${data.fairValue.toFixed(2)}</span>
        </p>
      )}
      {data.buyPrice !== undefined && (
        <p className="tooltip-buy">
          <span className="tooltip-label">You Bought:</span>
          <span className="tooltip-value">{data.buyQty} @ ${data.buyPrice.toFixed(2)}</span>
        </p>
      )}
    </div>
  );
});

function formatDate(dateStr: string, period: ChartPeriod): string {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [year, month, day] = dateStr.split('-');
  const monthName = monthNames[parseInt(month) - 1];
  
  if (period === '1M' || period === '3M' || period === 'YTD') {
    return `${monthName} ${parseInt(day)}`;
  }
  return `${monthName} ${year}`;
}

function formatTooltipDate(dateStr: string): string {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const [year, month, day] = dateStr.split('-');
  return `${monthNames[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
}
