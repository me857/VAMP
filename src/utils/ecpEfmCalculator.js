/**
 * Mastercard ECP & EFM Calculation Engine — 2026
 *
 * ECP  = Chargeback Count / Transaction Count  (per calendar month)
 *        Enrolled if ratio ≥ 1.5% AND count ≥ 100
 *
 * EFM  = TC40 Fraud Count / CNP Transaction Count  (per calendar month)
 *        Enrolled if ratio ≥ 0.65% AND fraud amount ≥ $75,000
 */

import { MC_ECP, MC_EFM, PROGRAMME_STATUS } from '../data/thresholds.js';

/**
 * Calculate Mastercard ECP status.
 *
 * @param {object} params
 * @param {number} params.chargebackCount  – Total chargeback count (TC15-equivalent)
 * @param {number} params.totalTxnCount    – Total transaction count (CP + CNP)
 * @returns {object} ECP result
 */
export function calculateECP({ chargebackCount = 0, totalTxnCount = 0 }) {
  if (totalTxnCount <= 0) {
    return {
      ratio: 0,
      percentage: '0.0000',
      status: PROGRAMME_STATUS.HEALTHY,
      tier: MC_ECP.thresholds.healthy,
      monthlyFineEstimate: 0,
      error: 'Transaction count must be greater than zero.',
    };
  }

  const ratio = chargebackCount / totalTxnCount;
  const percentage = (ratio * 100).toFixed(4);
  const { thresholds } = MC_ECP;

  let status;
  let tier;
  let monthlyFineEstimate = 0;

  if (chargebackCount >= thresholds.highExcessive.minCount && ratio >= thresholds.highExcessive.minRatio) {
    status = PROGRAMME_STATUS.CRITICAL;
    tier = thresholds.highExcessive;
    monthlyFineEstimate = thresholds.highExcessive.fineMonthly.month1;
  } else if (ratio >= thresholds.ecpExcessive.minRatio && chargebackCount >= thresholds.ecpExcessive.minCount) {
    status = PROGRAMME_STATUS.EXCESSIVE;
    tier = thresholds.ecpExcessive;
    monthlyFineEstimate = thresholds.ecpExcessive.fineMonthly.month1;
  } else if (ratio >= thresholds.ecpWarning.minRatio && chargebackCount >= thresholds.ecpWarning.minCount) {
    status = PROGRAMME_STATUS.WARNING;
    tier = thresholds.ecpWarning;
    monthlyFineEstimate = 0;
  } else {
    status = PROGRAMME_STATUS.HEALTHY;
    tier = thresholds.healthy;
    monthlyFineEstimate = 0;
  }

  const distanceToCMM =
    ratio < thresholds.ecpWarning.minRatio
      ? ((thresholds.ecpWarning.minRatio - ratio) * 100).toFixed(3)
      : null;

  return {
    ratio,
    percentage,
    chargebackCount,
    totalTxnCount,
    status,
    tier,
    monthlyFineEstimate,
    distanceToCMM,
    programName: MC_ECP.name,
  };
}

/**
 * Calculate Mastercard EFM status.
 *
 * @param {object} params
 * @param {number} params.fraudCount      – TC40 fraud count
 * @param {number} params.cnpTxnCount     – CNP transaction count
 * @param {number} params.fraudAmountUSD  – Total fraud dollar amount (USD)
 * @returns {object} EFM result
 */
export function calculateEFM({ fraudCount = 0, cnpTxnCount = 0, fraudAmountUSD = 0 }) {
  if (cnpTxnCount <= 0) {
    return {
      ratio: 0,
      percentage: '0.0000',
      status: PROGRAMME_STATUS.HEALTHY,
      tier: MC_EFM.thresholds.healthy,
      enrolled: false,
      fineEstimate: 0,
      error: 'CNP transaction count must be greater than zero.',
    };
  }

  const ratio = fraudCount / cnpTxnCount;
  const percentage = (ratio * 100).toFixed(4);
  const { thresholds } = MC_EFM;

  const ratioBreached = ratio >= thresholds.enrolled.minRatio;
  const amountBreached = fraudAmountUSD >= thresholds.enrolled.minFraudAmount;
  const enrolled = ratioBreached && amountBreached;

  let status;
  let tier;
  let fineEstimate = 0;

  if (enrolled) {
    status = PROGRAMME_STATUS.EXCESSIVE;
    tier = thresholds.enrolled;
    // Fine applies to fraud items above threshold
    const thresholdItems = Math.floor(thresholds.enrolled.minRatio * cnpTxnCount);
    const itemsAbove = Math.max(0, fraudCount - thresholdItems);
    fineEstimate = itemsAbove * thresholds.enrolled.finePerItem;
  } else {
    status = PROGRAMME_STATUS.HEALTHY;
    tier = thresholds.healthy;
  }

  return {
    ratio,
    percentage,
    fraudCount,
    cnpTxnCount,
    fraudAmountUSD,
    status,
    tier,
    enrolled,
    ratioBreached,
    amountBreached,
    fineEstimate,
    programName: MC_EFM.name,
  };
}
