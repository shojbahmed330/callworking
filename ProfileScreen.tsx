import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Post, FriendshipStatus, ScrollState, AppView, Comment } from './types';
import { PostCard } from './components/PostCard';
import Icon from './components/Icon';
import { geminiService } from './services/geminiService';
import { firebaseService } from './services/firebaseService';
import { getTtsPrompt } from './constants';
import ImageCropper from './components/ImageCropper';
import { useSettings } from './contexts/SettingsContext';
import { t } from './i18n';
import UserCard from './components/UserCard';


interface ProfileScreenProps {
  username: string;
  currentUser: User;
  onSetTtsMessage: (message: string) => void;
  lastCommand: string | null;
  onOpenConversation: (recipient: User) => void;
  onEditProfile: () => void;
  onViewPost: (postId: string) => void;
  onOpenProfile: (username: string) => void;
  onReactToPost: (postId: string, emoji: string) => void;
  onBlockUser: (user: User) => void;
  onCurrentUserUpdate: (updatedUser: User) => void;
  onPostCreated: (newPost: Post) => void;
  onSharePost: (post: Post) => void;
  onOpenPhotoViewer: (post: Post) => void;
  
  onCommandProcessed: () => void;
  scrollState: ScrollState;
  onSetScrollState: (state: ScrollState) => void;
  onNavigate: (view: AppView, props?: any) => void;
  onGoBack: () => void;
  onStartComment: (postId: string, commentToReplyTo?: Comment) => void;
}

const formatTimeAgo = (isoString?: string): string => {
    if (!isoString) return 'sometime ago';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'sometime ago';
    
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return `now`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

const AboutItem: React.FC<{iconName: React.ComponentProps<typeof Icon>['name'], children: React.ReactNode}> = ({iconName, children}) => (
    <div className="flex items-start gap-3 text-slate-300">
        <Icon name={iconName} className="w-5 h-5 text-slate-400 mt-1 flex-shrink-0"/>
        <p>{children}</p>
    </div>
);


export const ProfileScreen: React.FC<ProfileScreenProps> = ({ 
    username, currentUser, onSetTtsMessage, lastCommand, onOpenConversation, 
    onEditProfile, onViewPost, onOpenProfile, onReactToPost, onBlockUser, scrollState,
    onCommandProcessed, onSetScrollState, onNavigate, onGoBack,
    onCurrentUserUpdate, onPostCreated,
    onStartComment, onSharePost, onOpenPhotoViewer
}) => {
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [friendsList, setFriendsList] = useState<User[]>([]);
  const [commonFriends, setCommonFriends] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus>(FriendshipStatus.NOT_FRIENDS);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'about' | 'friends'>('posts');
  
  const [currentPostIndex, setCurrentPostIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const isInitialLoadRef = useRef(true);
  const { language } = useSettings();
  
  const [cropperState, setCropperState] = useState<{
      isOpen: boolean;
      type: 'avatar' | 'cover' | null;
      imageUrl: string;
      isUploading: boolean;
  }>({ isOpen: false, type: null, imageUrl: '', isUploading: false });

  const [dragState, setDragState] = useState({ isOverAvatar: false, isOverCover: false });
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const [isRequestMenuOpen, setIsRequestMenuOpen] = useState(false);
  const requestMenuRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
            setIsActionMenuOpen(false);
        }
        if (requestMenuRef.current && !requestMenuRef.current.contains(event.target as Node)) {
            setIsRequestMenuOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Effect 1: Listen for the user profile document and set the main user state
  useEffect(() => {
    setIsLoading(true); // Start loading when username changes
    isInitialLoadRef.current = true; // Reset initial load flag

    const unsubscribe = firebaseService.listenToUserProfile(username, (user) => {
      setProfileUser(user);
      if (!user) {
        onSetTtsMessage(`Profile for ${username} not found.`);
        setIsLoading(false); // Stop loading if user not found
      }
    });

    return () => unsubscribe();
  }, [username, onSetTtsMessage]);

  // Effect 2: Fetch related data (posts, friends) ONLY when the profileUser is set or changes ID
  useEffect(() => {
    if (!profileUser) return;

    const fetchRelatedData = async () => {
      const userPosts = await firebaseService.getPostsByUser(profileUser.id);
      setPosts(userPosts);
      
      if (profileUser.friendIds && profileUser.friendIds.length > 0) {
          const friends = await firebaseService.getUsersByIds(profileUser.friendIds);
          setFriendsList(friends);
      } else {
          setFriendsList([]);
      }

      if (profileUser.id !== currentUser.id) {
          const common = await geminiService.getCommonFriends(currentUser.id, profileUser.id);
          setCommonFriends(common);
      } else {
          setCommonFriends([]);
      }

      if (isInitialLoadRef.current) {
        const isOwnProfile = profileUser.id === currentUser.id;
        onSetTtsMessage(isOwnProfile ? getTtsPrompt('profile_loaded_own', language) : getTtsPrompt('profile_loaded', language, {name: profileUser.name}));
        isInitialLoadRef.current = false;
      }
      
      setIsLoading(false); // Stop loading after all related data is fetched
    };
    
    fetchRelatedData();
    
  }, [profileUser?.id, currentUser.id, language, onSetTtsMessage]);


  useEffect(() => {
    if (!profileUser || !currentUser || profileUser.id === currentUser.id) {
        setIsLoadingStatus(false);
        return;
    }

    const checkStatus = async () => {
        setIsLoadingStatus(true);
        try {
            const status = await firebaseService.checkFriendshipStatus(currentUser.id, profileUser.id);
            setFriendshipStatus(status);
        } catch (error) {
            console.error("Failed to check friendship status:", error);
            setFriendshipStatus(FriendshipStatus.NOT_FRIENDS);
        } finally {
            setIsLoadingStatus(false);
        }
    };

    checkStatus();
  }, [profileUser, currentUser]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || scrollState === 'none') {
        return;
    }

    let animationFrameId: number;
    const animateScroll = () => {
        if (scrollState === 'down') {
            scrollContainer.scrollTop += 2;
        } else if (scrollState === 'up') {
            scrollContainer.scrollTop -= 2;
        }
        animationFrameId = requestAnimationFrame(animateScroll);
    };

    animationFrameId = requestAnimationFrame(animateScroll);

    return () => {
        cancelAnimationFrame(animationFrameId);
    };
  }, [scrollState]);
  
  const handleComment = () => {
     if (posts.length > 0) {
        onViewPost(posts[currentPostIndex].id);
     }
  }

  const openCropperModal = (file: File, type: 'avatar' | 'cover') => {
      if (file && file.type.startsWith('image/')) {
          setCropperState({
              isOpen: true,
              type,
              imageUrl: URL.createObjectURL(file),
              isUploading: false,
          });
      }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'cover') => {
      const file = event.target.files?.[0];
      if (file) {
          openCropperModal(file, type);
      }
      event.target.value = ''; 
  };
  
  const handleSaveCrop = async (base64Url: string) => {
      if (!profileUser || !cropperState.type) return;

      setCropperState(prev => ({ ...prev, isUploading: true }));

      try {
          let result;
          if (cropperState.type === 'avatar') {
              onSetTtsMessage(getTtsPrompt('profile_picture_update_success', language));
              result = await geminiService.updateProfilePicture(profileUser.id, base64Url, undefined, undefined);
          } else {
              onSetTtsMessage(getTtsPrompt('cover_photo_update_success', language));
              result = await geminiService.updateCoverPhoto(profileUser.id, base64Url, undefined, undefined);
          }

          if (result) {
              onCurrentUserUpdate(result.updatedUser);
              onPostCreated(result.newPost);
              onSetTtsMessage(cropperState.type === 'avatar' ? getTtsPrompt('profile_picture_update_success', language) : getTtsPrompt('cover_photo_update_success', language));
          } else {
              throw new Error("Update failed in service.");
          }
      } catch (error) {
          console.error(`Failed to update ${cropperState.type}:`, error);
          onSetTtsMessage(getTtsPrompt('photo_update_fail', language));
      } finally {
          closeCropperModal();
      }
  };

  const closeCropperModal = () => {
      if (cropperState.imageUrl) {
          URL.revokeObjectURL(cropperState.imageUrl);
      }
      setCropperState({ isOpen: false, type: null, imageUrl: '', isUploading: false });
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLElement>, type: 'avatar' | 'cover') => {
      e.preventDefault();
      setDragState(prev => ({ ...prev, [type === 'avatar' ? 'isOverAvatar' : 'isOverCover']: true }));
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>, type: 'avatar' | 'cover') => {
      e.preventDefault();
      setDragState(prev => ({ ...prev, [type === 'avatar' ? 'isOverAvatar' : 'isOverCover']: false }));
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>, type: 'avatar' | 'cover') => {
      e.preventDefault();
      setDragState({ isOverAvatar: false, isOverCover: false });
      const file = e.dataTransfer.files?.[0];
      if (file) {
          openCropperModal(file, type);
      }
  };

  const handleAddFriendAction = useCallback(async () => {
    if (!profileUser || isLoadingStatus) return;
    setIsLoadingStatus(true);
    const result = await geminiService.addFriend(currentUser.id, profileUser.id);
    if (result.success) {
        setFriendshipStatus(FriendshipStatus.REQUEST_SENT);
        onSetTtsMessage(getTtsPrompt('friend_request_sent', language, { name: profileUser.name }));
    } else if (result.reason === 'friends_of_friends') {
        onSetTtsMessage(getTtsPrompt('friend_request_privacy_block', language, { name: profileUser.name }));
    } else {
        onSetTtsMessage("Failed to send friend request. Please try again later.");
    }
    setIsLoadingStatus(false);
  }, [profileUser, currentUser.id, onSetTtsMessage, language, isLoadingStatus]);

  const handleRespondToRequest = useCallback(async (response: 'accept' | 'decline') => {
      if (!profileUser || isLoadingStatus) return;
      setIsLoadingStatus(true);
      if (response === 'accept') {
          await geminiService.acceptFriendRequest(currentUser.id, profileUser.id);
          setFriendshipStatus(FriendshipStatus.FRIENDS);
          onSetTtsMessage(getTtsPrompt('friend_request_accepted', language, { name: profileUser.name }));
      } else {
          await geminiService.declineFriendRequest(currentUser.id, profileUser.id);
          setFriendshipStatus(FriendshipStatus.NOT_FRIENDS);
          onSetTtsMessage(getTtsPrompt('friend_request_declined', language, { name: profileUser.name }));
      }
      setIsLoadingStatus(false);
  }, [profileUser, currentUser.id, onSetTtsMessage, language, isLoadingStatus]);

  const handleUnfriend = useCallback(async () => {
    if (!profileUser) return;
    setIsActionMenuOpen(false);
    if (window.confirm(`Are you sure you want to remove ${profileUser.name} from your friends?`)) {
        const success = await geminiService.unfriendUser(currentUser.id, profileUser.id);
        if (success) {
            setFriendshipStatus(FriendshipStatus.NOT_FRIENDS);
            onSetTtsMessage(getTtsPrompt('friend_removed', language, { name: profileUser.name }));
        } else {
            onSetTtsMessage(`Could not unfriend ${profileUser.name}. Please try again.`);
        }
    }
  }, [profileUser, currentUser.id, onSetTtsMessage, language]);

  const handleCancelRequest = useCallback(async () => {
    if (!profileUser) return;
    setIsRequestMenuOpen(false);
    const success = await geminiService.cancelFriendRequest(currentUser.id, profileUser.id);
    if (success) {
        setFriendshipStatus(FriendshipStatus.NOT_FRIENDS);
        onSetTtsMessage(getTtsPrompt('request_cancelled', language, { name: profileUser.name }));
    } else {
        onSetTtsMessage(`Could not cancel request to ${profileUser.name}.`);
    }
  }, [profileUser, currentUser.id, onSetTtsMessage, language]);

  const handleCommand = useCallback(async (command: string) => {
    if (!profileUser) {
        onCommandProcessed();
        return;
    };
    
    try {
        const context = { userNames: [profileUser.name] };
        const intentResponse = await geminiService.processIntent(command, context);
        
        switch (intentResponse.intent) {
          case 'intent_add_friend':
            if (profileUser.id !== currentUser.id && friendshipStatus === FriendshipStatus.NOT_FRIENDS) {
                handleAddFriendAction();
            }
            break;
          case 'intent_accept_request':
              if (friendshipStatus === FriendshipStatus.PENDING_APPROVAL) {
                  handleRespondToRequest('accept');
              }
              break;
          case 'intent_unfriend_user':
            if (friendshipStatus === FriendshipStatus.FRIENDS) {
                handleUnfriend();
            }
            break;
        case 'intent_cancel_friend_request':
            if (friendshipStatus === FriendshipStatus.REQUEST_SENT) {
                handleCancelRequest();
            }
            break;
        }
    } catch (error) {
        console.error("Error processing command in ProfileScreen:", error);
        onSetTtsMessage(getTtsPrompt('error_generic', language));
    } finally {
        onCommandProcessed();
    }
  }, [profileUser, currentUser.id, onCommandProcessed, onSetTtsMessage, language, handleAddFriendAction, friendshipStatus, handleRespondToRequest, handleUnfriend, handleCancelRequest]);

  useEffect(() => {
    if (lastCommand) {
      handleCommand(lastCommand);
    }
  }, [lastCommand, handleCommand]);


  useEffect(() => {
    if (!isProgrammaticScroll.current || posts.length === 0) return;

    const postListContainer = scrollContainerRef.current?.querySelector('#post-list-container');
    if (postListContainer && postListContainer.children.length > currentPostIndex) {
        const cardElement = postListContainer.children[currentPostIndex] as HTMLElement;
        if (cardElement) {
            cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const timeout = setTimeout(() => {
                isProgrammaticScroll.current = false;
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }
  }, [currentPostIndex, posts]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><p className="text-slate-300 text-xl">{t(language, 'common.loading')}</p></div>;
  }

  if (!profileUser) {
    return <div className="flex items-center justify-center h-full"><p className="text-slate-300 text-xl">User not found.</p></div>;
  }

  const isOwnProfile = profileUser.id === currentUser.id;

  const effectiveVisibility = profileUser.privacySettings?.friendListVisibility || 'friends';
  const canViewFriends =
    isOwnProfile ||
    effectiveVisibility === 'public' ||
    (effectiveVisibility === 'friends' && friendshipStatus === FriendshipStatus.FRIENDS);
  
  const renderActionButtons = () => {
    if (isLoadingStatus) {
        return <div className="h-10 w-56 bg-slate-700 animate-pulse rounded-lg" />;
    }

    const baseClasses = "flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50";

    switch (friendshipStatus) {
        case FriendshipStatus.FRIENDS:
            return (
                <div className="relative" ref={actionMenuRef}>
                    <button onClick={() => setIsActionMenuOpen(p => !p)} className={`${baseClasses} bg-slate-700 text-slate-300`}>
                        <Icon name="users" className="w-5 h-5" />
                        {t(language, 'profile.friends')}
                    </button>
                    {isActionMenuOpen && (
                        <div className="absolute top-full right-0 mt-2 w-40 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-10 animate-fade-in-fast">
                            <button onClick={handleUnfriend} className="w-full text-left px-4 py-2 text-red-400 hover:bg-red-500/10">
                                {t(language, 'profile.unfriend')}
                            </button>
                        </div>
                    )}
                </div>
            );
        case FriendshipStatus.REQUEST_SENT:
            return (
                <div className="relative" ref={requestMenuRef}>
                    <button onClick={() => setIsRequestMenuOpen(p => !p)} className={`${baseClasses} bg-slate-700 text-slate-300`}>
                        {t(language, 'profile.requestSent')}
                    </button>
                     {isRequestMenuOpen && (
                        <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-10 animate-fade-in-fast">
                            <button onClick={handleCancelRequest} className="w-full text-left px-4 py-2 text-red-400 hover:bg-red-500/10">
                                {t(language, 'profile.cancelRequest')}
                            </button>
                        </div>
                    )}
                </div>
            );
        case FriendshipStatus.PENDING_APPROVAL:
            return (
                <div className="flex items-center gap-2">
                    <button onClick={() => handleRespondToRequest('decline')} className={`${baseClasses} bg-slate-600 text-white hover:bg-slate-500`}>Decline</button>
                    <button onClick={() => handleRespondToRequest('accept')} className={`${baseClasses} bg-lime-600 text-black hover:bg-lime-500`}><Icon name="add-friend" className="w-5 h-