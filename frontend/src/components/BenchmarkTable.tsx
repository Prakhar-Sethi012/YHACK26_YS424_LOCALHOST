import { useSimulationStore } from '../store/useSimulationStore';

function StatRow({ label, astar, dstar, unit = '', highlight = false }: {
  label: string; astar: number | string; dstar: number | string; unit?: string; highlight?: boolean;
}) {
  return (
    <tr className={highlight ? 'bg-green-950/20' : ''}>
      <td className="py-1 pr-3 text-neutral-500 text-[10px] font-mono">{label}</td>
      <td className="py-1 pr-3 text-right text-[11px] font-mono text-orange-300 tabular-nums">
        {typeof astar === 'number' ? astar.toFixed(1) : astar}{unit}
      </td>
      <td className={`py-1 text-right text-[11px] font-mono tabular-nums ${highlight ? 'text-green-400 font-bold' : 'text-green-300'}`}>
        {typeof dstar === 'number' ? dstar.toFixed(1) : dstar}{unit}
      </td>
    </tr>
  );
}

export default function BenchmarkTable() {
  const stats = useSimulationStore(s => s.benchmarkStats);

  return (
    <div className="p-3 bg-neutral-950/90 border border-neutral-800 backdrop-blur-md rounded-lg font-mono w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold tracking-widest text-cyan-400">
          ⚡ ALGORITHM BENCHMARK
        </div>
        {stats && (
          <div className="text-[9px] text-neutral-500">
            {stats.replan_count} replans
          </div>
        )}
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-800">
            <th className="text-left py-1 text-[9px] text-neutral-600 font-normal tracking-widest">METRIC</th>
            <th className="text-right py-1 text-[9px] text-orange-500 font-normal tracking-widest">A*</th>
            <th className="text-right py-1 text-[9px] text-green-500 font-normal tracking-widest">D* LITE</th>
          </tr>
        </thead>
        <tbody>
          {stats ? (
            <>
              <StatRow
                label="Latency"
                astar={stats.astar_latency_ms}
                dstar={stats.dstar_latency_ms || 0}
                unit="ms"
                highlight
              />
              <StatRow
                label="Path Len"
                astar={stats.astar_path_length}
                dstar={stats.dstar_path_length || stats.astar_path_length}
                unit=" wp"
              />
              <StatRow
                label="Speedup"
                astar="1.0×"
                dstar={stats.speedup_factor ? `${stats.speedup_factor.toFixed(1)}×` : '—'}
                highlight={!!(stats.speedup_factor && stats.speedup_factor > 2)}
              />
              <StatRow
                label="Nodes ↻"
                astar="all"
                dstar={stats.nodes_expanded || '—'}
              />
            </>
          ) : (
            <tr>
              <td colSpan={3} className="py-3 text-center text-[10px] text-neutral-600 italic">
                Drop an obstacle to trigger replan
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {stats?.speedup_factor && stats.speedup_factor > 2 && (
        <div className="mt-2 px-2 py-1 bg-green-950/30 border border-green-800/40 rounded text-[9px] text-green-400">
          D* Lite is <span className="font-bold">{stats.speedup_factor.toFixed(0)}× faster</span> than A* on incremental replan
        </div>
      )}
    </div>
  );
}
