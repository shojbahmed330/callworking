import React from 'react';
import { CallHistoryEntry, User } from '../types';
import Icon from './Icon';

interface CallHistoryScreenProps {
  callHistory: CallHistoryEntry[];
  onInitiateCall: (peer: User, type: 'audio' | 'video') => void;
}

const CallHistoryScreen: React.FC<CallHistoryScreenProps> = ({ callHistory, onInitiateCall }) => {
  if (callHistory.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Icon name="phone" className="w-16 h-16 mx-auto mb-4" />
        <p>Your call history is empty.</p>
      </div>
    );
  }

  const getStatusIcon = (entry: CallHistoryEntry) => {
    const isOutgoing = entry.direction === 'outgoing';
    const color = entry.status === 'missed' ? 'text-red-400' : 'text-slate-400';
    const rotation = isOutgoing ? 'rotate-45' : '-rotate-135';

    return (
       <Icon name="back" className={`w-5 h-5 ${color} transform ${rotation}`} />
    );
  };

  return (
    <div className="space-y-3">
      {callHistory.map(entry => (
        <div key={entry.id} className="bg-slate-800 p-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={entry.peer.avatarUrl} alt={entry.peer.name} className="w-12 h-12 rounded-full" />
            <div>
              <p className="font-semibold text-lg text-slate-100">{entry.peer.name}</p>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                {getStatusIcon(entry)}
                <span>
                  {entry.status === 'completed' 
                    ? ` ${entry.direction === 'incoming' ? 'Incoming' : 'Outgoing'} · ${Math.floor((entry.duration || 0) / 60)}m ${ (entry.duration || 0) % 60}s`
                    : `Missed call`
                  }
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
             <button 
                onClick={() => onInitiateCall(entry.peer, entry.type)}
                className="p-2.5 rounded-full bg-green-600 hover:bg-green-500 text-white transition-colors" 
                title={`Call back ${entry.peer.name}`}
            >
                <Icon name={entry.type === 'video' ? 'video-camera' : 'phone'} className="w-5 h-5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CallHistoryScreen;