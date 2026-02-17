import React from 'react';
import {
  TrendingDown, TrendingUp, AlertTriangle, DollarSign,
  Activity, Shield, ChevronRight, BarChart3
} from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import TrafficLight from './TrafficLight.jsx';
import ComparisonTable from './ComparisonTable.jsx';
import BankabilityScore from './BankabilityScore.jsx';
import { TIER_LABELS } from '../data/acquirers.js';

function StatCard({ label, value, sub, icon: Icon, color = 'blue', highlight }) {
  const colorMap = {
    blue:   { bg: 'bg-blue-950/40',   border: 'border-blue-800/40',   text: 'text-blue-400',   icon: 'text-blue-500' },
    green:  { bg: 'bg-green-950/40',  border: 'border-green-800/40',  text: 'text-green-400',  icon: 'text-green-500' },
    yellow: { bg: 'bg-yellow-950/40', border: 'border-yellow-800/40', text: 'text-yellow-400', icon: 'text-yellow-500' },
    red:    { bg: 'bg-red-950/40',    border: 'border-red-800/40',    text: 'text-red-400',    icon: 'text-red-500' },
    slate:  { bg: 'bg-slate-800/40',  border: 'border-slate-700/40',  text: 'text-slate-300',  icon: 'text-slate-500' },
  };
  const c = colorMap[color] ?? colorMap.slate;

  return (
    <div className={`stat-card border ${c.border} ${c.bg}`}>
      <div className="flex items-start justify-between">
        <p className="stat-label">{label}</p>
        {Icon && <Icon size={16} className={c.icon} />}
      </div>
      <p className={`stat-value ${c.text}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function RadarViz({ vampResult, ecpResult, efmResult, bankability }) {
  const data = [
    {
      subject: 'VAMP',
      score: bankability?.components?.vamp?.score ?? 0,
      fullMark: 100,
    },
    {
      subject: 'ECP',
      score: ecpResult?.status?.key === 'healthy' ? 90 : ecpResult?.status?.key === 'warning' ? 50 : 15,
      fullMark: 100,
    },
    {
      subject: 'EFM',
      score: efmResult?.enrolled ? 10 : efmResult?.ratioBreached ? 50 : 90,
      fullMark: 100,
    },
    {
      subject: 'Website',
      score: bankability?.components?.website?.score ?? 0,
      fullMark: 100,
    },
    {
      subject: 'Acquirer Fit',
      score: vampResult?.acquirerStatus?.key === 'healthy' ? 90
           : vampResult?.acquirerStatus?.key === 'warning' ? 50 : 15,
      fullMark: 100,
    },
  ];

  return (
    <div className="card p-5">
      <h4 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
        <BarChart3 size={15} className="text-blue-400" />
        Risk Radar
      </h4>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data}>
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.25}
            strokeWidth={2}
          />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            formatter={(v) => [`${v}/100`, 'Score']}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Dashboard({ merchant, txnData, vampResult, ecpResult, efmResult, bankability, onNext }) {
  if (!vampResult) return null;

  const vampStatus  = vampResult.acquirerStatus?.key ?? 'healthy';
  const ecpStatus   = ecpResult?.status?.key ?? 'healthy';

  // Overall worst-case status for the main traffic light
  const overallStatus =
    vampStatus === 'critical' || ecpStatus === 'critical' || efmResult?.enrolled
      ? 'critical'
      : vampStatus === 'excessive' || ecpStatus === 'excessive'
        ? 'excessive'
        : vampStatus === 'warning' || ecpStatus === 'warning'
          ? 'warning'
          : 'healthy';

  const statCards = [
    {
      label: 'VAMP Ratio',
      value: `${vampResult.percentage}%`,
      sub: `Visa threshold: 1.000%`,
      icon: Activity,
      color: vampStatus === 'healthy' ? 'green' : vampStatus === 'warning' ? 'yellow' : 'red',
    },
    {
      label: 'CNP Transactions',
      value: Number(txnData.cnpTxnCount).toLocaleString(),
      sub: `${Number(txnData.tc40Count) + Number(txnData.tc15Count)} combined TC40+TC15`,
      icon: TrendingDown,
      color: 'slate',
    },
    {
      label: 'Chargeback Rate (ECP)',
      value: ecpResult ? `${ecpResult.percentage}%` : '—',
      sub: ecpResult ? `${ecpResult.chargebackCount} chargebacks` : 'Not calculated',
      icon: AlertTriangle,
      color: ecpStatus === 'healthy' ? 'green' : ecpStatus === 'warning' ? 'yellow' : 'red',
    },
    {
      label: 'Fraud Rate (EFM)',
      value: efmResult ? `${efmResult.percentage}%` : '—',
      sub: efmResult?.enrolled ? 'EFM ENROLLED' : efmResult ? 'Not enrolled' : 'Not calculated',
      icon: Shield,
      color: efmResult?.enrolled ? 'red' : 'green',
    },
    {
      label: 'Bankability Score',
      value: bankability ? `${bankability.composite}/100` : '—',
      sub: bankability ? `Grade: ${bankability.grade} — ${bankability.verdict.label}` : '',
      icon: TrendingUp,
      color: (bankability?.composite ?? 0) >= 70 ? 'green' : (bankability?.composite ?? 0) >= 50 ? 'yellow' : 'red',
    },
    {
      label: 'Est. Monthly Fines',
      value: `$${(
        (vampResult.estimatedMonthlyFine ?? 0) +
        (ecpResult?.monthlyFineEstimate ?? 0) +
        (efmResult?.fineEstimate ?? 0)
      ).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      sub: 'Combined Visa + Mastercard (indicative)',
      icon: DollarSign,
      color: vampResult.estimatedMonthlyFine + (ecpResult?.monthlyFineEstimate ?? 0) > 0 ? 'red' : 'green',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">
            {merchant.businessName || 'Merchant'} Risk Dashboard
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {merchant.statementPeriod || 'Statement period not specified'} ·{' '}
            {TIER_LABELS[vampResult.acquirer?.tier] ?? 'Unknown acquirer tier'}:{' '}
            {vampResult.acquirer?.name ?? 'Unknown'}
          </p>
        </div>
        <button onClick={onNext} className="btn-primary self-start sm:self-auto">
          Generate Report <ChevronRight size={16} />
        </button>
      </div>

      {/* Traffic light + key stats */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Traffic light */}
        <div className="card p-6 flex flex-col items-center justify-center gap-4 lg:col-span-1">
          <TrafficLight status={overallStatus} size="lg" />
          <div className="text-center">
            <p className="text-xs text-slate-500 uppercase tracking-widest">Acquirer-Adjusted Status</p>
            <p className={`text-lg font-bold mt-1 ${
              overallStatus === 'healthy' ? 'text-green-400' :
              overallStatus === 'warning' ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {vampResult.acquirerStatus?.label ?? 'Unknown'}
            </p>
            <p className="text-xs text-slate-500 mt-1">{vampResult.acquirer?.name}</p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {statCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>
      </div>

      {/* Acquirer note */}
      {vampResult.acquirerNote && (
        <div className={`
          border rounded-xl p-4 text-sm leading-relaxed
          ${vampStatus === 'critical' ? 'bg-red-950/40 border-red-700/50 text-red-300'
          : vampStatus === 'warning'  ? 'bg-yellow-950/40 border-yellow-700/50 text-yellow-300'
          : 'bg-green-950/40 border-green-700/50 text-green-300'}
        `}>
          <p className="font-semibold text-xs uppercase tracking-wider mb-1 opacity-70">Acquirer Intelligence</p>
          {vampResult.acquirerNote}
        </div>
      )}

      {/* Distance to thresholds */}
      {(vampResult.distanceToWarning || vampResult.distanceToExcessive) && (
        <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {vampResult.distanceToWarning && (
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div>
                <p className="text-xs text-slate-500">Distance to Visa Warning (1.000%)</p>
                <p className="font-mono font-bold text-yellow-300">+{vampResult.distanceToWarning}%</p>
              </div>
            </div>
          )}
          {vampResult.distanceToExcessive && (
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div>
                <p className="text-xs text-slate-500">Distance to Visa Excessive (1.500%)</p>
                <p className="font-mono font-bold text-red-300">+{vampResult.distanceToExcessive}%</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comparison table */}
      <ComparisonTable vampResult={vampResult} ecpResult={ecpResult} efmResult={efmResult} />

      {/* Radar + Bankability */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2">
          <RadarViz
            vampResult={vampResult}
            ecpResult={ecpResult}
            efmResult={efmResult}
            bankability={bankability}
          />
        </div>
        <div className="lg:col-span-3">
          <BankabilityScore bankability={bankability} />
        </div>
      </div>
    </div>
  );
}
