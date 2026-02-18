/**
 * Statement Parser — CSV Extraction Engine (v2)
 *
 * Improvements over v1:
 *  • Null vs. Zero distinction: keyword found but value = 0 → records 0 (not "Not Found").
 *    A missing column → records null and emits a warning.
 *  • Month detection: `detectMonthFromFilename(filename)` scans the filename
 *    for a recognisable month/year pattern.
 *  • Multi-file: `parseStatements(files[])` returns an array of monthly data objects
 *    sorted chronologically, each with a computed VAMP ratio.
 *
 * Privacy-first: all parsing is done client-side. No data is uploaded
 * to any server. Files are read via the browser's FileReader API and
 * discarded from memory after extraction.
 */

import Papa from 'papaparse';
import { calculateMonthlyVAMP, formatMonthLabel } from './trendCalculator.js';

// ── Column-name aliases ────────────────────────────────────────────────────

const COLUMN_ALIASES = {
  totalSalesCount: [
    'total_transactions', 'transaction_count', 'txn_count', 'sales_count',
    'total_sales', 'total txns', 'transactions', 'total_txn_count',
    'total transaction count', 'count',
  ],
  totalSalesVolume: [
    'total_volume', 'sales_volume', 'gross_volume', 'total_amount',
    'gross_sales', 'volume', 'total_sales_volume', 'gross_amount',
    'total volume', 'sales amount', 'net_sales',
  ],
  cnpTxnCount: [
    'cnp_transactions', 'card_not_present', 'ecommerce_transactions',
    'online_transactions', 'cnp_count', 'cnp txns', 'ecom_count',
    'card not present count', 'internet_transactions', 'cnp',
  ],
  tc15Count: [
    'chargebacks', 'disputes', 'tc15', 'chargeback_count', 'dispute_count',
    'cb_count', 'total_chargebacks', 'total chargebacks', 'number_of_chargebacks',
    'retrieval_requests', 'tc15_count',
  ],
  tc40Count: [
    'fraud', 'tc40', 'fraud_count', 'fraud_transactions', 'tc40_count',
    'fraud_reports', 'total_fraud', 'fraud count', 'fraud items',
    'fraudulent_transactions', 'confirmed_fraud',
  ],
  fraudAmountUSD: [
    'fraud_amount', 'fraud_volume', 'tc40_amount', 'fraud_dollars',
    'fraud amount', 'total_fraud_amount', 'fraudulent_amount',
  ],
};

// ── Month detection ────────────────────────────────────────────────────────

const MONTH_MAP = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Attempt to extract {year, monthIndex, month} from a filename.
 * Recognises patterns like:
 *   statement_jan_2026.csv   → Jan 2026
 *   2026-03_report.csv       → Mar 2026
 *   april2025.pdf            → Apr 2025
 *   2025_Q1_Feb.csv          → Feb 2025
 *
 * Returns null when no month/year can be reliably inferred.
 *
 * @param {string} filename
 * @returns {{ year: number, monthIndex: number, month: string }|null}
 */
export function detectMonthFromFilename(filename) {
  const base = filename.toLowerCase().replace(/\.[^.]+$/, ''); // strip extension

  // Pattern 1: YYYY-MM or YYYY_MM
  const numericMatch = base.match(/(\d{4})[-_](\d{1,2})/);
  if (numericMatch) {
    const year = parseInt(numericMatch[1], 10);
    const mo   = parseInt(numericMatch[2], 10) - 1;
    if (year >= 2020 && year <= 2030 && mo >= 0 && mo <= 11) {
      return { year, monthIndex: mo, month: formatMonthLabel({ year, monthIndex: mo }) };
    }
  }

  // Pattern 2: MM-YYYY or MM_YYYY
  const numericMatch2 = base.match(/(\d{1,2})[-_](\d{4})/);
  if (numericMatch2) {
    const mo   = parseInt(numericMatch2[1], 10) - 1;
    const year = parseInt(numericMatch2[2], 10);
    if (year >= 2020 && year <= 2030 && mo >= 0 && mo <= 11) {
      return { year, monthIndex: mo, month: formatMonthLabel({ year, monthIndex: mo }) };
    }
  }

  // Pattern 3: month name (text) + 4-digit year anywhere in filename
  const words = base.split(/[^a-z0-9]+/);
  let foundMonth = null;
  let foundYear  = null;

  for (const word of words) {
    if (MONTH_MAP[word] !== undefined) foundMonth = MONTH_MAP[word];
    const asNum = parseInt(word, 10);
    if (asNum >= 2020 && asNum <= 2030) foundYear = asNum;
  }

  if (foundMonth !== null && foundYear !== null) {
    return {
      year:       foundYear,
      monthIndex: foundMonth,
      month:      formatMonthLabel({ year: foundYear, monthIndex: foundMonth }),
    };
  }

  // Pattern 4: month name alone — use current year
  if (foundMonth !== null) {
    const year = new Date().getFullYear();
    return {
      year,
      monthIndex: foundMonth,
      month:      formatMonthLabel({ year, monthIndex: foundMonth }),
    };
  }

  return null;
}

// ── CSV helpers ────────────────────────────────────────────────────────────

function detectColumn(headers, aliases) {
  const normalizedHeaders = headers.map((h) => h?.toLowerCase().trim().replace(/\s+/g, '_'));
  for (const alias of aliases) {
    const normalized = alias.toLowerCase().replace(/\s+/g, '_');
    const idx = normalizedHeaders.indexOf(normalized);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

/**
 * Parse a numeric cell value.
 * Returns the parsed number (which may be 0) or null when the cell is absent/blank.
 *
 * Key difference from v1: blank / missing → null (not 0).
 * This lets the caller distinguish "keyword found but zero" from "keyword not found".
 *
 * @param {*} value
 * @returns {number|null}
 */
function parseNumeric(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const cleaned = String(value).replace(/[$,% ]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ── CSV parser ─────────────────────────────────────────────────────────────

/**
 * Parse a CSV File and return extracted transaction data.
 *
 * Fields are null when the column was not found, and 0 when the column
 * exists but all rows sum to zero.
 *
 * @param {File} file
 * @returns {Promise<{ data: object, warnings: string[], columnMap: object, detectedFields: object }>}
 */
export function parseCSVStatement(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header:         true,
      skipEmptyLines: true,
      dynamicTyping:  false,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          return reject(new Error('CSV file appears to be empty or has no data rows.'));
        }

        const headers = results.meta.fields ?? [];
        const warnings = [];

        // Detect which columns exist
        const columnMap = {};
        for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
          columnMap[field] = detectColumn(headers, aliases);
        }

        // Sum rows; track which fields were actually found in the sheet
        const extracted = {
          totalSalesCount:  null,
          totalSalesVolume: null,
          cnpTxnCount:      null,
          tc15Count:        null,
          tc40Count:        null,
          fraudAmountUSD:   null,
        };

        // detectedFields[field] = true  → column exists in CSV
        //                        = false → column not found
        const detectedFields = {};

        for (const [field, colName] of Object.entries(columnMap)) {
          detectedFields[field] = Boolean(colName);
          if (!colName) {
            warnings.push(`Column for "${field}" not detected — recorded as Not Found.`);
            continue;
          }
          // Column exists — sum all rows (result may be 0)
          let sum = 0;
          for (const row of results.data) {
            const val = parseNumeric(row[colName]);
            if (val !== null) sum += val;
          }
          extracted[field] = sum; // 0 is valid
        }

        // Fallback: if CNP not found, use totalSalesCount as proxy
        if (extracted.cnpTxnCount === null && extracted.totalSalesCount !== null && extracted.totalSalesCount > 0) {
          extracted.cnpTxnCount = extracted.totalSalesCount;
          warnings.push(
            'CNP count column not found. Using total transaction count as proxy. ' +
            'Results may overstate VAMP ratio if card-present transactions are included.'
          );
        }

        resolve({
          data: extracted,
          warnings,
          columnMap,
          detectedFields,
          rowCount: results.data.length,
          headers,
        });
      },
      error: (err) => reject(new Error(`CSV parse error: ${err.message}`)),
    });
  });
}

/**
 * Attempt to extract data from a PDF file.
 * Phase 1: Returns a structured notice explaining OCR is pending.
 *
 * @param {File} file
 * @returns {Promise<{ data: null, notice: string, requiresManualEntry: true }>}
 */
export async function parsePDFStatement(file) {
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    throw new Error('File does not appear to be a PDF.');
  }
  return {
    data:               null,
    requiresManualEntry: true,
    notice:
      'PDF parsing via OCR is planned for Phase 2. For now, please review the uploaded ' +
      'PDF and enter the key figures manually in the form below. Your PDF is not uploaded or stored.',
    filename: file.name,
    fileSize: file.size,
  };
}

/**
 * Dispatch to the correct parser based on file type.
 *
 * @param {File} file
 * @returns {Promise<object>}
 */
export async function parseStatement(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'csv' || file.type === 'text/csv') return parseCSVStatement(file);
  if (ext === 'pdf' || file.type === 'application/pdf') return parsePDFStatement(file);
  throw new Error(`Unsupported file type ".${ext}". Please upload a CSV or PDF statement.`);
}

/**
 * Parse multiple statement files and return an array of monthly data objects
 * sorted chronologically, each enriched with a computed VAMP ratio.
 *
 * Files that cannot be parsed (PDF, unsupported) are returned as {error} entries.
 *
 * @param {File[]} files
 * @returns {Promise<object[]>}
 */
export async function parseStatements(files) {
  const results = await Promise.allSettled(
    files.map(async (file) => {
      const res = await parseStatement(file);
      const monthInfo = detectMonthFromFilename(file.name);

      if (!res.data) {
        // PDF or parse failure — return placeholder
        return {
          filename:  file.name,
          month:     monthInfo?.month ?? file.name,
          year:      monthInfo?.year  ?? null,
          monthIndex: monthInfo?.monthIndex ?? null,
          isPDF:     true,
          data:      null,
          warnings:  [],
          error:     res.notice ?? 'Could not extract data from this file.',
        };
      }

      const data = res.data;
      const vampRatio = calculateMonthlyVAMP({
        tc40Count:   data.tc40Count  ?? 0,
        tc15Count:   data.tc15Count  ?? 0,
        cnpTxnCount: data.cnpTxnCount ?? 0,
      });

      return {
        filename:         file.name,
        month:            monthInfo?.month ?? file.name,
        year:             monthInfo?.year  ?? null,
        monthIndex:       monthInfo?.monthIndex ?? null,
        totalSalesCount:  data.totalSalesCount  ?? 0,
        totalSalesVolume: data.totalSalesVolume ?? 0,
        cnpTxnCount:      data.cnpTxnCount      ?? 0,
        tc15Count:        data.tc15Count         ?? 0,
        tc40Count:        data.tc40Count         ?? 0,
        fraudAmountUSD:   data.fraudAmountUSD    ?? 0,
        vampRatio,
        warnings:         res.warnings ?? [],
        detectedFields:   res.detectedFields ?? {},
      };
    })
  );

  const parsed = results.map((r) => (r.status === 'fulfilled' ? r.value : { error: r.reason?.message ?? 'Parse failed' }));

  // Sort by year then monthIndex (files without month info go to end)
  parsed.sort((a, b) => {
    if (a.year == null && b.year == null) return 0;
    if (a.year == null) return 1;
    if (b.year == null) return -1;
    if (a.year !== b.year) return a.year - b.year;
    return (a.monthIndex ?? 0) - (b.monthIndex ?? 0);
  });

  return parsed;
}

/**
 * Generate a sample CSV template the user can download.
 */
export function generateCSVTemplate() {
  const headers = [
    'total_transactions', 'total_volume', 'cnp_transactions',
    'chargebacks', 'fraud', 'fraud_amount',
  ];
  const sampleRow = ['10000', '500000', '8500', '45', '22', '11000'];
  const csv = [headers.join(','), sampleRow.join(',')].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'vamp_statement_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
