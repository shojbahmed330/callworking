import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, Post, RecordingState } from '../types';
import { IMAGE_GENERATION_COST, getTtsPrompt } from '../constants';
import Icon from './Icon';
import { geminiService } from '../services/geminiService';
import { firebaseService } from '../services/firebaseService';
import { useSettings } from '../contexts/SettingsContext';
import ImageCropper from './ImageCropper';
import Waveform from './Waveform';

interface CreatePostScreenProps {
  currentUser: User;
  onPostCreated: (newPost: Post | null) => void;
  onSetTtsMessage: (message: string) => void;
  lastCommand: string | null;
  onDeductCoinsForImage: () => Promise<boolean>;
  onCommandProcessed: () => void;
  onGoBack: () => void;
  groupId?: string;
  groupName?: string;
  startRecording?: boolean;
}

const FEELINGS = [
    { emoji: '😄', text: 'happy' }, { emoji: '😇', text: 'blessed' }, { emoji: '🥰', text: 'loved' },
    { emoji: '😢', text: 'sad' }, { emoji: '😠', text: 'angry' }, { emoji: '🤔', text: 'thinking' },
    { emoji: '🤪', text: 'crazy' }, { emoji: '🥳', text: 'celebrating' }, { emoji: '😎', text: 'cool' },
    { emoji: '😴', text: 'tired' }, { emoji: '🤩', text: 'excited' }, { emoji: '🙏', text: 'thankful' }
];

const EMOJI_PICKER_LIST = [
  '😀', '😂', '😍', '❤️', '👍', '🙏', '😭', '😮', '🤔', '🥳', '😎', '😢', '😠', '🎉', '🔥'
];

type SubView = 'main' | 'feelings';
type Feeling = { emoji: string; text: string };

const dataURLtoFile = (dataurl: string, filename: string): File | null => {
    const arr = dataurl.split(',');
    if (arr.length < 2) { return null; }
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) { return null; }
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
}

const CreatePostScreen: React.FC<CreatePostScreenProps> = ({ currentUser, onPostCreated, onSetTtsMessage, lastCommand, onDeductCoinsForImage, onCommandProcessed, onGoBack, groupId, groupName, startRecording }) => {
    const [caption, setCaption] = useState('');
    const [feeling, setFeeling] = useState<Feeling | null>(null);
    const [subView, setSubView] = useState<SubView>('main');
    const [isPosting, setIsPosting] = useState(false);
    const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);
    
    // Voice Recording State
    const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
    const [duration, setDuration] = useState(0);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [imageToCrop, setImageToCrop] = useState<string | null>(null);
    const [uploadedImageFile, setUploadedImageFile] = useState<File | null>(null);
    const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
    const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
    const [editPrompt, setEditPrompt] = useState('');
    const [isEditingImage, setIsEditingImage] = useState(false);

    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { language } = useSettings();
    
    const stopTimer = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const startTimer = useCallback(() => {
        stopTimer();
        setDuration(0);
        timerRef.current = setInterval(() => {
            setDuration(d => d + 1);
        }, 1000);
    }, [stopTimer]);
    
    const clearOtherContent = (except: 'voice' | 'image' | 'none') => {
        if (except !== 'voice') {
            setRecordingState(RecordingState.IDLE);
            if (audioUrl) URL.revokeObjectURL(audioUrl);
            setAudioUrl(null);
            stopTimer();
            setDuration(0);
        }
        if (except !== 'image') {
            setUploadedImageFile(null);
            if (uploadedImagePreview) URL.revokeObjectURL(uploadedImagePreview);
            setUploadedImagePreview(null);
            setEditedImageUrl(null);
            setEditPrompt('');
            setImageToCrop(null);
        }
    };
    
    const handleStartRecording = useCallback(async () => {
        if (recordingState === RecordingState.RECORDING) return;
        clearOtherContent('voice');
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            setAudioUrl(null);
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            recorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);
            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const newAudioUrl = URL.createObjectURL(audioBlob);
                setAudioUrl(newAudioUrl);
                stream.getTracks().forEach(track => track.stop());
                onSetTtsMessage(getTtsPrompt('record_stopped', language, { duration }));
            };
            recorder.start();
            setRecordingState(RecordingState.RECORDING);
            onSetTtsMessage(getTtsPrompt('record_start', language));
            startTimer();
        } catch (err) {
            console.error("Mic error:", err);
            onSetTtsMessage(getTtsPrompt('error_mic_permission', language));
        }
    }, [audioUrl, duration, language, onSetTtsMessage, recordingState, startTimer]);

    const handleStopRecording = useCallback(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            stopTimer();
            setRecordingState(RecordingState.PREVIEW);
        }
    }, [stopTimer]);

    useEffect(() => {
        if (startRecording) {
            handleStartRecording();
        } else {
            onSetTtsMessage(`What's on your mind, ${currentUser.name.split(' ')[0]}?`);
        }
    }, [startRecording, currentUser.name, onSetTtsMessage, handleStartRecording]);

    useEffect(() => {
        return () => {
            stopTimer();
            if (audioUrl) URL.revokeObjectURL(audioUrl);
            if (uploadedImagePreview) URL.revokeObjectURL(uploadedImagePreview);
            mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop());
        }
    }, [stopTimer, audioUrl, uploadedImagePreview]);


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setEmojiPickerOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => {
                clearOtherContent('image');
                setImageToCrop(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    };

    const handleSaveCrop = (croppedImageBase64: string) => {
        setUploadedImagePreview(croppedImageBase64);
        const croppedFile = dataURLtoFile(croppedImageBase64, 'cropped_image.jpeg');
        if (croppedFile) {
            setUploadedImageFile(croppedFile);
        }
        setEditedImageUrl(null);
        setEditPrompt('');
        setImageToCrop(null);
    };

    const handleCancelCrop = () => {
        setImageToCrop(null);
    };

    const handleEditImage = useCallback(async () => {
        if (!editPrompt.trim() || !uploadedImagePreview || isEditingImage) return;
        if ((currentUser.voiceCoins || 0) < IMAGE_GENERATION_COST) {
            onSetTtsMessage(getTtsPrompt('image_generation_insufficient_coins', language, { cost: IMAGE_GENERATION_COST, balance: currentUser.voiceCoins || 0 }));
            return;
        }
        const paymentSuccess = await onDeductCoinsForImage();
        if (!paymentSuccess) return;
        setIsEditingImage(true);
        onSetTtsMessage("Editing your image with AI...");
        const base64Data = uploadedImagePreview.split(',')[1];
        const mimeType = uploadedImageFile?.type || 'image/jpeg';
        const resultUrl = await geminiService.editImage(base64Data, mimeType, editPrompt);
        setIsEditingImage(false);
        if (resultUrl) {
            setEditedImageUrl(resultUrl);
            onSetTtsMessage("Image edited successfully!");
        } else {
            onSetTtsMessage("Sorry, the AI couldn't edit the image. Please try a different prompt.");
        }
    }, [editPrompt, uploadedImagePreview, uploadedImageFile, isEditingImage, currentUser.voiceCoins, onDeductCoinsForImage, onSetTtsMessage, language]);

    const handlePost = useCallback(async () => {
        const hasAudio = recordingState === RecordingState.PREVIEW && audioUrl;
        const hasImage = uploadedImagePreview || editedImageUrl;
        const hasContent = caption.trim() || hasAudio || hasImage || feeling;

        if (isPosting || !hasContent) {
            onSetTtsMessage("Please add some content before posting.");
            return;
        }
        
        setIsPosting(true);
        onSetTtsMessage("Publishing your post...");

        try {
            const postBaseData: any = {
                author: currentUser,
                caption: caption,
                status: groupId ? 'pending' : 'approved',
                feeling: feeling,
                imagePrompt: editedImageUrl ? editPrompt : undefined,
                groupId,
                groupName,
                duration: hasAudio ? duration : 0,
            };
            
            await firebaseService.createPost(
                postBaseData, 
                { 
                    mediaFile: editedImageUrl ? null : uploadedImageFile,
                    generatedImageBase64: editedImageUrl ? editedImageUrl : null,
                    audioBlobUrl: hasAudio ? audioUrl : null
                }
            );

            if (postBaseData.status === 'pending') {
                onSetTtsMessage(getTtsPrompt('post_pending_approval', language));
                setTimeout(() => onGoBack(), 1500); 
            } else {
                onPostCreated(null);
            }
        } catch (error: any) {
            console.error("Failed to create post:", error);
            onSetTtsMessage(`Failed to create post: ${error.message}`);
            setIsPosting(false);
        }
    }, [isPosting, caption, currentUser, onSetTtsMessage, onPostCreated, onGoBack, uploadedImagePreview, uploadedImageFile, editedImageUrl, editPrompt, groupId, groupName, feeling, language, recordingState, audioUrl, duration]);

    const handleFeelingSelect = (selected: Feeling) => {
        setFeeling(selected);
        setSubView('main');
    };
    
    const renderRecordingControls = () => (
        <div className="border-y border-slate-700 py-4 space-y-4">
            {recordingState === RecordingState.RECORDING && (
                 <div className="flex flex-col items-center gap-2">
                     <p className="text-sm text-slate-400">Recording...</p>
                     <div className="w-full h-16"><Waveform isPlaying isRecording/></div>
                     <p className="font-mono text-xl">{new Date(duration * 1000).toISOString().substr(14, 5)}</p>
                     <button onClick={handleStopRecording} className="p-3 bg-rose-600 rounded-full"><Icon name="pause" className="w-6 h-6"/></button>
                 </div>
            )}
            {recordingState === RecordingState.PREVIEW && audioUrl && (
                <div className="space-y-3">
                    <audio src={audioUrl} controls className="w-full" />
                    <div className="flex justify-center gap-4">
                        <button onClick={handleStartRecording} className="text-sm font-semibold text-slate-300 hover:text-white">Re-record</button>
                    </div>
                </div>
            )}
        </div>
    );

    const renderMainView = () => (
        <div className={`w-full ${uploadedImagePreview ? 'max-w-3xl' : 'max-w-lg'} bg-slate-800 rounded-lg shadow-2xl flex flex-col max-h-[90vh]`}>
            <header className="flex-shrink-0 p-4 border-b border-slate-700 flex items-center justify-center relative">
                <h2 className="text-xl font-bold text-slate-100">Create post</h2>
                <button onClick={onGoBack} className="absolute top-1/2 -translate-y-1/2 right-3 p-2 bg-slate-700 hover:bg-slate-600 rounded-full">
                    <Icon name="close" className="w-5 h-5 text-slate-300" />
                </button>
            </header>
            
            <div className="flex-grow flex flex-col p-4 min-h-0 overflow-y-auto">
                <div className="flex items-center gap-3">
                    <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-12 h-12 rounded-full" />
                    <div>
                        <p className="font-bold text-slate-100 text-lg">
                            {currentUser.name}
                            {feeling && <span className="font-normal text-slate-400"> is feeling {feeling.emoji} {feeling.text}</span>}
                        </p>
                        <p className="text-sm text-slate-400">Public</p>
                    </div>
                </div>
                <div className="relative my-4">
                    <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder={`What's on your mind, ${currentUser.name.split(' ')[0]}?`} className="w-full bg-transparent text-slate-200 text-2xl focus:outline-none resize-none" rows={4}/>
                    <div className="absolute bottom-0 right-0" ref={emojiPickerRef}>
                        <button onClick={() => setEmojiPickerOpen(p => !p)} className="p-2 text-slate-400 hover:text-slate-200"><Icon name="face-smile" className="w-6 h-6" /></button>
                        {isEmojiPickerOpen && <div className="absolute bottom-full right-0 mb-2 w-64 bg-slate-900 border border-slate-700 p-2 rounded-lg grid grid-cols-5 gap-2 z-50 shadow-2xl">{EMOJI_PICKER_LIST.map(emoji => <button key={emoji} onClick={() => setCaption(c => c + emoji)} className="text-2xl p-1 rounded-md hover:bg-slate-700">{emoji}</button>)}</div>}
                    </div>
                </div>

                {recordingState !== RecordingState.IDLE && renderRecordingControls()}
                
                {(isEditingImage || uploadedImagePreview) && (
                    <div className="relative group pb-4">
                        <img src={editedImageUrl || uploadedImagePreview} alt="Post preview" className="aspect-video w-full rounded-lg object-cover" />
                        {isEditingImage && <div className="absolute inset-0 bg-slate-900/70 rounded-lg flex items-center justify-center flex-col gap-3 text-slate-300"><Icon name="logo" className="w-12 h-12 text-rose-500 animate-spin"/><p>AI is working its magic...</p></div>}
                        <button onClick={() => {setUploadedImagePreview(null); setUploadedImageFile(null); setEditedImageUrl(null);}} className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white opacity-50 group-hover:opacity-100 transition-opacity"><Icon name="close" className="w-5 h-5"/></button>
                    </div>
                )}
            </div>

            <footer className="flex-shrink-0 p-4 space-y-4">
                 <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                <div className="border border-slate-700 rounded-lg p-3 flex items-center justify-around">
                     <button onClick={handleStartRecording} className="flex items-center gap-2 text-rose-400 font-semibold p-2 rounded-md hover:bg-slate-700/50"><Icon name="mic" className="w-6 h-6"/> Voice</button>
                     <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-green-400 font-semibold p-2 rounded-md hover:bg-slate-700/50"><Icon name="photo" className="w-6 h-6"/> Photo</button>
                     <button onClick={() => setSubView('feelings')} className="flex items-center gap-2 text-yellow-400 font-semibold p-2 rounded-md hover:bg-slate-700/50"><Icon name="face-smile" className="w-6 h-6"/> Feeling</button>
                </div>

                {uploadedImagePreview && (
                     <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-left text-slate-400">Edit with AI ({IMAGE_GENERATION_COST} Coins)</h4>
                        <div className="flex gap-2">
                            <input type="text" value={editPrompt} onChange={e => setEditPrompt(e.target.value)} placeholder="e.g., Change the saree to black" className="flex-grow bg-slate-700 border-slate-600 rounded-lg p-2.5" />
                            <button onClick={handleEditImage} disabled={!editPrompt.trim() || isEditingImage} className="bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 text-white font-bold px-4 rounded-lg">Generate Edit</button>
                        </div>
                    </div>
                )}

                <button onClick={handlePost} disabled={isPosting || (!caption.trim() && !editedImageUrl && !uploadedImagePreview && !feeling && recordingState !== RecordingState.PREVIEW)} className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-slate-600 text-white font-bold py-3 rounded-lg text-lg">
                    {isPosting ? 'Posting...' : 'Post'}
                </button>
            </footer>
        </div>
    );
    
    const renderFeelingsView = () => (
        <div className="w-full max-w-lg bg-slate-800 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
            <header className="flex-shrink-0 p-4 border-b border-slate-700 flex items-center justify-center relative">
                <button onClick={() => setSubView('main')} className="absolute top-1/2 -translate-y-1/2 left-3 p-2 bg-slate-700 hover:bg-slate-600 rounded-full"><Icon name="back" className="w-5 h-5 text-slate-300" /></button>
                <h2 className="text-xl font-bold text-slate-100">How are you feeling?</h2>
            </header>
            <main className="flex-grow p-4 overflow-y-auto grid grid-cols-2 gap-2">
                {FEELINGS.map(f => <button key={f.text} onClick={() => handleFeelingSelect(f)} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/50"><span className="text-3xl">{f.emoji}</span><span className="font-semibold capitalize text-slate-200">{f.text}</span></button>)}
            </main>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onGoBack}>
             {imageToCrop && <ImageCropper imageUrl={imageToCrop} aspectRatio={16 / 9} onSave={handleSaveCrop} onCancel={handleCancelCrop} isUploading={isPosting} />}
            <div onClick={e => e.stopPropagation()}>
                {subView === 'main' ? renderMainView() : renderFeelingsView()}
            </div>
        </div>
    );
};

export default CreatePostScreen;
