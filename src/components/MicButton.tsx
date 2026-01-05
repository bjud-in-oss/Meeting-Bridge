import React from 'react';

interface MicButtonProps {
  isActive: boolean;
  isQueued: boolean; // True if requested but not granted
  onClick: () => void;
  disabled?: boolean;
}

const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
);

const MicButton: React.FC<MicButtonProps> = ({ isActive, isQueued, onClick, disabled }) => {
  // States:
  // Active (Speaking): Green, Pulsing
  // Queued (Waiting): Yellow, Static or Slow Pulse
  // Inactive (Muted): Slate/Gray

  let bgClass = "bg-slate-700 hover:bg-slate-600 border-slate-600";
  let iconClass = "text-slate-400";
  let ringClass = "";

  if (isActive) {
    bgClass = "bg-brand-600 hover:bg-brand-500 border-brand-400";
    iconClass = "text-white";
    ringClass = "animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75";
  } else if (isQueued) {
    bgClass = "bg-amber-600 hover:bg-amber-500 border-amber-400";
    iconClass = "text-white";
  }

  return (
    <div className="relative inline-flex group">
      {isActive && <span className={ringClass}></span>}
      <button
        onClick={onClick}
        disabled={disabled}
        className={`relative flex items-center justify-center w-24 h-24 rounded-full border-4 shadow-xl transition-all duration-300 transform active:scale-95 ${bgClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <MicIcon />
      </button>
      {isQueued && (
        <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-slate-900">
          Q
        </span>
      )}
    </div>
  );
};

export default MicButton;