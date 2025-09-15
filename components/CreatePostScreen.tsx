import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, Post } from '../types';
import { IMAGE_GENERATION_COST, getTtsPrompt } from '../constants';
import Icon from './Icon';
import { geminiService } from '../services/geminiService';
import { firebaseService } from '../services/firebaseService';
import { useSettings } from '../contexts/SettingsContext';

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

const CreatePostScreen: React.FC<CreatePostScreenProps> = ({ currentUser, onPostCreated, onSetTtsMessage, lastCommand, onDeductCoinsForImage, onCommandProcessed, onGoBack, groupId, groupName }) => {
    const [caption, setCaption] = useState('');
    const [feeling, setFeeling] = useState<Feeling | null>(null);
    const [subView, setSubView] = useState<SubView>('main');
    const [imagePrompt, setImagePrompt] = useState('');
    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [isPosting, setIsPosting] = useState(false);
    const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);

    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const { language } = useSettings();

    useEffect(() => {
        onSetTtsMessage(`What's on your mind, ${currentUser.name.split(' ')[0]}?`);
    }, [currentUser.name, onSetTtsMessage]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setEmojiPickerOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    
    const handleGenerateImage = useCallback(async () => {
        if (!imagePrompt.trim() || isGeneratingImage) return;

        if ((currentUser.voiceCoins || 0) < IMAGE_GENERATION_COST) {
            onSetTtsMessage(getTtsPrompt('image_generation_insufficient_coins', language, { cost: IMAGE_GENERATION_COST, balance: currentUser.voiceCoins || 0 }));
            return;
        }

        const paymentSuccess = await onDeductCoinsForImage();
        if (!paymentSuccess) return;
        
        setGeneratedImageUrl(null);
        setIsGeneratingImage(true);
        onSetTtsMessage("Generating your masterpiece...");
        const imageUrl = await geminiService.generateImageForPost(imagePrompt);
        setIsGeneratingImage(false);
        
        if(imageUrl) {
            setGeneratedImageUrl(imageUrl);
            onSetTtsMessage(`Image generated! You can now add a caption.`);
        } else {
            onSetTtsMessage(`Sorry, I couldn't generate an image for that prompt. Please try another one.`);
        }
    }, [imagePrompt, isGeneratingImage, onSetTtsMessage, currentUser.voiceCoins, onDeductCoinsForImage, language]);

    const handlePost = useCallback(async () => {
        const hasContent = caption.trim() || generatedImageUrl || feeling;
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
                imagePrompt: generatedImageUrl ? imagePrompt : undefined,
                groupId,
                groupName,
                duration: 0, // Not an audio post
            };
            
            await firebaseService.createPost(postBaseData, { generatedImageBase64: generatedImageUrl });

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
    }, [isPosting, caption, currentUser, onSetTtsMessage, onPostCreated, onGoBack, generatedImageUrl, imagePrompt, groupId, groupName, feeling, language]);

    const handleFeelingSelect = (selected: Feeling) => {
        setFeeling(selected);
        setSubView('main');
    };

    const renderMainView = () => (
        <div className="w-full max-w-lg bg-slate-800 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
            <header className="flex-shrink-0 p-4 border-b border-slate-700 flex items-center justify-center relative">
                <h2 className="text-xl font-bold text-slate-100">Create post</h2>
                <button onClick={onGoBack} className="absolute top-1/2 -translate-y-1/2 right-3 p-2 bg-slate-700 hover:bg-slate-600 rounded-full">
                    <Icon name="close" className="w-5 h-5 text-slate-300" />
                </button>
            </header>
            
            <main className="flex-grow p-4 overflow-y-auto">
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

                <div className="relative">
                    <textarea
                        value={caption}
                        onChange={e => setCaption(e.target.value)}
                        placeholder={`What's on your mind, ${currentUser.name.split(' ')[0]}?`}
                        className="w-full bg-transparent text-slate-200 text-2xl my-4 focus:outline-none resize-none"
                        rows={4}
                    />
                    <div className="absolute bottom-4 right-0" ref={emojiPickerRef}>
                         <button onClick={() => setEmojiPickerOpen(p => !p)} className="p-2 text-slate-400 hover:text-slate-200">
                            <Icon name="face-smile" className="w-6 h-6" />
                        </button>
                        {isEmojiPickerOpen && (
                            <div className="absolute bottom-full right-0 mb-2 bg-slate-900 border border-slate-700 p-2 rounded-lg grid grid-cols-5 gap-1">
                                {EMOJI_PICKER_LIST.map(emoji => (
                                    <button key={emoji} onClick={() => setCaption(c => c + emoji)} className="text-2xl p-1 rounded-md hover:bg-slate-700">{emoji}</button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                
                {isGeneratingImage && (
                    <div className="aspect-video bg-slate-700/50 rounded-lg flex items-center justify-center flex-col gap-3 text-slate-300">
                        <Icon name="logo" className="w-12 h-12 text-rose-500 animate-spin"/>
                        <p>Generating your masterpiece...</p>
                    </div>
                )}
                {generatedImageUrl && !isGeneratingImage && (
                    <div className="relative group">
                        <img src={generatedImageUrl} alt={imagePrompt} className="aspect-video w-full rounded-lg object-cover" />
                        <button onClick={() => setGeneratedImageUrl(null)} className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white opacity-50 group-hover:opacity-100 transition-opacity">
                            <Icon name="close" className="w-5 h-5"/>
                        </button>
                    </div>
                )}

            </main>

            <footer className="flex-shrink-0 p-4 space-y-4">
                <div className="border border-slate-700 rounded-lg p-3 flex items-center justify-around">
                     <button onClick={() => {}} className="flex items-center gap-2 text-green-400 font-semibold p-2 rounded-md hover:bg-slate-700/50"><Icon name="photo" className="w-6 h-6"/> Photo/video</button>
                     <button onClick={() => setSubView('feelings')} className="flex items-center gap-2 text-yellow-400 font-semibold p-2 rounded-md hover:bg-slate-700/50"><Icon name="face-smile" className="w-6 h-6"/> Feeling</button>
                </div>
                 <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-left text-slate-400">Add an AI Image ({IMAGE_GENERATION_COST} Coins)</h4>
                    <div className="flex gap-2">
                        <input type="text" value={imagePrompt} onChange={e => setImagePrompt(e.target.value)} placeholder="e.g., A robot on a skateboard" className="flex-grow bg-slate-700 border-slate-600 rounded-lg p-2.5" />
                        <button onClick={handleGenerateImage} disabled={!imagePrompt.trim() || isGeneratingImage} className="bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 text-white font-bold px-4 rounded-lg">Generate</button>
                    </div>
                </div>
                <button onClick={handlePost} disabled={isPosting || (!caption.trim() && !generatedImageUrl && !feeling)} className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-slate-600 text-white font-bold py-3 rounded-lg text-lg">
                    {isPosting ? 'Posting...' : 'Post'}
                </button>
            </footer>
        </div>
    );
    
    const renderFeelingsView = () => {
         const [search, setSearch] = useState('');
         const filteredFeelings = FEELINGS.filter(f => f.text.toLowerCase().includes(search.toLowerCase()));

        return (
            <div className="w-full max-w-lg bg-slate-800 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
                <header className="flex-shrink-0 p-4 border-b border-slate-700 flex items-center justify-center relative">
                    <button onClick={() => setSubView('main')} className="absolute top-1/2 -translate-y-1/2 left-3 p-2 bg-slate-700 hover:bg-slate-600 rounded-full">
                        <Icon name="back" className="w-5 h-5 text-slate-300" />
                    </button>
                    <h2 className="text-xl font-bold text-slate-100">How are you feeling?</h2>
                </header>
                <div className="p-4 flex-shrink-0">
                    <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="w-full bg-slate-700 border-slate-600 rounded-full p-2.5 pl-4"/>
                </div>
                <main className="flex-grow p-4 pt-0 overflow-y-auto grid grid-cols-2 gap-2">
                    {filteredFeelings.map(f => (
                        <button key={f.text} onClick={() => handleFeelingSelect(f)} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/50">
                            <span className="text-3xl">{f.emoji}</span>
                            <span className="font-semibold capitalize text-slate-200">{f.text}</span>
                        </button>
                    ))}
                </main>
            </div>
        )
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onGoBack}>
            <div onClick={e => e.stopPropagation()}>
                {subView === 'main' ? renderMainView() : renderFeelingsView()}
            </div>
        </div>
    );
};

export default CreatePostScreen;