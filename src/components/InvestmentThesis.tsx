import './InvestmentThesis.css';

interface InvestmentThesisProps {
  thesis: string;
  lastUpdated: string;
}

export function InvestmentThesis({ thesis, lastUpdated }: InvestmentThesisProps) {
  if (!thesis) {
    return (
      <div className="investment-thesis empty">
        <div className="empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48">
            <path 
              fill="currentColor" 
              d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"
            />
          </svg>
          <p>No investment thesis recorded yet.</p>
          <span className="empty-hint">
            Edit <code>public/data/stock_thesis.json</code> to add your thesis.
          </span>
        </div>
      </div>
    );
  }

  // Split thesis into paragraphs
  const paragraphs = thesis.split('\n\n').filter(p => p.trim());

  return (
    <div className="investment-thesis">
      <div className="thesis-content">
        {paragraphs.map((paragraph, idx) => (
          <p key={idx} className="thesis-paragraph">
            {paragraph}
          </p>
        ))}
      </div>
      
      {lastUpdated && (
        <div className="thesis-footer">
          <span className="last-updated">
            Last updated: {formatDate(lastUpdated)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
