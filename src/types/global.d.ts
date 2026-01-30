// Kite Publisher global type declarations
// https://kite.trade/docs/connect/v3/publisher/

interface KitePublisherOrder {
  exchange: string
  tradingsymbol: string
  quantity: number
  transaction_type: 'BUY' | 'SELL'
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M'
  product?: 'CNC' | 'MIS' | 'NRML'
  price?: number
  trigger_price?: number
  variety?: 'regular' | 'amo' | 'co'
  readonly?: boolean
  tag?: string
}

interface KitePublisherFinishedCallback {
  (status: 'success' | 'cancelled', request_token?: string): void
}

interface KiteConnectInstance {
  add(order: KitePublisherOrder): void
  get(): KitePublisherOrder[]
  count(): number
  link(element: HTMLElement | string): void
  connect(): void
  renderButton(container: HTMLElement | string): void
  finished(callback: KitePublisherFinishedCallback): void
}

interface KiteConnectConstructor {
  new (apiKey: string): KiteConnectInstance
}

declare const KiteConnect: KiteConnectConstructor

interface Window {
  KiteConnect: KiteConnectConstructor
}
