import React from 'react';
import { ShieldCheck, ChevronRight } from 'lucide-react';

const STEPS = [
  { id: 'upload',    label: 'Data Entry' },
  { id: 'checklist', label: 'Site Audit' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'report',    label: 'Report' },
];

export default function Header({ currentView, onNavigate, hasResults }) {
  const currentIdx = STEPS.findIndex((s) => s.id === currentView);

  const canNavigateTo = (stepId) => {
    const idx = STEPS.findIndex((s) => s.id === stepId);
    if (stepId === 'upload') return true;
    if (stepId === 'checklist') return hasResults || currentIdx >= 1;
    if (stepId === 'dashboard') return hasResults;
    if (stepId === 'report') return hasResults;
    return false;
  };

  return (
    <header className="no-print sticky top-0 z-50 bg-slate-950/95 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            onClick={() => onNavigate('upload')}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-lg">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-bold text-white leading-tight">VAMP Diagnostic</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest leading-tight">
                Merchant Risk Tool
              </div>
            </div>
          </button>

          {/* Step nav */}
          <nav className="flex items-center gap-1">
            {STEPS.map((step, idx) => {
              const isCurrent = step.id === currentView;
              const isCompleted = idx < currentIdx;
              const canNav = canNavigateTo(step.id);

              return (
                <React.Fragment key={step.id}>
                  <button
                    onClick={() => canNav && onNavigate(step.id)}
                    disabled={!canNav}
                    className={`
                      px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150
                      ${isCurrent
                        ? 'bg-blue-600 text-white'
                        : isCompleted && canNav
                          ? 'text-blue-400 hover:bg-slate-800'
                          : canNav
                            ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            : 'text-slate-600 cursor-not-allowed'
                      }
                    `}
                  >
                    <span className="hidden sm:inline">{step.label}</span>
                    <span className="sm:hidden">{idx + 1}</span>
                  </button>
                  {idx < STEPS.length - 1 && (
                    <ChevronRight size={12} className="text-slate-600 hidden sm:block" />
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          {/* Privacy badge */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Privacy-first · No data stored
          </div>
        </div>
      </div>
    </header>
  );
}
