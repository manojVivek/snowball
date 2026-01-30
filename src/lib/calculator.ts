import type { AggregatedDividend, Recommendation, RecommendationSummary } from '@/types';

export function calculateRecommendations(
  dividends: Record<string, AggregatedDividend>,
  prices: Record<string, number>
): RecommendationSummary {
  const recommendations: Recommendation[] = [];

  for (const [symbol, dividend] of Object.entries(dividends)) {
    const price = prices[symbol];

    // Skip if price not found or is zero
    if (!price || price <= 0) continue;

    const quantity = Math.floor(dividend.totalDividend / price);

    // Skip if can't buy at least 1 share
    if (quantity <= 0) continue;

    const totalCost = quantity * price;
    const remaining = dividend.totalDividend - totalCost;

    recommendations.push({
      symbol,
      companyName: dividend.companyName,
      dividend: dividend.totalDividend,
      price,
      quantity,
      totalCost,
      remaining,
    });
  }

  // Sort by dividend amount (descending)
  recommendations.sort((a, b) => b.dividend - a.dividend);

  // Calculate totals
  const totalDividend = recommendations.reduce((sum, r) => sum + r.dividend, 0);
  const totalInvestment = recommendations.reduce((sum, r) => sum + r.totalCost, 0);
  const unusedBalance = totalDividend - totalInvestment;

  return {
    recommendations,
    totalDividend,
    totalInvestment,
    unusedBalance,
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num);
}
