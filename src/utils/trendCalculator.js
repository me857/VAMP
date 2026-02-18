/**
 * Trend Calculator — Multi-Month VAMP Rolling Average Engine
 *
 * Operates on an array of monthly data objects, each shaped like:
 * {
 *   month: 'Jan 2026',        // display label
 *   year: 2026,
 *   monthIndex: 0,            // 0–11 JS month index
 *   totalSalesCount:  10000,
 *   totalSalesVolume: 500000,
 *   cnpTxnCount:      8500,
 *   tc15Count:        45,
 *   tc40Count:        22,
 *   fraudAmountUSD:   11000,
 *   vampRatio:        0.0079, // computed
 * }
 */

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Compute raw VAMP ratio for a single month's data.
 * Returns null when CNP transactions are 0 (avoid division by zero).
 *
 * @param {{ tc40Count: number, tc15Count: number, cnpTxnCount: number }} d
 * @returns {number|null}
 */
export function calculateMonthlyVAMP(d) {
  const cnp = Number(d.cnpTxnCount) || 0;
  if (cnp === 0) return null;
  const numerator = (Number(d.tc40Count) || 0) + (Number(d.tc15Count) || 0);
  return numerator / cnp;
}

/**
 * Attach `vampRatio` to every element of a monthly data array in place
 * (returns new array — does not mutate).
 *
 * @param {object[]} months
 * @returns {object[]}
 */
export function attachVAMPRatios(months) {
  return months.map((m) => ({ ...m, vampRatio: calculateMonthlyVAMP(m) }));
}

/**
 * Calculate the N-month rolling average VAMP ratio.
 * Uses the LAST n months (most recent data).
 *
 * @param {object[]} months  Array of monthly data with vampRatio attached
 * @param {number}   n       Window size (default 3)
 * @returns {{ ratio: number|null, windowMonths: object[], windowSize: number }}
 */
export function calculateRollingAverage(months, n = 3) {
  const withRatios = months.map((m) =>
    m.vampRatio !== undefined ? m : { ...m, vampRatio: calculateMonthlyVAMP(m) }
  );

  // Take last n months that have a valid ratio
  const valid = withRatios.filter((m) => m.vampRatio !== null);
  const window = valid.slice(-n);

  if (window.length === 0) return { ratio: null, windowMonths: [], windowSize: n };

  const sum = window.reduce((acc, m) => acc + m.vampRatio, 0);
  return {
    ratio: sum / window.length,
    windowMonths: window,
    windowSize: n,
    actualWindow: window.length,
  };
}

/**
 * Detect trend direction across a months array.
 *
 * Compares the most recent month's VAMP ratio against the oldest in the set.
 * Returns 'improving' | 'worsening' | 'stable' | 'insufficient_data'
 *
 * @param {object[]} months
 * @returns {{ direction: string, delta: number|null, label: string }}
 */
export function detectTrend(months) {
  const valid = months
    .map((m) => ({
      ...m,
      vampRatio: m.vampRatio ?? calculateMonthlyVAMP(m),
    }))
    .filter((m) => m.vampRatio !== null);

  if (valid.length < 2) {
    return { direction: 'insufficient_data', delta: null, label: 'Not enough data' };
  }

  const oldest = valid[0].vampRatio;
  const newest = valid[valid.length - 1].vampRatio;
  const delta = newest - oldest; // positive = worsening (ratio went up)

  const STABLE_BAND = 0.001; // ±0.1 percentage point
  let direction;
  if (Math.abs(delta) <= STABLE_BAND) {
    direction = 'stable';
  } else if (delta < 0) {
    direction = 'improving';
  } else {
    direction = 'worsening';
  }

  const deltaPct = (delta * 100).toFixed(2);
  const sign = delta > 0 ? '+' : '';
  return {
    direction,
    delta,
    label:
      direction === 'stable'
        ? 'Stable'
        : direction === 'improving'
        ? `Improving (${sign}${deltaPct}pp)`
        : `Worsening (+${Math.abs(parseFloat(deltaPct)).toFixed(2)}pp)`,
  };
}

/**
 * Build a complete trend summary object for use in charts and narrative.
 *
 * @param {object[]} months  Raw monthly data (vampRatio optional)
 * @returns {object}
 */
export function buildTrendSummary(months) {
  if (!months || months.length === 0) {
    return {
      months: [],
      rolling3Month: null,
      trend: { direction: 'insufficient_data', delta: null, label: 'Not enough data' },
      latest: null,
      hasMultipleMonths: false,
    };
  }

  const enriched = attachVAMPRatios(months);
  const rolling3Month = calculateRollingAverage(enriched, 3);
  const trend = detectTrend(enriched);
  const validMonths = enriched.filter((m) => m.vampRatio !== null);
  const latest = validMonths[validMonths.length - 1] ?? null;

  return {
    months: enriched,
    rolling3Month,
    trend,
    latest,
    hasMultipleMonths: validMonths.length > 1,
  };
}

/**
 * Format a month label from a JS Date or {year, monthIndex} object.
 *
 * @param {{ year: number, monthIndex: number }|Date} input
 * @returns {string}  e.g. 'Jan 2026'
 */
export function formatMonthLabel(input) {
  if (input instanceof Date) {
    return `${MONTH_NAMES[input.getMonth()]} ${input.getFullYear()}`;
  }
  const { year, monthIndex } = input;
  if (year == null || monthIndex == null) return 'Unknown';
  return `${MONTH_NAMES[monthIndex] ?? 'Month'} ${year}`;
}
