import { IAudioService } from './interfaces';

// Constants for Audio Processing
const INPUT_SAMPLE_RATE = 16000; // Gemini prefers 16kHz for input
const VAD_THRESHOLD = 0.015;     // RMS Threshold for speech detection
const VAD_HANGOVER_TIME = 500;   // ms to wait before declaring silence
const BUFFER_SIZE = 4096;        // ScriptProcessor buffer size

/**
 * Helper class for Voice Activity Detection.
 * Separates the logic of "Is the user speaking?" from the audio plumbing.
 */
class VoiceActivityDetector {
  private isSpeaking: boolean = false;
  private lastActivityTime: number = 0;
  private callback: ((active: boolean) => void) | null = null;

  public setCallback(cb: (active: boolean) => void) {
    this.callback = cb;
  }

  public process(data: Float32Array): number {
    // Calculate Root Mean Square (RMS) represents volume/energy
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / data.length);

    const now = Date.now();

    if (rms > VAD_THRESHOLD) {
      this.lastActivityTime = now;
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.emitChange(true);
      }
    } else {
      if (this.isSpeaking && (now - this.lastActivityTime > VAD_HANGOVER_TIME)) {
        this.isSpeaking = false;
        this.emitChange(false);
      }
    }

    return rms; // Return volume for visualization
  }

  private emitChange(isActive: boolean) {
    if (this.callback) {
      this.callback(isActive);
    }
  }
}

/**
 * Resamples audio buffer from one rate to another using Linear Interpolation.
 */
function downsampleBuffer(
  buffer: Float32Array, 
  sourceRate: number, 
  targetRate: number
): Float32Array {
  if (targetRate === sourceRate) return buffer;
  if (targetRate > sourceRate) throw new Error("Upsampling not supported in this utility");

  const ratio = sourceRate / targetRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    // Linear interpolation index
    const originalIndex = i * ratio;
    const indexFloor = Math.floor(originalIndex);
    const indexCeil = Math.ceil(originalIndex);
    const weight = originalIndex - indexFloor;
    
    // Boundary check
    const val1 = buffer[indexFloor] || 0;
    const val2 = buffer[indexCeil] || val1; // Fallback to val1 if end of buffer

    result[i] = val1 * (1 - weight) + val2 * weight;
  }
  
  return result;
}

export class AudioService implements IAudioService {
  private inputContext: AudioContext | null = null;
  private outputContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private inputGain: GainNode | null = null;
  
  private vad: VoiceActivityDetector;
  private currentVolume: number = 0;
  
  // Playback Scheduling
  private nextStartTime: number = 0;

  constructor() {
    this.vad = new VoiceActivityDetector();
  }

  /**
   * Initialize AudioContexts. 
   * Browsers require user gesture to resume AudioContext, usually handled in UI.
   */
  private ensureContexts() {
    if (!this.inputContext) {
      this.inputContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (!this.outputContext) {
      this.outputContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000 // optimize output context for Gemini's 24kHz default if possible, otherwise browser resamples
      });
    }
  }

  public async startCapture(onAudioData: (data: Float32Array) => void): Promise<void> {
    this.ensureContexts();
    if (!this.inputContext) throw new Error("AudioContext failed to initialize");

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      const source = this.inputContext.createMediaStreamSource(this.mediaStream);
      this.inputGain = this.inputContext.createGain();
      
      // Use ScriptProcessor for raw audio access (AudioWorklet is better but requires separate files/bundling complexity)
      this.scriptProcessor = this.inputContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

      this.scriptProcessor.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer.getChannelData(0);
        
        // 1. Process VAD and Volume
        this.currentVolume = this.vad.process(inputBuffer);

        // 2. Resample to 16kHz for Gemini/Network
        const sourceRate = this.inputContext!.sampleRate;
        const resampledData = downsampleBuffer(inputBuffer, sourceRate, INPUT_SAMPLE_RATE);

        // 3. Emit data
        onAudioData(resampledData);
      };

      // Connect graph: Source -> Gain -> Processor -> Destination (mute locally)
      source.connect(this.inputGain);
      this.inputGain.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.inputContext.destination);

    } catch (error) {
      console.error("Error starting audio capture:", error);
      throw error;
    }
  }

  public stopCapture(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.scriptProcessor && this.inputContext) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
  }

  public playAudioQueue(audioData: Float32Array, sampleRate: number): void {
    this.ensureContexts();
    if (!this.outputContext) return;

    // 1. Handle Sample Rate Dynamically
    // We create a buffer with the explicit sample rate coming from the payload (16k for P2P, 24k for Gemini)
    const buffer = this.outputContext.createBuffer(1, audioData.length, sampleRate);
    buffer.getChannelData(0).set(audioData);

    const source = this.outputContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputContext.destination);

    const currentTime = this.outputContext.currentTime;

    // 2. JITTER BUFFER / TIMING LOGIC
    // If we are falling behind (nextStartTime is in the past), reset to now + buffer.
    // This fixes the "stuttering" (darrar) by accepting a small gap instead of playing fast catch-up or glitching.
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.05; // 50ms buffer
    }

    source.start(this.nextStartTime);

    // Advance the pointer
    this.nextStartTime += buffer.duration;
  }

  public onVoiceActivity(callback: (active: boolean) => void): void {
    this.vad.setCallback(callback);
  }

  public getVolumeLevel(): number {
    // Return volume normalized roughly 0-100 for UI
    return Math.min(100, Math.round(this.currentVolume * 500)); 
  }
}