

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppView, User, Post, VoiceState, ScrollState, NLUResponse, Campaign, Story, Call, CallHistoryEntry, Comment } from './types';
import { firebaseService } from './services/firebaseService';
import { geminiService } from './services/geminiService';
import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import FeedScreen from './components/FeedScreen';
import { ProfileScreen } from './components/ProfileScreen';
import PostDetailScreen from './components/PostDetailScreen';
import CreatePostScreen from './components/CreatePostScreen';
// FIX: Corrected import to be a named import as SettingsScreen does not have a default export.
import { SettingsScreen } from './components/SettingsScreen';
import FriendsScreen from './components/FriendsScreen';
import ConversationsScreen from './components/ConversationsScreen';
import SearchResultsScreen from './components/SearchResultsScreen';
import AdModal from './components/AdModal';
import MobileBottomNav from './components/MobileBottomNav';
import ContactsPanel from './components/ContactsPanel';
import ChatManager from './components/ChatManager';
import SponsorCenterScreen from './components/SponsorCenterScreen';
import RoomsHubScreen from './components/RoomsHubScreen';
import RoomsListScreen from './components/RoomsListScreen';
import LiveRoomScreen from './components/LiveRoomScreen';
import ExploreScreen from './components/ExploreScreen';
import ReelsScreen from './components/ReelsScreen';
import CreateReelScreen from './components/CreateReelScreen';
import GroupsHubScreen from './components/GroupsHubScreen';
import GroupPageScreen from './components/GroupPageScreen';
import ManageGroupScreen from './components/ManageGroupScreen';
import GroupChatScreen from './components/GroupChatScreen';
import GroupEventsScreen from './components/GroupEventsScreen';
import CreateEventScreen from './components/CreateEventScreen';
import StoryViewerScreen from './components/StoryViewerScreen';
import CreateStoryScreen from './components/CreateStoryScreen';
import StoryPrivacyScreen from './components/StoryPrivacyScreen';
import GroupInviteScreen from './components/GroupInviteScreen';
import CallScreen from './components/CallScreen';
import IncomingCallModal from './components/IncomingCallModal';
import VideoRoomsListScreen from './components/VideoRoomsListScreen';
import LiveVideoRoomScreen from './components/LiveVideoRoomScreen';
import ImageModal from './components/ImageModal';
import ShareModal from './components/ShareModal';
import LeadFormModal from './components/LeadFormModal';
import { useSettings } from './contexts/SettingsContext';
// FIX: Imported Icon component to resolve missing component error.
import Icon from './components/Icon';

const UserApp: React.FC = () => {
    // Core State
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);
    const [view, setView] = useState<AppView>(AppView.FEED);
    const [viewProps, setViewProps] = useState<any>({});
    const [viewHistory, setViewHistory] = useState<{ view: AppView, props: any }[]>([]);

    // Data State
    const [posts, setPosts] = useState<Post[]>([]);
    const [friends, setFriends] = useState<User[]>([]);
    const [friendRequests, setFriendRequests] = useState<User[]>([]);
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [callHistory, setCallHistory] = useState<CallHistoryEntry[]>([]);

    // UI State
    const [scrollState, setScrollState] = useState<ScrollState>('none');
    const [adToShow, setAdToShow] = useState<Campaign | null>(null);
    const [photoViewerPost, setPhotoViewerPost] = useState<Post | null>(null);
    const [shareModalPost, setShareModalPost] = useState<Post | null>(null);
    const [leadFormPost, setLeadFormPost] = useState<Post | null>(null);
    const [isChatRecording, setIsChatRecording] = useState(false);

    // Voice Command State
    const [voiceState, setVoiceState] = useState<VoiceState>(VoiceState.IDLE);
    const [ttsMessage, setTtsMessage] = useState('Welcome to VoiceBook.');
    const [lastCommand, setLastCommand] = useState<string | null>(null);
    const [commandInputValue, setCommandInputValue] = useState('');

    // Chat State
    const [activeChats, setActiveChats] = useState<User[]>([]);
    const [minimizedChats, setMinimizedChats] = useState<Set<string>>(new Set());
    const [chatUnreadCounts, setChatUnreadCounts] = useState<Record<string, number>>({});

    // Call State
    const [incomingCall, setIncomingCall] = useState<Call | null>(null);
    const [activeCall, setActiveCall] = useState<Call | null>(null);

    const { language } = useSettings();

    // --- Effects ---
    useEffect(() => {
        const unsubscribe = firebaseService.onAuthStateChanged(async (user) => {
            if (user) {
                const userProfile = await firebaseService.getUserProfile(user.uid);
                setCurrentUser(userProfile);
                if (userProfile?.isBanned || userProfile?.isDeactivated) {
                    firebaseService.signOut();
                }
            } else {
                setCurrentUser(null);
            }
            setIsLoadingAuth(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (currentUser) {
            const unsubPosts = firebaseService.listenToFeedPosts(currentUser.id, currentUser.friendIds, currentUser.blockedUserIds, setPosts);
            const unsubFriends = firebaseService.listenToFriends(currentUser.id, setFriends);
            const unsubRequests = firebaseService.listenToFriendRequests(currentUser.id, setFriendRequests);
            const unsubCalls = firebaseService.listenForIncomingCalls(currentUser.id, (call) => {
                if(call && call.status === 'ringing') {
                    setIncomingCall(call);
                } else {
                    setIncomingCall(null);
                }
            });
            const unsubCallHistory = firebaseService.listenToCallHistory(currentUser.id, setCallHistory);
            
            return () => {
                unsubPosts();
                unsubFriends();
                unsubRequests();
                unsubCalls();
                unsubCallHistory();
            };
        }
    }, [currentUser]);

    // --- Handlers ---
    const handleNavigate = useCallback((newView: AppView, props: any = {}) => {
        if (newView !== view || JSON.stringify(props) !== JSON.stringify(viewProps)) {
            setViewHistory(prev => [...prev, { view, props: viewProps }]);
            setView(newView);
            setViewProps(props);
        }
    }, [view, viewProps]);
    
    const handleGoBack = useCallback(() => {
        const lastView = viewHistory.pop();
        if (lastView) {
            setView(lastView.view);
            setViewProps(lastView.props);
            setViewHistory(viewHistory);
        }
    }, [viewHistory]);

    const handleOpenConversation = (peer: User) => {
        if (!activeChats.some(c => c.id === peer.id)) {
            setActiveChats(prev => [...prev, peer]);
        }
        setMinimizedChats(prev => {
            const newSet = new Set(prev);
            newSet.delete(peer.id);
            return newSet;
        });
    };
    
    const handleAcceptCall = (call: Call) => {
        firebaseService.updateCallStatus(call.id, 'connected');
        setIncomingCall(null);
        handleNavigate(AppView.CALL_SCREEN, {
            callId: call.id,
            peerUser: call.caller,
            isCaller: false
        });
    };
    
    const handleRejectCall = (call: Call) => {
        firebaseService.updateCallStatus(call.id, 'declined');
        setIncomingCall(null);
    };

    const renderView = () => {
        switch (view) {
            case AppView.FEED: return <FeedScreen currentUser={currentUser!} isLoading={posts.length === 0} posts={posts} onNavigate={handleNavigate} onSetTtsMessage={setTtsMessage} lastCommand={lastCommand} onCommandProcessed={() => setLastCommand(null)} friends={friends} setSearchResults={setSearchResults} scrollState={scrollState} onSetScrollState={setScrollState} onOpenProfile={(username) => handleNavigate(AppView.PROFILE, { username })} onViewPost={(postId) => handleNavigate(AppView.POST_DETAIL, { postId })} onReactToPost={(postId, emoji) => firebaseService.reactToPost(postId, currentUser!.id, emoji)} onStartCreatePost={(props) => handleNavigate(AppView.CREATE_POST, props)} onRewardedAdClick={setAdToShow} onAdViewed={(campaignId) => firebaseService.trackAdView(campaignId)} onAdClick={setLeadFormPost} onStartComment={(postId, replyTo) => handleNavigate(AppView.POST_DETAIL, { postId, newlyAddedCommentId: replyTo?.id })} onSharePost={setShareModalPost} onOpenPhotoViewer={setPhotoViewerPost} />;
            case AppView.PROFILE: return <ProfileScreen currentUser={currentUser!} username={viewProps.username || currentUser!.username} onNavigate={handleNavigate} onSetTtsMessage={setTtsMessage} lastCommand={lastCommand} onCommandProcessed={() => setLastCommand(null)} onOpenConversation={handleOpenConversation} onEditProfile={() => {}} onViewPost={(postId) => handleNavigate(AppView.POST_DETAIL, { postId })} onOpenProfile={(username) => handleNavigate(AppView.PROFILE, { username })} onReactToPost={(postId, emoji) => firebaseService.reactToPost(postId, currentUser!.id, emoji)} onBlockUser={() => {}} onCurrentUserUpdate={setCurrentUser} onPostCreated={() => {}} onSharePost={setShareModalPost} onOpenPhotoViewer={setPhotoViewerPost} onStartComment={(postId, replyTo) => handleNavigate(AppView.POST_DETAIL, { postId, newlyAddedCommentId: replyTo?.id })} scrollState={scrollState} onSetScrollState={setScrollState} onGoBack={handleGoBack} />;
            // FIX: The createComment function expects a content object as its third argument.
// The arguments from onPostComment are (postId, text, parentId).
// This was causing a type error by passing 4 arguments instead of 3.
// This fix wraps text and parentId in an object for the `content` parameter.
case AppView.POST_DETAIL: return <PostDetailScreen currentUser={currentUser!} postId={viewProps.postId} onGoBack={handleGoBack} onSetTtsMessage={setTtsMessage} lastCommand={lastCommand} onCommandProcessed={() => setLastCommand(null)} onReactToPost={(postId, emoji) => firebaseService.reactToPost(postId, currentUser!.id, emoji)} onReactToComment={(postId, commentId, emoji) => firebaseService.reactToComment(postId, commentId, currentUser!.id, emoji)} onPostComment={(postId, text, parentId) => firebaseService.createComment(currentUser!, postId, { text, parentId }).then(() => {})} onEditComment={(...args) => firebaseService.editComment(...args)} onDeleteComment={(...args) => firebaseService.deleteComment(...args)} onOpenProfile={(username) => handleNavigate(AppView.PROFILE, { username })} onSharePost={setShareModalPost} onOpenPhotoViewer={setPhotoViewerPost} onStartComment={(postId, replyTo) => handleNavigate(AppView.POST_DETAIL, { postId, newlyAddedCommentId: replyTo?.id })} scrollState={scrollState} />;
            case AppView.CREATE_POST: return <CreatePostScreen currentUser={currentUser!} onGoBack={handleGoBack} onPostCreated={() => handleNavigate(AppView.FEED)} onSetTtsMessage={setTtsMessage} lastCommand={lastCommand} onCommandProcessed={() => setLastCommand(null)} onDeductCoinsForImage={() => firebaseService.updateVoiceCoins(currentUser!.id, -50)} {...viewProps} />;
            case AppView.SETTINGS: return <SettingsScreen currentUser={currentUser!} onGoBack={handleGoBack} onUpdateSettings={(updates) => firebaseService.updateProfile(currentUser!.id, updates).then(() => setCurrentUser(prev => ({...prev!, ...updates})))} onUnblockUser={() => {}} onDeactivateAccount={() => {}} lastCommand={lastCommand} onSetTtsMessage={setTtsMessage} onCommandProcessed={() => setLastCommand(null)} scrollState={scrollState} />;
            case AppView.FRIENDS: return <FriendsScreen currentUser={currentUser!} onGoBack={handleGoBack} onOpenProfile={(username) => handleNavigate(AppView.PROFILE, { username })} onOpenConversation={handleOpenConversation} callHistory={callHistory} onInitiateCall={(peer, type) => geminiService.createCall(currentUser!, peer, firebaseService.getChatId(currentUser!.id, peer.id), type).then(callId => handleNavigate(AppView.CALL_SCREEN, { callId, peerUser: peer, isCaller: true }))} friends={friends} requests={friendRequests} />;
            case AppView.CONVERSATIONS: return <ConversationsScreen currentUser={currentUser!} onGoBack={handleGoBack} onOpenConversation={handleOpenConversation} onSetTtsMessage={setTtsMessage} lastCommand={lastCommand} onCommandProcessed={() => setLastCommand(null)} />;
            case AppView.SEARCH_RESULTS: return <SearchResultsScreen results={searchResults} query={viewProps.query} onSetTtsMessage={setTtsMessage} lastCommand={lastCommand} onCommandProcessed={() => setLastCommand(null)} onOpenProfile={(username) => handleNavigate(AppView.PROFILE, { username })} onGoBack={handleGoBack} />;
            case AppView.ADS_CENTER: return <SponsorCenterScreen currentUser={currentUser!} onGoBack={handleGoBack} onSetTtsMessage={setTtsMessage} lastCommand={lastCommand} onCommandProcessed={() => setLastCommand(null)} />;
            case AppView.ROOMS_HUB: return <RoomsHubScreen onNavigate={handleNavigate} />;
            case AppView.ROOMS_LIST: return <RoomsListScreen currentUser={currentUser!} onNavigate={handleNavigate} />;
            case AppView.LIVE_ROOM: return <LiveRoomScreen currentUser={currentUser!} roomId={viewProps.roomId} onNavigate={handleNavigate} onGoBack={handleGoBack} onSetTtsMessage={setTtsMessage}/>;
            case AppView.CALL_SCREEN: return <CallScreen currentUser={currentUser!} onEndCall={handleGoBack} {...viewProps} />;
            case AppView.VIDEO_ROOMS_LIST: return <VideoRoomsListScreen currentUser={currentUser!} onNavigate={handleNavigate} />;
            case AppView.LIVE_VIDEO_ROOM: return <LiveVideoRoomScreen currentUser={currentUser!} roomId={viewProps.roomId} onGoBack={handleGoBack} onSetTtsMessage={setTtsMessage}/>;
            default: return <FeedScreen currentUser={currentUser!} isLoading={posts.length === 0} posts={posts} onNavigate={handleNavigate} onSetTtsMessage={setTtsMessage} lastCommand={lastCommand} onCommandProcessed={() => setLastCommand(null)} friends={friends} setSearchResults={setSearchResults} scrollState={scrollState} onSetScrollState={setScrollState} onOpenProfile={(username) => handleNavigate(AppView.PROFILE, { username })} onViewPost={(postId) => handleNavigate(AppView.POST_DETAIL, { postId })} onReactToPost={(postId, emoji) => firebaseService.reactToPost(postId, currentUser!.id, emoji)} onStartCreatePost={(props) => handleNavigate(AppView.CREATE_POST, props)} onRewardedAdClick={setAdToShow} onAdViewed={(campaignId) => firebaseService.trackAdView(campaignId)} onAdClick={setLeadFormPost} onStartComment={(postId, replyTo) => handleNavigate(AppView.POST_DETAIL, { postId, newlyAddedCommentId: replyTo?.id })} onSharePost={setShareModalPost} onOpenPhotoViewer={setPhotoViewerPost} />;
        }
    };
    
    if (isLoadingAuth) {
        return <div className="h-screen w-screen bg-black flex items-center justify-center"><Icon name="logo" className="w-24 h-24 text-lime-400 animate-pulse"/></div>;
    }

    if (!currentUser) {
        return <AuthScreen onSetTtsMessage={setTtsMessage} lastCommand={lastCommand} onCommandProcessed={() => setLastCommand(null)} />;
    }

    return (
        <div className="h-screen w-screen bg-black flex font-sans text-white overflow-hidden">
            <Sidebar currentUser={currentUser} onNavigate={(view) => handleNavigate(AppView[view.toUpperCase() as keyof typeof AppView])} friendRequestCount={friendRequests.length} activeView={view} voiceCoins={currentUser.voiceCoins} voiceState={voiceState} onMicClick={() => {}} isChatRecording={isChatRecording} />
            <main className="flex-grow flex flex-col overflow-hidden relative">
                <div className="flex-grow overflow-y-auto" id="main-content-area">
                    {renderView()}
                </div>
            </main>
            <ContactsPanel friends={friends} onOpenConversation={handleOpenConversation} />

            {/* Modals and Overlays */}
            {adToShow && <AdModal campaign={adToShow} onComplete={(campaignId) => { firebaseService.trackAdView(campaignId); firebaseService.updateVoiceCoins(currentUser.id, 5); setAdToShow(null); }} onSkip={() => setAdToShow(null)} />}
            {/* FIX: The createComment function expects a content object as its third argument.
The arguments from onPostComment are (postId, text, parentId).
This was causing a type error by passing 4 arguments instead of 3.
This fix wraps text and parentId in an object for the `content` parameter. */}
{photoViewerPost && <ImageModal post={photoViewerPost} currentUser={currentUser} isLoading={false} onClose={() => setPhotoViewerPost(null)} onReactToPost={(postId, emoji) => firebaseService.reactToPost(postId, currentUser!.id, emoji)} onReactToComment={(postId, commentId, emoji) => firebaseService.reactToComment(postId, commentId, currentUser!.id, emoji)} onPostComment={(postId, text, parentId) => firebaseService.createComment(currentUser!, postId, { text, parentId }).then(() => {})} onEditComment={(...args) => firebaseService.editComment(...args)} onDeleteComment={(...args) => firebaseService.deleteComment(...args)} onOpenProfile={(username) => { setPhotoViewerPost(null); handleNavigate(AppView.PROFILE, { username }); }} onSharePost={(post) => { setPhotoViewerPost(null); setShareModalPost(post); }} />}
            {shareModalPost && <ShareModal post={shareModalPost} onClose={() => setShareModalPost(null)} onSetTtsMessage={setTtsMessage} />}
            {leadFormPost && <LeadFormModal post={leadFormPost} currentUser={currentUser} onClose={() => setLeadFormPost(null)} onSubmit={async (leadData) => { await firebaseService.submitLead(leadFormPost.campaignId!, currentUser, leadData); setLeadFormPost(null); }} />}
            {incomingCall && <IncomingCallModal call={incomingCall} onAccept={handleAcceptCall} onReject={handleRejectCall} />}
            
            <ChatManager currentUser={currentUser} activeChats={activeChats} friends={friends} minimizedChats={minimizedChats} chatUnreadCounts={chatUnreadCounts} onCloseChat={(peerId) => setActiveChats(p => p.filter(c => c.id !== peerId))} onMinimizeToggle={(peerId) => setMinimizedChats(p => { const newSet = new Set(p); if (p.has(peerId)) newSet.delete(peerId); else newSet.add(peerId); return newSet; })} setIsChatRecording={setIsChatRecording} onNavigate={handleNavigate} onSetTtsMessage={setTtsMessage} />
            <MobileBottomNav onNavigate={(view) => handleNavigate(AppView[view.toUpperCase() as keyof typeof AppView])} friendRequestCount={friendRequests.length} activeView={view} voiceState={voiceState} onMicClick={() => {}} onSendCommand={(cmd) => setLastCommand(cmd)} commandInputValue={commandInputValue} setCommandInputValue={setCommandInputValue} ttsMessage={ttsMessage} isChatRecording={isChatRecording} />
        </div>
    );
};

export default UserApp;