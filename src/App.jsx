import React, { useState, useCallback } from 'react';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import UploadSection from './components/UploadSection.jsx';
import MerchantForm from './components/MerchantForm.jsx';
import WebsiteAuditor from './components/WebsiteAuditor.jsx';
import Dashboard from './components/Dashboard.jsx';
import RiskReport from './components/RiskReport.jsx';
import { analyzeVAMP } from './utils/vampCalculator.js';
import { calculateECP, calculateEFM } from './utils/ecpEfmCalculator.js';
import { calculateBankabilityScore } from './utils/bankabilityScore.js';

// ── Default state ────────────────────────────────────────────────────────────

const DEFAULT_MERCHANT = {
  businessName: '',
  website: '',
  acquirerId: 'other',
  mccCode: '',
  statementPeriod: '',
  notes: '',
};

const DEFAULT_TXN = {
  totalSalesCount: '',
  totalSalesVolume: '',
  cnpTxnCount: '',
  tc15Count: '',
  tc40Count: '',
  fraudAmountUSD: '',
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

// ── Landing page ──────────────────────────────────────────────────────────────

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
        full Risk Health Report — with acquirer-adjusted risk grading and remediation guidance.
      </p>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center gap-2 mt-8 max-w-2xl">
        {[
          'Visa VAMP April 2026',
          'Mastercard ECP/EFM 2026',
          'Acquirer-Adjusted Grading',
          'Website Compliance Audit',
          'Bankability Score',
          'Printable Risk Report',
          'Privacy-First · No Data Stored',
          'CSV Auto-Parse',
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
          { step: '1', title: 'Enter Data', desc: 'Upload a CSV statement or manually enter transaction figures.' },
          { step: '2', title: 'Audit Website', desc: "Complete the dynamic compliance checklist for the merchant's site." },
          { step: '3', title: 'View Dashboard', desc: 'See your VAMP ratio, traffic-light status, and bankability score.' },
          { step: '4', title: 'Generate Report', desc: 'Print or save a professional Risk Health Report PDF.' },
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

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState('landing'); // landing | upload | checklist | dashboard | report
  const [merchant, setMerchant] = useState(DEFAULT_MERCHANT);
  const [txnData, setTxnData] = useState(DEFAULT_TXN);
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const [parsedWarnings, setParsedWarnings] = useState([]);
  const [results, setResults] = useState(null);

  const updateMerchant = useCallback((patch) => {
    setMerchant((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateTxnData = useCallback((patch) => {
    setTxnData((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateChecklist = useCallback((patch) => {
    setChecklist((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleParsed = useCallback((data, warnings) => {
    setTxnData((prev) => ({
      ...prev,
      totalSalesCount:  data.totalSalesCount  || prev.totalSalesCount,
      totalSalesVolume: data.totalSalesVolume || prev.totalSalesVolume,
      cnpTxnCount:      data.cnpTxnCount      || prev.cnpTxnCount,
      tc15Count:        data.tc15Count         || prev.tc15Count,
      tc40Count:        data.tc40Count         || prev.tc40Count,
      fraudAmountUSD:   data.fraudAmountUSD    || prev.fraudAmountUSD,
    }));
    setParsedWarnings(warnings);
  }, []);

  /**
   * Called by UploadSection's "Update VAMP Dashboard Now" button.
   *
   * Accepts the freshly-parsed data object directly so we compute results
   * without touching the (potentially stale) txnData state.  We still update
   * txnData so the form fields reflect the parsed values if the user scrolls
   * back to the data-entry view.
   */
  const handleRunDashboard = useCallback((parsedData, warnings) => {
    // 1. Merge parsed values into form state (for display/editing)
    const merged = {
      ...txnData,
      totalSalesCount:  parsedData.totalSalesCount  || txnData.totalSalesCount  || 0,
      totalSalesVolume: parsedData.totalSalesVolume || txnData.totalSalesVolume || 0,
      cnpTxnCount:      parsedData.cnpTxnCount      || txnData.cnpTxnCount      || 0,
      tc15Count:        parsedData.tc15Count         || txnData.tc15Count        || 0,
      tc40Count:        parsedData.tc40Count         || txnData.tc40Count        || 0,
      fraudAmountUSD:   parsedData.fraudAmountUSD    || txnData.fraudAmountUSD   || 0,
    };
    setTxnData(merged);
    if (warnings?.length) setParsedWarnings(warnings);

    // 2. Compute results synchronously from the fresh merged object
    //    (bypasses React's batched state — txnData is stale here).
    const tc40     = Number(merged.tc40Count)     || 0;
    const tc15     = Number(merged.tc15Count)      || 0;
    const cnp      = Number(merged.cnpTxnCount)    || 0;
    const tot      = Number(merged.totalSalesCount) || cnp;
    const fraudAmt = Number(merged.fraudAmountUSD)  || 0;

    const vampResult = analyzeVAMP({ tc40Count: tc40, tc15Count: tc15, cnpTxnCount: cnp, acquirerId: merchant.acquirerId });
    const ecpResult  = cnp > 0 && tc15 > 0 ? calculateECP({ chargebackCount: tc15, totalTxnCount: tot || cnp }) : null;
    const efmResult  = cnp > 0 && (tc40 > 0 || fraudAmt > 0) ? calculateEFM({ fraudCount: tc40, cnpTxnCount: cnp, fraudAmountUSD: fraudAmt }) : null;

    const scoringChecklist = Object.fromEntries(Object.entries(checklist).map(([k, v]) => [k, v === true]));
    const bankability = calculateBankabilityScore({ vampResult, ecpResult, efmResult, checklist: scoringChecklist });

    // 3. Commit results and navigate immediately
    setResults({ vampResult, ecpResult, efmResult, bankability });
    setView('dashboard');
  }, [txnData, merchant.acquirerId, checklist]);

  /** Run all calculations and move to the dashboard. */
  const runAnalysis = useCallback(() => {
    const tc40 = Number(txnData.tc40Count) || 0;
    const tc15 = Number(txnData.tc15Count) || 0;
    const cnp  = Number(txnData.cnpTxnCount) || 0;
    const tot  = Number(txnData.totalSalesCount) || cnp;
    const fraudAmt = Number(txnData.fraudAmountUSD) || 0;

    const vampResult = analyzeVAMP({
      tc40Count:   tc40,
      tc15Count:   tc15,
      cnpTxnCount: cnp,
      acquirerId:  merchant.acquirerId,
    });

    const ecpResult = cnp > 0 && tc15 > 0
      ? calculateECP({ chargebackCount: tc15, totalTxnCount: tot || cnp })
      : null;

    const efmResult = cnp > 0 && (tc40 > 0 || fraudAmt > 0)
      ? calculateEFM({ fraudCount: tc40, cnpTxnCount: cnp, fraudAmountUSD: fraudAmt })
      : null;

    // Coerce null checklist values to false for scoring
    const scoringChecklist = Object.fromEntries(
      Object.entries(checklist).map(([k, v]) => [k, v === true])
    );

    const bankability = calculateBankabilityScore({
      vampResult,
      ecpResult,
      efmResult,
      checklist: scoringChecklist,
    });

    setResults({ vampResult, ecpResult, efmResult, bankability });
  }, [txnData, merchant, checklist]);

  const handleGoToDashboard = useCallback(() => {
    runAnalysis();
    setView('dashboard');
  }, [runAnalysis]);

  // Re-run analysis when navigating back to dashboard from report
  const handleNavigate = useCallback((target) => {
    if (target === 'dashboard' && results) {
      runAnalysis();
    }
    setView(target);
  }, [results, runAnalysis]);

  const reset = () => {
    setMerchant(DEFAULT_MERCHANT);
    setTxnData(DEFAULT_TXN);
    setChecklist(DEFAULT_CHECKLIST);
    setParsedWarnings([]);
    setResults(null);
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
                  Upload a processing statement or enter figures manually
                </p>
              </div>
              <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                ← Landing
              </button>
            </div>

            <div className="card p-6">
              <UploadSection
                onParsed={handleParsed}
                onRunDashboard={handleRunDashboard}
              />
            </div>

            <div className="card p-6">
              <MerchantForm
                merchant={merchant}
                txnData={txnData}
                onChange={updateMerchant}
                onTxnChange={updateTxnData}
                parsedWarnings={parsedWarnings}
                onNext={() => setView('checklist')}
              />
            </div>
          </div>
        )}

        {/* ── Website Auditor ── */}
        {view === 'checklist' && (
          <div className="max-w-3xl mx-auto px-4 py-10 animate-slide-up">
            <WebsiteAuditor
              merchant={merchant}
              checklist={checklist}
              onChange={updateChecklist}
              onBack={() => setView('upload')}
              onNext={handleGoToDashboard}
            />
          </div>
        )}

        {/* ── Dashboard ── */}
        {view === 'dashboard' && results && (
          <div className="max-w-7xl mx-auto px-4 py-10 animate-slide-up">
            <Dashboard
              merchant={merchant}
              txnData={txnData}
              vampResult={results.vampResult}
              ecpResult={results.ecpResult}
              efmResult={results.efmResult}
              bankability={results.bankability}
              onNext={() => setView('report')}
            />
          </div>
        )}

        {/* ── Report ── */}
        {view === 'report' && results && (
          <div className="max-w-5xl mx-auto px-4 py-10 animate-slide-up">
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

        {/* Fallback if dashboard/report state lost */}
        {(view === 'dashboard' || view === 'report') && !results && (
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
