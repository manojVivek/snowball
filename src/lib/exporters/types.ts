import type { BrokerInfo } from '../core/types';

export interface BasketOrder {
  symbol: string;
  exchange: string;
  quantity: number;
  transactionType: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  product: string;
}

export interface ExportResult {
  filename: string;
  blob: Blob;
  mimeType: string;
}

export interface BasketExporter {
  brokerInfo: BrokerInfo;
  maxOrdersPerBasket: number;
  export: (orders: BasketOrder[], exchanges: Record<string, string>) => Promise<ExportResult>;
}
