import React, { useEffect, useState, useMemo } from 'react';
import { useAppStore, networkService } from './src/stores/useAppStore';
import { GeminiHostService } from './src/services/GeminiHostService';
import { PeerRole } from './src/types/schema';

// Components
import RoomJoiner from './src/components/RoomJoiner';
import StatusBadge from './src/components/StatusBadge';
import MicButton from './src/components/MicButton';
import TranscriptFeed from './src/components/TranscriptFeed';
import SettingsPanel from './src/components/SettingsPanel';

// Singleton for Host AI
const geminiHost = new GeminiHostService();

const App: React.FC = () => {
  // Store
  const { 
    isInitialized, 
    initialize, 
    myId, 
    roomState, 
    toggleMic, 
    isMicActive, 
    volumeLevel,
    transcripts,
    setAudioChunkListener
  } = useAppStore();

  const [apiKey, setApiKey] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isAiRunning, setIsAiRunning] = useState(false);

  // Derived State
  const me = roomState.peers[myId];
  const isHost = me?.role === PeerRole.HOST;
  const isSpeaker = roomState.speakerId === myId;
  const isQueued = false; // TODO: Implement queue logic in store if needed

  // "My Transcription" Live Preview
  // Filter for my latest non-final transcript or just the last one if it's mine
  const myLiveTranscript = useMemo(() => {
    const myLast = transcripts.filter(t => t.senderId === myId).pop();
    // Use it if it's recent (last 10 seconds) to avoid stale text
    if (myLast && (Date.now() - myLast.timestamp < 10000)) {
      return myLast;
    }
    return null;
  }, [transcripts, myId]);

  // --- Host AI Logic ---
  useEffect(() => {
    if (isHost) {
      setAudioChunkListener((data: Float32Array, senderId: string) => {
        if (isAiRunning) {
          geminiHost.pushAudio(data);
        }
      });
    } else {
      setAudioChunkListener(() => {}); 
    }
  }, [isHost, isAiRunning, setAudioChunkListener]);

  const toggleAiSession = async () => {
    if (isAiRunning) {
      geminiHost.stopLiveSession();
      setIsAiRunning(false);
    } else {
      if (!apiKey && !process.env.API_KEY) {
        setShowKeyModal(true);
        return;
      }
      const keyToUse = apiKey || process.env.API_KEY || '';
      try {
        geminiHost.initialize(keyToUse);
        await geminiHost.startLiveSession(
          roomState.languageConfig,
          (event) => {
            networkService.broadcast(event);
            useAppStore.getState().handleIncomingEvent(event, 'TRANSLATOR_BOT');
          }
        );
        setIsAiRunning(true);
        setShowKeyModal(false);
      } catch (e: any) {
        alert("Failed to start AI: " + e.message);
      }
    }
  };

  if (!isInitialized) {
    return <RoomJoiner onJoin={initialize} />;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col overflow-hidden">
      
      {/* --- HEADER --- */}
      <header className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-lg z-20">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-tr from-brand-600 to-purple-600 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-brand-900/50">
            MT
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none mb-1">LinguaFlow</h1>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono uppercase tracking-wider">
              <span>#{roomState.roomId}</span>
              <span className="text-slate-700">|</span>
              <span>{Object.keys(roomState.peers).length} Connected</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {me && <StatusBadge role={me.role} isOnline={me.isOnline} name={me.name} />}
          
          {isHost && (
            <button
              onClick={toggleAiSession}
              className={`text-xs font-bold px-4 py-2 rounded-lg border transition-all ${
                isAiRunning 
                  ? 'bg-purple-900/20 text-purple-300 border-purple-500/50 animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.3)]' 
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {isAiRunning ? '• AI LIVE' : 'START AI'}
            </button>
          )}

          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </header>

      {/* --- MAIN LAYOUT --- */}
      <main className="flex-1 overflow-hidden relative flex flex-col md:flex-row">
        
        {/* LEFT: CONTROLS */}
        <div className="md:w-1/3 relative border-r border-slate-800 bg-slate-900 flex flex-col">
          
          {/* Muted Pattern Overlay */}
          {!isMicActive && (
             <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
               style={{ 
                 backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 10px, transparent 10px, transparent 20px)' 
               }} 
             />
          )}

          <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10">
            {/* Visualizer Background */}
            <div 
              className="absolute inset-0 pointer-events-none opacity-10 transition-opacity duration-300"
              style={{ 
                background: `radial-gradient(circle at center, rgba(14,165,233,0.5) ${volumeLevel}%, transparent 60%)` 
              }}
            />

            <MicButton 
              isActive={isMicActive} 
              isQueued={!isSpeaker && isMicActive} 
              volumeLevel={volumeLevel}
              onClick={toggleMic}
            />

            {/* My Live Transcript Preview */}
            <div className="mt-8 w-full min-h-[80px] flex items-center justify-center">
              {isMicActive && myLiveTranscript ? (
                <div className="text-center animate-in fade-in slide-in-from-bottom-2">
                  <p className={`text-lg font-medium leading-relaxed ${myLiveTranscript.isFinal ? 'text-white' : 'text-slate-400 italic'}`}>
                    "{myLiveTranscript.text}"
                  </p>
                  {!myLiveTranscript.isFinal && (
                    <span className="text-[10px] text-brand-400 font-bold uppercase tracking-widest mt-2 block animate-pulse">
                      Processing...
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-center text-slate-600 text-sm">
                  {isSpeaker ? "Listening..." : "Floor is open"}
                </div>
              )}
            </div>
          </div>

          {/* Info Footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/50 backdrop-blur text-center z-10">
            <div className="inline-flex items-center gap-3 text-xs font-medium text-slate-400 bg-slate-800 px-4 py-2 rounded-full border border-slate-700">
               <span className="text-white">{roomState.languageConfig.sourceLanguage.split('-')[0].toUpperCase()}</span>
               <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" x2="19" y1="12" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
               <span className="text-white">{roomState.languageConfig.targetLanguage.split('-')[0].toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* RIGHT: TRANSCRIPT FEED */}
        <div className="md:w-2/3 bg-slate-950 relative flex flex-col">
          <TranscriptFeed 
            transcripts={transcripts} 
            myId={myId} 
            peers={roomState.peers} 
          />
        </div>

      </main>

      {/* --- MODALS --- */}
      
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {showKeyModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 p-8 rounded-2xl border border-slate-700 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold mb-2 text-white">Enable AI Translation</h3>
            <p className="text-sm text-slate-400 mb-6">
              Enter your Google Gemini API Key to become the translation host for this room.
            </p>
            <input 
              type="password" 
              className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white mb-6 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition"
              placeholder="Paste AIza..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowKeyModal(false)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition">Cancel</button>
              <button onClick={toggleAiSession} className="px-5 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-500 shadow-lg shadow-brand-500/20 transition">Start Session</button>
            </div>
             <p className="mt-6 text-[10px] text-slate-500 text-center">
              No key? <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline hover:text-brand-400 transition">Get one here</a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;