/**
 * Network programme thresholds — Visa VAMP and Mastercard ECP/EFM (2026).
 *
 * Sources:
 *  - Visa Acquirer Monitoring Programme (VAMP) bulletin, effective April 2026
 *  - Mastercard Excessive Chargeback Programme (ECP) and Excessive Fraud
 *    Merchant (EFM) programme guides, 2026 edition
 */

// ── Visa VAMP ────────────────────────────────────────────────────────────────
export const VISA_VAMP = {
  name: 'Visa VAMP',
  effectiveDate: 'April 1, 2026',
  formula: '(TC40 Fraud Reports + TC15 Disputes) / Total CNP Transactions',
  thresholds: {
    healthy: {
      label: 'Healthy',
      max: 0.009999,        // < 1.0%
      color: 'green',
      description: 'Below Visa warning level. No programme action.',
    },
    warning: {
      label: 'Warning',
      min: 0.010,           // ≥ 1.0%
      max: 0.014999,        // < 1.5%
      color: 'yellow',
      description:
        'Enrolled in VAMP Warning tier. Acquirer notification required. Remediation plan expected.',
      finePerItem: 0,       // Warning tier: no per-item fines yet, but acquirer pressure
    },
    excessive: {
      label: 'Excessive',
      min: 0.015,           // ≥ 1.5%
      color: 'red',
      description:
        'Enrolled in VAMP Excessive tier. Acquirer fines apply per TC40/TC15 item above threshold.',
      finePerItem: 10,      // USD per item exceeding threshold (indicative; varies by acquirer)
    },
  },
  notes: [
    'VAMP consolidates the former Visa Fraud Monitoring Programme (VFMP) and Visa Dispute Monitoring Programme (VDMP) into a single ratio effective April 2026.',
    'Merchants in excessive status for 4+ consecutive months face mandatory acquirer action.',
    'Ratio applies to Card-Not-Present (CNP/eCommerce) transactions only.',
  ],
};

// ── Mastercard ECP ───────────────────────────────────────────────────────────
export const MC_ECP = {
  name: 'Mastercard Excessive Chargeback Programme (ECP)',
  formula: 'Chargeback Count / Transaction Count (per calendar month)',
  thresholds: {
    healthy: {
      label: 'Healthy',
      maxRatio: 0.0149,     // < 1.5%
      maxCount: 99,
      color: 'green',
      description: 'No ECP enrolment.',
    },
    ecpWarning: {
      label: 'ECP – Chargeback Monitored Merchant (CMM)',
      minRatio: 0.015,      // ≥ 1.5%
      minCount: 100,
      maxRatio: 0.0199,
      color: 'yellow',
      description: 'CMM status. Acquirer monitoring intensifies; no fines yet.',
      finePerCB: 0,
    },
    ecpExcessive: {
      label: 'ECP – Excessive Chargeback Merchant (ECM)',
      minRatio: 0.020,      // ≥ 2.0%
      minCount: 100,
      color: 'red',
      description:
        'ECM status. Fines of $1,000–$5,000/month apply, escalating with duration.',
      fineMonthly: { month1: 1000, month2: 2000, month3: 5000, month4Plus: 25000 },
    },
    highExcessive: {
      label: 'ECP – High Excessive Chargeback Merchant (HECM)',
      minRatio: 0.020,
      minCount: 1000,       // 1,000+ chargebacks AND ≥ 2%
      color: 'red',
      description:
        'HECM status. Highest fine tier; potential card acceptance privilege revocation.',
      fineMonthly: { month1: 10000, month2: 25000, month3: 50000, month4Plus: 100000 },
    },
  },
};

// ── Mastercard EFM ───────────────────────────────────────────────────────────
export const MC_EFM = {
  name: 'Mastercard Excessive Fraud Merchant (EFM)',
  formula: 'TC40 Fraud Count / CNP Transaction Count  AND  Fraud Amount > $75,000/month',
  thresholds: {
    healthy: {
      label: 'Healthy',
      maxRatio: 0.0064,
      maxFraudAmount: 75000,
      color: 'green',
      description: 'Below EFM enrolment criteria.',
    },
    enrolled: {
      label: 'EFM Enrolled',
      minRatio: 0.0065,     // ≥ 0.65%  AND  fraud amount ≥ $75K
      minFraudAmount: 75000,
      color: 'red',
      description:
        'EFM enrolled. Fines apply per fraudulent transaction above threshold.',
      finePerItem: 0.25,    // USD per fraudulent CNP transaction
    },
  },
  notes: [
    'Both conditions must be met simultaneously (ratio AND amount) for EFM enrolment.',
    'EFM applies to Card-Not-Present (eCommerce) transactions only.',
  ],
};

// ── Combined status helper ────────────────────────────────────────────────────
export const PROGRAMME_STATUS = {
  HEALTHY:    { key: 'healthy',    label: 'Healthy',    color: 'green',  bg: 'bg-green-900/30',  border: 'border-green-500', text: 'text-green-400' },
  WARNING:    { key: 'warning',    label: 'Warning',    color: 'yellow', bg: 'bg-yellow-900/30', border: 'border-yellow-500', text: 'text-yellow-400' },
  EXCESSIVE:  { key: 'excessive',  label: 'Excessive',  color: 'red',    bg: 'bg-red-900/30',    border: 'border-red-500',    text: 'text-red-400' },
  CRITICAL:   { key: 'critical',   label: 'Critical',   color: 'red',    bg: 'bg-red-950/60',    border: 'border-red-600',    text: 'text-red-300' },
};

export const MCC_CODES = [
  { code: '5961', label: '5961 – Catalog / Mail-Order / Telephone-Order Merchants' },
  { code: '5999', label: '5999 – Miscellaneous Retail' },
  { code: '7372', label: '7372 – Software / SaaS' },
  { code: '7379', label: '7379 – Computer Maintenance & Repair' },
  { code: '7371', label: '7371 – Computer Programming Services' },
  { code: '5734', label: '5734 – Computer & Computer Software Stores' },
  { code: '5045', label: '5045 – Computers, Peripherals & Software (B2B)' },
  { code: '5912', label: '5912 – Drug Stores & Pharmacies' },
  { code: '5122', label: '5122 – Drugs, Drug Proprietaries & Druggists' },
  { code: '7995', label: '7995 – Betting / Casino Gambling' },
  { code: '5993', label: '5993 – Cigar Stores & Stands' },
  { code: '5912', label: '5912 – Health & Beauty' },
  { code: '4816', label: '4816 – Computer Network/Information Services' },
  { code: '5065', label: '5065 – Electronic Parts & Equipment' },
  { code: '8099', label: '8099 – Health Practitioners' },
  { code: '7389', label: '7389 – Services—Not Elsewhere Classified' },
  { code: '5411', label: '5411 – Grocery Stores & Supermarkets' },
  { code: '5812', label: '5812 – Eating Places & Restaurants' },
  { code: '4899', label: '4899 – Cable / Satellite TV & Radio Services' },
  { code: 'other', label: 'Other (specify in notes)' },
];
