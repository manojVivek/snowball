import type { BasketExporter } from './types';
import { kiteExporter } from './brokers/kite';

export const exporters: BasketExporter[] = [kiteExporter];

export function getExporter(id: string): BasketExporter | undefined {
  return exporters.find((e) => e.brokerInfo.id === id);
}

export function getExporterByCountry(country: 'IN' | 'US' | 'GLOBAL'): BasketExporter[] {
  return exporters.filter((e) => e.brokerInfo.country === country);
}
