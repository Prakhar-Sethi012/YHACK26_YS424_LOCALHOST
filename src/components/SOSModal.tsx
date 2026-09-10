import React from 'react';
import { AlertTriangle, Download, X } from 'lucide-react';
import { useMissionStore } from '../store/useMissionStore';

export const SOSModal: React.FC = () => {
  const { activeSOSModal, dismissSOSModal } = useMissionStore();

  if (!activeSOSModal) return null;

  const handleExportJSON = () => {
    // Backend 2's /api/incidents/tactical-export reads from a Postgres table
    // that Backend 1's rover sim never POSTs detections into, so it always
    // comes back empty for a victim just acquired over the WS stream. Export
    // straight from the payload already sitting in this modal instead --
    // it's the same data the operator is looking at, no round trip needed.
    const blob = new Blob([JSON.stringify(activeSOSModal, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSOSModal.transmission_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 font-mono select-none">
      <div className="relative w-full max-w-lg bg-neutral-950 border-2 border-emerald-500 rounded shadow-[0_0_30px_rgba(16,185,129,0.25)] p-5 text-white">
        <button
          onClick={dismissSOSModal}
          className="absolute top-3 right-3 text-neutral-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 text-emerald-400 text-sm font-bold tracking-wider mb-4 border-b border-neutral-800 pb-2">
          <AlertTriangle className="w-5 h-5 text-emerald-400 animate-pulse" />
          TACTICAL RESCUE TRANSMISSION ACQUIRED
        </div>

        {/* FLIR Simulated Snapshot Preview */}
        <div className="relative h-36 w-full bg-neutral-900 border border-emerald-500/40 rounded mb-4 overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(16,185,129,0.15)_0%,_transparent_70%)]" />
          <div className="border border-dashed border-emerald-400 w-24 h-24 flex items-center justify-center">
            <span className="text-[10px] text-emerald-300 font-bold">TARGET LOCKED</span>
          </div>
          <div className="absolute bottom-2 left-2 text-[10px] text-emerald-400">FLIR_SPECTRAL_ID: 8-14um</div>
          <div className="absolute bottom-2 right-2 text-[10px] text-amber-300 font-bold">
            SIGNATURE: {activeSOSModal.vital_thermal_signature}
          </div>
        </div>

        <div className="space-y-1.5 text-xs text-neutral-300 mb-5">
          <div className="flex justify-between border-b border-neutral-800/80 py-1">
            <span className="text-neutral-400">TRANSMISSION ID:</span>
            <span className="text-white font-bold">{activeSOSModal.transmission_id}</span>
          </div>
          <div className="flex justify-between border-b border-neutral-800/80 py-1">
            <span className="text-neutral-400">COORDINATES:</span>
            <span className="text-emerald-400 font-bold">
              X: {activeSOSModal.target_coordinates.x.toFixed(2)}, Y: {activeSOSModal.target_coordinates.y.toFixed(2)}, Z: {activeSOSModal.target_coordinates.elevation.toFixed(2)}m
            </span>
          </div>
          <div className="flex justify-between border-b border-neutral-800/80 py-1">
            <span className="text-neutral-400">TRIAGE STATUS:</span>
            <span className="text-amber-400 font-bold">{activeSOSModal.triage_status}</span>
          </div>
          <div className="flex justify-between border-b border-neutral-800/80 py-1">
            <span className="text-neutral-400">EXTRACTION CORRIDOR:</span>
            <span className="text-cyan-400 font-bold">{activeSOSModal.extraction_corridor}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleExportJSON}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-colors shadow-lg"
          >
            <Download className="w-4 h-4" /> EXPORT TACTICAL RESCUE JSON
          </button>
          <button
            onClick={dismissSOSModal}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition-colors"
          >
            ACKNOWLEDGE
          </button>
        </div>
      </div>
    </div>
  );
};
