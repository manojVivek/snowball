'use client'

declare global {
  interface Window {
    umami?: { track: (event: string) => void }
  }
}

import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { clsx } from 'clsx/lite'
import { parsers, getParser } from '@/lib/parsers/registry'
import { exporters, getExporter } from '@/lib/exporters/registry'
import { calculateRecommendations, formatCurrency, formatNumber } from '@/lib/calculator'
import {
  placeOrdersViaKite,
  splitIntoBatches,
  getBatchCount,
  isKitePublisherAvailable,
  type KitePublisherOrder,
} from '@/lib/kite-publisher'
import type { AggregatedDividend, RecommendationSummary, BasketOrder } from '@/types'

// Template components
import { Container } from '@/components/elements/container'
import { Text } from '@/components/elements/text'
import { Subheading } from '@/components/elements/subheading'
import { Eyebrow } from '@/components/elements/eyebrow'
import { Button, SoftButton } from '@/components/elements/button'
import { BrokerCard, BrokerCardGroup } from '@/components/elements/broker-card'
import { Drawer } from '@/components/elements/drawer'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { Stat, StatsFourColumns } from '@/components/sections/stats-four-columns'

// Icons
import { CloudArrowUpIcon } from '@/components/icons/cloud-arrow-up-icon'
import { LockIcon } from '@/components/icons/lock-icon'
import { ZerodhaLogo, GrowwLogo, AngelOneLogo, IBKRLogo } from '@/components/icons/broker-logos'

type Step = 'upload' | 'processing' | 'results'

interface Progress {
  stage: 'parsing' | 'fetching' | 'calculating'
  current: number
  total: number
  fromCache: number
}

const CONCURRENCY = 10

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  onProgress: (completed: number, result: R | null) => void
): Promise<R[]> {
  const results: R[] = []
  let completed = 0
  let index = 0

  const worker = async () => {
    while (index < items.length) {
      const currentIndex = index++
      const item = items[currentIndex]
      try {
        const result = await fn(item)
        results[currentIndex] = result
        completed++
        onProgress(completed, result)
      } catch {
        completed++
        onProgress(completed, null)
      }
    }
  }

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker())

  await Promise.all(workers)
  return results
}

export default function Home() {
  const [step, setStep] = useState<Step>('upload')
  const [dividends, setDividends] = useState<Record<string, AggregatedDividend>>({})
  const [recommendations, setRecommendations] = useState<RecommendationSummary | null>(null)
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set())
  const [exchanges, setExchanges] = useState<Record<string, 'NSE' | 'BSE'>>({})
  const [missingPrices, setMissingPrices] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress>({ stage: 'parsing', current: 0, total: 0, fromCache: 0 })
  const [copied, setCopied] = useState(false)

  // Broker selection state
  const [selectedParserId, setSelectedParserId] = useState(parsers[0]?.brokerInfo.id || '')
  const [selectedExporterId, setSelectedExporterId] = useState(exporters[0]?.brokerInfo.id || '')

  // Kite Publisher state
  const [completedBatches, setCompletedBatches] = useState<Set<number>>(new Set())
  const [activeBatch, setActiveBatch] = useState<number | null>(null)
  const [exportDrawerOpen, setExportDrawerOpen] = useState(false)

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean
    batchIndex?: number
  }>({ show: false })

  // Privacy modal state
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false)

  const selectedParser = getParser(selectedParserId)
  const selectedExporter = getExporter(selectedExporterId)

  // Track if Kite popup was opened and if callback was received
  const kitePopupOpenedRef = useRef(false)
  const callbackReceivedRef = useRef(false)

  // Show confirmation dialog when user returns without callback
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && kitePopupOpenedRef.current) {
        // Give the callback a moment to fire if it's going to
        const timeoutId = setTimeout(() => {
          // Only show dialog if callback wasn't received
          if (!callbackReceivedRef.current) {
            if (activeBatch !== null) {
              setConfirmDialog({ show: true, batchIndex: activeBatch })
              setActiveBatch(null)
            }
          }
          kitePopupOpenedRef.current = false
          callbackReceivedRef.current = false
        }, 500)
        return () => clearTimeout(timeoutId)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [activeBatch])

  // Initialize selected symbols when recommendations change (all selected by default)
  useEffect(() => {
    if (recommendations) {
      setSelectedSymbols(new Set(recommendations.recommendations.map((r) => r.symbol)))
    }
  }, [recommendations])

  // Get selected recommendations
  const selectedRecommendations = recommendations?.recommendations.filter((r) => selectedSymbols.has(r.symbol)) || []
  const selectedTotalInvestment = selectedRecommendations.reduce((sum, r) => sum + r.totalCost, 0)

  // Toggle selection for a single symbol
  const toggleSymbolSelection = (symbol: string) => {
    setSelectedSymbols((prev) => {
      const next = new Set(prev)
      if (next.has(symbol)) {
        next.delete(symbol)
      } else {
        next.add(symbol)
      }
      return next
    })
  }

  // Toggle all selections
  const toggleAllSelections = () => {
    if (!recommendations) return
    if (selectedSymbols.size === recommendations.recommendations.length) {
      setSelectedSymbols(new Set())
    } else {
      setSelectedSymbols(new Set(recommendations.recommendations.map((r) => r.symbol)))
    }
  }

  // Handle confirmation dialog response
  const handleConfirmOrder = (placed: boolean) => {
    if (placed && confirmDialog.batchIndex !== undefined) {
      setCompletedBatches((prev) => new Set(Array.from(prev).concat(confirmDialog.batchIndex!)))
    }
    setConfirmDialog({ show: false })
  }

  const handleFileSelect = async (file: File) => {
    if (!selectedParser) {
      setError('Please select a broker first')
      return
    }

    setStep('processing')
    setError(null)
    setProgress({ stage: 'parsing', current: 0, total: 0, fromCache: 0 })

    try {
      const parsed = await selectedParser.parse(file)

      if (Object.keys(parsed.aggregated).length === 0) {
        throw new Error('No dividend data found in the file. Please ensure you uploaded the correct report.')
      }

      setDividends(parsed.aggregated)

      const symbols = Object.keys(parsed.aggregated)
      const allPrices: Record<string, number> = {}
      const allExchanges: Record<string, 'NSE' | 'BSE'> = {}
      let totalFromCache = 0

      setProgress({ stage: 'fetching', current: 0, total: symbols.length, fromCache: 0 })

      await runWithConcurrency(
        symbols,
        CONCURRENCY,
        async (symbol) => {
          const response = await fetch('/api/prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols: [symbol] }),
          })

          if (!response.ok) {
            return { prices: {}, exchanges: {}, fromCache: 0 }
          }

          const { prices, exchanges: exch, meta } = await response.json()
          return { prices, exchanges: exch || {}, fromCache: meta?.fromCache || 0 }
        },
        (completed, result) => {
          if (result) {
            Object.assign(allPrices, result.prices)
            Object.assign(allExchanges, result.exchanges)
            totalFromCache += result.fromCache
          }
          setProgress({
            stage: 'fetching',
            current: completed,
            total: symbols.length,
            fromCache: totalFromCache,
          })
        }
      )

      setExchanges(allExchanges)

      setProgress({ stage: 'calculating', current: symbols.length, total: symbols.length, fromCache: totalFromCache })
      const result = calculateRecommendations(parsed.aggregated, allPrices)
      setRecommendations(result)

      const missing = symbols.filter((s) => !allPrices[s])
      setMissingPrices(missing)

      setStep('results')
      window.umami?.track('report-processed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setStep('upload')
    }
  }

  const handleReset = () => {
    setStep('upload')
    setDividends({})
    setRecommendations(null)
    setExchanges({})
    setMissingPrices([])
    setError(null)
    setProgress({ stage: 'parsing', current: 0, total: 0, fromCache: 0 })
    setCompletedBatches(new Set())
    setActiveBatch(null)
    setExportDrawerOpen(false)
  }

  const getProgressPercentage = () => {
    if (progress.total === 0) return 0
    return Math.round((progress.current / progress.total) * 100)
  }

  const getProgressMessage = () => {
    switch (progress.stage) {
      case 'parsing':
        return 'Parsing dividend data...'
      case 'fetching': {
        const totalDigits = String(progress.total).length
        return (
          <>
            Fetching prices: <span className="inline-block text-right tabular-nums" style={{ width: `${totalDigits}ch` }}>{progress.current}</span> of {progress.total} stocks
          </>
        )
      }
      case 'calculating':
        return 'Calculating recommendations...'
      default:
        return 'Processing...'
    }
  }

  const copyRecommendations = () => {
    if (selectedRecommendations.length === 0) return

    const text = selectedRecommendations
      .map((r) => `${r.symbol}\t${r.quantity}\t${formatCurrency(r.totalCost)}`)
      .join('\n')

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExport = async () => {
    if (selectedRecommendations.length === 0 || !selectedExporter) return

    const orders: BasketOrder[] = selectedRecommendations.map((rec) => ({
      symbol: rec.symbol,
      exchange: exchanges[rec.symbol] || 'NSE',
      quantity: rec.quantity,
      transactionType: 'BUY',
      orderType: 'MARKET',
      product: 'CNC',
    }))

    const result = await selectedExporter.export(orders, exchanges)

    // Download the file
    const url = URL.createObjectURL(result.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = result.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Convert selected recommendations to Kite Publisher orders
  const getKiteOrders = (): KitePublisherOrder[] => {
    return selectedRecommendations.map((rec) => ({
      exchange: exchanges[rec.symbol] || 'NSE',
      tradingsymbol: rec.symbol,
      quantity: rec.quantity,
      transaction_type: 'BUY',
      order_type: 'MARKET',
      product: 'CNC',
    }))
  }

  const kiteOrders = getKiteOrders()
  const kiteBatches = splitIntoBatches(kiteOrders)
  const totalBatches = getBatchCount(kiteOrders.length)

  const handlePlaceViaKite = (batchIndex: number) => {
    if (!isKitePublisherAvailable()) {
      setError('Kite Publisher is not loaded. Please refresh the page and try again.')
      return
    }

    const batch = kiteBatches[batchIndex]
    if (!batch || batch.length === 0) return

    setActiveBatch(batchIndex)
    kitePopupOpenedRef.current = true
    callbackReceivedRef.current = false

    const success = placeOrdersViaKite(batch, (status) => {
      callbackReceivedRef.current = true
      kitePopupOpenedRef.current = false
      setActiveBatch(null)
      if (status === 'success') {
        setCompletedBatches((prev) => new Set(Array.from(prev).concat(batchIndex)))
      }
    })

    if (!success) {
      kitePopupOpenedRef.current = false
      setActiveBatch(null)
      setError('Failed to open Kite. Please try again.')
    }
  }

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        handleFileSelect(acceptedFiles[0])
      }
    },
    [selectedParser]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv', '.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    multiple: false,
    disabled: step === 'processing',
  })

  const dividendEntries = Object.values(dividends).sort((a, b) => b.totalDividend - a.totalDividend)
  const totalDividend = dividendEntries.reduce((sum, d) => sum + d.totalDividend, 0)

  return (
    <>
      {/* Error Message */}
      {error && (
        <section className="py-4">
          <Container>
            <div className="rounded-xl bg-red-50 border border-red-200 p-4">
              <p className="text-red-800 font-medium">Error</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </Container>
        </section>
      )}

      {/* Upload Step */}
      {step === 'upload' && (
        <>
          <HeroSimpleCentered
            eyebrow={
              <button
                onClick={() => setPrivacyModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-olive-950/5 text-olive-700 text-sm hover:bg-olive-950/10 transition-colors cursor-pointer"
              >
                <LockIcon className="w-4 h-4" />
                Privacy First
              </button>
            }
            headline="Reinvest Your Dividends"
            subheadline={
              <p>
                Upload your dividend report and get recommendations on how to reinvest your dividends back into
                the same stocks.
              </p>
            }
            cta={
              <div className="w-full max-w-xl space-y-4">
                {/* Broker Selector */}
                <div className="space-y-3">
                  <Text className="text-olive-600 text-center">Select your broker</Text>
                  <BrokerCardGroup>
                    <BrokerCard
                      name="Zerodha"
                      icon={<ZerodhaLogo className="w-full h-full" />}
                      selected={selectedParserId === 'zerodha'}
                      onClick={() => setSelectedParserId('zerodha')}
                    />
                    <BrokerCard name="Groww" icon={<GrowwLogo className="w-full h-full" />} comingSoon />
                    <BrokerCard name="Angel One" icon={<AngelOneLogo className="w-full h-full" />} comingSoon />
                    <BrokerCard name="IBKR" icon={<IBKRLogo className="w-full h-full" />} comingSoon />
                  </BrokerCardGroup>
                </div>

                {/* File Dropzone */}
                <div
                  {...getRootProps({ onClick: () => window.umami?.track('file-upload-clicked') })}
                  className={clsx(
                    'w-full cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors',
                    isDragActive
                      ? 'border-olive-500 bg-olive-950/5'
                      : 'border-olive-300 hover:border-olive-500 hover:bg-olive-950/2.5'
                  )}
                >
                  <input {...getInputProps()} />
                  <CloudArrowUpIcon className="w-12 h-12 mx-auto mb-4 text-olive-400" />
                  {isDragActive ? (
                    <Text className="text-olive-700">Drop the file here</Text>
                  ) : (
                    <>
                      <Text className="text-olive-700 mb-2">Drag and drop your dividend report here, or click to select</Text>
                      <Text className="text-olive-500 text-sm">
                        Supports {selectedParser?.brokerInfo.supportedFormats.join(', ').toUpperCase() || 'CSV and Excel'} formats
                      </Text>
                    </>
                  )}
                </div>
              </div>
            }
          />

          {/* Instructions */}
          <section className="py-6 sm:py-8">
            <Container>
              <div className="max-w-2xl mx-auto rounded-xl bg-olive-950/2.5 p-4 sm:p-6">
                <Eyebrow className="mb-4">How to get your Tax P&L report</Eyebrow>
                <ol className="space-y-3 text-sm text-olive-700">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-olive-950/10 text-olive-950 flex items-center justify-center text-xs font-medium">
                      1
                    </span>
                    <span>
                      Go to{' '}
                      <a
                        href="https://console.zerodha.com/reports/tax-pnl"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-olive-950 hover:underline font-medium"
                      >
                        Zerodha Console → Reports → Tax P&L
                      </a>
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-olive-950/10 text-olive-950 flex items-center justify-center text-xs font-medium">
                      2
                    </span>
                    <span>Select the financial year (e.g., 2023-24)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-olive-950/10 text-olive-950 flex items-center justify-center text-xs font-medium">
                      3
                    </span>
                    <span>Click &quot;Download&quot; and select CSV format</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-olive-950/10 text-olive-950 flex items-center justify-center text-xs font-medium">
                      4
                    </span>
                    <span>Upload the downloaded CSV file here</span>
                  </li>
                </ol>
              </div>
            </Container>
          </section>
        </>
      )}

      {/* Processing Step */}
      {step === 'processing' && (
        <section className="py-12 sm:py-16">
          <Container className="max-w-md mx-auto text-center space-y-4 sm:space-y-6">
            <Subheading className="tabular-nums">{getProgressMessage()}</Subheading>


            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="h-2 sm:h-3 bg-olive-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-olive-950 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${getProgressPercentage()}%` }}
                />
              </div>
              <div className="flex justify-between text-xs sm:text-sm text-olive-500 tabular-nums">
                <span>{progress.current} of {progress.total} stocks</span>
                <span>{getProgressPercentage()}%</span>
              </div>
            </div>

            {/* Spinner */}
            <div className="flex justify-center">
              <svg className="animate-spin h-6 w-6 text-olive-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          </Container>
        </section>
      )}

      {/* Results Step */}
      {step === 'results' && recommendations && (
        <>
          {/* Header */}
          <section className="py-6 sm:py-8">
            <Container className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Subheading>Reinvestment Recommendations</Subheading>
              <SoftButton onClick={handleReset} className="self-start sm:self-auto">Upload New File</SoftButton>
            </Container>
          </section>

          {/* Summary Stats */}
          <StatsFourColumns>
            <Stat stat={formatCurrency(recommendations.totalDividend)} text="Total Dividends" />
            <Stat stat={formatCurrency(recommendations.totalInvestment)} text="Total Investment" />
            <Stat stat={formatCurrency(recommendations.unusedBalance)} text="Unused Balance" />
            <Stat stat={formatNumber(recommendations.recommendations.length)} text="Stocks to Buy" />
          </StatsFourColumns>

          {/* Missing Prices Warning */}
          {missingPrices.length > 0 && (
            <section className="py-3 sm:py-4">
              <Container>
                <details className="rounded-xl bg-amber-50 border border-amber-200">
                  <summary className="p-3 cursor-pointer text-xs sm:text-sm text-amber-800">
                    <strong>Note:</strong> Prices not found for {missingPrices.length} stocks (SME/delisted stocks may
                    not have prices)
                  </summary>
                  <div className="px-3 pb-3 text-amber-700">
                    <p className="text-xs mb-2">These stocks are excluded from recommendations:</p>
                    <p className="text-xs break-words">{missingPrices.join(', ')}</p>
                  </div>
                </details>
              </Container>
            </section>
          )}

          {/* Parsed Dividends Table (Collapsible) */}
          <section className="py-6 sm:py-8">
            <Container>
              <details className="group">
                <summary className="flex cursor-pointer items-center justify-between mb-4 list-none">
                  <div className="flex items-center gap-2">
                    <svg
                      className="size-4 text-olive-500 transition-transform group-open:rotate-90"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <Eyebrow>Parsed Dividends ({dividendEntries.length} stocks)</Eyebrow>
                  </div>
                  <span className="text-olive-950 font-medium text-sm sm:text-base">Total: {formatCurrency(totalDividend)}</span>
                </summary>

                <div className="max-h-64 overflow-y-auto overflow-x-auto rounded-xl border border-olive-950/10">
                  <table className="min-w-full divide-y divide-olive-950/5">
                    <thead className="bg-olive-100 sticky top-0">
                      <tr>
                        <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-olive-500 uppercase">Symbol</th>
                        <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-olive-500 uppercase hidden sm:table-cell">Company</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-olive-500 uppercase">Dividend</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-olive-950/5">
                      {dividendEntries.map((dividend) => (
                        <tr key={dividend.symbol}>
                          <td className="px-3 sm:px-4 py-2 text-sm font-medium text-olive-950">{dividend.symbol}</td>
                          <td className="px-3 sm:px-4 py-2 text-sm text-olive-500 truncate max-w-[200px] hidden sm:table-cell">
                            {dividend.companyName}
                          </td>
                          <td className="px-3 sm:px-4 py-2 text-sm text-right text-olive-700">
                            {formatCurrency(dividend.totalDividend)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </Container>
          </section>

          {/* Recommendations Table */}
          <section className="py-6 sm:py-8">
            <Container>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <Eyebrow>
                  Buy Recommendations ({selectedSymbols.size} of {recommendations.recommendations.length} selected)
                  {selectedSymbols.size > 0 && (
                    <span className="ml-2 text-olive-600 normal-case font-normal">
                      · {formatCurrency(selectedTotalInvestment)}
                    </span>
                  )}
                </Eyebrow>
                <div className="flex items-center gap-2">
                  <SoftButton onClick={copyRecommendations} disabled={selectedSymbols.size === 0}>
                    {copied ? 'Copied!' : 'Copy'}
                  </SoftButton>
                  <Button onClick={() => { setExportDrawerOpen(true); window.umami?.track('export-clicked') }} disabled={selectedSymbols.size === 0}>
                    Export
                  </Button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto overflow-x-auto rounded-xl border border-olive-950/10">
                <table className="min-w-full divide-y divide-olive-950/5">
                  <thead className="bg-olive-100 sticky top-0">
                    <tr>
                      <th className="px-2 sm:px-3 py-2 sm:py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedSymbols.size === recommendations.recommendations.length}
                          onChange={toggleAllSelections}
                          className="size-4 rounded border-olive-300 text-olive-600 focus:ring-olive-500 cursor-pointer"
                        />
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-olive-500 uppercase">Symbol</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-olive-500 uppercase hidden md:table-cell">Dividend</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-olive-500 uppercase hidden sm:table-cell">Price</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-olive-500 uppercase">Qty</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-olive-500 uppercase">Total</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-olive-500 uppercase hidden lg:table-cell">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-olive-950/5">
                    {recommendations.recommendations.map((rec) => {
                      const isSelected = selectedSymbols.has(rec.symbol)
                      return (
                        <tr
                          key={rec.symbol}
                          className={clsx('cursor-pointer hover:bg-olive-50 transition-colors', !isSelected && 'opacity-50')}
                          onClick={() => toggleSymbolSelection(rec.symbol)}
                        >
                          <td className="px-2 sm:px-3 py-2 sm:py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSymbolSelection(rec.symbol)}
                              className="size-4 rounded border-olive-300 text-olive-600 focus:ring-olive-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm font-medium text-olive-950">{rec.symbol}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-right text-olive-700 hidden md:table-cell">{formatCurrency(rec.dividend)}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-right text-olive-700 hidden sm:table-cell">{formatCurrency(rec.price)}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-right font-semibold text-olive-950">{rec.quantity}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-right text-olive-950">{formatCurrency(rec.totalCost)}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-right text-olive-500 hidden lg:table-cell">{formatCurrency(rec.remaining)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Container>
          </section>

          {/* Export Drawer */}
          <Drawer
            open={exportDrawerOpen}
            onClose={() => setExportDrawerOpen(false)}
            title="Export Orders"
          >
            <div className="space-y-6">
              {/* Platform Selection */}
              <div>
                <Text className="text-olive-600 mb-3 text-sm font-medium">Select platform:</Text>
                <BrokerCardGroup>
                  <BrokerCard
                    name="Zerodha Kite"
                    icon={<ZerodhaLogo className="w-full h-full" />}
                    selected={selectedExporterId === 'kite'}
                    onClick={() => setSelectedExporterId('kite')}
                  />
                  <BrokerCard name="Groww" icon={<GrowwLogo className="w-full h-full" />} comingSoon />
                  <BrokerCard name="Angel One" icon={<AngelOneLogo className="w-full h-full" />} comingSoon />
                  <BrokerCard name="IBKR" icon={<IBKRLogo className="w-full h-full" />} comingSoon />
                </BrokerCardGroup>
              </div>

              {/* Kite Export Options */}
              {selectedExporterId === 'kite' && (
                <div className="space-y-4">
                  <Text className="text-olive-600 text-sm font-medium">Export options:</Text>

                  {/* Place Directly Option - Primary */}
                  <div className="flex flex-col gap-3 rounded-xl bg-olive-950 p-4 text-white">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-white/10">
                        <svg className="size-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">Place Orders Directly</h3>
                        <p className="text-xs text-olive-400">Opens Kite order dialog</p>
                      </div>
                    </div>
                    {totalBatches > 1 && (
                      <div className="flex items-start gap-2 text-xs text-olive-400 bg-white/5 rounded-lg p-2">
                        <svg className="size-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                        </svg>
                        <span>
                          {kiteOrders.length} orders split into {totalBatches} batches (max 20 per batch). Submit each batch sequentially.
                          {completedBatches.size > 0 && ` (${completedBatches.size} done)`}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {totalBatches === 1 ? (
                        <button
                          onClick={() => handlePlaceViaKite(0)}
                          disabled={activeBatch !== null || completedBatches.has(0)}
                          className={clsx(
                            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold",
                            completedBatches.has(0)
                              ? "bg-green-600 text-white cursor-default"
                              : "bg-white text-olive-950 hover:bg-olive-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          {/* Pending state - hourglass */}
                          {activeBatch !== 0 && !completedBatches.has(0) && (
                            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                          )}
                          {/* In progress - spinner */}
                          {activeBatch === 0 && (
                            <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          )}
                          {/* Completed - green checkmark */}
                          {completedBatches.has(0) && (
                            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                          )}
                          {completedBatches.has(0)
                            ? 'Orders Placed'
                            : activeBatch === 0
                              ? 'Placing...'
                              : 'Place Orders'}
                        </button>
                      ) : (
                        kiteBatches.map((_, index) => (
                          <button
                            key={index}
                            onClick={() => handlePlaceViaKite(index)}
                            disabled={activeBatch !== null || completedBatches.has(index)}
                            className={clsx(
                              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold",
                              completedBatches.has(index)
                                ? "bg-green-600 text-white cursor-default"
                                : "bg-white text-olive-950 hover:bg-olive-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                          >
                            {/* Pending state - hourglass */}
                            {activeBatch !== index && !completedBatches.has(index) && (
                              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                            )}
                            {/* In progress - spinner */}
                            {activeBatch === index && (
                              <svg className="size-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            )}
                            {/* Completed - checkmark */}
                            {completedBatches.has(index) && (
                              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                            )}
                            {activeBatch === index
                              ? 'Placing...'
                              : `Batch ${index + 1}`}
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t border-olive-950/10" />
                    <span className="text-xs text-olive-400">or</span>
                    <div className="flex-1 border-t border-olive-950/10" />
                  </div>

                  {/* Download File Option - Secondary */}
                  <div className="flex flex-col gap-3 rounded-xl bg-olive-950/5 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-olive-950/10">
                        <svg className="size-4 text-olive-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-semibold text-olive-950 text-sm">Download Basket File</h3>
                        <p className="text-xs text-olive-500">Import into Kite manually</p>
                      </div>
                    </div>
                    <SoftButton onClick={handleExport} className="self-start">
                      Download
                    </SoftButton>
                  </div>
                </div>
              )}
            </div>
          </Drawer>
        </>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog.show && (
        <>
          <div className="fixed inset-0 bg-olive-950/50 z-50" onClick={() => handleConfirmOrder(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm mx-4">
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex size-10 items-center justify-center rounded-full bg-olive-100">
                  <svg className="size-5 text-olive-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-olive-950">Did you place the order?</h3>
              </div>
              <p className="text-sm text-olive-600 mb-6">
                {`We couldn't detect if Batch ${(confirmDialog.batchIndex ?? 0) + 1} orders were placed.`}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleConfirmOrder(false)}
                  className="flex-1 rounded-lg border border-olive-200 px-4 py-2.5 text-sm font-semibold text-olive-700 hover:bg-olive-50 transition-colors"
                >
                  No, not placed
                </button>
                <button
                  onClick={() => handleConfirmOrder(true)}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                >
                  Yes, placed!
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Privacy Modal */}
      {privacyModalOpen && (
        <>
          <div className="fixed inset-0 bg-olive-950/50 z-50" onClick={() => setPrivacyModalOpen(false)} />
          <div className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 sm:w-full sm:max-w-lg flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden w-full max-h-full overflow-y-auto">
              {/* Header */}
              <div className="bg-olive-950 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-white/10">
                    <LockIcon className="size-5 text-white" />
                  </div>
                  <h3 className="text-md font-semibold text-white">Privacy First</h3>
                </div>
                <button
                  onClick={() => setPrivacyModalOpen(false)}
                  className="flex size-8 items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                >
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                <p className="text-olive-700">
                  Your financial data never leaves your device. We built this tool with privacy as the foundation.
                </p>

                {/* Visual Diagram */}
                <div className="bg-olive-50 rounded-xl p-4">
                  <div className="flex items-center justify-center gap-1.5 mb-3">
                    <LockIcon className="size-3.5 text-olive-500" />
                    <p className="text-xs font-medium text-olive-500 uppercase tracking-wide">Data Flow</p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    {/* Browser Section */}
                    <div className="flex-1 w-full sm:self-stretch">
                      <div className="bg-white rounded-lg border-2 border-green-500 p-4 h-full">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex size-6 items-center justify-center rounded bg-green-100">
                            <svg className="size-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          </div>
                          <span className="text-sm font-semibold text-olive-950">Your Browser</span>
                        </div>
                        <ul className="space-y-1.5 text-xs text-olive-600">
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-green-500" />
                            Dividend report file
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-green-500" />
                            Company names &amp; amounts
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-green-500" />
                            All calculations
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-green-500" />
                            Recommendations
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex flex-col items-center gap-1 text-olive-400 shrink-0 sm:self-center">
                      <svg className="size-6 rotate-90 sm:rotate-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                      <span className="text-[10px] font-medium whitespace-nowrap">Ticker symbols</span>
                    </div>

                    {/* API Section */}
                    <div className="flex-1 w-full sm:self-stretch">
                      <div className="bg-white rounded-lg border-2 border-olive-200 p-4 h-full">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex size-6 items-center justify-center rounded bg-olive-100">
                            <svg className="size-4 text-olive-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-4.247m0 0A8.959 8.959 0 0 1 3 12c0-1.89.584-3.643 1.581-5.091" />
                            </svg>
                          </div>
                          <span className="text-sm font-semibold text-olive-950">Price API</span>
                        </div>
                        <ul className="space-y-1.5 text-xs text-olive-600">
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-olive-400" />
                            Ticker symbols only
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-olive-400" />
                            e.g. &quot;RELIANCE&quot;, &quot;TCS&quot;
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Points */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-green-100 mt-0.5">
                      <svg className="size-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-olive-950">Only ticker symbols leave your browser</p>
                      <p className="text-xs text-olive-500">Stock symbols are sent to fetch current prices — nothing else</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-green-100 mt-0.5">
                      <svg className="size-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-olive-950">Minimal anonymous analytics</p>
                      <p className="text-xs text-olive-500">Only anonymous page views are tracked — no cookies, no personal data</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-green-100 mt-0.5">
                      <svg className="size-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-olive-950">No server storage</p>
                      <p className="text-xs text-olive-500">Your file is processed locally and never uploaded to any server</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-green-100 mt-0.5">
                      <svg className="size-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-olive-950">Open source</p>
                      <p className="text-xs text-olive-500">You can verify our privacy claims by reviewing the source code</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
