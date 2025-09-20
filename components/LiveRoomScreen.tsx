import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppView, LiveAudioRoom, User, RoomMessage, Author } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import { AGORA_APP_ID, ROOM_THEMES } from '../constants';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

interface LiveRoomScreenProps {
  currentUser: User;
  roomId: string;
  onNavigate: (view: AppView, props?: any) => void;
  onGoBack: () => void;
  onSetTtsMessage: (message: string) => void;
}

const Avatar: React.FC<{ user: User; isHost?: boolean; isCoHost?: boolean; isSpeaking?: boolean; children?: React.ReactNode, onClick?: (event: React.MouseEvent) => void }> = ({ user, isHost, isCoHost, isSpeaking, children, onClick }) => (
    <div className="relative flex flex-col items-center gap-2 text-center w-24">
        <button onClick={onClick} disabled={!onClick} className="relative group">
            <img 
                src={user.avatarUrl}
                alt={user.name}
                className={`w-20 h-20 rounded-full border-4 transition-all duration-300 ${isSpeaking ? 'border-green-400 ring-4 ring-green-500/50' : 'border-slate-600'} ${onClick ? 'group-hover:ring-4 group-hover:ring-sky-500/50' : ''}`}
            />
            {isHost && <div className="absolute -bottom-2 -right-1 text-2xl" title="Host">👑</div>}
            {isCoHost && !isHost && <div className="absolute -bottom-2 -right-1 text-xl bg-slate-700 p-1 rounded-full" title="Co-host">🛡️</div>}
        </button>
        <p className="font-semibold text-slate-200 truncate w-full">{user.name}</p>
        {children}
    </div>
);

const ChatMessage: React.FC<{ message: RoomMessage }> = ({ message }) => (
    <div className="flex items-start gap-2">
        <img src={message.sender.avatarUrl} alt={message.sender.name} className="w-8 h-8 rounded-full flex-shrink-0" />
        <div>
            <p className="font-semibold text-sm text-lime-300">{message.sender.name}</p>
            <p className="text-slate-200">{message.text}</p>
        </div>
    </div>
);


const LiveRoomScreen: React.FC<LiveRoomScreenProps> = ({ currentUser, roomId, onNavigate, onGoBack, onSetTtsMessage }) => {
    const [room, setRoom] = useState<LiveAudioRoom | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
    const [newMessage, setNewMessage] = useState('');
    const [isChatVisible, setIsChatVisible] = useState(false);
    const [participantMenu, setParticipantMenu] = useState<{ user: User; event: React.MouseEvent } | null>(null);
    const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);

    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const participantMenuRef = useRef<HTMLDivElement>(null);
    
    const onGoBackRef = useRef(onGoBack);
    const onSetTtsMessageRef = useRef(onSetTtsMessage);

    useEffect(() => {
        onGoBackRef.current = onGoBack;
        onSetTtsMessageRef.current = onSetTtsMessage;
    });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (participantMenuRef.current && !participantMenuRef.current.contains(event.target as Node)) {
                setParticipantMenu(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (!AGORA_APP_ID) {
            onSetTtsMessageRef.current("Agora App ID is not configured. Real-time audio will not work.");
            console.error("Agora App ID is not configured in constants.ts");
            onGoBackRef.current();
            return;
        }

        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        agoraClient.current = client;

        const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
            await client.subscribe(user, mediaType);
            if (mediaType === 'audio') {
                user.audioTrack?.play();
            }
        };

        const handleUserUnpublished = (user: IAgoraRTCRemoteUser) => {};
        const handleUserLeft = (user: IAgoraRTCRemoteUser) => {};

        const handleVolumeIndicator = (volumes: any[]) => {
            if (volumes.length === 0) {
                setActiveSpeakerId(null);
                return;
            };
            const mainSpeaker = volumes.reduce((max, current) => current.level > max.level ? current : max);
            if (mainSpeaker.level > 5) {
                setActiveSpeakerId(mainSpeaker.uid.toString());
            } else {
                setActiveSpeakerId(null);
            }
        };
        
        const setupAgora = async () => {
            client.on('user-published', handleUserPublished);
            client.on('user-unpublished', handleUserUnpublished);
            client.on('user-left', handleUserLeft);
            client.enableAudioVolumeIndicator();
            client.on('volume-indicator', handleVolumeIndicator);
            
            const uid = parseInt(currentUser.id, 36) % 10000000;
            
            const token = await geminiService.getAgoraToken(roomId, uid);
            if (!token) {
                console.error("Failed to retrieve Agora token. Cannot join room.");
                onSetTtsMessageRef.current("Could not join the room due to a connection issue.");
                onGoBackRef.current();
                return;
            }

            await client.join(AGORA_APP_ID, roomId, token, uid);
        };

        geminiService.joinLiveAudioRoom(currentUser.id, roomId).then(setupAgora);

        return () => {
            client.off('user-published', handleUserPublished);
            client.off('user-unpublished', handleUserUnpublished);
            client.off('user-left', handleUserLeft);
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
    
    useEffect(() => {
        setIsLoading(true);
        const unsubscribe = geminiService.listenToAudioRoom(roomId, (roomDetails) => {
            if (roomDetails) {
                setRoom(roomDetails);
                if (chatEndRef.current) {
                    chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
                }
            } else {
                onSetTtsMessageRef.current("The room has ended.");
                onGoBackRef.current();
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [roomId]);
    
    useEffect(() => {
        if (!room || !agoraClient.current) return;

        const amISpeakerNow = room.speakers.some(s => s.id === currentUser.id);
        const wasISpeakerBefore = !!localAudioTrack.current;

        const handleRoleChange = async () => {
            if (amISpeakerNow && !wasISpeakerBefore) {
                try {
                    const track = await AgoraRTC.createMicrophoneAudioTrack();
                    localAudioTrack.current = track;
                    await agoraClient.current?.publish(track);
                    track.setMuted(false);
                    setIsMuted(false);
                } catch (error) {
                    console.error("Error creating/publishing audio track:", error);
                    onSetTtsMessageRef.current("Could not activate microphone.");
                }
            }
            else if (!amISpeakerNow && wasISpeakerBefore) {
                try {
                    if (localAudioTrack.current) {
                        await agoraClient.current?.unpublish([localAudioTrack.current]);
                        localAudioTrack.current.stop();
                        localAudioTrack.current.close();
                        localAudioTrack.current = null;
                    }
                } catch (error) {
                    console.error("Error unpublishing audio track:", error);
                }
            }
        };

        handleRoleChange();

    }, [room?.speakers, currentUser.id]);

    useEffect(() => {
        if (room && localAudioTrack.current) {
            const amIMutedByHost = room.mutedByHostIds?.includes(currentUser.id);
            if (amIMutedByHost && !isMuted) {
                localAudioTrack.current.setMuted(true);
                setIsMuted(true);
            }
        }
    }, [room?.mutedByHostIds, currentUser.id, isMuted]);

    const handleLeave = () => {
        onGoBack();
    };
    
    const handleEndRoom = () => {
        if (window.confirm('Are you sure you want to end this room for everyone?')) {
            geminiService.endLiveAudioRoom(currentUser.id, roomId);
        }
    };
    
    const toggleMute = () => {
        if (localAudioTrack.current) {
            const amIMutedByHost = room?.mutedByHostIds?.includes(currentUser.id);
            if(amIMutedByHost) {
                onSetTtsMessage("The host has muted you. You cannot unmute yourself.");
                return;
            }
            const willBeMuted = !isMuted;
            localAudioTrack.current.setMuted(willBeMuted);
            setIsMuted(willBeMuted);
        }
    };
    
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;
        await geminiService.sendAudioRoomMessage(roomId, currentUser, newMessage);
        setNewMessage('');
    };

    const handleRaiseHand = () => geminiService.raiseHandInAudioRoom(currentUser.id, roomId);
    const handleInviteToSpeak = (userId: string) => { geminiService.inviteToSpeakInAudioRoom(currentUser.id, userId, roomId); setParticipantMenu(null); };
    const handleMoveToAudience = (userId: string) => { geminiService.moveToAudienceInAudioRoom(currentUser.id, userId, roomId); setParticipantMenu(null); };
    const handleKickUser = (userId: string) => { geminiService.kickUserFromRoom(roomId, currentUser.id, userId); setParticipantMenu(null); };
    const handlePromoteCoHost = (userId: string) => { geminiService.promoteToCoHost(roomId, currentUser.id, userId); setParticipantMenu(null); };
    const handleDemoteCoHost = (userId: string) => { geminiService.demoteFromCoHost(roomId, currentUser.id, userId); setParticipantMenu(null); };
    const handleRemoteMute = (userId: string, shouldMute: boolean) => { geminiService.setRemoteMuteStatus(roomId, currentUser.id, userId, shouldMute); setParticipantMenu(null); };
    const handleUpdateTheme = (theme: string) => { geminiService.updateRoomTheme(roomId, currentUser.id, theme); setIsThemePickerOpen(false); };

    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Loading Room...</div>;
    }
    
    const isHost = room.host.id === currentUser.id;
    const isCoHost = room.coHostIds?.includes(currentUser.id) ?? false;
    const isSpeaker = room.speakers.some(s => s.id === currentUser.id);
    const isListener = !isSpeaker;
    const hasRaisedHand = room.raisedHands.includes(currentUser.id);
    const raisedHandUsers = room.listeners.filter(u => room.raisedHands.includes(u.id));

    const speakerIdMap = new Map<string, string>();
    room.speakers.forEach(s => {
        const agoraUID = (parseInt(s.id, 36) % 10000000).toString();
        speakerIdMap.set(agoraUID, s.id);
    });
    
    const canManage = (targetUser: User): boolean => {
        if (currentUser.id === targetUser.id) return false;
        if (isHost) return true;
        if (isCoHost) {
            const isTargetHost = room.host.id === targetUser.id;
            const isTargetCoHost = room.coHostIds?.includes(targetUser.id) ?? false;
            return !isTargetHost && !isTargetCoHost;
        }
        return false;
    };

    const activeAppSpeakerId = activeSpeakerId ? speakerIdMap.get(activeSpeakerId) : null;
    const roomTheme = ROOM_THEMES[room.theme || 'default'] || ROOM_THEMES.default;

    return (
        <div className={`h-full w-full flex flex-col md:flex-row text-white overflow-hidden ${roomTheme.bgClass}`}>
            <div className="flex-grow flex flex-col">
                <header className="flex-shrink-0 p-4 flex justify-between items-center bg-black/20">
                    <div>
                        <h1 className="text-xl font-bold truncate">{room.topic}</h1>
                        <p className="text-sm text-slate-400">with {room.host.name}</p>
                    </div>
                    <button onClick={handleLeave} className="bg-red-600 hover:bg-red-500 font-bold py-2 px-4 rounded-lg">
                        Leave
                    </button>
                </header>
                
                <main className="flex-grow overflow-y-auto p-6 space-y-8">
                    <section>
                        <h2 className="text-lg font-semibold text-slate-300 mb-4">Speakers ({room.speakers.length})</h2>
                        <div className="flex flex-wrap gap-6">
                            {room.speakers.map(speaker => (
                                <Avatar key={speaker.id} user={speaker} isHost={speaker.id === room.host.id} isCoHost={room.coHostIds?.includes(speaker.id)} isSpeaking={speaker.id === activeAppSpeakerId} onClick={(e) => canManage(speaker) && setParticipantMenu({ user: speaker, event: e })}/>
                            ))}
                        </div>
                    </section>

                    {isHost && raisedHandUsers.length > 0 && (
                         <section>
                            <h2 className="text-lg font-semibold text-green-400 mb-4">Requests to Speak ({raisedHandUsers.length})</h2>
                            <div className="flex flex-wrap gap-6 bg-slate-800/50 p-4 rounded-lg">
                               {raisedHandUsers.map(user => (
                                    <Avatar key={user.id} user={user} onClick={(e) => canManage(user) && setParticipantMenu({ user: user, event: e })}>
                                        <button onClick={() => handleInviteToSpeak(user.id)} className="text-xs bg-green-500 text-white px-2 py-1 rounded-md font-semibold">Invite to Speak</button>
                                    </Avatar>
                               ))}
                            </div>
                        </section>
                    )}

                    <section>
                        <h2 className="text-lg font-semibold text-slate-300 mb-4">Listeners ({room.listeners.length})</h2>
                        <div className="flex flex-wrap gap-4">
                            {room.listeners.map(listener => (
                                <button key={listener.id} onClick={(e) => canManage(listener) && setParticipantMenu({ user: listener, event: e })} disabled={!canManage(listener)} className="relative group" title={listener.name}>
                                    <img src={listener.avatarUrl} alt={listener.name} className={`w-12 h-12 rounded-full transition-all ${canManage(listener) ? 'group-hover:ring-2 group-hover:ring-sky-400' : ''}`} />
                                    {room.raisedHands.includes(listener.id) && (
                                         <div className="absolute -bottom-1 -right-1 text-xl bg-slate-700 p-0.5 rounded-full">✋</div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </section>
                </main>
                
                <footer className="flex-shrink-0 p-4 bg-black/20 flex justify-center items-center h-24 gap-4">
                    <button onClick={() => setIsChatVisible(v => !v)} className="md:hidden bg-slate-600 hover:bg-slate-500 font-bold py-3 px-6 rounded-lg text-lg">
                        <Icon name="comment" className="w-6 h-6"/>
                    </button>
                    {(isHost || isCoHost) && <button onClick={() => setIsThemePickerOpen(true)} className="bg-slate-600 hover:bg-slate-500 font-bold py-3 px-4 rounded-lg text-lg"><Icon name="swatch" className="w-6 h-6" /></button>}
                    {isHost && <button onClick={handleEndRoom} className="bg-red-700 hover:bg-red-600 font-bold py-3 px-6 rounded-lg text-lg">End Room</button>}
                    {isSpeaker && (
                        <button onClick={toggleMute} className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-red-600' : 'bg-slate-600 hover:bg-slate-500'}`}>
                            <Icon name={isMuted ? 'microphone-slash' : 'mic'} className="w-6 h-6" />
                        </button>
                    )}
                    {isListener && (
                        <button onClick={handleRaiseHand} disabled={hasRaisedHand} className="bg-lime-600 hover:bg-lime-500 font-bold py-3 px-6 rounded-lg text-lg disabled:bg-slate-500 disabled:cursor-not-allowed text-black">
                            {hasRaisedHand ? 'Hand Raised ✋' : 'Raise Hand ✋'}
                        </button>
                    )}
                </footer>
            </div>
            
            <aside className={`w-full md:w-96 flex-shrink-0 bg-slate-800/50 border-t md:border-t-0 md:border-l border-slate-700 flex-col h-1/2 md:h-full ${isChatVisible ? 'flex' : 'hidden'} md:flex absolute md:relative bottom-0 left-0 right-0 md:bottom-auto md:left-auto md:right-auto z-20`}>
                <div className="p-3 font-bold border-b border-slate-700 flex justify-between items-center">
                    <h3>Live Chat</h3>
                    <button onClick={() => setIsChatVisible(false)} className="md:hidden"><Icon name="close" className="w-5 h-5"/></button>
                </div>
                <div className="flex-grow overflow-y-auto p-3 space-y-4">
                    {room.messages?.map((msg, index) => <ChatMessage key={msg.id || index} message={msg} />)}
                    <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-700 flex gap-2">
                    <input 
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        placeholder="Send a message..."
                        className="w-full bg-slate-700 rounded-full p-2 px-4 text-sm focus:ring-lime-500 focus:border-lime-500 border-transparent"
                    />
                    <button type="submit" className="bg-lime-600 rounded-full p-2 text-black flex-shrink-0">
                        <Icon name="paper-airplane" className="w-5 h-5"/>
                    </button>
                </form>
            </aside>
            
            {participantMenu && (
                <div ref={participantMenuRef} className="absolute z-30 bg-slate-900/90 backdrop-blur-sm border border-slate-600 rounded-lg shadow-2xl animate-fade-in-fast" style={{ top: `${participantMenu.event.clientY}px`, left: `${participantMenu.event.clientX}px` }}>
                    <ul className="text-sm font-semibold">
                         {room.speakers.some(s => s.id === participantMenu.user.id) ? (
                            <>
                                {isHost && !room.coHostIds?.includes(participantMenu.user.id) && <li><button onClick={() => handlePromoteCoHost(participantMenu.user.id)} className="w-full text-left p-3 hover:bg-slate-700/50">Make Co-host</button></li>}
                                {isHost && room.coHostIds?.includes(participantMenu.user.id) && <li><button onClick={() => handleDemoteCoHost(participantMenu.user.id)} className="w-full text-left p-3 hover:bg-slate-700/50">Remove Co-host</button></li>}
                                {room.mutedByHostIds?.includes(participantMenu.user.id)
                                ? <li><button onClick={() => handleRemoteMute(participantMenu.user.id, false)} className="w-full text-left p-3 text-green-400 hover:bg-slate-700/50">Ask to Unmute</button></li>
                                : <li><button onClick={() => handleRemoteMute(participantMenu.user.id, true)} className="w-full text-left p-3 hover:bg-slate-700/50">Mute Speaker</button></li>
                                }
                                <li><button onClick={() => handleMoveToAudience(participantMenu.user.id)} className="w-full text-left p-3 hover:bg-slate-700/50">Move to Audience</button></li>
                            </>
                         ) : ( // Is a listener
                            <li><button onClick={() => handleInviteToSpeak(participantMenu.user.id)} className="w-full text-left p-3 hover:bg-slate-700/50">Invite to Speak</button></li>
                         )}
                         <li><button onClick={() => handleKickUser(participantMenu.user.id)} className="w-full text-left p-3 text-red-400 hover:bg-red-500/10">Remove from Room</button></li>
                    </ul>
                </div>
            )}

            {isThemePickerOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsThemePickerOpen(false)}>
                     <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-6 relative" onClick={e => e.stopPropagation()}>
                         <h2 className="text-xl font-bold text-slate-100 mb-4">Change Room Theme</h2>
                         <div className="grid grid-cols-2 gap-4">
                             {Object.entries(ROOM_THEMES).map(([key, theme]) => (
                                 <button key={key} onClick={() => handleUpdateTheme(key)} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50">
                                     <div className={`w-10 h-10 rounded-full ${theme.bgClass}`} />
                                     <span className="font-semibold">{theme.name}</span>
                                 </button>
                             ))}
                         </div>
                     </div>
                </div>
            )}
        </div>
    );
};

export default LiveRoomScreen;
