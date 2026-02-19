import React from 'react';
import { Info, ChevronRight } from 'lucide-react';
import { ACQUIRERS } from '../data/acquirers.js';
import { MCC_CODES } from '../data/thresholds.js';

const FIELD_TIPS = {
  cnpTxnCount:
    'Card-Not-Present (eCommerce/online) transaction count. VAMP applies to CNP only. If unknown, use total transaction count.',
  mastercardTxnCount:
    'Total Mastercard transaction count for this period. Used as the ECP denominator (chargebacks ÷ Mastercard txns). Found in the "Summary By Card Type" table on your statement — look for the Mastercard row\'s "Items" count.',
  tc15Count:
    'TC15 = Visa dispute / chargeback count. Use the "Dispute/Chargeback" line from your acquiring bank statement.',
  tc40Count:
    'TC40 = Fraud reports. Found on Visa issuer fraud reports or your fraud monitoring dashboard.',
  fraudAmountUSD:
    'Total dollar amount of fraud (TC40). Required for Mastercard EFM threshold check ($75K floor).',
};

function Tip({ text }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span className="relative inline-block ml-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-slate-500 hover:text-blue-400 transition-colors align-middle"
      >
        <Info size={13} />
      </button>
      {open && (
        <div className="absolute z-20 left-5 top-0 w-64 bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs text-slate-300 shadow-xl">
          {text}
          <button onClick={() => setOpen(false)} className="block mt-2 text-blue-400 hover:text-blue-300">
            Close
          </button>
        </div>
      )}
    </span>
  );
}

function NumericInput({ id, label, value, onChange, placeholder, tip, prefix, suffix }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {tip && <Tip text={tip} />}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="number"
          min="0"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          placeholder={placeholder ?? '0'}
          className={`input-field font-mono ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-8' : ''}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export default function MerchantForm({ merchant, txnData, onChange, onTxnChange, onNext, parsedWarnings }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    onNext();
  };

  const isValid = txnData.cnpTxnCount > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-fade-in">
      {/* Merchant profile */}
      <section className="space-y-4">
        <h3 className="section-title flex items-center gap-2 text-base">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
          Merchant Profile
        </h3>
        <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Business / DBA Name</label>
            <input
              type="text"
              value={merchant.businessName}
              onChange={(e) => onChange({ businessName: e.target.value })}
              placeholder="Acme Supplements LLC"
              className="input-field"
            />
          </div>

          <div>
            <label className="label">Website URL</label>
            <input
              type="url"
              value={merchant.website}
              onChange={(e) => onChange({ website: e.target.value })}
              placeholder="https://example.com"
              className="input-field"
            />
          </div>

          <div>
            <label className="label">Acquirer / Processing Bank</label>
            <select
              value={merchant.acquirerId}
              onChange={(e) => onChange({ acquirerId: e.target.value })}
              className="input-field"
            >
              {ACQUIRERS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">MCC Code</label>
            <select
              value={merchant.mccCode}
              onChange={(e) => onChange({ mccCode: e.target.value })}
              className="input-field"
            >
              <option value="">— Select MCC —</option>
              {MCC_CODES.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Statement Period</label>
            <input
              type="text"
              value={merchant.statementPeriod}
              onChange={(e) => onChange({ statementPeriod: e.target.value })}
              placeholder="e.g. January 2026"
              className="input-field"
            />
          </div>
        </div>
      </section>

      {/* Transaction data */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="section-title flex items-center gap-2 text-base">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">2</span>
            Transaction Data
          </h3>
          {parsedWarnings?.length > 0 && (
            <span className="text-xs text-yellow-400 flex items-center gap-1">
              <Info size={11} /> Parsed values may need adjustment
            </span>
          )}
        </div>

        <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumericInput
            id="cnpTxnCount"
            label="CNP Transactions *"
            value={txnData.cnpTxnCount || ''}
            onChange={(v) => onTxnChange({ cnpTxnCount: v })}
            placeholder="e.g. 8500"
            tip={FIELD_TIPS.cnpTxnCount}
          />
          <NumericInput
            id="mastercardTxnCount"
            label="Mastercard Transactions"
            value={txnData.mastercardTxnCount || ''}
            onChange={(v) => onTxnChange({ mastercardTxnCount: v })}
            placeholder="e.g. 3200"
            tip={FIELD_TIPS.mastercardTxnCount}
          />
          <NumericInput
            id="totalSalesCount"
            label="Total Transaction Count"
            value={txnData.totalSalesCount || ''}
            onChange={(v) => onTxnChange({ totalSalesCount: v })}
            placeholder="e.g. 10000"
          />
          <NumericInput
            id="totalSalesVolume"
            label="Total Sales Volume"
            value={txnData.totalSalesVolume || ''}
            onChange={(v) => onTxnChange({ totalSalesVolume: v })}
            placeholder="e.g. 500000"
            prefix="$"
          />
          <NumericInput
            id="tc15Count"
            label="Chargeback Count (TC15)"
            value={txnData.tc15Count || ''}
            onChange={(v) => onTxnChange({ tc15Count: v })}
            placeholder="e.g. 45"
            tip={FIELD_TIPS.tc15Count}
          />
          <NumericInput
            id="tc40Count"
            label="Fraud Reports (TC40)"
            value={txnData.tc40Count || ''}
            onChange={(v) => onTxnChange({ tc40Count: v })}
            placeholder="e.g. 22"
            tip={FIELD_TIPS.tc40Count}
          />
          <NumericInput
            id="fraudAmountUSD"
            label="Fraud Dollar Amount"
            value={txnData.fraudAmountUSD || ''}
            onChange={(v) => onTxnChange({ fraudAmountUSD: v })}
            placeholder="e.g. 11000"
            prefix="$"
            tip={FIELD_TIPS.fraudAmountUSD}
          />
        </div>

        {/* Live preview */}
        {txnData.cnpTxnCount > 0 && (
          <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-3">
            <p className="text-xs text-blue-300 font-medium mb-1">VAMP Ratio Preview</p>
            <p className="font-mono text-lg font-bold text-white">
              {(
                ((Number(txnData.tc40Count) + Number(txnData.tc15Count)) /
                  Number(txnData.cnpTxnCount)) *
                100
              ).toFixed(4)}
              <span className="text-slate-400 text-sm font-normal">% </span>
              <span className="text-slate-500 text-xs font-normal font-sans">
                ({Number(txnData.tc40Count) + Number(txnData.tc15Count)} combined ÷{' '}
                {Number(txnData.cnpTxnCount).toLocaleString()} CNP)
              </span>
            </p>
          </div>
        )}
      </section>

      {/* Notes */}
      <section className="space-y-2">
        <label className="label">Consultant Notes (optional)</label>
        <textarea
          value={merchant.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="e.g. Client is on a rolling reserve. Statement from Chase dated Jan 2026. High fraud likely from card testing attack in Q4 2025."
          rows={3}
          className="input-field resize-none"
        />
      </section>

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-slate-500">
          {!isValid
            ? <span className="text-amber-500">↑ CNP transaction count required to calculate VAMP</span>
            : '* Required for VAMP calculation'
          }
        </p>
        <button
          type="submit"
          disabled={!isValid}
          className="btn-primary"
        >
          Generate Report
          <ChevronRight size={16} />
        </button>
      </div>
    </form>
  );
}
