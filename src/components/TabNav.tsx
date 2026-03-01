import './TabNav.css';

export type TabId = 'summary' | 'positions' | 'activity' | 'charts' | 'history' | 'balances' | 'documents' | 'planning' | 'more' | 'stock' | 'import';

interface Tab {
  id: TabId;
  label: string;
  isDynamic?: boolean;
}

const staticTabs: Tab[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'positions', label: 'Positions' },
  { id: 'activity', label: 'Activity & Orders' },
  { id: 'charts', label: 'Charts' },
  { id: 'history', label: 'History' },
  { id: 'balances', label: 'Balances' },
  { id: 'documents', label: 'Documents' },
  { id: 'planning', label: 'Planning' },
  { id: 'import', label: 'Import Data' },
  { id: 'more', label: 'More (4)' },
];

interface TabNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  selectedStock?: string;
  onCloseStockTab?: () => void;
}

export function TabNav({ activeTab, onTabChange, selectedStock, onCloseStockTab }: TabNavProps) {
  // Build tabs list - include stock tab if a stock is selected
  const tabs: Tab[] = [...staticTabs];
  
  if (selectedStock) {
    // Insert the Stock tab after Positions
    const positionsIndex = tabs.findIndex(t => t.id === 'positions');
    tabs.splice(positionsIndex + 1, 0, {
      id: 'stock',
      label: selectedStock,
      isDynamic: true,
    });
  }

  return (
    <nav className="tab-nav">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''} ${tab.isDynamic ? 'dynamic-tab' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.isDynamic && (
            <span className="stock-icon">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path fill="currentColor" d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/>
              </svg>
            </span>
          )}
          {tab.label}
          {tab.isDynamic && onCloseStockTab && (
            <span 
              className="close-tab-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCloseStockTab();
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
