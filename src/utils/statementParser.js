/**
 * Statement Parser — Mock / CSV Extraction Engine
 *
 * Phase 1 (current): CSV parsing with intelligent column-name detection.
 *                    PDF parsing returns a structured mock with a notice.
 *
 * Phase 2 (planned): OCR via backend service (e.g., AWS Textract or
 *                    Azure Form Recognizer) for actual PDF extraction.
 *
 * Privacy-first: all parsing is done client-side. No data is uploaded
 * to any server. The file is read via the browser's FileReader API and
 * discarded from memory after extraction.
 */

import Papa from 'papaparse';

// Column name aliases for auto-detection
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

/**
 * Find the best matching column name from a CSV header row.
 */
function detectColumn(headers, aliases) {
  const normalizedHeaders = headers.map((h) => h?.toLowerCase().trim().replace(/\s+/g, '_'));
  for (const alias of aliases) {
    const normalized = alias.toLowerCase().replace(/\s+/g, '_');
    const idx = normalizedHeaders.indexOf(normalized);
    if (idx !== -1) return headers[idx]; // return original header name
  }
  return null;
}

/**
 * Safely parse a numeric value from a CSV cell (strips $, commas, %).
 */
function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = String(value).replace(/[$,% ]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse a CSV file (File object) and return extracted transaction data.
 *
 * @param {File} file
 * @returns {Promise<{ data: object, warnings: string[], columnMap: object }>}
 */
export function parseCSVStatement(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          return reject(new Error('CSV file appears to be empty or has no data rows.'));
        }

        const headers = results.meta.fields ?? [];
        const warnings = [];

        // Detect columns
        const columnMap = {};
        for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
          const match = detectColumn(headers, aliases);
          columnMap[field] = match;
          if (!match) {
            warnings.push(`Could not auto-detect column for "${field}". Using 0.`);
          }
        }

        // If there is one summary row, use it. If multiple, sum them.
        let extracted = {
          totalSalesCount: 0,
          totalSalesVolume: 0,
          cnpTxnCount: 0,
          tc15Count: 0,
          tc40Count: 0,
          fraudAmountUSD: 0,
        };

        for (const row of results.data) {
          for (const [field, colName] of Object.entries(columnMap)) {
            if (colName && row[colName] !== undefined) {
              extracted[field] += parseNumeric(row[colName]);
            }
          }
        }

        // Fallback: if CNP not found, use totalSalesCount as proxy
        if (extracted.cnpTxnCount === 0 && extracted.totalSalesCount > 0) {
          extracted.cnpTxnCount = extracted.totalSalesCount;
          warnings.push(
            'CNP transaction count not found. Using total transaction count as a proxy. ' +
            'Results may overstate VAMP ratio if CP transactions are included.'
          );
        }

        resolve({
          data: extracted,
          warnings,
          columnMap,
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
 *
 * Phase 1: Returns a structured notice explaining OCR is pending.
 * The function signature is stable so the OCR backend can be dropped in later.
 *
 * @param {File} file
 * @returns {Promise<{ data: null, notice: string, requiresManualEntry: true }>}
 */
export async function parsePDFStatement(file) {
  // Validate it's actually a PDF
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    throw new Error('File does not appear to be a PDF.');
  }

  return {
    data: null,
    requiresManualEntry: true,
    notice:
      'PDF parsing via OCR is planned for Phase 2 (backend integration with AWS Textract ' +
      'or Azure Form Recognizer). For now, please review the uploaded PDF and enter the ' +
      'key figures manually in the form below. Your PDF is not uploaded or stored.',
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

  if (ext === 'csv' || file.type === 'text/csv') {
    return parseCSVStatement(file);
  }
  if (ext === 'pdf' || file.type === 'application/pdf') {
    return parsePDFStatement(file);
  }

  throw new Error(`Unsupported file type ".${ext}". Please upload a CSV or PDF statement.`);
}

/**
 * Generate a sample CSV template the user can download.
 */
export function generateCSVTemplate() {
  const headers = [
    'total_transactions',
    'total_volume',
    'cnp_transactions',
    'chargebacks',
    'fraud',
    'fraud_amount',
  ];
  const sampleRow = ['10000', '500000', '8500', '45', '22', '11000'];
  const csv = [headers.join(','), sampleRow.join(',')].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vamp_statement_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
