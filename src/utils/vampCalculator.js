/**
 * VAMP Calculation Engine — Visa VAMP (April 2026)
 *
 * VAMP Ratio = (TC40 Fraud Count + TC15 Dispute Count) / Total CNP Transactions
 *
 * This module also applies acquirer-adjusted risk grading, which is the
 * key differentiator of this tool versus a plain Visa lookup.
 */

import { VISA_VAMP, PROGRAMME_STATUS } from '../data/thresholds.js';
import { getAcquirerById } from '../data/acquirers.js';

/**
 * Calculate raw VAMP ratio and Visa programme status.
 *
 * @param {object} params
 * @param {number} params.tc40Count       – Fraud reports (TC40)
 * @param {number} params.tc15Count       – Disputes / chargebacks (TC15)
 * @param {number} params.cnpTxnCount     – Total CNP / eCommerce transactions
 * @returns {object} Detailed VAMP result
 */
export function calculateVAMP({ tc40Count = 0, tc15Count = 0, cnpTxnCount = 0 }) {
  if (cnpTxnCount <= 0) {
    return {
      ratio: 0,
      percentage: '0.000',
      tc40Count,
      tc15Count,
      cnpTxnCount,
      visaStatus: PROGRAMME_STATUS.HEALTHY,
      visaThreshold: VISA_VAMP.thresholds.healthy,
      acquirerStatus: PROGRAMME_STATUS.HEALTHY,
      distanceToWarning: null,
      distanceToExcessive: null,
      itemsAboveThreshold: 0,
      estimatedMonthlyFine: 0,
      error: 'CNP transaction count must be greater than zero.',
    };
  }

  const combined = tc40Count + tc15Count;
  const ratio = combined / cnpTxnCount;
  const percentage = (ratio * 100).toFixed(4);

  // Visa published status
  let visaThreshold;
  let visaStatus;
  if (ratio >= VISA_VAMP.thresholds.excessive.min) {
    visaThreshold = VISA_VAMP.thresholds.excessive;
    visaStatus = PROGRAMME_STATUS.EXCESSIVE;
  } else if (ratio >= VISA_VAMP.thresholds.warning.min) {
    visaThreshold = VISA_VAMP.thresholds.warning;
    visaStatus = PROGRAMME_STATUS.WARNING;
  } else {
    visaThreshold = VISA_VAMP.thresholds.healthy;
    visaStatus = PROGRAMME_STATUS.HEALTHY;
  }

  // Distance to thresholds
  const warningThreshold = VISA_VAMP.thresholds.warning.min; // 1.0%
  const excessiveThreshold = VISA_VAMP.thresholds.excessive.min; // 1.5%

  const distanceToWarning =
    ratio < warningThreshold
      ? ((warningThreshold - ratio) * 100).toFixed(3)
      : null;

  const distanceToExcessive =
    ratio < excessiveThreshold
      ? ((excessiveThreshold - ratio) * 100).toFixed(3)
      : null;

  // Estimated fine (excessive tier only)
  const itemsAboveThreshold =
    ratio >= excessiveThreshold
      ? Math.max(0, combined - Math.floor(excessiveThreshold * cnpTxnCount))
      : 0;
  const estimatedMonthlyFine =
    itemsAboveThreshold * VISA_VAMP.thresholds.excessive.finePerItem;

  return {
    ratio,
    percentage,
    tc40Count,
    tc15Count,
    cnpTxnCount,
    combined,
    visaStatus,
    visaThreshold,
    distanceToWarning,
    distanceToExcessive,
    itemsAboveThreshold,
    estimatedMonthlyFine,
    acquirerStatus: null, // set separately via applyAcquirerAdjustment
  };
}

/**
 * Overlay acquirer-specific risk grading on top of the base VAMP result.
 * Tier 1 banks have tighter internal caps; at 0.8% with Chase, for example,
 * the risk grade is CRITICAL even though Visa says it's still "Healthy."
 *
 * @param {object} vampResult   – result from calculateVAMP()
 * @param {string} acquirerId   – id from acquirers.js
 * @returns {object} Updated result with acquirerStatus and riskGrade
 */
export function applyAcquirerAdjustment(vampResult, acquirerId) {
  const acquirer = getAcquirerById(acquirerId);
  const ratio = vampResult.ratio;

  let acquirerStatus;
  let riskGrade;
  let acquirerNote = acquirer.notes;

  if (ratio >= acquirer.effectiveExcessive) {
    acquirerStatus = PROGRAMME_STATUS.CRITICAL;
    riskGrade = 'F';
    acquirerNote =
      `⚠ CRITICAL for ${acquirer.name}: Ratio ${(ratio * 100).toFixed(3)}% ` +
      `exceeds their effective excessive threshold of ${(acquirer.effectiveExcessive * 100).toFixed(2)}%. ` +
      `Expect merchant account termination or forced reserve escalation. ` + acquirer.notes;
  } else if (ratio >= acquirer.effectiveWarning) {
    acquirerStatus = PROGRAMME_STATUS.WARNING;
    riskGrade = ratio >= acquirer.effectiveWarning * 1.5 ? 'D' : 'C';
    acquirerNote =
      `⚠ WARNING for ${acquirer.name}: Ratio ${(ratio * 100).toFixed(3)}% ` +
      `exceeds their internal warning threshold of ${(acquirer.effectiveWarning * 100).toFixed(2)}%. ` +
      `Remediation plan or reserve increase expected. ` + acquirer.notes;
  } else {
    acquirerStatus = PROGRAMME_STATUS.HEALTHY;
    riskGrade = ratio < acquirer.effectiveWarning * 0.5 ? 'A' : 'B';
    acquirerNote =
      `✓ ${acquirer.name}: Ratio ${(ratio * 100).toFixed(3)}% is below their ` +
      `effective warning threshold of ${(acquirer.effectiveWarning * 100).toFixed(2)}%. ` + acquirer.notes;
  }

  return {
    ...vampResult,
    acquirer,
    acquirerStatus,
    riskGrade,
    acquirerNote,
    effectiveWarning: acquirer.effectiveWarning,
    effectiveExcessive: acquirer.effectiveExcessive,
  };
}

/**
 * Full VAMP analysis in one call.
 *
 * @param {object} params
 * @param {number} params.tc40Count
 * @param {number} params.tc15Count
 * @param {number} params.cnpTxnCount
 * @param {string} params.acquirerId
 */
export function analyzeVAMP({ tc40Count, tc15Count, cnpTxnCount, acquirerId }) {
  const base = calculateVAMP({ tc40Count, tc15Count, cnpTxnCount });
  return applyAcquirerAdjustment(base, acquirerId ?? 'other');
}
