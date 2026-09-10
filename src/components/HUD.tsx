import React, { useState } from 'react';
import { Activity, ShieldAlert, Cpu, Radio, WifiOff, FlagTriangleRight, PauseCircle, FileBarChart, ChevronDown, ChevronUp } from 'lucide-react';
import { useMissionStore } from '../store/useMissionStore';
import { TelemetryData } from '../types/mission';

// Rover is considered to have arrived once it's within this many grid units
// of the goal -- the sim's own arrival tolerance isn't exposed over the wire,
// so this just needs to be a bit looser than final-approach jitter.
const GOAL_ARRIVAL_RADIUS = 2.5;

// Same honesty rule as WayanadMission's routing analysis: report whichever
// direction the real benchmark numbers actually went, rather than always
// framing D* Lite as the winner.
function buildMissionDebrief(telemetry: TelemetryData): string {
  const { power, benchmark, sos_count } = telemetry;
  const hasBothLatencies = benchmark.astar.latency_ms > 0 && benchmark.dstar_lite.latency_ms > 0;
  const ratio = hasBothLatencies ? benchmark.astar.latency_ms / benchmark.dstar_lite.latency_ms : null;

  const speedClause =
    ratio === null
      ? 'no incremental D* Lite repair was benchmarked against a cold-start plan this mission.'
      : ratio >= 1
        ? `D* Lite's incremental repairs ran ${ratio.toFixed(1)}x faster than a fresh cold-start plan.`
        : `D* Lite's incremental repairs took ${(1 / ratio).toFixed(1)}x longer than a fresh cold-start plan on this terrain.`;

  return `Mission complete. ${sos_count} survivor${sos_count === 1 ? '' : 's'} located, ${power.total_energy_kj.toFixed(1)} kJ expended, ${power.battery_pct.toFixed(0)}% battery and ${power.fuel_liters.toFixed(2)} L fuel remaining. ${speedClause}`;
}

export const HUD: React.FC = () => {
  const { wsConnected, telemetry } = useMissionStore();
  const [debriefExpanded, setDebriefExpanded] = useState(true);

  if (!telemetry) {
    return (
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 bg-black/80 border border-cyan-500/30 text-cyan-400 font-mono text-xs rounded">
        <Radio className="w-4 h-4 animate-spin text-cyan-400" />
        CONNECTING TO TELEMETRY STREAM...
      </div>
    );
  }

  const { pose, environment, power, benchmark, sos_count, goal, paused } = telemetry;

  // goal comes from telemetry (not initialState) because set_goal can
  // retarget it mid-mission -- initialState is only ever the mission's
  // starting snapshot.
  const missionComplete = Math.hypot(pose.x - goal[0], pose.y - goal[1]) < GOAL_ARRIVAL_RADIUS;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 z-10 font-mono text-white select-none">
      {/* Stream-loss banner -- telemetry below is the last known frame, frozen */}
      {!wsConnected && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex items-center gap-2.5 px-4 py-2.5 bg-rose-950/90 border border-rose-500/60 text-rose-300 font-mono text-sm rounded shadow-[0_0_20px_rgba(244,63,94,0.3)]">
          <WifiOff className="w-4 h-4 animate-pulse" />
          TELEMETRY LINK LOST // REATTEMPTING CONNECTION...
        </div>
      )}

      {/* Top Header Rail */}
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          {paused ? (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-amber-950/60 border border-amber-500/40 rounded text-amber-300 text-xs tracking-wider">
              <PauseCircle className="w-3.5 h-3.5" />
              AEGIS-NAV C2 // SIMULATION PAUSED
            </div>
          ) : missionComplete ? (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-950/60 border border-emerald-500/40 rounded text-emerald-300 text-xs tracking-wider">
              <FlagTriangleRight className="w-3.5 h-3.5" />
              AEGIS-NAV C2 // TARGET REACHED
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-cyan-950/60 border border-cyan-500/40 rounded text-cyan-300 text-xs tracking-wider">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              AEGIS-NAV C2 // MISSION RUNNING
            </div>
          )}
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

      {/* Viewport split divider + labels (matches ViewportCanvas's 65/35 scissor split) */}
      <div className="absolute left-[65%] top-0 bottom-0 w-px bg-cyan-500/25" />
      <div className="absolute left-3 top-12 text-[9px] text-cyan-500/50 tracking-widest">
        VIEWPORT A // TACTICAL ORBIT
      </div>
      <div className="absolute left-[calc(65%+0.75rem)] top-12 text-[9px] text-emerald-500/50 tracking-widest">
        VIEWPORT B // CHASE POV
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

          {missionComplete && (
            <div className="border-t border-neutral-800 mt-2 pt-2">
              <button
                onClick={() => setDebriefExpanded((e) => !e)}
                className="w-full flex items-center justify-between text-[10px] text-emerald-400 uppercase tracking-wider mb-1.5"
              >
                <span className="flex items-center gap-1.5">
                  <FileBarChart className="w-3 h-3" /> Mission Debrief
                </span>
                {debriefExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {debriefExpanded && (
                <>
                  <div className="grid grid-cols-2 gap-y-1 text-[10px] text-neutral-300 mb-2">
                    <span className="text-neutral-500">Survivors located</span>
                    <span className="text-right">{sos_count}</span>

                    <span className="text-neutral-500">Battery remaining</span>
                    <span className="text-right">{power.battery_pct.toFixed(1)}%</span>

                    <span className="text-neutral-500">Fuel remaining</span>
                    <span className="text-right">{power.fuel_liters.toFixed(2)} L</span>

                    <span className="text-neutral-500">Total energy expended</span>
                    <span className="text-right">{power.total_energy_kj.toFixed(1)} kJ</span>
                  </div>
                  <p className="text-[10px] text-neutral-300 leading-relaxed">{buildMissionDebrief(telemetry)}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
