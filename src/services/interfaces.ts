import { 
  Peer, 
  TranslationEvent, 
  RoomState, 
  LanguageConfig 
} from '../types/schema';

/**
 * Contract for P2P Networking (Wrapper around Trystero or similar).
 * Handles connectivity, peer discovery, and data transmission.
 */
export interface INetworkService {
  /**
   * Initialize connection to a specific room.
   */
  joinRoom(roomId: string): Promise<void>;

  /**
   * Disconnect and clean up resources.
   */
  leaveRoom(): void;

  /**
   * Broadcast an event to all connected peers.
   */
  broadcast(event: TranslationEvent): void;

  /**
   * Send an event to a specific peer (e.g., Host granting token to specific Guest).
   */
  sendToPeer(peerId: string, event: TranslationEvent): void;

  /**
   * Callback registration for incoming data.
   */
  onMessage(callback: (event: TranslationEvent, senderId: string) => void): void;

  /**
   * Callback for when a peer joins the room.
   */
  onPeerJoin(callback: (peerId: string) => void): void;

  /**
   * Callback for when a peer leaves the room.
   */
  onPeerLeave(callback: (peerId: string) => void): void;

  /**
   * Callback for when the Host changes (Leader Election result).
   * Passes the peerId of the new Host.
   */
  onHostChanged(callback: (hostId: string) => void): void;

  /**
   * Get the local peer's ID.
   */
  getMyId(): string;
}

/**
 * Contract for Audio processing.
 * Handles Microphone input, VAD (Voice Activity Detection), and Speaker output.
 */
export interface IAudioService {
  /**
   * Request microphone access and start processing.
   * Can specify a deviceId.
   */
  startCapture(onAudioData: (data: Float32Array) => void, deviceId?: string): Promise<void>;

  /**
   * Stop microphone capture.
   */
  stopCapture(): void;

  /**
   * Play received audio chunks (PCM data).
   */
  playAudioQueue(audioData: Float32Array, sampleRate: number): void;

  /**
   * Detects if the user is currently speaking (VAD).
   * Used to automatically request the Speaker Token.
   */
  onVoiceActivity(callback: (active: boolean) => void): void;

  /**
   * Get current input volume level (0-100) for UI visualization.
   */
  getVolumeLevel(): number;

  /**
   * Set the Jitter Buffer latency in seconds (e.g., 0.05 for 50ms).
   */
  setJitterLatency(seconds: number): void;

  /**
   * Get list of available audio input/output devices.
   */
  getDevices(): Promise<{ inputs: MediaDeviceInfo[], outputs: MediaDeviceInfo[] }>;

  /**
   * Set the audio output device (Speaker).
   */
  setOutputDevice(deviceId: string): Promise<void>;
}

/**
 * Contract for AI operations via Google Gemini.
 * STRICTLY for use by the HOST only. Guests should not hold API keys.
 */
export interface IGeminiService {
  /**
   * Initializes the Gemini client with the secure key.
   */
  initialize(apiKey: string): void;

  /**
   * Starts a Live WebSocket session for real-time translation.
   * @param config Language configuration
   * @param onBroadcast Callback to send generated events (Audio/Text) to the network.
   */
  startLiveSession(
    config: LanguageConfig,
    onBroadcast: (event: TranslationEvent) => void
  ): Promise<void>;

  /**
   * Pushes audio data (Float32Array 16kHz) from a peer into the Gemini Live Session.
   */
  pushAudio(data: Float32Array): void;

  /**
   * Stops the current live session.
   */
  stopLiveSession(): void;

  /**
   * Translates text from source to target (Fallback/Chat).
   */
  translateText(
    text: string, 
    config: LanguageConfig
  ): Promise<string>;
}

/**
 * Contract for Managing Application State.
 * Orchestrates the interaction between Network, Audio, and UI.
 */
export interface IRoomStore {
  state: RoomState;
  
  // Actions
  setHost(peerId: string): void;
  requestSpeakerToken(): void;
  releaseSpeakerToken(): void;
  updateLanguageConfig(config: LanguageConfig): void;
}