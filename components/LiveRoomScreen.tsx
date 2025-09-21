import React, { useEffect, useState, useMemo } from 'react';
import { User, LiveAudioRoom, RoomMessage, RoomParticipant, Author } from '../types';
import { firebaseService } from '../services/firebaseService';
import { geminiService } from '../services/geminiService';

// Define a more specific type for users within the room context
type RoomUser = RoomParticipant & {
  role: 'host' | 'co-host' | 'speaker' | 'listener';
  isSpeaking?: boolean;
  raisedHand?: boolean;
};

const UserAvatar: React.FC<{ user: RoomUser, onClick: () => void }> = ({ user, onClick }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-1.5 text-center w-16">
    <div className="relative">
      {(user.role === 'host' || user.role === 'co-host') && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="text-2xl" role="img" aria-label={user.role}>👑</span>
        </div>
      )}
      <img src={user.avatarUrl} alt={user.name} className={`w-16 h-16 rounded-full object-cover border-2 transition-all ${user.isSpeaking ? 'border-cyan-400 ring-2 ring-cyan-400/50' : 'border-transparent'}`} />
      <div className="absolute -bottom-1 -right-1 flex items-center gap-0.5">
        {user.isMuted && (
          <div className="bg-gray-800 p-1 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg></div>
        )}
        {user.isShielded && (
          <div className="bg-blue-600 p-1 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg></div>
        )}
      </div>
      {user.raisedHand && (
        <div className="absolute -bottom-1 -left-1 bg-yellow-500 p-1 rounded-full animate-bounce">
          <span className="text-xs" role="img" aria-label="Hand raised">✋</span>
        </div>
      )}
    </div>
    <p className="text-xs font-medium truncate w-16">{user.name}</p>
  </button>
);

const UserActionMenu: React.FC<{
    targetUser: RoomUser;
    // FIX: Corrected the type for viewerRole to align with possible roles.
    viewerRole: 'host' | 'co-host' | 'speaker' | 'listener';
    onClose: () => void;
    onInvite: (user: RoomParticipant) => void;
    onMoveToAudience: (user: RoomParticipant) => void;
    onMuteToggle: (user: RoomParticipant) => void;
    onMakeCoHost: (user: RoomParticipant) => void;
    onRemoveCoHost: (user: RoomParticipant) => void;
    onKick: (user: RoomParticipant) => void;
    onBan: (user: RoomParticipant) => void;
}> = ({ targetUser, viewerRole, onClose, onInvite, onMoveToAudience, onMuteToggle, onMakeCoHost, onRemoveCoHost, onKick, onBan }) => {

    const isTargetHost = targetUser.role === 'host';
    const isTargetCoHost = targetUser.role === 'co-host';
    const viewerIsHost = viewerRole === 'host';

    // FIX: Simplified the logic to be more readable and correct. A non-host cannot manage the host or a co-host.
    if (!viewerIsHost && (isTargetHost || isTargetCoHost)) {
        return null;
    }

    const ActionButton: React.FC<{ onClick: () => void, children: React.ReactNode, className?: string }> = ({ onClick, children, className = '' }) => (
        <button onClick={onClick} className={`w-full text-left p-3 text-white hover:bg-gray-600 rounded-md ${className}`}>
            {children}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-700 rounded-lg w-full max-w-xs p-4" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-lg mb-2 text-center">{targetUser.name}</h3>
                <div className="space-y-2">
                    {targetUser.role === 'listener' && <ActionButton onClick={() => onInvite(targetUser)}>{targetUser.raisedHand ? 'Approve to Speak' : 'Invite to Speak'}</ActionButton>}
                    {targetUser.role === 'speaker' && !isTargetHost && <ActionButton onClick={() => onMoveToAudience(targetUser)}>Move to Audience</ActionButton>}
                    {targetUser.role === 'speaker' && !isTargetHost && <ActionButton onClick={() => onMuteToggle(targetUser)}>{targetUser.isMuted ? 'Unmute' : 'Mute'}</ActionButton>}
                    
                    <hr className="border-gray-500 my-2" />

                    {viewerIsHost && !isTargetHost && !isTargetCoHost && <ActionButton onClick={() => onMakeCoHost(targetUser)}>Make Co-host</ActionButton>}
                    {viewerIsHost && isTargetCoHost && <ActionButton onClick={() => onRemoveCoHost(targetUser)}>Remove as Co-host</ActionButton>}
                    
                    {!isTargetHost && <ActionButton onClick={() => onKick(targetUser)} className="text-yellow-400">Kick from Room</ActionButton>}
                    {!isTargetHost && <ActionButton onClick={() => onBan(targetUser)} className="text-red-500">Ban from Room</ActionButton>}
                </div>
            </div>
        </div>
    );
};


interface LiveRoomScreenProps {
  currentUser: User;
  roomId: string;
  onGoBack: () => void;
}

const LiveRoomScreen: React.FC<LiveRoomScreenProps> = ({ currentUser, roomId, onGoBack }) => {
  const [room, setRoom] = useState<LiveAudioRoom | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [menuTargetUser, setMenuTargetUser] = useState<RoomUser | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Real-time listener for the room document
  useEffect(() => {
    // FIX: Changed firebaseService.listenToLiveAudioRoom (which doesn't exist) to the correct geminiService.listenToAudioRoom.
    const unsubscribe = geminiService.listenToAudioRoom(roomId, (liveRoom) => {
      if (liveRoom) {
        if (liveRoom.bannedUserIds?.includes(currentUser.id)) {
            alert("You have been banned from this room.");
            onGoBack();
            return;
        }
        setRoom(liveRoom);
      } else {
        alert("This room has ended.");
        onGoBack();
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [roomId, currentUser.id, onGoBack]);

  // Real-time listener for chat messages
  useEffect(() => {
    const unsubscribe = firebaseService.listenToRoomMessages(roomId, setMessages);
    return () => unsubscribe();
  }, [roomId]);


  const { allUsers, viewerRole, isListener, hasRaisedHand } = useMemo(() => {
    if (!room) return { allUsers: [], viewerRole: 'listener', isListener: true, hasRaisedHand: false };
    
    const speakers: RoomUser[] = (room.speakers || []).map(p => ({
      ...p,
      role: room.host.id === p.id ? 'host' : room.coHosts.some(c => c.id === p.id) ? 'co-host' : 'speaker',
      isSpeaking: false, // This would be handled by Agora/voice detection in a full app
    }));
    
    const listeners: RoomUser[] = (room.listeners || []).map(p => ({
      ...p,
      role: 'listener',
      raisedHand: room.raisedHands.includes(p.id),
    }));

    const all = [...speakers, ...listeners];
    const role = all.find(u => u.id === currentUser.id)?.role || 'listener';

    return {
      allUsers: all,
      viewerRole: role,
      isListener: role === 'listener',
      hasRaisedHand: room.raisedHands.includes(currentUser.id),
    };
  }, [room, currentUser.id]);

  const isModerator = viewerRole === 'host' || viewerRole === 'co-host';

  const handleAvatarClick = (user: RoomUser) => {
    if (isModerator && user.id !== currentUser.id) {
      setMenuTargetUser(user);
    }
  };
  
  const closeMenu = () => setMenuTargetUser(null);

  // FIX: Added currentUser.id as the first argument (hostId) to match the function signature.
  const onInvite = (user: RoomParticipant) => { firebaseService.inviteToSpeakInAudioRoom(currentUser.id, user.id, roomId); closeMenu(); };
  // FIX: Added currentUser.id as the first argument (hostId) to match the function signature.
  const onMoveToAudience = (user: RoomParticipant) => { firebaseService.moveToAudienceInAudioRoom(currentUser.id, user.id, roomId); closeMenu(); };
  const onMuteToggle = (user: RoomParticipant) => { firebaseService.updateParticipantMuteStatus(roomId, user.id, !user.isMuted); closeMenu(); };
  const onMakeCoHost = (user: RoomParticipant) => { firebaseService.makeCoHost(roomId, user.id); closeMenu(); };
  const onRemoveCoHost = (user: RoomParticipant) => { firebaseService.removeCoHost(roomId, user.id); closeMenu(); };
  const onKick = (user: RoomParticipant) => { firebaseService.kickFromRoom(roomId, user.id); closeMenu(); };
  const onBan = (user: RoomParticipant) => { firebaseService.banFromRoom(roomId, user.id); closeMenu(); };
  
  const handleRaiseHand = () => {
    firebaseService.raiseHandInAudioRoom(roomId, currentUser.id, !hasRaisedHand);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    const author: Author = { id: currentUser.id, name: currentUser.name, username: currentUser.username, avatarUrl: currentUser.avatarUrl };
    firebaseService.sendRoomMessage(roomId, author, newMessage);
    setNewMessage('');
  };

  if (isLoading || !room) {
    return <div className="h-full w-full flex items-center justify-center bg-black text-white">Loading Room...</div>
  }
  
  return (
    <>
      <div className="h-full w-full flex flex-col bg-black text-white font-sans overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 p-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img src="https://i.pravatar.cc/150?u=unmad" alt="Unmad" className="w-12 h-12 rounded-lg" />
            </div>
            <div>
              <h1 className="font-bold text-lg">{room.topic}</h1>
              <p className="text-xs text-gray-400">Members: {allUsers.length}</p>
            </div>
          </div>
          <button onClick={onGoBack}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>

        {/* Ranking Bar */}
        <div className="flex-shrink-0 px-3 py-2 flex items-center gap-3">
            {/* This part can be dynamic in the future */}
        </div>
        
        {/* Main content area for users and chat */}
        <div className="flex-grow relative overflow-hidden">
          <div className="absolute inset-0 p-3 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-y-4 gap-x-2 overflow-y-auto no-scrollbar">
            {allUsers.map(user => <UserAvatar key={user.id} user={user} onClick={() => handleAvatarClick(user)} />)}
          </div>

          <div 
            className="absolute bottom-16 left-0 right-0 h-2/5 p-3 flex flex-col-reverse gap-3 overflow-hidden pointer-events-none"
            style={{ maskImage: 'linear-gradient(to top, black 20%, transparent 100%)' }}
          >
            <div className="flex flex-col-reverse justify-start gap-3">
              {messages.slice().reverse().map((msg) => (
                <div key={msg.id} className="flex items-start gap-2 max-w-[80%] pointer-events-auto bg-black/40 backdrop-blur-sm p-2 rounded-lg animate-slide-in-bottom">
                  <img src={msg.user.avatarUrl} alt={msg.user.name} className="w-8 h-8 rounded-full flex-shrink-0" />
                  <div className="flex-grow">
                    <p className="text-xs text-gray-400">{msg.user.name}</p>
                    <p className="text-sm text-white">{msg.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Message Input Bar */}
        <footer className="flex-shrink-0 p-2 bg-black flex items-center gap-2">
          {isListener && (
            <button onClick={handleRaiseHand} className={`p-2.5 rounded-lg ${hasRaisedHand ? 'bg-yellow-500' : 'bg-gray-800'}`}>
              <span className="text-lg" role="img" aria-label="Raise hand">✋</span>
            </button>
          )}
          <form onSubmit={handleSendMessage} className="relative flex-grow">
            <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Say Hi..." className="w-full bg-gray-800 rounded-full py-2.5 pl-4 pr-10 text-sm" />
          </form>
          <button onClick={onGoBack} className="p-2.5 bg-red-600 rounded-lg">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
          </button>
        </footer>
      </div>

      {menuTargetUser && viewerRole && (
          <UserActionMenu
              targetUser={menuTargetUser}
              viewerRole={viewerRole}
              onClose={closeMenu}
              onInvite={onInvite}
              onMoveToAudience={onMoveToAudience}
              onMuteToggle={onMuteToggle}
              onMakeCoHost={onMakeCoHost}
              onRemoveCoHost={onRemoveCoHost}
              onKick={onKick}
              onBan={onBan}
          />
      )}
    </>
  );
};

export default LiveRoomScreen;
