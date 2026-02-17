import React, { useRef, useState } from 'react';
import {
  Upload, FileText, FileSpreadsheet, AlertCircle, Download,
  X, CheckCircle, Lock, ShieldCheck, BarChart3, Loader2, FileWarning,
} from 'lucide-react';
import { parseStatement, generateCSVTemplate } from '../utils/statementParser.js';

// ── Privacy notice — always visible ──────────────────────────────────────────
function PrivacyNotice() {
  return (
    <div className="flex items-start gap-3 bg-blue-950/40 border border-blue-800/50 rounded-xl px-4 py-3">
      <Lock size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-blue-300 leading-relaxed">
        <span className="font-semibold text-blue-200">Privacy guaranteed: </span>
        Data is processed locally in your browser. No financial data is ever
        uploaded or stored on our servers.
      </p>
    </div>
  );
}

// ── Extracted data grid ───────────────────────────────────────────────────────
const DISPLAY_FIELDS = [
  { key: 'totalSalesCount',  label: 'Sales Count',        format: (v) => Number(v).toLocaleString(), primary: true },
  { key: 'totalSalesVolume', label: 'Gross Volume',        format: (v) => `$${Number(v).toLocaleString()}`, primary: true },
  { key: 'cnpTxnCount',      label: 'CNP Transactions',   format: (v) => Number(v).toLocaleString(), primary: false },
  { key: 'tc15Count',        label: 'Chargeback Count',   format: (v) => Number(v).toLocaleString(), primary: true },
  { key: 'tc40Count',        label: 'Fraud Count',        format: (v) => Number(v).toLocaleString(), primary: true },
  { key: 'fraudAmountUSD',   label: 'Fraud Amount',       format: (v) => `$${Number(v).toLocaleString()}`, primary: false },
];

function ExtractedDataGrid({ data }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {DISPLAY_FIELDS.map(({ key, label, format, primary }) => {
        const val = data[key];
        const hasValue = val !== undefined && val !== null && val !== 0;
        return (
          <div
            key={key}
            className={`rounded-lg p-2.5 ${
              primary && !hasValue
                ? 'bg-yellow-950/30 border border-yellow-800/30'
                : 'bg-slate-900/60 border border-slate-700/30'
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider font-medium text-slate-500 mb-0.5">
              {label}
              {primary && <span className="ml-1 text-blue-500">★</span>}
            </p>
            {hasValue ? (
              <p className="text-sm font-mono font-semibold text-white">{format(val)}</p>
            ) : (
              <p className="text-sm font-mono text-slate-600 italic">not found</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Parsing progress indicator ────────────────────────────────────────────────
function ParsingSpinner({ isPdf }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <Loader2 size={28} className="text-blue-400 animate-spin" />
      <div className="text-center">
        <p className="text-sm font-medium text-slate-200">
          {isPdf ? 'Extracting text from PDF…' : 'Parsing CSV…'}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {isPdf
            ? 'Running PDF.js locally — nothing leaves your browser'
            : 'Matching column headers and keywords…'}
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UploadSection({ onParsed, onRunDashboard }) {
  const fileRef   = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [parsing,  setParsing]  = useState(false);
  const [isPdf,    setIsPdf]    = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);

  const handleFile = async (file) => {
    if (!file) return;
    setError(null);
    setResult(null);
    const pdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    setIsPdf(pdf);
    setParsing(true);

    try {
      const res = await parseStatement(file);
      const enriched = { ...res, filename: file.name, fileType: pdf ? 'pdf' : 'csv' };
      setResult(enriched);

      // Always notify parent of parsed data (even partial PDF data)
      if (res.data) {
        onParsed(res.data, res.warnings ?? []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const clearResult = () => {
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const canRunDashboard = result?.data && result.data.cnpTxnCount > 0;

  return (
    <div className="space-y-4">

      {/* ── Always-visible privacy notice ── */}
      <PrivacyNotice />

      {/* ── Section header ── */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Upload Processing Statement</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            CSV or PDF · Parsed entirely in-browser · Keywords detected automatically
          </p>
        </div>
        <button
          onClick={generateCSVTemplate}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          <Download size={12} />
          CSV Template
        </button>
      </div>

      {/* ── Drop zone (hidden once a result is showing) ── */}
      {!result && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => !parsing && fileRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl
            border-2 border-dashed transition-all duration-200
            ${parsing ? 'cursor-default border-blue-700/50 bg-blue-950/20'
              : dragging ? 'cursor-copy border-blue-500 bg-blue-950/30'
              : 'cursor-pointer border-slate-700 bg-slate-900/40 hover:border-slate-500 hover:bg-slate-900/60'}
          `}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />

          {parsing ? (
            <ParsingSpinner isPdf={isPdf} />
          ) : (
            <>
              <div className="flex items-center gap-4 text-slate-600">
                <FileSpreadsheet size={30} />
                <div className="flex flex-col items-center gap-1">
                  <Upload size={18} />
                  <span className="text-[10px] text-slate-600 uppercase tracking-widest">drop or click</span>
                </div>
                <FileText size={30} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-300">
                  Drop your statement here or click to browse
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  <span className="text-blue-400 font-mono">.csv</span>{' '}column headers or keyword rows ·{' '}
                  <span className="text-blue-400 font-mono">.pdf</span>{' '}text extraction via PDF.js
                </p>
                <p className="text-xs text-slate-600 mt-2">
                  Looks for: <span className="text-slate-500 font-mono">Sales Count · Chargeback Count · Fraud Count · Gross Volume</span>
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Result card ── */}
      {result && (
        <div className="card animate-fade-in">
          {/* Card header */}
          <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl border-b border-slate-700/50 ${
            result.data ? 'bg-green-950/30' : 'bg-yellow-950/30'
          }`}>
            <div className="flex items-center gap-2">
              {result.data ? (
                <CheckCircle size={15} className="text-green-400" />
              ) : (
                <FileWarning size={15} className="text-yellow-400" />
              )}
              <span className={`text-sm font-semibold ${result.data ? 'text-green-200' : 'text-yellow-200'}`}>
                {result.data
                  ? `${result.fileType === 'pdf' ? 'PDF' : 'CSV'} Parsed — ${result.fieldsFound?.length ?? Object.values(result.data).filter(Boolean).length} fields extracted`
                  : 'Partial extraction — manual entry needed'}
              </span>
              <span className="text-xs text-slate-500">{result.filename}</span>
              {result.pageCount && (
                <span className="text-xs text-slate-600">({result.pageCount} pages)</span>
              )}
            </div>
            <button
              onClick={clearResult}
              className="text-slate-500 hover:text-slate-300 transition-colors ml-2 flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Extracted data grid */}
            {result.data ? (
              <ExtractedDataGrid data={result.data} />
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">{result.notice}</p>
            )}

            {/* Warnings */}
            {result.warnings?.length > 0 && (
              <div className="space-y-1.5">
                {result.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-yellow-400/90">
                    <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Privacy reminder inside result card */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-700/40">
              <ShieldCheck size={11} className="text-blue-500 flex-shrink-0" />
              <p className="text-[10px] text-slate-600">
                File read in-memory only · not uploaded · not stored · cleared on page close
              </p>
            </div>

            {/* Primary CTA: update dashboard immediately */}
            {canRunDashboard && (
              <button
                onClick={() => onRunDashboard(result.data, result.warnings ?? [])}
                className="w-full btn-primary justify-center py-3"
              >
                <BarChart3 size={16} />
                Update VAMP Dashboard Now
              </button>
            )}

            {/* Secondary: just populate form, let user review first */}
            {result.data && (
              <p className="text-xs text-center text-slate-500">
                or scroll down to review / adjust extracted figures before running
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-800/50 rounded-lg p-3 animate-fade-in">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Skip link */}
      {!result && !parsing && (
        <p className="text-xs text-slate-600 text-center">
          No statement file?{' '}
          <button
            onClick={() => {}}
            className="text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2"
          >
            Enter data manually in the form below →
          </button>
        </p>
      )}
    </div>
  );
}
