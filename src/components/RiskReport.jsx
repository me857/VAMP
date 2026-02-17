import React, { useRef } from 'react';
import { Printer, ArrowLeft, CheckCircle, XCircle, AlertTriangle, ShieldCheck, Minus } from 'lucide-react';
import { TIER_LABELS } from '../data/acquirers.js';
import { CHECKLIST_WEIGHTS } from '../utils/bankabilityScore.js';

const PRIORITY_COLORS = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#facc15',
  low:      '#60a5fa',
};

const PRIORITY_LABELS = {
  critical: 'CRITICAL',
  high:     'HIGH',
  medium:   'MEDIUM',
  low:      'LOW',
};

// Inline styles for print-safe rendering (Tailwind classes are stripped in print)
const S = {
  page:       { fontFamily: 'Inter, system-ui, sans-serif', color: '#0f172a', background: 'white', maxWidth: 900, margin: '0 auto', padding: '40px 48px' },
  headerBand: { background: '#1e3a8a', color: 'white', padding: '28px 32px', borderRadius: 12, marginBottom: 32 },
  title:      { fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' },
  subtitle:   { fontSize: 13, opacity: 0.75, marginTop: 4 },
  section:    { marginBottom: 28 },
  sectionTitle: { fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3b82f6', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #e2e8f0' },
  grid2:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  grid3:      { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 },
  box:        { border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px' },
  label:      { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 3 },
  value:      { fontSize: 20, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#0f172a' },
  valueSm:    { fontSize: 14, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', color: '#0f172a' },
  note:       { fontSize: 11, color: '#64748b', marginTop: 2 },
  statusPill: (color) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: color + '20', color: color, border: `1px solid ${color}60` }),
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:         { background: '#f8fafc', padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #e2e8f0' },
  td:         { padding: '9px 12px', borderBottom: '1px solid #f1f5f9', color: '#1e293b' },
  recBox:     (color) => ({ padding: '10px 14px', borderRadius: 8, borderLeft: `3px solid ${color}`, background: color + '0d', marginBottom: 8 }),
  footer:     { marginTop: 40, paddingTop: 20, borderTop: '1px solid #e2e8f0', fontSize: 10, color: '#94a3b8', lineHeight: 1.6 },
  checkRow:   (pass) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #f1f5f9' }),
};

function StatusPill({ status }) {
  const colorMap = { healthy: '#22c55e', warning: '#eab308', excessive: '#ef4444', critical: '#dc2626' };
  const color = colorMap[status?.key] ?? '#94a3b8';
  return <span style={S.statusPill(color)}>{status?.label ?? '—'}</span>;
}

function MetricBox({ label, value, note, statusColor }) {
  return (
    <div style={{ ...S.box, borderTopColor: statusColor ?? '#e2e8f0', borderTopWidth: statusColor ? 3 : 1 }}>
      <p style={S.label}>{label}</p>
      <p style={S.value}>{value}</p>
      {note && <p style={S.note}>{note}</p>}
    </div>
  );
}

function getBandColor(status) {
  const map = { healthy: '#22c55e', warning: '#eab308', excessive: '#ef4444', critical: '#dc2626' };
  return map[status?.key] ?? '#94a3b8';
}

export default function RiskReport({ merchant, txnData, vampResult, ecpResult, efmResult, bankability, onBack }) {
  const printRef = useRef(null);

  const handlePrint = () => {
    window.print();
  };

  if (!vampResult) return null;

  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const overallStatus = vampResult.acquirerStatus;

  const checklistKeys = Object.keys(CHECKLIST_WEIGHTS);

  return (
    <div>
      {/* Screen controls */}
      <div className="no-print flex items-center justify-between mb-6">
        <button onClick={onBack} className="btn-secondary">
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-500">Print or Save as PDF using your browser's print dialog</p>
          <button onClick={handlePrint} className="btn-primary">
            <Printer size={16} /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* ─── PRINTABLE REPORT ─── */}
      <div
        ref={printRef}
        className="bg-white text-gray-900 rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
        style={{ maxWidth: 900, margin: '0 auto' }}
      >
        <div style={S.page}>

          {/* Header band */}
          <div style={S.headerBand}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center' }}>
                <ShieldCheck size={24} style={{ color: 'white' }} />
              </div>
              <div>
                <h1 style={S.title}>Merchant Risk Health Report</h1>
                <p style={S.subtitle}>Visa VAMP & Mastercard ECP/EFM 2026 Diagnostic</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Merchant', value: merchant.businessName || 'Not specified' },
                { label: 'Report Date', value: reportDate },
                { label: 'Statement Period', value: merchant.statementPeriod || 'Not specified' },
                { label: 'Acquirer', value: vampResult.acquirer?.name || 'Unknown' },
              ].map((item) => (
                <div key={item.label}>
                  <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.6, marginBottom: 2 }}>{item.label}</p>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Executive summary */}
          <div style={S.section}>
            <p style={S.sectionTitle}>Executive Summary</p>
            <div style={{ ...S.box, borderLeftColor: getBandColor(overallStatus), borderLeftWidth: 4, background: getBandColor(overallStatus) + '0a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
                <div>
                  <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>
                    Overall Risk Status ({vampResult.acquirer?.name})
                  </p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: getBandColor(overallStatus), marginTop: 2 }}>
                    {overallStatus?.label ?? 'Unknown'}
                  </p>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>Bankability Score</p>
                  <p style={{ fontSize: 28, fontWeight: 900, color: '#1e293b', lineHeight: 1 }}>
                    {bankability?.composite ?? '—'}
                    <span style={{ fontSize: 14, fontWeight: 400, color: '#94a3b8' }}>/100</span>
                  </p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: getBandColor(overallStatus) }}>
                    Grade: {bankability?.grade ?? '—'} — {bankability?.verdict?.label ?? ''}
                  </p>
                </div>
              </div>
              <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                {bankability?.verdict?.description}
              </p>
              {merchant.notes && (
                <p style={{ fontSize: 11, color: '#64748b', marginTop: 8, fontStyle: 'italic', borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                  Consultant notes: {merchant.notes}
                </p>
              )}
            </div>
          </div>

          {/* Core metrics */}
          <div style={S.section}>
            <p style={S.sectionTitle}>Core Metrics</p>
            <div style={S.grid3}>
              <MetricBox
                label="Visa VAMP Ratio"
                value={`${vampResult.percentage}%`}
                note={`TC40 (${vampResult.tc40Count}) + TC15 (${vampResult.tc15Count}) ÷ CNP (${Number(txnData.cnpTxnCount).toLocaleString()})`}
                statusColor={getBandColor(vampResult.visaStatus)}
              />
              <MetricBox
                label="Acquirer-Adjusted Status"
                value={vampResult.acquirerStatus?.label ?? '—'}
                note={`Internal cap: warn ≥${(vampResult.effectiveWarning * 100).toFixed(2)}% / excess ≥${(vampResult.effectiveExcessive * 100).toFixed(2)}%`}
                statusColor={getBandColor(vampResult.acquirerStatus)}
              />
              <MetricBox
                label="Bankability Grade"
                value={bankability?.grade ?? '—'}
                note={bankability?.verdict?.label}
                statusColor={getBandColor(overallStatus)}
              />
              <MetricBox
                label="MC ECP Rate"
                value={ecpResult ? `${ecpResult.percentage}%` : '—'}
                note={ecpResult ? `${ecpResult.chargebackCount} CBs ÷ ${Number(ecpResult.totalTxnCount).toLocaleString()} txns` : 'Not calculated'}
                statusColor={ecpResult ? getBandColor(ecpResult.status) : undefined}
              />
              <MetricBox
                label="MC EFM Rate"
                value={efmResult ? `${efmResult.percentage}%` : '—'}
                note={efmResult ? `$${(efmResult.fraudAmountUSD ?? 0).toLocaleString()} fraud amt · ${efmResult.enrolled ? 'ENROLLED' : 'Not enrolled'}` : 'Not calculated'}
                statusColor={efmResult ? getBandColor(efmResult.status) : undefined}
              />
              <MetricBox
                label="Est. Monthly Network Fines"
                value={`$${(
                  (vampResult.estimatedMonthlyFine ?? 0) +
                  (ecpResult?.monthlyFineEstimate ?? 0) +
                  (efmResult?.fineEstimate ?? 0)
                ).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                note="Indicative — subject to acquirer and network confirmation"
                statusColor={vampResult.estimatedMonthlyFine > 0 ? '#ef4444' : '#22c55e'}
              />
            </div>
          </div>

          {/* Programme comparison table */}
          <div style={S.section}>
            <p style={S.sectionTitle}>Programme Threshold Comparison</p>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Programme', 'Your Rate', 'Warning Threshold', 'Excessive Threshold', 'Status'].map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    name: 'Visa VAMP (Published)',
                    rate: `${vampResult.percentage}%`,
                    warn: '1.000%',
                    excess: '1.500%',
                    status: vampResult.visaStatus,
                  },
                  {
                    name: `Visa VAMP (${vampResult.acquirer?.name} adjusted)`,
                    rate: `${vampResult.percentage}%`,
                    warn: `${(vampResult.effectiveWarning * 100).toFixed(3)}%`,
                    excess: `${(vampResult.effectiveExcessive * 100).toFixed(3)}%`,
                    status: vampResult.acquirerStatus,
                  },
                  ...(ecpResult ? [{
                    name: 'Mastercard ECP',
                    rate: `${ecpResult.percentage}%`,
                    warn: '1.500% + 100 CBs',
                    excess: '2.000% + 100 CBs',
                    status: ecpResult.status,
                  }] : []),
                  ...(efmResult ? [{
                    name: 'Mastercard EFM',
                    rate: `${efmResult.percentage}%`,
                    warn: '—',
                    excess: '0.650% + $75K fraud amt',
                    status: efmResult.status,
                  }] : []),
                ].map((row, i) => (
                  <tr key={i} style={{ background: i % 2 ? '#f8fafc' : 'white' }}>
                    <td style={{ ...S.td, fontWeight: 500 }}>{row.name}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 700 }}>{row.rate}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', color: '#92400e' }}>{row.warn}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', color: '#991b1b' }}>{row.excess}</td>
                    <td style={S.td}>
                      <span style={S.statusPill(getBandColor(row.status))}>
                        {row.status?.label ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Website checklist */}
          <div style={S.section}>
            <p style={S.sectionTitle}>Website Compliance Checklist</p>
            <div style={S.grid2}>
              {checklistKeys.map((key) => {
                const weight = CHECKLIST_WEIGHTS[key]?.weight ?? 0;
                const label = CHECKLIST_WEIGHTS[key]?.label ?? key;
                const passed = bankability?.checklistBreakdown?.find((b) => b.key === key)?.passed;
                const answered = passed !== undefined;
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                      background: !answered ? '#f8fafc' : passed ? '#f0fdf4' : '#fff1f2',
                      border: `1px solid ${!answered ? '#e2e8f0' : passed ? '#bbf7d0' : '#fecdd3'}`,
                      borderRadius: 6,
                    }}
                  >
                    <span style={{ color: !answered ? '#94a3b8' : passed ? '#16a34a' : '#dc2626', flexShrink: 0 }}>
                      {!answered ? '○' : passed ? '✓' : '✗'}
                    </span>
                    <span style={{ fontSize: 11, flex: 1, color: '#334155' }}>{label}</span>
                    <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>×{weight}</span>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: '#64748b', marginTop: 10 }}>
              Website compliance score: <strong>{bankability?.checklistEarned ?? 0}</strong>/{bankability?.checklistTotal ?? 100} points
            </p>
          </div>

          {/* Recommendations */}
          {bankability?.recommendations?.length > 0 && (
            <div style={S.section}>
              <p style={S.sectionTitle}>Remediation Recommendations</p>
              {bankability.recommendations.map((rec, i) => {
                const color = PRIORITY_COLORS[rec.priority] ?? '#94a3b8';
                return (
                  <div key={i} style={S.recBox(color)}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color, flexShrink: 0, marginTop: 1 }}>
                        [{PRIORITY_LABELS[rec.priority] ?? 'LOW'}]
                      </span>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {rec.category} — {' '}
                        </span>
                        <span style={{ fontSize: 12, color: '#1e293b', lineHeight: 1.5 }}>{rec.action}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Acquirer intelligence */}
          {vampResult.acquirerNote && (
            <div style={S.section}>
              <p style={S.sectionTitle}>Acquirer Intelligence</p>
              <div style={{ ...S.box, borderLeftColor: getBandColor(overallStatus), borderLeftWidth: 3 }}>
                <p style={{ fontSize: 12, color: '#334155', lineHeight: 1.6 }}>{vampResult.acquirerNote}</p>
                <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>
                  {TIER_LABELS[vampResult.acquirer?.tier] ?? 'Unknown tier'} ·
                  Risk appetite: {vampResult.acquirer?.riskAppetite ?? 'unknown'} ·
                  Effective warning: {(vampResult.effectiveWarning * 100).toFixed(2)}% ·
                  Effective excessive: {(vampResult.effectiveExcessive * 100).toFixed(2)}%
                </p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={S.footer}>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
              <p style={{ fontWeight: 700, color: '#92400e', marginBottom: 4 }}>⚠ Important Disclaimer</p>
              <p>
                This report is a diagnostic estimate based on provided data and does not guarantee bank approval or network compliance.
                VAMP ratios, ECP/EFM thresholds, and risk grades are calculated from merchant-supplied figures and are subject to change
                based on actual network programme updates. Consult your acquirer and a qualified payments risk advisor before making
                business decisions based on this output. Visa and Mastercard programme rules are authoritative; this tool is informational only.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>VAMP Merchant Risk Diagnostic Tool · 2026 Visa VAMP & Mastercard ECP/EFM Standards</span>
              <span>Generated: {reportDate} · All data processed client-side · Not affiliated with Visa or Mastercard</span>
            </div>
          </div>

        </div>{/* /page */}
      </div>{/* /report */}
    </div>
  );
}
