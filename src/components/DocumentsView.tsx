import { useState, useEffect } from 'react';
import './DocumentsView.css';

interface Report {
  id: string;
  type: 'annual' | 'quarterly';
  year: number;
  quarter?: number;
  title: string;
  filename: string;
  periodStart: string;
  periodEnd: string;
}

interface ReportManifest {
  version: string;
  lastUpdated: string;
  reports: Report[];
}

export function DocumentsView() {
  const [manifest, setManifest] = useState<ReportManifest | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function loadManifest() {
      try {
        const response = await fetch('/reports/reports.json');
        if (!response.ok) {
          throw new Error('Reports not found. Run the report generator script first.');
        }
        const data: ReportManifest = await response.json();
        setManifest(data);
        
        // Auto-select the most recent report
        if (data.reports.length > 0) {
          const sortedReports = [...data.reports].sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            if (a.type === 'annual' && b.type !== 'annual') return -1;
            if (b.type === 'annual' && a.type !== 'annual') return 1;
            return (b.quarter || 0) - (a.quarter || 0);
          });
          setSelectedReport(sortedReports[0]);
          
          // Expand the most recent year
          setExpandedYears(new Set([sortedReports[0].year]));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reports');
      } finally {
        setLoading(false);
      }
    }
    loadManifest();
  }, []);

  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  const handleDownload = () => {
    if (!selectedReport) return;
    const link = document.createElement('a');
    link.href = `/reports/${selectedReport.filename}`;
    link.download = selectedReport.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="documents-view">
        <div className="documents-loading">
          <div className="loading-spinner"></div>
          <p>Loading reports...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="documents-view">
        <div className="documents-error">
          <svg viewBox="0 0 24 24" width="48" height="48">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <h3>Reports Not Available</h3>
          <p>{error}</p>
          <code>npx ts-node scripts/generateReports.ts</code>
        </div>
      </div>
    );
  }

  // Group reports by year
  const reportsByYear = manifest?.reports.reduce((acc, report) => {
    if (!acc[report.year]) {
      acc[report.year] = { annual: null, quarters: [] };
    }
    if (report.type === 'annual') {
      acc[report.year].annual = report;
    } else {
      acc[report.year].quarters.push(report);
    }
    return acc;
  }, {} as Record<number, { annual: Report | null; quarters: Report[] }>) || {};

  const years = Object.keys(reportsByYear)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <div className="documents-view">
      <div className="documents-sidebar">
        <div className="sidebar-header">
          <h3>Portfolio Reports</h3>
          <span className="report-count">{manifest?.reports.length || 0} reports</span>
        </div>
        
        <nav className="report-nav">
          {years.map(year => (
            <div key={year} className="year-group">
              <button 
                className={`year-header ${expandedYears.has(year) ? 'expanded' : ''}`}
                onClick={() => toggleYear(year)}
              >
                <svg className="chevron" viewBox="0 0 24 24" width="16" height="16">
                  <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
                <span>{year}</span>
              </button>
              
              {expandedYears.has(year) && (
                <div className="year-reports">
                  {reportsByYear[year].annual && (
                    <button
                      className={`report-item annual ${selectedReport?.id === reportsByYear[year].annual?.id ? 'active' : ''}`}
                      onClick={() => setSelectedReport(reportsByYear[year].annual)}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                      </svg>
                      <span>Annual Report</span>
                    </button>
                  )}
                  
                  {reportsByYear[year].quarters
                    .sort((a, b) => (b.quarter || 0) - (a.quarter || 0))
                    .map(report => (
                      <button
                        key={report.id}
                        className={`report-item quarterly ${selectedReport?.id === report.id ? 'active' : ''}`}
                        onClick={() => setSelectedReport(report)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16">
                          <path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                        </svg>
                        <span>Q{report.quarter}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>
      
      <div className="documents-content">
        {selectedReport ? (
          <>
            <div className="content-header">
              <div className="header-info">
                <h2>{selectedReport.title}</h2>
                <p className="period">
                  {new Date(selectedReport.periodStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' — '}
                  {new Date(selectedReport.periodEnd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="header-actions">
                <button className="action-btn" onClick={handleDownload}>
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                  </svg>
                  Download
                </button>
                <a 
                  href={`/reports/${selectedReport.filename}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="action-btn"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path fill="currentColor" d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                  </svg>
                  Open in New Tab
                </a>
              </div>
            </div>
            
            <div className="report-frame-container">
              <iframe
                key={selectedReport.id}
                src={`/reports/${selectedReport.filename}`}
                title={selectedReport.title}
                className="report-frame"
              />
            </div>
          </>
        ) : (
          <div className="no-selection">
            <svg viewBox="0 0 24 24" width="64" height="64">
              <path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
            </svg>
            <p>Select a report from the sidebar</p>
          </div>
        )}
      </div>
    </div>
  );
}
