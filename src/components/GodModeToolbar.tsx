import React from 'react';
import { MousePointer, Box, Flame, BatteryWarning, Flag, Target, Play, Pause, Gauge } from 'lucide-react';
import { useMissionStore } from '../store/useMissionStore';
import { ActiveTool } from '../types/mission';

const TIME_WARP_FACTORS = [1, 2, 5] as const;

export const GodModeToolbar: React.FC = () => {
  const { activeTool, setActiveTool, sendEmergencyLowBattery, sendSetPaused, sendSetTimeWarp, telemetry } = useMissionStore();
  const isPaused = telemetry?.paused ?? false;
  const timeWarp = telemetry?.time_warp ?? 1;

  const toolClasses = (tool: ActiveTool) =>
    `flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono transition-colors border ${
      activeTool === tool
        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
        : 'bg-neutral-900/80 border-neutral-700/60 text-neutral-400 hover:text-white hover:bg-neutral-800'
    }`;

  return (
    <div className="absolute top-14 left-4 z-20 flex flex-col gap-1.5 bg-neutral-950/80 border border-cyan-900/40 p-2 rounded backdrop-blur-md select-none">
      <div className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest px-1">
        God-Mode Sculptor
      </div>

      <button onClick={() => setActiveTool('select')} className={toolClasses('select')}>
        <MousePointer className="w-3.5 h-3.5" /> Orbit Navigation
      </button>

      <button onClick={() => setActiveTool('drop_obstacle')} className={toolClasses('drop_obstacle')}>
        <Box className="w-3.5 h-3.5 text-rose-400" /> Drop Obstacle (D* Lite)
      </button>

      <button onClick={() => setActiveTool('add_heat_zone')} className={toolClasses('add_heat_zone')}>
        <Flame className="w-3.5 h-3.5 text-amber-400" /> Paint Thermal Zone
      </button>

      <button onClick={() => setActiveTool('set_start')} className={toolClasses('set_start')}>
        <Flag className="w-3.5 h-3.5 text-emerald-400" /> Set Start Point
      </button>

      <button onClick={() => setActiveTool('set_goal')} className={toolClasses('set_goal')}>
        <Target className="w-3.5 h-3.5 text-cyan-400" /> Set Goal Point
      </button>

      <div className="my-1 border-t border-neutral-800" />

      <button
        onClick={() => sendSetPaused(!isPaused)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono transition-colors border ${
          isPaused
            ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
            : 'bg-neutral-900/80 border-neutral-700/60 text-neutral-300 hover:text-white hover:bg-neutral-800'
        }`}
      >
        {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        {isPaused ? 'Resume Simulation' : 'Pause Simulation'}
      </button>

      <div className="flex items-center gap-1.5 px-1">
        <Gauge className="w-3.5 h-3.5 text-neutral-400" />
        <div className="flex gap-1">
          {TIME_WARP_FACTORS.map((factor) => (
            <button
              key={factor}
              onClick={() => sendSetTimeWarp(factor)}
              className={`flex-1 px-2.5 py-1 rounded text-xs font-mono font-bold transition-colors border ${
                timeWarp === factor
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                  : 'bg-neutral-900/80 border-neutral-700/60 text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              {factor}x
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => sendEmergencyLowBattery()}
        className="flex items-center gap-2 px-3 py-1.5 bg-rose-950/50 border border-rose-600/40 text-rose-300 rounded text-xs font-mono hover:bg-rose-900/60 transition-colors"
      >
        <BatteryWarning className="w-3.5 h-3.5 animate-bounce" /> Force Critical Battery (&lt;15%)
      </button>
    </div>
  );
};
