# Snowball

A privacy-first tool to reinvest your dividends back into the same stocks. Upload your broker's dividend report and get personalized buy recommendations.

## Features

- **Privacy First** - Your financial data never leaves your browser. Only ticker symbols are sent to fetch current prices.
- **Smart Recommendations** - Automatically calculates how many shares to buy based on your dividend income from each stock.
- **Direct Order Placement** - Place orders directly on your broker with a few clicks.
- **Multi-Broker Support** - Currently supports Zerodha, with more brokers coming soon.

## How It Works

1. Download your Dividend report from your broker.
2. Upload the CSV file to Snowball
3. Review the parsed dividends and buy recommendations
4. Export to your broker or place orders directly

## Privacy

- All file processing happens locally in your browser
- Only stock ticker symbols are sent to the API to fetch current prices
- No cookies, no personal data tracking
- Anonymous page view analytics only

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

## Tech Stack

- [Next.js](https://nextjs.org) - React framework
- [Tailwind CSS](https://tailwindcss.com) - Styling
- [Kite Publisher](https://kite.trade/docs/connect/v3/publisher/) - Direct order placement

## License

MIT
