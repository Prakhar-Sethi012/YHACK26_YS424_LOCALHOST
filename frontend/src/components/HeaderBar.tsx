import { useEffect } from 'react';
import { useSimulationStore } from '../store/useSimulationStore';
import { Radio, AlertTriangle, Cpu, Layers, Box } from 'lucide-react';
import clsx from 'clsx';

export default function HeaderBar() {
  const {
    connected,
    telemetry,
    connect,
    disconnect,
    terrainVisual,
    roverVisual,
    setTerrainVisual,
    setRoverVisual
  } = useSimulationStore();

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const t = telemetry;

  return (
    <header className="bg-neutral-950 border-b border-neutral-800 text-neutral-300 px-4 py-2 flex items-center justify-between z-10 font-mono text-sm shadow-2xl flex-shrink-0">
      
      {/* Left: Brand + connection */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2.5">
          <div className={clsx(
            "w-2 h-2 rounded-full",
            connected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.7)] animate-pulse" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]"
          )} />
          <span className="font-bold tracking-widest text-white text-sm">AEGIS-NAV</span>
          <span className="text-neutral-600 text-xs">::</span>
          <span className="text-neutral-400 text-xs tracking-wider">COMMAND CENTER</span>
        </div>

        <div className={clsx(
          "flex items-center space-x-1.5 px-2.5 py-1 rounded border text-xs",
          connected
            ? "bg-blue-950/40 border-blue-800/60 text-blue-400"
            : "bg-red-950/30 border-red-900/50 text-red-500"
        )}>
          {connected ? <Radio size={12} /> : <AlertTriangle size={12} />}
          <span className="tracking-widest font-semibold">
            {connected ? 'DATALINK SECURE' : 'DATALINK LOST'}
          </span>
        </div>
      </div>

      {/* Center: Live metrics bar */}
      {t ? (
        <div className="flex items-center space-x-6 text-xs">
          <Metric label="VEL" value={t.velocity.toFixed(2)} unit="m/s" />
          <Metric label="PITCH" value={t.slope_deg.toFixed(1)} unit="°" />
          <Metric label="HEADING" value={(t.heading_rad * 180 / Math.PI).toFixed(0)} unit="°" />
          <div className="w-px h-5 bg-neutral-800" />
          <Metric
            label="BATTERY"
            value={t.battery_pct.toFixed(1)}
            unit="%"
            alert={t.is_critical_reserve}
          />
          <Metric label="PWR" value={t.battery_wh.toFixed(0)} unit="Wh" />
          <Metric label="TEMP" value={t.ambient_temp_c.toFixed(1)} unit="°C" alert={t.ambient_temp_c > 65} />
          <div className="w-px h-5 bg-neutral-800" />
          <Metric label="POS" value={`${t.x.toFixed(0)},${t.y.toFixed(0)}`} unit="" />
          <Metric label="ELEV" value={t.z.toFixed(1)} unit="m" />
        </div>
      ) : (
        <div className="text-neutral-600 text-xs tracking-widest animate-pulse">
          AWAITING TELEMETRY...
        </div>
      )}

      {/* Right: Model toggles & System status */}
      <div className="flex items-center space-x-3 text-xs text-neutral-400">
        {/* Terrain Visual Toggle */}
        <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded p-0.5 text-[10px]">
          <button
            onClick={() => setTerrainVisual('digital_twin')}
            className={clsx(
              "px-2 py-0.5 rounded transition-all flex items-center gap-1",
              terrainVisual === 'digital_twin'
                ? "bg-orange-600 text-white font-bold"
                : "text-neutral-500 hover:text-neutral-300"
            )}
            title="Dynamic sensor heightmap + PBR slope shading + 3D instanced obstacles"
          >
            <Layers size={10} />
            <span>SMART TWIN</span>
          </button>
          <button
            onClick={() => setTerrainVisual('glb_mesh')}
            className={clsx(
              "px-2 py-0.5 rounded transition-all flex items-center gap-1",
              terrainVisual === 'glb_mesh'
                ? "bg-orange-600 text-white font-bold"
                : "text-neutral-500 hover:text-neutral-300"
            )}
            title="Render custom hilly_terrain.glb 3D mesh"
          >
            <Box size={10} />
            <span>3D GLB</span>
          </button>
        </div>

        {/* Rover Visual Toggle */}
        <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded p-0.5 text-[10px]">
          <button
            onClick={() => setRoverVisual('leo_glb')}
            className={clsx(
              "px-2 py-0.5 rounded transition-all",
              roverVisual === 'leo_glb'
                ? "bg-cyan-600 text-white font-bold"
                : "text-neutral-500 hover:text-neutral-300"
            )}
            title="Leo Rover CAD 3D model"
          >
            LEO 3D
          </button>
          <button
            onClick={() => setRoverVisual('procedural')}
            className={clsx(
              "px-2 py-0.5 rounded transition-all",
              roverVisual === 'procedural'
                ? "bg-cyan-600 text-white font-bold"
                : "text-neutral-500 hover:text-neutral-300"
            )}
            title="Procedural 6-wheeled articulated rover"
          >
            PROC
          </button>
        </div>

        <div className="text-neutral-800">|</div>

        <div className="flex items-center space-x-1 text-neutral-500 text-[11px]">
          <Cpu size={12} className="text-neutral-600" />
          <span>20Hz</span>
        </div>
      </div>
    </header>
  );
}

function Metric({ label, value, unit, alert }: { label: string; value: string | number; unit: string; alert?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] text-neutral-600 tracking-widest">{label}</span>
      <span className={clsx("text-xs tabular-nums font-semibold", alert ? "text-red-400 animate-pulse" : "text-neutral-100")}>
        {value}<span className="text-neutral-500 text-[9px] ml-0.5">{unit}</span>
      </span>
    </div>
  );
}
