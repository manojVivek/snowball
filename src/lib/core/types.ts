// Core broker-agnostic types for dividend reinvestment

export interface DividendEntry {
  symbol: string;
  companyName: string;
  isin?: string;
  amount: number;
  date?: string;
}

export interface AggregatedDividend {
  symbol: string;
  companyName: string;
  totalDividend: number;
}

export interface ParsedDividendData {
  entries: DividendEntry[];
  aggregated: Record<string, AggregatedDividend>;
}

export interface StockPrice {
  symbol: string;
  price: number;
  currency?: string;
}

export interface Recommendation {
  symbol: string;
  companyName: string;
  dividend: number;
  price: number;
  quantity: number;
  totalCost: number;
  remaining: number;
}

export interface RecommendationSummary {
  recommendations: Recommendation[];
  totalDividend: number;
  totalInvestment: number;
  unusedBalance: number;
}

// Broker metadata
export interface BrokerInfo {
  id: string;
  name: string;
  description: string;
  supportedFormats: string[];
  country: 'IN' | 'US' | 'GLOBAL';
}
