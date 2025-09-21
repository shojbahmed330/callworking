import React, { useState, useEffect, useRef, useMemo } from 'react';
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

const ParticipantCard: React.FC<{
    user: Speaker | Listener;
    isMuted: boolean;
    isHost: boolean;
    isSpeaking: boolean;
    viewerIsHost: boolean;
    onMuteToggle?: () => void;
    onMoveToAudience?: () => void;
}> = ({ user, isMuted, isHost, isSpeaking, viewerIsHost, onMuteToggle, onMoveToAudience }) => {
    const isSelf = user.id === React.useContext(UserContext).id;
    const canManage = viewerIsHost && !isSelf;

    return (
        <div className="flex flex-col items-center gap-2 text-center relative group">
            <div className="relative">
                <img src={user.avatarUrl} alt={user.name} className={`w-20 h-20 rounded-full transition-all duration-300 border-4 ${isSpeaking ? 'border-green-400' : 'border-transparent'}`} />
                {isMuted && (
                    <div className="absolute -bottom-1 -right-1 bg-slate-600 p-1.5 rounded-full border-2 border-slate-900">
                        <Icon name="microphone-slash" className="w-4 h-4 text-white" />
                    </div>
                )}
            </div>
            <p className="font-semibold text-slate-100 truncate w-24">{user.name} {isHost ? '👑' : ''}</p>
            {canManage && (
                <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                    {onMuteToggle && <button onClick={onMuteToggle} className="p-1.5 bg-slate-700/80 rounded-full text-white hover:bg-red-500"><Icon name="microphone-slash" className="w-4 h-4" /></button>}
                    {onMoveToAudience && <button onClick={onMoveToAudience} className="p-1.5 bg-slate-700/80 rounded-full text-white hover:bg-yellow-500"><Icon name="back" className="w-4 h-4 transform rotate-90" /></button>}
                </div>
            )}
        </div>
    );
};
const UserContext = React.createContext<User>({} as User);


const LiveRoomScreen: React.FC<LiveRoomScreenProps> = ({ currentUser, roomId, onGoBack, onSetTtsMessage }) => {
    const [room, setRoom] = useState<LiveAudioRoom | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selfMuted, setSelfMuted] = useState(false);
    const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const isJoining = useRef(false);

    const isHost = useMemo(() => room?.host.id === currentUser.id, [room, currentUser.id]);
    const isSpeaker = useMemo(() => room?.speakers.some(s => s.id === currentUser.id), [room, currentUser.id]);

    // Role Change Effect (Publish/Unpublish Mic)
    useEffect(() => {
        const handleRoleChange = async () => {
            const client = agoraClient.current;
            if (!client || client.connectionState !== 'CONNECTED') return;

            if (isSpeaker && !localAudioTrack.current) {
                try {
                    const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
                    localAudioTrack.current = audioTrack;
                    await client.publish([audioTrack]);
                    setSelfMuted(false);
                    onSetTtsMessage("You've been invited to speak. Your mic is now on.");
                } catch (error) {
                    console.error("Failed to create and publish audio track:", error);
                    onSetTtsMessage("Could not activate microphone. Please check permissions.");
                }
            } else if (!isSpeaker && localAudioTrack.current) {
                try {
                    await client.unpublish([localAudioTrack.current]);
                    localAudioTrack.current.stop();
                    localAudioTrack.current.close();
                    localAudioTrack.current = null;
                    onSetTtsMessage("You've been moved to the audience.");
                } catch (error) {
                    console.error("Failed to unpublish audio track:", error);
                }
            }
        };

        handleRoleChange();
    }, [isSpeaker, onSetTtsMessage]);

    // Main Agora & Firebase Setup Effect
    useEffect(() => {
        if (!AGORA_APP_ID) {
            onSetTtsMessage("Agora App ID is not configured. Real-time audio will not work.");
            console.error("Agora App ID is missing.");
            onGoBack();
            return;
        }

        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        agoraClient.current = client;
        isJoining.current = true;

        const setup = async () => {
            // Agora event listeners
            client.on('user-published', async (user, mediaType) => {
                await client.subscribe(user, mediaType);
                if (mediaType === 'audio') user.audioTrack?.play();
            });
            client.enableAudioVolumeIndicator();
            client.on('volume-indicator', (volumes) => {
                if (volumes.length > 0) {
                    const mainSpeaker = volumes.reduce((max, current) => current.level > max.level ? current : max);
                    if (mainSpeaker.level > 5) setActiveSpeakerId(mainSpeaker.uid.toString());
                    else setActiveSpeakerId(null);
                } else {
                    setActiveSpeakerId(null);
                }
            });

            // Firebase listener for room details
            const unsubscribe = geminiService.listenToAudioRoom(roomId, (roomDetails) => {
                if (roomDetails) {
                    setRoom(roomDetails);
                    setIsLoading(false);
                } else {
                    onSetTtsMessage("The room has ended.");
                    onGoBack();
                }
            });
            
            // Join Firebase and then Agora
            await geminiService.joinLiveAudioRoom(currentUser.id, roomId);
            const uid = parseInt(currentUser.id, 36) % 10000000;
            const token = await geminiService.getAgoraToken(roomId, uid);
            if (!token) throw new Error("Failed to get Agora token.");
            await client.join(AGORA_APP_ID, roomId, token, uid);

            isJoining.current = false;
            return unsubscribe;
        };

        const unsubscribePromise = setup().catch(error => {
            console.error("Failed to setup room:", error);
            onSetTtsMessage("Could not join the audio room. Please try again.");
            onGoBack();
        });

        return () => {
            unsubscribePromise.then(unsubscribe => {
                if (unsubscribe) unsubscribe();
            });
            localAudioTrack.current?.close();
            agoraClient.current?.leave();
            geminiService.leaveLiveAudioRoom(currentUser.id, roomId);
        };
    }, [roomId, currentUser.id, onGoBack, onSetTtsMessage]);

    const handleLeave = () => {
        if (isHost && window.confirm("As the host, leaving will end the room for everyone. Are you sure?")) {
            geminiService.endLiveAudioRoom(currentUser.id, roomId);
        } else {
            onGoBack();
        }
    };

    const toggleSelfMute = () => {
        if (localAudioTrack.current) {
            const newMutedState = !selfMuted;
            localAudioTrack.current.setMuted(newMutedState);
            setSelfMuted(newMutedState);
            geminiService.updateSpeakerState(roomId, currentUser.id, { isMuted: newMutedState });
        }
    };

    const handleToggleMuteParticipant = (userId: string, currentMuteState: boolean) => {
        if (!isHost) return;
        geminiService.updateSpeakerState(roomId, userId, { isMuted: !currentMuteState });
    };

    const handleRaiseHand = () => {
        geminiService.raiseHandInAudioRoom(currentUser.id, roomId);
        onSetTtsMessage("Your hand is raised.");
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

    const listenersWithHandRaised = useMemo(() => {
        const raisedHandSet = new Set(room.raisedHands);
        return room.listeners.filter(l => raisedHandSet.has(l.id));
    }, [room.raisedHands, room.listeners]);

    const isHandRaised = room.raisedHands.includes(currentUser.id);

    return (
        <UserContext.Provider value={currentUser}>
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

            <main className="flex-grow p-6 overflow-y-auto space-y-8">
                {isHost && listenersWithHandRaised.length > 0 && (
                    <section>
                        <h2 className="text-lg font-bold text-slate-300 mb-4">Raised Hands ({listenersWithHandRaised.length})</h2>
                        <div className="flex flex-wrap gap-4">
                            {listenersWithHandRaised.map(user => (
                                <div key={user.id} className="bg-slate-700/50 p-3 rounded-lg flex items-center gap-3">
                                    <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full"/>
                                    <p className="font-semibold">{user.name}</p>
                                    <button onClick={() => handleInviteToSpeak(user.id)} className="ml-2 px-3 py-1 bg-green-600 text-white text-xs font-bold rounded-full">Invite</button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <section>
                    <h2 className="text-lg font-bold text-slate-300 mb-4">Speakers ({room.speakers.length})</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-y-6 gap-x-4">
                        {room.speakers.map(speaker => (
                            <ParticipantCard 
                                key={speaker.id} 
                                user={speaker} 
                                isMuted={speaker.isMuted} 
                                isHost={speaker.id === room.host.id} 
                                isSpeaking={speaker.id === activeSpeakerId}
                                viewerIsHost={isHost}
                                onMuteToggle={() => handleToggleMuteParticipant(speaker.id, speaker.isMuted)}
                                onMoveToAudience={() => handleMoveToAudience(speaker.id)}
                            />
                        ))}
                    </div>
                </section>

                <section>
                    <h2 className="text-lg font-bold text-slate-300 mb-4">Listeners ({room.listeners.length})</h2>
                     <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-y-6 gap-x-4">
                        {room.listeners.map(listener => (
                            <ParticipantCard 
                                key={listener.id} 
                                user={listener} 
                                isMuted={true}
                                isHost={false}
                                isSpeaking={false}
                                viewerIsHost={isHost}
                            />
                        ))}
                    </div>
                </section>
            </main>

            <footer className="flex-shrink-0 p-4 bg-black/20 flex justify-center items-center h-24">
                {isSpeaker ? (
                    <button onClick={toggleSelfMute} className={`p-4 rounded-full transition-colors ${selfMuted ? 'bg-red-600' : 'bg-slate-600'}`}>
                        <Icon name={selfMuted ? 'microphone-slash' : 'mic'} className="w-6 h-6" />
                    </button>
                ) : (
                    <button onClick={handleRaiseHand} disabled={isHandRaised} className="bg-lime-600 text-black font-bold py-3 px-6 rounded-lg disabled:bg-slate-500 disabled:cursor-not-allowed">
                       {isHandRaised ? 'Hand Raised' : '✋ Raise Hand'}
                    </button>
                )}
            </footer>
        </div>
        </UserContext.Provider>
    );
};

export default LiveRoomScreen;
