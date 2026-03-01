/**
 * Fetch live stock prices from Yahoo Finance API
 * Uses a CORS proxy for browser compatibility
 */

export interface LiveQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

// List of known CORS proxies - we'll try multiple fallbacks
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
];

// Delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch a single stock quote from Yahoo Finance with timeout
 */
async function fetchSingleQuote(
  symbol: string, 
  proxyUrl: string,
  timeoutMs: number = 10000
): Promise<LiveQuote | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const url = `${proxyUrl}${encodeURIComponent(yahooUrl)}`;
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    
    if (!result) {
      console.warn(`No data for ${symbol}`);
      return null;
    }
    
    const meta = result.meta;
    const price = meta?.regularMarketPrice ?? 0;
    const previousClose = meta?.previousClose ?? meta?.chartPreviousClose ?? 0;
    const change = price - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;
    
    return {
      symbol,
      price,
      change,
      changePercent,
      previousClose,
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn(`Timeout fetching ${symbol}`);
    } else {
      console.warn(`Failed to fetch ${symbol}:`, error);
    }
    return null;
  }
}

/**
 * Fetch a quote with retries across multiple proxies
 */
async function fetchWithRetry(symbol: string): Promise<LiveQuote | null> {
  for (const proxy of CORS_PROXIES) {
    const quote = await fetchSingleQuote(symbol, proxy);
    if (quote) {
      return quote;
    }
    // Small delay before trying next proxy
    await delay(100);
  }
  return null;
}

/**
 * Fetch live quotes for multiple symbols
 * Uses staggered requests to avoid rate limiting
 * Returns a map of symbol -> quote data
 */
export async function fetchLiveQuotes(symbols: string[]): Promise<Map<string, LiveQuote>> {
  const quotes = new Map<string, LiveQuote>();
  
  console.log(`Fetching live quotes for ${symbols.length} symbols...`);
  
  // Batch size for parallel requests (smaller to avoid overwhelming proxy)
  const BATCH_SIZE = 5;
  const DELAY_BETWEEN_BATCHES = 300; // ms
  
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    
    // Fetch batch in parallel
    const results = await Promise.all(
      batch.map(symbol => fetchWithRetry(symbol))
    );
    
    // Store results
    for (const quote of results) {
      if (quote) {
        quotes.set(quote.symbol, quote);
        console.log(`✓ ${quote.symbol}: $${quote.price.toFixed(2)} (${quote.change >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%)`);
      }
    }
    
    // Delay before next batch (except for last batch)
    if (i + BATCH_SIZE < symbols.length) {
      await delay(DELAY_BETWEEN_BATCHES);
    }
  }
  
  console.log(`Successfully fetched ${quotes.size}/${symbols.length} quotes`);
  
  return quotes;
}

/**
 * Format current time as "MMM-DD-YYYY h:mm a ET"
 */
export function formatUpdateTime(): string {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[now.getMonth()];
  const day = String(now.getDate()).padStart(2, '0');
  const year = now.getFullYear();
  
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
  hours = hours % 12;
  hours = hours ? hours : 12;
  
  return `As of ${month}-${day}-${year} ${hours}:${minutes} ${ampm} ET`;
}
