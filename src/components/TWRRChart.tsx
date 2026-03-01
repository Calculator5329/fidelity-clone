import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import { monthlyTWRR, calculateCumulativeTWRR, getCumulativeReturnSeries } from '../data/mockPrices';
import './TWRRChart.css';

type Period = '3M' | '6M' | '1Y' | 'ALL';

export function TWRRChart() {
  const [period, setPeriod] = useState<Period>('ALL');

  // Get the appropriate data based on period
  const getMonthsForPeriod = (p: Period): number | 'all' => {
    switch (p) {
      case '3M': return 3;
      case '6M': return 6;
      case '1Y': return 12;
      case 'ALL': return 'all';
    }
  };

  const months = getMonthsForPeriod(period);
  const chartData = getCumulativeReturnSeries(months);
  const totalReturn = calculateCumulativeTWRR(months);

  // Format month for display
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(month) - 1]} '${year.slice(2)}`;
  };

  // Get period label for display
  const getPeriodLabel = (p: Period): string => {
    switch (p) {
      case '3M': return '3 Month';
      case '6M': return '6 Month';
      case '1Y': return '1 Year';
      case 'ALL': return 'Since Inception';
    }
  };

  // Get monthly returns for the bar display
  const getMonthlyReturns = () => {
    const data = months === 'all' ? monthlyTWRR : monthlyTWRR.slice(-months);
    return data;
  };

  const monthlyReturns = getMonthlyReturns();
  const isPositive = totalReturn >= 0;

  return (
    <div className="twrr-chart">
      <div className="twrr-header">
        <div className="twrr-title-section">
          <h3 className="twrr-title">Time-Weighted Rate of Return</h3>
          <span className="twrr-subtitle">Pre-tax cumulative return</span>
        </div>
        <div className="twrr-period-selector">
          {(['3M', '6M', '1Y', 'ALL'] as const).map((p) => (
            <button
              key={p}
              className={`twrr-period-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p === 'ALL' ? 'Inception' : p}
            </button>
          ))}
        </div>
      </div>

      <div className="twrr-summary">
        <div className="twrr-return-value">
          <span className={`twrr-return ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
          </span>
          <span className="twrr-return-label">{getPeriodLabel(period)} Return</span>
        </div>
        <div className="twrr-period-info">
          <span className="twrr-date-range">
            {formatMonth(chartData[0]?.month || '')} - {formatMonth(chartData[chartData.length - 1]?.month || '')}
          </span>
          <span className="twrr-months-count">{chartData.length} months</span>
        </div>
      </div>

      <div className="twrr-chart-container">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorTWRR" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? "#4caf50" : "#ef5350"} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={isPositive ? "#4caf50" : "#ef5350"} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="month" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#707070', fontSize: 10 }}
              tickFormatter={formatMonth}
              interval="preserveStartEnd"
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#707070', fontSize: 10 }}
              tickFormatter={(value) => `${value.toFixed(0)}%`}
              width={45}
            />
            <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
            <Tooltip 
              contentStyle={{
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#fff',
              }}
              formatter={(value) => [typeof value === 'number' ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : '0%', 'Cumulative Return' as const]}
              labelFormatter={(label) => formatMonth(label)}
            />
            <Area 
              type="monotone" 
              dataKey="cumulativeReturn" 
              stroke={isPositive ? "#4caf50" : "#ef5350"} 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorTWRR)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="twrr-monthly-returns">
        <h4 className="twrr-monthly-title">Monthly Returns</h4>
        <div className="twrr-bars">
          {monthlyReturns.map((item, index) => {
            const maxAbs = Math.max(...monthlyReturns.map(m => Math.abs(m.return)));
            const barHeight = (Math.abs(item.return) / maxAbs) * 100;
            const isPos = item.return >= 0;
            
            return (
              <div key={item.month} className="twrr-bar-container" title={`${formatMonth(item.month)}: ${isPos ? '+' : ''}${item.return.toFixed(2)}%`}>
                <div className="twrr-bar-wrapper">
                  {isPos ? (
                    <div 
                      className="twrr-bar positive" 
                      style={{ height: `${barHeight}%` }}
                    />
                  ) : (
                    <div 
                      className="twrr-bar negative" 
                      style={{ height: `${barHeight}%` }}
                    />
                  )}
                </div>
                {(index === 0 || index === monthlyReturns.length - 1 || monthlyReturns.length <= 12) && (
                  <span className="twrr-bar-label">
                    {monthlyReturns.length <= 12 ? formatMonth(item.month).split(' ')[0] : formatMonth(item.month)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
