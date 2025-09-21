import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppView, LiveAudioRoom, User, LiveRoomMessage } from '../types';
import { firebaseService } from '../services/firebaseService';
import Icon from './Icon';
import { AGORA_APP_ID } from '../constants';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
// FIX: Import geminiService to handle Agora token generation and room logic.
import { geminiService } from '../services/geminiService';

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
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    
    const onGoBackRef = useRef(onGoBack);
    const onSetTtsMessageRef = useRef(onSetTtsMessage);

    useEffect(() => {
        onGoBackRef.current = onGoBack;
        onSetTtsMessageRef.current = onSetTtsMessage;
    });

    // Effect for Agora Voice Connection
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
            if (mediaType === 'audio') user.audioTrack?.play();
        };

        const handleVolumeIndicator = (volumes: any[]) => {
            if (volumes.length === 0) { setActiveSpeakerId(null); return; };
            const mainSpeaker = volumes.reduce((max, current) => current.level > max.level ? current : max);
            setActiveSpeakerId(mainSpeaker.level > 5 ? mainSpeaker.uid.toString() : null);
        };
        
        const setupAgora = async () => {
            client.on('user-published', handleUserPublished);
            client.enableAudioVolumeIndicator();
            client.on('volume-indicator', handleVolumeIndicator);
            
            const uid = parseInt(currentUser.id, 36) % 10000000;
            
            const token = await geminiService.getAgoraToken(roomId, uid);
            if (!token) {
                onSetTtsMessageRef.current("Could not join the room due to a connection issue.");
                onGoBackRef.current();
                return;
            }
            await client.join(AGORA_APP_ID, roomId, token, uid);
        };

        geminiService.joinLiveAudioRoom(currentUser.id, roomId).then(setupAgora);

        return () => {
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
                setRoom(roomDetails);
            } else {
                onSetTtsMessageRef.current("The room has ended.");
                onGoBackRef.current();
            }
            setIsLoading(false);
        });

        const unsubscribeMessages = firebaseService.listenToRoomMessages(roomId, setMessages);

        return () => {
            unsubscribeRoom();
            unsubscribeMessages();
        };
    }, [roomId]);

     useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    
    // Effect to manage audio track publishing based on speaker role
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
                } catch (error) { onSetTtsMessageRef.current("Could not activate microphone."); }
            }
            else if (!amISpeakerNow && wasISpeakerBefore) {
                if (localAudioTrack.current) {
                    await agoraClient.current?.unpublish([localAudioTrack.current]);
                    localAudioTrack.current.stop();
                    localAudioTrack.current.close();
                    localAudioTrack.current = null;
                }
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

    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Loading Room...</div>;
    }
    
    const memberCount = room.speakers.length + room.listeners.length;
    const speakerIdMap = new Map<string, string>();
    room.speakers.forEach(s => {
        const agoraUID = (parseInt(s.id, 36) % 10000000).toString();
        speakerIdMap.set(agoraUID, s.id);
    });
    const activeAppSpeakerId = activeSpeakerId ? speakerIdMap.get(activeSpeakerId) : null;

    return (
        <div className="h-full w-full flex flex-col bg-black text-white font-sans">
            <header className="flex-shrink-0 p-3 flex justify-between items-center border-b border-slate-700/50">
                <div className="flex items-center gap-3">
                    <img src={room.host.avatarUrl} alt={room.host.name} className="w-10 h-10 rounded-full" />
                    <div>
                        <h1 className="font-bold text-lg">{room.topic}</h1>
                        <p className="text-sm text-slate-400">{memberCount} Members</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button className="p-2 rounded-full hover:bg-slate-800"><Icon name="add-friend" className="w-6 h-6"/></button>
                    <button className="p-2 rounded-full hover:bg-slate-800"><Icon name="share" className="w-6 h-6"/></button>
                    <button onClick={onGoBack} className="p-2 rounded-full hover:bg-slate-800"><Icon name="close" className="w-6 h-6"/></button>
                </div>
            </header>

            <section className="flex-shrink-0 p-4 border-b border-slate-700/50">
                <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
                    {room.speakers.map(speaker => (
                        <div key={speaker.id} className="flex flex-col items-center gap-1.5 w-20 flex-shrink-0">
                            <img 
                                src={speaker.avatarUrl}
                                alt={speaker.name}
                                className={`w-16 h-16 rounded-full border-2 transition-all ${speaker.id === activeAppSpeakerId ? 'border-green-400' : 'border-transparent'}`}
                            />
                            <p className="text-xs text-slate-300 truncate w-full text-center">{speaker.name}</p>
                        </div>
                    ))}
                </div>
            </section>

            <main className="flex-grow overflow-hidden relative" style={{ maskImage: 'linear-gradient(to top, black 85%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to top, black 85%, transparent 100%)' }}>
                <div className="h-full overflow-y-auto p-4 flex flex-col gap-4">
                    <div className="bg-slate-800/50 border border-slate-700 text-slate-400 text-xs p-3 rounded-lg mb-4">
                        <p>Rooms are monitored 24/7 to ensure compliance with our policies. Please follow the Community Guidelines to help build a safe and friendly community.</p>
                    </div>
                    {messages.map(msg => (
                        <div key={msg.id} className="flex items-start gap-3 animate-fade-in-fast">
                            <img src={msg.sender.avatarUrl} alt={msg.sender.name} className="w-8 h-8 rounded-full"/>
                            <div>
                                <p className="font-semibold text-sm text-slate-300">{msg.sender.name}</p>
                                <div className="mt-1 bg-[#18191a] px-3 py-2 rounded-xl inline-block">
                                    <p className="text-white break-words">{msg.text}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            </main>

            <footer className="flex-shrink-0 p-2 bg-black border-t border-slate-700/50">
                <div className="flex items-center gap-2">
                    <button className="p-2 rounded-full hover:bg-slate-800"><Icon name="add-circle" className="w-7 h-7 text-slate-400"/></button>
                    <form onSubmit={handleSendMessage} className="flex-grow flex items-center gap-2">
                        <div className="relative flex-grow">
                            <input
                                type="text"
                                value={newMessage}
                                onChange={e => setNewMessage(e.target.value)}
                                placeholder="Say Hi..."
                                className="w-full bg-[#18191a] rounded-full py-2.5 pl-4 pr-12 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-lime-500"
                            />
                             <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                                <Icon name="face-smile" className="w-6 h-6"/>
                            </button>
                        </div>
                    </form>
                </div>
            </footer>
        </div>
    );
};

export default LiveRoomScreen;
