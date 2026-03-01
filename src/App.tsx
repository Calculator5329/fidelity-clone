import { useState, useEffect, useCallback } from 'react';
import { Header, SubHeader } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { TabNav, type TabId } from './components/TabNav';
import { SummaryView } from './components/SummaryView';
import { PositionsView } from './components/PositionsView';
import { ActivityView } from './components/ActivityView';
import { StockOverviewView } from './components/StockOverviewView';
import { ChartsView } from './components/ChartsView';
import { HistoryView } from './components/HistoryView';
import { ImportView } from './components/ImportView';
import { DocumentsView } from './components/DocumentsView';
import { 
  parseCSV, 
  parsePositionsCSV, 
  generateHistoricalDataAsync, 
  loadPortfolioDataFromJSON,
  loadAllAccountsData,
  type PortfolioData, 
  type Position, 
  type Transaction 
} from './utils/parseTransactions';
import { fetchLiveQuotes, formatUpdateTime } from './utils/fetchLivePrices';
import { mockAccounts, getAccountNumber, getAccountById } from './data/mockPrices';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [selectedAccountId, setSelectedAccountId] = useState('growth');
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [historicalData, setHistoricalData] = useState<{ date: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStock, setSelectedStock] = useState<string | undefined>(undefined);
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('As of Jan-04-2026 11:41 p.m. ET');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Handler to open stock overview
  const handleStockSelect = useCallback((symbol: string) => {
    setSelectedStock(symbol);
    setActiveTab('stock');
  }, []);

  // Handler to close stock tab
  const handleCloseStockTab = useCallback(() => {
    setSelectedStock(undefined);
    setActiveTab('positions');
  }, []);

  // Handler for imported data from ImportView
  const handleDataImported = useCallback((positions: Position[], transactions: Transaction[]) => {
    const totalCostBasis = positions.reduce((sum, pos) => sum + pos.costBasis, 0);
    
    setPortfolioData({
      positions,
      totalCostBasis,
      transactions,
    });
  }, []);

  // Handler to refresh stock prices with live data
  const handleRefreshPrices = useCallback(async () => {
    if (!portfolioData || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      const symbols = portfolioData.positions.map(p => p.symbol);
      const liveQuotes = await fetchLiveQuotes(symbols);
      
      if (liveQuotes.size > 0) {
        // Update positions with live prices
        const updatedPositions: Position[] = portfolioData.positions.map(pos => {
          const quote = liveQuotes.get(pos.symbol);
          if (!quote) return pos;
          
          const newPrice = quote.price;
          const newPriceChange = quote.change;
          const newCurrentValue = pos.quantity * newPrice;
          const newTodayGainDollar = pos.quantity * quote.change;
          const newTodayGainPercent = quote.changePercent;
          const newTotalGainDollar = newCurrentValue - pos.costBasis;
          const newTotalGainPercent = pos.costBasis > 0 ? (newTotalGainDollar / pos.costBasis) * 100 : 0;
          
          return {
            ...pos,
            lastPrice: newPrice,
            lastPriceChange: newPriceChange,
            currentValue: newCurrentValue,
            todayGainDollar: newTodayGainDollar,
            todayGainPercent: newTodayGainPercent,
            totalGainDollar: newTotalGainDollar,
            totalGainPercent: newTotalGainPercent,
          };
        });
        
        setPortfolioData({
          ...portfolioData,
          positions: updatedPositions,
        });
        
        setLastUpdateTime(formatUpdateTime());
      }
    } catch (error) {
      console.error('Error refreshing prices:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [portfolioData, isRefreshing]);

  // Load data when account changes
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        let data: PortfolioData | null = null;
        
        if (selectedAccountId === 'all') {
          // Load aggregated data from all accounts
          data = await loadAllAccountsData();
          console.log('Loaded aggregated data from all accounts');
        } else {
          // Load data for specific account
          const accountNumber = getAccountNumber(selectedAccountId);
          data = await loadPortfolioDataFromJSON(accountNumber);
          
          if (!data && selectedAccountId === 'growth') {
            // Fallback to CSV loading for Growth Portfolio only
            console.log('Falling back to CSV data loading...');
            
            const positions: Position[] = await parsePositionsCSV('/Portfolio_Positions_2026-01-10.csv');
            const totalCostBasis = positions.reduce((sum, pos) => sum + pos.costBasis, 0);
            const uniqueTransactions = await parseCSV('/transactions (1).csv');
            
            data = {
              positions,
              totalCostBasis,
              transactions: uniqueTransactions,
            };
          } else if (data) {
            console.log(`Loaded portfolio data for ${selectedAccountId} from JSON`);
          }
        }
        
        // Load daily historical data (from pre-generated JSON or fallback to monthly)
        const historical = await generateHistoricalDataAsync();
        
        setPortfolioData(data);
        setHistoricalData(historical);
      } catch (error) {
        console.error('Error loading portfolio data:', error);
        setPortfolioData(null);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedAccountId]);

  // Get the selected account's balance from mock data
  const selectedAccount = mockAccounts.find(acc => acc.id === selectedAccountId);
  
  // Calculate total value from positions CSV data
  const positionValue = portfolioData?.positions.reduce((sum, pos) => {
    return sum + (pos.currentValue ?? (pos.quantity * (pos.lastPrice ?? 0)));
  }, 0) ?? 0;
  
  // Calculate today's change from positions
  const calculatedTodayChange = portfolioData?.positions.reduce((sum, pos) => {
    return sum + (pos.todayGainDollar ?? 0);
  }, 0) ?? 0;
  
  const currentValue = positionValue > 0 ? positionValue : (selectedAccount?.balance ?? 61694.25);
  const todayChange = calculatedTodayChange !== 0 ? calculatedTodayChange : (selectedAccount?.change ?? -101.94);
  const todayChangePercent = currentValue > 0 ? (todayChange / (currentValue - todayChange)) * 100 : (selectedAccount?.changePercent ?? -0.16);

  return (
    <div className="app">
      <Header />
      <SubHeader />
      <div className="main-layout">
        <Sidebar
          selectedAccountId={selectedAccountId}
          onSelectAccount={setSelectedAccountId}
          portfolioData={positionValue > 0 ? {
            [selectedAccountId]: {
              value: positionValue,
              change: calculatedTodayChange,
              changePercent: todayChangePercent,
            }
          } : undefined}
        />
        <main className="content">
          <div className="portfolio-header">
            <h1>{selectedAccountId === 'all' ? 'All Accounts' : (selectedAccount?.name ?? 'Portfolio')}</h1>
            <div className="portfolio-meta">
              {selectedAccountId !== 'all' && (
                <>
                  <span>Brokerage: {selectedAccount?.accountNumber ?? ''}</span>
                  <span className="separator">·</span>
                  <span>Routing number</span>
                  <button className="info-btn-small">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
                      <path fill="currentColor" d="M11 7h2v2h-2zm0 4h2v6h-2z"/>
                    </svg>
                  </button>
                </>
              )}
              {selectedAccountId === 'all' && (
                <span>Combined view of all accounts</span>
              )}
            </div>
          </div>
          <TabNav 
            activeTab={activeTab} 
            onTabChange={setActiveTab}
            selectedStock={selectedStock}
            onCloseStockTab={handleCloseStockTab}
          />
          <div className="tab-content">
            {loading ? (
              <div className="loading">
                <div className="loading-spinner"></div>
                <p>Loading portfolio data...</p>
              </div>
            ) : portfolioData ? (
              <>
                {activeTab === 'summary' && (
                  <SummaryView
                    portfolioData={portfolioData}
                    historicalData={historicalData}
                    currentValue={currentValue}
                    todayChange={todayChange}
                    todayChangePercent={todayChangePercent}
                  />
                )}
                {activeTab === 'positions' && (
                  <PositionsView
                    positions={portfolioData.positions}
                    transactions={portfolioData.transactions}
                    totalValue={positionValue}
                    onStockSelect={handleStockSelect}
                    onRefresh={handleRefreshPrices}
                    isRefreshing={isRefreshing}
                    lastUpdateTime={lastUpdateTime}
                  />
                )}
                {activeTab === 'stock' && selectedStock && (
                  <StockOverviewView
                    symbol={selectedStock}
                    positions={portfolioData.positions}
                    transactions={portfolioData.transactions}
                    onBack={handleCloseStockTab}
                  />
                )}
                {activeTab === 'activity' && (
                  <ActivityView
                    transactions={portfolioData.transactions}
                  />
                )}
                {activeTab === 'charts' && (
                  <ChartsView
                    positions={portfolioData.positions}
                    transactions={portfolioData.transactions}
                    totalValue={positionValue}
                  />
                )}
                {activeTab === 'history' && (
                  <HistoryView
                    onStockSelect={handleStockSelect}
                  />
                )}
                {activeTab === 'import' && (
                  <ImportView
                    currentPositions={portfolioData.positions}
                    currentTransactions={portfolioData.transactions}
                    onDataImported={handleDataImported}
                  />
                )}
                {activeTab === 'documents' && (
                  <DocumentsView />
                )}
                {activeTab !== 'summary' && activeTab !== 'positions' && activeTab !== 'activity' && activeTab !== 'stock' && activeTab !== 'charts' && activeTab !== 'history' && activeTab !== 'import' && activeTab !== 'documents' && (
                  <div className="coming-soon">
                    <h2>Coming Soon</h2>
                    <p>This section is under development.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="error">
                <p>Failed to load portfolio data.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
