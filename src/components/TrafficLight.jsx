import React from 'react';

const LIGHT_CONFIG = {
  green: {
    active: 'bg-green-400 shadow-[0_0_24px_4px_rgba(74,222,128,0.6)]',
    inactive: 'bg-green-950',
    pulse: false,
  },
  yellow: {
    active: 'bg-yellow-400 shadow-[0_0_24px_4px_rgba(250,204,21,0.6)]',
    inactive: 'bg-yellow-950',
    pulse: true,
  },
  red: {
    active: 'bg-red-500 shadow-[0_0_24px_4px_rgba(239,68,68,0.6)]',
    inactive: 'bg-red-950',
    pulse: true,
  },
};

export default function TrafficLight({ status, label, size = 'md' }) {
  // status: 'healthy' | 'warning' | 'excessive' | 'critical'
  const isGreen  = status === 'healthy';
  const isYellow = status === 'warning';
  const isRed    = status === 'excessive' || status === 'critical';

  const dim = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Housing */}
      <div className="flex flex-col items-center gap-3 bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-inner">
        {/* Red */}
        <div
          className={`${dim} rounded-full transition-all duration-500 ${
            isRed
              ? `${LIGHT_CONFIG.red.active} ${LIGHT_CONFIG.red.pulse ? 'animate-pulse-slow' : ''}`
              : LIGHT_CONFIG.red.inactive
          }`}
        />
        {/* Yellow */}
        <div
          className={`${dim} rounded-full transition-all duration-500 ${
            isYellow
              ? `${LIGHT_CONFIG.yellow.active} ${LIGHT_CONFIG.yellow.pulse ? 'animate-pulse-slow' : ''}`
              : LIGHT_CONFIG.yellow.inactive
          }`}
        />
        {/* Green */}
        <div
          className={`${dim} rounded-full transition-all duration-500 ${
            isGreen ? LIGHT_CONFIG.green.active : LIGHT_CONFIG.green.inactive
          }`}
        />
      </div>

      {label && (
        <div className="text-center">
          <p className={`text-sm font-bold uppercase tracking-widest ${
            isRed ? 'text-red-400' : isYellow ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {label}
          </p>
        </div>
      )}
    </div>
  );
}
