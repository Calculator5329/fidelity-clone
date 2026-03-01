import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import './AssetAllocation.css';

interface AllocationData {
  name: string;
  value: number;
  color: string;
  [key: string]: string | number;
}

const allocationData: AllocationData[] = [
  { name: 'Domestic stock', value: 96.1, color: '#1e88e5' },
  { name: 'Foreign stock', value: 3.3, color: '#42a5f5' },
  { name: 'Bonds', value: 0.0, color: '#4caf50' },
  { name: 'Short term', value: 0.7, color: '#ffc107' },
];

export function AssetAllocation() {
  return (
    <div className="asset-allocation">
      <div className="allocation-chart">
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={allocationData}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={2}
              dataKey="value"
            >
              {allocationData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="allocation-legend">
        {allocationData.map((item) => (
          <div key={item.name} className="legend-item">
            <div className="legend-left">
              <span className="legend-dot" style={{ backgroundColor: item.color }}></span>
              <span className="legend-label">{item.name}</span>
            </div>
            <span className="legend-value">{item.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <div className="allocation-strategy">
        <svg viewBox="0 0 24 24" width="16" height="16" className="check-icon">
          <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        <span>Your asset allocation resembles a <strong>Most Aggressive</strong> strategy.</span>
      </div>
      <a href="#" className="learn-more">Learn more</a>
    </div>
  );
}
