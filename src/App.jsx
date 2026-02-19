import React, { useState, useCallback } from 'react';
import { ChevronDown, ArrowRight } from 'lucide-react';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import UploadSection from './components/UploadSection.jsx';
import MerchantForm from './components/MerchantForm.jsx';
import WebsiteAuditor from './components/WebsiteAuditor.jsx';
import Dashboard from './components/Dashboard.jsx';
import RiskReport from './components/RiskReport.jsx';
import LeadGate from './components/LeadGate.jsx';
import MentorAnalysis from './components/MentorAnalysis.jsx';
import { VolumeDisputesChart, VAMPGauge } from './components/TrendCharts.jsx';
import { analyzeVAMP } from './utils/vampCalculator.js';
import { calculateECP, calculateEFM } from './utils/ecpEfmCalculator.js';
import { calculateBankabilityScore } from './utils/bankabilityScore.js';
import { buildTrendSummary } from './utils/trendCalculator.js';
import { sendLeadToWebhook } from './utils/leadCapture.js';

// ── Default state ─────────────────────────────────────────────────────────

const DEFAULT_MERCHANT = {
  businessName: '',
  website: '',
  acquirerId: 'other',
  mccCode: '',
  statementPeriod: '',
  notes: '',
};

const DEFAULT_TXN = {
  totalSalesCount:    '',
  totalSalesVolume:   '',
  cnpTxnCount:        '',
  mastercardTxnCount: '',  // Mastercard-specific count for ECP denominator
  tc15Count:          '',
  tc40Count:          '',
  fraudAmountUSD:     '',
};

const DEFAULT_CHECKLIST = {
  hasTermsAndConditions:   null,
  termsEasyToFind:         null,
  hasRefundPolicy:         null,
  refundPolicyVisible:     null,
  hasOneClickCancellation: null,
  has3DS2:                 null,
  mccMatchesDescriptor:    null,
  hasContactInfo:          null,
  hasPhysicalAddress:      null,
};

// ── Landing page ──────────────────────────────────────────────────────────

function LandingHero({ onStart }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-fade-in">
      <div className="flex items-center justify-center w-20 h-20 bg-blue-600 rounded-2xl shadow-2xl shadow-blue-900/50 mb-8">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10 text-white">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      </div>

      <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight max-w-2xl">
        Merchant Risk
        <span className="text-gradient"> Diagnostic Tool</span>
      </h1>

      <p className="text-lg text-slate-400 mt-4 max-w-xl leading-relaxed">
        Instantly calculate Visa VAMP ratios, Mastercard ECP/EFM status, and generate a
        full Risk Health Report — with trend charts, acquirer-adjusted risk grading, and
        Mentor&apos;s Analysis.
      </p>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center gap-2 mt-8 max-w-2xl">
        {[
          'Visa VAMP April 2026',
          'Mastercard ECP/EFM 2026',
          'Acquirer-Adjusted Grading',
          'Website Compliance Audit',
          'Bankability Score',
          '3-Month Rolling Average',
          'VAMP Threshold Gauge',
          "Mentor's Analysis",
          'Printable Risk Report',
          'Privacy-First · No Data Stored',
          'CSV Auto-Parse',
          'Multi-Month Trend Charts',
        ].map((tag) => (
          <span key={tag} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-full text-xs text-slate-300">
            {tag}
          </span>
        ))}
      </div>

      <button onClick={onStart} className="btn-primary mt-10 px-8 py-3 text-base">
        Start Diagnostic
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </button>

      <p className="text-xs text-slate-600 mt-6 max-w-md">
        All data is processed in your browser. Nothing is uploaded or stored. Close the tab to clear all session data.
      </p>

      {/* How it works */}
      <div className="mt-16 grid grid-cols-1 sm:grid-cols-4 gap-4 max-w-3xl w-full text-left">
        {[
          { step: '1', title: 'Upload Statements', desc: 'Drop up to 3 months of CSV statements for trend analysis.' },
          { step: '2', title: 'Audit Website',     desc: "Complete the dynamic compliance checklist for the merchant's site." },
          { step: '3', title: 'Unlock Report',     desc: 'Enter your details to unlock the full Risk Health Report.' },
          { step: '4', title: 'View & Print',      desc: 'See gauges, trend charts, and export a professional PDF.' },
        ].map((item) => (
          <div key={item.step} className="card-hover p-4">
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold mb-3">
              {item.step}
            </div>
            <h3 className="text-sm font-semibold text-white">{item.title}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helper: run all calculators synchronously from raw data ───────────────

function runCalculators({ txnData, monthlyData, merchant, checklist }) {
  const tc40     = Number(txnData.tc40Count)          || 0;
  const tc15     = Number(txnData.tc15Count)          || 0;
  const cnp      = Number(txnData.cnpTxnCount)        || 0;
  const tot      = Number(txnData.totalSalesCount)    || cnp;
  const mc       = Number(txnData.mastercardTxnCount) || 0;  // Mastercard-specific count
  const fraudAmt = Number(txnData.fraudAmountUSD)     || 0;

  const vampResult = analyzeVAMP({
    tc40Count:   tc40,
    tc15Count:   tc15,
    cnpTxnCount: cnp,
    acquirerId:  merchant.acquirerId,
  });

  // ECP denominator: prefer Mastercard-specific count, then CNP total, then gross total
  const ecpTxnCount = mc || cnp || tot;
  const ecpResult = ecpTxnCount > 0
    ? calculateECP({ chargebackCount: tc15, totalTxnCount: ecpTxnCount })
    : null;

  const efmResult = cnp > 0 && (tc40 > 0 || fraudAmt > 0)
    ? calculateEFM({ fraudCount: tc40, cnpTxnCount: cnp, fraudAmountUSD: fraudAmt })
    : null;

  // Pass raw checklist (null = not assessed, true/false = answered)
  const bankability = calculateBankabilityScore({ vampResult, ecpResult, efmResult, checklist });

  const trendSummary = buildTrendSummary(monthlyData ?? []);

  return { vampResult, ecpResult, efmResult, bankability, trendSummary };
}

// ── Collapsible website audit section (upload page) ───────────────────────

function WebsiteAuditSection({ merchant, checklist, onChange, onGenerate }) {
  const [open, setOpen] = useState(false);
  const answered = Object.values(checklist).filter((v) => v !== null && v !== undefined).length;

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-800/30 transition-colors"
      >
        <div>
          <p className="text-sm font-semibold text-slate-200">
            Website Compliance Audit
            <span className="ml-2 text-xs font-normal text-blue-400">Optional · adds Bankability Score</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {answered > 0
              ? `${answered} of 9 items reviewed — included in this report`
              : 'Skip for VAMP/ECP only, or expand to score your website compliance'}
          </p>
        </div>
        <ChevronDown
          size={16}
          className={`text-slate-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-slate-800">
          <div className="p-5">
            <WebsiteAuditor
              merchant={merchant}
              checklist={checklist}
              onChange={onChange}
              inline
            />
          </div>
          <div className="px-5 pb-5">
            <button onClick={onGenerate} className="btn-primary w-full justify-center gap-2 py-3">
              Generate Full Report with Website Analysis
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────

export default function App() {
  // views: landing | upload | dashboard | gate | report
  const [view,          setView]          = useState('landing');
  const [merchant,      setMerchant]      = useState(DEFAULT_MERCHANT);
  const [txnData,       setTxnData]       = useState(DEFAULT_TXN);
  const [checklist,     setChecklist]     = useState(DEFAULT_CHECKLIST);
  const [parsedWarnings, setParsedWarnings] = useState([]);
  const [monthlyData,   setMonthlyData]   = useState([]); // array of parsed monthly objects
  const [results,       setResults]       = useState(null);
  const [lead,          setLead]          = useState(null);

  // ── State updaters ────────────────────────────────────────────────────

  const updateMerchant  = useCallback((patch) => setMerchant((p) => ({ ...p, ...patch })), []);
  const updateTxnData   = useCallback((patch) => setTxnData((p) => ({ ...p, ...patch })), []);
  const updateChecklist = useCallback((patch) => setChecklist((p) => ({ ...p, ...patch })), []);

  // Called when UploadSection parses files — pre-fills the form with latest month.
  // Uses detectedFields to avoid overwriting existing form values with 0 when the
  // PDF could not extract a field (e.g. salesCount not found → cnpTxnCount = 0
  // which is NOT the same as "genuinely zero transactions").
  const handleParsed = useCallback((latestMonthData, warnings) => {
    const detected = latestMonthData.detectedFields ?? {};
    setTxnData((prev) => ({
      ...prev,
      totalSalesCount:    detected.totalSalesCount    ? latestMonthData.totalSalesCount    : prev.totalSalesCount,
      totalSalesVolume:   detected.totalSalesVolume   ? latestMonthData.totalSalesVolume   : prev.totalSalesVolume,
      cnpTxnCount:        detected.cnpTxnCount        ? latestMonthData.cnpTxnCount        : prev.cnpTxnCount,
      mastercardTxnCount: detected.mastercardTxnCount ? latestMonthData.mastercardTxnCount : prev.mastercardTxnCount,
      tc15Count:          detected.tc15Count          ? latestMonthData.tc15Count          : prev.tc15Count,
      tc40Count:          detected.tc40Count          ? latestMonthData.tc40Count          : prev.tc40Count,
      fraudAmountUSD:     detected.fraudAmountUSD     ? latestMonthData.fraudAmountUSD     : prev.fraudAmountUSD,
    }));
    // Pre-fill statement period when extracted from PDF and not yet manually set
    if (detected.statementPeriod && latestMonthData.statementPeriod) {
      setMerchant((prev) =>
        prev.statementPeriod ? prev : { ...prev, statementPeriod: latestMonthData.statementPeriod }
      );
    }
    setParsedWarnings(warnings);
  }, []);

  // ── Submit from UploadSection (CSV files parsed, button clicked) ──────

  const handleUploadSubmit = useCallback((csvMonths) => {
    // Store all monthly data for trend charts
    setMonthlyData(csvMonths);

    // Use the most recent month's data to pre-fill form and run analysis
    const latest = csvMonths[csvMonths.length - 1];
    const merged = {
      totalSalesCount:    latest.totalSalesCount    ?? 0,
      totalSalesVolume:   latest.totalSalesVolume   ?? 0,
      cnpTxnCount:        latest.cnpTxnCount        ?? 0,
      mastercardTxnCount: latest.mastercardTxnCount ?? '',  // keep null-extracted as empty
      tc15Count:          latest.tc15Count          ?? 0,
      tc40Count:          latest.tc40Count          ?? 0,
      fraudAmountUSD:     latest.fraudAmountUSD     ?? 0,
    };
    // Pre-fill statement period from PDF-extracted value if not already set
    if (latest.statementPeriod) {
      setMerchant((prev) =>
        prev.statementPeriod ? prev : { ...prev, statementPeriod: latest.statementPeriod }
      );
    }

    const computed = runCalculators({
      txnData:     merged,
      monthlyData: csvMonths,
      merchant,
      checklist,
    });

    setTxnData(merged);
    setResults(computed);
    setView('gate');
  }, [merchant, checklist]);

  // ── Generate report — runs calculators then shows email gate ─────────

  const handleGoToDashboard = useCallback(() => {
    const computed = runCalculators({ txnData, monthlyData, merchant, checklist });
    setResults(computed);
    setView('gate');
  }, [txnData, monthlyData, merchant, checklist]);

  // ── Lead gate submit ──────────────────────────────────────────────────

  const handleLeadSubmit = useCallback(async (leadData) => {
    setLead(leadData);
    await sendLeadToWebhook({
      ...leadData,
      businessName:   merchant.businessName,
      website:        merchant.website,
      acquirerId:     merchant.acquirerId,
    });
    setView('dashboard');
  }, [merchant]);

  // ── Refresh dashboard in-place (called from inline website audit) ─────

  const handleRefreshDashboard = useCallback(() => {
    const computed = runCalculators({ txnData, monthlyData, merchant, checklist });
    setResults(computed);
  }, [txnData, monthlyData, merchant, checklist]);

  // ── Navigation ────────────────────────────────────────────────────────

  const handleNavigate = useCallback((target) => {
    if (target === 'dashboard' && results) {
      // Re-run when navigating back to dashboard
      const computed = runCalculators({ txnData, monthlyData, merchant, checklist });
      setResults(computed);
    }
    setView(target);
  }, [results, txnData, monthlyData, merchant, checklist]);

  const reset = () => {
    setMerchant(DEFAULT_MERCHANT);
    setTxnData(DEFAULT_TXN);
    setChecklist(DEFAULT_CHECKLIST);
    setParsedWarnings([]);
    setMonthlyData([]);
    setResults(null);
    setLead(null);
    setView('landing');
  };

  const hasResults = Boolean(results);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      {view !== 'landing' && (
        <Header
          currentView={view}
          onNavigate={handleNavigate}
          hasResults={hasResults}
        />
      )}

      <main className="flex-1">

        {/* ── Landing ── */}
        {view === 'landing' && (
          <LandingHero onStart={() => setView('upload')} />
        )}

        {/* ── Data Entry ── */}
        {view === 'upload' && (
          <div className="max-w-3xl mx-auto px-4 py-10 space-y-8 animate-slide-up">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-white">Data Entry</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Upload processing statement(s) or enter figures manually
                </p>
              </div>
              <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                ← Landing
              </button>
            </div>

            <div className="card p-6">
              <UploadSection
                onParsed={handleParsed}
                onManualEntry={() => {}}
                onSubmit={handleUploadSubmit}
              />
            </div>

            <div className="card p-6">
              <MerchantForm
                merchant={merchant}
                txnData={txnData}
                onChange={updateMerchant}
                onTxnChange={updateTxnData}
                parsedWarnings={parsedWarnings}
                onNext={handleGoToDashboard}
              />
            </div>

            {/* Optional website audit — expand to include Bankability Score */}
            <WebsiteAuditSection
              merchant={merchant}
              checklist={checklist}
              onChange={updateChecklist}
              onGenerate={handleGoToDashboard}
            />
          </div>
        )}

        {/* ── Dashboard ── */}
        {view === 'dashboard' && results && (
          <div className="max-w-5xl mx-auto px-4 py-10 animate-slide-up">
            <Dashboard
              merchant={merchant}
              txnData={txnData}
              vampResult={results.vampResult}
              ecpResult={results.ecpResult}
              efmResult={results.efmResult}
              bankability={results.bankability}
              checklist={checklist}
              onChecklistChange={updateChecklist}
              onRefreshAnalysis={handleRefreshDashboard}
              onNext={() => setView('report')}
            />
          </div>
        )}

        {/* ── Lead Gate ── */}
        {view === 'gate' && results && (
          <LeadGate
            vampResult={results.vampResult}
            bankability={results.bankability}
            onSubmit={handleLeadSubmit}
          />
        )}

        {/* ── Report ── */}
        {view === 'report' && results && (
          <div className="max-w-5xl mx-auto px-4 py-10 animate-slide-up space-y-8">

            {/* Mentor's Analysis + Gauge + Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Gauge */}
              <div className="card p-5 flex flex-col justify-center">
                <VAMPGauge
                  vampRatio={results.vampResult?.vampRatio ?? 0}
                  label={results.vampResult?.visaStatus ?? '—'}
                />
                {results.trendSummary?.rolling3Month?.ratio != null && (
                  <p className="text-center text-xs text-slate-500 mt-3">
                    3-mo avg:{' '}
                    <span className="text-slate-300 font-mono font-semibold">
                      {(results.trendSummary.rolling3Month.ratio * 100).toFixed(2)}%
                    </span>
                  </p>
                )}
              </div>

              {/* Right: Mentor's Analysis (spans 2 cols) */}
              <div className="lg:col-span-2">
                <MentorAnalysis
                  vampResult={results.vampResult}
                  trendSummary={results.trendSummary}
                  ecpResult={results.ecpResult}
                  efmResult={results.efmResult}
                />
              </div>
            </div>

            {/* Trend chart — only if multiple months */}
            {results.trendSummary?.hasMultipleMonths && (
              <div className="card p-5">
                <VolumeDisputesChart months={results.trendSummary.months} />
              </div>
            )}

            {/* Risk Report (printable) */}
            <RiskReport
              merchant={merchant}
              txnData={txnData}
              vampResult={results.vampResult}
              ecpResult={results.ecpResult}
              efmResult={results.efmResult}
              bankability={results.bankability}
              onBack={() => setView('dashboard')}
            />
          </div>
        )}

        {/* Fallback if dashboard/gate/report state lost */}
        {(view === 'dashboard' || view === 'gate' || view === 'report') && !results && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <p className="text-slate-400">No analysis data found.</p>
            <button onClick={() => setView('upload')} className="btn-primary">
              Go to Data Entry
            </button>
          </div>
        )}

      </main>

      {view !== 'landing' && <Footer />}
    </div>
  );
}
