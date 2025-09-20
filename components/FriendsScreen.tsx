import React, { useState } from 'react';
import { User, CallHistoryEntry } from '../types';
import Icon from './Icon';
import UserCard from './UserCard';
import CallHistoryScreen from './CallHistoryScreen';

interface FriendsScreenProps {
  currentUser: User;
  friends: User[];
  requests: User[];
  callHistory: CallHistoryEntry[];
  onOpenProfile: (username: string) => void;
  onOpenConversation: (peer: User) => void;
  onInitiateCall: (peer: User, type: 'audio' | 'video') => void;
  onGoBack: () => void;
}

type ActiveTab = 'friends' | 'requests' | 'calls';

const FriendsScreen: React.FC<FriendsScreenProps> = ({ currentUser, friends, requests, callHistory, onOpenProfile, onOpenConversation, onInitiateCall }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('friends');

  const TabButton: React.FC<{ tabId: ActiveTab; label: string; count?: number }> = ({ tabId, label, count }) => (
    <button 
        onClick={() => setActiveTab(tabId)}
        className={`px-4 py-3 font-semibold text-lg border-b-4 transition-colors ${activeTab === tabId ? 'border-lime-500 text-slate-100' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
    >
        {label} {count !== undefined && count > 0 && <span className={`ml-2 text-sm px-2 py-0.5 rounded-full ${activeTab === tabId ? 'bg-lime-500 text-black' : 'bg-slate-600 text-slate-200'}`}>{count}</span>}
    </button>
  );

  const renderContent = () => {
    switch (activeTab) {
        case 'friends':
            return friends.length > 0 ? (
                 <div className="space-y-3">
                    {friends.map(friend => (
                        <UserCard key={friend.id} user={friend} onProfileClick={onOpenProfile}>
                             <button onClick={() => onInitiateCall(friend, 'audio')} className="p-2.5 rounded-full text-slate-300 bg-slate-700 hover:bg-sky-600 transition-colors" title={`Audio call ${friend.name}`}>
                                <Icon name="phone" className="w-5 h-5"/>
                            </button>
                            <button onClick={() => onInitiateCall(friend, 'video')} className="p-2.5 rounded-full text-slate-300 bg-slate-700 hover:bg-sky-600 transition-colors" title={`Video call ${friend.name}`}>
                                <Icon name="video-camera" className="w-5 h-5"/>
                            </button>
                            <button onClick={() => onOpenConversation(friend)} className="p-2.5 rounded-full text-slate-300 bg-slate-700 hover:bg-sky-600 transition-colors" title={`Message ${friend.name}`}>
                                <Icon name="message" className="w-5 h-5"/>
                            </button>
                        </UserCard>
                    ))}
                 </div>
            ) : <p className="text-center text-slate-400 py-8">You haven't added any friends yet.</p>;
        case 'requests':
            return <p>Friend Requests will be here.</p>;
        case 'calls':
            return <CallHistoryScreen callHistory={callHistory} onInitiateCall={onInitiateCall} />;
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-slate-100">Friends & Connections</h1>
        <div className="border-b border-slate-700 flex items-center mb-6">
            <TabButton tabId="friends" label="All Friends" count={friends.length} />
            <TabButton tabId="requests" label="Requests" count={requests.length} />
            <TabButton tabId="calls" label="Calls" />
        </div>
        {renderContent()}
      </div>
    </div>
  );
};

export default FriendsScreen;