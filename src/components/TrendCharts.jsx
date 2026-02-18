import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// ── Colour palette ─────────────────────────────────────────────────────────
const COLOURS = {
  volume:    '#3b82f6', // blue-500
  tc15:      '#f59e0b', // amber-500
  tc40:      '#ef4444', // red-500
  vampRatio: '#a78bfa', // violet-400
  warning:   '#f59e0b',
  excessive: '#ef4444',
};

// ── Volume vs. Disputes Combo Chart ───────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-slate-300 font-semibold mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-400">{entry.name}:</span>
          <span className="text-white font-mono">
            {entry.name === 'VAMP %'
              ? `${(entry.value * 100).toFixed(2)}%`
              : entry.value?.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function VolumeDisputesChart({ months }) {
  if (!months || months.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
        No trend data available
      </div>
    );
  }

  const chartData = months.map((m) => ({
    month:       m.month ?? 'Unknown',
    volume:      Math.round(Number(m.totalSalesVolume) || 0),
    chargebacks: Number(m.tc15Count) || 0,
    fraud:       Number(m.tc40Count) || 0,
    vampRatio:   m.vampRatio ?? null,
  }));

  // Scale volume to thousands for readability
  const maxVol = Math.max(...chartData.map((d) => d.volume));
  const useThousands = maxVol > 100_000;
  const volLabel = useThousands ? 'Volume ($K)' : 'Volume ($)';

  const scaledData = chartData.map((d) => ({
    ...d,
    volumeDisplay: useThousands ? Math.round(d.volume / 1000) : d.volume,
  }));

  return (
    <div>
      <p className="text-xs text-slate-500 mb-3 text-center">
        Volume vs. Disputes — Monthly
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={scaledData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="month"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
          />
          {/* Left axis: volume */}
          <YAxis
            yAxisId="vol"
            orientation="left"
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            label={{
              value: volLabel,
              angle: -90,
              position: 'insideLeft',
              fill: '#64748b',
              fontSize: 10,
              dx: -4,
            }}
          />
          {/* Right axis: dispute counts */}
          <YAxis
            yAxisId="cnt"
            orientation="right"
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          {/* Second right axis: VAMP ratio % — hidden ticks, drives the line */}
          <YAxis
            yAxisId="ratio"
            orientation="right"
            hide
            domain={[0, 0.03]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }}
          />
          <Bar yAxisId="vol"  dataKey="volumeDisplay" name={volLabel}    fill={COLOURS.volume}    opacity={0.7} radius={[3,3,0,0]} />
          <Bar yAxisId="cnt"  dataKey="chargebacks"   name="Chargebacks" fill={COLOURS.tc15}     opacity={0.8} radius={[3,3,0,0]} />
          <Bar yAxisId="cnt"  dataKey="fraud"         name="Fraud (TC40)" fill={COLOURS.tc40}    opacity={0.8} radius={[3,3,0,0]} />
          <Line
            yAxisId="ratio"
            type="monotone"
            dataKey="vampRatio"
            name="VAMP %"
            stroke={COLOURS.vampRatio}
            strokeWidth={2}
            dot={{ r: 4, fill: COLOURS.vampRatio, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── VAMP Threshold Gauge (SVG semicircle with needle) ─────────────────────

const GAUGE_MIN  = 0;
const GAUGE_MAX  = 0.025; // 2.5% — gives headroom above the 1.5% excessive line
const WARNING    = 0.01;  // 1.0%
const EXCESSIVE  = 0.015; // 1.5%

/** Map a ratio value → SVG arc angle (0° = left, 180° = right). */
function ratioToAngle(ratio) {
  const clamped = Math.min(Math.max(ratio, GAUGE_MIN), GAUGE_MAX);
  return (clamped / GAUGE_MAX) * 180;
}

/** Convert polar (cx, cy, r, angleDeg) → SVG x/y cartesian. */
function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 180) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/** Build an SVG arc path for a gauge segment. */
function arcPath(cx, cy, r, startAngle, endAngle) {
  const s = polar(cx, cy, r, startAngle);
  const e = polar(cx, cy, r, endAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

export function VAMPGauge({ vampRatio, label }) {
  const cx = 120, cy = 110, r = 90;
  const ratio    = vampRatio ?? 0;
  const needleAngle = ratioToAngle(ratio);
  const needleTip   = polar(cx, cy, r - 10, needleAngle);
  const needleBase1 = polar(cx, cy, 8, needleAngle + 90);
  const needleBase2 = polar(cx, cy, 8, needleAngle - 90);

  const warnAngle     = ratioToAngle(WARNING);
  const excessAngle   = ratioToAngle(EXCESSIVE);

  const pctDisplay = ((ratio) * 100).toFixed(2);

  // Status colour
  let statusColor = '#22c55e'; // green
  if (ratio >= EXCESSIVE) statusColor = '#ef4444';
  else if (ratio >= WARNING) statusColor = '#f59e0b';

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs text-slate-500 mb-2 text-center">VAMP Threshold Gauge</p>
      <svg viewBox="0 0 240 130" className="w-full max-w-[260px]">
        {/* Background track */}
        <path
          d={arcPath(cx, cy, r, 0, 180)}
          fill="none"
          stroke="#1e293b"
          strokeWidth={18}
          strokeLinecap="butt"
        />
        {/* Green zone: 0 → warning */}
        <path
          d={arcPath(cx, cy, r, 0, warnAngle)}
          fill="none"
          stroke="#16a34a"
          strokeWidth={18}
          strokeLinecap="butt"
          opacity={0.85}
        />
        {/* Amber zone: warning → excessive */}
        <path
          d={arcPath(cx, cy, r, warnAngle, excessAngle)}
          fill="none"
          stroke="#d97706"
          strokeWidth={18}
          strokeLinecap="butt"
          opacity={0.85}
        />
        {/* Red zone: excessive → max */}
        <path
          d={arcPath(cx, cy, r, excessAngle, 180)}
          fill="none"
          stroke="#dc2626"
          strokeWidth={18}
          strokeLinecap="butt"
          opacity={0.85}
        />

        {/* Threshold tick — warning */}
        {(() => {
          const t1 = polar(cx, cy, r + 12, warnAngle);
          const t2 = polar(cx, cy, r - 9,  warnAngle);
          return <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke="#f59e0b" strokeWidth={2} />;
        })()}
        {/* Threshold tick — excessive */}
        {(() => {
          const t1 = polar(cx, cy, r + 12, excessAngle);
          const t2 = polar(cx, cy, r - 9,  excessAngle);
          return <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke="#ef4444" strokeWidth={2} />;
        })()}

        {/* Needle */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
          fill={statusColor}
          opacity={0.95}
        />
        {/* Needle pivot */}
        <circle cx={cx} cy={cy} r={8} fill="#0f172a" stroke={statusColor} strokeWidth={2} />

        {/* Centre label */}
        <text x={cx} y={cy + 28} textAnchor="middle" fill={statusColor} fontSize={20} fontWeight="bold" fontFamily="monospace">
          {pctDisplay}%
        </text>
        <text x={cx} y={cy + 42} textAnchor="middle" fill="#64748b" fontSize={9}>
          VAMP Ratio
        </text>

        {/* Zone labels */}
        <text x={14}  y={cy + 16} fill="#22c55e" fontSize={8} opacity={0.7}>0%</text>
        <text x={cx - 6} y={26}  fill="#f59e0b" fontSize={8} opacity={0.7}>1.0%</text>
        <text x={cx + 20} y={32} fill="#ef4444" fontSize={8} opacity={0.7}>1.5%</text>
        <text x={216}  y={cy + 16} fill="#ef4444" fontSize={8} opacity={0.7}>2.5%</text>
      </svg>

      {label && (
        <p className="text-xs mt-1 font-semibold" style={{ color: statusColor }}>
          {label}
        </p>
      )}
    </div>
  );
}
