import React from 'react';
import { Activity, ShieldAlert, Cpu, Radio } from 'lucide-react';
import { useMissionStore } from '../store/useMissionStore';

export const HUD: React.FC = () => {
  const { wsConnected, telemetry } = useMissionStore();

  if (!telemetry) {
    return (
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 bg-black/80 border border-cyan-500/30 text-cyan-400 font-mono text-xs rounded">
        <Radio className="w-4 h-4 animate-spin text-cyan-400" />
        CONNECTING TO TELEMETRY STREAM...
      </div>
    );
  }

  const { pose, environment, power, benchmark, sos_count } = telemetry;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 z-10 font-mono text-white select-none">
      {/* Top Header Rail */}
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-cyan-950/60 border border-cyan-500/40 rounded text-cyan-300 text-xs tracking-wider">
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            AEGIS-NAV C2 // MISSION RUNNING
          </div>
          <span className="text-neutral-400 text-xs">SYS_CADENCE: 20Hz</span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>SURVIVORS ACQUIRED: {sos_count}</span>
          </div>
          <div className="text-neutral-300">
            LOC: ({pose.x.toFixed(1)}, {pose.y.toFixed(1)}) | ALT: {environment.elevation.toFixed(1)}m
          </div>
        </div>
      </div>

      {/* Center Reticle for Viewport B (Chase/FLIR POV) */}
      <div className="absolute right-[17.5%] top-1/2 -translate-y-1/2 translate-x-1/2 border border-emerald-500/30 w-36 h-36 rounded-full flex items-center justify-center pointer-events-none">
        <div className="w-2 h-2 bg-emerald-400 rounded-full" />
        <div className="absolute top-1 text-[9px] text-emerald-400 tracking-widest font-mono">FLIR V_FOV 60°</div>
        <div className="absolute bottom-1 text-[9px] text-emerald-400 font-mono">{environment.ambient_temp_c.toFixed(1)}°C</div>
      </div>

      {/* Bottom Telemetry Deck & Live Strategy Benchmark */}
      <div className="grid grid-cols-12 gap-3 pointer-events-auto">
        {/* Power & Kinetic Metrics */}
        <div className="col-span-5 bg-neutral-950/85 border border-cyan-900/60 rounded p-3 backdrop-blur-md">
          <div className="text-[10px] text-cyan-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Power & Mechanical Telemetry
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-neutral-400 text-[10px]">BATTERY</div>
              <div className={`font-bold ${power.battery_pct < 15 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`}>
                {power.battery_pct.toFixed(1)}% ({power.battery_wh.toFixed(0)} Wh)
              </div>
            </div>
            <div>
              <div className="text-neutral-400 text-[10px]">FUEL RESERVE</div>
              <div className="font-bold text-cyan-300">{power.fuel_liters.toFixed(2)} L</div>
            </div>
            <div>
              <div className="text-neutral-400 text-[10px]">POWER DRAW</div>
              <div className="font-bold text-amber-300">{power.power_watts.toFixed(0)} W</div>
            </div>
            <div>
              <div className="text-neutral-400 text-[10px]">SLOPE GRADE</div>
              <div className="font-bold text-neutral-200">{environment.slope_deg.toFixed(1)}°</div>
            </div>
            <div>
              <div className="text-neutral-400 text-[10px]">SPEED</div>
              <div className="font-bold text-neutral-200">{pose.velocity.toFixed(2)} m/s</div>
            </div>
            <div>
              <div className="text-neutral-400 text-[10px]">TOTAL ENERGY</div>
              <div className="font-bold text-neutral-200">{power.total_energy_kj.toFixed(1)} kJ</div>
            </div>
          </div>
        </div>

        {/* Live A* vs D* Lite Strategy Benchmark */}
        <div className="col-span-7 bg-neutral-950/85 border border-cyan-900/60 rounded p-3 backdrop-blur-md">
          <div className="text-[10px] text-cyan-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5" /> Algorithm Benchmark // Real-Time Differential
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs text-center border border-neutral-800 rounded p-1.5">
            <div className="text-left font-semibold text-neutral-400">METRIC</div>
            <div className="text-rose-400 font-semibold">BASELINE (A*)</div>
            <div className="text-emerald-400 font-semibold">AEGIS (D* LITE)</div>
            <div className="text-cyan-300 font-semibold">SPEEDUP</div>

            <div className="text-left text-neutral-300">Repair Latency</div>
            <div className="text-neutral-300">{benchmark.astar.latency_ms.toFixed(1)} ms</div>
            <div className="text-emerald-400 font-bold">{benchmark.dstar_lite.latency_ms.toFixed(1)} ms</div>
            <div className="text-cyan-400 font-bold">
              {benchmark.dstar_lite.latency_ms > 0
                ? `${(benchmark.astar.latency_ms / benchmark.dstar_lite.latency_ms).toFixed(1)}x`
                : '—'}
            </div>

            <div className="text-left text-neutral-300">Path Distance</div>
            <div className="text-neutral-300">{benchmark.astar.path_length.toFixed(1)} m</div>
            <div className="text-emerald-300">{benchmark.dstar_lite.path_length.toFixed(1)} m</div>
            <div className="text-neutral-400">Optimal</div>
          </div>
        </div>
      </div>
    </div>
  );
};
