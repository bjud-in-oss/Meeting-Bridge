import React from 'react';

interface MicButtonProps {
  isActive: boolean;
  isQueued: boolean; // True if requested but not granted
  volumeLevel: number; // 0-100
  onClick: () => void;
  disabled?: boolean;
}

const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
);

const MutedIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.13"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
);

const MicButton: React.FC<MicButtonProps> = ({ isActive, isQueued, volumeLevel, onClick, disabled }) => {
  // Volume Aura calculation
  // We want a subtle pulse when idle, and a strong pulse when volume is high
  const scale = 1 + (volumeLevel / 200); // 1.0 to 1.5
  const opacity = 0.2 + (volumeLevel / 150); // 0.2 to 0.8
  const auraColor = isActive ? 'rgba(14, 165, 233,' : 'rgba(245, 158, 11,'; // Brand vs Amber

  return (
    <div className="flex flex-col items-center gap-4 relative z-20">
      <div className="relative flex items-center justify-center">
        
        {/* Pulsing Aura */}
        {(isActive || isQueued) && (
          <div 
            className="absolute rounded-full transition-all duration-100 ease-out"
            style={{
              width: '100%',
              height: '100%',
              boxShadow: `0 0 0 0 ${auraColor} ${opacity})`,
              transform: `scale(${scale})`,
              background: `${auraColor} 0.1)`,
              animation: volumeLevel < 5 ? 'pulse-slow 2s infinite' : 'none'
            }}
          />
        )}

        {/* The Button */}
        <button
          onClick={onClick}
          disabled={disabled}
          className={`
            relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-2xl border-4 
            transition-all duration-300 transform active:scale-95
            ${isActive 
              ? 'bg-brand-600 border-brand-400 text-white shadow-brand-500/50' 
              : isQueued 
                ? 'bg-amber-600 border-amber-400 text-white shadow-amber-500/50' 
                : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700 hover:border-slate-500'
            }
          `}
        >
          {isActive ? <MicIcon /> : isQueued ? <span className="text-2xl font-bold">...</span> : <MutedIcon />}
        </button>

        {/* Queued Badge */}
        {isQueued && (
          <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-xs font-bold px-2 py-1 rounded-full border-2 border-slate-900 z-20">
            WAIT
          </span>
        )}
      </div>

      {/* Status Label */}
      <div className="flex flex-col items-center">
        <span className={`text-xs font-bold tracking-widest uppercase ${
          isActive ? 'text-brand-400 animate-pulse' : isQueued ? 'text-amber-400' : 'text-slate-500'
        }`}>
          {isActive ? 'LISTENING...' : isQueued ? 'IN QUEUE' : 'MUTED'}
        </span>
      </div>

      <style>{`
        @keyframes pulse-slow {
          0% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 0.2; }
          100% { transform: scale(1); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default MicButton;