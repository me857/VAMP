/**
 * Statement Parser — CSV + PDF Extraction Engine (v4)
 *
 *  • CSV:  column-alias detection + null-vs-zero distinction.
 *  • PDF:  real text extraction via pdfjs-dist (browser-native, no server upload).
 *
 *  Supported PDF statement formats:
 *    1. First Data / ServeFirst / Fiserv
 *         Gross Volume   → "Total Amount Submitted"
 *         Sales Count    → "Items" column in "Summary By Card Type" table
 *         Chargebacks    → 0 when "No Chargebacks/Reversals" or $0 on CB line
 *         Fraud Count    → always 0 (not in First Data statements)
 *    2. Chase Merchant Services / Paymentech / Chase Paymentech
 *         Gross Volume   → "Gross Sales", "Total Sales", "Sales" row amount
 *         Sales Count    → "Sales" row count OR "Total Transactions" label
 *         Chargebacks    → "Chargebacks" row count in Activity Summary
 *         Card Breakdown → "Card Type Summary" / "Sales By Card Type" section
 *    3. Generic fallback — tries common label variants across both formats
 *
 * Privacy-first: all parsing is 100% client-side via FileReader / pdfjs Web Worker.
 * No data is uploaded or stored on any server.
 */

import Papa from 'papaparse';

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXTRACTION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Use pdfjs-dist to extract all text lines from every page of a PDF.
 * Lines are reconstructed by grouping text items with similar y-coordinates
 * (within 3pt tolerance) and sorting left-to-right within each group.
 *
 * @param {File} file
 * @returns {Promise<string[]>} All lines from all pages, top-to-bottom.
 */
async function extractPDFLines(file) {
  // Dynamic import keeps the 1.4 MB worker out of the initial bundle
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');

  // Only set the worker once
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  const allLines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    if (!textContent.items.length) continue;

    // Build position-annotated items; skip whitespace-only strings
    const items = textContent.items
      .filter((it) => it.str?.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], text: it.str }))
      // Sort top-to-bottom (y desc in PDF space) then left-to-right
      .sort((a, b) => b.y - a.y || a.x - b.x);

    // Tolerance-based line grouping: start a new group when y jumps > 3pt
    const groups = [];
    let cur = null;
    for (const it of items) {
      if (!cur || Math.abs(it.y - cur.y) > 3) {
        cur = { y: it.y, items: [it] };
        groups.push(cur);
      } else {
        cur.items.push(it);
      }
    }

    // Sort each group left-to-right and join into a line string
    for (const g of groups) {
      g.items.sort((a, b) => a.x - b.x);
      const line = g.items.map((i) => i.text).join(' ').replace(/\s{2,}/g, ' ').trim();
      if (line) allLines.push(line);
    }
  }

  return allLines;
}

// ── Field-extraction helpers ──────────────────────────────────────────────

/**
 * Extract the first pure integer (no decimal point) from a line, left to right.
 * Handles comma-separated numbers like "1,234".
 * Returns null if nothing found.
 */
function firstInt(line) {
  const parts = line.split(/\s+/);
  for (const p of parts) {
    const clean = p.replace(/[$,()]/g, '');
    if (/^\d{1,8}$/.test(clean)) return parseInt(clean, 10);
  }
  return null;
}

/**
 * Attempt to extract a statement period (e.g. "January 2026") from a line.
 * Tries:
 *   1. Date range: "MM/DD/YYYY THROUGH MM/DD/YYYY" → formats end date
 *   2. Month name + 4-digit year anywhere in the line
 * Returns a formatted string like "January 2026" or null.
 */
function extractPeriodFromLine(line) {
  // Pattern 1: MM/DD/YYYY THROUGH/TO MM/DD/YYYY → use end date
  const range = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(?:THROUGH|TO)\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (range) {
    const p = range[2].split('/');
    const d = new Date(parseInt(p[2], 10), parseInt(p[0], 10) - 1, parseInt(p[1], 10));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
  }
  // Pattern 2: "January 2026" (or any month name + 4-digit year ≥ 2020)
  const monthYear = line.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i);
  if (monthYear && parseInt(monthYear[2], 10) >= 2020) {
    const mn = monthYear[1][0].toUpperCase() + monthYear[1].slice(1).toLowerCase();
    return `${mn} ${monthYear[2]}`;
  }
  return null;
}

/**
 * Extract the first dollar/decimal amount from a line (e.g. "$269,742.10").
 * Returns null if none found.
 */
function firstDollar(line) {
  const m = line.match(/\$?\s*([\d,]+\.\d{2})/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

// ── First Data / ServeFirst field extraction ──────────────────────────────

// Phrase variants that mean "Total Amount Submitted"
const GROSS_LABELS = [
  'total amount submitted',
  'total gross sales you submitted',
  'gross sales you submitted',
  'total sales submitted',
  'total submitted',
];

// Phrase variants that mean "zero chargebacks this period"
const NO_CB_PHRASES = [
  'no chargebacks/reversals for this statement period',
  'no chargeback/reversal for this statement period',
  'no chargebacks for this statement period',
  'no chargebacks',
];

// Card-type names that appear at the start of Summary By Card Type rows
const CARD_TYPE_PREFIXES = [
  'visa', 'mastercard', 'master card', 'mc ', 'discover', 'american express',
  'amex', 'jcb', 'diners', 'debit', 'pin debit', 'fleet', 'voyager',
  'wright express', 'wex', 'check', 'ach',
];

/**
 * Parse extracted PDF lines using First Data / ServeFirst statement rules.
 *
 * Field rules:
 *  • Gross Volume         "Total Amount Submitted" — inline or adjacent line
 *  • Sales Count          Total row of "Summary By Card Type" Items column
 *  • mastercardTxnCount   Mastercard row(s) in card-type table; fallback: MC TOTAL
 *                         row in the Interchange section; fallback: sum of MC
 *                         interchange category lines
 *  • visaTxnCount         Visa row(s) in card-type table; fallback: VS/VISA TOTAL
 *                         row in Interchange section; fallback: sum of Visa category lines
 *  • Chargeback Cnt       0 when "No Chargebacks/Reversals" phrase detected OR when
 *                         page-1 summary shows Chargebacks/Reversals = $0.00
 *  • Fraud Count          Always 0 (not present in First Data statements)
 *  • statementPeriod      Extracted from date-range lines or "Month YYYY" in header
 *  • CNP fallback         When Summary By Card Type is absent, total CNP is derived
 *                         by summing all card-brand interchange totals found
 *
 * @param {string[]} lines
 * @returns {{ data: object, warnings: string[], detectedFields: object }}
 */
function parseFirstDataFields(lines) {
  const warnings = [];

  // Core fields
  let grossVolume     = null;
  let salesCount      = null;
  let chargebackCount = null;  // always resolved to a number before return
  const fraudCount    = 0;     // constant — not in First Data statements

  // Per-brand card counts (extracted from Summary By Card Type)
  let mcCardSum     = 0;   // Mastercard rows accumulated
  let visaCardSum   = 0;   // Visa rows accumulated
  let mcCardFound   = false;
  let visaCardFound = false;

  // Interchange-section fallback for MC and Visa counts
  let mcInterchangeTotal = null;
  let mcInterchangeSum   = 0;   // sum of individual MC interchange category lines
  let vsInterchangeTotal = null;
  let vsInterchangeSum   = 0;   // sum of individual Visa interchange category lines

  // Statement period
  let statementPeriod = null;

  // Section / loop state
  let inCardTypeSection    = false;
  let inInterchangeSection = false;
  let cardSectionItemSum   = 0;
  let cardSectionRowsFound = 0;
  let cbSectionFound       = false;

  // Network/processing fee keywords to skip in interchange section (not per-transaction categories)
  const NETWORK_FEE_KEYWORDS = ['ntwk', 'network access', 'pre-auth fee', 'acquirer processing',
    'auth fee', 'assessment', 'brand fee', 'digital enablement', 'kilobyte', 'service fee',
    'zero floor', 'misuse', 'licence fee'];

  for (let i = 0; i < lines.length; i++) {
    const line  = lines[i];
    const lower = line.toLowerCase().trim();

    // ── 0. Statement period (scan entire document; stop after first match) ──
    if (statementPeriod === null) {
      statementPeriod = extractPeriodFromLine(line);
    }

    // ── 1. Gross Volume ────────────────────────────────────────────────
    if (grossVolume === null && GROSS_LABELS.some((lbl) => lower.includes(lbl))) {
      let val = firstDollar(line);
      if (val === null && i + 1 < lines.length) val = firstDollar(lines[i + 1]);
      if (val === null && i + 2 < lines.length) val = firstDollar(lines[i + 2]);
      if (val !== null && val > 0) grossVolume = val;
    }

    // ── 2. Chargeback Count — "No Chargebacks" phrase ─────────────────
    if (chargebackCount === null && NO_CB_PHRASES.some((p) => lower.includes(p))) {
      chargebackCount = 0;
    }

    // ── 3. Chargeback Count — page-1 "Chargebacks/Reversals $0.00" ────
    if (chargebackCount === null &&
        lower.includes('chargeback') && lower.includes('reversal')) {
      cbSectionFound = true;
      const dollar = firstDollar(line);
      if (dollar === 0) {
        chargebackCount = 0;
      } else if (dollar === null) {
        const cnt = firstInt(line);
        if (cnt !== null) chargebackCount = cnt;
      }
    }

    // ── 4. Chargeback Count — "Total Chargebacks N $X" row ────────────
    if (chargebackCount === null &&
        lower.startsWith('total chargeback') && !lower.includes('amount')) {
      const cnt = firstInt(line);
      if (cnt !== null) chargebackCount = cnt;
    }

    // ── Section boundary: Summary By Card Type start ───────────────────
    if (lower.includes('summary by card type') || lower.includes('card type summary')) {
      inCardTypeSection    = true;
      inInterchangeSection = false;
      cardSectionItemSum   = 0;
      cardSectionRowsFound = 0;
      mcCardSum = 0; visaCardSum = 0;
      mcCardFound = false; visaCardFound = false;
      salesCount = null;
      continue;  // skip the heading line itself
    }

    // ── Section boundary: Interchange / Fee Detail start ──────────────
    if (!inCardTypeSection &&
        (lower.includes('interchange') ||
         lower === 'fee detail' || lower === 'fee summary' ||
         lower.startsWith('fee detail') || lower.startsWith('fee summary'))) {
      inInterchangeSection = true;
    }

    // ── Process: Summary By Card Type rows ────────────────────────────
    if (inCardTypeSection) {
      // Detect section end
      const sectionEnds =
        lower.includes('summary by day')   ||
        lower.includes('summary by batch') ||
        lower.includes('adjustment detail') ||
        lower.includes('fee detail')        ||
        lower.includes('chargeback detail') ||
        (lower.startsWith('page ') && /page\s+\d+/i.test(lower));

      if (sectionEnds) {
        inCardTypeSection = false;
        // The ending keyword might also open another section
        if (lower.includes('fee detail') || lower.includes('interchange')) {
          inInterchangeSection = true;
        }
        // Do NOT continue — fall through so interchange section also processes this line
      } else {
        // Skip column header rows
        if (lower.includes('items') || lower.includes('net amount') ||
            lower.includes('submitted') || lower.includes('reversals')) continue;

        // Adjustments row — excluded (adjustments aren't sales)
        if (lower.startsWith('adjustment') || lower.includes('adjustment')) continue;

        // "Total" row → definitive Items sum
        if (/^\s*total\b/i.test(lower) &&
            !lower.includes('amount') && !lower.includes('gross') && !lower.includes('submitted')) {
          const cnt = firstInt(line);
          if (cnt !== null && cnt > 0) {
            salesCount = cnt;
            inCardTypeSection = false;
          }
          continue;
        }

        // Individual card-type row — check brand and accumulate
        const startsWithCardType = CARD_TYPE_PREFIXES.some((ct) => lower.startsWith(ct));
        if (startsWithCardType) {
          const cnt = firstInt(line);
          if (cnt !== null && cnt > 0) {
            cardSectionItemSum += cnt;
            cardSectionRowsFound++;

            // Mastercard rows: "mastercard", "master card", "mc " (but not "misc")
            const isMC = lower.startsWith('mastercard') || lower.startsWith('master card') ||
              (lower.startsWith('mc') && !lower.startsWith('misc'));
            if (isMC) { mcCardSum += cnt; mcCardFound = true; }

            // Visa rows: "visa" (includes visa debit, visa credit, etc.)
            const isVisa = lower.startsWith('visa');
            if (isVisa) { visaCardSum += cnt; visaCardFound = true; }
          }
        }
        continue;  // processed this line in card-type section
      }
    }

    // ── Process: Interchange section rows ─────────────────────────────
    if (inInterchangeSection) {
      // Detect section end
      const sectionEnds =
        lower.includes('chargeback detail') ||
        lower.includes('discount summary')  ||
        lower.includes('summary by day')    ||
        (lower.startsWith('page ') && /page\s+\d+/i.test(lower));
      if (sectionEnds) { inInterchangeSection = false; continue; }

      // ── MC: explicit "MC TOTAL" / "MASTERCARD TOTAL" summary row ──────
      if (mcInterchangeTotal === null &&
          (/^mc\s+total\b/i.test(lower)         ||
           /^mastercard\s+total\b/i.test(lower) ||
           /^total\s+(?:mc|mastercard)\b/i.test(lower))) {
        const cnt = firstInt(line);
        if (cnt !== null && cnt > 0) mcInterchangeTotal = cnt;
      }

      // ── Visa: explicit "VS TOTAL" / "VISA TOTAL" summary row ──────────
      if (vsInterchangeTotal === null &&
          (/^vs\s+total\b/i.test(lower)   ||
           /^visa\s+total\b/i.test(lower) ||
           /^total\s+(?:vs|visa)\b/i.test(lower))) {
        const cnt = firstInt(line);
        if (cnt !== null && cnt > 0) vsInterchangeTotal = cnt;
      }

      // ── Sum individual interchange category lines as fallback ──────────
      // Skip network/processing fee lines — they're charged per-transaction but
      // not exclusively (same transaction can incur multiple network fees).
      const txnPattern = /(\d{1,6})\s+TRANS(?:ACTIONS?)?\s+AT\s+/i;

      const isMCLine = lower.startsWith('mc') || lower.startsWith('mastercard');
      if (isMCLine && !NETWORK_FEE_KEYWORDS.some((kw) => lower.includes(kw))) {
        const m = line.match(txnPattern);
        if (m) mcInterchangeSum += parseInt(m[1], 10);
      }

      // Visa interchange lines typically start with "VS" or "VISA" in fee sections
      const isVSLine = lower.startsWith('vs ') || lower.startsWith('vs-') ||
                       lower.startsWith('visa') && !lower.startsWith('visa debit'); // debit counted separately
      if (isVSLine && !NETWORK_FEE_KEYWORDS.some((kw) => lower.includes(kw))) {
        const m = line.match(txnPattern);
        if (m) vsInterchangeSum += parseInt(m[1], 10);
      }
    }
  }

  // ── Post-loop resolution ───────────────────────────────────────────────

  // Sales Count: authoritative Total row → summed card rows → null
  if (salesCount === null && cardSectionRowsFound > 0) {
    salesCount = cardSectionItemSum;
  }

  // ── Per-brand counts: priority 1 (card-type table) > 2 (brand total row) > 3 (category sum) ──
  let mastercardTxnCount = null;
  let visaTxnCount       = null;

  // Mastercard
  if (mcCardFound && mcCardSum > 0) {
    mastercardTxnCount = mcCardSum;
  } else if (mcInterchangeTotal !== null) {
    mastercardTxnCount = mcInterchangeTotal;
    warnings.push('Mastercard count taken from interchange section total row.');
  } else if (mcInterchangeSum > 0) {
    mastercardTxnCount = mcInterchangeSum;
    warnings.push('Mastercard transaction count estimated from interchange category lines — verify against statement.');
  }

  // Visa
  if (visaCardFound && visaCardSum > 0) {
    visaTxnCount = visaCardSum;
  } else if (vsInterchangeTotal !== null) {
    visaTxnCount = vsInterchangeTotal;
    warnings.push('Visa count taken from interchange section total row.');
  } else if (vsInterchangeSum > 0) {
    visaTxnCount = vsInterchangeSum;
    warnings.push('Visa transaction count estimated from interchange category lines — verify against statement.');
  }

  // ── CNP / total-sales fallback: if Summary By Card Type was absent, derive from
  //    card-brand interchange totals (MC + Visa + others). This gives a reasonable
  //    VAMP denominator without manual entry.
  if (salesCount === null) {
    const brandTotal = (mastercardTxnCount ?? 0) + (visaTxnCount ?? 0);
    if (brandTotal > 0) {
      salesCount = brandTotal;
      warnings.push(
        'Total transaction count approximated from Mastercard + Visa interchange totals — ' +
        'may exclude Discover/AMEX and other card types. Verify if you process multiple brands.'
      );
    }
  }

  // Chargeback Count: never leave null
  if (chargebackCount === null) {
    chargebackCount = 0;
    warnings.push(
      cbSectionFound
        ? 'Chargeback section found but count could not be extracted. Defaulted to 0 — please verify.'
        : 'Chargeback section not found in PDF. Defaulted to 0.'
    );
  }

  if (grossVolume === null) {
    warnings.push('"Total Amount Submitted" not found in PDF. Please enter Gross Volume manually.');
  }
  if (salesCount === null) {
    warnings.push('"Summary By Card Type" Items column not found. Please enter Sales Count manually.');
  }
  if (mastercardTxnCount === null) {
    warnings.push('Mastercard transaction count not found in PDF. Enter it manually for a precise ECP calculation.');
  }

  const anyExtracted = grossVolume !== null || salesCount !== null;

  return {
    data: anyExtracted
      ? {
          totalSalesCount:    salesCount,
          totalSalesVolume:   grossVolume,
          cnpTxnCount:        salesCount,        // total as CNP proxy (e-commerce merchant)
          mastercardTxnCount: mastercardTxnCount, // precise ECP denominator
          visaTxnCount:       visaTxnCount,       // informational
          tc15Count:          chargebackCount,
          tc40Count:          fraudCount,
          fraudAmountUSD:     null,
          statementPeriod:    statementPeriod,
        }
      : null,
    warnings,
    detectedFields: {
      totalSalesVolume:   grossVolume        !== null,
      totalSalesCount:    salesCount         !== null,
      cnpTxnCount:        salesCount         !== null,
      mastercardTxnCount: mastercardTxnCount !== null,
      visaTxnCount:       visaTxnCount       !== null,
      tc15Count:          true,   // always resolved
      tc40Count:          true,   // always 0
      fraudAmountUSD:     false,
      statementPeriod:    statementPeriod    !== null,
    },
    isPDFExtracted: true,
  };
}
// ── Statement format detection ─────────────────────────────────────────────

/**
 * Examine the first ~60 lines of extracted PDF text to identify the statement
 * issuer / processor format.
 *
 * Returns: 'firstdata' | 'chase' | 'unknown'
 *
 * Markers are lowercased substrings that definitively identify a format.
 */
const FIRSTDATA_MARKERS = [
  'total amount submitted',
  'summary by card type',
  'servefirst',
  'first data',
  'fiserv',
  'fd merchant',
];

const CHASE_MARKERS = [
  'paymentech',
  'chase merchant',
  'chase paymentech',
  'jpmorgan chase',
  'j.p. morgan',
  'summary of activity',
  'monthly activity summary',
  'card type summary',
  'sales by card type',
  'chase.com/merchant',
];

function detectStatementFormat(lines) {
  // Only scan first 80 lines — format markers appear in headers / first section
  const sample = lines.slice(0, 80).join('\n').toLowerCase();

  const hasFirstData = FIRSTDATA_MARKERS.some((m) => sample.includes(m));
  const hasChase     = CHASE_MARKERS.some((m) => sample.includes(m));

  if (hasFirstData && !hasChase) return 'firstdata';
  if (hasChase && !hasFirstData) return 'chase';
  if (hasFirstData) return 'firstdata';  // both → prefer First Data (more specific markers)
  return 'unknown';
}

// ── Chase Merchant Services / Paymentech field extraction ─────────────────

/**
 * Chase-specific gross volume label variants.
 * These are matched anywhere in a line (lower-cased), NOT at start.
 */
const CHASE_GROSS_LABELS = [
  'gross sales',
  'total gross sales',
  'total sales',
  'total gross',
  'gross amount',
  'total processed volume',
  'total processing volume',
  'total amount processed',
  'sales volume',
  'gross volume',
  'net sales',          // some Chase formats show "Net Sales" as the deposit base
];

/**
 * Chase-specific transaction-count label variants.
 */
const CHASE_COUNT_LABELS = [
  'total transactions',
  'total items',
  'total transaction count',
  'number of transactions',
  'transaction count',
];

/**
 * Parse extracted PDF lines using Chase Merchant Services / Paymentech rules.
 *
 * Field rules:
 *  • Gross Volume        "Gross Sales", "Total Sales", or "Sales" row amount
 *  • Sales Count         "Sales" row count OR "Total Transactions" label
 *  • mastercardTxnCount  Mastercard row in card-type section
 *  • visaTxnCount        Visa row in card-type section
 *  • Chargeback Cnt      "Chargebacks" row in Activity Summary (count, or 0 if $0.00)
 *  • Fraud Count         0 (not reported on Chase merchant statements)
 *  • statementPeriod     From date-range patterns or "Month YYYY"
 *
 * @param {string[]} lines
 * @returns {{ data: object, warnings: string[], detectedFields: object }}
 */
function parseChaseFields(lines) {
  const warnings = [];

  let grossVolume     = null;
  let salesCount      = null;
  let chargebackCount = null;
  const fraudCount    = 0;

  let mcCardSum    = 0;
  let visaCardSum  = 0;
  let mcCardFound  = false;
  let visaCardFound = false;

  let statementPeriod  = null;
  let inCardSection    = false;
  let inSummarySection = false;
  let cbSectionFound   = false;

  // Accumulated card-section totals for fallback salesCount
  let cardSectionTotal = 0;

  for (let i = 0; i < lines.length; i++) {
    const line  = lines[i];
    const lower = line.toLowerCase().trim();

    // ── 0. Statement period ────────────────────────────────────────────
    if (statementPeriod === null) {
      statementPeriod = extractPeriodFromLine(line);
    }

    // ── 1. Section boundaries ──────────────────────────────────────────

    // Activity / Summary section start
    if (lower.includes('summary of activity') || lower.includes('activity summary') ||
        lower.includes('monthly summary')     || lower.includes('monthly activity')) {
      inSummarySection = true;
      inCardSection    = false;
      continue;
    }

    // Card-type section start — "card type summary", "sales by card type",
    // "card type detail", "card type breakdown", "by card type"
    if (lower.includes('card type') || lower.includes('by card type') ||
        lower.includes('sales by card')) {
      inCardSection    = true;
      inSummarySection = false;
      cardSectionTotal = 0;
      continue;
    }

    // ── 2. Gross Volume — explicit labels ──────────────────────────────
    if (grossVolume === null && CHASE_GROSS_LABELS.some((lbl) => lower.includes(lbl))) {
      let val = firstDollar(line);
      if (val === null && i + 1 < lines.length) val = firstDollar(lines[i + 1]);
      if (val !== null && val > 0) grossVolume = val;
    }

    // ── 3. "No Chargebacks" phrase (some Chase formats share this wording) ──
    if (chargebackCount === null && NO_CB_PHRASES.some((p) => lower.includes(p))) {
      chargebackCount = 0;
    }

    // ── 4. "Sales" row in activity summary (Chase canonical format) ────
    // Chase activity summary rows look like: "Sales   1,234  $123,456.78"
    // We want the row whose first token is exactly "sales" (not "gross sales",
    // "net sales", "total sales" — those are caught above).
    if (grossVolume === null &&
        (lower === 'sales' || /^sales\s/.test(lower)) &&
        !lower.includes('gross') && !lower.includes('net') &&
        !lower.includes('card') && !lower.includes('by')) {
      let val = firstDollar(line);
      let cnt = firstInt(line);
      // Look ahead up to 2 lines (some PDFs split count and amount across lines)
      if (val === null && i + 1 < lines.length) {
        val = val ?? firstDollar(lines[i + 1]);
        cnt = cnt ?? firstInt(lines[i + 1]);
      }
      if (val === null && i + 2 < lines.length) {
        val = val ?? firstDollar(lines[i + 2]);
        cnt = cnt ?? firstInt(lines[i + 2]);
      }
      if (val !== null && val > 0) {
        grossVolume = val;
        if (cnt !== null && cnt > 0 && salesCount === null) salesCount = cnt;
      }
    }

    // ── 5. Transaction count — explicit label ──────────────────────────
    if (salesCount === null && CHASE_COUNT_LABELS.some((lbl) => lower.includes(lbl))) {
      let cnt = firstInt(line);
      if (cnt === null && i + 1 < lines.length) cnt = firstInt(lines[i + 1]);
      if (cnt !== null && cnt > 0) salesCount = cnt;
    }

    // ── 6. Chargebacks ─────────────────────────────────────────────────
    // Chase shows "Chargebacks  2  ($234.56)" in the activity summary,
    // or "Chargebacks and Retrievals  3  ($345.00)".
    if (chargebackCount === null && lower.includes('chargeback')) {
      cbSectionFound = true;
      const cnt    = firstInt(line);
      const dollar = firstDollar(line);

      if (cnt !== null) {
        chargebackCount = cnt;   // could be 0 if "$0.00" line has no integer count
      } else if (dollar === 0) {
        chargebackCount = 0;
      } else if (i + 1 < lines.length) {
        // count may appear on the very next line (split layout)
        const nextCnt = firstInt(lines[i + 1]);
        if (nextCnt !== null) chargebackCount = nextCnt;
      }
    }

    // ── 7. Card-type section rows ──────────────────────────────────────
    if (inCardSection) {
      // Section end: "Total" row or fee / batch summary headers
      const sectionEnds =
        lower.includes('fee detail')        ||
        lower.includes('discount detail')   ||
        lower.includes('interchange detail') ||
        lower.includes('summary by batch')  ||
        lower.includes('adjustment detail') ||
        (lower.startsWith('page ') && /page\s+\d+/i.test(lower));

      if (sectionEnds) {
        inCardSection = false;
        continue;
      }

      // Skip column header rows ("count", "amount", "transactions", "items")
      if (/^\s*(count|amount|transactions|items|card type|type)\s*$/i.test(lower)) continue;

      // "Total" row → use for salesCount fallback
      if (/^\s*total\b/i.test(lower)) {
        const cnt = firstInt(line);
        if (cnt !== null && cnt > 0 && salesCount === null) salesCount = cnt;
        inCardSection = false;
        continue;
      }

      // Card-brand rows
      const isMC   = lower.startsWith('mastercard') || lower.startsWith('master card') ||
                     (lower.startsWith('mc') && !lower.startsWith('misc'));
      const isVisa = lower.startsWith('visa');

      if (isMC || isVisa || CARD_TYPE_PREFIXES.some((p) => lower.startsWith(p))) {
        const cnt = firstInt(line);
        if (cnt !== null && cnt > 0) {
          cardSectionTotal += cnt;
          if (isMC)   { mcCardSum  += cnt; mcCardFound  = true; }
          if (isVisa) { visaCardSum += cnt; visaCardFound = true; }
        }
      }
    }
  }

  // ── Post-loop resolution ───────────────────────────────────────────────

  // salesCount fallback: accumulated card-section rows
  if (salesCount === null && cardSectionTotal > 0) {
    salesCount = cardSectionTotal;
    warnings.push(
      'Sales count derived from card-type rows. Verify against statement total if multiple card types.'
    );
  }

  // Per-brand counts
  const mastercardTxnCount = mcCardFound  && mcCardSum  > 0 ? mcCardSum  : null;
  const visaTxnCount       = visaCardFound && visaCardSum > 0 ? visaCardSum : null;

  // Chargebacks: default 0 when section was found but count was ambiguous
  if (chargebackCount === null) {
    chargebackCount = 0;
    warnings.push(
      cbSectionFound
        ? 'Chargeback row found but count could not be extracted. Defaulted to 0 — please verify.'
        : 'Chargeback row not found in PDF. Defaulted to 0.'
    );
  }

  if (grossVolume === null) {
    warnings.push('"Gross Sales" / "Total Sales" not found in PDF. Please enter Gross Volume manually.');
  }
  if (salesCount === null) {
    warnings.push('Transaction count not found in PDF. Please enter Sales Count manually.');
  }
  if (mastercardTxnCount === null) {
    warnings.push('Mastercard transaction count not found in PDF. Enter it manually for a precise ECP calculation.');
  }

  const anyExtracted = grossVolume !== null || salesCount !== null;

  return {
    data: anyExtracted
      ? {
          totalSalesCount:    salesCount,
          totalSalesVolume:   grossVolume,
          cnpTxnCount:        salesCount,
          mastercardTxnCount,
          visaTxnCount,
          tc15Count:          chargebackCount,
          tc40Count:          fraudCount,
          fraudAmountUSD:     null,
          statementPeriod,
        }
      : null,
    warnings,
    detectedFields: {
      totalSalesVolume:   grossVolume        !== null,
      totalSalesCount:    salesCount         !== null,
      cnpTxnCount:        salesCount         !== null,
      mastercardTxnCount: mastercardTxnCount !== null,
      visaTxnCount:       visaTxnCount       !== null,
      tc15Count:          true,
      tc40Count:          true,
      fraudAmountUSD:     false,
      statementPeriod:    statementPeriod    !== null,
    },
    isPDFExtracted: true,
  };
}

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
 * Extract field data from a PDF processing statement using pdfjs-dist.
 *
 * Supports First Data / ServeFirst statements natively:
 *  • Gross Volume   → "Total Amount Submitted"
 *  • Sales Count    → Items column in Summary By Card Type
 *  • Chargeback Cnt → 0 when "No Chargebacks/Reversals" phrase detected; never null
 *  • Fraud Count    → always 0 (not in First Data statements)
 *
 * For scanned/image-only PDFs (no embedded text), falls back to the
 * manual-entry notice gracefully.
 *
 * @param {File} file
 * @returns {Promise<object>}
 */
/**
 * Count how many core numeric fields were successfully extracted.
 * Used to pick the better result when format is ambiguous.
 */
function countExtracted(result) {
  if (!result?.data) return 0;
  const d = result.data;
  return [
    d.totalSalesVolume,
    d.totalSalesCount,
    d.tc15Count !== null,
    d.mastercardTxnCount,
    d.statementPeriod,
  ].filter(Boolean).length;
}

export async function parsePDFStatement(file) {
  try {
    const lines = await extractPDFLines(file);

    if (lines.length === 0) {
      return {
        data:               null,
        requiresManualEntry: true,
        warnings:           [],
        detectedFields:     {},
        notice:
          'This PDF appears to contain scanned images rather than embedded text. ' +
          'Please enter the key figures manually. Your file is not uploaded or stored.',
        filename: file.name,
        fileSize: file.size,
      };
    }

    // ── Format detection + dispatch ────────────────────────────────────────
    const format = detectStatementFormat(lines);

    let result;

    if (format === 'firstdata') {
      result = parseFirstDataFields(lines);
    } else if (format === 'chase') {
      result = parseChaseFields(lines);
    } else {
      // Unknown format — try both, keep the one that extracted more fields
      const fd    = parseFirstDataFields(lines);
      const chase = parseChaseFields(lines);
      result = countExtracted(fd) >= countExtracted(chase) ? fd : chase;
      if (result.data) {
        result.warnings.unshift(
          'Statement format not definitively identified — auto-detected best match. ' +
          'Please verify extracted figures against your statement.'
        );
      }
    }

    return {
      data:               result.data,
      warnings:           result.warnings,
      detectedFields:     result.detectedFields,
      isPDFExtracted:     true,
      detectedFormat:     format,
      requiresManualEntry: result.data === null,
      notice: result.data === null
        ? 'Some required fields could not be found automatically in this PDF. ' +
          'Please enter them manually using the form below.'
        : null,
      filename: file.name,
      fileSize: file.size,
    };
  } catch (err) {
    // PDF.js load/parse failure (encrypted, corrupt, etc.)
    return {
      data:               null,
      requiresManualEntry: true,
      warnings:           [],
      detectedFields:     {},
      notice: `PDF could not be read: ${err.message}. Please enter figures manually.`,
      filename: file.name,
      fileSize: file.size,
    };
  }
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
        // PDF with no extractable text, or unrecognised format → manual entry
        return {
          filename:   file.name,
          month:      monthInfo?.month ?? file.name,
          year:       monthInfo?.year  ?? null,
          monthIndex: monthInfo?.monthIndex ?? null,
          // isPDFExtracted = true means pdfjs ran but got nothing useful;
          // isPDF = true signals the UI to show the "enter manually" notice
          isPDF:      true,
          isPDFExtracted: Boolean(res.isPDFExtracted),
          data:       null,
          warnings:   res.warnings ?? [],
          error:      res.notice ?? 'Could not extract data from this file.',
        };
      }

      const data = res.data;
      const vampRatio = calculateMonthlyVAMP({
        tc40Count:   data.tc40Count  ?? 0,
        tc15Count:   data.tc15Count  ?? 0,
        cnpTxnCount: data.cnpTxnCount ?? 0,
      });

      // Month label: prefer extracted statementPeriod over filename detection
      const periodLabel = data.statementPeriod || monthInfo?.month || file.name;

      return {
        filename:           file.name,
        month:              periodLabel,
        year:               monthInfo?.year       ?? null,
        monthIndex:         monthInfo?.monthIndex ?? null,
        isPDFExtracted:     Boolean(res.isPDFExtracted),
        totalSalesCount:    data.totalSalesCount    ?? 0,
        totalSalesVolume:   data.totalSalesVolume   ?? 0,
        cnpTxnCount:        data.cnpTxnCount        ?? 0,
        mastercardTxnCount: data.mastercardTxnCount ?? null, // null = not extracted; 0 ≠ null
        visaTxnCount:       data.visaTxnCount       ?? null,
        tc15Count:          data.tc15Count          ?? 0,
        tc40Count:          data.tc40Count          ?? 0,
        fraudAmountUSD:     data.fraudAmountUSD     ?? 0,
        statementPeriod:    data.statementPeriod    ?? null,
        vampRatio,
        warnings:           res.warnings   ?? [],
        detectedFields:     res.detectedFields ?? {},
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
