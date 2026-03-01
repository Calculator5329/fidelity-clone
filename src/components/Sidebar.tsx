import { mockAccounts, type Account } from '../data/mockPrices';
import './Sidebar.css';

// Portfolio data for each account
export interface AccountPortfolioData {
  value: number;
  change: number;
  changePercent: number;
}

interface SidebarProps {
  selectedAccountId: string;
  onSelectAccount: (id: string) => void;
  // Real portfolio data to override mock values (keyed by account id)
  portfolioData?: Record<string, AccountPortfolioData>;
}

export function Sidebar({ 
  selectedAccountId, 
  onSelectAccount,
  portfolioData,
}: SidebarProps) {
  // Override mock accounts with real portfolio data where available
  const accounts = mockAccounts.map(acc => {
    const realData = portfolioData?.[acc.id];
    if (realData) {
      return {
        ...acc,
        balance: realData.value,
        change: realData.change,
        changePercent: realData.changePercent,
      };
    }
    return acc;
  });

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalChange = accounts.reduce((sum, acc) => sum + acc.change, 0);
  const fidelityBalance = accounts
    .filter(acc => acc.type !== 'trading')
    .reduce((sum, acc) => sum + acc.balance, 0);

  const investmentAccounts = accounts.filter(acc => acc.type === 'investment');
  const retirementAccounts = accounts.filter(acc => acc.type === 'retirement');
  const tradingAccounts = accounts.filter(acc => acc.type === 'trading');

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">
          <span>Accounts</span>
          <div className="sidebar-icons">
            <button className="icon-btn" title="Settings">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            </button>
            <button className="icon-btn" title="Expand">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M3 3h18v2H3V3zm0 8h18v2H3v-2zm0 8h18v2H3v-2z"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="sidebar-date">As of Jan-10-2026 11:08 p.m. ET</div>
      </div>

      <button 
        className={`account-summary ${selectedAccountId === 'all' ? 'selected' : ''}`}
        onClick={() => onSelectAccount('all')}
      >
        <div className="summary-row">
          <span className="summary-label">All accounts</span>
          <span className="summary-value">${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="summary-sub">
          <span>${fidelityBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in Fidelity accounts</span>
          {totalChange !== 0 && (
            <span className={`summary-change ${totalChange >= 0 ? 'positive' : 'negative'}`}>
              {totalChange >= 0 ? '+' : ''}${totalChange.toFixed(2)}
            </span>
          )}
        </div>
      </button>

      <AccountSection
        title="Investment"
        accounts={investmentAccounts}
        selectedId={selectedAccountId}
        onSelect={onSelectAccount}
      />

      <AccountSection
        title="Retirement"
        accounts={retirementAccounts}
        selectedId={selectedAccountId}
        onSelect={onSelectAccount}
      />

      <AccountSection
        title="Trading Accounts"
        accounts={tradingAccounts}
        selectedId={selectedAccountId}
        onSelect={onSelectAccount}
      />
    </aside>
  );
}

interface AccountSectionProps {
  title: string;
  accounts: Account[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function AccountSection({ title, accounts, selectedId, onSelect }: AccountSectionProps) {
  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

  return (
    <div className="account-section">
      <div className="section-header">
        <span className="section-title">{title}</span>
        <span className="section-total">
          ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="account-list">
        {accounts.map((account) => (
          <button
            key={account.id}
            className={`account-item ${selectedId === account.id ? 'selected' : ''}`}
            onClick={() => onSelect(account.id)}
          >
            <div className="account-info">
              <div className="account-name">{account.name}</div>
              <div className="account-number">{account.accountNumber}</div>
            </div>
            <div className="account-balance">
              <div className="balance-value">
                ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {account.change !== 0 && <span className="balance-indicator">▾</span>}
              </div>
              <div className={`balance-change ${account.change >= 0 ? 'positive' : 'negative'}`}>
                {account.change >= 0 ? '+' : ''}${account.change.toFixed(2)} ({account.change >= 0 ? '+' : ''}{account.changePercent.toFixed(2)}%)
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
