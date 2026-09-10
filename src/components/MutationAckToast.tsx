import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, MinusCircle, Zap } from 'lucide-react';
import { useMissionStore } from '../store/useMissionStore';

export const MutationAckToast: React.FC = () => {
  const lastMutationAck = useMissionStore((s) => s.lastMutationAck);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastMutationAck) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [lastMutationAck]);

  if (!visible || !lastMutationAck) return null;

  const renderContent = () => {
    switch (lastMutationAck.status) {
      case 'replanned':
        return {
          icon: <Zap className="w-4 h-4 text-emerald-400" />,
          border: 'border-emerald-500/50',
          label: `REPLAN COMPLETE // ${lastMutationAck.source.toUpperCase()}`,
          detail: (
            <>
              Round trip: <span className="text-emerald-300 font-bold">{lastMutationAck.round_trip_ms.toFixed(1)} ms</span>
              {' · '}
              Path changed: <span className="font-bold">{lastMutationAck.path_changed ? 'YES' : 'NO'}</span>
              {lastMutationAck.speedup_factor !== undefined && (
                <>
                  {' · '}Speedup: <span className="text-cyan-300 font-bold">{lastMutationAck.speedup_factor.toFixed(1)}x</span>
                </>
              )}
            </>
          ),
        };
      case 'no_op':
        return {
          icon: <MinusCircle className="w-4 h-4 text-neutral-400" />,
          border: 'border-neutral-600/50',
          label: 'NO-OP',
          detail: lastMutationAck.reason,
        };
      case 'replan_failed':
        return {
          icon: <XCircle className="w-4 h-4 text-rose-400" />,
          border: 'border-rose-500/50',
          label: 'REPLAN FAILED',
          detail: lastMutationAck.error,
        };
      case 'ignored':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-amber-400" />,
          border: 'border-amber-500/50',
          label: 'IGNORED',
          detail: lastMutationAck.reason,
        };
    }
  };

  const content = renderContent();
  if (!content) return null;

  return (
    <div
      className={`absolute bottom-40 right-4 z-30 max-w-sm bg-neutral-950/90 border ${content.border} rounded px-3 py-2 backdrop-blur-md font-mono text-xs text-white shadow-lg animate-[fadeIn_0.15s_ease-out] select-none`}
    >
      <div className="flex items-center gap-2 font-bold tracking-wide mb-1">
        {content.icon}
        {content.label}
      </div>
      <div className="text-neutral-300">{content.detail}</div>
    </div>
  );
};
