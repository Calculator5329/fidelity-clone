import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import './BalanceChart.css';

export type ChartPeriod = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '3Y' | 'ALL';

interface BalanceChartProps {
  data: { date: string; value: number }[];
  period: ChartPeriod;
  vtiData?: { date: string; value: number }[];
  showVTI?: boolean;
}

export function BalanceChart({ data, period, vtiData = [], showVTI = false }: BalanceChartProps) {
  // Filter data based on the selected period
  const filteredData = filterDataByPeriod(data, period);
  const filteredVTI = showVTI ? filterDataByPeriod(vtiData, period) : [];
  
  // Determine if we have daily data (YYYY-MM-DD format)
  const isDaily = filteredData.length > 0 && filteredData[0].date.split('-').length === 3;
  
  // Merge portfolio and VTI data by date
  const chartData = mergeChartData(filteredData, filteredVTI, period, showVTI);

  // Calculate return for the period
  const periodReturn = filteredData.length >= 2 
    ? ((filteredData[filteredData.length - 1].value - filteredData[0].value) / filteredData[0].value) * 100
    : 0;

  const isPositive = periodReturn >= 0;
  
  // Calculate tick interval based on data points and period
  const tickInterval = calculateTickInterval(chartData.length, period);

  return (
    <div className="balance-chart">
      <ResponsiveContainer width="100%" height={showVTI ? 200 : 180}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: showVTI ? 5 : 0 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isPositive ? "#4caf50" : "#ef5350"} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={isPositive ? "#4caf50" : "#ef5350"} stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorVTI" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#5c6bc0" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#5c6bc0" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="formattedDate" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#707070', fontSize: 11 }}
            interval={tickInterval}
            minTickGap={60}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#707070', fontSize: 11 }}
            tickFormatter={(value) => `$${(value / 1000).toFixed(1)}K`}
            domain={['dataMin - 2000', 'dataMax + 2000']}
            width={55}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
            }}
            formatter={(value: number, name: string) => {
              const label = name === 'vtiValue' ? 'If VTI' : 'Your Portfolio';
              return [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, label];
            }}
            labelFormatter={(_label, payload) => {
              if (payload && payload.length > 0 && payload[0].payload?.tooltipDate) {
                return payload[0].payload.tooltipDate;
              }
              return _label;
            }}
          />
          {showVTI && (
            <Legend 
              verticalAlign="bottom"
              height={24}
              formatter={(value) => {
                if (value === 'value') return 'Your Portfolio';
                if (value === 'vtiValue') return 'If invested in VTI';
                return value;
              }}
              wrapperStyle={{ fontSize: '11px', color: '#a0a0a0' }}
            />
          )}
          {showVTI && (
            <Area 
              type="monotone" 
              dataKey="vtiValue" 
              stroke="#5c6bc0" 
              strokeWidth={2}
              fillOpacity={0.3} 
              fill="url(#colorVTI)"
              name="vtiValue"
              strokeDasharray="5 5"
              connectNulls
            />
          )}
          <Area 
            type="monotone" 
            dataKey="value" 
            stroke={isPositive ? "#4caf50" : "#ef5350"} 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorValue)"
            name="value"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function mergeChartData(
  portfolioData: { date: string; value: number }[],
  vtiData: { date: string; value: number }[],
  period: ChartPeriod,
  showVTI: boolean
): { date: string; value: number; vtiValue?: number; formattedDate: string; tooltipDate: string }[] {
  // Create a map of VTI values by date
  const vtiMap = new Map<string, number>();
  for (const item of vtiData) {
    vtiMap.set(item.date, item.value);
  }
  
  // Merge the data
  return portfolioData.map(d => ({
    date: d.date,
    value: d.value,
    vtiValue: showVTI ? vtiMap.get(d.date) : undefined,
    formattedDate: formatDate(d.date, period),
    tooltipDate: formatTooltipDate(d.date),
  }));
}

function filterDataByPeriod(data: { date: string; value: number }[], period: ChartPeriod): { date: string; value: number }[] {
  if (data.length === 0) return data;
  if (period === 'ALL') return data;
  
  // Current date is Jan 10, 2026 based on the app
  const currentDate = new Date(2026, 0, 10);
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
      cutoffDate = new Date(currentDate.getFullYear(), 0, 1); // Start of current year
      break;
    case '1Y':
      cutoffDate = new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), currentDate.getDate());
      break;
    case '2Y':
      cutoffDate = new Date(currentDate.getFullYear() - 2, currentDate.getMonth(), currentDate.getDate());
      break;
    case '3Y':
      cutoffDate = new Date(currentDate.getFullYear() - 3, currentDate.getMonth(), currentDate.getDate());
      break;
    default:
      return data;
  }
  
  return data.filter(d => {
    const dataDate = parseDate(d.date);
    return dataDate >= cutoffDate;
  });
}

function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-').map(Number);
  if (parts.length === 3) {
    // YYYY-MM-DD format (daily)
    return new Date(parts[0], parts[1] - 1, parts[2]);
  } else {
    // YYYY-MM format (monthly)
    return new Date(parts[0], parts[1] - 1, 1);
  }
}

function formatDate(dateStr: string, period: ChartPeriod): string {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = dateStr.split('-');
  
  if (parts.length === 3) {
    // YYYY-MM-DD format (daily data)
    const [year, month, day] = parts;
    const monthName = monthNames[parseInt(month) - 1];
    
    // For shorter periods, show day
    if (period === '1M' || period === '3M' || period === 'YTD') {
      return `${monthName} ${parseInt(day)}`;
    }
    // For longer periods, show month and year
    return `${monthName} ${year}`;
  } else {
    // YYYY-MM format (monthly data)
    const [year, month] = parts;
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  }
}

function formatTooltipDate(dateStr: string): string {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const parts = dateStr.split('-');
  
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${monthNames[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
  } else {
    const [year, month] = parts;
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  }
}

function calculateTickInterval(dataPoints: number, period: ChartPeriod): number {
  // For small datasets, show all labels
  if (dataPoints <= 10) return 0;
  
  // Target number of labels to display based on period
  let targetLabels: number;
  switch (period) {
    case '1M': targetLabels = 5; break;
    case '3M': targetLabels = 5; break;
    case '6M': targetLabels = 5; break;
    case 'YTD': targetLabels = 4; break;
    case '1Y': targetLabels = 5; break;
    case '2Y': targetLabels = 6; break;
    case '3Y': targetLabels = 6; break;
    case 'ALL': 
      // For ALL, aim for ~1 label per 6 months of data
      // Approximate 250 trading days per year = ~125 per 6 months
      targetLabels = Math.max(4, Math.ceil(dataPoints / 125));
      break;
    default: targetLabels = 5;
  }
  
  // Calculate interval to achieve target number of labels
  const interval = Math.max(1, Math.floor(dataPoints / targetLabels));
  return interval;
}
