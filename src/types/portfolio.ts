/**
 * Unified Portfolio Data Types
 * 
 * These types support multi-account data from various brokers
 * and provide a consistent format for transactions and positions.
 */

// =============================================================================
// Transaction Types
// =============================================================================

export type TransactionAction = 
  | 'BUY' 
  | 'SELL' 
  | 'DEPOSIT' 
  | 'WITHDRAWAL' 
  | 'DIVIDEND' 
  | 'INTEREST'
  | 'FEE'
  | 'TRANSFER'
  | 'REINVESTMENT'
  | 'OTHER';

export type AccountType = 'Margin' | 'Cash' | 'IRA' | 'Roth IRA' | 'Other';

export interface Transaction {
  /** Unique identifier: {date}-{symbol}-{action}-{price}-{quantity} */
  id: string;
  /** Transaction date in YYYY-MM-DD format */
  date: string;
  /** Settlement date in YYYY-MM-DD format (optional) */
  settlementDate?: string;
  /** Normalized action type */
  action: TransactionAction;
  /** Stock ticker symbol (empty for cash transactions) */
  symbol: string;
  /** Full description of the security */
  description: string;
  /** Number of shares (negative for sells) */
  quantity: number;
  /** Price per share */
  price: number;
  /** Total transaction amount (negative for buys, positive for sells/deposits) */
  amount: number;
  /** Account type for the transaction */
  type: AccountType;
  /** Commission fees */
  commission?: number;
  /** Other fees */
  fees?: number;
  /** Original raw action string from broker export */
  rawAction?: string;
}

export interface AccountTransactions {
  /** Account display name */
  name: string;
  /** Broker name (e.g., "Fidelity", "Schwab") */
  broker: string;
  /** List of transactions sorted by date (newest first) */
  transactions: Transaction[];
}

export interface TransactionsData {
  /** Schema version for future migrations */
  version: string;
  /** ISO timestamp of last update */
  lastUpdated: string;
  /** Transactions organized by account number */
  accounts: Record<string, AccountTransactions>;
}

// =============================================================================
// Position Types
// =============================================================================

export interface Position {
  /** Stock ticker symbol */
  symbol: string;
  /** Full description of the security */
  description: string;
  /** Number of shares held */
  quantity: number;
  /** Current market value */
  currentValue: number;
  /** Last price per share */
  lastPrice: number;
  /** Last price change (today's price movement per share) */
  lastPriceChange: number;
  /** Today's gain/loss in dollars */
  todayGainLoss: number;
  /** Today's gain/loss as percentage */
  todayGainLossPercent: number;
  /** Total cost basis */
  costBasis: number;
  /** Average cost basis per share */
  avgCostBasis: number;
  /** Total gain/loss in dollars */
  totalGainLoss: number;
  /** Total gain/loss as percentage */
  totalGainLossPercent: number;
  /** Percentage of total account value */
  percentOfAccount: number;
  /** Position type */
  type: AccountType;
}

export interface PositionSnapshot {
  /** Snapshot date in YYYY-MM-DD format */
  date: string;
  /** Total account value at snapshot time */
  totalValue?: number;
  /** List of positions at this point in time */
  positions: Position[];
}

export interface AccountPositions {
  /** Account display name */
  name: string;
  /** Broker name */
  broker: string;
  /** Historical position snapshots, newest first */
  history: PositionSnapshot[];
}

export interface PositionsData {
  /** Schema version for future migrations */
  version: string;
  /** ISO timestamp of last update */
  lastUpdated: string;
  /** Position snapshots organized by account number */
  snapshots: Record<string, AccountPositions>;
}

// =============================================================================
// Import/Export Helpers
// =============================================================================

export interface ImportResult {
  success: boolean;
  fileType: 'history' | 'positions';
  accountNumber: string;
  accountName: string;
  recordsProcessed: number;
  recordsAdded: number;
  recordsSkipped: number;
  errors: string[];
}

export interface ParsedCSVRow {
  [key: string]: string;
}
