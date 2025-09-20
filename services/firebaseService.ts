import { User, Post, Campaign, Story, FriendshipStatus, Comment, Message, Conversation, ChatSettings, LiveAudioRoom, LiveVideoRoom, Group, Event, GroupChat, JoinRequest, GroupCategory, StoryPrivacy, PollOption, AdminUser, CategorizedExploreFeed, Report, ReplyInfo, Author, Call, CallHistoryEntry, Lead } from '../types';
import { DEFAULT_AVATARS, DEFAULT_COVER_PHOTOS } from '../constants';


// --- Mock Data Store ---
const MOCK_DB = {
    users: {
        'user_shojib': {
            id: 'user_shojib',
            name: 'Shojib Khan',
            username: 'shojib',
            email: 'shojib@test.com',
            password: 'password', // For mock validation
            avatarUrl: 'https://i.pravatar.cc/150?u=shojib',
            coverPhotoUrl: 'https://picsum.photos/seed/shojib_cover/1200/400',
            bio: 'Welcome to my VoiceBook profile!',
            friendIds: ['user_jane', 'user_alex'],
            friendRequestIds: [],
            sentFriendRequestIds: [],
            blockedUserIds: [],
            voiceCoins: 150,
            role: 'user',
            onlineStatus: 'online',
            lastActiveTimestamp: new Date().toISOString(),
            work: 'Software Engineer',
            education: 'AI Studio University',
            currentCity: 'Dhaka',
            hometown: 'Chittagong',
            relationshipStatus: 'Single',
            privacySettings: { postVisibility: 'public', friendRequestPrivacy: 'everyone', friendListVisibility: 'public' },
            notificationSettings: { likes: true, comments: true, friendRequests: true, campaignUpdates: true, groupPosts: true },
        },
        'user_jane': {
            id: 'user_jane',
            name: 'Jane Doe',
            username: 'janedoe',
            email: 'jane@test.com',
            avatarUrl: 'https://i.pravatar.cc/150?u=jane',
            coverPhotoUrl: 'https://picsum.photos/seed/jane_cover/1200/400',
            bio: 'Exploring the world, one voice at a time.',
            friendIds: ['user_shojib'],
            blockedUserIds: [],
            voiceCoins: 200,
            role: 'user',
            onlineStatus: 'online',
            lastActiveTimestamp: new Date().toISOString(),
             privacySettings: { postVisibility: 'public', friendRequestPrivacy: 'everyone', friendListVisibility: 'public' },
            notificationSettings: { likes: true, comments: true, friendRequests: true, campaignUpdates: true, groupPosts: true },
        },
         'user_alex': {
            id: 'user_alex',
            name: 'Alex Ray',
            username: 'alexray',
            email: 'alex@test.com',
            avatarUrl: 'https://i.pravatar.cc/150?u=alex',
            coverPhotoUrl: 'https://picsum.photos/seed/alex_cover/1200/400',
            bio: 'Music and code.',
            friendIds: ['user_shojib'],
            blockedUserIds: [],
            voiceCoins: 50,
            role: 'user',
            onlineStatus: 'offline',
            lastActiveTimestamp: new Date(Date.now() - 3600 * 1000).toISOString(),
            privacySettings: { postVisibility: 'public', friendRequestPrivacy: 'everyone', friendListVisibility: 'public' },
            notificationSettings: { likes: true, comments: true, friendRequests: true, campaignUpdates: true, groupPosts: true },
        }
    } as Record<string, User>,
    posts: [
        {
            id: 'post1',
            author: { id: 'user_jane', name: 'Jane Doe', username: 'janedoe', avatarUrl: 'https://i.pravatar.cc/150?u=jane' },
            caption: 'Just recorded my first voice post! Feeling excited. What do you guys think?',
            createdAt: new Date(Date.now() - 3600 * 2000).toISOString(),
            audioUrl: 'https://cdn.pixabay.com/audio/2022/11/17/audio_83a21a9323.mp3',
            duration: 15,
            reactions: { 'user_shojib': '❤️' },
            commentCount: 1,
            comments: [
                { id: 'comment1', postId: 'post1', author: {id: 'user_shojib', name: 'Shojib Khan', username: 'shojib', avatarUrl: 'https://i.pravatar.cc/150?u=shojib'}, type: 'text', text: 'Sounds great, Jane!', createdAt: new Date().toISOString(), reactions: {}}
            ],
        },
        {
            id: 'post2',
            author: { id: 'user_shojib', name: 'Shojib Khan', username: 'shojib', avatarUrl: 'https://i.pravatar.cc/150?u=shojib' },
            caption: 'Generated this cool image with the new AI feature! Prompt: "A neon cat DJing in a futuristic city".',
            createdAt: new Date(Date.now() - 3600 * 5000).toISOString(),
            imageUrl: 'https://storage.googleapis.com/gweb-aip.appspot.com/generators/gemini-generator/2024-03-21/13:14:21.214051_225667.jpg',
            imagePrompt: 'A neon cat DJing in a futuristic city',
            reactions: { 'user_jane': '😮', 'user_alex': '👍' },
            commentCount: 0,
            comments: [],
        }
    ] as Post[],
    calls: {} as Record<string, Call>
};

// --- Mock Auth State Management ---
let mockAuthUser: { uid: string; email: string } | null = null;
const authStateListeners: ((user: { uid: string; email: string } | null) => void)[] = [];

const notifyAuthStateListeners = () => {
  authStateListeners.forEach(callback => callback(mockAuthUser));
};


export const firebaseService = {
  // --- AUTH ---
  async signInWithEmail(identifier: string, pass: string): Promise<User | null> {
    console.log(`Firebase Mock: Attempting to sign in with ${identifier}`);
    const user = Object.values(MOCK_DB.users).find(u => (u.email === identifier || u.username === identifier) && u.password === pass);
    if (user) {
        mockAuthUser = { uid: user.id, email: user.email };
        notifyAuthStateListeners();
        return user;
    }
    throw new Error("Invalid credentials. Please try again.");
  },
  async signUpWithEmail(email: string, pass: string, fullName: string, username: string): Promise<boolean> {
     console.log(`Firebase Mock: Signing up ${email}`);
     const isTaken = Object.values(MOCK_DB.users).some(u => u.username === username || u.email === email);
     if (isTaken) throw new Error("Email or username is already taken.");
     
     const newId = `user_${Date.now()}`;
     const newUser: User = {
        id: newId, name: fullName, username, email, password: pass,
        avatarUrl: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
        coverPhotoUrl: DEFAULT_COVER_PHOTOS[Math.floor(Math.random() * DEFAULT_COVER_PHOTOS.length)],
        bio: 'New to VoiceBook!', friendIds: [], blockedUserIds: [], voiceCoins: 20, role: 'user', onlineStatus: 'online',
        privacySettings: { postVisibility: 'public', friendRequestPrivacy: 'everyone', friendListVisibility: 'public' },
        notificationSettings: { likes: true, comments: true, friendRequests: true, campaignUpdates: true, groupPosts: true },
        lastActiveTimestamp: new Date().toISOString(),
        friendRequestIds: [], sentFriendRequestIds: []
     };
     MOCK_DB.users[newId] = newUser;
     mockAuthUser = { uid: newId, email };
     notifyAuthStateListeners();
     return true;
  },
  onAuthStateChanged(callback: (user: { uid: string; email: string } | null) => void) {
     console.log('Firebase Mock: Attaching auth state listener.');
     authStateListeners.push(callback);
     setTimeout(() => callback(mockAuthUser), 500); // Simulate network delay
     return () => {
         const index = authStateListeners.indexOf(callback);
         if (index > -1) authStateListeners.splice(index, 1);
     };
  },
  signOut: async () => {
     console.log('Firebase Mock: Signing out.');
     mockAuthUser = null;
     notifyAuthStateListeners();
  },
   async isUsernameTaken(username: string): Promise<boolean> {
     return Object.values(MOCK_DB.users).some(u => u.username === username);
  },

  // --- USERS ---
  async getUserProfile(uid: string): Promise<User | null> {
    console.log(`Firebase Mock: Getting profile for ${uid}`);
    return MOCK_DB.users[uid] || null;
  },
   async getUserProfileById(uid: string): Promise<User | null> {
    return MOCK_DB.users[uid] || null;
  },
  listenToUserProfile(username: string, callback: (user: User | null) => void) {
      console.log(`Firebase Mock: Listening to profile for ${username}`);
      const user = Object.values(MOCK_DB.users).find(u => u.username === username);
      callback(user || null);
      return () => {};
  },
  async getUsersByIds(uids: string[]): Promise<User[]> {
    return uids.map(id => MOCK_DB.users[id]).filter(Boolean);
  },

  // --- POSTS & COMMENTS ---
  listenToFeedPosts(userId: string, friendIds: string[], blockedIds: string[], callback: (posts: Post[]) => void) {
    console.log("Firebase Mock: Listening to feed for", userId);
    callback(MOCK_DB.posts);
    return () => {};
  },
   async getPostsByUser(userId: string): Promise<Post[]> {
      return MOCK_DB.posts.filter(p => p.author.id === userId);
   },
  listenToPost(postId: string, callback: (post: Post | null) => void) {
    console.log("Firebase Mock: Listening to post", postId);
    const post = MOCK_DB.posts.find(p => p.id === postId) || null;
    callback(post);
    return () => {};
  },
   async createPost(postData: any, media: any): Promise<Post | null> { return null; },
   async createComment(user: User, postId: string, content: any): Promise<Comment | null> { return null; },
   async editComment(postId: string, commentId: string, newText: string): Promise<void> {},
   async deleteComment(postId: string, commentId: string): Promise<void> {},
   async reactToPost(postId: string, userId: string, emoji: string): Promise<void> {},
   async reactToComment(postId: string, commentId: string, userId: string, emoji: string): Promise<void> {},

  // --- FRIENDS ---
  listenToFriends(userId: string, callback: (friends: User[]) => void) {
    console.log(`Firebase Mock: Listening to friends for ${userId}`);
    const user = MOCK_DB.users[userId];
    if (user && user.friendIds) {
      const friends = user.friendIds.map(id => MOCK_DB.users[id]).filter(Boolean);
      callback(friends);
    }
    return () => {};
  },
  listenToFriendRequests(userId: string, callback: (requests: User[]) => void) {
    console.log(`Firebase Mock: Listening to friend requests for ${userId}`);
    callback([]);
    return () => {};
  },

  // --- CALLS ---
  listenForIncomingCalls(userId: string, callback: (call: Call | null) => void) {
    console.log(`Firebase Mock: Listening for incoming calls for ${userId}`);
    // Simulate an incoming call after 15 seconds for demonstration
    setTimeout(() => {
        const caller = MOCK_DB.users['user_jane'];
        const callee = MOCK_DB.users[userId];
        if (caller && callee) {
            const callId = `call_${Date.now()}`;
            const newCall: Call = {
                id: callId,
                caller: caller,
                callee: callee,
                chatId: 'mock_chat_id',
                type: 'audio',
                status: 'ringing',
                startedAt: new Date().toISOString(),
            };
            MOCK_DB.calls[callId] = newCall;
            callback(newCall);

            // Simulate caller hanging up after 10s if not answered
            setTimeout(() => {
                if (MOCK_DB.calls[callId]?.status === 'ringing') {
                     MOCK_DB.calls[callId].status = 'missed';
                     callback(null);
                }
            }, 10000);
        }
    }, 15000);

    return () => {};
  },
  listenToCall(callId: string, callback: (call: Call | null) => void) {
    console.log(`Firebase Mock: Listening to call ${callId}`);
    callback(MOCK_DB.calls[callId] || null);
    // In a real app, this would be a realtime listener
    return () => {};
  },
  listenToCallHistory(userId: string, callback: (history: CallHistoryEntry[]) => void) {
    console.log(`Firebase Mock: Listening to call history for ${userId}`);
    // Return some mock history
     const mockHistory: CallHistoryEntry[] = [
        { id: 'hist1', peer: MOCK_DB.users['user_alex'], type: 'audio', direction: 'outgoing', status: 'completed', timestamp: new Date(Date.now() - 86400000).toISOString(), duration: 125 },
        { id: 'hist2', peer: MOCK_DB.users['user_jane'], type: 'video', direction: 'incoming', status: 'missed', timestamp: new Date(Date.now() - 3600000).toISOString() },
    ];
    callback(mockHistory);
    return () => {};
  },
  async createCall(caller: User, callee: User, chatId: string, type: 'audio' | 'video'): Promise<string> {
    const callId = `call_${Date.now()}`;
    MOCK_DB.calls[callId] = { id: callId, caller, callee, chatId, type, status: 'dialing', startedAt: new Date().toISOString() };
    console.log(`Firebase Mock: Creating ${type} call ${callId} from ${caller.name} to ${callee.name}`);
    // Simulate ringing after a short delay
    setTimeout(() => {
        if (MOCK_DB.calls[callId]) MOCK_DB.calls[callId].status = 'ringing';
    }, 1500);
    return callId;
  },
  async updateCallStatus(callId: string, status: Call['status']): Promise<void> {
    console.log(`Firebase Mock: Updating call ${callId} status to ${status}`);
     if (MOCK_DB.calls[callId]) {
         MOCK_DB.calls[callId].status = status;
         if (status === 'ended' || status === 'declined' || status === 'missed') {
             MOCK_DB.calls[callId].endedAt = new Date().toISOString();
         }
     }
  },
  async updateCallDuration(callId: string, duration: number): Promise<void> {
      if (MOCK_DB.calls[callId]) {
         MOCK_DB.calls[callId].duration = duration;
     }
  },
  
  // --- OTHER MOCKS (placeholders) ---
  async getAgoraToken(channelName: string, uid: string | number): Promise<string | null> { return "mock_agora_token"; },
  getChatId: (user1Id: string, user2Id: string) => (user1Id < user2Id ? `${user1Id}_${user2Id}` : `${user2Id}_${user1Id}`),
  listenToConversations: (userId: string, callback: (convos: Conversation[]) => void) => { callback([]); return () => {}; },
  listenToMessages: (chatId: string, callback: (messages: Message[]) => void) => { callback([]); return () => {}; },
  sendMessage: async (chatId: string, sender: User, recipient: User, messageContent: any) => {},
  unsendMessage: async (chatId: string, messageId: string, userId: string) => {},
  reactToMessage: async (chatId: string, messageId: string, userId: string, emoji: string) => {},
  deleteChatHistory: async (chatId: string) => {},
  getChatSettings: async (chatId: string) => null,
  updateChatSettings: async (chatId: string, settings: Partial<ChatSettings>) => {},
  markMessagesAsRead: async (chatId: string, userId: string) => {},
  async checkFriendshipStatus(currentUserId: string, profileUserId: string): Promise<FriendshipStatus> { return FriendshipStatus.NOT_FRIENDS; },
  async addFriend(currentUserId: string, targetUserId: string): Promise<{ success: boolean; reason?: string }> { return { success: true }; },
  async unfriendUser(currentUserId: string, targetUserId: string): Promise<boolean> { return true; },
  async cancelFriendRequest(currentUserId: string, targetUserId: string): Promise<boolean> { return true; },
  async getCommonFriends(userId1: string, userId2: string): Promise<User[]> { return []; },
  async updateProfile(userId: string, updates: Partial<User>): Promise<void> {},
  async updateProfilePicture(userId: string, base64: string, caption?: string, captionStyle?: Post['captionStyle']): Promise<{ updatedUser: User; newPost: Post } | null> { return null; },
  async updateCoverPhoto(userId: string, base64: string, caption?: string, captionStyle?: Post['captionStyle']): Promise<{ updatedUser: User; newPost: Post } | null> { return null; },
  async blockUser(currentUserId: string, targetUserId: string): Promise<boolean> { return true; },
  async unblockUser(currentUserId: string, targetUserId: string): Promise<boolean> { return true; },
  async deactivateAccount(userId: string): Promise<boolean> { return true; },
  async updateVoiceCoins(userId: string, amount: number): Promise<boolean> { return true; },
  async getInjectableStoryAd(currentUser: User): Promise<Story | null> { return null; },
  async getStories(currentUserId: string): Promise<{ author: User; stories: Story[]; allViewed: boolean; }[]> { return []; },
  async markStoryAsViewed(storyId: string, userId: string): Promise<void> {},
  async createStory(storyData: any, mediaFile: File | null): Promise<Story | null> { return null; },
  async getInjectableAd(currentUser: User): Promise<Post | null> { return null; },
  async trackAdView(campaignId: string): Promise<void> {},
  async getLeadsForCampaign(campaignId: string): Promise<Lead[]> { return []; },
  async submitLead(campaignId: string, user: User, leadData: { name: string; email: string; phone?: string; }): Promise<void> {},

  // FIX: Added mock implementations for missing methods
  getFriendRequests: async (userId: string): Promise<User[]> => { console.log('Mock: getFriendRequests'); return []; },
  acceptFriendRequest: async (currentUserId: string, requestingUserId: string): Promise<void> => { console.log('Mock: acceptFriendRequest'); },
  declineFriendRequest: async (currentUserId: string, requestingUserId: string): Promise<void> => { console.log('Mock: declineFriendRequest'); },
  getAllUsersForAdmin: async (): Promise<User[]> => { console.log('Mock: getAllUsersForAdmin'); return Object.values(MOCK_DB.users); },
  searchUsers: async (query: string): Promise<User[]> => {
    console.log(`Mock: searchUsers for "${query}"`);
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    return Object.values(MOCK_DB.users).filter(u => u.name.toLowerCase().includes(lowerQuery) || u.username.toLowerCase().includes(lowerQuery));
  },
  listenToLiveAudioRooms: (callback: (rooms: LiveAudioRoom[]) => void) => { console.log('Mock: listenToLiveAudioRooms'); callback([]); return () => {}; },
  listenToLiveVideoRooms: (callback: (rooms: LiveVideoRoom[]) => void) => { console.log('Mock: listenToLiveVideoRooms'); callback([]); return () => {}; },
  listenToRoom: (roomId: string, type: 'audio' | 'video', callback: (room: any) => void) => { console.log('Mock: listenToRoom'); callback(null); return () => {}; },
  createLiveAudioRoom: async (host: User, topic: string): Promise<LiveAudioRoom | null> => { console.log('Mock: createLiveAudioRoom'); return null; },
  createLiveVideoRoom: async (host: User, topic: string): Promise<LiveVideoRoom | null> => { console.log('Mock: createLiveVideoRoom'); return null; },
  joinLiveAudioRoom: async (userId: string, roomId: string): Promise<void> => { console.log('Mock: joinLiveAudioRoom'); },
  joinLiveVideoRoom: async (userId: string, roomId: string): Promise<void> => { console.log('Mock: joinLiveVideoRoom'); },
  leaveLiveAudioRoom: async (userId: string, roomId: string): Promise<void> => { console.log('Mock: leaveLiveAudioRoom'); },
  leaveLiveVideoRoom: async (userId: string, roomId: string): Promise<void> => { console.log('Mock: leaveLiveVideoRoom'); },
  endLiveAudioRoom: async (userId: string, roomId: string): Promise<void> => { console.log('Mock: endLiveAudioRoom'); },
  endLiveVideoRoom: async (userId: string, roomId: string): Promise<void> => { console.log('Mock: endLiveVideoRoom'); },
  getAudioRoomDetails: async (roomId: string): Promise<LiveAudioRoom | null> => { console.log('Mock: getAudioRoomDetails'); return null; },
  raiseHandInAudioRoom: async (userId: string, roomId: string): Promise<void> => { console.log('Mock: raiseHandInAudioRoom'); },
  inviteToSpeakInAudioRoom: async (hostId: string, userId: string, roomId: string): Promise<void> => { console.log('Mock: inviteToSpeakInAudioRoom'); },
  moveToAudienceInAudioRoom: async (hostId: string, userId: string, roomId: string): Promise<void> => { console.log('Mock: moveToAudienceInAudioRoom'); },
  getCampaignsForSponsor: async (sponsorId: string): Promise<Campaign[]> => { console.log('Mock: getCampaignsForSponsor'); return []; },
  submitCampaignForApproval: async (campaignData: Omit<Campaign, 'id'|'views'|'clicks'|'status'|'transactionId'>, transactionId: string): Promise<void> => { console.log('Mock: submitCampaignForApproval'); },
  getRandomActiveCampaign: async (): Promise<Campaign | null> => { console.log('Mock: getRandomActiveCampaign'); return null; },
  getGroupById: async (groupId: string): Promise<Group | null> => { console.log('Mock: getGroupById'); return null; },
  getSuggestedGroups: async (userId: string): Promise<Group[]> => { console.log('Mock: getSuggestedGroups'); return []; },
  createGroup: async (creator: any, name: any, description: any, coverPhotoUrl: any, privacy: any, requiresApproval: any, category: any): Promise<Group | null> => { console.log('Mock: createGroup'); return null; },
  joinGroup: async (userId: any, groupId: any, answers: any): Promise<boolean> => { console.log('Mock: joinGroup'); return true; },
  leaveGroup: async (userId: any, groupId: any): Promise<boolean> => { console.log('Mock: leaveGroup'); return true; },
  getPostsForGroup: async (groupId: any): Promise<Post[]> => { console.log('Mock: getPostsForGroup'); return []; },
  updateGroupSettings: async (groupId: any, settings: any): Promise<boolean> => { console.log('Mock: updateGroupSettings'); return true; },
  pinPost: async (groupId: any, postId: any): Promise<boolean> => { console.log('Mock: pinPost'); return true; },
  unpinPost: async (groupId: any): Promise<boolean> => { console.log('Mock: unpinPost'); return true; },
  voteOnPoll: async (userId: any, postId: any, optionIndex: any): Promise<Post | null> => { console.log('Mock: voteOnPoll'); return null; },
  markBestAnswer: async (userId: any, postId: any, commentId: any): Promise<Post | null> => { console.log('Mock: markBestAnswer'); return null; },
  inviteFriendToGroup: async (groupId: any, friendId: any): Promise<boolean> => { console.log('Mock: inviteFriendToGroup'); return true; },
  getGroupChat: async (groupId: string): Promise<GroupChat | null> => { console.log('Mock: getGroupChat'); return null; },
  sendGroupChatMessage: async (groupId: any, sender: any, text: any): Promise<any> => { console.log('Mock: sendGroupChatMessage'); return {id: Date.now().toString(), sender, text, createdAt: new Date().toISOString()}; },
  getGroupEvents: async (groupId: string): Promise<Event[]> => { console.log('Mock: getGroupEvents'); return []; },
  createGroupEvent: async (creator: any, groupId: any, title: any, description: any, date: any): Promise<Event | null> => { console.log('Mock: createGroupEvent'); return null; },
  rsvpToEvent: async (userId: any, eventId: any): Promise<boolean> => { console.log('Mock: rsvpToEvent'); return true; },
  adminLogin: async (email: any, password: any): Promise<AdminUser | null> => { console.log('Mock: adminLogin'); return null; },
  adminRegister: async (email: any, password: any): Promise<AdminUser | null> => { console.log('Mock: adminRegister'); return null; },
  getAdminDashboardStats: async (): Promise<any> => { console.log('Mock: getAdminDashboardStats'); return {}; },
  updateUserRole: async (userId: any, newRole: any): Promise<boolean> => { console.log('Mock: updateUserRole'); return true; },
  getPendingCampaigns: async (): Promise<Campaign[]> => { console.log('Mock: getPendingCampaigns'); return []; },
  approveCampaign: async (campaignId: any): Promise<void> => { console.log('Mock: approveCampaign'); },
  rejectCampaign: async (campaignId: any, reason: any): Promise<void> => { console.log('Mock: rejectCampaign'); },
  getAllPostsForAdmin: async (): Promise<Post[]> => { console.log('Mock: getAllPostsForAdmin'); return []; },
  deletePostAsAdmin: async (postId: any): Promise<boolean> => { console.log('Mock: deletePostAsAdmin'); return true; },
  deleteCommentAsAdmin: async (commentId: any, postId: any): Promise<boolean> => { console.log('Mock: deleteCommentAsAdmin'); return true; },
  getPostById: async (postId: any): Promise<Post | null> => { console.log('Mock: getPostById'); return null; },
  getPendingReports: async (): Promise<Report[]> => { console.log('Mock: getPendingReports'); return []; },
  resolveReport: async (reportId: any, resolution: any): Promise<void> => { console.log('Mock: resolveReport'); },
  banUser: async (userId: any): Promise<boolean> => { console.log('Mock: banUser'); return true; },
  unbanUser: async (userId: any): Promise<boolean> => { console.log('Mock: unbanUser'); return true; },
  warnUser: async (userId: any, message: any): Promise<boolean> => { console.log('Mock: warnUser'); return true; },
  suspendUserCommenting: async (userId: any, days: any): Promise<boolean> => { console.log('Mock: suspendUserCommenting'); return true; },
  liftUserCommentingSuspension: async (userId: any): Promise<boolean> => { console.log('Mock: liftUserCommentingSuspension'); return true; },
  suspendUserPosting: async (userId: any, days: any): Promise<boolean> => { console.log('Mock: suspendUserPosting'); return true; },
  liftUserPostingSuspension: async (userId: any): Promise<boolean> => { console.log('Mock: liftUserPostingSuspension'); return true; },
  getUserDetailsForAdmin: async (userId: any): Promise<any> => { console.log('Mock: getUserDetailsForAdmin'); return { user: MOCK_DB.users[userId], posts: [], comments: [], reports: [] }; },
  sendSiteWideAnnouncement: async (message: any): Promise<boolean> => { console.log('Mock: sendSiteWideAnnouncement'); return true; },
  getAllCampaignsForAdmin: async (): Promise<Campaign[]> => { console.log('Mock: getAllCampaignsForAdmin'); return []; },
  verifyCampaignPayment: async (campaignId: any, adminId: any): Promise<boolean> => { console.log('Mock: verifyCampaignPayment'); return true; },
  adminUpdateUserProfilePicture: async (userId: any, base64: any): Promise<User | null> => { console.log('Mock: adminUpdateUserProfilePicture'); return null; },
  reactivateUserAsAdmin: async (userId: any): Promise<boolean> => { console.log('Mock: reactivateUserAsAdmin'); return true; },
  promoteGroupMember: async (groupId: string, userToPromote: User, newRole: 'Admin' | 'Moderator'): Promise<boolean> => { console.log('Mock: promoteGroupMember'); return true; },
  demoteGroupMember: async (groupId: string, userToDemote: User, oldRole: 'Admin' | 'Moderator'): Promise<boolean> => { console.log('Mock: demoteGroupMember'); return true; },
  removeGroupMember: async (groupId: string, userToRemove: User): Promise<boolean> => { console.log('Mock: removeGroupMember'); return true; },
  approveJoinRequest: async (groupId: string, userId: string): Promise<boolean> => { console.log('Mock: approveJoinRequest'); return true; },
  rejectJoinRequest: async (groupId: string, userId: string): Promise<boolean> => { console.log('Mock: rejectJoinRequest'); return true; },
  approvePost: async (postId: string): Promise<boolean> => { console.log('Mock: approvePost'); return true; },
  rejectPost: async (postId: string): Promise<boolean> => { console.log('Mock: rejectPost'); return true; },
  getExplorePosts: async (userId: string): Promise<Post[]> => { console.log('Mock: getExplorePosts'); return MOCK_DB.posts; },
};