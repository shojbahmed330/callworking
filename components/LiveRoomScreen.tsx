
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppView, LiveAudioRoom, User } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import { AGORA_APP_ID } from '../constants';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { useSettings } from '../contexts/SettingsContext';

interface LiveRoomScreenProps {
  currentUser: User;
  roomId: string;
  onGoBack: () => void;
  onSetTtsMessage: (message: string) => void;
  onNavigate: (view: AppView, props?: any) => void;
  onOpenProfile: (username: string) => void;
}


const LiveRoomScreen: React.FC<LiveRoomScreenProps> = ({ currentUser, roomId, onGoBack, onSetTtsMessage, onNavigate, onOpenProfile }) => {
    const [room, setRoom] = useState<LiveAudioRoom | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [chatMessage, setChatMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const { language } = useSettings();

    // Agora Lifecycle Management
    useEffect(() => {
        if (!AGORA_APP_ID) {
            onSetTtsMessage("Agora App ID is not configured. Real-time audio will not work.");
            onGoBack();
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

        const joinAndPublish = async () => {
            try {
                client.on('user-published', handleUserPublished);

                const token = await geminiService.getAgoraToken(roomId, currentUser.id);
                if (!token) throw new Error("Failed to retrieve Agora token.");
                
                await client.join(AGORA_APP_ID, roomId, token, currentUser.id);

                const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
                localAudioTrack.current = audioTrack;
                await client.publish([audioTrack]);

            } catch (error: any) {
                console.error("Agora failed to join or publish:", error);
                onGoBack();
            }
        };

        geminiService.joinLiveAudioRoom(currentUser.id, roomId).then(joinAndPublish);

        return () => {
            client.removeAllListeners();
            localAudioTrack.current?.stop();
            localAudioTrack.current?.close();
            client.leave();
            geminiService.leaveLiveAudioRoom(currentUser.id, roomId);
        };
    }, [roomId, currentUser.id, onGoBack, onSetTtsMessage]);
    
    // Firestore listener for room metadata
    useEffect(() => {
        const unsubscribe = geminiService.listenToAudioRoom(roomId, (liveRoom) => {
            setRoom(liveRoom);
            if (liveRoom && isLoading) {
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, [roomId, isLoading]);
    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [room?.messages]);


    const handleLeave = () => {
        geminiService.endLiveAudioRoom(currentUser.id, roomId).finally(onGoBack);
    };

    const toggleMute = () => {
        const muted = !isMuted;
        localAudioTrack.current?.setMuted(muted);
        setIsMuted(muted);
    };

    const handleSendChatMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatMessage.trim() || !room) return;
        await geminiService.sendAudioRoomMessage(room.id, currentUser, chatMessage.trim());
        setChatMessage('');
    };
    
    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-black text-white">Loading Room...</div>;
    }

    const participants = [...room.speakers, ...room.listeners];

    return (
        <div className={`h-full w-full flex flex-col text-white bg-black`}>
            {/* Header */}
            <header className="flex-shrink-0 p-3 flex justify-between items-center bg-black/50">
                <div className="flex items-center gap-2">
                    <img src={room.host.avatarUrl} alt={room.host.name} className="w-10 h-10 rounded-full"/>
                    <div>
                        <div className="flex items-center">
                            <h1 className="text-lg font-bold">Unmad</h1>
                            <button className="ml-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white"><Icon name="plus" className="w-4 h-4"/></button>
                        </div>
                        <p className="text-xs text-slate-400">Members: {participants.length}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button><Icon name="share" className="w-6 h-6"/></button>
                    <button onClick={handleLeave}><Icon name="close" className="w-6 h-6"/></button>
                </div>
            </header>

            {/* Main content area */}
            <main className="flex-grow overflow-y-auto p-3 space-y-4">
                {/* Rank Bar (Mocked) */}
                <div className="bg-slate-800/50 rounded-full p-1 flex items-center justify-between">
                    <div className="bg-slate-900 rounded-full px-3 py-1 flex items-center gap-2">
                        <Icon name="trophy" className="w-5 h-5 text-yellow-400"/>
                        <span className="font-bold text-sm">Hourly Rank</span>
                        <span className="text-sm text-slate-400">14s</span>
                    </div>
                    <span className="text-sm font-bold pr-4">17</span>
                </div>

                {/* Participants - Horizontally scrollable */}
                <div className="flex gap-4 overflow-x-auto pb-2 -mx-3 px-3 no-scrollbar">
                    {participants.slice(0, 10).map(p => ( // Show up to 10 participants
                        <div key={p.id} className="flex flex-col items-center flex-shrink-0 w-20 text-center">
                            <div className="relative">
                                <img src={p.avatarUrl} alt={p.name} className="w-16 h-16 rounded-full object-cover border-2 border-slate-700"/>
                                {(p.id === currentUser.id ? isMuted : room.mutedByHostIds?.includes(p.id)) && (
                                    <div className="absolute -bottom-1 -right-1 bg-slate-600 p-1.5 rounded-full border-2 border-black">
                                        <Icon name="microphone-slash" className="w-3 h-3 text-white" />
                                    </div>
                                )}
                            </div>
                            <p className="text-xs font-semibold mt-1 truncate w-full">{p.name}</p>
                        </div>
                    ))}
                </div>

                {/* Guidelines (Mocked) */}
                <div className="border border-slate-600 rounded-lg p-3 text-xs text-slate-400">
                    <p>at the age of 18 or older. Rooms are monitored 24/7 to ensure compliance with our policies. Please follow the imo Community Guidelines to help build a safe and friendly community. Users or rooms sharing inappropriate content will face strict penalties.</p>
                </div>
              
                {/* Chat messages */}
                <div className="space-y-3">
                    {room.messages?.map(msg => (
                        <div key={msg.id} className="flex items-start gap-2">
                            <button onClick={() => onOpenProfile(msg.sender.username)}>
                                <img src={msg.sender.avatarUrl} alt={msg.sender.name} className="w-8 h-8 rounded-full mt-1"/>
                            </button>
                            <div className="bg-slate-800/70 p-2 rounded-lg max-w-[80%]">
                                <p className="text-sm font-semibold text-rose-400">{msg.sender.name}</p>
                                <p className="text-sm text-slate-200 break-words">{msg.text}</p>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            </main>

            {/* Footer */}
            <footer className="flex-shrink-0 p-2 bg-black flex items-center gap-2">
                <button onClick={toggleMute} className={`p-2 rounded-full transition-colors ${isMuted ? 'bg-red-600' : 'bg-slate-700'}`}>
                    <Icon name={isMuted ? 'microphone-slash' : 'mic'} className="w-5 h-5" />
                </button>
                <form onSubmit={handleSendChatMessage} className="flex-grow relative">
                    <input 
                        type="text" 
                        value={chatMessage}
                        onChange={e => setChatMessage(e.target.value)}
                        placeholder="Say Hi..."
                        className="w-full bg-slate-800 rounded-full py-2.5 pl-4 pr-10 text-sm text-white focus:outline-none"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Icon name="face-smile" className="w-5 h-5 text-slate-400"/>
                    </button>
                </form>
                <button className="p-2.5 rounded-full bg-slate-800 relative">
                    <Icon name="rose" className="w-5 h-5 text-rose-400" />
                </button>
                <button className="p-2.5 rounded-full bg-slate-800 relative">
                    <Icon name="gift" className="w-5 h-5 text-sky-400" />
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full"></div>
                </button>
            </footer>
        </div>
    );
};

export default LiveRoomScreen;
