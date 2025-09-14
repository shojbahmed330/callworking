import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Message, ReplyInfo } from '../types';
import { firebaseService } from '../services/firebaseService';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import Waveform from './Waveform';

interface ChatWidgetProps {
  currentUser: User;
  peerUser: User;
  onClose: (peerId: string) => void;
  onMinimize: (peerId: string) => void;
  onHeaderClick: (peerId: string) => void;
  isMinimized: boolean;
  unreadCount: number;
  // FIX: Add setIsChatRecording to props to manage global recording state.
  setIsChatRecording: (isRecording: boolean) => void;
}

enum RecordingState { IDLE, RECORDING, PREVIEW }
const EMOJI_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

const ChatWidget: React.FC<ChatWidgetProps> = ({ currentUser, peerUser, onClose, onMinimize, onHeaderClick, isMinimized, unreadCount, setIsChatRecording }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  
  const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
  const [audioPreview, setAudioPreview] = useState<{ url: string, blob: Blob, duration: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const chatId = firebaseService.getChatId(currentUser.id, peerUser.id);

  // FIX: Add useEffect to update the global chat recording state.
  useEffect(() => {
    setIsChatRecording(recordingState === RecordingState.RECORDING);

    // When component unmounts (chat is closed), ensure recording state is reset globally.
    return () => {
      setIsChatRecording(false);
    }
  }, [recordingState, setIsChatRecording]);

  useEffect(() => {
    const unsubscribe = firebaseService.listenToMessages(chatId, setMessages);
    return () => unsubscribe();
  }, [chatId]);

  useEffect(() => {
    if (!isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      firebaseService.markMessagesAsRead(chatId, currentUser.id);
    }
  }, [messages, isMinimized, chatId, currentUser.id]);
  
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() && !audioPreview) return;
    
    const replyToInfo = replyingTo ? geminiService.createReplySnippet(replyingTo) : undefined;
    
    let messageContent: any = { type: 'text', text: newMessage.trim(), replyTo: replyToInfo };

    if (audioPreview) {
        messageContent = { 
            type: 'audio', 
            audioBlob: audioPreview.blob, 
            duration: audioPreview.duration, 
            replyTo: replyToInfo 
        };
    }

    await firebaseService.sendMessage(chatId, currentUser, peerUser, messageContent);
    setNewMessage('');
    setReplyingTo(null);
    setAudioPreview(null);
    setRecordingState(RecordingState.IDLE);
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const replyToInfo = replyingTo ? geminiService.createReplySnippet(replyingTo) : undefined;
      const type = file.type.startsWith('video') ? 'video' : 'image';
      
      await firebaseService.sendMessage(chatId, currentUser, peerUser, { type, mediaFile: file, replyTo: replyToInfo });
      setReplyingTo(null);
      
      e.target.value = ''; // Reset file input
  }

  const handleStartRecording = async () => {
    if (recordingState !== RecordingState.IDLE) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];
        
        mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
        
        mediaRecorderRef.current.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const url = URL.createObjectURL(audioBlob);
            // FIX: Removed erroneous clearInterval call. timerRef holds a timestamp, not an interval ID.
            const duration = Math.round((Date.now() - (timerRef.current || Date.now())) / 1000);
            setAudioPreview({ url, blob: audioBlob, duration });
            setRecordingState(RecordingState.PREVIEW);
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorderRef.current.start();
        setRecordingState(RecordingState.RECORDING);
        timerRef.current = Date.now();
    } catch (err) {
        console.error("Mic permission error:", err);
    }
  };

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop();
  };
  
  const handleCancelRecording = () => {
      if (audioPreview) URL.revokeObjectURL(audioPreview.url);
      setAudioPreview(null);
      setRecordingState(RecordingState.IDLE);
  };

  const handleReact = (messageId: string, emoji: string) => {
    firebaseService.reactToMessage(chatId, messageId, currentUser.id, emoji);
  };

  const handleUnsend = (messageId: string) => {
    if (window.confirm("Are you sure you want to unsend this message?")) {
        firebaseService.unsendMessage(chatId, messageId, currentUser.id);
    }
  };

  if (isMinimized) {
    return (
      <button onClick={() => onHeaderClick(peerUser.id)} className="w-60 h-12 bg-slate-800 border-t-2 border-lime-500/50 rounded-t-lg flex items-center px-3 gap-2 shadow-lg hover:bg-slate-700">
        <div className="relative">
          <img src={peerUser.avatarUrl} alt={peerUser.name} className="w-8 h-8 rounded-full" />
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-slate-800 ${peerUser.onlineStatus === 'online' ? 'bg-green-500' : 'bg-slate-500'}`}/>
        </div>
        <span className="text-white font-semibold truncate flex-grow text-left">{peerUser.name}</span>
        {unreadCount > 0 && <span className="bg-rose-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{unreadCount}</span>}
        <button onClick={(e) => { e.stopPropagation(); onClose(peerUser.id); }} className="p-1 rounded-full hover:bg-slate-600 text-slate-400">
          <Icon name="close" className="w-4 h-4" />
        </button>
      </button>
    );
  }

  return (
    <div className="w-80 h-[450px] bg-[#242526] rounded-t-lg flex flex-col shadow-2xl border border-b-0 border-slate-700 font-sans">
      <header className="flex-shrink-0 flex items-center justify-between p-2 bg-[#242526] rounded-t-lg border-b border-slate-700">
        <button onClick={() => onHeaderClick(peerUser.id)} className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-700/50">
          <div className="relative">
            <img src={peerUser.avatarUrl} alt={peerUser.name} className="w-8 h-8 rounded-full" />
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-slate-700 ${peerUser.onlineStatus === 'online' ? 'bg-green-500' : 'bg-slate-500'}`}/>
          </div>
          <span className="text-white font-semibold">{peerUser.name}</span>
        </button>
        <div className="flex items-center text-rose-400">
          <button className="p-2 rounded-full hover:bg-slate-700/50"><Icon name="phone" className="w-5 h-5"/></button>
          <button className="p-2 rounded-full hover:bg-slate-700/50"><Icon name="video-camera" className="w-5 h-5"/></button>
          <button onClick={(e) => { e.stopPropagation(); onMinimize(peerUser.id); }} className="p-2 rounded-full hover:bg-slate-700/50">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onClose(peerUser.id); }} className="p-2 rounded-full hover:bg-slate-700/50">
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>
      </header>
      <main className="flex-grow overflow-y-auto p-3 space-y-1">
        {/* Messages */}
        <div ref={messagesEndRef} />
      </main>
      <footer className="p-2 border-t border-slate-700">
        {replyingTo && (
            <div className="text-xs text-slate-400 px-2 pb-1 flex justify-between items-center bg-slate-700/50 rounded-t-md -mx-2 -mt-2 mb-2 p-2">
                <span>Replying to {replyingTo.senderId === currentUser.id ? 'yourself' : peerUser.name}</span>
                <button onClick={() => setReplyingTo(null)} className="font-bold">
                    <Icon name="close" className="w-4 h-4" />
                </button>
            </div>
        )}
        <div className="flex items-center gap-2">
          <input type="file" ref={mediaInputRef} onChange={handleFileChange} accept="image/*,video/*" className="hidden"/>
          <button onClick={() => mediaInputRef.current?.click()} className="p-2 rounded-full text-rose-400 hover:bg-slate-700/50"><Icon name="add-circle" className="w-6 h-6"/></button>
          {newMessage.trim() === '' && !audioPreview ? (
              <button onClick={handleStartRecording} className="p-2 rounded-full text-rose-400 hover:bg-slate-700/50"><Icon name="mic" className="w-6 h-6"/></button>
          ) : null}
          <div className="flex-grow">
            {recordingState === RecordingState.RECORDING ? (
                 <div className="bg-slate-700 rounded-full h-10 flex items-center px-4 justify-between">
                    <div className="w-1/2 h-full"><Waveform isPlaying={true} isRecording /></div>
                    <button onClick={handleStopRecording} className="bg-rose-500 rounded-full p-2"><Icon name="pause" className="w-4 h-4 text-white"/></button>
                </div>
            ) : audioPreview ? (
                <div className="bg-slate-700 rounded-full h-10 flex items-center px-4 justify-between">
                    <p className="text-sm text-slate-300">Voice message ({audioPreview.duration}s)</p>
                    <button onClick={handleCancelRecording} className="p-1"><Icon name="close" className="w-4 h-4 text-slate-400"/></button>
                </div>
            ) : (
                <div className="relative">
                    <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) handleSendMessage(e); }} placeholder="Aa" rows={1} className="w-full bg-slate-700 text-slate-100 rounded-full py-2 px-4 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm resize-none pr-10"/>
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-400"><Icon name="face-smile" className="w-5 h-5"/></button>
                </div>
            )}
          </div>
          <button type="button" onClick={() => handleSendMessage()} className="p-2 rounded-full text-rose-400 hover:bg-slate-700/50" disabled={!newMessage.trim() && !audioPreview}>
            <Icon name="paper-airplane" className="w-6 h-6" />
          </button>
        </div>
      </footer>
    </div>
  );
};
export default ChatWidget;