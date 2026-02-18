import React from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, Minus, CheckCircle, Info } from 'lucide-react';

// ── Narrative engine ───────────────────────────────────────────────────────

/**
 * Build a structured narrative based on VAMP ratio, trend, and MC status.
 *
 * @param {{ vampRatio, trend, ecpResult, efmResult, acquirerGrade }} params
 * @returns {{ severity: string, icon, colour: string, headline: string, body: string[], actions: string[] }}
 */
function buildNarrative({ vampRatio, trend, ecpResult, efmResult, acquirerGrade }) {
  const ratio   = vampRatio ?? 0;
  const dir     = trend?.direction ?? 'insufficient_data';
  const rolling = trend?.rolling3Month?.ratio ?? null;

  const isExcessive = ratio >= 0.015;
  const isWarning   = ratio >= 0.010 && !isExcessive;
  const isHealthy   = ratio < 0.010;

  // ── Excessive ──────────────────────────────────────────────────────────
  if (isExcessive) {
    const body = [
      `Your VAMP ratio of ${(ratio * 100).toFixed(2)}% exceeds Visa's Excessive threshold of 1.50% (effective April 2026). ` +
      `At this level, Visa may escalate your account to Excessive status, triggering enhanced monitoring and monthly fines.`,
    ];
    if (dir === 'worsening') {
      body.push(
        `Trend analysis shows your ratio is worsening month-over-month. Immediate intervention is required before the next billing cycle.`
      );
    } else if (dir === 'improving') {
      body.push(
        `The trend is improving — your remediation efforts are beginning to show results. Maintain momentum to exit the Excessive tier.`
      );
    }
    if (rolling !== null && rolling >= 0.015) {
      body.push(
        `The 3-month rolling average VAMP of ${(rolling * 100).toFixed(2)}% confirms this is not a one-off spike.`
      );
    }
    if (ecpResult?.status !== 'HEALTHY') {
      body.push(`Mastercard ECP status is also elevated. Dual-network monitoring compounds risk of acquirer termination.`);
    }
    return {
      severity: 'critical',
      colour:   'red',
      headline: 'Urgent: Excessive VAMP — Immediate Action Required',
      body,
      actions: [
        "Engage your acquirer's risk team within 48 hours.",
        'Implement enhanced 3D Secure 2 (EMV 3DS) for all CNP transactions immediately.',
        'Audit and tighten your fraud detection and order velocity rules.',
        'Review chargeback representment procedures — recover winnable disputes.',
        'Consider temporarily restricting high-risk BIN ranges or geographies.',
        'Document all remediation steps for acquirer submission.',
      ],
    };
  }

  // ── Warning ────────────────────────────────────────────────────────────
  if (isWarning) {
    const body = [
      `Your VAMP ratio of ${(ratio * 100).toFixed(2)}% has crossed Visa's Warning threshold of 1.00%. ` +
      `You are in the Warning tier — Visa will begin monitoring your account and may impose fines if the ratio is not reduced.`,
    ];
    if (dir === 'worsening') {
      body.push(
        `Month-over-month the ratio is trending upward. Without intervention, breach of the 1.50% Excessive threshold is likely within 1–2 billing cycles.`
      );
    } else if (dir === 'stable') {
      body.push(
        `The ratio appears stable but above the Warning line. Stabilisation alone will not exit you from monitoring — active reduction is needed.`
      );
    } else if (dir === 'improving') {
      body.push(
        `The trend is improving. Continue current remediation efforts and aim to fall below 1.00% within the next billing period.`
      );
    }
    if (acquirerGrade === 'WARNING' || acquirerGrade === 'CRITICAL') {
      body.push(
        `Your acquirer applies tighter internal thresholds. At this ratio, you may already be in breach of your acquirer agreement independently of Visa's programme.`
      );
    }
    return {
      severity: 'warning',
      colour:   'amber',
      headline: 'Warning: VAMP Ratio Requires Attention',
      body,
      actions: [
        'Activate 3DS2 on all eligible CNP transactions — target 100% coverage.',
        'Review your refund policy: ensure it is visible, clear, and honoured promptly.',
        'Investigate the root cause of TC40 fraud reports and TC15 chargebacks separately.',
        'Implement AVS and CVV2 checks if not already enforced.',
        'Schedule a monthly VAMP review with your risk team.',
        'Prepare a written remediation plan to present to your acquirer proactively.',
      ],
    };
  }

  // ── Healthy ────────────────────────────────────────────────────────────
  const body = [
    `Your VAMP ratio of ${(ratio * 100).toFixed(2)}% is within Visa's healthy range (below 1.00%). ` +
    `You are not currently subject to Visa's monitoring programme thresholds.`,
  ];
  if (dir === 'worsening') {
    body.push(
      `Despite a healthy current ratio, the trend shows month-over-month deterioration. Investigate now before the ratio approaches the 1.00% Warning line.`
    );
  } else if (dir === 'improving') {
    body.push(`The trend is improving — your current controls are effective. Maintain these practices.`);
  } else if (dir === 'stable') {
    body.push(`Your ratio is stable. Continue monitoring monthly and ensure fraud controls remain current.`);
  }
  if (ratio < 0.005) {
    body.push(
      `At ${(ratio * 100).toFixed(2)}% you have significant buffer to the Warning threshold. Focus on maintaining this through 3DS2 adoption and chargeback management.`
    );
  }

  return {
    severity: 'healthy',
    colour:   'green',
    headline: ratio === 0 ? 'Insufficient Data — Enter Transaction Figures' : 'Healthy: VAMP Within Acceptable Limits',
    body,
    actions:
      ratio === 0
        ? ['Upload a processing statement or enter transaction data to generate your analysis.']
        : [
            'Continue monthly VAMP monitoring as standard practice.',
            'Maintain 3DS2 on all CNP transactions for best-practice fraud deflection.',
            'Ensure your refund policy and contact information are clearly visible on your website.',
            'Review your website compliance checklist items for a higher Bankability Score.',
          ],
  };
}

// ── Colour map ─────────────────────────────────────────────────────────────

const COLOUR_MAP = {
  red: {
    bg:     'bg-red-950/30',
    border: 'border-red-800/50',
    title:  'text-red-300',
    body:   'text-red-200/80',
    bullet: 'bg-red-500',
    tag:    'bg-red-900/50 text-red-300 border-red-700',
  },
  amber: {
    bg:     'bg-amber-950/20',
    border: 'border-amber-700/40',
    title:  'text-amber-300',
    body:   'text-amber-100/80',
    bullet: 'bg-amber-400',
    tag:    'bg-amber-900/40 text-amber-300 border-amber-700',
  },
  green: {
    bg:     'bg-emerald-950/20',
    border: 'border-emerald-700/30',
    title:  'text-emerald-300',
    body:   'text-emerald-100/80',
    bullet: 'bg-emerald-400',
    tag:    'bg-emerald-900/30 text-emerald-300 border-emerald-700',
  },
};

const TREND_ICONS = {
  worsening:         <TrendingUp   size={12} className="text-red-400" />,
  improving:         <TrendingDown size={12} className="text-green-400" />,
  stable:            <Minus        size={12} className="text-slate-400" />,
  insufficient_data: <Info         size={12} className="text-slate-500" />,
};

// ── Component ──────────────────────────────────────────────────────────────

export default function MentorAnalysis({ vampResult, trendSummary, ecpResult, efmResult }) {
  const ratio        = vampResult?.vampRatio ?? 0;
  const acquirerGrade = vampResult?.acquirerGrade;
  const trend        = trendSummary;
  const trendDir     = trend?.trend?.direction ?? 'insufficient_data';
  const rolling      = trend?.rolling3Month?.ratio ?? null;

  const narrative = buildNarrative({ vampRatio: ratio, trend: trend?.trend, ecpResult, efmResult, acquirerGrade });
  const C = COLOUR_MAP[narrative.colour];

  const SeverityIcon =
    narrative.severity === 'critical' ? AlertTriangle :
    narrative.severity === 'warning'  ? AlertTriangle :
    CheckCircle;

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${C.bg} ${C.border}`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          <SeverityIcon
            size={20}
            className={
              narrative.colour === 'red'   ? 'text-red-400' :
              narrative.colour === 'amber' ? 'text-amber-400' :
              'text-emerald-400'
            }
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className={`text-sm font-bold ${C.title}`}>{narrative.headline}</h3>
          </div>

          {/* Trend + rolling badges */}
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${C.tag}`}>
              {TREND_ICONS[trendDir]}
              Trend: {trend?.trend?.label ?? 'N/A'}
            </span>
            {rolling !== null && (
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${C.tag}`}>
                3-mo avg: {(rolling * 100).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body paragraphs */}
      <div className="space-y-2">
        {narrative.body.map((para, i) => (
          <p key={i} className={`text-xs leading-relaxed ${C.body}`}>{para}</p>
        ))}
      </div>

      {/* Action list */}
      {narrative.actions.length > 0 && (
        <div>
          <p className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${C.title} opacity-80`}>
            Recommended Actions
          </p>
          <ul className="space-y-1.5">
            {narrative.actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${C.bullet}`} />
                <span className={`text-xs leading-relaxed ${C.body}`}>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
