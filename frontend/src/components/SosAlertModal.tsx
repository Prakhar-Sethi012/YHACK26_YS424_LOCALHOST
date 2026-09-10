import { useSimulationStore } from '../store/useSimulationStore';
import { AlertTriangle, Crosshair, Thermometer, ShieldAlert, CheckCircle2, Navigation } from 'lucide-react';

export default function SosAlertModal() {
  const latestSosAlert = useSimulationStore((s) => s.latestSosAlert);
  const dismissSosAlert = useSimulationStore((s) => s.dismissSosAlert);

  if (!latestSosAlert) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 font-mono">
      <div className="relative w-full max-w-lg bg-neutral-950 border-2 border-red-600/80 rounded-xl shadow-[0_0_50px_rgba(220,38,38,0.35)] overflow-hidden">
        {/* Header alert stripe */}
        <div className="bg-red-950/80 border-b border-red-700/80 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400 font-bold tracking-wider text-sm animate-pulse">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span>SOS BEACON DETECTED // CASUALTY ACQUIRED</span>
          </div>
          <span className="text-[10px] bg-red-900/60 text-red-300 border border-red-700 px-2 py-0.5 rounded">
            PRIORITY 1
          </span>
        </div>

        <div className="p-5 space-y-4">
          {/* FLIR Simulated Thermal Viewport */}
          <div className="relative h-44 rounded-lg bg-neutral-900 border border-neutral-800 overflow-hidden flex items-center justify-center">
            {/* Ironbow thermal gradient background */}
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-950 via-purple-900/60 to-amber-950/40 opacity-70" />
            
            {/* Heat signature bloom */}
            <div className="absolute w-24 h-24 rounded-full bg-gradient-radial from-red-500 via-amber-400 to-transparent opacity-80 blur-md animate-pulse" />
            
            {/* FLIR UI Overlay */}
            <div className="absolute inset-0 p-3 flex flex-col justify-between pointer-events-none">
              <div className="flex justify-between text-[9px] text-amber-400 font-semibold">
                <span>FLIR OPTICS // THERMAL IR-3</span>
                <span>FOV 60° // NFOV</span>
              </div>
              <div className="flex items-center justify-center">
                <Crosshair className="w-16 h-16 text-red-400/60 stroke-[1.5]" />
              </div>
              <div className="flex justify-between text-[9px] text-neutral-400">
                <span className="text-red-400 font-bold">TARGET LOCKED</span>
                <span>SIG: {latestSosAlert.vital_thermal_signature}</span>
              </div>
            </div>
          </div>

          {/* Incident Data Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 rounded bg-neutral-900/70 border border-neutral-800">
              <div className="text-[10px] text-neutral-500 flex items-center gap-1.5 mb-1">
                <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                <span>CASUALTY ID</span>
              </div>
              <div className="font-bold text-neutral-200">{latestSosAlert.victim_id}</div>
              <div className="text-[10px] text-orange-400 mt-0.5">{latestSosAlert.triage_status}</div>
            </div>

            <div className="p-2.5 rounded bg-neutral-900/70 border border-neutral-800">
              <div className="text-[10px] text-neutral-500 flex items-center gap-1.5 mb-1">
                <Navigation className="w-3.5 h-3.5 text-cyan-400" />
                <span>COORDINATES</span>
              </div>
              <div className="font-bold text-neutral-200">
                X:{latestSosAlert.target_coordinates.x.toFixed(1)} Y:{latestSosAlert.target_coordinates.y.toFixed(1)}
              </div>
              <div className="text-[10px] text-neutral-400 mt-0.5">
                Elev: {latestSosAlert.target_coordinates.elevation.toFixed(2)}m
              </div>
            </div>

            <div className="p-2.5 rounded bg-neutral-900/70 border border-neutral-800">
              <div className="text-[10px] text-neutral-500 flex items-center gap-1.5 mb-1">
                <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                <span>THERMAL SIGNATURE</span>
              </div>
              <div className="font-bold text-amber-300">{latestSosAlert.vital_thermal_signature}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">
                Ambient: {latestSosAlert.ambient_temperature}
              </div>
            </div>

            <div className="p-2.5 rounded bg-neutral-900/70 border border-neutral-800">
              <div className="text-[10px] text-neutral-500 flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                <span>EXTRACTION CORRIDOR</span>
              </div>
              <div className="font-bold text-green-300 text-[11px] truncate">
                {latestSosAlert.extraction_corridor}
              </div>
              <div className="text-[10px] text-neutral-400 mt-0.5">Air-drop priority</div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex gap-3">
            <button
              onClick={dismissSosAlert}
              className="flex-1 py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs tracking-wider transition-all shadow-[0_0_20px_rgba(220,38,38,0.4)] flex items-center justify-center gap-2"
            >
              <span>DISPATCH MEDEVAC ROUTE</span>
            </button>
            <button
              onClick={dismissSosAlert}
              className="py-2.5 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-xs transition-all"
            >
              DISMISS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
