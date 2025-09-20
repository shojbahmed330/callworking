import React, { useState, useEffect, useRef } from 'react';
import { User, Call } from '../types';
import Icon from './Icon';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import { AGORA_APP_ID } from '../constants';
import { firebaseService } from '../services/firebaseService';

interface CallScreenProps {
  currentUser: User;
  peerUser: User;
  callId: string;
  isCaller: boolean;
  onEndCall: () => void;
}

type VideoLayout = 'speaker' | 'grid';

const CallScreen: React.FC<CallScreenProps> = ({ currentUser, peerUser, callId, isCaller, onEndCall }) => {
    const [call, setCall] = useState<Call | null>(null);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [remoteUser, setRemoteUser] = useState<IAgoraRTCRemoteUser | null>(null);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [videoLayout, setVideoLayout] = useState<VideoLayout>('speaker');
    const [isPip, setIsPip] = useState(false);

    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const localVideoTrack = useRef<ICameraVideoTrack | null>(null);
    const localVideoRef = useRef<HTMLDivElement>(null);
    const remoteVideoRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // Firestore listener for call status changes (e.g., peer ending the call)
        const unsubCall = firebaseService.listenToCall(callId, (liveCall) => {
            setCall(liveCall);
            if (liveCall?.status === 'ended' || liveCall?.status === 'declined' || liveCall?.status === 'missed') {
                onEndCall();
            }
        });

        return () => unsubCall();
    }, [callId, onEndCall]);
    
    useEffect(() => {
        if (call?.status === 'connected') {
            timerRef.current = setInterval(() => {
                setDuration(d => d + 1);
            }, 1000);
        }
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                firebaseService.updateCallDuration(callId, duration);
            }
        };
    }, [call?.status, callId, duration]);


    useEffect(() => {
        const initAgora = async () => {
            if (!AGORA_APP_ID) {
                console.error("Agora App ID is missing!");
                onEndCall();
                return;
            }

            const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
            agoraClient.current = client;

            client.on('user-published', async (user, mediaType) => {
                await client.subscribe(user, mediaType);
                setRemoteUser(user);
                if (mediaType === 'video' && remoteVideoRef.current) {
                    user.videoTrack?.play(remoteVideoRef.current);
                }
                if (mediaType === 'audio') {
                    user.audioTrack?.play();
                }
            });

            client.on('user-left', () => {
                setRemoteUser(null);
                onEndCall();
            });
            
            client.on('connection-state-change', (curState, prevState) => {
                if (curState === 'RECONNECTING') {
                    setIsReconnecting(true);
                } else if (curState === 'CONNECTED') {
                    setIsReconnecting(false);
                }
            });

            const token = await firebaseService.getAgoraToken(callId, currentUser.id);
            await client.join(AGORA_APP_ID, callId, token, currentUser.id);

            const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
            localAudioTrack.current = audioTrack;
            if (call?.type === 'video') {
                localVideoTrack.current = videoTrack;
                 if (localVideoRef.current) {
                    videoTrack.play(localVideoRef.current);
                }
            }
            await client.publish([audioTrack, videoTrack]);
        };

        initAgora();

        return () => {
            agoraClient.current?.leave();
            localAudioTrack.current?.close();
            localVideoTrack.current?.close();
        };
    }, [callId, currentUser.id, call?.type, onEndCall]);


    const handleEndCall = () => {
        firebaseService.updateCallStatus(callId, 'ended');
        onEndCall();
    };

    const toggleMute = () => {
        const muted = !isMuted;
        localAudioTrack.current?.setMuted(muted);
        setIsMuted(muted);
    };

    const toggleCamera = () => {
        const cameraOff = !isCameraOff;
        localVideoTrack.current?.setEnabled(!cameraOff);
        setIsCameraOff(cameraOff);
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    const getStatusText = () => {
        if (isReconnecting) return "Reconnecting...";
        if (call?.status === 'connected') return formatDuration(duration);
        if (isCaller && call?.status === 'ringing') return "Ringing...";
        if (isCaller && call?.status === 'dialing') return "Dialing...";
        return "Connecting...";
    };

    const renderVideoFeeds = () => {
        if (call?.type !== 'video') return null;

        const remoteView = (
            <div className="w-full h-full bg-slate-700 rounded-lg overflow-hidden relative">
                <div ref={remoteVideoRef} className="w-full h-full" />
                {!remoteUser?.hasVideo && <div className="absolute inset-0 flex items-center justify-center"><img src={peerUser.avatarUrl} className="w-24 h-24 rounded-full" alt="" /></div>}
            </div>
        );

        const localView = (
             <div className="w-full h-full bg-slate-700 rounded-lg overflow-hidden relative">
                <div ref={localVideoRef} className="w-full h-full transform scale-x-[-1]" />
                {isCameraOff && <div className="absolute inset-0 flex items-center justify-center bg-slate-800"><Icon name="video-camera-slash" className="w-12 h-12 text-slate-500" /></div>}
            </div>
        );
        
        if (isPip) {
             return (
                <div className="absolute top-4 right-4 w-32 h-48 rounded-lg shadow-lg z-10" draggable>
                   {localView}
                </div>
            )
        }

        if (videoLayout === 'grid') {
            return (
                 <div className="grid grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1 gap-4 w-full h-full">
                    {localView}
                    {remoteUser ? remoteView : <div className="w-full h-full bg-slate-700 rounded-lg flex items-center justify-center"><p>Waiting for {peerUser.name}...</p></div>}
                </div>
            )
        }

        // Speaker view
        return (
            <>
                <div className="absolute inset-0 w-full h-full">{remoteUser ? remoteView : <div className="w-full h-full bg-slate-900 flex items-center justify-center"><p className="text-xl">Waiting for {peerUser.name}...</p></div>}</div>
                <div className="absolute bottom-24 sm:bottom-32 right-4 w-32 h-48 rounded-lg shadow-lg z-10">
                    {localView}
                </div>
            </>
        )
    };


    return (
        <div className="fixed inset-0 bg-slate-900 z-[90] flex flex-col items-center justify-between text-white animate-fade-in-fast">
            {isReconnecting && <div className="absolute top-0 left-0 right-0 p-2 bg-yellow-600 text-center text-black font-semibold">Reconnecting...</div>}
            
            <div className="text-center pt-16">
                <h2 className="text-3xl font-bold">{peerUser.name}</h2>
                <p className="text-slate-400 text-lg mt-2">{getStatusText()}</p>
            </div>
            
            <div className="relative w-full flex-grow flex items-center justify-center p-4">
                {call?.type === 'audio' && (
                    <div className="flex flex-col items-center gap-4">
                        <img src={peerUser.avatarUrl} alt={peerUser.name} className="w-40 h-40 rounded-full border-4 border-slate-700" />
                    </div>
                )}
                {renderVideoFeeds()}
            </div>
            
             <div className="w-full flex items-center justify-center gap-4 p-6 bg-black/30 backdrop-blur-sm z-20">
                {call?.type === 'video' && (
                     <>
                        <button onClick={() => setVideoLayout(l => l === 'grid' ? 'speaker' : 'grid')} className="p-4 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                            <Icon name={videoLayout === 'grid' ? 'users' : 'user-slash'} className="w-6 h-6"/>
                        </button>
                        <button onClick={() => setIsPip(p => !p)} className="p-4 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                            <Icon name="photo" className="w-6 h-6"/>
                        </button>
                    </>
                )}
                <button onClick={toggleMute} className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-rose-600' : 'bg-white/10 hover:bg-white/20'}`}>
                    <Icon name={isMuted ? 'microphone-slash' : 'mic'} className="w-6 h-6" />
                </button>
                {call?.type === 'video' && (
                    <button onClick={toggleCamera} className={`p-4 rounded-full transition-colors ${isCameraOff ? 'bg-rose-600' : 'bg-white/10 hover:bg-white/20'}`}>
                        <Icon name={isCameraOff ? 'video-camera-slash' : 'video-camera'} className="w-6 h-6" />
                    </button>
                )}
                <button onClick={handleEndCall} className="p-4 rounded-full bg-red-600 hover:bg-red-500 transition-colors">
                    <Icon name="phone" className="w-6 h-6 transform rotate-[135deg]" />
                </button>
            </div>
        </div>
    );
};

export default CallScreen;