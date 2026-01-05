/**
 * Enums representing the specific role of a participant in the P2P network.
 */
export enum PeerRole {
  HOST = 'HOST',
  GUEST = 'GUEST',
}

/**
 * Represents a participant in the translation room.
 */
export interface Peer {
  id: string;
  name: string;
  role: PeerRole;
  batteryLevel?: number; // Optional, as some devices might not support battery API
  isOnline: boolean;
  joinedAt: number;
}

/**
 * Defines the current configuration of the language environment.
 */
export interface LanguageConfig {
  sourceLanguage: string; // e.g., 'en-US'
  targetLanguage: string; // e.g., 'sv-SE'
}

/**
 * Represents the global state of the room, synchronized across peers (eventually consistency).
 */
export interface RoomState {
  roomId: string;
  hostId: string;
  /**
   * The ID of the peer who currently holds the "Talarstaven" (Speaker Token).
   * Only this peer should be sending AUDIO_CHUNK events.
   */
  speakerId: string | null;
  languageConfig: LanguageConfig;
  isActive: boolean;
  peers: Record<string, Peer>; // Map of ID -> Peer
}

/**
 * Enum for the types of messages sent over the P2P network.
 */
export enum EventType {
  AUDIO_CHUNK = 'AUDIO_CHUNK',
  TRANSCRIPTION = 'TRANSCRIPTION',
  TRANSLATION = 'TRANSLATION',
  CONTROL_SIGNAL = 'CONTROL_SIGNAL',
  STATE_UPDATE = 'STATE_UPDATE',
}

/**
 * Specific payloads for Control Signals.
 */
export enum ControlSignal {
  REQUEST_TOKEN = 'REQUEST_TOKEN',
  RELEASE_TOKEN = 'RELEASE_TOKEN',
  GRANT_TOKEN = 'GRANT_TOKEN',
  MUTE_PEER = 'MUTE_PEER',
  KICK_PEER = 'KICK_PEER',
}

/**
 * The structure of a data packet transmitted via Trystero.
 */
export interface TranslationEvent<T = any> {
  id: string; // UUID for the event
  type: EventType;
  senderId: string;
  timestamp: number;
  payload: T;
}

// Payload Specific Interfaces

export interface AudioChunkPayload {
  data: string; // Base64 encoded string of the raw Float32Array buffer
  sampleRate: number;
  sequenceId: number;
}

export interface TranscriptionPayload {
  text: string;
  isFinal: boolean;
  originalLanguage: string;
}

export interface TranslationPayload {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
}

export interface ControlPayload {
  signal: ControlSignal;
  targetPeerId?: string;
}