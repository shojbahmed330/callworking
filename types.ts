// This file was regenerated to fix module resolution errors.

export type Author = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
};

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl: string;
  coverPhotoUrl: string;
  bio: string;
  friendIds: string[];
  blockedUserIds: string[];
  role?: 'admin' | 'user';
  voiceCoins?: number;
  isDeactivated?: boolean;
  isBanned?: boolean;
  commentingSuspendedUntil?: string;
  postingSuspendedUntil?: string;
  work?: string;
  education?: string;
  currentCity?: string;
  hometown?: string;
  relationshipStatus?: 'Single' | 'In a relationship' | 'Engaged' | 'Married' | "It's complicated" | 'Prefer not to say';
  privacySettings: {
    postVisibility: 'public' | 'friends';
    friendRequestPrivacy: 'everyone' | 'friends_of_friends';
    friendListVisibility: 'public' | 'friends' | 'only_me';
  };
  notificationSettings: {
    likes: boolean;
    comments: boolean;
    friendRequests: boolean;
    campaignUpdates: boolean;
    groupPosts: boolean;
  };
  onlineStatus?: 'online' | 'offline';
  lastActiveTimestamp?: string;
  password?: string; // Should not be sent to client in real app
  // FIX: Add optional friendshipStatus for context-dependent views like friend suggestions.
  friendshipStatus?: FriendshipStatus;
}

export interface AdminUser {
    id: string;
    email: string;
}


export interface Post {
  id: string;
  author: Author;
  caption: string;
  createdAt: string;
  audioUrl?: string;
  videoUrl?: string;
  imageUrl?: string;
  newPhotoUrl?: string;
  imagePrompt?: string;
  duration?: number;
  commentCount: number;
  comments: Comment[];
  reactions: { [userId: string]: string }; // userId: emoji
  isSponsored?: boolean;
  sponsorId?: string;
  sponsorName?: string;
  campaignId?: string;
  websiteUrl?: string;
  allowDirectMessage?: boolean;
  allowLeadForm?: boolean;
  postType?: 'audio' | 'image' | 'video' | 'text' | 'profile_picture_change' | 'cover_photo_change' | 'announcement' | 'question';
  status?: 'pending' | 'approved';
  groupId?: string;
  groupName?: string;
  feeling?: { emoji: string, text: string };
  poll?: {
    question: string;
    options: PollOption[];
  };
  bestAnswerId?: string;
  captionStyle?: {
    fontFamily: string;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
  };
  likedBy?: string[];
}

export interface Comment {
  id: string;
  author: Author;
  text?: string;
  createdAt: string;
  reactions: { [userId: string]: string };
  parentId: string | null;
  type: 'text' | 'image' | 'audio';
  imageUrl?: string;
  audioUrl?: string;
  duration?: number;
  postId: string;
}

export interface ReplyInfo {
  messageId: string;
  senderName: string;
  content: string;
}

export interface Message {
  id: string;
  // FIX: Replace senderId with a full sender object for consistency.
  sender: Author;
  text?: string;
  createdAt: string;
  type: 'text' | 'image' | 'video' | 'audio';
  isDeleted?: boolean;
  mediaUrl?: string;
  audioUrl?: string;
  duration?: number;
  reactions?: { [emoji: string]: string[] }; // emoji: userId[]
  replyTo?: ReplyInfo;
}

export interface Conversation {
    peer: User;
    lastMessage: Message | null;
    unreadCount: number;
}

export enum FriendshipStatus {
  NOT_FRIENDS,
  FRIENDS,
  REQUEST_SENT, // Current user sent a request to the profile user
  PENDING_APPROVAL, // Profile user sent a request to the current user
}

export enum AppView {
    AUTH,
    FEED,
    EXPLORE,
    REELS,
    CREATE_POST,
    CREATE_REEL,
    CREATE_COMMENT,
    PROFILE,
    SETTINGS,
    POST_DETAILS,
    FRIENDS,
    SEARCH_RESULTS,
    CONVERSATIONS,
    ADS_CENTER,
    ROOMS_HUB,
    ROOMS_LIST,
    LIVE_ROOM,
    VIDEO_ROOMS_LIST,
    LIVE_VIDEO_ROOM,
    GROUPS_HUB,
    GROUP_PAGE,
    MANAGE_GROUP,
    GROUP_CHAT,
    GROUP_EVENTS,
    CREATE_EVENT,
    CREATE_STORY,
    STORY_VIEWER,
    STORY_PRIVACY,
    GROUP_INVITE,
    CALL_SCREEN,
    MOBILE_MENU,
}

export enum VoiceState {
  IDLE,
  LISTENING,
  PROCESSING,
}

export enum ScrollState {
  UP = 'up',
  DOWN = 'down',
  NONE = 'none',
}

export enum AuthMode {
  LOGIN,
  SIGNUP_FULLNAME,
  SIGNUP_USERNAME,
  SIGNUP_EMAIL,
  SIGNUP_PASSWORD,
  SIGNUP_CONFIRM_PASSWORD,
}

export enum RecordingState {
  IDLE,
  RECORDING,
  PREVIEW,
  UPLOADING,
  POSTED,
}

export interface NLUResponse {
  intent: string;
  slots?: { [key: string]: string | number | boolean };
}

export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'friend_request' | 'friend_request_approved' | 'campaign_approved' | 'campaign_rejected' | 'group_post' | 'group_join_request' | 'group_request_approved' | 'admin_announcement' | 'admin_warning';
  user: Author;
  post?: Partial<Post>;
  createdAt: string;
  read: boolean;
  campaignName?: string;
  rejectionReason?: string;
  groupId?: string;
  groupName?: string;
  message?: string;
}

export interface Campaign {
  id: string;
  sponsorId: string;
  sponsorName: string;
  caption: string;
  budget: number;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  websiteUrl?: string;
  allowDirectMessage: boolean;
  allowLeadForm: boolean;
  views: number;
  clicks: number;
  status: 'pending' | 'active' | 'finished' | 'rejected';
  createdAt: string;
  transactionId: string;
  paymentStatus: 'pending' | 'verified' | 'failed';
  paymentVerifiedBy?: string;
  adType: 'feed' | 'story';
  targeting: {
      location?: string;
      gender?: 'Male' | 'Female' | 'All';
      ageRange?: string;
      interests?: string[];
  };
}

export interface Lead {
    id: string;
    campaignId: string;
    sponsorId: string;
    userName: string;
    userEmail: string;
    userPhone?: string;
    createdAt: string;
}

export type ChatTheme = 'default' | 'sunset' | 'ocean' | 'forest' | 'classic';

export interface ChatSettings {
    theme: ChatTheme;
}

export interface Speaker {
    id: string;
    name: string;
    avatarUrl: string;
    isMuted: boolean;
    isSpeaking: boolean;
}

export interface Listener {
    id: string;
    name: string;
    avatarUrl: string;
}

export interface LiveAudioRoom {
    id: string;
    topic: string;
    host: User;
    speakers: Speaker[];
    listeners: Listener[];
    raisedHands: string[]; // userIds
    createdAt: string;
}

export interface VideoParticipantState {
    id: string;
    name: string;
    avatarUrl: string;
    isMuted: boolean;
    isCameraOff: boolean;
}

export interface LiveVideoRoom {
    id: string;
    topic: string;
    host: User;
    participants: VideoParticipantState[];
    createdAt: string;
}

export type GroupCategory = 'General' | 'Food' | 'Gaming' | 'Music' | 'Technology' | 'Travel' | 'Art & Culture' | 'Sports';

export type GroupRole = 'Admin' | 'Moderator' | 'Top Contributor';

export interface Group {
    id: string;
    name: string;
    description: string;
    creator: User;
    members: User[];
    admins: User[];
    moderators: User[];
    memberCount: number;
    coverPhotoUrl: string;
    privacy: 'public' | 'private';
    requiresApproval: boolean;
    category: GroupCategory;
    joinQuestions?: string[];
    joinRequests?: JoinRequest[];
    invitedUserIds?: string[];
    pendingPosts?: Post[];
    pinnedPostId?: string | null;
    topContributorIds?: string[];
}

export interface GroupChat {
    id: string; // same as groupId
    messages: Message[];
}

export interface Event {
    id: string;
    groupId: string;
    creator: User;
    title: string;
    description: string;
    date: string;
    attendees: User[];
}

export interface JoinRequest {
    user: User;
    answers?: string[];
    createdAt: string;
}

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  language: 'bangla' | 'hindi';
  url: string;
};

export type StoryPrivacy = 'public' | 'friends' | 'custom';

export interface StoryTextStyle {
    name: string;
    backgroundColor: string;
    fontFamily: string;
    color: string;
    textAlign: 'left' | 'center' | 'right';
}

export interface Story {
  id: string;
  author: User;
  type: 'image' | 'video' | 'text' | 'voice';
  contentUrl?: string; // for image, video, voice
  text?: string;       // for text stories
  textStyle?: StoryTextStyle;
  duration: number;   // in seconds
  createdAt: string;
  viewers: string[]; // userIds
  music?: MusicTrack;
  privacy: StoryPrivacy;
  isSponsored?: boolean;
  sponsorName?: string;
  sponsorAvatar?: string;
  ctaLink?: string;
}

export interface PollOption {
    text: string;
    votes: number;
    votedBy: string[];
}

export interface CategorizedExploreFeed {
    trending: Post[];
    forYou: Post[];
    questions: Post[];
    funnyVoiceNotes: Post[];
    newTalent: Post[];
}

export interface Report {
    id: string;
    reporterId: string;
    reporterName: string;
    reportedUserId: string;
    reportedContentId: string;
    reportedContentType: 'post' | 'comment' | 'user';
    reason: string;
    status: 'pending' | 'resolved';
    createdAt: string;
    resolution?: string;
}

export interface Call {
  id: string;
  caller: User;
  callee: User;
  chatId: string;
  type: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'declined';
  createdAt: string;
  endedAt?: string;
}
