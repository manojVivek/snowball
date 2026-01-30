import JSZip from 'jszip';
import type { BasketExporter, BasketOrder, ExportResult } from '../types';

const BASKET_LIMIT = 20;

async function exportToKite(
  orders: BasketOrder[],
  exchanges: Record<string, string>
): Promise<ExportResult> {
  const allOrders = orders.map((order) => ({
    instrument: {
      tradingsymbol: order.symbol,
      exchange: exchanges[order.symbol] || order.exchange || 'NSE',
    },
    weight: 0,
    params: {
      quantity: order.quantity,
      transactionType: order.transactionType,
      product: order.product,
      orderType: order.orderType,
      variety: 'regular',
    },
  }));

  // Split into chunks of 20
  const chunks: typeof allOrders[] = [];
  for (let i = 0; i < allOrders.length; i += BASKET_LIMIT) {
    chunks.push(allOrders.slice(i, i + BASKET_LIMIT));
  }

  const dateStr = new Date().toISOString().split('T')[0];

  // If only one chunk, return as single JSON
  if (chunks.length === 1) {
    const jsonContent = JSON.stringify(chunks[0], null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    return {
      filename: `dividend-basket-${dateStr}.json`,
      blob,
      mimeType: 'application/json',
    };
  }

  // Multiple chunks - create a zip file
  const zip = new JSZip();
  chunks.forEach((chunk, index) => {
    const jsonContent = JSON.stringify(chunk, null, 2);
    zip.file(`dividend-basket-part${index + 1}.json`, jsonContent);
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return {
    filename: `dividend-baskets-${dateStr}.zip`,
    blob: zipBlob,
    mimeType: 'application/zip',
  };
}

export const kiteExporter: BasketExporter = {
  brokerInfo: {
    id: 'kite',
    name: 'Zerodha Kite',
    description: 'Export to Zerodha Kite basket order format',
    supportedFormats: ['json'],
    country: 'IN',
  },
  maxOrdersPerBasket: BASKET_LIMIT,
  export: exportToKite,
};
