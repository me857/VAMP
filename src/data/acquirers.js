/**
 * Acquirer database with tier classification and adjusted risk thresholds.
 *
 * Tier 1 banks maintain portfolio-wide VAMP caps well below Visa's published
 * 1.0% warning threshold. These institutions will exit a merchant relationship
 * proactively to protect their own network standing.
 *
 * Tier 2 / specialty acquirers tolerate higher individual merchant ratios but
 * still enforce network-mandated programme limits.
 */

export const ACQUIRER_TIERS = {
  TIER_1: 1,
  TIER_2: 2,
  TIER_3: 3, // High-risk specialist / offshore
};

export const ACQUIRERS = [
  // ── Tier 1: Major US banks ──────────────────────────────────────────────
  {
    id: 'chase',
    name: 'Chase Paymentech',
    tier: ACQUIRER_TIERS.TIER_1,
    riskAppetite: 'low',
    // Internal portfolio cap forces action well before Visa's published limits
    effectiveWarning: 0.005,   // 0.50%
    effectiveExcessive: 0.008, // 0.80%
    notes:
      'Tier 1 portfolio-wide VAMP cap ≈ 0.5%. Relationships reviewed at 0.5%; termination likely at 0.8%.',
  },
  {
    id: 'wells',
    name: 'Wells Fargo Merchant Services',
    tier: ACQUIRER_TIERS.TIER_1,
    riskAppetite: 'low',
    effectiveWarning: 0.005,
    effectiveExcessive: 0.010,
    notes:
      'Tier 1. Proactive merchant review at 0.5%. Tends to offer remediation plans before exit.',
  },
  {
    id: 'bofa',
    name: 'Bank of America Merchant Services',
    tier: ACQUIRER_TIERS.TIER_1,
    riskAppetite: 'low',
    effectiveWarning: 0.005,
    effectiveExcessive: 0.010,
    notes:
      'Tier 1. Conservative risk posture. Cross-sells to other BofA products so exits merchants quickly.',
  },
  {
    id: 'usbank',
    name: 'U.S. Bank (Elavon)',
    tier: ACQUIRER_TIERS.TIER_1,
    riskAppetite: 'low',
    effectiveWarning: 0.006,
    effectiveExcessive: 0.010,
    notes: 'Tier 1 via Elavon subsidiary. Slightly more flexibility than pure money-center banks.',
  },
  {
    id: 'citi',
    name: 'Citibank Merchant Services',
    tier: ACQUIRER_TIERS.TIER_1,
    riskAppetite: 'low',
    effectiveWarning: 0.005,
    effectiveExcessive: 0.009,
    notes: 'Tier 1. Rapid exit for merchants above internal 0.5% threshold.',
  },

  // ── Tier 2: Mid-market & specialty acquirers ────────────────────────────
  {
    id: 'merrick',
    name: 'Merrick Bank',
    tier: ACQUIRER_TIERS.TIER_2,
    riskAppetite: 'medium',
    effectiveWarning: 0.008,
    effectiveExcessive: 0.013,
    notes:
      'Tier 2. Accepts higher-risk verticals. Will place merchants on remediation plans; monitoring fee may apply.',
  },
  {
    id: 'esquire',
    name: 'Esquire Bank',
    tier: ACQUIRER_TIERS.TIER_2,
    riskAppetite: 'medium',
    effectiveWarning: 0.008,
    effectiveExcessive: 0.013,
    notes:
      'Tier 2. Boutique bank focused on legal/professional. Stricter on reputational risk.',
  },
  {
    id: 'paysafe',
    name: 'Paysafe / iPayment',
    tier: ACQUIRER_TIERS.TIER_2,
    riskAppetite: 'medium-high',
    effectiveWarning: 0.009,
    effectiveExcessive: 0.014,
    notes: 'Tier 2. Broader MCC acceptance. Rolling reserve common for elevated merchants.',
  },
  {
    id: 'nmi',
    name: 'NMI / Bams',
    tier: ACQUIRER_TIERS.TIER_2,
    riskAppetite: 'medium',
    effectiveWarning: 0.008,
    effectiveExcessive: 0.013,
    notes: 'Tier 2. Technology-first acquirer; risk managed via ISO partner agreements.',
  },
  {
    id: 'priority',
    name: 'Priority Commerce',
    tier: ACQUIRER_TIERS.TIER_2,
    riskAppetite: 'medium',
    effectiveWarning: 0.009,
    effectiveExcessive: 0.014,
    notes: 'Tier 2. Growing mid-market acquirer with reasonable risk appetite.',
  },

  // ── Tier 3: High-risk specialists ───────────────────────────────────────
  {
    id: 'durango',
    name: 'Durango Merchant Services',
    tier: ACQUIRER_TIERS.TIER_3,
    riskAppetite: 'high',
    effectiveWarning: 0.010, // At Visa's published warning
    effectiveExcessive: 0.015,
    notes:
      'Tier 3 high-risk specialist. Will process up to published Visa limits but charges significant reserves/fees.',
  },
  {
    id: 'paykings',
    name: 'PayKings',
    tier: ACQUIRER_TIERS.TIER_3,
    riskAppetite: 'high',
    effectiveWarning: 0.010,
    effectiveExcessive: 0.015,
    notes: 'Tier 3. High-risk specialist. Reserve requirements are standard.',
  },
  {
    id: 'instabill',
    name: 'Instabill',
    tier: ACQUIRER_TIERS.TIER_3,
    riskAppetite: 'high',
    effectiveWarning: 0.010,
    effectiveExcessive: 0.015,
    notes: 'Tier 3. Offshore-friendly specialist. Monitor for card scheme fines passthrough.',
  },

  // ── Catch-all ────────────────────────────────────────────────────────────
  {
    id: 'other',
    name: 'Other / Unknown',
    tier: ACQUIRER_TIERS.TIER_2,
    riskAppetite: 'medium',
    effectiveWarning: 0.010,
    effectiveExcessive: 0.015,
    notes:
      'Using Visa published thresholds as a conservative default. Verify actual acquirer limits.',
  },
];

export const getAcquirerById = (id) =>
  ACQUIRERS.find((a) => a.id === id) ?? ACQUIRERS.find((a) => a.id === 'other');

export const TIER_LABELS = {
  [ACQUIRER_TIERS.TIER_1]: 'Tier 1 — Major Bank',
  [ACQUIRER_TIERS.TIER_2]: 'Tier 2 — Specialty Acquirer',
  [ACQUIRER_TIERS.TIER_3]: 'Tier 3 — High-Risk Specialist',
};

export const TIER_COLORS = {
  [ACQUIRER_TIERS.TIER_1]: 'text-red-400',    // Most restrictive = most dangerous if ratio creeps up
  [ACQUIRER_TIERS.TIER_2]: 'text-yellow-400',
  [ACQUIRER_TIERS.TIER_3]: 'text-green-400',  // Most lenient thresholds
};
