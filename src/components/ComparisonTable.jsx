import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, Minus } from 'lucide-react';
import { TIER_LABELS } from '../data/acquirers.js';

const STATUS_ICON = {
  healthy:   <CheckCircle size={15} className="text-green-400" />,
  warning:   <AlertTriangle size={15} className="text-yellow-400" />,
  excessive: <XCircle size={15} className="text-red-400" />,
  critical:  <XCircle size={15} className="text-red-300" />,
};

const STATUS_BADGE = {
  healthy:   'badge-green',
  warning:   'badge-yellow',
  excessive: 'badge-red',
  critical:  'badge-red',
};

function Row({ label, value, threshold, status, note, isLast }) {
  return (
    <tr className={`${isLast ? '' : 'border-b border-slate-700/50'} group`}>
      <td className="py-3 pr-4 text-sm text-slate-300 font-medium whitespace-nowrap">{label}</td>
      <td className="py-3 pr-4 text-sm font-mono font-semibold text-white">{value}</td>
      <td className="py-3 pr-4 text-sm text-slate-400 font-mono">{threshold}</td>
      <td className="py-3 pr-4">
        <span className={STATUS_BADGE[status?.key] ?? 'badge-gray'}>
          {STATUS_ICON[status?.key] ?? <Minus size={12} />}
          <span className="ml-1">{status?.label ?? '—'}</span>
        </span>
      </td>
      <td className="py-3 text-xs text-slate-500 hidden lg:table-cell">{note ?? '—'}</td>
    </tr>
  );
}

export default function ComparisonTable({ vampResult, ecpResult, efmResult }) {
  if (!vampResult) return null;

  const { acquirer } = vampResult;

  const rows = [
    // VAMP
    {
      label: 'Visa VAMP Ratio',
      value: `${vampResult.percentage}%`,
      threshold: '≥ 1.0% warn · ≥ 1.5% excessive',
      status: vampResult.visaStatus,
      note: `(TC40 ${vampResult.tc40Count} + TC15 ${vampResult.tc15Count}) ÷ CNP ${vampResult.cnpTxnCount.toLocaleString()}`,
    },
    {
      label: `Acquirer-Adjusted (${acquirer?.name ?? 'Unknown'})`,
      value: `${vampResult.percentage}%`,
      threshold: `≥ ${((vampResult.effectiveWarning ?? 0.01) * 100).toFixed(2)}% warn · ≥ ${((vampResult.effectiveExcessive ?? 0.015) * 100).toFixed(2)}% excessive`,
      status: vampResult.acquirerStatus,
      note: `${TIER_LABELS[acquirer?.tier] ?? 'Unknown tier'} · ${acquirer?.riskAppetite ?? '—'} risk appetite`,
    },
    // ECP
    {
      label: 'Mastercard ECP Rate',
      value: ecpResult ? `${ecpResult.percentage}%` : '—',
      threshold: '≥ 1.5% + 100 CBs = CMM · ≥ 2.0% + 100 CBs = ECM',
      status: ecpResult?.status,
      note: ecpResult
        ? `${ecpResult.chargebackCount} chargebacks ÷ ${ecpResult.totalTxnCount?.toLocaleString()} txns`
        : 'No data provided',
    },
    // EFM
    {
      label: 'Mastercard EFM Rate',
      value: efmResult ? `${efmResult.percentage}%` : '—',
      threshold: '≥ 0.65% AND fraud amt ≥ $75K',
      status: efmResult?.status,
      note: efmResult
        ? `${efmResult.fraudCount} fraud txns · $${(efmResult.fraudAmountUSD ?? 0).toLocaleString()} fraud amt · ${efmResult.enrolled ? 'ENROLLED' : efmResult.ratioBreached || efmResult.amountBreached ? 'Partial breach' : 'Healthy'}`
        : 'No data provided',
    },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700/50">
        <h3 className="section-title text-base">Programme Comparison</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Your figures vs. Visa VAMP (Apr 2026) & Mastercard ECP/EFM thresholds
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="px-5 py-3 text-left text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Programme</th>
              <th className="px-0 pr-4 py-3 text-left text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Your Rate</th>
              <th className="pr-4 py-3 text-left text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Threshold</th>
              <th className="pr-4 py-3 text-left text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Status</th>
              <th className="pr-5 py-3 text-left text-[10px] text-slate-500 uppercase tracking-wider font-semibold hidden lg:table-cell">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-transparent">
            {rows.map((row, i) => (
              <tr key={row.label} className="hover:bg-slate-700/20 transition-colors">
                <td className="px-5 py-3 text-sm text-slate-300 font-medium">{row.label}</td>
                <td className="pr-4 py-3 text-sm font-mono font-bold text-white">{row.value}</td>
                <td className="pr-4 py-3 text-xs text-slate-400 font-mono leading-relaxed max-w-[200px]">{row.threshold}</td>
                <td className="pr-4 py-3">
                  <span className={STATUS_BADGE[row.status?.key] ?? 'badge-gray'}>
                    {STATUS_ICON[row.status?.key] ?? <Minus size={12} />}
                    <span className="ml-1">{row.status?.label ?? '—'}</span>
                  </span>
                </td>
                <td className="pr-5 py-3 text-xs text-slate-500 hidden lg:table-cell max-w-xs">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fine estimates */}
      {(vampResult.estimatedMonthlyFine > 0 || ecpResult?.monthlyFineEstimate > 0 || efmResult?.fineEstimate > 0) && (
        <div className="px-5 py-4 border-t border-slate-700/50 bg-red-950/20">
          <p className="text-xs font-semibold text-red-400 mb-2 uppercase tracking-wide">Estimated Network Fines</p>
          <div className="flex flex-wrap gap-4">
            {vampResult.estimatedMonthlyFine > 0 && (
              <div className="text-xs text-slate-300">
                <span className="text-slate-500">Visa VAMP: </span>
                <span className="font-mono font-bold text-red-300">
                  ${vampResult.estimatedMonthlyFine.toLocaleString()}/mo
                </span>
                <span className="text-slate-500"> ({vampResult.itemsAboveThreshold} items × $10)</span>
              </div>
            )}
            {ecpResult?.monthlyFineEstimate > 0 && (
              <div className="text-xs text-slate-300">
                <span className="text-slate-500">MC ECP: </span>
                <span className="font-mono font-bold text-red-300">
                  ${ecpResult.monthlyFineEstimate.toLocaleString()}/mo
                </span>
                <span className="text-slate-500"> (Month 1 rate)</span>
              </div>
            )}
            {efmResult?.fineEstimate > 0 && (
              <div className="text-xs text-slate-300">
                <span className="text-slate-500">MC EFM: </span>
                <span className="font-mono font-bold text-red-300">
                  ${efmResult.fineEstimate.toFixed(2)}/mo
                </span>
                <span className="text-slate-500"> ($0.25 per excess fraud txn)</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
