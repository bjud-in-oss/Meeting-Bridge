import React, { useEffect, useRef } from 'react';
import { TranscriptionPayload } from '../types/schema';

interface TranscriptItem extends TranscriptionPayload {
  senderId: string;
  timestamp: number;
}

interface TranscriptFeedProps {
  transcripts: TranscriptItem[];
  myId: string;
  peers: Record<string, { name: string }>;
}

const getLanguageCode = (lang: string) => {
  if (!lang) return '??';
  return lang.split('-')[0].toUpperCase();
};

const TranscriptFeed: React.FC<TranscriptFeedProps> = ({ transcripts, myId, peers }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  if (transcripts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 italic p-8 text-center">
        <p>No speech detected yet.<br/>Start speaking to see translations.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
      {transcripts.map((t, idx) => {
        const isBot = t.senderId === 'TRANSLATOR_BOT';
        const isMe = t.senderId === myId;
        const senderName = isBot ? 'AI Interpreter' : (peers[t.senderId]?.name || 'Unknown');
        const langCode = getLanguageCode(t.originalLanguage);

        // Styling Logic
        let bubbleClass = "";
        let headerClass = "";
        
        if (isMe) {
          // Blue/Brand - My Original Words
          bubbleClass = "bg-brand-900/40 border-brand-500/30 text-brand-50 rounded-tr-sm";
          headerClass = "text-brand-400";
        } else if (isBot) {
          // Purple/Gold - AI Translation
          bubbleClass = "bg-purple-900/40 border-purple-500/30 text-purple-50 rounded-tl-sm shadow-[0_0_15px_rgba(168,85,247,0.1)]";
          headerClass = "text-purple-400";
        } else {
          // Gray - Other Participants
          bubbleClass = "bg-slate-800 border-slate-700 text-slate-200 rounded-tl-sm";
          headerClass = "text-slate-400";
        }

        return (
          <div key={`${t.timestamp}-${idx}`} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className={`relative max-w-[90%] md:max-w-[75%] rounded-2xl px-5 py-4 border backdrop-blur-sm ${bubbleClass}`}>
              
              {/* Header: Name & Time */}
              <div className="flex items-center justify-between gap-4 mb-2 border-b border-white/5 pb-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${headerClass}`}>
                  {senderName}
                </span>
                <span className="text-[10px] text-white/30 font-mono">
                  {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Content */}
              <p className="leading-relaxed text-base font-light">
                {t.text}
              </p>

              {/* Footer: Language Badge (if available) */}
              {t.originalLanguage && t.originalLanguage !== 'unknown' && (
                 <div className="absolute -bottom-3 -right-2 bg-slate-900 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-700 shadow-sm text-slate-400 flex items-center gap-1">
                   <span>{langCode}</span>
                 </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
};

export default TranscriptFeed;