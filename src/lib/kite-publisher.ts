// Kite Publisher integration for direct order placement
// https://kite.trade/docs/connect/v3/publisher/

const KITE_PUBLISHER_API_KEY = process.env.NEXT_PUBLIC_KITE_PUBLISHER_API_KEY;
const MAX_ORDERS_PER_BATCH = 20;

export interface KitePublisherOrder {
  exchange: string;
  tradingsymbol: string;
  quantity: number;
  transaction_type: "BUY" | "SELL";
  order_type: "MARKET" | "LIMIT";
  product: "CNC" | "MIS" | "NRML";
}

/**
 * Split orders into batches of 10 (Kite Publisher limit)
 */
export function splitIntoBatches(
  orders: KitePublisherOrder[],
): KitePublisherOrder[][] {
  const batches: KitePublisherOrder[][] = [];
  for (let i = 0; i < orders.length; i += MAX_ORDERS_PER_BATCH) {
    batches.push(orders.slice(i, i + MAX_ORDERS_PER_BATCH));
  }
  return batches;
}

/**
 * Check if Kite Publisher script is loaded
 */
export function isKitePublisherAvailable(): boolean {
  return (
    typeof window !== "undefined" && typeof window.KiteConnect !== "undefined"
  );
}

/**
 * Initiate Kite Publisher with given orders
 * Opens a popup for user to authenticate and place orders
 */
export function placeOrdersViaKite(
  orders: KitePublisherOrder[],
  onFinished?: (status: "success" | "cancelled", requestToken?: string) => void,
): boolean {
  if (!isKitePublisherAvailable()) {
    console.error("Kite Publisher is not available");
    return false;
  }

  if (!KITE_PUBLISHER_API_KEY) {
    console.error("Kite Publisher API key is not configured");
    return false;
  }

  if (orders.length === 0) {
    console.error("No orders to place");
    return false;
  }

  if (orders.length > MAX_ORDERS_PER_BATCH) {
    console.error(
      `Too many orders (${orders.length}). Maximum ${MAX_ORDERS_PER_BATCH} orders per batch.`,
    );
    return false;
  }

  try {
    const kite = new window.KiteConnect(KITE_PUBLISHER_API_KEY);

    // Add all orders to the basket
    orders.forEach((order) => {
      kite.add({
        exchange: order.exchange,
        tradingsymbol: order.tradingsymbol,
        quantity: order.quantity,
        transaction_type: order.transaction_type,
        order_type: order.order_type,
        product: order.product,
      });
    });

    // Set up completion callback
    if (onFinished) {
      kite.finished((status, requestToken) => {
        onFinished(status, requestToken);
      });
    }

    // Open the Kite popup
    kite.connect();
    return true;
  } catch (error) {
    console.error("Error initiating Kite Publisher:", error);
    return false;
  }
}

/**
 * Get the number of batches needed for the given orders
 */
export function getBatchCount(orderCount: number): number {
  return Math.ceil(orderCount / MAX_ORDERS_PER_BATCH);
}

/**
 * Get the maximum orders allowed per batch
 */
export function getMaxOrdersPerBatch(): number {
  return MAX_ORDERS_PER_BATCH;
}
