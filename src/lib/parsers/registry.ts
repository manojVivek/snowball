import type { DividendParser } from './types';
import { zerodhaParser } from './brokers/zerodha';

export const parsers: DividendParser[] = [zerodhaParser];

export function getParser(id: string): DividendParser | undefined {
  return parsers.find((p) => p.brokerInfo.id === id);
}

export function getParserByCountry(country: 'IN' | 'US' | 'GLOBAL'): DividendParser[] {
  return parsers.filter((p) => p.brokerInfo.country === country);
}
