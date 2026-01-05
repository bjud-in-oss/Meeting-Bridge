import React, { useState, useEffect } from 'react';

interface RoomJoinerProps {
  onJoin: (roomId: string, name: string) => void;
}

const RoomJoiner: React.FC<RoomJoinerProps> = ({ onJoin }) => {
  const [roomId, setRoomId] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    // Check URL for room
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    if (urlRoom) setRoomId(urlRoom);
    else {
      // Generate random room ID if none
      setRoomId(Math.random().toString(36).substring(2, 8).toUpperCase());
    }
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId && name) {
      // Update URL without reload
      const url = new URL(window.location.href);
      const cleanRoomId = roomId.trim().toUpperCase();
      url.searchParams.set('room', cleanRoomId);
      window.history.pushState({}, '', url);
      
      onJoin(cleanRoomId, name);
    }
  };

  const shareUrl = window.location.href.split('?')[0] + '?room=' + roomId;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700 p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-center mb-2 bg-clip-text text-transparent bg-gradient-to-r from-brand-500 to-purple-500">
          Meeting Translation
        </h1>
        <p className="text-center text-slate-400 text-sm mb-8">
          Serverless P2P Real-time Translation
        </p>

        <form onSubmit={handleJoin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Display Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition text-white placeholder-slate-600"
              placeholder="Enter your name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Room ID</label>
            <input
              type="text"
              required
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 focus:border-brand-500 outline-none text-white font-mono uppercase tracking-wider"
            />
          </div>

          <div className="flex justify-center py-4">
             <img 
               src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}&bgcolor=1e293b&color=e2e8f0`} 
               alt="Room QR Code"
               className="rounded-lg border-4 border-slate-700"
             />
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-lg shadow-lg shadow-brand-500/20 transition-all transform active:scale-95"
          >
            Join Meeting
          </button>
        </form>
      </div>
    </div>
  );
};

export default RoomJoiner;