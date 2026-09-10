import { useSimulationStore } from '../store/useSimulationStore';
import type { GodModeTool } from '../store/useSimulationStore';
import clsx from 'clsx';

const TOOLS: { id: GodModeTool; label: string; icon: string; desc: string; color: string }[] = [
  { id: 'wall',       label: 'CONCRETE WALL',   icon: '⬛', desc: 'Drop an impassable barrier', color: 'border-slate-500 hover:border-slate-300' },
  { id: 'fire',       label: 'THERMAL RUPTURE', icon: '🔥', desc: 'Paint a heat zone (triggers replan)', color: 'border-orange-600 hover:border-orange-400' },
  { id: 'landslide',  label: 'LANDSLIDE',        icon: '🪨', desc: 'Large debris field (r=5)', color: 'border-amber-600 hover:border-amber-400' },
  { id: 'clear',      label: 'CLEAR ZONE',       icon: '✕',  desc: 'Remove obstacles', color: 'border-green-700 hover:border-green-500' },
];

const SCENARIOS = [
  { label: 'Sudden Wall Collapse', payload: { type: 'drop_obstacle', x: 50, y: 50, radius: 4 } },
  { label: 'Thermal Pipeline Rupture', payload: { type: 'add_heat_zone', x: 55, y: 55, temp: 95, sigma: 6 } },
];

export default function GodModeSculptor() {
  const godModeTool = useSimulationStore(s => s.godModeTool);
  const setGodModeTool = useSimulationStore(s => s.setGodModeTool);
  const lastMutationAck = useSimulationStore(s => s.lastMutationAck);

  const sendGodModeCommand = useSimulationStore(s => s.sendGodModeCommand);

  const toggle = (tool: GodModeTool) => {
    setGodModeTool(godModeTool === tool ? null : tool);
  };

  return (
    <div className="p-3 bg-neutral-950/90 border border-neutral-800 backdrop-blur-md rounded-lg w-56 font-mono">
      <div className="text-[10px] font-bold tracking-widest text-orange-400 mb-3 flex items-center gap-2">
        <span className="text-base">⚡</span> GOD MODE SCULPTOR
      </div>

      {/* Tool buttons */}
      <div className="space-y-1.5 mb-3">
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            onClick={() => toggle(tool.id)}
            className={clsx(
              'w-full text-left px-2.5 py-2 rounded border text-[11px] transition-all',
              godModeTool === tool.id
                ? 'bg-orange-900/40 border-orange-500 text-orange-300'
                : `bg-neutral-900/60 text-neutral-400 ${tool.color}`
            )}
          >
            <div className="flex items-center gap-2">
              <span>{tool.icon}</span>
              <div>
                <div className="font-semibold tracking-wider">{tool.label}</div>
                <div className="text-[9px] text-neutral-500">{tool.desc}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="border-t border-neutral-800 my-2" />

      {/* Demo Scenarios */}
      <div className="text-[9px] text-neutral-500 font-bold tracking-widest mb-1.5">ONE-CLICK SCENARIOS</div>
      <div className="space-y-1">
        {SCENARIOS.map((s, i) => (
          <button
            key={i}
            onClick={() => sendGodModeCommand(s.payload)}
            className="w-full text-left px-2 py-1.5 rounded border border-neutral-700 bg-neutral-900/50 text-[10px] text-neutral-400 hover:border-orange-600 hover:text-orange-300 transition-all"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Last replan result */}
      {lastMutationAck && (
        <div className="mt-3 px-2 py-1.5 bg-green-950/40 border border-green-800/50 rounded text-[10px] text-green-400">
          ✓ {lastMutationAck}
        </div>
      )}

      {/* Instructions */}
      <div className="mt-3 text-[9px] text-neutral-600 leading-relaxed">
        {godModeTool
          ? 'Click anywhere on the TACTICAL MAP to apply tool'
          : 'Select a tool above, then click the map'}
      </div>
    </div>
  );
}
