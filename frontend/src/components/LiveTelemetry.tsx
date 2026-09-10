import { useSimulationStore } from '../store/useSimulationStore';

function ArcGauge({ value, max, color, label, unit }: {
  value: number; max: number; color: string; label: string; unit: string;
}) {
  const pct = Math.min(1, Math.max(0, value / max));
  const r = 28;
  const circ = 2 * Math.PI * r;
  const arcLen = circ * 0.75; // 270° sweep
  const offset = arcLen * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <svg width="72" height="72" viewBox="0 0 72 72">
        {/* Track */}
        <circle cx="36" cy="36" r={r} fill="none" stroke="#222" strokeWidth="6"
          strokeDasharray={`${arcLen} ${circ - arcLen}`}
          strokeDashoffset={circ * 0.125}
          strokeLinecap="round"
          transform="rotate(135 36 36)"
        />
        {/* Value */}
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${arcLen - offset} ${circ - (arcLen - offset)}`}
          strokeDashoffset={circ * 0.125}
          strokeLinecap="round"
          transform="rotate(135 36 36)"
          style={{ transition: 'stroke-dasharray 0.3s ease' }}
        />
        <text x="36" y="36" textAnchor="middle" dominantBaseline="middle"
          fill="white" fontSize="12" fontFamily="monospace" fontWeight="bold">
          {value.toFixed(0)}
        </text>
        <text x="36" y="50" textAnchor="middle" fill="#666" fontSize="8" fontFamily="monospace">
          {unit}
        </text>
      </svg>
      <span className="text-[9px] text-neutral-500 font-mono tracking-widest mt-1">{label}</span>
    </div>
  );
}

function BarGauge({ value, max, label, color, unit }: {
  value: number; max: number; label: string; color: string; unit: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-[9px] font-mono text-neutral-500 mb-0.5">
        <span>{label}</span>
        <span className="text-neutral-300">{value.toFixed(1)}{unit}</span>
      </div>
      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function LiveTelemetry() {
  const t = useSimulationStore(s => s.telemetry);

  if (!t) return (
    <div className="p-3 bg-neutral-950/90 border border-neutral-800 backdrop-blur-md rounded-lg font-mono text-center">
      <div className="text-[9px] text-neutral-600 tracking-widest animate-pulse">AWAITING TELEMETRY...</div>
    </div>
  );

  const batteryColor = t.is_critical_reserve ? '#ef4444' : t.battery_pct < 30 ? '#f97316' : '#22c55e';
  const velColor = '#3b82f6';
  const tempColor = t.ambient_temp_c > 60 ? '#ef4444' : t.ambient_temp_c > 40 ? '#f97316' : '#22d3ee';

  return (
    <div className="p-3 bg-neutral-950/90 border border-neutral-800 backdrop-blur-md rounded-lg font-mono">
      <div className="text-[10px] font-bold tracking-widest text-blue-400 mb-3">
        📡 LIVE TELEMETRY
      </div>

      {/* Circular arc gauges */}
      <div className="flex justify-around mb-3">
        <ArcGauge value={t.battery_pct} max={100} color={batteryColor} label="BATTERY" unit="%" />
        <ArcGauge value={t.velocity} max={3} color={velColor} label="SPEED" unit="m/s" />
        <ArcGauge value={t.ambient_temp_c} max={100} color={tempColor} label="TEMP" unit="°C" />
      </div>

      {/* Bar gauges */}
      <div className="space-y-2">
        <BarGauge value={t.battery_wh} max={100} label="ENERGY" color="#eab308" unit="Wh" />
        <BarGauge value={t.fuel_liters} max={5} label="FUEL" color="#6366f1" unit="L" />
      </div>

      {/* Pose data */}
      <div className="mt-3 border-t border-neutral-800 pt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {[
          ['PITCH', `${t.slope_deg.toFixed(1)}°`],
          ['HEADING', `${(t.heading_rad * 180 / Math.PI).toFixed(0)}°`],
          ['X POS', `${t.x.toFixed(1)}m`],
          ['Y POS', `${t.y.toFixed(1)}m`],
          ['ELEV', `${t.z.toFixed(2)}m`],
          ['DIST', `${t.distance_traveled_m.toFixed(0)}m`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="text-[9px] text-neutral-600">{k}</span>
            <span className="text-[10px] text-neutral-200 tabular-nums">{v}</span>
          </div>
        ))}
      </div>

      {/* Critical battery warning */}
      {t.is_critical_reserve && (
        <div className="mt-2 px-2 py-1.5 bg-red-950/50 border border-red-700 rounded text-[10px] text-red-400 font-bold animate-pulse text-center tracking-widest">
          ⚠ CRITICAL BATTERY — SLOPE AVOIDANCE ENGAGED
        </div>
      )}
    </div>
  );
}
