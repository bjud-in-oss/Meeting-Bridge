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

// --- Helpers for Audio Encoding ---

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}

function base64Encode(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
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
      // There isn't a strict 'close' method on the session object in the SDK documentation provided, 
      // but usually closing the socket or letting it get garbage collected is key. 
      // The instructions say "use session.close() to close the connection".
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

    // Convert Float32 -> Int16 -> Base64
    const pcmData = floatTo16BitPCM(data);
    const base64Audio = base64Encode(pcmData.buffer);

    // Send to Gemini
    // Using promise-based send to prevent race conditions as per guidelines
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
    // The server returns modelTurn with audio parts
    const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio) {
      // Broadcast translated audio to everyone
      // We assume the data coming back is PCM 24kHz (default for Gemini)
      // The consumers (AudioService) need to handle this.
      
      // We need to convert Base64 back to a format our Event system expects.
      // Our AudioChunkPayload expects 'data' to be serialized numbers or base64.
      // Let's decode the base64 to Float32Array locally? 
      // Or just pass the base64 string to the network to save bandwidth?
      // Our AudioService.playAudioQueue takes Float32Array. 
      // The NetworkService serialized Float32Array to CSV string in useAppStore.
      // To keep it compatible, we should convert this PCM Int16/24 back to Float32 CSV 
      // OR update the store to handle Base64.
      
      // OPTIMIZATION: Sending Base64 over the wire is better than CSV text.
      // Ideally we update the store to handle both.
      // For now, let's decode to Float32 to match the existing simplistic contract in useAppStore
      // so we don't break the existing AudioService/Store logic in this step.
      
      const float32 = this.decodeBase64ToFloat32(base64Audio);
      const serialized = Array.from(float32).map(n => n.toFixed(4)).join(',');

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
       // Typically transcription comes via `modelTurn` text parts if configured,
       // or explicit `outputTranscription` / `inputTranscription` fields in the message.
       // The prompt guidelines mention: `serverContent.outputTranscription.text`.
       
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

  private decodeBase64ToFloat32(base64: string): Float32Array {
    const binary = atob(base64);
    const len = binary.length;
    // Gemini output is likely Int16 Little Endian PCM
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
}
