/**
 * Bankability Score Engine
 *
 * Produces a 0–100 composite score representing how "bankable" the merchant
 * is from a payments risk perspective. It is a weighted average of:
 *
 *   50%  — VAMP / fraud ratio health (acquirer-adjusted)
 *   20%  — Mastercard ECP / EFM health
 *   30%  — Website compliance checklist
 *
 * Score → Letter Grade:
 *   90–100  A+   Excellent – bankable with most acquirers
 *   80–89   A    Good – bankable with Tier 1/2 acquirers
 *   70–79   B    Fair – manageable with remediation plan
 *   60–69   C    Poor – Tier 2/3 acquirers only; immediate action needed
 *   50–59   D    At Risk – high likelihood of account termination
 *   0–49    F    Unbanked – remediation required before re-application
 */

import { PROGRAMME_STATUS } from '../data/thresholds.js';
import { getAcquirerById } from '../data/acquirers.js';

// ── VAMP sub-score ────────────────────────────────────────────────────────────

/**
 * Convert VAMP ratio to a 0–100 sub-score using acquirer-adjusted thresholds.
 * The score degrades linearly between healthy→warning→excessive, then
 * drops sharply beyond excessive.
 */
function vampSubScore(vampResult) {
  // Zero chargebacks AND zero fraud → VAMP is definitively 0% → perfect score
  if (vampResult?.tc40Count === 0 && vampResult?.tc15Count === 0) return 100;
  if (!vampResult || vampResult.cnpTxnCount <= 0) return 75; // neutral if no data

  const { ratio, effectiveWarning, effectiveExcessive } = vampResult;

  if (ratio <= 0) return 100;

  if (ratio < effectiveWarning) {
    // Healthy: 100 at 0%, degrades to 70 at the warning boundary
    return Math.round(100 - ((ratio / effectiveWarning) * 30));
  }
  if (ratio < effectiveExcessive) {
    // Warning band: 70 → 30
    const fraction = (ratio - effectiveWarning) / (effectiveExcessive - effectiveWarning);
    return Math.round(70 - fraction * 40);
  }
  // Excessive: 30 → 0 (caps at 2× excessive threshold)
  const fraction = Math.min(1, (ratio - effectiveExcessive) / effectiveExcessive);
  return Math.round(30 - fraction * 30);
}

// ── ECP/EFM sub-score ─────────────────────────────────────────────────────────

function ecpSubScore(ecpResult) {
  if (!ecpResult) return 75; // neutral

  switch (ecpResult.status?.key) {
    case 'healthy':   return 100;
    case 'warning':   return 55;
    case 'excessive': return 20;
    case 'critical':  return 5;
    default:          return 75;
  }
}

function efmSubScore(efmResult) {
  if (!efmResult) return 75;
  if (efmResult.enrolled) return 15;
  if (efmResult.ratioBreached || efmResult.amountBreached) return 50;
  return 100;
}

// ── Website checklist sub-score ───────────────────────────────────────────────

const CHECKLIST_WEIGHTS = {
  hasTermsAndConditions:   { weight: 15, label: 'Terms & Conditions present' },
  termsEasyToFind:         { weight: 10, label: 'T&Cs easy to find (above fold / linked in footer)' },
  hasRefundPolicy:         { weight: 15, label: 'Refund / cancellation policy present' },
  refundPolicyVisible:     { weight: 10, label: 'Refund policy visible before checkout' },
  hasOneClickCancellation: { weight: 15, label: '1-click / easy cancellation mechanism' },
  has3DS2:                 { weight: 20, label: '3DS 2.x authentication enabled' },
  mccMatchesDescriptor:    { weight: 10, label: 'Billing descriptor matches MCC & website' },
  hasContactInfo:          { weight: 3,  label: 'Customer support contact visible' },
  hasPhysicalAddress:      { weight: 2,  label: 'Physical business address displayed' },
};

export { CHECKLIST_WEIGHTS };

/**
 * Score the website checklist.
 * Returns score: null when no items have been answered (not assessed).
 * @param {object} checklist – key/value matching CHECKLIST_WEIGHTS keys
 * @returns {{ score: number|null, breakdown: object[], totalWeight: number, answeredCount: number }}
 */
export function scoreChecklist(checklist) {
  let earned = 0;
  let answeredCount = 0;
  const totalWeight = Object.values(CHECKLIST_WEIGHTS).reduce((s, v) => s + v.weight, 0);

  const breakdown = Object.entries(CHECKLIST_WEIGHTS).map(([key, cfg]) => {
    const val = checklist[key];
    const answered = val !== null && val !== undefined;
    const passed = Boolean(val);
    if (answered) answeredCount++;
    if (passed) earned += cfg.weight;
    return { key, label: cfg.label, weight: cfg.weight, passed, answered };
  });

  return {
    score: answeredCount > 0 ? Math.round((earned / totalWeight) * 100) : null,
    earned,
    totalWeight,
    breakdown,
    answeredCount,
  };
}

// ── Composite bankability score ───────────────────────────────────────────────

/**
 * Calculate the composite Bankability Score.
 *
 * @param {object} params
 * @param {object} params.vampResult   – from analyzeVAMP()
 * @param {object} params.ecpResult    – from calculateECP()
 * @param {object} params.efmResult    – from calculateEFM()
 * @param {object} params.checklist    – website checklist object
 * @returns {object} Full bankability analysis
 */
export function calculateBankabilityScore({ vampResult, ecpResult, efmResult, checklist }) {
  const vScore = vampSubScore(vampResult);
  const cScore = ecpSubScore(ecpResult);
  const fScore = efmSubScore(efmResult);
  const { score: wScore, breakdown: checklistBreakdown, earned: checklistEarned, totalWeight: checklistTotal, answeredCount } =
    scoreChecklist(checklist ?? {});

  const websiteAssessed = answeredCount > 0;
  const mcScore = Math.round((cScore + fScore) / 2);

  // When website not assessed: reweight VAMP 71.4% / MC 28.6% (50:20 normalised to 100%)
  // When assessed: VAMP 50%, MC 20%, Website 30%
  const composite = websiteAssessed
    ? Math.round(vScore * 0.50 + mcScore * 0.20 + (wScore ?? 0) * 0.30)
    : Math.round(vScore * 0.714 + mcScore * 0.286);

  const grade = gradeFromScore(composite);
  const verdict = verdictFromScore(composite);

  return {
    composite,
    grade,
    verdict,
    websiteAssessed,
    answeredCount,
    components: {
      vamp:       { score: vScore,       weight: websiteAssessed ? 0.50  : 0.714, label: 'Visa VAMP Health' },
      mastercard: { score: mcScore,      weight: websiteAssessed ? 0.20  : 0.286, label: 'Mastercard Network Health' },
      website:    { score: wScore ?? 0,  weight: websiteAssessed ? 0.30  : 0,     label: 'Website Compliance' },
    },
    checklistBreakdown,
    checklistEarned,
    checklistTotal,
    recommendations: buildRecommendations({ vampResult, ecpResult, efmResult, checklist, wScore: wScore ?? 0 }),
  };
}

function gradeFromScore(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function verdictFromScore(score) {
  if (score >= 90) return { label: 'Excellent', color: 'green',  description: 'Bankable with most Tier 1 & Tier 2 acquirers. Maintain current practices.' };
  if (score >= 80) return { label: 'Good',      color: 'green',  description: 'Bankable with Tier 1 & Tier 2 acquirers. Minor improvements recommended.' };
  if (score >= 70) return { label: 'Fair',       color: 'yellow', description: 'Bankable with Tier 2 acquirers. Remediation plan advisable within 60 days.' };
  if (score >= 60) return { label: 'Poor',       color: 'orange', description: 'Tier 2 / Tier 3 acquirers only. Immediate corrective action required.' };
  if (score >= 50) return { label: 'At Risk',    color: 'red',    description: 'High risk of account termination. Urgent remediation required.' };
  return                  { label: 'Unbanked',   color: 'red',    description: 'Account termination likely imminent. Restructuring required before re-application.' };
}

function buildRecommendations({ vampResult, ecpResult, efmResult, checklist, wScore }) {
  const recs = [];

  // VAMP recommendations
  if (vampResult) {
    const { ratio, effectiveWarning, effectiveExcessive, acquirer } = vampResult;
    if (ratio >= effectiveExcessive) {
      recs.push({
        priority: 'critical',
        category: 'Fraud & Disputes',
        action: 'Immediately implement 3DS 2.x and velocity fraud rules. Deploy chargeback alerts (Ethoca/Verifi) to intercept disputes before they become chargebacks. Target a 30% reduction in TC40+TC15 within 60 days.',
      });
    } else if (ratio >= effectiveWarning) {
      recs.push({
        priority: 'high',
        category: 'Fraud & Disputes',
        action: "VAMP ratio is above your acquirer's internal threshold. Enroll in Verifi Order Insight and Ethoca Alerts. Review fraud rules and consider RDR (Rapid Dispute Resolution) enrollment.",
      });
    } else if (ratio >= effectiveWarning * 0.7) {
      recs.push({
        priority: 'medium',
        category: 'Fraud & Disputes',
        action: 'VAMP ratio is approaching acquirer warning levels. Monitor monthly and consider proactive chargeback alert enrollment.',
      });
    }
  }

  // ECP recommendations
  if (ecpResult && ecpResult.status?.key !== 'healthy') {
    recs.push({
      priority: ecpResult.status.key === 'warning' ? 'high' : 'critical',
      category: 'Mastercard ECP',
      action: `ECP status is "${ecpResult.status.label}". Dispute rate of ${ecpResult.percentage}% must be reduced below 1.5%. Improve customer service response times, clarify billing descriptors, and implement pre-dispute resolution tools.`,
    });
  }

  // EFM recommendations
  if (efmResult?.enrolled) {
    recs.push({
      priority: 'critical',
      category: 'Mastercard EFM',
      action: 'EFM enrolled. Fraud rate and amount both exceed Mastercard thresholds. Mandatory 3DS 2.x deployment, velocity controls, and geo-blocking of high-risk regions required immediately.',
    });
  }

  // Website checklist gaps — only when user explicitly answered 'No' (=== false)
  // null/undefined means "not yet assessed" — no recommendation generated
  if (checklist?.has3DS2 === false) {
    recs.push({
      priority: 'high',
      category: 'Website – Authentication',
      action: 'Deploy 3DS 2.x (3D Secure) on all eCommerce transactions. This is the single highest-impact fraud reduction measure and is required by Visa/Mastercard mandates.',
    });
  }
  if (checklist?.hasOneClickCancellation === false) {
    recs.push({
      priority: 'high',
      category: 'Website – Cancellation',
      action: 'Add a self-service cancellation mechanism (1-click or clearly accessible online). This is required by FTC regulations (ROSCA) and significantly reduces chargebacks.',
    });
  }
  if (checklist?.hasTermsAndConditions === false || checklist?.termsEasyToFind === false) {
    recs.push({
      priority: 'high',
      category: 'Website – Legal Compliance',
      action: 'Terms & Conditions must be prominently linked before the point of purchase. Absent or hidden T&Cs are a leading cause of "not as described" chargebacks.',
    });
  }
  if (checklist?.hasRefundPolicy === false || checklist?.refundPolicyVisible === false) {
    recs.push({
      priority: 'medium',
      category: 'Website – Refund Policy',
      action: 'Display refund policy clearly on the checkout page and product description page. Ambiguous refund terms drive "not satisfied" chargeback reason codes.',
    });
  }
  if (checklist?.mccMatchesDescriptor === false) {
    recs.push({
      priority: 'high',
      category: 'Website – Descriptor',
      action: 'Billing descriptor and MCC code must accurately match the products/services sold. Mismatches create "unrecognized transaction" chargebacks and trigger network audits.',
    });
  }

  // Sort by priority
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return recs.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9));
}
