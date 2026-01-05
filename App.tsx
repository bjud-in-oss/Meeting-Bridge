import React, { useEffect, useState } from 'react';
import { useAppStore, networkService } from './src/stores/useAppStore';
import { GeminiHostService } from './src/services/GeminiHostService';
import { PeerRole } from './src/types/schema';

// Components
import RoomJoiner from './src/components/RoomJoiner';
import StatusBadge from './src/components/StatusBadge';
import MicButton from './src/components/MicButton';
import TranscriptFeed from './src/components/TranscriptFeed';

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
  const [isAiRunning, setIsAiRunning] = useState(false);

  // Derived State
  const me = roomState.peers[myId];
  const isHost = me?.role === PeerRole.HOST;
  const isSpeaker = roomState.speakerId === myId;
  const isQueued = false; // TODO: Implement queue logic in store if needed

  // --- Host AI Logic ---
  
  // 1. Hook up the audio stream when I become Host
  useEffect(() => {
    if (isHost) {
      // Connect store's incoming audio to Gemini
      setAudioChunkListener((data: Float32Array, senderId: string) => {
        if (isAiRunning) {
          geminiHost.pushAudio(data);
        }
      });
    } else {
      setAudioChunkListener(() => {}); // Clear if not host
    }
  }, [isHost, isAiRunning, setAudioChunkListener]);

  // 2. Start/Stop Gemini Session
  const toggleAiSession = async () => {
    if (isAiRunning) {
      geminiHost.stopLiveSession();
      setIsAiRunning(false);
    } else {
      // Check for API Key
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
            // Broadcast Gemini's output (Audio/Text) to everyone
            networkService.broadcast(event);
            
            // Also inject into local store so Host sees/hears it too
            // Note: Currently store handles broadcast reception for guests. 
            // We need to manually handle 'my own broadcast' if network doesn't loopback?
            // Trystero usually does NOT loopback.
            useAppStore.getState().handleIncomingEvent(event, 'TRANSLATOR_BOT');
          }
        );
        setIsAiRunning(true);
        setShowKeyModal(false);
      } catch (e) {
        alert("Failed to start AI: " + e.message);
      }
    }
  };

  // --- Render ---

  if (!isInitialized) {
    return <RoomJoiner onJoin={initialize} />;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-r from-brand-500 to-purple-500 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white">
            MT
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Meeting Translation</h1>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-mono bg-slate-700 px-1 rounded">#{roomState.roomId}</span>
              <span>•</span>
              <span>{Object.keys(roomState.peers).length} Peers</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {me && <StatusBadge role={me.role} isOnline={me.isOnline} name={me.name} />}
          
          {isHost && (
            <button
              onClick={toggleAiSession}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
                isAiRunning 
                  ? 'bg-purple-900/50 text-purple-300 border-purple-500 animate-pulse' 
                  : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
              }`}
            >
              {isAiRunning ? 'AI ACTIVE' : 'START AI'}
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative flex flex-col md:flex-row">
        
        {/* Left: Controls & Visuals */}
        <div className="md:w-1/3 p-8 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm relative border-r border-slate-800">
          
          {/* Audio Visualizer Ring (Simple CSS based on volume) */}
          <div 
            className="absolute inset-0 pointer-events-none opacity-20 transition-opacity duration-300"
            style={{ 
              background: `radial-gradient(circle, rgba(14,165,233,0.3) ${volumeLevel}%, transparent 70%)` 
            }}
          />

          <div className="relative z-10 flex flex-col items-center gap-8">
            <MicButton 
              isActive={isMicActive} 
              isQueued={!isSpeaker && isMicActive} // Simplified queue logic
              onClick={toggleMic}
            />
            
            <div className="text-center">
              <h2 className="text-xl font-semibold text-white mb-1">
                {isSpeaker ? "You are speaking" : (roomState.speakerId ? `${roomState.peers[roomState.speakerId]?.name} is speaking` : "Floor is open")}
              </h2>
              <p className="text-slate-400 text-sm">
                {roomState.languageConfig.sourceLanguage} → {roomState.languageConfig.targetLanguage}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Transcript */}
        <div className="md:w-2/3 bg-slate-950 relative">
          <TranscriptFeed 
            transcripts={transcripts} 
            myId={myId} 
            peers={roomState.peers} 
          />
        </div>

      </main>

      {/* API Key Modal for Host */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 max-w-sm w-full">
            <h3 className="text-lg font-bold mb-4">Enter Gemini API Key</h3>
            <p className="text-sm text-slate-400 mb-4">
              As the Host, you need a valid Google Gemini API Key to power the real-time translation for the room.
            </p>
            <input 
              type="password" 
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white mb-4 focus:border-brand-500 outline-none"
              placeholder="AIza..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowKeyModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={toggleAiSession} className="px-4 py-2 text-sm bg-brand-600 text-white rounded hover:bg-brand-500">Start Session</button>
            </div>
             <p className="mt-4 text-[10px] text-slate-500 text-center">
              <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline hover:text-brand-400">Get an API Key here</a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;