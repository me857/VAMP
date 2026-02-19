import React, { useState, useRef } from 'react';
import {
  TrendingDown, TrendingUp, AlertTriangle, DollarSign,
  Activity, Shield, ChevronRight, BarChart3, PlusCircle, RefreshCw,
  Globe, Loader2, CheckCircle2, XCircle, HelpCircle, AlertOctagon,
  ExternalLink, Wifi, WifiOff,
} from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import TrafficLight from './TrafficLight.jsx';
import ComparisonTable from './ComparisonTable.jsx';
import BankabilityScore from './BankabilityScore.jsx';
import WebsiteAuditor from './WebsiteAuditor.jsx';
import { auditWebsite } from '../utils/siteAudit.js';
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
      score: bankability?.websiteAssessed ? (bankability?.components?.website?.score ?? 0) : 50,
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

// ── Confidence badge ─────────────────────────────────────────────────────────
function ConfidenceBadge({ confidence }) {
  if (confidence === 'high')   return <span className="text-[9px] font-bold uppercase tracking-wider text-green-500/80  bg-green-950/40  border border-green-800/30  px-1.5 py-0.5 rounded">Auto</span>;
  if (confidence === 'medium') return <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400/80   bg-blue-950/40   border border-blue-800/30   px-1.5 py-0.5 rounded">Likely</span>;
  if (confidence === 'low')    return <span className="text-[9px] font-bold uppercase tracking-wider text-yellow-400/80 bg-yellow-950/40 border border-yellow-800/30 px-1.5 py-0.5 rounded">Inferred</span>;
  return <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-800/40 border border-slate-700/30 px-1.5 py-0.5 rounded">Manual</span>;
}

// ── Individual scan finding row ───────────────────────────────────────────────
function FindingRow({ finding }) {
  const [expanded, setExpanded] = useState(false);

  const Icon = finding.confidence === 'n/a' || finding.passed === undefined
    ? HelpCircle
    : finding.passed
      ? CheckCircle2
      : XCircle;
  const iconColor = finding.confidence === 'n/a'
    ? 'text-slate-500'
    : finding.passed
      ? 'text-green-400'
      : finding.isInfo
        ? 'text-yellow-400'
        : 'text-red-400';

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
        finding.passed
          ? 'bg-green-950/20 border-green-800/30 hover:bg-green-950/30'
          : finding.isInfo
            ? 'bg-slate-800/30 border-slate-700/30 hover:bg-slate-800/50'
            : 'bg-red-950/20 border-red-800/30 hover:bg-red-950/30'
      }`}
      onClick={() => setExpanded((e) => !e)}
    >
      <div className="flex items-center gap-2.5">
        <Icon size={14} className={`${iconColor} flex-shrink-0`} />
        <span className="text-xs text-slate-300 flex-1 min-w-0 leading-snug">{finding.label}</span>
        <ConfidenceBadge confidence={finding.confidence} />
      </div>
      {expanded && (
        <div className="mt-2 pl-5 space-y-1.5">
          <p className="text-[11px] text-slate-400 leading-relaxed">{finding.details}</p>
          {finding.riskNote && (
            <p className="text-[11px] text-amber-300/80 leading-relaxed flex items-start gap-1.5">
              <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
              {finding.riskNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline website audit panel (shown when website not yet assessed) ────────

function WebsiteAuditPanel({
  merchant, checklist, onChecklistChange, onRefreshAnalysis,
  currentScore, potentialScore, onMerchantChange,
}) {
  const [open, setOpen]           = useState(false);
  const [auditUrl, setAuditUrl]   = useState(merchant?.website || '');
  const [scanning, setScanning]   = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const urlInputRef               = useRef(null);

  const answered = Object.values(checklist).filter((v) => v !== null && v !== undefined).length;
  const hasUplift = potentialScore != null && currentScore != null && potentialScore > currentScore;

  // Keep local URL in sync when merchant.website is updated externally
  const effectiveUrl = auditUrl || merchant?.website || '';

  const handleOpen = () => {
    setOpen((o) => !o);
    if (!open) {
      // auto-focus URL field next tick
      setTimeout(() => urlInputRef.current?.focus(), 50);
    }
  };

  const handleScan = async () => {
    const url = effectiveUrl.trim();
    if (!url) { urlInputRef.current?.focus(); return; }

    setScanning(true);
    setScanResult(null);
    setScanError(null);

    // Save URL back to merchant if it was blank
    if (!merchant?.website && onMerchantChange) {
      onMerchantChange({ website: url });
    }

    try {
      const result = await auditWebsite(url);
      setScanResult(result);

      // Auto-apply high/medium confidence checklist items
      if (result.checklistMappings && Object.keys(result.checklistMappings).length > 0) {
        onChecklistChange(result.checklistMappings);
      }
    } catch (err) {
      setScanError(`Scan failed: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  const handleApplyAndRefresh = () => {
    onRefreshAnalysis();
  };

  return (
    <div className="rounded-xl overflow-hidden border-2 border-amber-500/40 bg-amber-950/20 shadow-lg shadow-amber-900/10">

      {/* ── Banner header ── */}
      <div className="bg-amber-500/10 px-5 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <PlusCircle size={18} className="text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-200 leading-tight">
              Add Website Compliance Analysis
            </p>
            <p className="text-xs text-amber-300/70 mt-0.5 leading-snug">
              {scanResult
                ? `Scan complete — ${scanResult.riskFlags?.length ?? 0} risk flag(s) found`
                : answered > 0
                  ? `${answered}/9 items reviewed — click to finish`
                  : 'Website not yet assessed — 30% of Bankability Score'}
            </p>
          </div>
        </div>
        <button
          onClick={handleOpen}
          className="flex-shrink-0 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black text-xs font-bold transition-colors"
        >
          {open ? 'Collapse ▲' : 'Start Audit ▶'}
        </button>
      </div>

      {/* ── Collapsed teaser ── */}
      {!open && (
        <div className="px-5 py-3 flex items-start gap-2 border-t border-amber-500/20">
          <span className="text-amber-500 text-sm mt-0.5">⚠</span>
          <p className="text-xs text-slate-400 leading-relaxed">
            Website compliance accounts for{' '}
            <span className="text-amber-300 font-semibold">30% of your Bankability Score</span>.{' '}
            {hasUplift ? (
              <>Score is currently <span className="text-white font-semibold">{currentScore}/100</span> — a full audit could raise it to <span className="text-amber-300 font-semibold">{potentialScore}/100</span>.</>
            ) : currentScore != null ? (
              <>Current score: <span className="text-white font-semibold">{currentScore}/100</span> — website audit will lock in your full grade.</>
            ) : null}{' '}
            Takes under 2 minutes.
          </p>
        </div>
      )}

      {/* ── Expanded body ── */}
      {open && (
        <div className="border-t border-amber-500/20 p-5 space-y-5">

          {/* URL input + scan button */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Globe size={13} className="text-amber-400" />
              Merchant Website URL
            </label>
            <div className="flex gap-2">
              <input
                ref={urlInputRef}
                type="url"
                value={auditUrl}
                onChange={(e) => setAuditUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !scanning && handleScan()}
                placeholder="https://merchantsite.com"
                className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-colors"
              />
              <button
                onClick={handleScan}
                disabled={scanning || !effectiveUrl.trim()}
                className="flex-shrink-0 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                {scanning ? <><Loader2 size={13} className="animate-spin" /> Scanning…</> : <><Globe size={13} /> Scan Site</>}
              </button>
            </div>
            {!effectiveUrl.trim() && (
              <p className="text-[11px] text-amber-400/70 flex items-center gap-1">
                <AlertTriangle size={11} />
                Enter the merchant's website URL above to run an automated compliance scan.
              </p>
            )}
          </div>

          {/* Scan error */}
          {scanError && (
            <div className="rounded-lg bg-red-950/40 border border-red-800/40 p-3 flex items-start gap-2">
              <XCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{scanError}</p>
            </div>
          )}

          {/* ── Scan results ── */}
          {scanResult && (
            <div className="space-y-4">

              {/* Summary bar */}
              <div className={`rounded-lg px-4 py-3 flex items-center gap-3 border ${
                scanResult.corsBlocked
                  ? 'bg-slate-800/50 border-slate-700'
                  : scanResult.riskFlags?.length > 0
                    ? 'bg-red-950/30 border-red-800/40'
                    : 'bg-green-950/30 border-green-800/40'
              }`}>
                {scanResult.corsBlocked
                  ? <WifiOff size={15} className="text-slate-400 flex-shrink-0" />
                  : scanResult.riskFlags?.length > 0
                    ? <AlertOctagon size={15} className="text-red-400 flex-shrink-0" />
                    : <Wifi size={15} className="text-green-400 flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-200 font-semibold leading-snug">{scanResult.summary}</p>
                  {scanResult.socialLinks?.length > 0 && (
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Social presence: {scanResult.socialLinks.join(', ')}
                    </p>
                  )}
                </div>
                {scanResult.url && (
                  <a
                    href={scanResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-slate-500 hover:text-slate-300"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>

              {/* CORS warning guidance */}
              {scanResult.corsBlocked && (
                <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-3 text-xs text-slate-400 leading-relaxed">
                  <p className="font-semibold text-slate-300 mb-1">Automated scan limited by browser security (CORS)</p>
                  <p>
                    The site is reachable but its server does not allow cross-origin page reads from the browser.
                    We've probed common URL paths (/terms, /privacy, /refund, /contact) and SSL — all other items
                    require manual review below. This is normal for most production websites.
                  </p>
                </div>
              )}

              {/* Risk flags (non-passed, scored findings only) */}
              {scanResult.riskFlags?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-red-300 flex items-center gap-1.5">
                    <AlertOctagon size={12} />
                    Risk Flags Detected
                  </p>
                  {scanResult.riskFlags.map((f, i) => (
                    <FindingRow key={`flag-${i}`} finding={f} />
                  ))}
                </div>
              )}

              {/* All other findings */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">All Findings</p>
                {scanResult.findings
                  .filter((f) => !scanResult.riskFlags?.includes(f))
                  .map((f, i) => (
                    <FindingRow key={`finding-${i}`} finding={f} />
                  ))
                }
              </div>

              {/* Auto-applied items notice */}
              {Object.keys(scanResult.checklistMappings ?? {}).length > 0 && (
                <div className="rounded-lg bg-blue-950/30 border border-blue-800/40 px-3 py-2.5 flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-400">
                    <span className="text-slate-200 font-semibold">{Object.keys(scanResult.checklistMappings).length} checklist items auto-filled</span>{' '}
                    from scan results. Review and override any below if needed.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Manual checklist (always shown after scan or for items not auto-detected) ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {scanResult ? 'Manual Review / Override' : 'Manual Compliance Checklist'}
            </p>
            {scanResult && !scanResult.corsBlocked && (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Items auto-detected by the scan are pre-filled. Override any result if the automated check
                missed context, or complete the items marked "manual" that require human judgement.
              </p>
            )}
            <WebsiteAuditor
              merchant={merchant}
              checklist={checklist}
              onChange={onChecklistChange}
              inline
            />
          </div>

          {/* Apply & Refresh */}
          <button
            onClick={handleApplyAndRefresh}
            className="btn-primary w-full justify-center gap-2"
          >
            <RefreshCw size={15} />
            Apply Results & Refresh Bankability Score
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard({
  merchant, txnData, vampResult, ecpResult, efmResult, bankability, onNext, onEdit,
  checklist, onChecklistChange, onRefreshAnalysis, onMerchantChange,
}) {
  if (!vampResult) return null;

  const vampStatus  = vampResult.acquirerStatus?.key ?? 'healthy';
  const ecpStatus   = ecpResult?.status?.key ?? 'healthy';

  // Potential bankability score if website audit is completed perfectly
  const websitePotential = !bankability?.websiteAssessed && bankability?.components
    ? Math.round(
        (bankability.components.vamp?.score       ?? 0) * 0.50 +
        (bankability.components.mastercard?.score ?? 0) * 0.20 +
        100 * 0.30
      )
    : null;

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
      sub: ecpResult
        ? `${ecpResult.chargebackCount} chargebacks · MC ECP`
        : vampResult.tc15Count === 0
          ? 'Zero chargebacks confirmed · add txn count for ratio'
          : 'Enter CNP/total txn count to calculate',
      icon: AlertTriangle,
      color: ecpResult
        ? (ecpStatus === 'healthy' ? 'green' : ecpStatus === 'warning' ? 'yellow' : 'red')
        : vampResult.tc15Count === 0 ? 'green' : 'slate',
    },
    {
      label: 'Fraud Rate (EFM)',
      value: efmResult ? `${efmResult.percentage}%` : '—',
      sub: efmResult?.enrolled
        ? 'EFM ENROLLED'
        : efmResult
          ? 'Not enrolled'
          : vampResult.tc40Count === 0
            ? 'Zero fraud items confirmed · not enrolled'
            : 'Not calculated',
      icon: Shield,
      color: efmResult?.enrolled ? 'red' : (efmResult || vampResult.tc40Count === 0) ? 'green' : 'slate',
    },
    {
      label: 'Bankability Score',
      value: bankability ? `${bankability.composite}/100` : '—',
      sub: bankability
        ? `Grade: ${bankability.grade} — ${bankability.verdict.label}${bankability.websiteAssessed ? '' : ' (txn only)'}`
        : '',
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
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {onEdit && (
            <button
              onClick={onEdit}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-400 border border-slate-700 hover:border-slate-500 hover:text-slate-200 transition-colors"
            >
              ← Edit Data
            </button>
          )}
          <button onClick={onNext} className="btn-primary">
            Generate Report <ChevronRight size={16} />
          </button>
        </div>
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

      {/* Info note: ECP/EFM missing transaction count */}
      {!ecpResult && (vampResult.tc15Count === 0 || vampResult.tc40Count === 0) && !Number(txnData.cnpTxnCount) && !Number(txnData.totalSalesCount) && (
        <div className="rounded-xl p-4 bg-blue-950/30 border border-blue-800/40 text-xs text-slate-400 leading-relaxed flex items-start gap-3">
          <Activity size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <span>
            <span className="text-slate-200 font-semibold">Mastercard ECP/EFM ratios not shown</span>{' '}
            — your statement shows zero chargebacks and zero fraud (healthy), but an exact ratio
            requires a total transaction count which your PDF does not include. To see a precise ECP/EFM
            percentage, go back to <span className="text-blue-400">Data Entry</span> and enter your
            CNP or total transaction count manually.
          </span>
        </div>
      )}

      {/* Comparison table */}
      <ComparisonTable vampResult={vampResult} ecpResult={ecpResult} efmResult={efmResult} />

      {/* Website audit CTA — shown prominently BEFORE the score when not yet assessed */}
      {!bankability?.websiteAssessed && checklist && onChecklistChange && onRefreshAnalysis && (
        <WebsiteAuditPanel
          merchant={merchant}
          checklist={checklist}
          onChecklistChange={onChecklistChange}
          onRefreshAnalysis={onRefreshAnalysis}
          onMerchantChange={onMerchantChange}
          currentScore={bankability?.composite}
          potentialScore={websitePotential}
        />
      )}

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
