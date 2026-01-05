import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { IGeminiService } from './interfaces';
import { 
  LanguageConfig, 
  TranslationEvent, 
  EventType, 
  AudioChunkPayload, 
  TranscriptionPayload 
} from '../types/schema';

// --- Constants ---

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';

// Helper to create the system instruction based on config
const createSystemInstruction = (source: string, target: string) => `
You are a professional simultaneous interpreter.
Your task is to translate incoming speech from ${source} to ${target}.
- Output the translation as audio immediately.
- Maintain the tone and emotion of the speaker.
- Do not add your own commentary.
- If the input is silence or noise, output nothing.
`;

// --- Helpers for Audio Encoding (Gemini Protocol) ---

/**
 * Converts Float32Array (-1.0 to 1.0) to Int16Array for Gemini Input.
 */
function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}

/**
 * Standard Base64 encoding for ArrayBuffer.
 */
function base64Encode(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    // @ts-ignore
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// --- Implementation ---

export class GeminiHostService implements IGeminiService {
  private client: GoogleGenAI | null = null;
  private session: any | null = null; // LiveSession type
  private isConnected: boolean = false;
  private currentConfig: LanguageConfig | null = null;
  private broadcastCallback: ((event: TranslationEvent) => void) | null = null;

  public initialize(apiKey: string): void {
    if (!apiKey) {
      console.warn("GeminiHostService: No API Key provided.");
      return;
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  public async startLiveSession(
    config: LanguageConfig,
    onBroadcast: (event: TranslationEvent) => void
  ): Promise<void> {
    if (!this.client) throw new Error("Gemini Client not initialized. Call initialize() first.");
    
    // If session exists, close it first
    this.stopLiveSession();

    this.currentConfig = config;
    this.broadcastCallback = onBroadcast;

    try {
      this.session = await this.client.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO], // We want spoken translation
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: createSystemInstruction(config.sourceLanguage, config.targetLanguage),
        },
        callbacks: {
          onopen: () => {
            console.log("[Gemini] Live Session Connected");
            this.isConnected = true;
          },
          onmessage: (message: LiveServerMessage) => {
            this.handleGeminiMessage(message);
          },
          onclose: () => {
            console.log("[Gemini] Live Session Closed");
            this.isConnected = false;
          },
          onerror: (err: any) => {
            console.error("[Gemini] Live Session Error:", err);
            this.isConnected = false;
          }
        }
      });
    } catch (error) {
      console.error("[Gemini] Failed to start live session:", error);
      throw error;
    }
  }

  public stopLiveSession(): void {
    if (this.session) {
      try {
         // @ts-ignore - Assuming close exists based on prompt guidelines
         this.session.close(); 
      } catch (e) {
        // Ignore if already closed
      }
      this.session = null;
    }
    this.isConnected = false;
  }

  public pushAudio(data: Float32Array): void {
    if (!this.isConnected || !this.session) return;

    // Convert Float32 -> Int16 -> Base64 for Gemini API consumption
    const pcmData = floatTo16BitPCM(data);
    const base64Audio = base64Encode(pcmData.buffer);

    this.session.sendRealtimeInput({
      media: {
        mimeType: 'audio/pcm;rate=16000',
        data: base64Audio
      }
    });
  }

  public async translateText(text: string, config: LanguageConfig): Promise<string> {
    if (!this.client) return "";
    
    const response = await this.client.models.generateContent({
      model: "gemini-3-flash-preview", // Use lighter model for text tasks
      contents: `Translate the following text from ${config.sourceLanguage} to ${config.targetLanguage}: "${text}"`
    });
    
    return response.text || "";
  }

  // --- Internal Handling ---

  private handleGeminiMessage(message: LiveServerMessage) {
    if (!this.broadcastCallback) return;

    const serverContent = message.serverContent;
    
    // 1. Handle Audio Output (The Translation)
    const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio) {
      // Gemini sends audio as PCM (typically Int16).
      // We must convert this to Float32 to match the format our Peers expect (AudioChunkPayload).
      const float32Data = this.decodeBase64ToFloat32(base64Audio);
      
      // Re-encode as Base64 of the Float32 buffer for P2P broadcast
      const serialized = this.encodeFloat32ToBase64(float32Data);

      this.broadcastCallback({
        id: crypto.randomUUID(),
        type: EventType.AUDIO_CHUNK,
        senderId: 'TRANSLATOR_BOT',
        timestamp: Date.now(),
        payload: {
          data: serialized,
          sampleRate: 24000, // Gemini default output
          sequenceId: Date.now()
        } as AudioChunkPayload
      });
    }

    // 2. Handle Turn Complete (Transcription)
    if (serverContent?.turnComplete) {
       if (serverContent.outputTranscription?.text) {
         this.broadcastCallback({
           id: crypto.randomUUID(),
           type: EventType.TRANSCRIPTION,
           senderId: 'TRANSLATOR_BOT',
           timestamp: Date.now(),
           payload: {
             text: serverContent.outputTranscription.text,
             isFinal: true,
             originalLanguage: this.currentConfig?.targetLanguage || 'unknown'
           } as TranscriptionPayload
         });
       }
    }
  }

  // Decodes Gemini's (Int16/Base64) output to Float32 for internal processing
  private decodeBase64ToFloat32(base64: string): Float32Array {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    return float32;
  }

  // Encodes Float32 to Base64 (Raw Bytes) for P2P Broadcast
  private encodeFloat32ToBase64(buffer: Float32Array): string {
    const bytes = new Uint8Array(buffer.buffer);
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 8192;
    
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
      // @ts-ignore
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }
}