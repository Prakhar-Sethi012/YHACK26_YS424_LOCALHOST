import React, { useEffect } from 'react';
import { useSimulationStore } from '../store/useSimulationStore';
import { Activity, Battery, BatteryWarning, Zap, Radio, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

export default function HeaderBar() {
  const { connected, telemetry, connect, disconnect } = useSimulationStore();

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <header className="bg-neutral-950 border-b border-neutral-800 text-neutral-300 p-3 flex items-center justify-between z-10 font-mono text-sm shadow-xl">
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-3">
          <div className={clsx("w-2.5 h-2.5 rounded-full animate-pulse", connected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]")} />
          <span className="font-bold tracking-widest text-neutral-100">AEGIS-NAV :: COMMAND</span>
        </div>
        
        {connected ? (
          <div className="flex items-center space-x-2 bg-neutral-900 px-3 py-1 rounded border border-neutral-800">
            <Radio size={14} className="text-blue-400" />
            <span className="text-xs text-blue-400 font-semibold tracking-wider">DATALINK SECURE</span>
          </div>
        ) : (
          <div className="flex items-center space-x-2 bg-red-950/30 px-3 py-1 rounded border border-red-900/50">
            <AlertTriangle size={14} className="text-red-500" />
            <span className="text-xs text-red-500 font-semibold tracking-wider">DATALINK LOST</span>
          </div>
        )}
      </div>

      {telemetry ? (
        <div className="flex items-center space-x-8">
          <TelemetryMetric 
            label="VELOCITY" 
            value={telemetry.velocity.toFixed(2)} 
            unit="m/s" 
            icon={<Activity size={14} className="text-neutral-500" />} 
          />
          <TelemetryMetric 
            label="PITCH" 
            value={(telemetry.pitch * (180 / Math.PI)).toFixed(1)} 
            unit="°" 
          />
          <TelemetryMetric 
            label="ROLL" 
            value={(telemetry.roll * (180 / Math.PI)).toFixed(1)} 
            unit="°" 
          />
          <div className="h-6 w-px bg-neutral-800" />
          
          <TelemetryMetric 
            label="BATTERY" 
            value={telemetry.battery_pct.toFixed(1)} 
            unit="%" 
            alert={telemetry.is_critical_reserve}
            icon={telemetry.is_critical_reserve ? <BatteryWarning size={14} className="text-red-500" /> : <Battery size={14} className="text-green-500" />} 
          />
          <TelemetryMetric 
            label="PWR" 
            value={telemetry.battery_wh.toFixed(0)} 
            unit="Wh" 
            icon={<Zap size={14} className="text-yellow-500" />} 
          />
        </div>
      ) : (
        <div className="text-neutral-600 text-xs tracking-widest animate-pulse">AWAITING TELEMETRY...</div>
      )}
    </header>
  );
}

function TelemetryMetric({ label, value, unit, icon, alert }: { label: string, value: string | number, unit: string, icon?: React.ReactNode, alert?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-neutral-500 font-semibold tracking-widest">{label}</span>
      <div className={clsx("flex items-center space-x-1.5", alert ? "text-red-500 animate-pulse" : "text-neutral-100")}>
        {icon}
        <span className="text-base font-medium tabular-nums">{value}</span>
        <span className="text-xs text-neutral-500">{unit}</span>
      </div>
    </div>
  );
}
