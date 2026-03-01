import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  loadDailySnapshots,
  getSnapshotByDate,
  getBestDays,
  getWorstDays,
  formatSnapshotDate,
  type PortfolioSnapshots,
  type DailySnapshot,
} from '../utils/loadSnapshots';
import './HistoryView.css';

interface HistoryViewProps {
  onStockSelect?: (symbol: string) => void;
}

export function HistoryView({ onStockSelect }: HistoryViewProps) {
  const [snapshots, setSnapshots] = useState<PortfolioSnapshots | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load snapshots on mount
  useEffect(() => {
    loadDailySnapshots()
      .then(data => {
        setSnapshots(data);
        // Default to most recent date
        if (data.snapshots.length > 0) {
          setSelectedDate(data.snapshots[data.snapshots.length - 1].date);
        }
      })
      .catch(err => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Get current snapshot
  const currentSnapshot = useMemo(() => {
    if (!snapshots || !selectedDate) return null;
    return getSnapshotByDate(snapshots, selectedDate);
  }, [snapshots, selectedDate]);

  // Get notable days
  const bestDays = useMemo(() => {
    if (!snapshots) return [];
    return getBestDays(snapshots, 5);
  }, [snapshots]);

  const worstDays = useMemo(() => {
    if (!snapshots) return [];
    return getWorstDays(snapshots, 5);
  }, [snapshots]);

  // Calculate slider position (0-100)
  const sliderPosition = useMemo(() => {
    if (!snapshots || !selectedDate) return 100;
    const index = snapshots.snapshots.findIndex(s => s.date === selectedDate);
    if (index === -1) return 100;
    return (index / (snapshots.snapshots.length - 1)) * 100;
  }, [snapshots, selectedDate]);

  // Handle slider change
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!snapshots) return;
    const value = parseFloat(e.target.value);
    const index = Math.round((value / 100) * (snapshots.snapshots.length - 1));
    const snapshot = snapshots.snapshots[index];
    if (snapshot) {
      setSelectedDate(snapshot.date);
    }
  }, [snapshots]);

  // Handle date input change
  const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  }, []);

  // Jump to notable day
  const handleJumpToDate = useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  // Navigate by days
  const handleNavigate = useCallback((days: number) => {
    if (!snapshots || !selectedDate) return;
    const currentIndex = snapshots.snapshots.findIndex(s => s.date === selectedDate);
    const newIndex = Math.max(0, Math.min(snapshots.snapshots.length - 1, currentIndex + days));
    setSelectedDate(snapshots.snapshots[newIndex].date);
  }, [snapshots, selectedDate]);

  if (loading) {
    return (
      <div className="history-view">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Loading historical data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-view">
        <div className="error-state">
          <h3>Error loading data</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!snapshots || !currentSnapshot) {
    return (
      <div className="history-view">
        <div className="error-state">
          <h3>No data available</h3>
          <p>Historical snapshot data could not be loaded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="history-view">
      {/* Header with date selector */}
      <div className="history-header">
        <div className="history-title">
          <h2>Portfolio History</h2>
          <span className="history-subtitle">View your portfolio on any date</span>
        </div>
        <div className="date-selector">
          <input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            min={snapshots.dateRange.start}
            max={snapshots.dateRange.end}
            className="date-input"
          />
        </div>
      </div>

      {/* Timeline scrubber */}
      <div className="timeline-section">
        <div className="timeline-controls">
          <button className="nav-btn" onClick={() => handleNavigate(-1)} title="Previous day">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
            </svg>
          </button>
          <div className="timeline-slider-container">
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={sliderPosition}
              onChange={handleSliderChange}
              className="timeline-slider"
            />
            <div className="timeline-labels">
              <span>{snapshots.dateRange.start}</span>
              <span>{snapshots.dateRange.end}</span>
            </div>
          </div>
          <button className="nav-btn" onClick={() => handleNavigate(1)} title="Next day">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Snapshot summary */}
      <div className="snapshot-summary">
        <div className="snapshot-date">
          <h3>{formatSnapshotDate(currentSnapshot.date)}</h3>
        </div>
        <div className="snapshot-stats">
          <div className="stat-card total-value">
            <span className="stat-label">Portfolio Value</span>
            <span className="stat-value">
              ${currentSnapshot.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className={`stat-card day-change ${currentSnapshot.dayChange >= 0 ? 'positive' : 'negative'}`}>
            <span className="stat-label">Day Change</span>
            <span className="stat-value">
              {currentSnapshot.dayChange >= 0 ? '+' : ''}
              ${currentSnapshot.dayChange.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <span className="stat-percent">
                ({currentSnapshot.dayChangePercent >= 0 ? '+' : ''}{currentSnapshot.dayChangePercent.toFixed(2)}%)
              </span>
            </span>
          </div>
          <div className="stat-card positions-count">
            <span className="stat-label">Positions</span>
            <span className="stat-value">{currentSnapshot.positions.length}</span>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="history-content">
        {/* Positions table */}
        <div className="positions-section">
          <h3>Holdings on {formatSnapshotDate(currentSnapshot.date)}</h3>
          <div className="positions-table-container">
            <table className="positions-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="right">Shares</th>
                  <th className="right">Price</th>
                  <th className="right">Market Value</th>
                  <th className="right">Allocation</th>
                </tr>
              </thead>
              <tbody>
                {currentSnapshot.positions.map(position => (
                  <tr 
                    key={position.symbol} 
                    onClick={() => onStockSelect?.(position.symbol)}
                    className="clickable-row"
                  >
                    <td className="symbol-cell">
                      <div className="symbol-info">
                        <img 
                          src={`https://assets.parqet.com/logos/symbol/${position.symbol}?format=png`}
                          alt=""
                          className="symbol-logo"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <span className="symbol-name">{position.symbol}</span>
                      </div>
                    </td>
                    <td className="right">{position.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
                    <td className="right">${position.price.toFixed(2)}</td>
                    <td className="right">
                      ${position.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="right">
                      <div className="allocation-cell">
                        <span>{position.allocation.toFixed(1)}%</span>
                        <div className="allocation-bar">
                          <div 
                            className="allocation-fill" 
                            style={{ width: `${Math.min(position.allocation, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notable days sidebar */}
        <div className="notable-days-section">
          <div className="notable-card best-days">
            <h4>
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>
              </svg>
              Best Days
            </h4>
            <ul>
              {bestDays.map(day => (
                <li key={day.date} onClick={() => handleJumpToDate(day.date)}>
                  <span className="notable-date">{day.date}</span>
                  <span className="notable-change positive">
                    +${day.dayChange.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    <span className="notable-percent">(+{day.dayChangePercent.toFixed(1)}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="notable-card worst-days">
            <h4>
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M16 18l2.29-2.29-4.88-4.88-4 4L2 7.41 3.41 6l6 6 4-4 6.3 6.29L22 12v6z"/>
              </svg>
              Worst Days
            </h4>
            <ul>
              {worstDays.map(day => (
                <li key={day.date} onClick={() => handleJumpToDate(day.date)}>
                  <span className="notable-date">{day.date}</span>
                  <span className="notable-change negative">
                    ${day.dayChange.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    <span className="notable-percent">({day.dayChangePercent.toFixed(1)}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
