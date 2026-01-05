import { create } from 'zustand';
import { NetworkService } from '../services/NetworkService';
import { AudioService } from '../services/AudioService';
import { 
  RoomState, 
  Peer, 
  PeerRole, 
  TranslationEvent, 
  EventType, 
  ControlSignal, 
  LanguageConfig,
  TranscriptionPayload,
  AudioChunkPayload,
  ControlPayload
} from '../types/schema';

// Instantiate Services (Singletons for the app lifetime)
export const networkService = new NetworkService(); // Exported for direct access if needed
export const audioService = new AudioService();

// --- Binary Helpers (High Performance) ---

/**
 * Converts a Float32Array directly to a Base64 string representing the raw bytes.
 * Much faster and smaller than CSV serialization.
 */
function float32ToBase64(buffer: Float32Array): string {
  const bytes = new Uint8Array(buffer.buffer);
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192; // Chunk size to avoid stack overflow in String.fromCharCode

  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    // @ts-ignore - spread operator on typed array works in modern environments
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Decodes a Base64 string back to a Float32Array.
 */
function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  // Create a view on the buffer (assuming same endianness, standard for Web Audio)
  return new Float32Array(bytes.buffer);
}

interface AppState {
  // --- State ---
  myId: string;
  isInitialized: boolean;
  isMicActive: boolean;
  volumeLevel: number; // For visualization
  roomState: RoomState;
  transcripts: Array<TranscriptionPayload & { senderId: string; timestamp: number }>;
  
  // --- Actions ---
  initialize: (roomId: string, userName: string) => Promise<void>;
  toggleMic: () => void;
  setLanguageConfig: (config: LanguageConfig) => void;
  
  // Logic: Token Management
  requestTalkingStick: () => void;
  releaseTalkingStick: () => void;
  
  // Internal Handlers (exposed for testing/manual triggering if needed)
  handleIncomingEvent: (event: TranslationEvent, senderId: string) => void;
  
  // Hooks for Host Service
  onAudioChunkReceived: ((data: Float32Array, senderId: string) => void) | null;
  setAudioChunkListener: (cb: (data: Float32Array, senderId: string) => void) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // --- Initial State ---
  myId: networkService.getMyId(),
  isInitialized: false,
  isMicActive: false,
  volumeLevel: 0,
  transcripts: [],
  roomState: {
    roomId: '',
    hostId: '', 
    speakerId: null,
    isActive: true,
    peers: {},
    languageConfig: {
      sourceLanguage: 'en-US',
      targetLanguage: 'es-ES'
    }
  },
  onAudioChunkReceived: null,

  // --- Actions ---

  initialize: async (roomId: string, userName: string) => {
    // 1. Setup Network Listeners
    networkService.onHostChanged((hostId) => {
      set((state) => ({
        roomState: { ...state.roomState, hostId }
      }));
    });

    networkService.onPeerJoin((peerId) => {
      set((state) => {
        const newPeers = { ...state.roomState.peers };
        if (!newPeers[peerId]) {
          newPeers[peerId] = {
            id: peerId,
            name: `User ${peerId.slice(0,4)}`, 
            role: PeerRole.GUEST,
            isOnline: true,
            joinedAt: Date.now()
          };
        }
        return { roomState: { ...state.roomState, peers: newPeers } };
      });
    });

    networkService.onPeerLeave((peerId) => {
      set((state) => {
        const newPeers = { ...state.roomState.peers };
        delete newPeers[peerId];
        const speakerId = state.roomState.speakerId === peerId ? null : state.roomState.speakerId;
        return { roomState: { ...state.roomState, peers: newPeers, speakerId } };
      });
    });

    networkService.onMessage((event, senderId) => {
      get().handleIncomingEvent(event, senderId);
    });

    // 2. Setup Audio Listeners
    audioService.onVoiceActivity((isActive) => {
      // Optional: Auto-request token logic here
    });
    
    setInterval(() => {
      if (get().isMicActive) {
        set({ volumeLevel: audioService.getVolumeLevel() });
      }
    }, 100);

    // 3. Connect Services
    await networkService.joinRoom(roomId);
    
    const myId = networkService.getMyId();
    set((state) => ({
      myId,
      isInitialized: true,
      roomState: {
        ...state.roomState,
        roomId,
        peers: {
          ...state.roomState.peers,
          [myId]: {
            id: myId,
            name: userName,
            role: PeerRole.GUEST, 
            isOnline: true,
            joinedAt: Date.now()
          }
        }
      }
    }));
  },

  toggleMic: async () => {
    const { isMicActive, requestTalkingStick, releaseTalkingStick } = get();
    
    if (!isMicActive) {
      try {
        await audioService.startCapture((data) => {
          const { roomState, myId, onAudioChunkReceived } = get();
          
          // Only process audio if I am the speaker
          if (roomState.speakerId === myId) {
            
            // If I am Host, pipe directly to Gemini (don't broadcast my own raw audio to avoid loopback)
            // Actually, for simplicity, I broadcast to guests, but also pipe to Gemini.
            if (onAudioChunkReceived) {
              onAudioChunkReceived(data, myId);
            }

            // OPTIMIZATION: Convert Float32Array buffer to Base64
            const serialized = float32ToBase64(data);
            
            networkService.broadcast({
              id: crypto.randomUUID(),
              type: EventType.AUDIO_CHUNK,
              senderId: myId,
              timestamp: Date.now(),
              payload: {
                data: serialized,
                sampleRate: 16000,
                sequenceId: Date.now()
              } as AudioChunkPayload
            });
          }
        });
        
        set({ isMicActive: true });
        requestTalkingStick(); 

      } catch (e) {
        console.error("Failed to start mic", e);
      }
    } else {
      audioService.stopCapture();
      set({ isMicActive: false, volumeLevel: 0 });
      releaseTalkingStick();
    }
  },

  setLanguageConfig: (config) => {
    set((state) => ({ 
      roomState: { ...state.roomState, languageConfig: config } 
    }));
  },

  setAudioChunkListener: (cb) => {
    set({ onAudioChunkReceived: cb });
  },

  requestTalkingStick: () => {
    const { myId, roomState } = get();
    const isHost = myId === roomState.hostId;

    if (isHost) {
      const newRoomState = { ...roomState, speakerId: myId };
      set({ roomState: newRoomState });

      networkService.broadcast({
        id: crypto.randomUUID(),
        type: EventType.CONTROL_SIGNAL,
        senderId: myId,
        timestamp: Date.now(),
        payload: {
          signal: ControlSignal.GRANT_TOKEN,
          targetPeerId: myId
        } as ControlPayload
      });

    } else {
      networkService.sendToPeer(roomState.hostId, {
        id: crypto.randomUUID(),
        type: EventType.CONTROL_SIGNAL,
        senderId: myId,
        timestamp: Date.now(),
        payload: {
          signal: ControlSignal.REQUEST_TOKEN,
          targetPeerId: myId
        } as ControlPayload
      });
    }
  },

  releaseTalkingStick: () => {
    const { myId, roomState } = get();
    
    if (roomState.speakerId === myId) {
      set({ roomState: { ...roomState, speakerId: null } });

      networkService.broadcast({
        id: crypto.randomUUID(),
        type: EventType.CONTROL_SIGNAL,
        senderId: myId,
        timestamp: Date.now(),
        payload: {
          signal: ControlSignal.RELEASE_TOKEN
        } as ControlPayload
      });
    }
  },

  handleIncomingEvent: (event, senderId) => {
    const { myId, roomState, onAudioChunkReceived } = get();

    switch (event.type) {
      case EventType.AUDIO_CHUNK:
        // 1. Play Audio (if not from me)
        if (senderId !== myId) {
          const payload = event.payload as AudioChunkPayload;
          
          // OPTIMIZATION: Decode Base64 directly to Float32Array
          const floatArray = base64ToFloat32(payload.data);
          
          // IF I am NOT the Host, simply play it (Conversation mode).
          // IF I AM the Host, play it AND send to Gemini.
          
          if (senderId === 'TRANSLATOR_BOT') {
            // Always play bot audio with its specific sample rate (usually 24k)
            audioService.playAudioQueue(floatArray, payload.sampleRate || 24000);
          } else {
            // User audio - play with specific sample rate (usually 16k)
            audioService.playAudioQueue(floatArray, payload.sampleRate || 16000);
            
            // If I am Host, intercept for Gemini
            if (onAudioChunkReceived) {
              onAudioChunkReceived(floatArray, senderId);
            }
          }
        }
        break;

      case EventType.CONTROL_SIGNAL:
        const payload = event.payload as ControlPayload;
        
        if (payload.signal === ControlSignal.REQUEST_TOKEN) {
          if (myId === roomState.hostId) {
             const granteeId = payload.targetPeerId || senderId;
             const grantEvent: TranslationEvent = {
               id: crypto.randomUUID(),
               type: EventType.CONTROL_SIGNAL,
               senderId: myId,
               timestamp: Date.now(),
               payload: {
                 signal: ControlSignal.GRANT_TOKEN,
                 targetPeerId: granteeId
               } as ControlPayload
             };
             networkService.broadcast(grantEvent);
             set({ roomState: { ...roomState, speakerId: granteeId } });
          }
        }

        if (payload.signal === ControlSignal.GRANT_TOKEN) {
          const newSpeakerId = payload.targetPeerId;
          set({ roomState: { ...roomState, speakerId: newSpeakerId || null } });
        }

        if (payload.signal === ControlSignal.RELEASE_TOKEN) {
          set({ roomState: { ...roomState, speakerId: null } });
        }
        break;

      case EventType.TRANSCRIPTION:
        const transPayload = event.payload as TranscriptionPayload;
        set((state) => ({
          transcripts: [
            ...state.transcripts,
            { ...transPayload, senderId, timestamp: event.timestamp }
          ]
        }));
        break;
    }
  }
}));