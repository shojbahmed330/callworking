import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppView, LiveAudioRoom, User, LiveAudioRoomMessage, ChatTheme } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import { AGORA_APP_ID, CHAT_THEMES } from '../constants';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

const AVAILABLE_REACTIONS = ['❤️', '😂', '👍', '🎉', '🔥', '🙏'];

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
                className={`w-20 h-20 rounded-full border-4 transition-all duration-300 ${isSpeaking ? 'border-green-400 ring-4 ring-green-500/50 animate-pulse' : 'border-slate-600'}`}
            />
            {isHost && <div className="absolute -bottom-2 -right-1 text-2xl">👑</div>}
        </div>
        <p className="font-semibold text-slate-200 truncate w-full">{user.name}</p>
        {children}
    </div>
);

const ChatMessage: React.FC<{ 
    message: LiveAudioRoomMessage; 
    activeSpeakerId: string | null; 
    isMe: boolean;
    theme: typeof CHAT_THEMES[ChatTheme];
    onReact: (messageId: string, emoji: string) => void;
}> = ({ message, activeSpeakerId, isMe, theme, onReact }) => {
    const isSpeaking = message.sender.id === activeSpeakerId;
    const [isPickerOpen, setPickerOpen] = useState(false);

    const bubbleClasses = useMemo(() => {
        const base = 'px-3 py-2 rounded-xl max-w-[90%] break-words relative backdrop-blur-sm transition-all duration-300';
        if (isMe) {
            return `${base} ${theme.myBubble} bg-opacity-80 ml-auto rounded-br-none`;
        }
        if (message.isHost) {
            return `${base} bg-amber-500/40 border border-amber-400/50 rounded-bl-none`;
        }
        if (message.isSpeaker) {
            return `${base} bg-sky-500/40 border border-sky-400/50 rounded-bl-none`;
        }
        return `${base} bg-slate-700/50 rounded-bl-none`;
    }, [isMe, message.isHost, message.isSpeaker, theme]);

    const glowClass = isSpeaking ? 'shadow-[0_0_15px_rgba(57,255,20,0.7)]' : '';
    
    const reactionSummary = useMemo(() => {
        if (!message.reactions || Object.keys(message.reactions).length === 0) return null;
        return Object.entries(message.reactions)
            .filter(([, userIds]) => userIds.length > 0)
            .map(([emoji, userIds]) => ({ emoji, count: userIds.length }))
            .sort((a, b) => b.count - a.count);
    }, [message.reactions]);

    return (
        <div className="flex flex-col animate-fade-in-fast">
            <div className={`flex items-start gap-2 group ${isMe ? 'flex-row-reverse' : ''}`}>
                 {!isMe && <img src={message.sender.avatarUrl} alt={message.sender.name} className="w-8 h-8 rounded-full mt-1 flex-shrink-0" />}
                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} flex-grow`}>
                    {!isMe && (
                        <div className="flex items-baseline gap-2 px-1">
                            <p className="text-sm font-bold" style={{ color: theme.headerText }}>
                                {message.sender.name}
                                {message.isHost && <span className="ml-1.5" title="Host">👑</span>}
                            </p>
                        </div>
                    )}
                    <div className="relative w-full">
                        <div className={`inline-block ${isMe ? 'ml-auto' : ''}`}>
                             <div className={`${bubbleClasses} ${glowClass}`}>
                                <p className={`text-base ${theme.text} break-words`}>{message.text}</p>
                            </div>
                        </div>
                        <div className={`absolute top-1/2 -translate-y-1/2 p-1 rounded-full bg-slate-900/50 backdrop-blur-sm border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'}`}>
                             <button onClick={() => setPickerOpen(p => !p)} className="text-lg">😀</button>
                        </div>

                        {isPickerOpen && (
                            <div className={`absolute bottom-full mb-1 p-1.5 rounded-full bg-slate-900/80 backdrop-blur-sm border border-slate-600 flex items-center gap-1 shadow-lg z-10 ${isMe ? 'right-0' : 'left-0'}`}>
                                {AVAILABLE_REACTIONS.map(emoji => (
                                    <button key={emoji} onClick={() => { onReact(message.id, emoji); setPickerOpen(false); }} className="text-2xl p-1 rounded-full hover:bg-slate-700/50 transition-transform hover:scale-125">
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {reactionSummary && (
                        <div className={`flex gap-1.5 mt-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            {reactionSummary.map(({ emoji, count }) => (
                                <div key={emoji} className="bg-slate-700/60 rounded-full px-2 py-0.5 text-xs flex items-center gap-1">
                                    <span>{emoji}</span>
                                    <span className="text-slate-300 font-semibold">{count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ThemePicker: React.FC<{onSelect: (theme: any) => void, onClose: () => void}> = ({ onSelect, onClose }) => {
    return (
        <div className="absolute top-14 right-4 z-40 bg-slate-800/80 backdrop-blur-md border border-slate-600 rounded-lg p-2 shadow-2xl animate-fade-in-fast">
             <div className="grid grid-cols-3 gap-2">
                {Object.entries(CHAT_THEMES).map(([key, theme]) => (
                    <button key={key} onClick={() => onSelect(theme)} className="flex flex-col items-center gap-1 p-1 rounded-md hover:bg-slate-700/50">
                        <div className={`w-12 h-8 rounded-md bg-gradient-to-br ${theme.bgGradient} flex items-center justify-end p-1`}>
                             <div className={`w-4 h-3 rounded ${theme.myBubble}`}></div>
                        </div>
                        <p className="text-xs text-slate-300">{theme.name}</p>
                    </button>
                ))}
            </div>
        </div>
    )
}

const BackgroundParticles: React.FC = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
            <div
                key={i}
                className="particle"
                style={{
                    '--size': `${Math.random() * 2 + 1}px`,
                    '--x-start': `${Math.random() * 100}vw`,
                    '--y-start': `${Math.random() * 100}vh`,
                    '--x-end': `${Math.random() * 100}vw`,
                    '--y-end': `${Math.random() * 100}vh`,
                    '--duration': `${Math.random() * 20 + 15}s`,
                    '--delay': `-${Math.random() * 20}s`,
                } as React.CSSProperties}
            />
        ))}
    </div>
);


const LiveRoomScreen: React.FC<LiveRoomScreenProps> = ({ currentUser, roomId, onNavigate, onGoBack, onSetTtsMessage }) => {
    const [room, setRoom] = useState<LiveAudioRoom | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    
    const [messages, setMessages] = useState<LiveAudioRoomMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    
    const [activeTheme, setActiveTheme] = useState(CHAT_THEMES.default);
    const [isThemePickerOpen, setThemePickerOpen] = useState(false);
    const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; }[]>([]);
    const prevReactionsRef = useRef<Record<string, Record<string, number>>>({});


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
            if (mainSpeaker.level > 5) { // Threshold to avoid flickering
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
        const unsubscribe = geminiService.listenToLiveAudioRoomMessages(roomId, (newMessages) => {
            const newReactions: Record<string, Record<string, number>> = {};
            newMessages.forEach(msg => {
                newReactions[msg.id] = {};
                if(msg.reactions) {
                    Object.entries(msg.reactions).forEach(([emoji, users]) => {
                        newReactions[msg.id][emoji] = users.length;
                    });
                }
            });

            // Compare with previous state to find new reactions
            newMessages.forEach(msg => {
                if (msg.reactions) {
                    Object.entries(msg.reactions).forEach(([emoji, users]) => {
                        const prevCount = prevReactionsRef.current[msg.id]?.[emoji] || 0;
                        if (users.length > prevCount) {
                            // A new reaction was added
                             setFloatingEmojis(prev => [...prev, { id: Date.now() + Math.random(), emoji }]);
                        }
                    });
                }
            });

            prevReactionsRef.current = newReactions;
            setMessages(newMessages);
        });
        return () => unsubscribe();
    }, [roomId]);

    useEffect(() => {
        if (isChatOpen || window.innerWidth >= 768) {
             messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isChatOpen]);
    
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

    }, [room, currentUser.id]);

    const handleLeave = () => onGoBack();
    
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

    const isHost = room?.host.id === currentUser.id;
    const isSpeaker = room?.speakers.some(s => s.id === currentUser.id) ?? false;
    
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim() === '' || !room) return;
        
        try {
            await geminiService.sendLiveAudioRoomMessage(roomId, currentUser, newMessage.trim(), !!isHost, isSpeaker);
            setNewMessage('');
        } catch (error) {
            console.error("Failed to send message:", error);
            onSetTtsMessage("Could not send message.");
        }
    };
    
    const handleReact = (messageId: string, emoji: string) => {
        geminiService.reactToLiveAudioRoomMessage(roomId, messageId, currentUser.id, emoji);
    };

    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Loading Room...</div>;
    }
    
    const isListener = !isSpeaker;
    const hasRaisedHand = room.raisedHands.includes(currentUser.id);
    const raisedHandUsers = room.listeners.filter(u => room.raisedHands.includes(u.id));

    const speakerIdMap = new Map<string, string>();
    room.speakers.forEach(s => {
        const agoraUID = (parseInt(s.id, 36) % 10000000).toString();
        speakerIdMap.set(agoraUID, s.id);
    });

    const activeAppSpeakerId = activeSpeakerId ? speakerIdMap.get(activeSpeakerId) : null;

    return (
        <div className="h-full w-full flex flex-col md:flex-row bg-slate-900 text-white overflow-hidden">
             <style>{`
                @keyframes fade-in-fast {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-fast { animation: fade-in-fast 0.3s ease-out forwards; }
                
                @keyframes float-up {
                    0% { transform: translateY(0) scale(0.5); opacity: 1; }
                    100% { transform: translateY(-150px) scale(1.5); opacity: 0; }
                }
                .floating-emoji {
                    position: absolute;
                    bottom: 80px;
                    left: 50%;
                    animation: float-up 3s ease-out forwards;
                    pointer-events: none;
                }
                @keyframes particle-anim {
                    from { transform: translate3d(var(--x-start), var(--y-start), 0); opacity: 1; }
                    to { transform: translate3d(var(--x-end), var(--y-end), 0); opacity: 0; }
                }
                .particle {
                    position: absolute;
                    background: white;
                    border-radius: 50%;
                    width: var(--size);
                    height: var(--size);
                    opacity: 0;
                    animation: particle-anim var(--duration) var(--delay) linear infinite;
                }
             `}</style>
            <div className="flex-grow flex flex-col h-full overflow-hidden">
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
                            {raisedHandUsers.map(user => (
                                    <Avatar key={user.id} user={user}>
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
                
                <footer className="relative flex-shrink-0 p-4 bg-black/20 flex justify-center items-center h-24 gap-4">
                     {floatingEmojis.map(emoji => (
                        <div key={emoji.id} className="floating-emoji text-4xl" onAnimationEnd={() => setFloatingEmojis(f => f.filter(item => item.id !== emoji.id))}>
                            {emoji.emoji}
                        </div>
                    ))}
                    <button
                        onClick={() => setIsChatOpen(true)}
                        className="md:hidden bg-slate-600 p-3 rounded-full"
                        aria-label="Open chat"
                    >
                        <Icon name="comment" className="w-6 h-6" />
                    </button>
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
            
            <aside className={`w-full md:w-80 lg:w-96 flex-shrink-0 bg-gradient-to-br ${activeTheme.bgGradient} backdrop-blur-sm border-l border-slate-700/50 flex flex-col transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isChatOpen ? 'translate-x-0' : 'translate-x-full'} absolute top-0 right-0 h-full z-30`}>
                 <BackgroundParticles />
                 <header className="p-4 flex-shrink-0 border-b border-white/10 flex justify-between items-center z-10">
                    <h2 className="font-bold text-lg">Room Chat</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setThemePickerOpen(p => !p)} className="p-2 rounded-full hover:bg-white/10">
                            <Icon name="swatch" className="w-5 h-5" />
                        </button>
                        <button onClick={() => setIsChatOpen(false)} className="md:hidden p-2 rounded-full hover:bg-white/10">
                            <Icon name="close" className="w-5 h-5" />
                        </button>
                    </div>
                </header>
                 {isThemePickerOpen && <ThemePicker onSelect={theme => { setActiveTheme(theme); setThemePickerOpen(false); }} onClose={() => setThemePickerOpen(false)}/>}
                <div className="flex-grow p-4 overflow-y-auto space-y-4 z-10">
                    {messages.map(msg => (
                        <ChatMessage key={msg.id} message={msg} activeSpeakerId={activeAppSpeakerId} isMe={msg.sender.id === currentUser.id} theme={activeTheme} onReact={handleReact} />
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                <footer className="p-3 flex-shrink-0 border-t border-white/10 bg-black/20 z-10">
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Send a message..."
                            className="w-full bg-slate-800/70 border border-slate-600 rounded-full py-2 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-lime-500"
                        />
                        <button type="submit" className="p-2.5 bg-lime-600 rounded-full text-black hover:bg-lime-500 transition-colors disabled:bg-slate-500" disabled={!newMessage.trim()}>
                            <Icon name="paper-airplane" className="w-5 h-5" />
                        </button>
                    </form>
                </footer>
            </aside>
        </div>
    );
};

export default LiveRoomScreen;