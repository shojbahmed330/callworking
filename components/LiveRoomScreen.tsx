import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppView, LiveAudioRoom, User, LiveRoomMessage, Author } from '../types';
import { firebaseService } from '../services/firebaseService';
// FIX: Add missing import for geminiService.
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import { AGORA_APP_ID } from '../constants';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

// --- CHAT SUB-COMPONENTS ---

const EMOJIS = ['❤️', '😂', '👍', '🔥', '👏', '🎉', '😮', '😢'];

const ChatMessage: React.FC<{ message: LiveRoomMessage; isMe: boolean }> = ({ message, isMe }) => {
    if (!message.sender) return null;
    return (
        <div className={`flex items-start gap-2 animate-fade-in-fast ${isMe ? 'flex-row-reverse' : ''}`}>
            {!isMe && <img src={message.sender.avatarUrl} alt={message.sender.name} className="w-8 h-8 rounded-full flex-shrink-0" />}
            <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && <p className="text-xs text-slate-400 ml-2">{message.sender.name}</p>}
                {message.text ? (
                    <div className={`px-3 py-2 rounded-xl max-w-xs break-words ${isMe ? 'bg-rose-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-100 rounded-bl-none'}`}>
                        <p className="text-sm">{message.text}</p>
                    </div>
                ) : message.emoji ? (
                    <div className="text-4xl px-2 py-1">{message.emoji}</div>
                ) : null}
            </div>
        </div>
    );
};

const ChatPanel: React.FC<{
    roomId: string;
    currentUser: User;
    onClose?: () => void;
}> = ({ roomId, currentUser, onClose }) => {
    const [messages, setMessages] = useState<LiveRoomMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsubscribe = firebaseService.listenToLiveRoomMessages(roomId, setMessages);
        return () => unsubscribe();
    }, [roomId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e?: React.FormEvent, emoji?: string) => {
        e?.preventDefault();
        const text = newMessage.trim();
        if (!text && !emoji) return;

        const messageData = { text: text || undefined, emoji };
        await firebaseService.sendLiveRoomMessage(roomId, currentUser, messageData);
        setNewMessage('');
        setEmojiPickerOpen(false);
    };

    return (
        <div className="h-full w-full bg-slate-900/80 backdrop-blur-sm border-l border-slate-700/50 flex flex-col">
            <header className="flex-shrink-0 p-3 flex justify-between items-center border-b border-slate-700/50">
                <h3 className="text-lg font-bold text-slate-100">Live Chat</h3>
                {onClose && (
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700">
                        <Icon name="close" className="w-5 h-5" />
                    </button>
                )}
            </header>
            <main className="flex-grow p-3 space-y-4 overflow-y-auto">
                {messages.map(msg => <ChatMessage key={msg.id} message={msg} isMe={msg.sender.id === currentUser.id} />)}
                <div ref={messagesEndRef} />
            </main>
            <footer className="flex-shrink-0 p-3 border-t border-slate-700/50 relative">
                {isEmojiPickerOpen && (
                    <div className="absolute bottom-full mb-2 bg-slate-800 rounded-xl p-2 grid grid-cols-4 gap-2 shadow-lg w-48">
                        {EMOJIS.map(emoji => (
                            <button key={emoji} onClick={(e) => handleSendMessage(e, emoji)} className="text-3xl p-1 rounded-lg hover:bg-slate-700 transition-transform hover:scale-125">
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                    <button type="button" onClick={() => setEmojiPickerOpen(p => !p)} className="p-2 rounded-full text-slate-300 hover:bg-slate-700">
                        <Icon name="face-smile" className="w-6 h-6" />
                    </button>
                    <input
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        placeholder="Say something..."
                        className="flex-grow bg-slate-700 border-slate-600 text-slate-100 rounded-full py-2.5 px-4 focus:ring-lime-500 focus:border-lime-500 text-sm"
                    />
                    <button type="submit" disabled={!newMessage.trim()} className="p-2.5 rounded-full bg-lime-600 text-black hover:bg-lime-500 disabled:bg-slate-500">
                        <Icon name="paper-airplane" className="w-5 h-5" />
                    </button>
                </form>
            </footer>
        </div>
    );
};

// --- MAIN COMPONENT ---

interface LiveRoomScreenProps {
  currentUser: User;
  roomId: string;
  onNavigate: (view: AppView, props?: any) => void;
  onGoBack: () => void;
  onSetTtsMessage: (message: string) => void;
}

const Avatar: React.FC<{ user: User; isHost?: boolean; isSpeaking?: boolean; children?: React.ReactNode }> = ({ user, isHost, isSpeaking, children }) => (
    <div className="relative flex flex-col items-center gap-2 text-center w-24">
        <div className="relative">
            <img 
                src={user.avatarUrl}
                alt={user.name}
                className={`w-20 h-20 rounded-full border-4 transition-all duration-300 ${isSpeaking ? 'border-green-400 ring-4 ring-green-500/50' : 'border-slate-600'}`}
            />
            {isHost && <div className="absolute -bottom-2 -right-1 text-2xl">👑</div>}
        </div>
        <p className="font-semibold text-slate-200 truncate w-full">{user.name}</p>
        {children}
    </div>
);


const LiveRoomScreen: React.FC<LiveRoomScreenProps> = ({ currentUser, roomId, onNavigate, onGoBack, onSetTtsMessage }) => {
    const [room, setRoom] = useState<LiveAudioRoom | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
    const [isChatVisible, setIsChatVisible] = useState(false);

    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    
    const onGoBackRef = useRef(onGoBack);
    const onSetTtsMessageRef = useRef(onSetTtsMessage);

    useEffect(() => {
        onGoBackRef.current = onGoBack;
        onSetTtsMessageRef.current = onSetTtsMessage;
    });

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

        const amISpeakerNow = room.speakers.some(s => s && s.id === currentUser.id);
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

    }, [room, currentUser.id]);

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
            const willBeMuted = !isMuted;
            localAudioTrack.current.setMuted(willBeMuted);
            setIsMuted(willBeMuted);
        }
    };

    const handleRaiseHand = () => geminiService.raiseHandInAudioRoom(currentUser.id, roomId);
    const handleInviteToSpeak = (userId: string) => geminiService.inviteToSpeakInAudioRoom(currentUser.id, userId, roomId);
    const handleMoveToAudience = (userId: string) => geminiService.moveToAudienceInAudioRoom(currentUser.id, userId, roomId);


    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Loading Room...</div>;
    }
    
    const isHost = room.host.id === currentUser.id;
    const isSpeaker = room.speakers.filter(Boolean).some(s => s.id === currentUser.id);
    const isListener = !isSpeaker;
    const hasRaisedHand = room.raisedHands.includes(currentUser.id);
    const raisedHandUsers = room.listeners.filter(u => u && room.raisedHands.includes(u.id));

    const speakerIdMap = new Map<string, string>();
    room.speakers.filter(Boolean).forEach(s => {
        const agoraUID = (parseInt(s.id, 36) % 10000000).toString();
        speakerIdMap.set(agoraUID, s.id);
    });
    const activeAppSpeakerId = activeSpeakerId ? speakerIdMap.get(activeSpeakerId) : null;

    return (
        <div className="h-full w-full flex flex-col md:flex-row bg-gradient-to-b from-slate-900 to-black text-white overflow-hidden">
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
                        <h2 className="text-lg font-semibold text-slate-300 mb-4">Speakers ({room.speakers.filter(Boolean).length})</h2>
                        <div className="flex flex-wrap gap-6">
                            {room.speakers.filter(Boolean).map(speaker => (
                                <Avatar key={speaker.id} user={speaker} isHost={speaker.id === room.host.id} isSpeaking={speaker.id === activeAppSpeakerId}>
                                    {isHost && speaker.id !== currentUser.id && (
                                        <button onClick={() => handleMoveToAudience(speaker.id)} className="text-xs text-red-400 hover:underline">Move to Audience</button>
                                    )}
                                </Avatar>
                            ))}
                        </div>
                    </section>

                    {isHost && raisedHandUsers.length > 0 && (
                        <section>
                            <h2 className="text-lg font-semibold text-green-400 mb-4">Requests to Speak ({raisedHandUsers.length})</h2>
                            <div className="flex flex-wrap gap-6 bg-slate-800/50 p-4 rounded-lg">
                            {raisedHandUsers.filter(Boolean).map(user => (
                                    <Avatar key={user.id} user={user}>
                                        <button onClick={() => handleInviteToSpeak(user.id)} className="text-xs bg-green-500 text-white px-2 py-1 rounded-md font-semibold">Invite to Speak</button>
                                    </Avatar>
                            ))}
                            </div>
                        </section>
                    )}

                    <section>
                        <h2 className="text-lg font-semibold text-slate-300 mb-4">Listeners ({room.listeners.filter(Boolean).length})</h2>
                        <div className="flex flex-wrap gap-4">
                            {room.listeners.filter(Boolean).map(listener => (
                                <div key={listener.id} className="relative" title={listener.name}>
                                    <img src={listener.avatarUrl} alt={listener.name} className="w-12 h-12 rounded-full" />
                                    {room.raisedHands.includes(listener.id) && (
                                        <div className="absolute -bottom-1 -right-1 text-xl bg-slate-700 p-0.5 rounded-full">✋</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                </main>
                
                <footer className="flex-shrink-0 p-4 bg-black/20 flex justify-center items-center h-24 gap-4">
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
                    <button onClick={() => setIsChatVisible(p => !p)} className="md:hidden p-4 rounded-full bg-slate-600 hover:bg-slate-500">
                        <Icon name="comment" className="w-6 h-6" />
                    </button>
                </footer>
            </div>
            
            {/* Desktop Chat Panel */}
            <div className="hidden md:block w-80 lg:w-96 flex-shrink-0 h-full">
                <ChatPanel roomId={roomId} currentUser={currentUser} />
            </div>

            {/* Mobile Chat Overlay */}
            {isChatVisible && (
                 <div className="md:hidden fixed inset-0 z-20 bg-black/50" onClick={() => setIsChatVisible(false)}>
                    <div className={`absolute bottom-0 left-0 right-0 h-[80%] transition-transform duration-300 ease-in-out ${isChatVisible ? 'translate-y-0' : 'translate-y-full'}`} onClick={e => e.stopPropagation()}>
                         <ChatPanel roomId={roomId} currentUser={currentUser} onClose={() => setIsChatVisible(false)} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default LiveRoomScreen;
