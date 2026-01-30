import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { DividendEntry, AggregatedDividend, ParsedDividendData } from '../../core/types';
import type { DividendParser } from '../types';

// Symbol cleaning - remove special characters, Zerodha suffixes, and normalize
function cleanSymbol(symbol: string): string {
  let cleaned = symbol
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9&-]/g, '');

  // Remove Zerodha series suffixes (like "6" at the end for certain stock series)
  // These are internal identifiers not recognized by Yahoo Finance
  cleaned = cleaned.replace(/6$/, '');

  // Handle common Zerodha → Yahoo Finance symbol mappings
  const symbolMappings: Record<string, string> = {
    'MSTCLTD': 'MSTC',
    'NAMINDIA': 'NAM-INDIA',
    'ABORTWELD': 'ADORWELD',
    'UNITDSPR': 'UNITDSPR',
    'AREM': 'ARE&M',
    'LGBBROSLTD': 'LGBBROSLTD',
    'HSCL': 'HSCL',
  };

  return symbolMappings[cleaned] || cleaned;
}

// Parse the Zerodha Tax P&L CSV format
function parseDividendCSV(csvContent: string): Promise<ParsedDividendData> {
  return new Promise((resolve, reject) => {
    const entries: DividendEntry[] = [];
    let inDividendSection = false;
    let headerFound = false;
    let columnIndices: { symbol: number; company: number; isin: number; amount: number; date: number } | null = null;

    Papa.parse(csvContent, {
      complete: () => {
        // Aggregate dividends by symbol
        const aggregated: Record<string, AggregatedDividend> = {};

        for (const entry of entries) {
          const key = entry.symbol;
          if (!aggregated[key]) {
            aggregated[key] = {
              symbol: entry.symbol,
              companyName: entry.companyName,
              totalDividend: 0,
            };
          }
          aggregated[key].totalDividend += entry.amount;
        }

        resolve({ entries, aggregated });
      },
      error: (error: Error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      },
      step: (row: Papa.ParseStepResult<string[]>) => {
        const data = row.data;
        if (!data || data.length === 0) return;

        const firstCell = (data[0] || '').toString().toLowerCase().trim();

        // Look for dividend section markers
        if (firstCell.includes('dividend') || firstCell.includes('equity dividend')) {
          inDividendSection = true;
          headerFound = false;
          return;
        }

        // Exit dividend section on empty rows or new section headers
        if (inDividendSection && (firstCell === '' && data.every(cell => !cell?.toString().trim()))) {
          // Skip empty rows but stay in section
          return;
        }

        // Look for header row in dividend section
        if (inDividendSection && !headerFound) {
          const headerRow = data.map(cell => (cell || '').toString().toLowerCase().trim());

          // Find column indices
          const symbolIdx = headerRow.findIndex(h => h.includes('symbol') || h.includes('scrip'));
          const companyIdx = headerRow.findIndex(h => h.includes('company') || h.includes('name'));
          const isinIdx = headerRow.findIndex(h => h.includes('isin'));
          // Prioritize "net dividend amount" or "net amount" over "dividend per share"
          let amountIdx = headerRow.findIndex(h => h.includes('net') && (h.includes('amount') || h.includes('dividend')));
          if (amountIdx < 0) {
            amountIdx = headerRow.findIndex(h => h.includes('total') && h.includes('amount'));
          }
          if (amountIdx < 0) {
            // Avoid "per share" columns
            amountIdx = headerRow.findIndex(h =>
              (h.includes('amount') || h.includes('value')) && !h.includes('per share')
            );
          }
          if (amountIdx < 0) {
            amountIdx = headerRow.findIndex(h => h.includes('amount') || h.includes('value'));
          }
          const dateIdx = headerRow.findIndex(h => h.includes('date'));

          if (symbolIdx >= 0 || companyIdx >= 0 || isinIdx >= 0) {
            columnIndices = {
              symbol: symbolIdx >= 0 ? symbolIdx : companyIdx,
              company: companyIdx >= 0 ? companyIdx : symbolIdx,
              isin: isinIdx,
              amount: amountIdx >= 0 ? amountIdx : data.length - 1, // Last column often has amount
              date: dateIdx,
            };
            headerFound = true;
            return;
          }
        }

        // Parse data rows
        if (inDividendSection && headerFound && columnIndices) {
          const symbolRaw = data[columnIndices.symbol]?.toString().trim() || '';
          const companyName = data[columnIndices.company]?.toString().trim() || symbolRaw;
          const isin = columnIndices.isin >= 0 ? data[columnIndices.isin]?.toString().trim() : undefined;
          const amountRaw = data[columnIndices.amount]?.toString().trim() || '0';
          const date = columnIndices.date >= 0 ? data[columnIndices.date]?.toString().trim() : undefined;

          // Parse amount (remove commas, handle negative)
          const amount = parseFloat(amountRaw.replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;

          if (symbolRaw && amount > 0) {
            const symbol = cleanSymbol(symbolRaw);
            if (symbol) {
              entries.push({
                symbol,
                companyName,
                isin,
                amount,
                date,
              });
            }
          }
        }
      },
    });
  });
}

// Alternative simple parser for basic CSV format
// Columns: Symbol, Company, Amount
function parseSimpleDividendCSV(csvContent: string): Promise<ParsedDividendData> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(csvContent, {
      complete: (results) => {
        const entries: DividendEntry[] = [];
        const rows = results.data;

        // Skip header row
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 2) continue;

          const symbol = cleanSymbol(row[0] || '');
          const companyName = row[1]?.toString().trim() || symbol;
          const amount = parseFloat((row[2] || row[1] || '0').toString().replace(/,/g, '')) || 0;

          if (symbol && amount > 0) {
            entries.push({ symbol, companyName, amount });
          }
        }

        // Aggregate
        const aggregated: Record<string, AggregatedDividend> = {};
        for (const entry of entries) {
          if (!aggregated[entry.symbol]) {
            aggregated[entry.symbol] = {
              symbol: entry.symbol,
              companyName: entry.companyName,
              totalDividend: 0,
            };
          }
          aggregated[entry.symbol].totalDividend += entry.amount;
        }

        resolve({ entries, aggregated });
      },
      error: (error: Error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      },
    });
  });
}

// Parse Excel file (xlsx/xls)
async function parseExcelFile(file: File): Promise<ParsedDividendData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const entries: DividendEntry[] = [];

  // Process all sheets looking for dividend data
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    let inDividendSection = false;
    let headerFound = false;
    let columnIndices: { symbol: number; company: number; isin: number; amount: number } | null = null;

    for (const row of data) {
      if (!row || row.length === 0) continue;

      const firstCell = String(row[0] || '').toLowerCase().trim();

      // Look for dividend section
      if (firstCell.includes('dividend') || firstCell.includes('equity dividend')) {
        inDividendSection = true;
        headerFound = false;
        continue;
      }

      // Look for header in dividend section
      if (inDividendSection && !headerFound) {
        const headerRow = row.map(cell => String(cell || '').toLowerCase().trim());

        const symbolIdx = headerRow.findIndex(h => h.includes('symbol') || h.includes('scrip'));
        const companyIdx = headerRow.findIndex(h => h.includes('company') || h.includes('name'));
        const isinIdx = headerRow.findIndex(h => h.includes('isin'));
        // Prioritize "net dividend amount" or "net amount" over "dividend per share"
        let amountIdx = headerRow.findIndex(h => h.includes('net') && (h.includes('amount') || h.includes('dividend')));
        if (amountIdx < 0) {
          amountIdx = headerRow.findIndex(h => h.includes('total') && h.includes('amount'));
        }
        if (amountIdx < 0) {
          // Avoid "per share" columns
          amountIdx = headerRow.findIndex(h =>
            (h.includes('amount') || h.includes('value')) && !h.includes('per share')
          );
        }
        if (amountIdx < 0) {
          amountIdx = headerRow.findIndex(h => h.includes('amount') || h.includes('value'));
        }

        if (symbolIdx >= 0 || companyIdx >= 0 || isinIdx >= 0) {
          columnIndices = {
            symbol: symbolIdx >= 0 ? symbolIdx : companyIdx,
            company: companyIdx >= 0 ? companyIdx : symbolIdx,
            isin: isinIdx,
            amount: amountIdx >= 0 ? amountIdx : row.length - 1,
          };
          headerFound = true;
          continue;
        }
      }

      // Parse data rows
      if (inDividendSection && headerFound && columnIndices) {
        const symbolRaw = String(row[columnIndices.symbol] || '').trim();
        const companyName = String(row[columnIndices.company] || symbolRaw).trim();
        const amountRaw = row[columnIndices.amount];

        let amount = 0;
        if (typeof amountRaw === 'number') {
          amount = amountRaw;
        } else if (amountRaw) {
          amount = parseFloat(String(amountRaw).replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
        }

        if (symbolRaw && amount > 0) {
          const symbol = cleanSymbol(symbolRaw);
          if (symbol) {
            entries.push({
              symbol,
              companyName,
              amount,
            });
          }
        }
      }
    }
  }

  // Aggregate dividends by symbol
  const aggregated: Record<string, AggregatedDividend> = {};
  for (const entry of entries) {
    if (!aggregated[entry.symbol]) {
      aggregated[entry.symbol] = {
        symbol: entry.symbol,
        companyName: entry.companyName,
        totalDividend: 0,
      };
    }
    aggregated[entry.symbol].totalDividend += entry.amount;
  }

  return { entries, aggregated };
}

// Simple Excel parser - expects columns: Symbol, Company, Amount
async function parseSimpleExcel(file: File): Promise<ParsedDividendData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const entries: DividendEntry[] = [];

  // Use first sheet
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

  // Skip header, process rows
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 2) continue;

    const symbol = cleanSymbol(String(row[0] || ''));
    const companyName = String(row[1] || symbol).trim();

    let amount = 0;
    const amountRaw = row[2] ?? row[1];
    if (typeof amountRaw === 'number') {
      amount = amountRaw;
    } else if (amountRaw) {
      amount = parseFloat(String(amountRaw).replace(/,/g, '')) || 0;
    }

    if (symbol && amount > 0) {
      entries.push({ symbol, companyName, amount });
    }
  }

  // Aggregate
  const aggregated: Record<string, AggregatedDividend> = {};
  for (const entry of entries) {
    if (!aggregated[entry.symbol]) {
      aggregated[entry.symbol] = {
        symbol: entry.symbol,
        companyName: entry.companyName,
        totalDividend: 0,
      };
    }
    aggregated[entry.symbol].totalDividend += entry.amount;
  }

  return { entries, aggregated };
}

// Detect file type and parse accordingly
async function parseFile(file: File): Promise<ParsedDividendData> {
  const fileName = file.name.toLowerCase();
  const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

  if (isExcel) {
    // Try Zerodha format first, then simple format
    let parsed = await parseExcelFile(file);
    if (Object.keys(parsed.aggregated).length === 0) {
      parsed = await parseSimpleExcel(file);
    }
    return parsed;
  } else {
    // CSV file
    const content = await file.text();
    let parsed = await parseDividendCSV(content);
    if (Object.keys(parsed.aggregated).length === 0) {
      parsed = await parseSimpleDividendCSV(content);
    }
    return parsed;
  }
}

export const zerodhaParser: DividendParser = {
  brokerInfo: {
    id: 'zerodha',
    name: 'Zerodha',
    description: 'Parse Zerodha Tax P&L reports (CSV/Excel)',
    supportedFormats: ['csv', 'xlsx', 'xls'],
    country: 'IN',
  },
  canParse: (file: File) => {
    const name = file.name.toLowerCase();
    return name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls');
  },
  parse: parseFile,
};
