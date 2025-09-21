import React, { useState, useEffect, useRef, useCallback } from 'react';
// FIX: Import `Call` type to resolve type error
import { LiveVideoRoom, User, VideoParticipantState, Call } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import { getTtsPrompt, AGORA_APP_ID } from '../constants';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack, ICameraVideoTrack } from 'agora-rtc-sdk-ng';
import { useSettings } from '../contexts/SettingsContext';
// FIX: Import `firebaseService` to resolve reference error
import { firebaseService } from '../services/firebaseService';

interface LiveVideoRoomScreenProps {
  currentUser: User;
  roomId: string;
  onGoBack: () => void;
  onSetTtsMessage: (message: string) => void;
}


// Participant Video Component
const ParticipantVideo: React.FC<{
    participant: VideoParticipantState;
    isLocal: boolean;
    isHost: boolean;
    isSpeaking: boolean;
    localVideoTrack: ICameraVideoTrack | null;
    remoteUser: IAgoraRTCRemoteUser | undefined;
}> = ({ participant, isLocal, isHost, isSpeaking, localVideoTrack, remoteUser }) => {
    const videoContainerRef = useRef<HTMLDivElement>(null);

    // Effect to play video tracks
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

    return (
        <div className="relative aspect-square bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center">
            {showVideo ? (
                <div ref={videoContainerRef} className={`w-full h-full ${isLocal ? 'transform scale-x-[-1]' : ''}`} />
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

// Main Component
const LiveVideoRoomScreen: React.FC<LiveVideoRoomScreenProps> = ({ currentUser, roomId, onGoBack, onSetTtsMessage }) => {
    const [room, setRoom] = useState<LiveVideoRoom | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [isMicAvailable, setIsMicAvailable] = useState(true);
    const [isCamAvailable, setIsCamAvailable] = useState(true);
    const [callDuration, setCallDuration] = useState(0);

    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const localVideoTrack = useRef<ICameraVideoTrack | null>(null);
    const [localVideoTrackState, setLocalVideoTrackState] = useState<ICameraVideoTrack | null>(null);
    const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

    const timerIntervalRef = useRef<number | null>(null);
    const { language } = useSettings();

    // Timer effect
    useEffect(() => {
        if (room?.status === 'live' && !timerIntervalRef.current) {
            timerIntervalRef.current = window.setInterval(() => {
                setCallDuration(d => d + 1);
            }, 1000);
        } else if (room?.status !== 'live' && timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [room?.status]);
    
    const handleHangUp = useCallback(() => {
        firebaseService.endLiveVideoRoom(currentUser.id, roomId);
        onGoBack();
    }, [roomId, currentUser.id, onGoBack]);

    // Agora Lifecycle
    useEffect(() => {
        let isMounted = true;
        const initializeAndJoin = async () => {
            try {
                if (!AGORA_APP_ID) {
                    onSetTtsMessage("Agora App ID is not configured. Real-time video will not work.");
                    console.error("Agora App ID is not configured in constants.ts");
                    throw new Error("Agora App ID not configured");
                }
                
                const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
                agoraClient.current = client;
    
                const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
                    await client.subscribe(user, mediaType);
                    if (mediaType === 'audio') user.audioTrack?.play();
                    if(isMounted) setRemoteUsers(Array.from(client.remoteUsers));
                };
        
                const handleUserUnpublished = (user: IAgoraRTCRemoteUser) => {
                    if(isMounted) setRemoteUsers(Array.from(client.remoteUsers));
                };
        
                const handleUserLeft = (user: IAgoraRTCRemoteUser) => {
                    if(isMounted) setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
                };
                
                const handleVolumeIndicator = (volumes: any[]) => {
                    if(!isMounted) return;
                    if (volumes.length === 0) { setActiveSpeakerId(null); return; }
                    const mainSpeaker = volumes.reduce((max, current) => current.level > max.level ? current : max, { level: -1 });
                    setActiveSpeakerId(mainSpeaker.level > 5 ? mainSpeaker.uid.toString() : null);
                };

                await geminiService.joinLiveVideoRoom(currentUser.id, roomId);
                if (!isMounted) return;
                
                client.on('user-published', handleUserPublished);
                client.on('user-unpublished', handleUserUnpublished);
                client.on('user-left', handleUserLeft);
                client.enableAudioVolumeIndicator();
                client.on('volume-indicator', handleVolumeIndicator);

                const token = await geminiService.getAgoraToken(roomId, currentUser.id);
                if (!isMounted || !token) throw new Error("Failed to retrieve Agora token.");
                
                await client.join(AGORA_APP_ID, roomId, token, currentUser.id);
                if (!isMounted) return;

                try {
                    const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
                    if (!isMounted) {
                        audioTrack.close();
                        videoTrack.close();
                        return;
                    }
                    localAudioTrack.current = audioTrack;
                    localVideoTrack.current = videoTrack;
                    setLocalVideoTrackState(videoTrack);
                    await client.publish([audioTrack, videoTrack]);
                } catch (mediaError) {
                     console.warn("Could not get local media tracks:", mediaError);
                     if(isMounted) {
                        onSetTtsMessage("Your microphone or camera is not available. You can listen only.");
                        setIsMicAvailable(false);
                        setIsCamAvailable(false);
                        setIsMuted(true);
                        setIsCameraOff(true);
                     }
                }
            } catch (error: any) {
                console.error("Agora failed to join or publish:", error);
                if(isMounted) {
                    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError' || error.code === 'DEVICE_NOT_FOUND') {
                        onSetTtsMessage("Could not find a microphone or camera. Please check your devices and permissions.");
                    } else if (error.name === 'NotAllowedError' || error.code === 'PERMISSION_DENIED') {
                        onSetTtsMessage("Microphone/camera access was denied. Please allow access in your browser settings.");
                    } else {
                        onSetTtsMessage(`Could not start the video room: ${error.message || 'Unknown error'}`);
                    }
                    onGoBack();
                }
            }
        };

        initializeAndJoin();

        return () => {
            isMounted = false;
            localAudioTrack.current?.stop();
            localAudioTrack.current?.close();
            localVideoTrack.current?.stop();
            localVideoTrack.current?.close();
            agoraClient.current?.leave();
            firebaseService.leaveLiveVideoRoom(currentUser.id, roomId);
        };
    }, [roomId, currentUser.id, onGoBack, onSetTtsMessage]);
    
    // Firestore real-time listener for Room Metadata
    useEffect(() => {
        setIsLoading(true);
        const unsubscribe = geminiService.listenToVideoRoom(roomId, (roomDetails) => {
            if (roomDetails) {
                setRoom(roomDetails);
                 if(roomDetails.status === 'ended') {
                     setTimeout(() => onGoBack(), 2000);
                 }
            } else {
                onGoBack();
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [roomId, onGoBack]);
    
    const toggleMute = () => {
        if (!isMicAvailable) return;
        const muted = !isMuted;
        localAudioTrack.current?.setMuted(muted);
        setIsMuted(muted);
    };

    const toggleCamera = () => {
        if (!isCamAvailable) return;
        const cameraOff = !isCameraOff;
        localVideoTrack.current?.setEnabled(!cameraOff);
        setIsCameraOff(cameraOff);
    };

    const remoteUsersMap = Object.fromEntries(remoteUsers.map(user => [user.uid.toString(), user]));
    
    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Loading Video Room...</div>;
    }

    const localParticipantState: VideoParticipantState = { ...currentUser, isMuted, isCameraOff };
    
    const allParticipants = [
      localParticipantState,
      ...room.participants.filter(p => p.id !== currentUser.id),
    ].sort((a, b) => {
        if (a.id === room.host.id) return -1;
        if (b.id === room.host.id) return 1;
        if (a.id === currentUser.id) return -1;
        if (b.id === currentUser.id) return 1;
        return a.name.localeCompare(b.name);
    });
    
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    return (
        <div className="h-full w-full flex flex-col bg-slate-900 text-white">
            <header className="flex-shrink-0 p-4 flex justify-between items-center bg-black/20">
                <div>
                    <h1 className="text-xl font-bold truncate">{room.topic}</h1>
                    <p className="text-sm text-slate-400">{room.status === 'live' ? formatDuration(callDuration) : 'Call Ended'}</p>
                </div>
                <button onClick={handleHangUp} className="bg-red-600 hover:bg-red-500 font-bold py-2 px-4 rounded-lg">
                    Leave
                </button>
            </header>

            <main className="flex-grow p-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 auto-rows-min overflow-y-auto">
                {allParticipants.map(p => (
                    <ParticipantVideo
                        key={p.id}
                        participant={p}
                        isLocal={p.id === currentUser.id}
                        isHost={p.id === room.host.id}
                        isSpeaking={p.id === activeSpeakerId}
                        localVideoTrack={localVideoTrackState}
                        remoteUser={remoteUsersMap[p.id]}
                    />
                ))}
            </main>

            <footer className="flex-shrink-0 p-4 bg-black/20 flex justify-center items-center h-24 gap-6">
                 <button onClick={toggleMute} disabled={!isMicAvailable} className={`p-4 rounded-full transition-colors ${!isMicAvailable ? 'bg-red-600/50 cursor-not-allowed' : isMuted ? 'bg-rose-600' : 'bg-slate-600 hover:bg-slate-500'}`}>
                    <Icon name={!isMicAvailable || isMuted ? 'microphone-slash' : 'mic'} className="w-6 h-6" />
                </button>
                 <button onClick={toggleCamera} disabled={!isCamAvailable} className={`p-4 rounded-full transition-colors ${!isCamAvailable ? 'bg-red-600/50 cursor-not-allowed' : isCameraOff ? 'bg-rose-600' : 'bg-slate-600 hover:bg-slate-500'}`}>
                    <Icon name={!isCamAvailable || isCameraOff ? 'video-camera-slash' : 'video-camera'} className="w-6 h-6" />
                </button>
                <button onClick={handleHangUp} className="p-4 rounded-full bg-red-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" transform="rotate(-135 12 12)"/></svg>
                </button>
            </footer>
        </div>
    );
};
export default LiveVideoRoomScreen;