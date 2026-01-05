import React from 'react';
import { PeerRole } from '../types/schema';

interface StatusBadgeProps {
  role: PeerRole;
  isOnline: boolean;
  name: string;
}

const CrownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="m2 4 3 12h14l3-12-6 7-4-3-4 3-6-7z"/><circle cx="12" cy="9" r="2"/></svg>
);

const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
);

const StatusBadge: React.FC<StatusBadgeProps> = ({ role, isOnline, name }) => {
  const isHost = role === PeerRole.HOST;
  
  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${
      isHost 
        ? 'bg-amber-900/30 text-amber-200 border-amber-700' 
        : 'bg-slate-800 text-slate-300 border-slate-700'
    }`}>
      {isHost ? <CrownIcon /> : <UserIcon />}
      <span className="mr-2">{isHost ? 'HOST' : 'GUEST'}</span>
      <span className="mx-1 opacity-50">|</span>
      <span className="ml-1 truncate max-w-[100px]">{name}</span>
      <span className={`ml-2 w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
    </div>
  );
};

export default StatusBadge;