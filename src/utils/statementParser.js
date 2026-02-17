/**
 * Statement Parser — CSV + PDF Client-Side Extraction Engine
 *
 * CSV:  PapaParse with intelligent column-name detection.
 * PDF:  Mozilla PDF.js (pdfjs-dist) — full text extraction in the browser,
 *       no backend required, no data ever leaves the device.
 *
 * Keyword strategy: after extracting raw text from either format, the engine
 * runs two complementary passes:
 *
 *   1. Inline regex  — label and value appear on the same line, e.g.
 *                      "Sales Count: 10,000" or "Gross Volume  $500,000.00"
 *   2. Adjacent-line — label is on one line, value on the next, e.g.
 *                      "Chargeback Count\n45"
 *
 * The four primary keywords (per product spec) are:
 *   • "Sales Count"       → totalSalesCount  (+ cnpTxnCount fallback)
 *   • "Chargeback Count"  → tc15Count
 *   • "Fraud Count"       → tc40Count
 *   • "Gross Volume"      → totalSalesVolume
 *
 * Plus a wide net of common equivalents seen on Stripe, Chase, WorldPay,
 * First Data, Elavon, and Adyen statement exports.
 *
 * Privacy: pdfjs-dist runs entirely in the browser via a Web Worker.
 * No bytes of the uploaded file are sent over the network.
 */

import Papa from 'papaparse';

// ── PDF.js: lazy-loaded on first PDF parse ───────────────────────────────────
// Dynamic import keeps pdfjs-dist (~2 MB) out of the initial JS bundle.
// It is only fetched when the user actually drops a PDF.
let _pdfjsLib = null;

async function getPdfjsLib() {
  if (_pdfjsLib) return _pdfjsLib;
  _pdfjsLib = await import('pdfjs-dist');
  // Tell PDF.js where its worker lives.  The ?url suffix is a Vite feature
  // that copies the file to dist/ and returns its public URL — no CDN needed.
  const { default: workerUrl } = await import(
    'pdfjs-dist/build/pdf.worker.min.mjs?url'
  );
  _pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  return _pdfjsLib;
}

// ── Keyword patterns ─────────────────────────────────────────────────────────
// Each field has an ordered list of regex patterns.  The first match wins.
// Patterns are tried against the full extracted text (inline match).
// Numbers may contain commas, dollar signs, and optional decimals.

const NUM = '([\\$]?[0-9][0-9,]*(?:\\.[0-9]+)?)'; // capture group for a number

const KEYWORD_PATTERNS = {
  // ── "Sales Count" (exact) + common equivalents ────────────────────────────
  totalSalesCount: [
    new RegExp(`sales\\s+count[\\s:*]+${NUM}`, 'i'),
    new RegExp(`total\\s+sales[\\s:*]+${NUM}`, 'i'),
    new RegExp(`transaction\\s+count[\\s:*]+${NUM}`, 'i'),
    new RegExp(`total\\s+transactions?[\\s:*]+${NUM}`, 'i'),
    new RegExp(`(?:total\\s+)?(?:txn|trx)\\s+count[\\s:*]+${NUM}`, 'i'),
    new RegExp(`no\\.?\\s+of\\s+transactions?[\\s:*]+${NUM}`, 'i'),
    new RegExp(`purchase\\s+transactions?[\\s:*]+${NUM}`, 'i'),
    new RegExp(`total\\s+items?[\\s:*]+${NUM}`, 'i'),
  ],

  // ── "Gross Volume" (exact) + common equivalents ───────────────────────────
  totalSalesVolume: [
    new RegExp(`gross\\s+volume[\\s:*$]+${NUM}`, 'i'),
    new RegExp(`gross\\s+sales[\\s:*$]+${NUM}`, 'i'),
    new RegExp(`total\\s+volume[\\s:*$]+${NUM}`, 'i'),
    new RegExp(`sales\\s+volume[\\s:*$]+${NUM}`, 'i'),
    new RegExp(`total\\s+sales\\s+(?:amount|volume)[\\s:*$]+${NUM}`, 'i'),
    new RegExp(`gross\\s+amount[\\s:*$]+${NUM}`, 'i'),
    new RegExp(`net\\s+sales[\\s:*$]+${NUM}`, 'i'),
    new RegExp(`gross\\s+receipts[\\s:*$]+${NUM}`, 'i'),
    new RegExp(`processing\\s+volume[\\s:*$]+${NUM}`, 'i'),
  ],

  // ── "Chargeback Count" (exact) + common equivalents ──────────────────────
  tc15Count: [
    new RegExp(`chargeback\\s+count[\\s:*]+${NUM}`, 'i'),
    new RegExp(`total\\s+chargebacks?[\\s:*]+${NUM}`, 'i'),
    new RegExp(`dispute\\s+count[\\s:*]+${NUM}`, 'i'),
    new RegExp(`total\\s+disputes?[\\s:*]+${NUM}`, 'i'),
    new RegExp(`no\\.?\\s+of\\s+chargebacks?[\\s:*]+${NUM}`, 'i'),
    new RegExp(`cb\\s+count[\\s:*]+${NUM}`, 'i'),
    new RegExp(`tc[-\\s]?15[\\s:*]+${NUM}`, 'i'),
    new RegExp(`retrieval\\s+requests?[\\s:*]+${NUM}`, 'i'),
    new RegExp(`dispute\\s+(?:items?|transactions?)[\\s:*]+${NUM}`, 'i'),
  ],

  // ── "Fraud Count" (exact) + common equivalents ───────────────────────────
  tc40Count: [
    new RegExp(`fraud\\s+count[\\s:*]+${NUM}`, 'i'),
    new RegExp(`total\\s+fraud[\\s:*]+${NUM}`, 'i'),
    new RegExp(`fraud\\s+reports?[\\s:*]+${NUM}`, 'i'),
    new RegExp(`tc[-\\s]?40[\\s:*]+${NUM}`, 'i'),
    new RegExp(`fraudulent\\s+transactions?[\\s:*]+${NUM}`, 'i'),
    new RegExp(`confirmed\\s+fraud[\\s:*]+${NUM}`, 'i'),
    new RegExp(`fraud\\s+transactions?[\\s:*]+${NUM}`, 'i'),
    new RegExp(`fraud\\s+items?[\\s:*]+${NUM}`, 'i'),
  ],

  // ── Fraud dollar amount ───────────────────────────────────────────────────
  fraudAmountUSD: [
    new RegExp(`fraud\\s+(?:amount|volume|dollars?)[\\s:*$]+${NUM}`, 'i'),
    new RegExp(`total\\s+fraud\\s+amount[\\s:*$]+${NUM}`, 'i'),
    new RegExp(`fraudulent\\s+(?:amount|volume)[\\s:*$]+${NUM}`, 'i'),
    new RegExp(`tc[-\\s]?40\\s+(?:amount|volume)[\\s:*$]+${NUM}`, 'i'),
  ],

  // ── CNP-specific count ────────────────────────────────────────────────────
  cnpTxnCount: [
    new RegExp(`cnp\\s+(?:transactions?|count)[\\s:*]+${NUM}`, 'i'),
    new RegExp(`card[\\s-]not[\\s-]present[\\s:*]+${NUM}`, 'i'),
    new RegExp(`e[\\s-]?commerce\\s+(?:transactions?|count)[\\s:*]+${NUM}`, 'i'),
    new RegExp(`online\\s+(?:transactions?|count)[\\s:*]+${NUM}`, 'i'),
    new RegExp(`internet\\s+transactions?[\\s:*]+${NUM}`, 'i'),
    new RegExp(`ecom(?:merce)?\\s+(?:transactions?|count)[\\s:*]+${NUM}`, 'i'),
  ],
};

// ── Label patterns for adjacent-line matching ─────────────────────────────────
// When the label and value are on separate lines we match the label line alone.
const ADJACENT_LABELS = [
  { field: 'totalSalesCount',  patterns: [/^sales\s+count$/i, /^total\s+(?:transactions?|sales)$/i, /^transaction\s+count$/i, /^(?:total\s+)?(?:txn|trx)\s+count$/i] },
  { field: 'totalSalesVolume', patterns: [/^gross\s+volume$/i, /^gross\s+sales$/i, /^(?:total\s+)?sales\s+volume$/i, /^processing\s+volume$/i, /^gross\s+amount$/i] },
  { field: 'tc15Count',        patterns: [/^chargeback\s+count$/i, /^total\s+chargebacks?$/i, /^dispute\s+count$/i, /^total\s+disputes?$/i, /^cb\s+count$/i] },
  { field: 'tc40Count',        patterns: [/^fraud\s+count$/i, /^total\s+fraud$/i, /^fraud\s+reports?$/i, /^fraudulent\s+transactions?$/i] },
  { field: 'fraudAmountUSD',   patterns: [/^fraud\s+amount$/i, /^total\s+fraud\s+amount$/i, /^fraudulent\s+amount$/i] },
  { field: 'cnpTxnCount',      patterns: [/^cnp\s+(?:transactions?|count)$/i, /^card[\s-]not[\s-]present$/i, /^e[\s-]?commerce\s+(?:count|transactions?)$/i] },
];

// ── Text normalisation ────────────────────────────────────────────────────────

function normalizeText(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')   // collapse horizontal whitespace
    .replace(/\n{3,}/g, '\n\n') // collapse excessive blank lines
    .trim();
}

function parseNumStr(str) {
  // Strip $, commas, spaces; return float or NaN
  const n = parseFloat(str.replace(/[$, ]/g, ''));
  return isNaN(n) ? null : n;
}

// ── Pass 1: inline regex match ────────────────────────────────────────────────

function inlineExtract(text) {
  const extracted = {};
  for (const [field, patterns] of Object.entries(KEYWORD_PATTERNS)) {
    for (const pattern of patterns) {
      const m = text.match(pattern);
      if (m) {
        const n = parseNumStr(m[1]);
        if (n !== null && n >= 0) {
          extracted[field] = n;
          break;
        }
      }
    }
  }
  return extracted;
}

// ── Pass 2: adjacent-line match ───────────────────────────────────────────────

function adjacentLineExtract(text) {
  const extracted = {};
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    for (const { field, patterns } of ADJACENT_LABELS) {
      if (extracted[field] !== undefined) continue;
      for (const labelPat of patterns) {
        if (labelPat.test(lines[i])) {
          // Scan the next 3 lines for the first number
          for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
            // Line might be purely numeric or start with a number/currency
            const numMatch = lines[j].match(/^[\$]?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
            if (numMatch) {
              const n = parseNumStr(numMatch[1]);
              if (n !== null && n >= 0) {
                extracted[field] = n;
                break;
              }
            }
          }
          break; // matched this label — move to next field
        }
      }
    }
  }
  return extracted;
}

// ── Merge & post-process extracted values ─────────────────────────────────────

function mergeAndFinalize(inline, adjacent) {
  // Adjacent-line wins only for fields not already found inline
  const merged = { ...inline };
  for (const [field, val] of Object.entries(adjacent)) {
    if (merged[field] === undefined) merged[field] = val;
  }

  const warnings = [];

  // CNP fallback: if CNP not found, use totalSalesCount as a proxy
  if (!merged.cnpTxnCount && merged.totalSalesCount) {
    merged.cnpTxnCount = merged.totalSalesCount;
    warnings.push(
      'CNP transaction count not detected — using total Sales Count as a proxy. ' +
      'If this statement mixes card-present and card-not-present transactions, ' +
      'your VAMP ratio may be understated.'
    );
  }

  // Report missing primary fields
  const required = { totalSalesCount: 'Sales Count', tc15Count: 'Chargeback Count', tc40Count: 'Fraud Count', totalSalesVolume: 'Gross Volume' };
  for (const [field, label] of Object.entries(required)) {
    if (merged[field] === undefined) {
      warnings.push(`"${label}" not found — enter manually below.`);
    }
  }

  return { merged, warnings };
}

// ── CSV column-name aliases (header-based detection) ─────────────────────────

const COLUMN_ALIASES = {
  totalSalesCount: [
    'sales count', 'total_transactions', 'transaction_count', 'txn_count', 'sales_count',
    'total_sales', 'total txns', 'transactions', 'total_txn_count',
    'total transaction count', 'count', 'purchase count',
  ],
  totalSalesVolume: [
    'gross volume', 'total_volume', 'sales_volume', 'gross_volume', 'total_amount',
    'gross_sales', 'volume', 'total_sales_volume', 'gross_amount',
    'total volume', 'sales amount', 'net_sales', 'processing volume',
  ],
  cnpTxnCount: [
    'cnp_transactions', 'card_not_present', 'ecommerce_transactions',
    'online_transactions', 'cnp_count', 'cnp txns', 'ecom_count',
    'card not present count', 'internet_transactions', 'cnp',
  ],
  tc15Count: [
    'chargeback count', 'chargebacks', 'disputes', 'tc15', 'chargeback_count',
    'dispute_count', 'cb_count', 'total_chargebacks', 'total chargebacks',
    'number_of_chargebacks', 'retrieval_requests', 'tc15_count',
  ],
  tc40Count: [
    'fraud count', 'fraud', 'tc40', 'fraud_count', 'fraud_transactions',
    'tc40_count', 'fraud_reports', 'total_fraud', 'fraud items',
    'fraudulent_transactions', 'confirmed_fraud',
  ],
  fraudAmountUSD: [
    'fraud_amount', 'fraud_volume', 'tc40_amount', 'fraud_dollars',
    'fraud amount', 'total_fraud_amount', 'fraudulent_amount',
  ],
};

function detectColumn(headers, aliases) {
  const normalized = headers.map((h) => h?.toLowerCase().trim().replace(/\s+/g, '_'));
  for (const alias of aliases) {
    const a = alias.toLowerCase().replace(/\s+/g, '_');
    const idx = normalized.indexOf(a);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function safeNum(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = parseFloat(String(value).replace(/[$,% ]/g, '').trim());
  return isNaN(n) ? 0 : n;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a CSV processing statement.
 *
 * Strategy A: header column detection (structured CSV).
 * Strategy B: run keyword extraction on the raw CSV text as a fallback
 *             (for summary CSVs where values appear in description columns).
 */
export function parseCSVStatement(file) {
  return new Promise((resolve, reject) => {
    // Strategy B needs the raw text — read in parallel
    const reader = new FileReader();
    let rawText = '';
    reader.onload = (e) => { rawText = e.target.result ?? ''; };
    reader.readAsText(file);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        if (!results.data?.length) {
          return reject(new Error('CSV file appears to be empty or has no data rows.'));
        }

        const headers = results.meta.fields ?? [];
        const warnings = [];

        // ── Strategy A: column header matching ──
        const columnMap = {};
        for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
          columnMap[field] = detectColumn(headers, aliases);
        }

        const extracted = {
          totalSalesCount: 0, totalSalesVolume: 0, cnpTxnCount: 0,
          tc15Count: 0, tc40Count: 0, fraudAmountUSD: 0,
        };
        for (const row of results.data) {
          for (const [field, col] of Object.entries(columnMap)) {
            if (col && row[col] !== undefined) {
              extracted[field] += safeNum(row[col]);
            }
          }
        }

        // ── Strategy B: keyword extraction on raw text (fallback) ──
        // Used when column headers don't match but the CSV contains
        // a summary section with labelled rows (common in bank exports).
        const missingFields = Object.entries(extracted)
          .filter(([k, v]) => v === 0 && k !== 'fraudAmountUSD')
          .map(([k]) => k);

        if (missingFields.length > 0 && rawText) {
          const normalized = normalizeText(rawText);
          const inlineKw = inlineExtract(normalized);
          const adjacentKw = adjacentLineExtract(normalized);
          for (const field of missingFields) {
            const kwVal = inlineKw[field] ?? adjacentKw[field];
            if (kwVal !== undefined) extracted[field] = kwVal;
          }
        }

        // CNP fallback
        if (!extracted.cnpTxnCount && extracted.totalSalesCount) {
          extracted.cnpTxnCount = extracted.totalSalesCount;
          warnings.push(
            'CNP count not found — using total Sales Count as proxy. ' +
            'Adjust if statement mixes card-present transactions.'
          );
        }

        const primaryLabels = {
          totalSalesCount: 'Sales Count',
          tc15Count: 'Chargeback Count',
          tc40Count: 'Fraud Count',
          totalSalesVolume: 'Gross Volume',
        };
        for (const [field, label] of Object.entries(primaryLabels)) {
          if (!extracted[field]) warnings.push(`"${label}" not detected — enter manually.`);
        }

        resolve({
          data: extracted,
          warnings,
          columnMap,
          rowCount: results.data.length,
          headers,
          source: 'csv',
        });
      },
      error: (err) => reject(new Error(`CSV parse error: ${err.message}`)),
    });
  });
}

/**
 * Parse a PDF processing statement using Mozilla PDF.js (browser-native,
 * no server, no external API).
 *
 * Text is extracted page-by-page with Y-position sorting to reconstruct
 * reading order, then passed through both keyword extraction passes.
 */
export async function parsePDFStatement(file) {
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    throw new Error('File does not appear to be a PDF.');
  }

  const pdfjsLib = await getPdfjsLib();
  const arrayBuffer = await file.arrayBuffer();

  let pdf;
  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    pdf = await loadingTask.promise;
  } catch (err) {
    throw new Error(
      `PDF.js could not read this file: ${err.message}. ` +
      'If the PDF is password-protected, please remove the password first.'
    );
  }

  // Extract text from every page, restoring reading order via Y-sort
  const pageTexts = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Sort: high Y first (top of page in PDF coordinate space), then low X
    const items = [...content.items].sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > 3) return yDiff;       // Different lines
      return a.transform[4] - b.transform[4];        // Same line: L→R
    });

    let pageText = '';
    let lastY = null;
    for (const item of items) {
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        pageText += '\n';
      } else if (lastY !== null && pageText && !pageText.endsWith(' ')) {
        pageText += ' ';
      }
      pageText += item.str;
      if (item.hasEOL) pageText += '\n';
      lastY = y;
    }
    pageTexts.push(pageText);
  }

  const fullText = normalizeText(pageTexts.join('\n\n'));

  // Run both extraction passes
  const inline   = inlineExtract(fullText);
  const adjacent = adjacentLineExtract(fullText);
  const { merged, warnings } = mergeAndFinalize(inline, adjacent);

  // Determine how much we got
  const foundFields = Object.keys(merged).filter((k) => merged[k] !== undefined);
  const hasMinimum  = Boolean(merged.cnpTxnCount);

  return {
    data:              hasMinimum ? merged : null,
    requiresManualEntry: !hasMinimum,
    warnings,
    filename:          file.name,
    pageCount:         pdf.numPages,
    fieldsFound:       foundFields,
    notice:            hasMinimum
      ? `Extracted ${foundFields.length} data field(s) from ${pdf.numPages}-page PDF. Review values below.`
      : 'Could not auto-detect key figures from this PDF layout. Enter values manually — your file is not stored.',
    source: 'pdf',
  };
}

/**
 * Dispatch to the correct parser based on file extension / MIME type.
 */
export async function parseStatement(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'csv' || file.type === 'text/csv' || file.type === 'application/csv') {
    return parseCSVStatement(file);
  }
  if (ext === 'pdf' || file.type === 'application/pdf') {
    return parsePDFStatement(file);
  }
  throw new Error(`Unsupported file type ".${ext}". Upload a CSV or PDF statement.`);
}

/**
 * Download a CSV template pre-labelled with the exact keyword headers
 * this engine recognises, so merchants can fill it in easily.
 */
export function generateCSVTemplate() {
  const rows = [
    ['sales count', 'gross volume', 'cnp_transactions', 'chargeback count', 'fraud count', 'fraud amount'],
    ['10000',       '500000',       '8500',             '45',               '22',          '11000'],
  ];
  const csv  = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'vamp_statement_template.csv' });
  a.click();
  URL.revokeObjectURL(url);
}
