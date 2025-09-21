import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppView, LiveAudioRoom, User, LiveRoomMessage, AudioParticipantState, LiveRoomEvent } from '../types';
import { firebaseService } from '../services/firebaseService';
import Icon from './Icon';
import { AGORA_APP_ID } from '../constants';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { geminiService } from '../services/geminiService';

const EMOJI_REACTIONS = ['❤️', '👍', '😂', '🎉', '🙏', '😮'];

interface InviteFriendsModalProps {
    currentUser: User;
    room: LiveAudioRoom;
    onClose: () => void;
    onSetTtsMessage: (message: string) => void;
}

const InviteFriendsModal: React.FC<InviteFriendsModalProps> = ({ currentUser, room, onClose, onSetTtsMessage }) => {
    const [friends, setFriends] = useState<User[]>([]);
    const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchFriends = async () => {
            setIsLoading(true);
            const friendsList = await geminiService.getFriendsList(currentUser.id);
            const roomMemberIds = new Set([...room.speakers.map(s => s.id), ...room.listeners.map(l => l.id)]);
            setFriends(friendsList.filter(f => !roomMemberIds.has(f.id)));
            setIsLoading(false);
        };
        fetchFriends();
    }, [currentUser.id, room]);

    const handleInvite = async (friendId: string) => {
        setInvitedIds(prev => new Set(prev).add(friendId));
        await geminiService.inviteFriendToRoom(currentUser, friendId, room);
        const friend = friends.find(f => f.id === friendId);
        if(friend) {
            onSetTtsMessage(`Invitation sent to ${friend.name}`);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-md h-[70vh] bg-slate-800 border border-slate-700 rounded-lg shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="flex-shrink-0 p-4 border-b border-slate-700">
                    <h2 className="text-xl font-bold text-slate-100">Invite Friends</h2>
                </header>
                <main className="flex-grow overflow-y-auto p-2">
                    {isLoading ? <p className="text-center p-4 text-slate-400">Loading friends...</p> : (
                        friends.length > 0 ? (
                            <div className="space-y-2">
                                {friends.map(friend => {
                                    const isInvited = invitedIds.has(friend.id) || (room.invitedUserIds || []).includes(friend.id);
                                    return (
                                        <div key={friend.id} className="flex items-center justify-between p-2 hover:bg-slate-700/50 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <img src={friend.avatarUrl} alt={friend.name} className="w-10 h-10 rounded-full" />
                                                <span className="font-semibold text-slate-200">{friend.name}</span>
                                            </div>
                                            <button onClick={() => handleInvite(friend.id)} disabled={isInvited} className={`px-3 py-1.5 text-sm rounded-md font-semibold ${isInvited ? 'bg-slate-600 text-slate-400' : 'bg-lime-600 text-black'}`}>
                                                {isInvited ? 'Invited' : 'Invite'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : <p className="text-center p-4 text-slate-400">All your friends are already here!</p>
                    )}
                </main>
            </div>
        </div>
    );
};


interface LiveRoomScreenProps {
  currentUser: User;
  roomId: string;
  onNavigate: (view: AppView, props?: any) => void;
  onGoBack: () => void;
  onSetTtsMessage: (message: string) => void;
}

const LiveRoomScreen: React.FC<LiveRoomScreenProps> = ({ currentUser, roomId, onNavigate, onGoBack, onSetTtsMessage }) => {
    const [room, setRoom] = useState<LiveAudioRoom | null>(null);
    const [messages, setMessages] = useState<LiveRoomMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
    const [isInviteModalOpen, setInviteModalOpen] = useState(false);
    const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
    const [floatingEmojis, setFloatingEmojis] = useState<{ emoji: string; id: number; left: string }[]>([]);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [openUserMenu, setOpenUserMenu] = useState<string | null>(null);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const userMenuRef = useRef<HTMLDivElement>(null);
    
    const onGoBackRef = useRef(onGoBack);
    const onSetTtsMessageRef = useRef(onSetTtsMessage);

    useEffect(() => {
        onGoBackRef.current = onGoBack;
        onSetTtsMessageRef.current = onSetTtsMessage;
    });

    const showToast = (message: string) => {
        setToast({ message, id: Date.now() });
    };

    // Effect for Agora Voice Connection
    useEffect(() => {
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        agoraClient.current = client;
        let isMounted = true;

        const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
            await client.subscribe(user, mediaType);
            if (mediaType === 'audio') user.audioTrack?.play();
        };

        const handleVolumeIndicator = (volumes: any[]) => {
            if (!isMounted) return;
            if (volumes.length === 0) { setActiveSpeakerId(null); return; };
            const mainSpeaker = volumes.reduce((max, current) => current.level > max.level ? current : max, { level: -1 });
            setActiveSpeakerId(mainSpeaker.level > 5 ? mainSpeaker.uid.toString() : null);
        };

        const initialize = async () => {
            try {
                if (!AGORA_APP_ID) {
                    onSetTtsMessageRef.current("Agora App ID is not configured. Real-time audio will not work.");
                    throw new Error("Agora App ID not configured");
                }
                
                const initialRoom = await geminiService.getAudioRoomDetails(roomId);
                if (!isMounted || !initialRoom) {
                    if (isMounted) onSetTtsMessageRef.current("Room not found.");
                    throw new Error("Room not found or component unmounted");
                }

                if (initialRoom.kickedUserIds?.includes(currentUser.id)) {
                    if(isMounted) onSetTtsMessageRef.current("You have been removed from this room.");
                    throw new Error("User kicked");
                }
                if (initialRoom.privacy === 'private' && initialRoom.host.id !== currentUser.id && !initialRoom.invitedUserIds?.includes(currentUser.id)) {
                    if(isMounted) onSetTtsMessageRef.current("This is a private room. You need an invitation to join.");
                    throw new Error("Private room");
                }

                await geminiService.joinLiveAudioRoom(currentUser.id, roomId);
                if (!isMounted) return;

                client.on('user-published', handleUserPublished);
                client.enableAudioVolumeIndicator();
                client.on('volume-indicator', handleVolumeIndicator);
                
                const uid = parseInt(currentUser.id, 36) % 10000000;
                
                const token = await geminiService.getAgoraToken(roomId, uid);
                if (!isMounted || !token) {
                    if (isMounted) onSetTtsMessageRef.current("Could not join the room due to a connection issue.");
                    throw new Error("Token fetch failed or component unmounted");
                }
                
                await client.join(AGORA_APP_ID, roomId, token, uid);

            } catch (error) {
                console.error("Failed to initialize Live Room:", error);
                if (isMounted) {
                    onGoBackRef.current();
                }
            }
        };

        initialize();

        return () => {
            isMounted = false;
            client.off('user-published', handleUserPublished);
            client.off('volume-indicator', handleVolumeIndicator);
            if (localAudioTrack.current) {
                localAudioTrack.current.stop();
                localAudioTrack.current.close();
                localAudioTrack.current = null;
            }
            agoraClient.current?.leave();
            geminiService.leaveLiveAudioRoom(currentUser.id, roomId);
        };
    }, [roomId, currentUser.id]);
    
    // Effect for Firestore Listeners (Room and Messages)
    useEffect(() => {
        setIsLoading(true);
        const unsubscribeRoom = firebaseService.listenToAudioRoom(roomId, (roomDetails) => {
            if (roomDetails) {
                 if (roomDetails.kickedUserIds?.includes(currentUser.id)) {
                    onSetTtsMessageRef.current("You have been removed from this room.");
                    onGoBackRef.current();
                    return;
                }
                setRoom(roomDetails);
            } else {
                onSetTtsMessageRef.current("The room has ended.");
                onGoBackRef.current();
            }
            setIsLoading(false);
        });

        const unsubscribeMessages = firebaseService.listenToRoomMessages(roomId, setMessages);
        
        const unsubscribeEvents = firebaseService.listenToRoomEvents(roomId, (event) => {
            setFloatingEmojis(prev => [...prev, { emoji: event.emoji, id: Date.now(), left: `${Math.random() * 80 + 10}%` }]);
        });

        return () => {
            unsubscribeRoom();
            unsubscribeMessages();
            unsubscribeEvents();
        };
    }, [roomId, currentUser.id]);

     useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setOpenUserMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    // Effect to manage audio track publishing based on speaker role
    useEffect(() => {
        if (!room || !agoraClient.current) return;
        const mySpeakerData = room.speakers.find(s => s.id === currentUser.id);
        const amISpeakerNow = !!mySpeakerData;
        const wasISpeakerBefore = !!localAudioTrack.current;
        
        const handleRoleChange = async () => {
            if (amISpeakerNow && !wasISpeakerBefore) {
                try {
                    const track = await AgoraRTC.createMicrophoneAudioTrack();
                    localAudioTrack.current = track;
                    await agoraClient.current?.publish(track);
                    // Sync with Firestore state immediately
                    track.setMuted(mySpeakerData.isMuted ?? false);
                } catch (error) { onSetTtsMessageRef.current("Could not activate microphone."); }
            }
            else if (!amISpeakerNow && wasISpeakerBefore) {
                if (localAudioTrack.current) {
                    await agoraClient.current?.unpublish([localAudioTrack.current]);
                    localAudioTrack.current.stop();
                    localAudioTrack.current.close();
                    localAudioTrack.current = null;
                }
            } else if (amISpeakerNow && wasISpeakerBefore && localAudioTrack.current) {
                // Already a speaker, just ensure mute state is synced
                 localAudioTrack.current.setMuted(mySpeakerData.isMuted ?? false);
            }
        };
        handleRoleChange();
    }, [room, currentUser.id]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim()) {
            await firebaseService.sendRoomMessage(roomId, currentUser, newMessage.trim());
            setNewMessage('');
        }
    };
    
    // Derived states and event handlers
    const isHost = room?.host.id === currentUser.id;
    const isModerator = room?.moderatorIds.includes(currentUser.id) ?? false;
    const canManage = isHost || isModerator;
    const mySpeakerData = room?.speakers.find(s => s.id === currentUser.id);
    const amISpeaker = !!mySpeakerData;
    const amIMuted = mySpeakerData?.isMuted ?? false;
    const hasRaisedHand = room?.raisedHands.includes(currentUser.id);

    const handleLeave = () => isHost ? geminiService.endLiveAudioRoom(currentUser.id, roomId) : onGoBack();
    const handleToggleMute = () => { if (amISpeaker) geminiService.toggleMuteInAudioRoom(roomId, currentUser.id, !amIMuted); };
    const handleRaiseHand = () => hasRaisedHand ? geminiService.lowerHandInAudioRoom(currentUser.id, roomId) : geminiService.raiseHandInAudioRoom(currentUser.id, roomId);
    const handleInviteToSpeak = (userId: string) => { geminiService.inviteToSpeakInAudioRoom(currentUser.id, userId, roomId); showToast('Invitation sent'); };
    const handleMoveToAudience = (userId: string) => { geminiService.moveToAudienceInAudioRoom(currentUser.id, userId, roomId); showToast('Moved to audience'); };
    const handleHostMute = (speakerId: string, shouldMute: boolean) => { geminiService.toggleMuteInAudioRoom(roomId, speakerId, shouldMute); showToast(shouldMute ? 'User muted' : 'User unmuted'); };
    const handlePromote = (user: User) => { geminiService.promoteToModeratorInAudioRoom(currentUser.id, user.id, roomId); showToast(`${user.name} is now a moderator`); };
    const handleDemote = (user: User) => { geminiService.demoteFromModeratorInAudioRoom(currentUser.id, user.id, roomId); showToast(`${user.name} is no longer a moderator`); };
    const handleRemove = (user: User) => { geminiService.removeUserFromAudioRoom(currentUser.id, user.id, roomId); showToast(`${user.name} has been removed`); };

    const handleSendReaction = (emoji: string) => {
        geminiService.sendReactionInAudioRoom(roomId, currentUser.id, emoji);
        setShowEmojiPicker(false);
    }

    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Loading Room...</div>;
    }
    
    const memberCount = room.speakers.length + room.listeners.length;
    const speakerIdMap = useMemo(() => {
        const map = new Map<string, string>();
        room.speakers.forEach(s => {
            const agoraUID = (parseInt(s.id, 36) % 10000000).toString();
            map.set(agoraUID, s.id);
        });
        return map;
    }, [room.speakers]);
    const activeAppSpeakerId = activeSpeakerId ? speakerIdMap.get(activeSpeakerId) : null;
    const raisedHandUsers = room.listeners.filter(l => room.raisedHands.includes(l.id));

    return (
        <>
        <div className="h-full w-full flex flex-col bg-black text-white font-sans relative overflow-hidden">
            {floatingEmojis.map(emoji => (
                <span key={emoji.id} className="absolute bottom-20 text-4xl animate-float-up pointer-events-none" style={{ left: emoji.left, animationDelay: `${Math.random() * 0.5}s` }}>
                    {emoji.emoji}
                </span>
            ))}

            <header className="flex-shrink-0 p-3 flex justify-between items-center border-b border-slate-700/50">
                <div className="flex items-center gap-3">
                    <img src={room.host.avatarUrl} alt={room.host.name} className="w-10 h-10 rounded-full" />
                    <div>
                        <h1 className="font-bold text-lg flex items-center gap-2">{room.topic} {room.privacy === 'private' && <Icon name="lock-closed" className="w-4 h-4 text-slate-400"/>}</h1>
                        <p className="text-sm text-slate-400">{memberCount} Members</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setInviteModalOpen(true)} className="p-2 rounded-full hover:bg-slate-800"><Icon name="add-friend" className="w-6 h-6"/></button>
                    <button onClick={handleLeave} className="bg-rose-600 text-white font-bold px-4 py-2 rounded-lg text-sm">{isHost ? 'End Room' : 'Leave'}</button>
                </div>
            </header>

            <main className="flex-grow overflow-y-auto p-4 flex flex-col gap-6">
                {/* Speakers Section */}
                <div>
                    <h2 className="text-xs uppercase font-bold text-slate-400 mb-2">Speakers ({room.speakers.length})</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                        {room.speakers.map(speaker => {
                            const isSpeakerHost = speaker.id === room.host.id;
                            const isSpeakerMod = room.moderatorIds.includes(speaker.id);
                            return(
                                <div key={speaker.id} className="flex flex-col items-center gap-1.5 text-center relative transition-all duration-300">
                                    <img 
                                        src={speaker.avatarUrl}
                                        alt={speaker.name}
                                        className={`w-20 h-20 rounded-2xl border-2 transition-all ${speaker.id === activeAppSpeakerId ? 'border-green-400' : 'border-transparent'}`}
                                    />
                                    {speaker.isMuted && <div className="absolute top-1 right-1 bg-black/50 p-1 rounded-full"><Icon name="microphone-slash" className="w-4 h-4 text-white"/></div>}
                                    <p className="text-sm text-slate-200 truncate w-full">{speaker.name}</p>
                                    <div className="text-xs text-lime-400 h-4">{isSpeakerHost ? 'Host' : isSpeakerMod ? 'Moderator' : ''}</div>
                                </div>
                            )
                        })}
                    </div>
                </div>
                
                 {/* Listeners Section */}
                <div>
                     <h2 className="text-xs uppercase font-bold text-slate-400 mb-2">Audience ({room.listeners.length})</h2>
                     <div className="space-y-2">
                         {room.listeners.map(listener => {
                            const hasListenerRaisedHand = room.raisedHands.includes(listener.id);
                            const isListenerMod = room.moderatorIds.includes(listener.id);
                             return (
                             <div key={listener.id} className="flex items-center justify-between p-2 hover:bg-slate-800/50 rounded-lg transition-colors duration-300">
                                 <div className="flex items-center gap-3"><img src={listener.avatarUrl} className="w-8 h-8 rounded-full"/><span className="text-slate-200">{listener.name}</span> {isListenerMod && <span className="text-xs text-lime-400">Moderator</span>}</div>
                                 {canManage && (
                                     hasListenerRaisedHand ? (
                                        <div className="flex gap-2">
                                            <button onClick={() => geminiService.lowerHandInAudioRoom(listener.id, roomId)} className="text-xs px-2 py-1 bg-slate-600 rounded-md">Dismiss</button>
                                            <button onClick={() => handleInviteToSpeak(listener.id)} className="text-xs px-2 py-1 bg-lime-600 text-black rounded-md">Invite</button>
                                        </div>
                                     ) : (
                                         <button onClick={() => setOpenUserMenu(listener.id)} className="p-1 rounded-full text-slate-400 hover:text-white"><Icon name="ellipsis-vertical" className="w-5 h-5"/></button>
                                     )
                                 )}
                             </div>
                         )})}
                     </div>
                </div>
            </main>

            {/* Chat Overlay */}
             <div className="absolute bottom-20 left-4 right-4 h-48 overflow-hidden" style={{ maskImage: 'linear-gradient(to top, black 60%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to top, black 60%, transparent 100%)' }}>
                <div className="h-full overflow-y-auto p-4 flex flex-col-reverse gap-4">
                     <div ref={messagesEndRef} />
                     {messages.slice().reverse().map(msg => (
                        <div key={msg.id} className="flex items-start gap-3 animate-fade-in-fast">
                            <img src={msg.sender.avatarUrl} alt={msg.sender.name} className="w-8 h-8 rounded-full"/>
                            <div>
                                <p className="font-semibold text-sm text-slate-300">{msg.sender.name}</p>
                                <div className="mt-1 bg-black/30 px-3 py-2 rounded-xl inline-block">
                                    <p className="text-white break-words">{msg.text}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <footer className="flex-shrink-0 p-2 bg-black border-t border-slate-700/50 flex items-center justify-between gap-2">
                <div className="relative">
                    {showEmojiPicker && (
                         <div className="absolute bottom-full mb-2 bg-slate-800 rounded-full p-1.5 flex items-center gap-1 shadow-lg border border-slate-600">
                            {EMOJI_REACTIONS.map(emoji => <button key={emoji} onClick={() => handleSendReaction(emoji)} className="text-3xl p-1 rounded-full hover:bg-slate-700 transition-transform hover:scale-125">{emoji}</button>)}
                        </div>
                    )}
                    <button onClick={() => setShowEmojiPicker(p => !p)} className="p-3 rounded-full bg-slate-700 hover:bg-slate-600"><Icon name="face-smile" className="w-6 h-6"/></button>
                </div>
                <form onSubmit={handleSendMessage} className="flex-grow">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        placeholder="Say something..."
                        className="w-full bg-slate-800 rounded-full py-2.5 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-lime-500"
                    />
                </form>
                {amISpeaker ? (
                    <button onClick={handleToggleMute} className={`p-3 rounded-full ${amIMuted ? 'bg-rose-600' : 'bg-slate-700'}`}>
                        <Icon name={amIMuted ? 'microphone-slash' : 'mic'} className="w-6 h-6 text-white"/>
                    </button>
                ) : (
                     <button onClick={handleRaiseHand} className={`p-3 rounded-full ${hasRaisedHand ? 'bg-lime-600' : 'bg-slate-700'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3.5a.75.75 0 01.75.75v9.5a.75.75 0 01-1.5 0V4.25A.75.75 0 0110 3.5z" /><path d="M8.22 5.22a.75.75 0 011.06 0l2.25 2.25a.75.75 0 01-1.06 1.06L10 8.06l-1.47 1.47a.75.75 0 01-1.06-1.06l2.25-2.25z" /><path d="M4.75 12.5a.75.75 0 01.75-.75h9a.75.75 0 010 1.5h-9a.75.75 0 01-.75-.75z" /></svg>
                    </button>
                )}
            </footer>
             {toast && <div key={toast.id} className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full text-sm animate-toast">{toast.message}</div>}
        </div>
        {isInviteModalOpen && <InviteFriendsModal currentUser={currentUser} room={room} onClose={() => setInviteModalOpen(false)} onSetTtsMessage={onSetTtsMessage}/>}
        </>
    );
};

export default LiveRoomScreen;
