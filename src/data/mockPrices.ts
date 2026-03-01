// Mock current stock prices based on the screenshot data
// In a real app, these would come from a stock API

export interface StockPrice {
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
}

export const mockPrices: Record<string, StockPrice> = {
  META: {
    symbol: 'META',
    lastPrice: 650.41,
    priceChange: -9.68,
    priceChangePercent: -1.47,
  },
  GOOGL: {
    symbol: 'GOOGL',
    lastPrice: 315.15,
    priceChange: 2.15,
    priceChangePercent: 0.68,
  },
  AMZN: {
    symbol: 'AMZN',
    lastPrice: 226.50,
    priceChange: -4.32,
    priceChangePercent: -1.83,
  },
  PYPL: {
    symbol: 'PYPL',
    lastPrice: 58.14,
    priceChange: -0.24,
    priceChangePercent: -0.42,
  },
  TXRH: {
    symbol: 'TXRH',
    lastPrice: 171.36,
    priceChange: 5.36,
    priceChangePercent: 3.22,
  },
  DUOL: {
    symbol: 'DUOL',
    lastPrice: 176.48,
    priceChange: 0.98,
    priceChangePercent: 0.55,
  },
  AMD: {
    symbol: 'AMD',
    lastPrice: 223.47,
    priceChange: 9.31,
    priceChangePercent: 4.34,
  },
  ASML: {
    symbol: 'ASML',
    lastPrice: 1163.78,
    priceChange: 93.92,
    priceChangePercent: 8.77,
  },
  MELI: {
    symbol: 'MELI',
    lastPrice: 1973.70,
    priceChange: -40.56,
    priceChangePercent: -2.02,
  },
  NKE: {
    symbol: 'NKE',
    lastPrice: 63.28,
    priceChange: -0.43,
    priceChangePercent: -0.68,
  },
  ADBE: {
    symbol: 'ADBE',
    lastPrice: 443.50,
    priceChange: 5.20,
    priceChangePercent: 1.19,
  },
  TSLA: {
    symbol: 'TSLA',
    lastPrice: 410.25,
    priceChange: 12.50,
    priceChangePercent: 3.14,
  },
  MA: {
    symbol: 'MA',
    lastPrice: 542.80,
    priceChange: 3.25,
    priceChangePercent: 0.60,
  },
  CRM: {
    symbol: 'CRM',
    lastPrice: 350.00,
    priceChange: -2.50,
    priceChangePercent: -0.71,
  },
  CELH: {
    symbol: 'CELH',
    lastPrice: 32.45,
    priceChange: -0.85,
    priceChangePercent: -2.55,
  },
  SOFI: {
    symbol: 'SOFI',
    lastPrice: 15.80,
    priceChange: 0.35,
    priceChangePercent: 2.27,
  },
  NVO: {
    symbol: 'NVO',
    lastPrice: 82.50,
    priceChange: 1.20,
    priceChangePercent: 1.48,
  },
  NICE: {
    symbol: 'NICE',
    lastPrice: 165.00,
    priceChange: -1.50,
    priceChangePercent: -0.90,
  },
  COUR: {
    symbol: 'COUR',
    lastPrice: 9.50,
    priceChange: 0.15,
    priceChangePercent: 1.60,
  },
  RVLV: {
    symbol: 'RVLV',
    lastPrice: 28.50,
    priceChange: 0.45,
    priceChangePercent: 1.60,
  },
  CRCT: {
    symbol: 'CRCT',
    lastPrice: 5.20,
    priceChange: -0.10,
    priceChangePercent: -1.89,
  },
  SNBR: {
    symbol: 'SNBR',
    lastPrice: 12.50,
    priceChange: 0.25,
    priceChangePercent: 2.04,
  },
  SQ: {
    symbol: 'SQ',
    lastPrice: 92.50,
    priceChange: 1.80,
    priceChangePercent: 1.98,
  },
  ROKU: {
    symbol: 'ROKU',
    lastPrice: 85.20,
    priceChange: -1.50,
    priceChangePercent: -1.73,
  },
  SHOP: {
    symbol: 'SHOP',
    lastPrice: 115.80,
    priceChange: 2.30,
    priceChangePercent: 2.03,
  },
  PLTR: {
    symbol: 'PLTR',
    lastPrice: 78.50,
    priceChange: 1.25,
    priceChangePercent: 1.62,
  },
  BABA: {
    symbol: 'BABA',
    lastPrice: 85.20,
    priceChange: 1.45,
    priceChangePercent: 1.73,
  },
  '87975H100': {
    symbol: '87975H100',
    lastPrice: 8.50,
    priceChange: 0.12,
    priceChangePercent: 1.43,
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

// Mock account data for the sidebar
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
    id: 'index',
    name: 'Index Portfolio',
    accountNumber: 'Z24468360',
    balance: 7098.62,
    change: 33.40,
    changePercent: 0.47,
    type: 'investment',
  },
  {
    id: 'growth',
    name: 'Growth Portfolio',
    accountNumber: 'Z25424500',
    balance: 61694.25,
    change: -101.94,
    changePercent: -0.16,
    type: 'investment',
  },
  {
    id: 'yield',
    name: 'Yield Portfolio',
    accountNumber: 'Z27316070',
    balance: 3.45,
    change: 0.00,
    changePercent: 0.00,
    type: 'investment',
  },
  {
    id: 'roth',
    name: 'ROTH IRA',
    accountNumber: '244509266',
    balance: 9949.19,
    change: 1.51,
    changePercent: 0.02,
    type: 'retirement',
  },
  {
    id: 'yolo',
    name: 'YOLO Portfolio',
    accountNumber: 'Z25426285',
    balance: 5535.02,
    change: 31.25,
    changePercent: 0.57,
    type: 'trading',
  },
];

// Account ID to account number mapping
export const ACCOUNT_ID_TO_NUMBER: Record<string, string> = {
  'all': 'ALL',
  'index': 'Z24468360',
  'growth': 'Z25424500',
  'yield': 'Z27316070',
  'roth': '244509266',
  'yolo': 'Z25426285',
};

// Get account number from account ID
export function getAccountNumber(accountId: string): string {
  return ACCOUNT_ID_TO_NUMBER[accountId] || accountId;
}

// Get account by ID
export function getAccountById(accountId: string): Account | undefined {
  return mockAccounts.find(acc => acc.id === accountId);
}

// Performance comparison data - now a function that calculates based on period
export type PerformancePeriod = '1D' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | 'All';

// Market index returns by period (approximate historical data)
const marketReturns: Record<PerformancePeriod, { sp500: number; djTotal: number; msciACWI: number; bloombergAgg: number; bloombergMuni: number }> = {
  '1D': { sp500: 0.21, djTotal: 0.33, msciACWI: 0.92, bloombergAgg: -0.20, bloombergMuni: 0.05 },
  '1M': { sp500: -2.50, djTotal: -2.35, msciACWI: -1.80, bloombergAgg: -0.45, bloombergMuni: 0.15 },
  '3M': { sp500: 2.15, djTotal: 1.95, msciACWI: 1.50, bloombergAgg: -1.20, bloombergMuni: 0.35 },
  '6M': { sp500: 8.45, djTotal: 7.80, msciACWI: 3.20, bloombergAgg: -0.80, bloombergMuni: 1.15 },
  'YTD': { sp500: 0.00, djTotal: 0.00, msciACWI: 0.00, bloombergAgg: 0.00, bloombergMuni: 0.00 }, // Jan 2026 - minimal YTD
  '1Y': { sp500: 23.84, djTotal: 22.45, msciACWI: 5.20, bloombergAgg: 1.25, bloombergMuni: 2.10 },
  '2Y': { sp500: 52.30, djTotal: 48.65, msciACWI: 12.80, bloombergAgg: -2.40, bloombergMuni: 3.45 },
  'All': { sp500: 85.20, djTotal: 78.50, msciACWI: 32.10, bloombergAgg: -4.80, bloombergMuni: 5.50 },
};

export function getPerformanceData(period: PerformancePeriod) {
  const yourReturn = calculatePeriodReturn(period);
  const market = marketReturns[period];
  
  const periodLabel: Record<PerformancePeriod, string> = {
    '1D': '1-day',
    '1M': '1-month',
    '3M': '3-month',
    '6M': '6-month',
    'YTD': 'year-to-date',
    '1Y': '1-year',
    '2Y': '2-year',
    'All': 'since-inception'
  };
  
  return [
    { name: `Your ${periodLabel[period]} cumulative pre-tax return (TWRR)`, value: yourReturn },
    { name: 'S&P 500® Index', value: market.sp500 },
    { name: 'Dow Jones U.S. Total Stock Market Index', value: market.djTotal },
    { name: 'MSCI ACWI ex USA (Net MA Tax)', value: market.msciACWI },
    { name: 'Bloomberg U.S. Aggregate Bond Index', value: market.bloombergAgg },
    { name: 'Bloomberg Municipal Bond Index', value: market.bloombergMuni },
  ];
}

// Calculate return for a specific period using TWRR data
export function calculatePeriodReturn(period: PerformancePeriod): number {
  switch (period) {
    case '1D': {
      // 1-day return - use the last trading day's change
      // From the account data: -0.16% for Jan 2, 2026
      return -0.16;
    }
    case '1M': {
      // Last 1 month of TWRR data
      const data = monthlyTWRR.slice(-1);
      const cumulative = data.reduce((acc, { return: ret }) => acc * (1 + ret / 100), 1);
      return (cumulative - 1) * 100;
    }
    case '3M': {
      // Last 3 months of TWRR data
      const data = monthlyTWRR.slice(-3);
      const cumulative = data.reduce((acc, { return: ret }) => acc * (1 + ret / 100), 1);
      return (cumulative - 1) * 100;
    }
    case '6M': {
      // Last 6 months of TWRR data
      const data = monthlyTWRR.slice(-6);
      const cumulative = data.reduce((acc, { return: ret }) => acc * (1 + ret / 100), 1);
      return (cumulative - 1) * 100;
    }
    case 'YTD': {
      // Year-to-date for 2026 (only a few days in)
      // Since we're in early January 2026 and TWRR is monthly,
      // we can estimate based on the account's daily change
      return -0.16;
    }
    case '1Y': {
      // Last 12 months of TWRR data
      const data = monthlyTWRR.slice(-12);
      const cumulative = data.reduce((acc, { return: ret }) => acc * (1 + ret / 100), 1);
      return (cumulative - 1) * 100;
    }
    case '2Y': {
      // Last 24 months of TWRR data
      const data = monthlyTWRR.slice(-24);
      const cumulative = data.reduce((acc, { return: ret }) => acc * (1 + ret / 100), 1);
      return (cumulative - 1) * 100;
    }
    case 'All': {
      // Use all available TWRR data (since inception)
      const cumulative = monthlyTWRR.reduce((acc, { return: ret }) => acc * (1 + ret / 100), 1);
      return (cumulative - 1) * 100;
    }
    default:
      return 0;
  }
}

// Legacy export for backwards compatibility
export const performanceData = getPerformanceData('1D');

// Monthly TWRR (Time-Weighted Rate of Return) data - pre-tax
// Format: { month: 'YYYY-MM', return: percentage }
export const monthlyTWRR = [
  { month: '2023-01', return: 1.65 },
  { month: '2023-02', return: 2.51 },
  { month: '2023-03', return: 8.16 },
  { month: '2023-04', return: -2.52 },
  { month: '2023-05', return: 6.44 },
  { month: '2023-06', return: 9.73 },
  { month: '2023-07', return: 7.18 },
  { month: '2023-08', return: -7.22 },
  { month: '2023-09', return: -3.35 },
  { month: '2023-10', return: -3.72 },
  { month: '2023-11', return: 6.36 },
  { month: '2023-12', return: 8.02 },
  { month: '2024-01', return: 0.59 },
  { month: '2024-02', return: 14.62 },
  { month: '2024-03', return: 0.40 },
  { month: '2024-04', return: -3.91 },
  { month: '2024-05', return: 4.56 },
  { month: '2024-06', return: 3.43 },
  { month: '2024-07', return: 0.62 },
  { month: '2024-08', return: 2.44 },
  { month: '2024-09', return: 9.09 },
  { month: '2024-10', return: 0.30 },
  { month: '2024-11', return: 9.68 },
  { month: '2024-12', return: 3.42 },
  { month: '2025-01', return: 8.07 },
  { month: '2025-02', return: -11.53 },
  { month: '2025-03', return: -11.37 },
  { month: '2025-04', return: -1.23 },
  { month: '2025-05', return: 14.39 },
  { month: '2025-06', return: 6.62 },
  { month: '2025-07', return: 2.98 },
  { month: '2025-08', return: -0.38 },
  { month: '2025-09', return: 3.33 },
  { month: '2025-10', return: 2.36 },
  { month: '2025-11', return: -0.57 },
  { month: '2025-12', return: -1.04 },
];

// Calculate cumulative TWRR from monthly returns
export function calculateCumulativeTWRR(months: number | 'all' = 'all'): number {
  const data = months === 'all' ? monthlyTWRR : monthlyTWRR.slice(-months);
  // TWRR is calculated by multiplying (1 + return) for each period
  const cumulativeReturn = data.reduce((acc, { return: ret }) => acc * (1 + ret / 100), 1);
  return (cumulativeReturn - 1) * 100;
}

// Get cumulative return series for charting
export function getCumulativeReturnSeries(months: number | 'all' = 'all'): { month: string; cumulativeReturn: number }[] {
  const data = months === 'all' ? monthlyTWRR : monthlyTWRR.slice(-months);
  let cumulative = 1;
  return data.map(({ month, return: ret }) => {
    cumulative *= (1 + ret / 100);
    return {
      month,
      cumulativeReturn: (cumulative - 1) * 100,
    };
  });
}