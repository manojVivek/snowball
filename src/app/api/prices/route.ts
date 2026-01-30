import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

// Initialize yahoo-finance2 v3
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// In-memory cache with TTL
interface CacheEntry {
  price: number;
  exchange: 'NSE' | 'BSE';
  timestamp: number;
}

const priceCache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day in milliseconds

function getCachedEntry(symbol: string): { price: number; exchange: 'NSE' | 'BSE' } | null {
  const entry = priceCache.get(symbol);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return { price: entry.price, exchange: entry.exchange };
  }
  // Remove expired entry
  if (entry) {
    priceCache.delete(symbol);
  }
  return null;
}

function setCachedEntry(symbol: string, price: number, exchange: 'NSE' | 'BSE'): void {
  priceCache.set(symbol, { price, exchange, timestamp: Date.now() });
}

interface QuoteResult {
  symbol?: string;
  regularMarketPrice?: number;
}

async function fetchSingleQuote(symbol: string): Promise<QuoteResult | null> {
  try {
    const quote = await yahooFinance.quote(symbol);
    return quote as QuoteResult;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { symbols, batchIndex, totalBatches } = await request.json();

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        { error: 'No symbols provided' },
        { status: 400 }
      );
    }

    const prices: Record<string, number> = {};
    const exchanges: Record<string, 'NSE' | 'BSE'> = {};
    const symbolsToFetch: string[] = [];

    // Check cache first
    for (const symbol of symbols) {
      const cached = getCachedEntry(symbol);
      if (cached !== null) {
        prices[symbol] = cached.price;
        exchanges[symbol] = cached.exchange;
      } else {
        symbolsToFetch.push(symbol);
      }
    }

    // Fetch uncached symbols
    if (symbolsToFetch.length > 0) {
      // Try NSE first (.NS suffix)
      const nsePromises = symbolsToFetch.map(async (symbol) => {
        const quote = await fetchSingleQuote(`${symbol}.NS`);
        if (quote?.symbol && quote?.regularMarketPrice) {
          const originalSymbol = quote.symbol.replace('.NS', '').replace('.BO', '');
          setCachedEntry(originalSymbol, quote.regularMarketPrice, 'NSE');
          return { symbol: originalSymbol, price: quote.regularMarketPrice, exchange: 'NSE' as const };
        }
        return null;
      });

      const nseResults = await Promise.all(nsePromises);
      for (const result of nseResults) {
        if (result) {
          prices[result.symbol] = result.price;
          exchanges[result.symbol] = result.exchange;
        }
      }

      // Try BSE for missing symbols
      const stillMissing = symbolsToFetch.filter((s) => !prices[s]);
      if (stillMissing.length > 0) {
        const bsePromises = stillMissing.map(async (symbol) => {
          const quote = await fetchSingleQuote(`${symbol}.BO`);
          if (quote?.symbol && quote?.regularMarketPrice) {
            const originalSymbol = quote.symbol.replace('.BO', '').replace('.NS', '');
            setCachedEntry(originalSymbol, quote.regularMarketPrice, 'BSE');
            return { symbol: originalSymbol, price: quote.regularMarketPrice, exchange: 'BSE' as const };
          }
          return null;
        });

        const bseResults = await Promise.all(bsePromises);
        for (const result of bseResults) {
          if (result && !prices[result.symbol]) {
            prices[result.symbol] = result.price;
            exchanges[result.symbol] = result.exchange;
          }
        }
      }
    }

    const cachedCount = symbols.length - symbolsToFetch.length;

    return NextResponse.json({
      prices,
      exchanges,
      meta: {
        requested: symbols.length,
        fromCache: cachedCount,
        fetched: symbolsToFetch.length,
        found: Object.keys(prices).length,
        batchIndex,
        totalBatches,
      },
    });
  } catch (error) {
    console.error('Price fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prices' },
      { status: 500 }
    );
  }
}
