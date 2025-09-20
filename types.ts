
// --- Enums ---
export enum AppView {
  AUTH, FEED, PROFILE, POST_DETAIL, CREATE_POST, SETTINGS, FRIENDS, CONVERSATIONS, MESSAGE,
  ADS_CENTER, ADMIN_PANEL, SEARCH_RESULTS, LIVE_ROOM, ROOMS_LIST, ROOMS_HUB,
  EXPLORE, REELS, CREATE_REEL, GROUPS_HUB, GROUP_PAGE, MANAGE_GROUP, GROUP_CHAT,
  GROUP_EVENTS, CREATE_EVENT, STORY_VIEWER, CREATE_STORY, STORY_PRIVACY, GROUP_INVITE,
  CALL_SCREEN, CALL_HISTORY, VIDEO_ROOMS_LIST, LIVE_VIDEO_ROOM, MOBILE_MENU
}
export enum AuthMode {
  LOGIN,
  SIGNUP_FULLNAME, SIGNUP_USERNAME, SIGNUP_EMAIL, SIGNUP_PASSWORD, SIGNUP_CONFIRM_PASSWORD,
}
export enum RecordingState { IDLE, RECORDING, PREVIEW, UPLOADING, POSTED }
export enum FriendshipStatus { NOT_FRIENDS, FRIENDS, REQUEST_SENT, PENDING_APPROVAL }
export enum VoiceState { IDLE, LISTENING, PROCESSING }
export type ScrollState = 'up' | 'down' | 'none';
export type ChatTheme = 'default' | 'sunset' | 'ocean' | 'forest' | 'classic';
export type GroupCategory = 'General' | 'Food' | 'Gaming' | 'Music' | 'Technology' | 'Travel' | 'Art & Culture' | 'Sports';
export type StoryPrivacy = 'public' | 'friends';
export type GroupRole = 'Admin' | 'Moderator' | 'Top Contributor';

// --- Interfaces ---
export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  password?: string;
  avatarUrl: string;
  coverPhotoUrl: string;
  bio: string;
  friendIds: string[];
  friendRequestIds?: string[];
  sentFriendRequestIds?: string[];
  blockedUserIds: string[];
  voiceCoins: number;
  role: 'user' | 'admin';
  onlineStatus: 'online' | 'offline';
  lastActiveTimestamp?: string;
  isDeactivated?: boolean;
  isBanned?: boolean;
  commentingSuspendedUntil?: string;
  postingSuspendedUntil?: string;

  // Profile details
  work?: string;
  education?: string;
  currentCity?: string;
  hometown?: string;
  relationshipStatus?: 'Single' | 'In a relationship' | 'Engaged' | 'Married' | "It's complicated" | 'Prefer not to say';

  // Settings
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
}

export interface AdminUser {
    id: string;
    email: string;
}

export interface Author {
    id: string;
    name: string;
    username: string;
    avatarUrl: string;
}

export interface Comment {
  id: string;
  author: Author;
  postId: string;
  type: 'text' | 'image' | 'audio';
  text?: string;
  imageUrl?: string;
  audioUrl?: string;
  duration?: number;
  createdAt: string;
  reactions: { [userId: string]: string }; // userId: emoji
  parentId?: string | null;
}

export interface PollOption {
  text: string;
  votes: number;
  votedBy: string[];
}

export interface Post {
  id: string;
  author: Author;
  caption: string;
  createdAt: string;
  
  // Content types
  audioUrl?: string;
  videoUrl?: string;
  imageUrl?: string;
  duration?: number;
  imagePrompt?: string; // For AI generated images
  postType?: 'profile_picture_change' | 'cover_photo_change' | 'announcement' | 'question' | 'poll';
  newPhotoUrl?: string;
  poll?: {
    question: string;
    options: PollOption[];
  };
  captionStyle?: {
    fontFamily: string;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
  };
  
  // Engagement
  reactions: { [userId: string]: string }; // userId: emoji
  commentCount: number;
  comments: Comment[];
  bestAnswerId?: string;

  // Sponsorship
  isSponsored?: boolean;
  sponsorName?: string;
  campaignId?: string;
  websiteUrl?: string;
  allowDirectMessage?: boolean;
  allowLeadForm?: boolean;

  // Group context
  groupId?: string;
  groupName?: string;
  status?: 'approved' | 'pending' | 'rejected'; // For group posts needing approval
  feeling?: { emoji: string; text: string };
}

export interface Message {
  id: string;
  senderId: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'call';
  text?: string;
  mediaUrl?: string;
  audioUrl?: string;
  duration?: number;
  createdAt: string;
  isDeleted?: boolean;
  reactions: { [emoji: string]: string[] }; // emoji: [userIds]
  replyTo?: ReplyInfo | null;
  callInfo?: {
    type: 'audio' | 'video';
    duration?: number; // in seconds
    status: 'missed' | 'declined' | 'completed';
  };
}

export interface ReplyInfo {
    messageId: string;
    senderName: string;
    content: string;
}

export interface Conversation {
  chatId: string;
  peer: User;
  lastMessage: Message | null;
  unreadCount: number;
}

export interface NLUResponse {
  intent: string;
  slots?: { [key: string]: string | number };
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
  createdAt: string;
  status: 'pending' | 'active' | 'finished' | 'rejected';
  rejectionReason?: string;
  views: number;
  clicks: number;
  transactionId: string;
  paymentStatus: 'pending' | 'verified' | 'failed';
  paymentVerifiedBy?: string; // Admin user ID
  adType: 'feed' | 'story';
  targeting?: {
    location?: string;
    gender?: 'Male' | 'Female' | 'All';
    ageRange?: string;
    interests?: string[];
  };
}

export interface Lead {
    id: string;
    campaignId: string;
    userId: string;
    userName: string;
    userEmail: string;
    userPhone?: string;
    createdAt: string;
}

export interface Notification {
    id: string;
    userId: string;
    type: 'like' | 'comment' | 'friend_request' | 'campaign_approved' | 'campaign_rejected' | 'group_post' | 'group_join_request' | 'group_request_approved' | 'admin_announcement' | 'admin_warning';
    user: { id: string, name: string, avatarUrl: string }; // User who triggered the notification
    postId?: string;
    campaignName?: string;
    rejectionReason?: string;
    groupName?: string;
    message?: string;
    createdAt: string;
    read: boolean;
}

export interface ChatSettings {
    theme: ChatTheme;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  url: string;
  language: 'bangla' | 'hindi';
}

export interface LiveAudioRoom {
    id: string;
    topic: string;
    host: User;
    speakers: User[];
    listeners: User[];
    raisedHands: string[]; // array of user IDs
}

export interface LiveVideoRoom {
    id: string;
    topic: string;
    host: User;
    participants: User[];
}

export interface VideoParticipantState extends User {
    isMuted: boolean;
    isCameraOff: boolean;
}

export interface StoryTextStyle {
    name: string;
    backgroundColor: string;
    fontFamily: string;
    color: string;
    textAlign: 'left' | 'center' | 'right';
}

export interface Story {
    id: string;
    author: Author;
    type: 'image' | 'video' | 'text' | 'voice';
    contentUrl?: string;
    text?: string;
    textStyle?: StoryTextStyle;
    duration: number; // in seconds
    createdAt: string;
    viewedBy: string[]; // user IDs
    music?: MusicTrack;
    privacy: StoryPrivacy;
    // For sponsored stories
    isSponsored?: boolean;
    sponsorName?: string;
    sponsorAvatar?: string;
    ctaLink?: string;
}

export interface Group {
    id: string;
    name: string;
    description: string;
    coverPhotoUrl: string;
    creator: User;
    admins: User[];
    moderators: User[];
    members: User[];
    memberCount: number;
    privacy: 'public' | 'private';
    createdAt: string;
    category: GroupCategory;
    requiresApproval: boolean; // For posts
    joinQuestions?: string[];
    joinRequests?: JoinRequest[];
    invitedUserIds?: string[];
    pendingPosts?: Post[];
    pinnedPostId?: string;
    topContributorIds?: string[];
}

export interface JoinRequest {
    user: User;
    answers?: string[];
    requestedAt: string;
}

export interface Event {
    id: string;
    groupId: string;
    title: string;
    description: string;
    date: string; // ISO string
    createdBy: User;
    attendees: User[];
}

export interface GroupChat {
    id: string;
    groupId: string;
    messages: GroupChatMessage[];
}

export interface GroupChatMessage {
    id: string;
    sender: User;
    text: string;
    createdAt: string;
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
    createdAt: string;
    status: 'pending' | 'resolved';
    resolution?: string;
}

export interface Call {
  id: string;
  caller: User;
  callee: User;
  chatId: string;
  type: 'audio' | 'video';
  status: 'dialing' | 'ringing' | 'connected' | 'ended' | 'missed' | 'declined';
  startedAt: string;
  endedAt?: string;
}
