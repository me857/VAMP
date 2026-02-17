import React from 'react';
import { ShieldAlert, Lock } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="no-print mt-auto border-t border-slate-800 bg-slate-950/80 py-6 px-4">
      <div className="max-w-7xl mx-auto space-y-3">
        {/* Liability disclaimer */}
        <div className="flex items-start gap-3 bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
          <ShieldAlert size={16} className="text-yellow-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-300">Disclaimer: </span>
            This report is a diagnostic estimate based on provided data and does not guarantee bank
            approval or network compliance. VAMP ratios, ECP/EFM thresholds, and risk grades are
            calculated from merchant-supplied figures and are subject to change based on actual
            network programme updates. Consult your acquirer and a qualified payments risk advisor
            before making business decisions based on this output. Visa and Mastercard programme
            rules are authoritative; this tool is informational only.
          </p>
        </div>

        {/* Privacy notice */}
        <div className="flex items-start gap-3 bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
          <Lock size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-300">Privacy: </span>
            All data entered or uploaded (including merchant names, MIDs, and transaction figures)
            is processed entirely in your browser. No data is transmitted to any server, stored
            permanently, or shared with third parties. Uploaded files are parsed in-memory and
            immediately discarded. Session data is cleared when you close or refresh the page.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
          <p className="text-xs text-slate-600">
            VAMP Merchant Risk Diagnostic Tool · 2026 Visa VAMP & Mastercard ECP/EFM Standards
          </p>
          <p className="text-xs text-slate-600">
            Built for payments risk consultants · Not affiliated with Visa or Mastercard
          </p>
        </div>
      </div>
    </footer>
  );
}
