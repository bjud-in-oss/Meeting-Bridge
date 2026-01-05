import React, { useEffect, useState } from 'react';
// Fix: Import audioService singleton from the store module where it is instantiated, rather than the class definition file.
import { useAppStore, audioService } from '../stores/useAppStore';

interface SettingsPanelProps {
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const { 
    roomState, 
    setLanguageConfig, 
    jitterBufferMs, 
    setJitterBuffer,
    inputDeviceId,
    outputDeviceId,
    setInputDevice,
    setOutputDevice
  } = useAppStore();

  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);

  // Load Devices on Mount
  useEffect(() => {
    audioService.getDevices().then(devices => {
      setInputs(devices.inputs);
      setOutputs(devices.outputs);
    });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-8">

          {/* Language Section */}
          <section>
            <h3 className="text-xs font-bold text-brand-400 uppercase tracking-widest mb-4">Translation</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-2">Source (Speaker)</label>
                <select 
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-brand-500 outline-none"
                  value={roomState.languageConfig.sourceLanguage}
                  onChange={(e) => setLanguageConfig({ ...roomState.languageConfig, sourceLanguage: e.target.value })}
                >
                  <option value="en-US">English (US)</option>
                  <option value="sv-SE">Swedish</option>
                  <option value="es-ES">Spanish</option>
                  <option value="fr-FR">French</option>
                  <option value="de-DE">German</option>
                  <option value="ja-JP">Japanese</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-2">Target (Listener)</label>
                <select 
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-brand-500 outline-none"
                  value={roomState.languageConfig.targetLanguage}
                  onChange={(e) => setLanguageConfig({ ...roomState.languageConfig, targetLanguage: e.target.value })}
                >
                   <option value="en-US">English (US)</option>
                  <option value="sv-SE">Swedish</option>
                  <option value="es-ES">Spanish</option>
                  <option value="fr-FR">French</option>
                  <option value="de-DE">German</option>
                  <option value="ja-JP">Japanese</option>
                </select>
              </div>
            </div>
          </section>

          {/* Audio Devices */}
          <section>
             <h3 className="text-xs font-bold text-brand-400 uppercase tracking-widest mb-4">Audio Hardware</h3>
             <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Microphone</label>
                  <select 
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-brand-500 outline-none"
                    value={inputDeviceId}
                    onChange={(e) => setInputDevice(e.target.value)}
                  >
                    <option value="default">Default</option>
                    {inputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,4)}`}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Speaker</label>
                  <select 
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-brand-500 outline-none"
                    value={outputDeviceId}
                    onChange={(e) => setOutputDevice(e.target.value)}
                  >
                    <option value="default">Default</option>
                    {outputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0,4)}`}</option>)}
                  </select>
                </div>
             </div>
          </section>

          {/* Network Tuning */}
           <section>
             <div className="flex justify-between mb-2">
               <h3 className="text-xs font-bold text-brand-400 uppercase tracking-widest">Network Optimization</h3>
               <span className="text-xs font-mono text-slate-400">{jitterBufferMs}ms</span>
             </div>
             <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
               <label className="block text-xs text-slate-400 mb-3">Jitter Buffer (Audio Delay)</label>
               <input 
                 type="range" 
                 min="0" 
                 max="500" 
                 step="10" 
                 value={jitterBufferMs}
                 onChange={(e) => setJitterBuffer(Number(e.target.value))}
                 className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
               />
               <p className="text-[10px] text-slate-500 mt-2">
                 Increase this if audio sounds "choppy" or robotic. Decrease for lower latency.
               </p>
             </div>
          </section>

        </div>
        
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-500">
            Done
          </button>
        </div>

      </div>
    </div>
  );
};

export default SettingsPanel;