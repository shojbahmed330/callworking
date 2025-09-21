import React, { useState, useEffect, useRef } from 'react';
import { LiveAudioRoom, User, Speaker, Listener } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import { AGORA_APP_ID } from '../constants';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

interface LiveRoomScreenProps {
  currentUser: User;
  roomId: string;
  onGoBack: () => void;
  onSetTtsMessage: (message: string) => void;
}

const ParticipantCard: React.FC<{ user: Speaker | Listener, isSpeaker: boolean, isMuted?: boolean, isHost: boolean }> = ({ user, isSpeaker, isMuted, isHost }) => (
    <div className="flex flex-col items-center gap-2 text-center">
        <div className="relative">
            <img src={user.avatarUrl} alt={user.name} className="w-20 h-20 rounded-full" />
            {isSpeaker && isMuted && (
                <div className="absolute -bottom-1 -right-1 bg-slate-600 p-1.5 rounded-full border-2 border-slate-900">
                    <Icon name="microphone-slash" className="w-4 h-4 text-white" />
                </div>
            )}
        </div>
        <p className="font-semibold text-slate-100">{user.name} {isHost ? '👑' : ''}</p>
    </div>
);


const LiveRoomScreen: React.FC<LiveRoomScreenProps> = ({ currentUser, roomId, onGoBack, onSetTtsMessage }) => {
    const [room, setRoom] = useState<LiveAudioRoom | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    
    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);

    const isHost = room?.host.id === currentUser.id;
    const isSpeaker = room?.speakers.some(s => s.id === currentUser.id);

    // Agora & Firebase setup
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
                if(!token) throw new Error("Failed to get Agora token.");

                await client.join(AGORA_APP_ID, roomId, token, currentUser.id);

                if (isSpeaker) {
                    const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
                    localAudioTrack.current = audioTrack;
                    await client.publish([audioTrack]);
                }
            } catch (error) {
                console.error("Agora failed to initialize:", error);
                onSetTtsMessage("Could not join the audio room. Please check mic permissions.");
                onGoBack();
            }
        };
        
        // Join the room in Firebase first
        geminiService.joinLiveAudioRoom(currentUser.id, roomId).then(joinAndPublish);
        
        const unsubscribe = geminiService.listenToAudioRoom(roomId, (roomDetails) => {
            if (roomDetails) {
                setRoom(roomDetails);
            } else {
                onGoBack(); // Room has ended
            }
            setIsLoading(false);
        });

        return () => {
            unsubscribe();
            client.off('user-published', handleUserPublished);
            localAudioTrack.current?.close();
            client.leave();
            geminiService.leaveLiveAudioRoom(currentUser.id, roomId);
        };
    }, [roomId, currentUser.id, isSpeaker, onGoBack, onSetTtsMessage]);
    
    const handleLeave = () => {
        if (isHost) {
            if(window.confirm("As the host, leaving will end the room for everyone. Are you sure?")) {
                geminiService.endLiveAudioRoom(currentUser.id, roomId);
            }
        } else {
            onGoBack();
        }
    };
    
    const toggleMute = () => {
        if (localAudioTrack.current) {
            const muted = !isMuted;
            localAudioTrack.current.setMuted(muted);
            setIsMuted(muted);
        }
    };

    const handleRaiseHand = () => {
        geminiService.raiseHandInAudioRoom(currentUser.id, roomId);
    };

    const handleInviteToSpeak = (userId: string) => {
        geminiService.inviteToSpeakInAudioRoom(currentUser.id, userId, roomId);
    };

    const handleMoveToAudience = (userId: string) => {
        geminiService.moveToAudienceInAudioRoom(currentUser.id, userId, roomId);
    };

    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Joining Room...</div>;
    }
    
    return (
        <div className="h-full w-full flex flex-col bg-gradient-to-b from-indigo-900 to-slate-900 text-white">
            <header className="flex-shrink-0 p-4 flex justify-between items-center bg-black/20">
                <div>
                    <h1 className="text-xl font-bold truncate">{room.topic}</h1>
                    <p className="text-sm text-slate-400">{room.speakers.length + room.listeners.length} people</p>
                </div>
                <button onClick={handleLeave} className="bg-red-600 hover:bg-red-500 font-bold py-2 px-4 rounded-lg">
                    {isHost ? 'End Room' : 'Leave Quietly'}
                </button>
            </header>

            <main className="flex-grow p-6 overflow-y-auto">
                <section>
                    <h2 className="text-lg font-bold text-slate-300 mb-4">Speakers ({room.speakers.length})</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-6">
                        {room.speakers.map(speaker => (
                            <ParticipantCard 
                                key={speaker.id} 
                                user={speaker} 
                                isSpeaker={true} 
                                isMuted={speaker.isMuted} 
                                isHost={speaker.id === room.host.id} 
                            />
                        ))}
                    </div>
                </section>

                <section className="mt-8">
                    <h2 className="text-lg font-bold text-slate-300 mb-4">Listeners ({room.listeners.length})</h2>
                     <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-6">
                        {room.listeners.map(listener => (
                            <ParticipantCard 
                                key={listener.id} 
                                user={listener} 
                                isSpeaker={false} 
                                isHost={false}
                            />
                        ))}
                    </div>
                </section>
            </main>

            <footer className="flex-shrink-0 p-4 bg-black/20 flex justify-center items-center h-24">
                {isSpeaker && (
                    <button onClick={toggleMute} className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-red-600' : 'bg-slate-600'}`}>
                        <Icon name={isMuted ? 'microphone-slash' : 'mic'} className="w-6 h-6" />
                    </button>
                )}
                {!isSpeaker && (
                    <button onClick={handleRaiseHand} className="bg-lime-600 text-black font-bold py-3 px-6 rounded-lg">
                       Raise Hand
                    </button>
                )}
            </footer>
        </div>
    );
};

export default LiveRoomScreen;
