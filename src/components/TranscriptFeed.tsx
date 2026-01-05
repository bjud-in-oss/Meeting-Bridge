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

const TranscriptFeed: React.FC<TranscriptFeedProps> = ({ transcripts, myId, peers }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  if (transcripts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 italic">
        Waiting for speech...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto space-y-4 p-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
      {transcripts.map((t, idx) => {
        const isBot = t.senderId === 'TRANSLATOR_BOT';
        const isMe = t.senderId === myId;
        const senderName = isBot ? 'Meeting AI' : (peers[t.senderId]?.name || 'Unknown');

        return (
          <div key={`${t.timestamp}-${idx}`} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border ${
              isBot 
                ? 'bg-purple-900/30 border-purple-700/50 text-purple-100 rounded-tl-none' 
                : isMe 
                  ? 'bg-brand-900/30 border-brand-700/50 text-brand-50 rounded-tr-none' 
                  : 'bg-slate-800 border-slate-700 text-slate-200 rounded-tl-none'
            }`}>
              <div className="flex items-baseline justify-between mb-1 gap-4">
                <span className={`text-xs font-bold uppercase tracking-wider ${
                  isBot ? 'text-purple-400' : isMe ? 'text-brand-400' : 'text-slate-400'
                }`}>
                  {senderName}
                </span>
                <span className="text-[10px] text-slate-500">
                  {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="leading-relaxed">{t.text}</p>
              {t.originalLanguage && t.originalLanguage !== 'unknown' && (
                <span className="block mt-2 text-[10px] uppercase tracking-widest opacity-40">
                  Translated to {t.originalLanguage}
                </span>
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