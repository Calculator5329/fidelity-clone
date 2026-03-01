// Sample portfolio data — all values are fictional for demonstration purposes

export interface StockPrice {
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
}

export const mockPrices: Record<string, StockPrice> = {
  AAPL: {
    symbol: 'AAPL',
    lastPrice: 228.87,
    priceChange: 1.43,
    priceChangePercent: 0.63,
  },
  MSFT: {
    symbol: 'MSFT',
    lastPrice: 418.32,
    priceChange: -2.15,
    priceChangePercent: -0.51,
  },
  NVDA: {
    symbol: 'NVDA',
    lastPrice: 135.45,
    priceChange: 4.22,
    priceChangePercent: 3.22,
  },
  TSLA: {
    symbol: 'TSLA',
    lastPrice: 384.10,
    priceChange: 8.75,
    priceChangePercent: 2.33,
  },
  SPY: {
    symbol: 'SPY',
    lastPrice: 579.80,
    priceChange: 1.90,
    priceChangePercent: 0.33,
  },
};

export function getStockPrice(symbol: string): StockPrice {
  return mockPrices[symbol] || {
    symbol,
    lastPrice: 100,
    priceChange: 0,
    priceChangePercent: 0,
  };
}

// Sample account data — fictional accounts for demonstration
export interface Account {
  id: string;
  name: string;
  accountNumber: string;
  balance: number;
  change: number;
  changePercent: number;
  type: 'investment' | 'retirement' | 'trading';
}

export const mockAccounts: Account[] = [
  {
    id: 'growth',
    name: 'Growth Portfolio',
    accountNumber: 'DEMO001',
    balance: 25397.78,
    change: 148.32,
    changePercent: 0.59,
    type: 'investment',
  },
];

// Account ID to account number mapping
export const ACCOUNT_ID_TO_NUMBER: Record<string, string> = {
  'all':    'ALL',
  'growth': 'DEMO001',
};

export function getAccountNumber(accountId: string): string {
  return ACCOUNT_ID_TO_NUMBER[accountId] || accountId;
}

export function getAccountById(accountId: string): Account | undefined {
  return mockAccounts.find(acc => acc.id === accountId);
}

export type PerformancePeriod = '1D' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | 'All';

const marketReturns: Record<PerformancePeriod, { sp500: number; djTotal: number; msciACWI: number; bloombergAgg: number; bloombergMuni: number }> = {
  '1D':  { sp500: 0.33,  djTotal: 0.28,  msciACWI: 0.45,   bloombergAgg: -0.12, bloombergMuni: 0.04  },
  '1M':  { sp500: -1.80, djTotal: -1.65, msciACWI: -0.95,  bloombergAgg: -0.30, bloombergMuni: 0.10  },
  '3M':  { sp500: 3.20,  djTotal: 2.95,  msciACWI: 1.85,   bloombergAgg: -0.75, bloombergMuni: 0.25  },
  '6M':  { sp500: 9.10,  djTotal: 8.40,  msciACWI: 4.50,   bloombergAgg: -0.60, bloombergMuni: 0.95  },
  'YTD': { sp500: 1.20,  djTotal: 1.05,  msciACWI: 0.85,   bloombergAgg: 0.10,  bloombergMuni: 0.20  },
  '1Y':  { sp500: 24.50, djTotal: 23.10, msciACWI: 6.30,   bloombergAgg: 1.80,  bloombergMuni: 2.40  },
  '2Y':  { sp500: 55.20, djTotal: 51.40, msciACWI: 14.20,  bloombergAgg: -1.90, bloombergMuni: 3.80  },
  'All': { sp500: 92.40, djTotal: 85.10, msciACWI: 38.60,  bloombergAgg: -3.20, bloombergMuni: 6.10  },
};

export function getPerformanceData(period: PerformancePeriod) {
  const yourReturn = calculatePeriodReturn(period);
  const market = marketReturns[period];

  const periodLabel: Record<PerformancePeriod, string> = {
    '1D': '1-day', '1M': '1-month', '3M': '3-month', '6M': '6-month',
    'YTD': 'year-to-date', '1Y': '1-year', '2Y': '2-year', 'All': 'since-inception',
  };

  return [
    { name: `Your ${periodLabel[period]} cumulative pre-tax return (TWRR)`, value: yourReturn },
    { name: 'S&P 500® Index',                                value: market.sp500 },
    { name: 'Dow Jones U.S. Total Stock Market Index',       value: market.djTotal },
    { name: 'MSCI ACWI ex USA (Net MA Tax)',                 value: market.msciACWI },
    { name: 'Bloomberg U.S. Aggregate Bond Index',           value: market.bloombergAgg },
    { name: 'Bloomberg Municipal Bond Index',                value: market.bloombergMuni },
  ];
}

export function calculatePeriodReturn(period: PerformancePeriod): number {
  switch (period) {
    case '1D':  return 0.59;
    case '1M':  { const d = monthlyTWRR.slice(-1);  return (d.reduce((a, r) => a * (1 + r.return / 100), 1) - 1) * 100; }
    case '3M':  { const d = monthlyTWRR.slice(-3);  return (d.reduce((a, r) => a * (1 + r.return / 100), 1) - 1) * 100; }
    case '6M':  { const d = monthlyTWRR.slice(-6);  return (d.reduce((a, r) => a * (1 + r.return / 100), 1) - 1) * 100; }
    case 'YTD': return 0.59;
    case '1Y':  { const d = monthlyTWRR.slice(-12); return (d.reduce((a, r) => a * (1 + r.return / 100), 1) - 1) * 100; }
    case '2Y':  { const d = monthlyTWRR.slice(-24); return (d.reduce((a, r) => a * (1 + r.return / 100), 1) - 1) * 100; }
    case 'All': return (monthlyTWRR.reduce((a, r) => a * (1 + r.return / 100), 1) - 1) * 100;
    default:    return 0;
  }
}

export const performanceData = getPerformanceData('1D');

// Monthly TWRR — fictional sample returns for demo portfolio (2022-01 to 2026-01)
export const monthlyTWRR = [
  { month: '2022-01', return: -8.20 },
  { month: '2022-02', return: -2.45 },
  { month: '2022-03', return: 3.80 },
  { month: '2022-04', return: -7.60 },
  { month: '2022-05', return: -2.10 },
  { month: '2022-06', return: -8.80 },
  { month: '2022-07', return: 9.20 },
  { month: '2022-08', return: -3.50 },
  { month: '2022-09', return: -9.30 },
  { month: '2022-10', return: 8.10 },
  { month: '2022-11', return: 4.40 },
  { month: '2022-12', return: -5.60 },
  { month: '2023-01', return: 7.80 },
  { month: '2023-02', return: -1.90 },
  { month: '2023-03', return: 5.40 },
  { month: '2023-04', return: 1.20 },
  { month: '2023-05', return: 8.50 },
  { month: '2023-06', return: 7.30 },
  { month: '2023-07', return: 4.60 },
  { month: '2023-08', return: -2.80 },
  { month: '2023-09', return: -4.20 },
  { month: '2023-10', return: -2.10 },
  { month: '2023-11', return: 9.70 },
  { month: '2023-12', return: 5.80 },
  { month: '2024-01', return: 1.30 },
  { month: '2024-02', return: 12.40 },
  { month: '2024-03', return: 2.90 },
  { month: '2024-04', return: -4.20 },
  { month: '2024-05', return: 6.80 },
  { month: '2024-06', return: 3.50 },
  { month: '2024-07', return: 1.10 },
  { month: '2024-08', return: 2.30 },
  { month: '2024-09', return: 5.60 },
  { month: '2024-10', return: -1.20 },
  { month: '2024-11', return: 10.30 },
  { month: '2024-12', return: -3.80 },
  { month: '2025-01', return: 4.20 },
  { month: '2025-02', return: -8.10 },
  { month: '2025-03', return: -6.40 },
  { month: '2025-04', return: 7.90 },
  { month: '2025-05', return: 9.60 },
  { month: '2025-06', return: 4.10 },
  { month: '2025-07', return: 3.20 },
  { month: '2025-08', return: -1.40 },
  { month: '2025-09', return: 2.80 },
  { month: '2025-10', return: 1.90 },
  { month: '2025-11', return: 0.80 },
  { month: '2025-12', return: -2.10 },
  { month: '2026-01', return: 0.59 },
];

export function calculateCumulativeTWRR(months: number | 'all' = 'all'): number {
  const data = months === 'all' ? monthlyTWRR : monthlyTWRR.slice(-months);
  return (data.reduce((acc, { return: ret }) => acc * (1 + ret / 100), 1) - 1) * 100;
}

export function getCumulativeReturnSeries(months: number | 'all' = 'all'): { month: string; cumulativeReturn: number }[] {
  const data = months === 'all' ? monthlyTWRR : monthlyTWRR.slice(-months);
  let cumulative = 1;
  return data.map(({ month, return: ret }) => {
    cumulative *= (1 + ret / 100);
    return { month, cumulativeReturn: (cumulative - 1) * 100 };
  });
}
