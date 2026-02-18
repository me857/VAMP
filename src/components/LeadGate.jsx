import React, { useState } from 'react';
import { Lock, Mail, User, Globe, ArrowRight, Shield } from 'lucide-react';
import { VAMPGauge } from './TrendCharts.jsx';

// ── Blurred metric preview ─────────────────────────────────────────────────

function BlurredMetric({ label, value, colour = 'text-white' }) {
  return (
    <div className="bg-slate-900/60 rounded-lg p-3 text-center relative overflow-hidden">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-mono font-bold select-none ${colour}`}
         style={{ filter: 'blur(6px)', userSelect: 'none' }}>
        {value}
      </p>
      <div className="absolute inset-0 flex items-center justify-center">
        <Lock size={14} className="text-slate-500 opacity-60" />
      </div>
    </div>
  );
}

// ── Lead Gate ──────────────────────────────────────────────────────────────

export default function LeadGate({ vampResult, bankability, onSubmit }) {
  const [form, setForm] = useState({ name: '', email: '', website: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const ratio    = vampResult?.vampRatio ?? 0;
  const status   = vampResult?.visaStatus ?? 'HEALTHY';
  const grade    = bankability?.grade ?? '—';
  const score    = bankability?.score ?? 0;

  // Approximate colour for gauge status
  const gaugeLabel = status === 'EXCESSIVE' ? 'Excessive Risk'
    : status === 'WARNING' ? 'Approaching Warning'
    : 'Within Limits';

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email address';
    if (form.website && !/^https?:\/\//i.test(form.website) && !form.website.includes('.')) {
      e.website = 'Enter a valid URL or leave blank';
    }
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit({
        name:    form.name.trim(),
        email:   form.email.trim(),
        website: form.website.trim(),
        vampRatio: ratio,
        grade,
        score,
        status,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const field = (id, label, icon, type = 'text', placeholder = '') => {
    const Icon = icon;
    return (
      <div>
        <label htmlFor={id} className="block text-xs text-slate-400 mb-1.5 font-medium">
          {label}
        </label>
        <div className="relative">
          <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            id={id}
            type={type}
            autoComplete={type === 'email' ? 'email' : 'off'}
            placeholder={placeholder}
            value={form[id]}
            onChange={(e) => setForm((p) => ({ ...p, [id]: e.target.value }))}
            className={`
              w-full pl-8 pr-3 py-2.5 rounded-lg text-sm bg-slate-900 text-white
              border transition-colors outline-none
              ${errors[id]
                ? 'border-red-500 focus:border-red-400'
                : 'border-slate-700 focus:border-blue-500'}
            `}
          />
        </div>
        {errors[id] && (
          <p className="text-xs text-red-400 mt-1">{errors[id]}</p>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8 animate-slide-up">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-3">
          <Lock size={22} className="text-white" />
        </div>
        <h2 className="text-2xl font-black text-white">Your Results Are Ready</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Enter your details below to unlock the full Risk Health Report, including your
          VAMP gauge, trend charts, and Mentor&apos;s Analysis.
        </p>
      </div>

      {/* Blurred preview panel */}
      <div className="card p-5 space-y-4">
        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
          Preview — Unlock to view full report
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <BlurredMetric
            label="VAMP Ratio"
            value={`${(ratio * 100).toFixed(2)}%`}
            colour={ratio >= 0.015 ? 'text-red-400' : ratio >= 0.01 ? 'text-yellow-400' : 'text-green-400'}
          />
          <BlurredMetric label="Visa Status"   value={status} />
          <BlurredMetric label="Grade"         value={grade}  />
          <BlurredMetric label="Bankability"   value={`${score}/100`} />
        </div>

        {/* Blurred gauge */}
        <div className="flex justify-center" style={{ filter: 'blur(5px)', pointerEvents: 'none', userSelect: 'none' }}>
          <div className="w-64 opacity-60">
            <VAMPGauge vampRatio={ratio} label={gaugeLabel} />
          </div>
        </div>
      </div>

      {/* Lead capture form */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={16} className="text-blue-400" />
          <span className="text-sm font-semibold text-slate-200">Unlock Your Full Report</span>
        </div>
        <p className="text-xs text-slate-500 -mt-2">
          We&apos;ll send you a copy of your risk summary. No spam — unsubscribe any time.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {field('name',    'Full Name',      User,  'text',  'Greg Smith')}
          {field('email',   'Email Address',  Mail,  'email', 'greg@example.com')}
          {field('website', 'Merchant Website (optional)', Globe, 'url', 'https://example.com')}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full justify-center gap-2 py-3"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Unlocking…
              </>
            ) : (
              <>
                Unlock Full Report
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <p className="text-[10px] text-slate-600 text-center leading-relaxed">
          Your data is processed locally in your browser. Nothing is uploaded or stored on our
          servers beyond what you explicitly submit in this form.
        </p>
      </div>
    </div>
  );
}
