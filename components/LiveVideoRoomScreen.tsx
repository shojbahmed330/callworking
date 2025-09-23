import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LiveVideoRoom, User, VideoParticipantState } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import LiveChatDisplay, { LiveChatMessage } from './LiveChatDisplay';
import { getTtsPrompt, AGORA_APP_ID } from '../constants';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack, ICameraVideoTrack } from 'agora-rtc-sdk-ng';
import { useSettings } from '../contexts/SettingsContext';

interface LiveVideoRoomScreenProps {
  currentUser: User;
  roomId: string;
  onGoBack: () => void;
  onSetTtsMessage: (message: string) => void;
}

const ParticipantVideo: React.FC<{
    participant: VideoParticipantState;
    isLocal: boolean;
    isHost: boolean;
    isSpeaking: boolean;
    localVideoTrack: ICameraVideoTrack | null;
    remoteUser: IAgoraRTCRemoteUser | undefined;
    isFullScreen?: boolean;
}> = ({ participant, isLocal, isHost, isSpeaking, localVideoTrack, remoteUser, isFullScreen = false }) => {
    const videoContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const videoContainer = videoContainerRef.current;
        if (!videoContainer) return;

        if (isLocal) {
            if (localVideoTrack && !participant.isCameraOff) {
                localVideoTrack.play(videoContainer);
            } else {
                localVideoTrack?.stop();
            }
        } else {
            if (remoteUser?.hasVideo && !participant.isCameraOff) {
                remoteUser.videoTrack?.play(videoContainer);
            } else {
                remoteUser?.videoTrack?.stop();
            }
        }
        
        return () => {
            if (isLocal) localVideoTrack?.stop();
            else remoteUser?.videoTrack?.stop();
        }

    }, [isLocal, localVideoTrack, remoteUser, participant.isCameraOff]);

    const showVideo = (isLocal && localVideoTrack && !participant.isCameraOff) || (remoteUser?.hasVideo && !participant.isCameraOff);
    const containerClasses = `relative bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center ${isFullScreen ? 'w-full h-full' : 'aspect-square'}`;

    return (
        <div className={containerClasses}>
            {showVideo ? (
                <div ref={videoContainerRef} className={`w-full h-full object-cover ${isLocal ? 'transform scale-x-[-1]' : ''}`} />
            ) : (
                <>
                    <img src={participant.avatarUrl} alt={participant.name} className="w-full h-full object-cover opacity-30" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <img src={participant.avatarUrl} alt={participant.name} className="w-20 h-20 rounded-full" />
                    </div>
                </>
            )}
             {(participant.isCameraOff || (!isLocal && !remoteUser?.hasVideo)) && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Icon name="video-camera-slash" className="w-10 h-10 text-slate-400" />
                </div>
            )}
            <div className={`absolute inset-0 border-4 rounded-lg pointer-events-none transition-colors ${isSpeaking ? 'border-green-400' : 'border-transparent'}`} />
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded-md text-sm text-white font-semibold flex items-center gap-1">
                {isHost && '👑'} {participant.name}
            </div>
             {participant.isMuted && (
                <div className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full">
                    <Icon name="microphone-slash" className="w-4 h-4 text-white" />
                </div>
             )}
        </div>
    );
};

const HeartAnimation = () => (
    <div className="absolute inset-0 pointer-events-none z-50">
        {Array.from({ length: 10 }).map((_, i) => (
            <div
                key={i}
                className="absolute bottom-0"
                style={{
                    left: `${Math.random() * 80 + 10}%`,
                    animation: `float-heart 2.5s ease-out forwards`,
                    animationDelay: `${Math.random() * 1.5}s`,
                    fontSize: `${Math.random() * 1.5 + 1}rem`,
                }}
            >
                ❤️
            </div>
        ))}
    </div>
  );

const LiveVideoRoomScreen: React.FC<LiveVideoRoomScreenProps> = ({ currentUser, roomId, onGoBack, onSetTtsMessage }) => {
    const [room, setRoom] = useState<LiveVideoRoom | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
    const [showHeartAnimation, setShowHeartAnimation] = useState(false);
    const [menuOpenFor, setMenuOpenFor] = useState<{ participantId: string; x: number; y: number } | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const localVideoTrack = useRef<ICameraVideoTrack | null>(null);
    const [localVideoTrackState, setLocalVideoTrackState] = useState<ICameraVideoTrack | null>(null);
    const { language } = useSettings();

    const handleParticipantClick = (participantId: string, event: React.MouseEvent) => {
        if (currentUser.id !== room?.host.id || currentUser.id === participantId) {
            return;
        }
        event.stopPropagation();
        setMenuOpenFor({ participantId, x: event.clientX, y: event.clientY });
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpenFor(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const [messages, setMessages] = useState<LiveChatMessage[]>([]);

    useEffect(() => {
        if (!AGORA_APP_ID) {
            onSetTtsMessage("Agora App ID is not configured. Real-time video will not work.");
            console.error("Agora App ID is not configured in constants.ts");
            onGoBack();
            return;
        }
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        agoraClient.current = client;
        const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
            await client.subscribe(user, mediaType);
            if (mediaType === 'audio') user.audioTrack?.play();
            setRemoteUsers(Array.from(client.remoteUsers));
        };
        const handleUserUnpublished = (user: IAgoraRTCRemoteUser) => setRemoteUsers(Array.from(client.remoteUsers));
        const handleUserLeft = (user: IAgoraRTCRemoteUser) => setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
        const handleVolumeIndicator = (volumes: any[]) => {
            if (volumes.length === 0) { setActiveSpeakerId(null); return; };
            const mainSpeaker = volumes.reduce((max, current) => current.level > max.level ? current : max);
            if (mainSpeaker.level > 5) setActiveSpeakerId(mainSpeaker.uid.toString());
            else setActiveSpeakerId(null);
        };
        const joinAndPublish = async () => {
            try {
                client.on('user-published', handleUserPublished);
                client.on('user-unpublished', handleUserUnpublished);
                client.on('user-left', handleUserLeft);
                client.enableAudioVolumeIndicator();
                client.on('volume-indicator', handleVolumeIndicator);
                const uid = parseInt(currentUser.id, 36) % 10000000;
                const token = await geminiService.getAgoraToken(roomId, uid);
                if (!token) throw new Error("Failed to retrieve Agora token.");
                await client.join(AGORA_APP_ID, roomId, token, uid);

                try {
                    const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
                    localAudioTrack.current = audioTrack;
                    localVideoTrack.current = videoTrack;
                    setLocalVideoTrackState(videoTrack);
                    await client.publish([audioTrack, videoTrack]);
                } catch (mediaError: any) {
                    console.warn("Could not get local media tracks:", mediaError);
                    onSetTtsMessage("Your microphone or camera is not available. You can listen and watch only.");
                    setIsMuted(true);
                    setIsCameraOff(true);
                    // Do not call onGoBack(), allow user to stay in the room.
                }

            } catch (error: any) {
                console.error("Agora failed to join:", error);
                onSetTtsMessage(`Could not join the video room: ${error.message || 'Unknown error'}`);
                onGoBack();
            }
        };
        geminiService.joinLiveVideoRoom(currentUser.id, roomId).then(joinAndPublish);
        return () => {
            client.off('user-published', handleUserPublished);
            client.off('user-unpublished', handleUserUnpublished);
            client.off('user-left', handleUserLeft);
            client.off('volume-indicator', handleVolumeIndicator);
            localAudioTrack.current?.close();
            localVideoTrack.current?.close();
            client.leave();
            geminiService.leaveLiveVideoRoom(currentUser.id, roomId);
        };
    }, [roomId, currentUser.id, onGoBack, onSetTtsMessage, language]);

    useEffect(() => {
        setIsLoading(true);
        const unsubscribeRoom = geminiService.listenToVideoRoom(roomId, (roomDetails) => {
            if (roomDetails) setRoom(roomDetails);
            else onGoBack();
            setIsLoading(false);
        });

        const unsubscribeMessages = geminiService.listenToLiveVideoRoomMessages(roomId, setMessages);

        const unsubscribeHearts = geminiService.listenToHeartAnimationEvents(roomId, () => {
            setShowHeartAnimation(true);
            setTimeout(() => setShowHeartAnimation(false), 2500);
        });

        return () => {
            unsubscribeRoom();
            unsubscribeMessages();
            unsubscribeHearts();
        };
    }, [roomId, onGoBack]);

    const toggleMute = () => {
        if (!localAudioTrack.current) return;
        const muted = !isMuted;
        localAudioTrack.current.setMuted(muted);
        setIsMuted(muted);
        geminiService.updateParticipantMediaState(roomId, currentUser.id, { isMuted: muted });
    };

    const toggleCamera = () => {
        if (!localVideoTrack.current) return;
        const cameraOff = !isCameraOff;
        localVideoTrack.current.setEnabled(!cameraOff);
        setIsCameraOff(cameraOff);
        geminiService.updateParticipantMediaState(roomId, currentUser.id, { isCameraOff: cameraOff });
    };

    const handleSendMessage = (text: string) => {
        if (!text.trim()) return;
        geminiService.sendLiveVideoRoomMessage(roomId, currentUser, text);
    };

    const remoteUsersMap = useMemo(() => {
        const map: Record<string, IAgoraRTCRemoteUser> = {};
        remoteUsers.forEach(user => { map[user.uid.toString()] = user; });
        return map;
    }, [remoteUsers]);

    const participants = useMemo(() => {
        if (!room) return [];
        const participantMap = new Map<string, VideoParticipantState>();

        // Add all participants from the room document
        room.participants.forEach(p => {
            const agoraUid = (parseInt(p.id, 36) % 10000000).toString();
            const remoteUser = remoteUsersMap[agoraUid];
            participantMap.set(p.id, {
                ...p,
                isMuted: !remoteUser?.hasAudio || p.isMuted,
                isCameraOff: !remoteUser?.hasVideo || p.isCameraOff,
            });
        });

        // Add or update the local user's state
        participantMap.set(currentUser.id, {
            ...(participantMap.get(currentUser.id) || currentUser),
            isMuted,
            isCameraOff,
        });

        return Array.from(participantMap.values()).sort((a, b) => {
            if (a.id === room.host.id) return -1;
            if (b.id === room.host.id) return 1;
            if (a.id === currentUser.id) return -1;
            if (b.id === currentUser.id) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [room, remoteUsersMap, currentUser, isMuted, isCameraOff]);

    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Loading Video Room...</div>;
    }

    const host = participants.find(p => p.id === room.host.id);
    const otherParticipants = participants.filter(p => p.id !== room.host.id);

    const handleLikeClick = () => {
        geminiService.sendHeartAnimationEvent(roomId);
    };

    const handleMuteParticipant = (participantId: string) => {
        const participant = participants.find(p => p.id === participantId);
        if (!participant) return;
        geminiService.muteParticipantInVideoRoom(roomId, participantId, !participant.isMuted);
        setMenuOpenFor(null);
    };

    const handleKickParticipant = (participantId: string) => {
        if (window.confirm("Are you sure you want to kick this user?")) {
            geminiService.kickParticipantFromVideoRoom(roomId, participantId);
        }
        setMenuOpenFor(null);
    };

    const handleMakeHost = (participantId: string) => {
        const participant = participants.find(p => p.id === participantId);
        if (!participant) return;
        if (window.confirm(`Are you sure you want to make ${participant.name} the new host?`)) {
            geminiService.setVideoRoomHost(roomId, participant);
        }
        setMenuOpenFor(null);
    };

    return (
        <div className="h-full w-full relative bg-black text-white overflow-hidden">
            {showHeartAnimation && <HeartAnimation />}
            {host && (
                <div className="absolute inset-0 z-0">
                    <ParticipantVideo
                        key={host.id}
                        participant={host}
                        isLocal={host.id === currentUser.id}
                        isHost={true}
                        isSpeaking={host.id === activeSpeakerId}
                        localVideoTrack={localVideoTrackState}
                        remoteUser={remoteUsersMap[(parseInt(host.id, 36) % 10000000).toString()]}
                        isFullScreen={true}
                    />
                </div>
            )}
            <div className="absolute inset-0 z-10 flex flex-col justify-between pointer-events-none">
                <header className="p-4 flex justify-between items-start bg-gradient-to-b from-black/50 to-transparent pointer-events-auto">
                    <div className="bg-black/30 p-2 rounded-lg">
                        <h1 className="text-lg font-bold truncate">{room.topic}</h1>
                        <p className="text-xs text-slate-300">{participants.length} watching</p>
                    </div>
                    <button onClick={onGoBack} className="bg-red-600/80 hover:bg-red-500 font-bold py-2 px-4 rounded-lg text-sm">
                        Leave
                    </button>
                </header>
                <main className="flex-grow flex flex-col justify-end p-4">
                    <div className="flex justify-between items-end w-full">
                        <div className="w-full max-w-sm lg:max-w-md h-[40vh] pointer-events-auto">
                            <LiveChatDisplay messages={messages} currentUser={currentUser} onSendMessage={handleSendMessage} />
                        </div>
                        <div className="hidden md:flex flex-col gap-3 max-h-[60vh] overflow-y-auto pointer-events-auto">
                            {otherParticipants.map(p => (
                                 <div key={p.id} onClick={(e) => handleParticipantClick(p.id, e)} className="w-24 h-24 flex-shrink-0 rounded-lg shadow-lg cursor-pointer">
                                    <ParticipantVideo
                                        participant={p}
                                        isLocal={p.id === currentUser.id}
                                        isHost={false}
                                        isSpeaking={p.id === activeSpeakerId}
                                        localVideoTrack={localVideoTrackState}
                                        remoteUser={remoteUsersMap[(parseInt(p.id, 36) % 10000000).toString()]}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </main>
                <footer className="p-4 flex justify-center items-center gap-4 bg-gradient-to-t from-black/50 to-transparent pointer-events-auto">
                    <button onClick={toggleMute} disabled={!localAudioTrack.current} className={`p-3 rounded-full transition-colors ${isMuted ? 'bg-red-600' : 'bg-slate-600/70 hover:bg-slate-500'} disabled:bg-slate-700/50 disabled:cursor-not-allowed`}>
                        <Icon name={isMuted ? 'microphone-slash' : 'mic'} className="w-5 h-5" />
                    </button>
                    <button onClick={toggleCamera} disabled={!localVideoTrack.current} className={`p-3 rounded-full transition-colors ${isCameraOff ? 'bg-red-600' : 'bg-slate-600/70 hover:bg-slate-500'} disabled:bg-slate-700/50 disabled:cursor-not-allowed`}>
                        <Icon name={isCameraOff ? 'video-camera-slash' : 'video-camera'} className="w-5 h-5" />
                    </button>
                    <button onClick={handleLikeClick} className="p-3 rounded-full bg-pink-500/70 hover:bg-pink-400">
                        <Icon name="like" className="w-5 h-5" />
                    </button>
                </footer>
            </div>

            {menuOpenFor && (
                <div
                    ref={menuRef}
                    className="absolute bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-50 w-48 text-white animate-fade-in-fast"
                    style={{ top: menuOpenFor.y, left: menuOpenFor.x }}
                >
                    <ul>
                        <li><button onClick={() => handleMuteParticipant(menuOpenFor.participantId)} className="w-full text-left p-3 flex items-center gap-3 hover:bg-slate-700/50">Mute Participant</button></li>
                        <li><button onClick={() => handleMakeHost(menuOpenFor.participantId)} className="w-full text-left p-3 flex items-center gap-3 hover:bg-slate-700/50">Make Host</button></li>
                        <li><button onClick={() => handleKickParticipant(menuOpenFor.participantId)} className="w-full text-left p-3 flex items-center gap-3 text-red-400 hover:bg-red-500/10">Kick from Room</button></li>
                    </ul>
                </div>
            )}
        </div>
    );
};

export default LiveVideoRoomScreen;