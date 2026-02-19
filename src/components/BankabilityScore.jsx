import React from 'react';
import { AlertTriangle, XCircle, CheckCircle, TrendingUp, HelpCircle } from 'lucide-react';

const GRADE_COLORS = {
  'A+': '#22c55e',
  A:   '#4ade80',
  B:   '#a3e635',
  C:   '#facc15',
  D:   '#f97316',
  F:   '#ef4444',
};

const PRIORITY_CONFIG = {
  critical: { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-950/40',    border: 'border-red-800/50',    label: 'Critical' },
  high:     { icon: AlertTriangle,  color: 'text-orange-400', bg: 'bg-orange-950/40', border: 'border-orange-800/50', label: 'High' },
  medium:   { icon: AlertTriangle,  color: 'text-yellow-400', bg: 'bg-yellow-950/40', border: 'border-yellow-800/50', label: 'Medium' },
  low:      { icon: TrendingUp,     color: 'text-blue-400',   bg: 'bg-blue-950/40',   border: 'border-blue-800/50',   label: 'Low' },
};

// Pure-SVG gauge — no third-party chart library, no SVG overlay conflicts.
// Arc spans 260° with the 100° gap centred at the bottom (6 o'clock).
// Drawing convention: SVG circle starts at east (3 o'clock), going CW.
// Rotating by 140° places the arc start at ~7:30 o'clock (140° CW from east).
function GaugeChart({ score, grade }) {
  const color = GRADE_COLORS[grade] ?? '#94a3b8';
  const SIZE = 180;
  const cx   = SIZE / 2;   // 90
  const cy   = SIZE / 2;   // 90
  const R    = 70;          // stroke-centre radius
  const SW   = 14;          // stroke width
  const GAP  = 100;         // gap degrees centred at bottom
  const ARC  = 360 - GAP;  // 260° of visible arc

  const circumference  = 2 * Math.PI * R;
  const arcLen         = (ARC  / 360) * circumference;
  const progressLen    = (Math.max(0, Math.min(100, score)) / 100) * arcLen;

  // rotate(140) → arc starts at 140° CW from east = ~7:30 o'clock
  // gap then sits from 40° to 140° CW from east = centred at 90° = 6 o'clock ✓
  const rot = `rotate(140, ${cx}, ${cy})`;

  return (
    <div className="relative mx-auto flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: 'block' }}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={R}
          fill="none"
          stroke="#1e293b"
          strokeWidth={SW}
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circumference - arcLen}`}
          transform={rot}
        />
        {/* Progress */}
        {progressLen > 0 && (
          <circle
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={color}
            strokeWidth={SW}
            strokeLinecap="round"
            strokeDasharray={`${progressLen} ${circumference - progressLen}`}
            transform={rot}
          />
        )}
      </svg>

      {/* Center label — plain DOM div, zero SVG interaction, zero z-index battle */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ pointerEvents: 'none' }}
      >
        <span className="text-4xl font-black leading-none" style={{ color }}>{grade}</span>
        <span className="text-2xl font-bold text-white leading-none mt-0.5">{score}</span>
        <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Score</span>
      </div>
    </div>
  );
}

function ComponentBar({ label, score, weight }) {
  const weightPct = Math.round(weight * 100);

  if (weightPct === 0) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">{label}</span>
          <span className="text-slate-600 italic text-[10px]">Not assessed</span>
        </div>
        <div className="h-2 bg-slate-800/50 rounded-full" />
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#facc15' : pct >= 40 ? '#f97316' : '#ef4444';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono font-semibold text-white">
          {score}<span className="text-slate-500">/100</span>
          <span className="text-slate-600 ml-1">({weightPct}%)</span>
        </span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function BankabilityScore({ bankability }) {
  if (!bankability) return null;

  const { composite, grade, verdict, components, recommendations, checklistBreakdown, websiteAssessed } = bankability;

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Score card */}
      <div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
        <div className="flex flex-col items-center sm:items-start gap-4 sm:flex-row">
          <GaugeChart score={composite} grade={grade} />
          <div className="flex flex-col justify-center">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Bankability Score</p>
            <h2 className="text-2xl font-black text-white">{verdict.label}</h2>
            <p className="text-sm text-slate-400 mt-2 max-w-xs leading-relaxed">{verdict.description}</p>
            {!websiteAssessed && (
              <p className="text-[10px] text-slate-600 mt-2 italic">
                Score based on transaction health only — website not assessed
              </p>
            )}
          </div>
        </div>

        {/* Component breakdown */}
        <div className="space-y-4">
          <p className="text-xs text-slate-500 uppercase tracking-widest">Score Breakdown</p>
          {Object.values(components).map((c) => (
            <ComponentBar key={c.label} label={c.label} score={c.score} weight={c.weight} />
          ))}
          <div className="pt-1 border-t border-slate-700/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold">Composite Score</span>
              <span className="font-mono font-bold text-white">{composite}/100</span>
            </div>
          </div>
        </div>
      </div>

      {/* Website checklist breakdown */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-slate-200">Website Compliance Checklist</h4>
          {!websiteAssessed && (
            <span className="text-[10px] text-slate-500 italic">Not yet assessed</span>
          )}
        </div>
        {!websiteAssessed ? (
          <p className="text-xs text-slate-500 leading-relaxed">
            Website compliance not included in this run. Use the "Add Website Compliance Analysis"
            panel below to complete the audit and update your Bankability Score.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {checklistBreakdown?.map((item) => (
              <div
                key={item.key}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg ${
                  !item.answered
                    ? 'bg-slate-800/30 border border-slate-700/30'
                    : item.passed
                      ? 'bg-green-950/30 border border-green-800/30'
                      : 'bg-red-950/30 border border-red-800/30'
                }`}
              >
                {!item.answered
                  ? <HelpCircle size={14} className="text-slate-500 flex-shrink-0" />
                  : item.passed
                    ? <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                    : <XCircle size={14} className="text-red-400 flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className={`text-xs truncate ${item.answered ? 'text-slate-300' : 'text-slate-500'}`}>
                    {item.label}
                  </p>
                </div>
                <span className="text-[10px] text-slate-600 flex-shrink-0">×{item.weight}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommendations */}
      {recommendations?.length > 0 && (
        <div className="card p-5 space-y-3">
          <h4 className="text-sm font-semibold text-slate-200">Remediation Recommendations</h4>
          <div className="space-y-3">
            {recommendations.map((rec, idx) => {
              const cfg = PRIORITY_CONFIG[rec.priority] ?? PRIORITY_CONFIG.low;
              const Icon = cfg.icon;
              return (
                <div
                  key={idx}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border ${cfg.bg} ${cfg.border}`}
                >
                  <Icon size={15} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                        {rec.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{rec.action}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
