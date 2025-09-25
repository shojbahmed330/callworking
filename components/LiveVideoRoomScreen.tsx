import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LiveVideoRoom, User, VideoParticipantState } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import LiveChatDisplay, { LiveChatMessage } from './LiveChatDisplay';
import { getTtsPrompt, AGORA_APP_ID } from '../constants';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack, ICameraVideoTrack } from 'agora-rtc-sdk-ng';
import { useSettings } from '../contexts/SettingsContext';
import { useMediaQuery } from '../hooks/useMediaQuery';

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
}> = ({
  participant,
  isLocal,
  isHost,
  isSpeaking,
  localVideoTrack,
  remoteUser,
  isFullScreen = false,
}) => {
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
    };
  }, [isLocal, localVideoTrack, remoteUser, participant.isCameraOff]);

  const showVideo =
    (isLocal && localVideoTrack && !participant.isCameraOff) ||
    (remoteUser?.hasVideo && !participant.isCameraOff);
  const containerClasses = `relative bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center ${
    isFullScreen ? 'w-full h-full' : 'aspect-square'
  }`;

  return (
    <div className={containerClasses}>
      {showVideo ? (
        <div
          ref={videoContainerRef}
          className={`w-full h-full object-cover ${
            isLocal ? 'transform scale-x-[-1]' : ''
          }`}
        />
      ) : (
        <>
          <img
            src={participant.avatarUrl}
            alt={participant.name}
            className="w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src={participant.avatarUrl}
              alt={participant.name}
              className="w-20 h-20 rounded-full"
            />
          </div>
        </>
      )}
      {(participant.isCameraOff || (!isLocal && !remoteUser?.hasVideo)) && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <Icon name="video-camera-slash" className="w-10 h-10 text-slate-400" />
        </div>
      )}
      <div
        className={`absolute inset-0 border-4 rounded-lg pointer-events-none transition-colors ${
          isSpeaking ? 'border-green-400' : 'border-transparent'
        }`}
      />
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

const LiveVideoRoomScreen: React.FC<LiveVideoRoomScreenProps> = ({
  currentUser,
  roomId,
  onGoBack,
  onSetTtsMessage,
}) => {
  const [room, setRoom] = useState<LiveVideoRoom | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

  const agoraClient = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrack = useRef<ICameraVideoTrack | null>(null);
  const [localVideoTrackState, setLocalVideoTrackState] =
    useState<ICameraVideoTrack | null>(null);
  const { language } = useSettings();

  const onGoBackRef = useRef(onGoBack);
  const onSetTtsMessageRef = useRef(onSetTtsMessage);

  useEffect(() => {
    onGoBackRef.current = onGoBack;
    onSetTtsMessageRef.current = onSetTtsMessage;
  });

  const [messages, setMessages] = useState<LiveChatMessage[]>([
    {
      id: '1',
      author: {
        id: 'a',
        name: 'Alice',
        avatarUrl: 'https://i.pravatar.cc/150?u=alice',
      },
      text: 'Hello everyone! This is amazing!',
    },
    {
      id: '2',
      author: {
        id: 'b',
        name: 'Bob',
        avatarUrl: 'https://i.pravatar.cc/150?u=bob',
      },
      text: 'Hey Alice! Great to see you live. Looking sharp!',
    },
  ]);

  useEffect(() => {
    if (!AGORA_APP_ID) {
      onSetTtsMessageRef.current(
        'Agora App ID is not configured. Real-time video will not work.'
      );
      console.error('Agora App ID is not configured in constants.ts');
      onGoBackRef.current();
      return;
    }
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    agoraClient.current = client;
    const handleUserPublished = async (
      user: IAgoraRTCRemoteUser,
      mediaType: 'audio' | 'video'
    ) => {
      await client.subscribe(user, mediaType);
      if (mediaType === 'audio') user.audioTrack?.play();
      setRemoteUsers(Array.from(client.remoteUsers));
    };
    const handleUserUnpublished = (user: IAgoraRTCRemoteUser) =>
      setRemoteUsers(Array.from(client.remoteUsers));
    const handleUserLeft = (user: IAgoraRTCRemoteUser) =>
      setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
    const handleVolumeIndicator = (volumes: any[]) => {
      if (volumes.length === 0) {
        setActiveSpeakerId(null);
        return;
      }
      const mainSpeaker = volumes.reduce((max, current) =>
        current.level > max.level ? current : max
      );
      if (mainSpeaker.level > 5)
        setActiveSpeakerId(mainSpeaker.uid.toString());
      else setActiveSpeakerId(null);
    };

    // ✅ joinAndPublish with UID fallback
    const joinAndPublish = async () => {
      try {
        client.on('user-published', handleUserPublished);
        client.on('user-unpublished', handleUserUnpublished);
        client.on('user-left', handleUserLeft);
        client.enableAudioVolumeIndicator();
        client.on('volume-indicator', handleVolumeIndicator);

        // ✅ UID fallback (currentUser.id না থাকলে random uid)
        let uid: number;
        if (currentUser?.id) {
          uid = parseInt(currentUser.id, 36) % 10000000;
        } else {
          uid = Math.floor(Math.random() * 10000000);
        }
        console.log('🔹 UID sending to token server:', uid);

        const token = await geminiService.getAgoraToken(roomId, uid);
        if (!token)
          throw new Error(
            'Failed to retrieve Agora token. The video call cannot proceed.'
          );

        await client.join(AGORA_APP_ID, roomId, token, uid);

        try {
          const [audioTrack, videoTrack] =
            await AgoraRTC.createMicrophoneAndCameraTracks();
          localAudioTrack.current = audioTrack;
          localVideoTrack.current = videoTrack;
          setLocalVideoTrackState(videoTrack);
          await client.publish([audioTrack, videoTrack]);
        } catch (publishError: any) {
          console.error(
            'Could not get or publish media tracks:',
            publishError
          );
          onSetTtsMessageRef.current(
            'Could not find camera/mic. You are in viewer mode.'
          );
        }
      } catch (error: any) {
        console.error('Agora failed to join room:', error);
        onSetTtsMessageRef.current(
          `Could not join the video room: ${error.message || 'Unknown error'}`
        );
        onGoBackRef.current();
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
  }, [roomId, currentUser.id, language]);

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = geminiService.listenToVideoRoom(
      roomId,
      (roomDetails) => {
        if (roomDetails) setRoom(roomDetails);
        else onGoBackRef.current();
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [roomId]);

  useEffect(() => {
    const botResponses = [
      'Wow, cool!',
      'Loving this stream!',
      '🔥🔥🔥',
      'Can you do a shout out?',
      'Where are you from?',
      'This is my first time here, looks great!',
    ];
    let messageIndex = 0;
    const intervalId = setInterval(() => {
      const botMessage: LiveChatMessage = {
        id: new Date().toISOString() + '-bot',
        author: {
          id: `bot-${messageIndex}`,
          name: 'BotUser',
          avatarUrl: `https://i.pravatar.cc/150?u=bot${messageIndex}`,
        },
        text: botResponses[messageIndex % botResponses.length],
      };
      setMessages((prev) => [...prev, botMessage]);
      messageIndex++;
    }, 8000);
    return () => clearInterval(intervalId);
  }, []);

  const toggleMute = () => {
    if (!localAudioTrack.current) return;
    const muted = !isMuted;
    localAudioTrack.current.setMuted(muted);
    setIsMuted(muted);
  };

  const toggleCamera = () => {
    if (!localVideoTrack.current) return;
    const cameraOff = !isCameraOff;
    localVideoTrack.current.setEnabled(!cameraOff);
    setIsCameraOff(cameraOff);
  };

  const handleSendMessage = (text: string) => {
    const newMessage: LiveChatMessage = {
      id: new Date().toISOString(),
      author: {
        id: currentUser.id,
        name: currentUser.name,
        avatarUrl: currentUser.avatarUrl,
      },
      text,
    };
    setMessages((prevMessages) => [...prevMessages, newMessage]);
  };

  const remoteUsersMap = useMemo(() => {
    const map: Record<string, IAgoraRTCRemoteUser> = {};
    remoteUsers.forEach((user) => {
      map[user.uid.toString()] = user;
    });
    return map;
  }, [remoteUsers]);

  if (isLoading || !room) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">
        Loading Video Room...
      </div>
    );
  }

  const allParticipants = [
    ...room.participants,
    { ...currentUser, isMuted, isCameraOff },
  ];
  const participantsMap = new Map<string, VideoParticipantState>();
  allParticipants.forEach((p) => {
    const integerUid = (parseInt(p.id, 36) % 10000000).toString();
    participantsMap.set(p.id, {
      ...p,
      isMuted: remoteUsersMap[integerUid]?.audioTrack ? p.isMuted : true,
      isCameraOff: remoteUsersMap[integerUid]?.videoTrack
        ? p.isCameraOff
        : true,
    });
  });
  participantsMap.set(currentUser.id, { ...currentUser, isMuted, isCameraOff });

  const participantsWithLocal = Array.from(participantsMap.values()).sort(
    (a, b) => {
      if (a.id === room.host.id) return -1;
      if (b.id === room.host.id) return 1;
      if (a.id === currentUser.id) return -1;
      if (b.id === currentUser.id) return 1;
      return a.name.localeCompare(b.name);
    }
  );

  const host = participantsWithLocal.find((p) => p.id === room.host.id);
  const otherParticipants = participantsWithLocal.filter(
    (p) => p.id !== room.host.id
  );
  const isMobile = useMediaQuery('(max-width: 768px)');

  const layoutProps = {
    room,
    host,
    otherParticipants,
    participantsWithLocal,
    currentUser,
    isMuted,
    isCameraOff,
    activeSpeakerId,
    localVideoTrackState,
    remoteUsersMap,
    messages,
    handleSendMessage,
    toggleMute,
    toggleCamera,
    onGoBack,
  };

  return (
    <div className="h-full w-full relative bg-black text-white overflow-hidden">
      {host && (
        <div className="absolute inset-0 z-0">
          <ParticipantVideo
            key={host.id}
            participant={host}
            isLocal={host.id === currentUser.id}
            isHost={true}
            isSpeaking={host.id === activeSpeakerId}
            localVideoTrack={localVideoTrackState}
            remoteUser={
              remoteUsersMap[
                (parseInt(host.id, 36) % 10000000).toString()
              ]
            }
            isFullScreen={true}
          />
        </div>
      )}
      {isMobile ? <MobileLayout {...layoutProps} /> : <DesktopLayout {...layoutProps} />}
    </div>
  );
};

// বাকি DesktopLayout আর MobileLayout আগের মতোই থাকবে…

// ... (DesktopLayout এবং MobileLayout একই থাকবে)

export default LiveVideoRoomScreen;
