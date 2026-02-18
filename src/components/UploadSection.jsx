import React, { useRef, useState } from 'react';
import {
  Upload, FileText, FileSpreadsheet, AlertCircle, Download,
  X, CheckCircle, Calendar, ArrowRight, Shield,
} from 'lucide-react';
import { parseStatements, generateCSVTemplate } from '../utils/statementParser.js';

// ── File entry summary pill ───────────────────────────────────────────────

function FileEntry({ entry, onRemove }) {
  const isError = Boolean(entry.error && !entry.isPDF);
  const isPDF   = entry.isPDF;

  return (
    <div className={`
      flex items-start gap-3 rounded-lg p-3 border text-xs
      ${isError
        ? 'bg-red-950/30 border-red-800/50'
        : isPDF
        ? 'bg-amber-950/20 border-amber-700/30'
        : 'bg-slate-900/60 border-slate-700/50'
      }
    `}>
      <div className="flex-shrink-0 mt-0.5">
        {isError  ? <AlertCircle size={14} className="text-red-400" />
        : isPDF   ? <AlertCircle size={14} className="text-amber-400" />
        :           <CheckCircle size={14} className="text-green-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-medium text-slate-200 truncate">{entry.filename}</span>
          {entry.month && (
            <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-blue-900/40 text-blue-300 border border-blue-700/50 rounded-full">
              <Calendar size={9} />
              {entry.month}
            </span>
          )}
        </div>

        {isPDF ? (
          <p className="text-amber-300/80">PDF detected — enter figures manually below.</p>
        ) : isError ? (
          <p className="text-red-300/80">{entry.error}</p>
        ) : (
          <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 mt-1 text-[10px]">
            <span className="text-slate-500">CNP: <span className="text-slate-300 font-mono">{entry.cnpTxnCount?.toLocaleString() ?? '—'}</span></span>
            <span className="text-slate-500">CB: <span className="text-slate-300 font-mono">{entry.tc15Count?.toLocaleString() ?? '—'}</span></span>
            <span className="text-slate-500">Fraud: <span className="text-slate-300 font-mono">{entry.tc40Count?.toLocaleString() ?? '—'}</span></span>
            {entry.vampRatio !== null && entry.vampRatio !== undefined && (
              <span className="text-slate-500 col-span-3">
                VAMP: <span className={`font-mono font-semibold ${
                  entry.vampRatio >= 0.015 ? 'text-red-400' :
                  entry.vampRatio >= 0.010 ? 'text-amber-400' : 'text-green-400'
                }`}>{(entry.vampRatio * 100).toFixed(2)}%</span>
              </span>
            )}
          </div>
        )}

        {entry.warnings?.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {entry.warnings.map((w, i) => (
              <p key={i} className="text-yellow-400/80 text-[10px]">{w}</p>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => onRemove(entry.filename)}
        className="flex-shrink-0 text-slate-600 hover:text-slate-300 transition-colors"
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function UploadSection({ onParsed, onManualEntry, onSubmit }) {
  const fileRef     = useRef(null);
  const [dragging,  setDragging]  = useState(false);
  const [parsing,   setParsing]   = useState(false);
  const [entries,   setEntries]   = useState([]); // array of parsed monthly data objects
  const [error,     setError]     = useState(null);

  // ── File handling ──────────────────────────────────────────────────────

  const handleFiles = async (newFiles) => {
    if (!newFiles?.length) return;
    setError(null);
    setParsing(true);

    try {
      const parsed = await parseStatements(Array.from(newFiles));

      setEntries((prev) => {
        // Deduplicate by filename — newer upload wins
        const existingMap = new Map(prev.map((e) => [e.filename, e]));
        for (const p of parsed) existingMap.set(p.filename, p);
        return Array.from(existingMap.values());
      });

      // Pass successfully parsed CSV data up for the manual form
      const csvEntries = parsed.filter((e) => !e.isPDF && !e.error);
      if (csvEntries.length > 0) {
        // Use the most recent (last in sorted order) for the form pre-fill
        const latest = csvEntries[csvEntries.length - 1];
        const allWarnings = csvEntries.flatMap((e) => e.warnings ?? []);
        onParsed(latest, allWarnings);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  };

  const removeEntry = (filename) => {
    setEntries((prev) => prev.filter((e) => e.filename !== filename));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  // ── Submit / Generate Report ───────────────────────────────────────────

  const csvEntries    = entries.filter((e) => !e.isPDF && !e.error);
  const canSubmit     = csvEntries.length > 0;
  const hasMultiMonth = csvEntries.length > 1;

  const handleSubmitClick = () => {
    if (!canSubmit) return;
    // Pass full monthly array to parent
    onSubmit(csvEntries);
  };

  // ── Drop zone ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Upload Processing Statement(s)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload up to 3 months of CSV statements for trend analysis
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

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
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
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Parsing statement(s)…</p>
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
                Drop files here or click to browse
              </p>
              <p className="text-xs text-slate-500 mt-1">
                <span className="text-blue-400 font-mono">.csv</span> and{' '}
                <span className="text-blue-400 font-mono">.pdf</span> · Up to 3 months ·{' '}
                {hasMultiMonth
                  ? <span className="text-blue-300">3-month rolling average enabled</span>
                  : 'Add multiple months for trend charts'
                }
              </p>
            </div>
          </>
        )}
      </div>

      {/* File entries */}
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => (
            <FileEntry key={entry.filename} entry={entry} onRemove={removeEntry} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-800/50 rounded-lg p-3">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Privacy notice */}
      <div className="flex items-start gap-2 text-[10px] text-slate-500 bg-slate-900/40 rounded-lg p-3 border border-slate-800/60">
        <Shield size={12} className="flex-shrink-0 mt-0.5 text-slate-600" />
        <span>
          Data is processed locally in your browser. No financial data is ever uploaded
          or stored on our servers. Close the tab to clear all session data.
        </span>
      </div>

      {/* Submit / Generate Report button */}
      {canSubmit && (
        <button
          onClick={handleSubmitClick}
          className="btn-primary w-full justify-center gap-2 py-3"
        >
          {hasMultiMonth
            ? `Analyse ${csvEntries.length} Months & Generate Report`
            : 'Submit & Generate Report'
          }
          <ArrowRight size={16} />
        </button>
      )}

      {/* Skip link */}
      <button
        onClick={onManualEntry}
        className="text-xs text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2"
      >
        Skip upload and enter data manually →
      </button>
    </div>
  );
}
