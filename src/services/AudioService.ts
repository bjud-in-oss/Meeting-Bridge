import { IAudioService } from './interfaces';

// Constants for Audio Processing
const INPUT_SAMPLE_RATE = 16000; // Gemini prefers 16kHz for input
const VAD_THRESHOLD = 0.015;     // RMS Threshold for speech detection
const VAD_HANGOVER_TIME = 500;   // ms to wait before declaring silence
const BUFFER_SIZE = 4096;        // ScriptProcessor buffer size

/**
 * Helper class for Voice Activity Detection.
 */
class VoiceActivityDetector {
  private isSpeaking: boolean = false;
  private lastActivityTime: number = 0;
  private callback: ((active: boolean) => void) | null = null;

  public setCallback(cb: (active: boolean) => void) {
    this.callback = cb;
  }

  public process(data: Float32Array): number {
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
    return rms;
  }

  private emitChange(isActive: boolean) {
    if (this.callback) {
      this.callback(isActive);
    }
  }
}

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
    const originalIndex = i * ratio;
    const indexFloor = Math.floor(originalIndex);
    const indexCeil = Math.ceil(originalIndex);
    const weight = originalIndex - indexFloor;
    const val1 = buffer[indexFloor] || 0;
    const val2 = buffer[indexCeil] || val1;
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
  
  // Playback Scheduling & Config
  private nextStartTime: number = 0;
  private jitterLatency: number = 0.05; // Default 50ms

  constructor() {
    this.vad = new VoiceActivityDetector();
  }

  private ensureContexts() {
    if (!this.inputContext) {
      this.inputContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (!this.outputContext) {
      this.outputContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000
      });
    }
  }

  public async getDevices(): Promise<{ inputs: MediaDeviceInfo[], outputs: MediaDeviceInfo[] }> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return { inputs: [], outputs: [] };
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter(d => d.kind === 'audioinput'),
      outputs: devices.filter(d => d.kind === 'audiooutput')
    };
  }

  public async setOutputDevice(deviceId: string): Promise<void> {
    this.ensureContexts();
    if (this.outputContext && 'setSinkId' in this.outputContext.destination) {
      // @ts-ignore - Experimental API
      await (this.outputContext.destination as any).setSinkId(deviceId);
    } else {
      console.warn('Audio Output selection not supported in this browser.');
    }
  }

  public setJitterLatency(seconds: number): void {
    this.jitterLatency = Math.max(0, seconds);
  }

  public async startCapture(onAudioData: (data: Float32Array) => void, deviceId?: string): Promise<void> {
    this.ensureContexts();
    if (!this.inputContext) throw new Error("AudioContext failed to initialize");

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      const source = this.inputContext.createMediaStreamSource(this.mediaStream);
      this.inputGain = this.inputContext.createGain();
      
      this.scriptProcessor = this.inputContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
      this.scriptProcessor.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer.getChannelData(0);
        this.currentVolume = this.vad.process(inputBuffer);
        const sourceRate = this.inputContext!.sampleRate;
        const resampledData = downsampleBuffer(inputBuffer, sourceRate, INPUT_SAMPLE_RATE);
        onAudioData(resampledData);
      };

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
    this.currentVolume = 0;
  }

  public playAudioQueue(audioData: Float32Array, sampleRate: number): void {
    this.ensureContexts();
    if (!this.outputContext) return;

    const buffer = this.outputContext.createBuffer(1, audioData.length, sampleRate);
    buffer.getChannelData(0).set(audioData);

    const source = this.outputContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputContext.destination);

    const currentTime = this.outputContext.currentTime;

    // Enhanced Jitter Buffer Logic using configurable latency
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + this.jitterLatency;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
  }

  public onVoiceActivity(callback: (active: boolean) => void): void {
    this.vad.setCallback(callback);
  }

  public getVolumeLevel(): number {
    return Math.min(100, Math.round(this.currentVolume * 500)); 
  }
}