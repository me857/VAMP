import React, { useRef, useState } from 'react';
import { Upload, FileText, FileSpreadsheet, AlertCircle, Download, X, CheckCircle } from 'lucide-react';
import { parseStatement, generateCSVTemplate } from '../utils/statementParser.js';

export default function UploadSection({ onParsed, onManualEntry }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null); // { type: 'csv'|'pdf', data, warnings, notice }
  const [error, setError] = useState(null);

  const handleFile = async (file) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setParsing(true);

    try {
      const res = await parseStatement(file);
      setResult({ ...res, filename: file.name, type: file.name.endsWith('.pdf') ? 'pdf' : 'csv' });

      if (res.data) {
        onParsed(res.data, res.warnings ?? []);
      } else {
        // PDF – needs manual entry
        onManualEntry();
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
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const clearResult = () => {
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Upload Processing Statement</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            CSV with transaction data, or PDF (manual entry required for PDF)
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

      {!result ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl
            border-2 border-dashed cursor-pointer transition-all duration-200
            ${dragging
              ? 'border-blue-500 bg-blue-950/30'
              : 'border-slate-700 bg-slate-900/40 hover:border-slate-500 hover:bg-slate-900/60'
            }
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
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Parsing statement…</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 text-slate-500">
                <FileSpreadsheet size={28} />
                <Upload size={20} />
                <FileText size={28} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-300">
                  Drop a file here or click to browse
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supports <span className="text-blue-400 font-mono">.csv</span> and{' '}
                  <span className="text-blue-400 font-mono">.pdf</span> · Parsed in browser only
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="relative card p-4">
          <button
            onClick={clearResult}
            className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={14} />
          </button>

          {result.type === 'csv' && result.data ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-400" />
                <span className="text-sm font-medium text-green-300">CSV Parsed Successfully</span>
                <span className="text-xs text-slate-500">— {result.filename}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Total Transactions', value: result.data.totalSalesCount?.toLocaleString() },
                  { label: 'CNP Transactions', value: result.data.cnpTxnCount?.toLocaleString() },
                  { label: 'Chargebacks (TC15)', value: result.data.tc15Count?.toLocaleString() },
                  { label: 'Fraud Reports (TC40)', value: result.data.tc40Count?.toLocaleString() },
                  { label: 'Sales Volume', value: result.data.totalSalesVolume ? `$${result.data.totalSalesVolume.toLocaleString()}` : '–' },
                  { label: 'Fraud Amount', value: result.data.fraudAmountUSD ? `$${result.data.fraudAmountUSD.toLocaleString()}` : '–' },
                ].map((item) => (
                  <div key={item.label} className="bg-slate-900/60 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">{item.label}</p>
                    <p className="text-sm font-mono font-semibold text-white mt-0.5">{item.value ?? '0'}</p>
                  </div>
                ))}
              </div>

              {result.warnings?.length > 0 && (
                <div className="space-y-1.5">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-yellow-400">
                      <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-slate-500">
                Review and adjust these figures in the form below if needed.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-yellow-400" />
                <span className="text-sm font-medium text-yellow-300">PDF Detected – Manual Entry Required</span>
              </div>
              <p className="text-xs text-slate-400">{result.notice}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-800/50 rounded-lg p-3">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <button
        onClick={onManualEntry}
        className="text-xs text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2"
      >
        Skip upload and enter data manually →
      </button>
    </div>
  );
}
