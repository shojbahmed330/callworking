import { GoogleGenAI, Type, Modality } from "@google/genai";
import { NLUResponse, MusicTrack, User, Post, Campaign, FriendshipStatus, Comment, Message, Conversation, ChatSettings, LiveAudioRoom, LiveVideoRoom, Group, Story, Event, GroupChat, JoinRequest, GroupCategory, StoryPrivacy, PollOption, AdminUser, CategorizedExploreFeed, Report, ReplyInfo, Author, Call } from '../types';
import { VOICE_EMOJI_MAP, MOCK_MUSIC_LIBRARY, DEFAULT_AVATARS, DEFAULT_COVER_PHOTOS } from '../constants';
import { firebaseService } from './firebaseService';


const apiKey = process.env.API_KEY;
if (!apiKey) {
    alert("CRITICAL ERROR: Gemini API key is not configured. Please ensure your environment variables are set up correctly.");
    throw new Error("API_KEY not configured. Please set it in your environment.");
}
const ai = new GoogleGenAI({ apiKey });

const NLU_SYSTEM_INSTRUCTION_BASE = `
You are a powerful NLU (Natural Language Understanding) engine for VoiceBook, a voice-controlled social media app. Your sole purpose is to analyze a user's raw text command and convert it into a structured JSON format. You must understand both English and Bengali (Bangla), including "Banglish" (Bengali words typed with English characters).

Your response MUST be a single, valid JSON object and nothing else.

The JSON object must have:
1. An "intent" field: A string matching one of the intents from the list below.
2. An optional "slots" object: For intents that require extra information (like a name or number).

If the user's intent is unclear or not in the list, you MUST use the intent "unknown".

Example Bengali commands:
- "পাসওয়ার্ড পরিবর্তন কর" -> { "intent": "intent_change_password" }
- "আমার অ্যাকাউন্ট নিষ্ক্রিয় কর" -> { "intent": "intent_deactivate_account" }
- "সেটিংসে যাও" -> { "intent": "intent_open_settings" }
- "shojib ke khojo" -> { "intent": "intent_search_user", "slots": { "target_name": "shojib" } }
- "add text Fine" -> { "intent": "intent_add_text_to_story", "slots": { "text": "Fine" } }
`;

let NLU_INTENT_LIST = `
- intent_signup
- intent_login
- intent_play_post
- intent_pause_post
- intent_next_post
- intent_previous_post
- intent_create_post
- intent_create_voice_post
- intent_stop_recording
- intent_post_confirm
- intent_re_record
- intent_comment
- intent_post_comment
- intent_search_user (extracts 'target_name')
- intent_select_result (extracts 'index')
- intent_like (extracts 'target_name')
- intent_share
- intent_open_profile (extracts 'target_name')
- intent_change_avatar
- intent_help
- intent_go_back
- intent_open_settings
- intent_add_friend (extracts 'target_name')
- intent_send_message (extracts 'target_name')
- intent_save_settings
- intent_update_profile (extracts 'field', 'value')
- intent_update_privacy (extracts 'setting', 'value')
- intent_update_notification_setting (extracts 'setting', 'value')
- intent_block_user (extracts 'target_name')
- intent_unblock_user (extracts 'target_name')
- intent_edit_profile
- intent_record_message
- intent_send_chat_message
- intent_view_comments (extracts 'target_name')
- intent_send_text_message_with_content (extracts 'message_content')
- intent_open_friend_requests
- intent_accept_request (extracts 'target_name')
- intent_decline_request (extracts 'target_name')
- intent_scroll_up
- intent_scroll_down
- intent_stop_scroll
- intent_open_messages
- intent_open_friends_page
- intent_open_chat (extracts 'target_name')
- intent_change_chat_theme (extracts 'theme_name')
- intent_delete_chat
- intent_send_voice_emoji (extracts 'emoji_type')
- intent_play_comment_by_author (extracts 'target_name')
- intent_view_comments_by_author (extracts 'target_name')
- intent_generate_image (extracts 'prompt')
- intent_clear_image
- intent_claim_reward
- intent_open_ads_center
- intent_create_campaign
- intent_view_campaign_dashboard
- intent_set_sponsor_name (extracts 'sponsor_name')
- intent_set_campaign_caption (extracts 'caption_text')
- intent_set_campaign_budget (extracts 'budget_amount')
- intent_set_media_type (extracts 'media_type')
- intent_launch_campaign
- intent_change_password
- intent_deactivate_account
- intent_open_feed
- intent_open_explore
- intent_open_rooms_hub
- intent_open_audio_rooms
- intent_open_video_rooms
- intent_create_room
- intent_close_room
- intent_reload_page
- intent_open_groups_hub
- intent_join_group (extracts 'group_name')
- intent_leave_group (extracts 'group_name')
- intent_create_group (extracts 'group_name')
- intent_search_group (extracts 'search_query')
- intent_filter_groups_by_category (extracts 'category_name')
- intent_invite_to_group (extracts 'target_name')
- intent_view_group_suggestions
- intent_pin_post
- intent_unpin_post
- intent_open_group_chat
- intent_open_group_events
- intent_create_event
- intent_create_poll
- intent_vote_poll (extracts 'option_number' or 'option_text')
- intent_view_group_by_name (extracts 'group_name')
- intent_manage_group
- intent_open_group_invite_page
- intent_create_story
- intent_add_music
- intent_post_story
- intent_set_story_privacy (extracts 'privacy_level')
- intent_add_text_to_story (extracts 'text')
- intent_react_to_message (extracts 'emoji_type')
- intent_reply_to_message
- intent_reply_to_last_message (extracts 'message_content')
- intent_react_to_last_message (extracts 'emoji_type')
- intent_unsend_message
- intent_send_announcement (extracts 'message_content')
- intent_unfriend_user (extracts 'target_name')
- intent_cancel_friend_request (extracts 'target_name')
`;

export const geminiService = {
  async processIntent(command: string, context?: { userNames?: string[], groupNames?: string[], themeNames?: string[] }): Promise<NLUResponse> {
    
    let dynamicContext = "";
    if (context?.userNames && context.userNames.length > 0) {
        dynamicContext += `\nFor intents that require a 'target_name', here are some relevant names: [${context.userNames.join(', ')}].`;
    }
     if (context?.groupNames && context.groupNames.length > 0) {
        dynamicContext += `\nFor intents related to groups, here are some available groups: [${context.groupNames.join(', ')}].`;
    }
     if (context?.themeNames && context.themeNames.length > 0) {
        dynamicContext += `\nFor 'intent_change_chat_theme', available themes are: [${context.themeNames.join(', ')}].`;
    }

    const systemInstruction = NLU_SYSTEM_INSTRUCTION_BASE + "\nAvailable Intents:\n" + NLU_INTENT_LIST + dynamicContext;
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `User command: "${command}"`,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: { type: Type.STRING },
              slots: {
                type: Type.OBJECT,
                properties: {
                    target_name: { type: Type.STRING },
                    index: { type: Type.STRING },
                    field: { type: Type.STRING },
                    value: { type: Type.STRING },
                    setting: { type: Type.STRING },
                    message_content: { type: Type.STRING },
                    emoji_type: { type: Type.STRING },
                    prompt: { type: Type.STRING },
                    sponsor_name: { type: Type.STRING },
                    caption_text: { type: Type.STRING },
                    budget_amount: { type: Type.STRING },
                    media_type: { type: Type.STRING },
                    group_name: { type: Type.STRING },
                    search_query: { type: Type.STRING },
                    category_name: { type: Type.STRING },
                    option_number: { type: Type.STRING },
                    option_text: { type: Type.STRING },
                    privacy_level: { type: Type.STRING },
                    text: { type: Type.STRING },
                },
              }
            },
            required: ['intent']
          }
        },
      });

      const jsonString = response.text.trim();
      const parsed = JSON.parse(jsonString);
      return parsed as NLUResponse;
    } catch (error) {
      console.error("Error processing intent:", error, "Command:", command);
      return { intent: 'unknown' };
    }
  },

  getFriendRequests: (userId: string): Promise<User[]> => firebaseService.getFriendRequests(userId),
  acceptFriendRequest: (currentUserId: string, requestingUserId: string) => firebaseService.acceptFriendRequest(currentUserId, requestingUserId),
  declineFriendRequest: (currentUserId: string, requestingUserId: string) => firebaseService.declineFriendRequest(currentUserId, requestingUserId),
  checkFriendshipStatus: (currentUserId: string, profileUserId: string): Promise<FriendshipStatus> => firebaseService.checkFriendshipStatus(currentUserId, profileUserId),
  addFriend: (currentUserId: string, targetUserId: string): Promise<{ success: boolean; reason?: string }> => firebaseService.addFriend(currentUserId, targetUserId),
  unfriendUser: (currentUserId: string, targetUserId: string) => firebaseService.unfriendUser(currentUserId, targetUserId),
  cancelFriendRequest: (currentUserId: string, targetUserId: string) => firebaseService.cancelFriendRequest(currentUserId, targetUserId),
  async getRecommendedFriends(userId: string): Promise<User[]> {
      const allUsers = await firebaseService.getAllUsersForAdmin();
      const currentUser = allUsers.find(u => u.id === userId);
      if (!currentUser) return [];
      const friendsAndRequests = new Set([...(currentUser.friendIds || []), userId]);
      return allUsers.filter(u => !friendsAndRequests.has(u.id));
  },
  async getFriendsList(userId: string): Promise<User[]> {
      const user = await firebaseService.getUserProfileById(userId);
      if (!user || !user.friendIds || user.friendIds.length === 0) return [];
      return await firebaseService.getUsersByIds(user.friendIds);
  },
  getCommonFriends: (userId1: string, userId2: string): Promise<User[]> => firebaseService.getCommonFriends(userId1, userId2),
  async getUserById(userId: string): Promise<User | null> {
    return firebaseService.getUserProfileById(userId);
  },
  async searchUsers(query: string): Promise<User[]> {
    return firebaseService.searchUsers(query);
  },
  async updateProfile(userId: string, updates: Partial<User>): Promise<void> {
    await firebaseService.updateProfile(userId, updates);
  },
  async updateProfilePicture(userId: string, base64: string, caption?: string, captionStyle?: Post['captionStyle']): Promise<{ updatedUser: User; newPost: Post } | null> {
    return firebaseService.updateProfilePicture(userId, base64, caption, captionStyle);
  },
  async updateCoverPhoto(userId: string, base64: string, caption?: string, captionStyle?: Post['captionStyle']): Promise<{ updatedUser: User; newPost: Post } | null> {
    return firebaseService.updateCoverPhoto(userId, base64, caption, captionStyle);
  },
  async blockUser(currentUserId: string, targetUserId: string): Promise<boolean> {
      return firebaseService.blockUser(currentUserId, targetUserId);
  },
  async unblockUser(currentUserId: string, targetUserId: string): Promise<boolean> {
      return firebaseService.unblockUser(currentUserId, targetUserId);
  },
  async changePassword(userId: string, currentPass: string, newPass: string): Promise<boolean> {
      return false; // Mock
  },
  async deactivateAccount(userId: string): Promise<boolean> {
      return firebaseService.deactivateAccount(userId);
  },
  async updateVoiceCoins(userId: string, amount: number): Promise<boolean> {
    return firebaseService.updateVoiceCoins(userId, amount);
  },
  getMusicLibrary(): MusicTrack[] {
      return MOCK_MUSIC_LIBRARY;
  },
  listenToFeedPosts: (currentUserId: string, friendIds: string[], blockedUserIds: string[], callback: (posts: Post[]) => void) => {
      return firebaseService.listenToFeedPosts(currentUserId, friendIds, blockedUserIds, callback);
  },
  getChatId: (user1Id, user2Id) => firebaseService.getChatId(user1Id, user2Id),
  listenToMessages: (chatId, callback) => firebaseService.listenToMessages(chatId, callback),
  listenToConversations: (userId, callback) => firebaseService.listenToConversations(userId, callback),
  sendMessage: (chatId, sender, recipient, messageContent) => firebaseService.sendMessage(chatId, sender, recipient, messageContent),
  unsendMessage: (chatId, messageId, userId) => firebaseService.unsendMessage(chatId, messageId, userId),
  reactToMessage: (chatId, messageId, userId, emoji) => firebaseService.reactToMessage(chatId, messageId, userId, emoji),
  deleteChatHistory: (chatId) => firebaseService.deleteChatHistory(chatId),
  getChatSettings: (chatId) => firebaseService.getChatSettings(chatId),
  updateChatSettings: (chatId, settings) => firebaseService.updateChatSettings(chatId, settings),
  markMessagesAsRead: (chatId, userId) => firebaseService.markMessagesAsRead(chatId, userId),
    createReplySnippet(message: Message): ReplyInfo {
        let content = '';
        if (message.isDeleted) {
            content = "Unsent message";
        } else {
            switch(message.type) {
                case 'text': content = message.text || ''; break;
                case 'image': content = 'Image'; break;
                case 'video': content = 'Video'; break;
                case 'audio': content = `Voice Message · ${message.duration}s`; break;
            }
        }
        return {
            messageId: message.id,
            senderName: message.sender.name,
            content: content
        };
    },
    listenToLiveAudioRooms: (callback: (rooms: LiveAudioRoom[]) => void) => firebaseService.listenToLiveAudioRooms(callback),
    listenToLiveVideoRooms: (callback: (rooms: LiveVideoRoom[]) => void) => firebaseService.listenToLiveVideoRooms(callback),
    listenToAudioRoom: (roomId: string, callback: (room: LiveAudioRoom | null) => void) => firebaseService.listenToRoom(roomId, 'audio', callback as any),
    listenToVideoRoom: (roomId: string, callback: (room: LiveVideoRoom | null) => void) => firebaseService.listenToRoom(roomId, 'video', callback as any),
    createLiveAudioRoom: (host: User, topic: string) => firebaseService.createLiveAudioRoom(host, topic),
    createLiveVideoRoom: (host: User, topic: string) => firebaseService.createLiveVideoRoom(host, topic),
    joinLiveAudioRoom: (userId: string, roomId: string) => firebaseService.joinLiveAudioRoom(userId, roomId),
    joinLiveVideoRoom: (userId: string, roomId: string) => firebaseService.joinLiveVideoRoom(userId, roomId),
    leaveLiveAudioRoom: (userId: string, roomId: string) => firebaseService.leaveLiveAudioRoom(userId, roomId),
    leaveLiveVideoRoom: (userId: string, roomId: string) => firebaseService.leaveLiveVideoRoom(userId, roomId),
    endLiveAudioRoom: (userId: string, roomId: string) => firebaseService.endLiveAudioRoom(userId, roomId),
    endLiveVideoRoom: (userId: string, roomId: string) => firebaseService.endLiveVideoRoom(userId, roomId),
    getAudioRoomDetails: (roomId: string) => firebaseService.getAudioRoomDetails(roomId),
    raiseHandInAudioRoom: (userId: string, roomId: string) => firebaseService.raiseHandInAudioRoom(userId, roomId),
    inviteToSpeakInAudioRoom: (hostId: string, userId: string, roomId: string) => firebaseService.inviteToSpeakInAudioRoom(hostId, userId, roomId),
    moveToAudienceInAudioRoom: (hostId: string, userId: string, roomId: string) => firebaseService.moveToAudienceInAudioRoom(hostId, userId, roomId),
    getCampaignsForSponsor: (sponsorId: string) => firebaseService.getCampaignsForSponsor(sponsorId),
    submitCampaignForApproval: (campaignData: Omit<Campaign, 'id'|'views'|'clicks'|'status'|'transactionId'>, transactionId: string) => firebaseService.submitCampaignForApproval(campaignData, transactionId),
    getRandomActiveCampaign: () => firebaseService.getRandomActiveCampaign(),
    getStories: (currentUserId: string) => firebaseService.getStories(currentUserId),
    markStoryAsViewed: (storyId: string, userId: string) => firebaseService.markStoryAsViewed(storyId, userId),
    createStory: (storyData, mediaFile) => firebaseService.createStory(storyData, mediaFile),
    getGroupById: (groupId: string) => firebaseService.getGroupById(groupId),
    getSuggestedGroups: (userId: string) => firebaseService.getSuggestedGroups(userId),
    createGroup: (creator, name, description, coverPhotoUrl, privacy, requiresApproval, category) => firebaseService.createGroup(creator, name, description, coverPhotoUrl, privacy, requiresApproval, category),
    joinGroup: (userId, groupId, answers) => firebaseService.joinGroup(userId, groupId, answers),
    leaveGroup: (userId, groupId) => firebaseService.leaveGroup(userId, groupId),
    getPostsForGroup: (groupId) => firebaseService.getPostsForGroup(groupId),
    updateGroupSettings: (groupId, settings) => firebaseService.updateGroupSettings(groupId, settings),
    pinPost: (groupId, postId) => firebaseService.pinPost(groupId, postId),
    unpinPost: (groupId) => firebaseService.unpinPost(groupId),
    voteOnPoll: (userId, postId, optionIndex) => firebaseService.voteOnPoll(userId, postId, optionIndex),
    markBestAnswer: (userId, postId, commentId) => firebaseService.markBestAnswer(userId, postId, commentId),
    inviteFriendToGroup: (groupId, friendId) => firebaseService.inviteFriendToGroup(groupId, friendId),
    getGroupChat: (groupId: string) => firebaseService.getGroupChat(groupId),
    sendGroupChatMessage: (groupId, sender, text) => firebaseService.sendGroupChatMessage(groupId, sender, text),
    getGroupEvents: (groupId: string) => firebaseService.getGroupEvents(groupId),
    createGroupEvent: (creator, groupId, title, description, date) => firebaseService.createGroupEvent(creator, groupId, title, description, date),
    rsvpToEvent: (userId, eventId) => firebaseService.rsvpToEvent(userId, eventId),
    adminLogin: (email, password) => firebaseService.adminLogin(email, password),
    adminRegister: (email, password) => firebaseService.adminRegister(email, password),
    getAdminDashboardStats: () => firebaseService.getAdminDashboardStats(),
    getAllUsersForAdmin: () => firebaseService.getAllUsersForAdmin(),
    updateUserRole: (userId, newRole) => firebaseService.updateUserRole(userId, newRole),
    getPendingCampaigns: () => firebaseService.getPendingCampaigns(),
    approveCampaign: (campaignId) => firebaseService.approveCampaign(campaignId),
    rejectCampaign: (campaignId, reason) => firebaseService.rejectCampaign(campaignId, reason),
    getAllPostsForAdmin: () => firebaseService.getAllPostsForAdmin(),
    deletePostAsAdmin: (postId) => firebaseService.deletePostAsAdmin(postId),
    deleteCommentAsAdmin: (commentId, postId) => firebaseService.deleteCommentAsAdmin(commentId, postId),
    getPostById: (postId) => firebaseService.getPostById(postId),
    getPendingReports: () => firebaseService.getPendingReports(),
    resolveReport: (reportId, resolution) => firebaseService.resolveReport(reportId, resolution),
    banUser: (userId) => firebaseService.banUser(userId),
    unbanUser: (userId) => firebaseService.unbanUser(userId),
    warnUser: (userId, message) => firebaseService.warnUser(userId, message),
    suspendUserCommenting: (userId, days) => firebaseService.suspendUserCommenting(userId, days),
    liftUserCommentingSuspension: (userId) => firebaseService.liftUserCommentingSuspension(userId),
    suspendUserPosting: (userId, days) => firebaseService.suspendUserPosting(userId, days),
    liftUserPostingSuspension: (userId) => firebaseService.liftUserPostingSuspension(userId),
    getUserDetailsForAdmin: (userId) => firebaseService.getUserDetailsForAdmin(userId),
    sendSiteWideAnnouncement: (message) => firebaseService.sendSiteWideAnnouncement(message),
    getAllCampaignsForAdmin: () => firebaseService.getAllCampaignsForAdmin(),
    verifyCampaignPayment: (campaignId, adminId) => firebaseService.verifyCampaignPayment(campaignId, adminId),
    adminUpdateUserProfilePicture: (userId, base64) => firebaseService.adminUpdateUserProfilePicture(userId, base64),
    reactivateUserAsAdmin: (userId) => firebaseService.reactivateUserAsAdmin(userId),
    promoteGroupMember: (groupId: string, userToPromote: User, newRole: 'Admin' | 'Moderator') => firebaseService.promoteGroupMember(groupId, userToPromote, newRole),
    demoteGroupMember: (groupId: string, userToDemote: User, oldRole: 'Admin' | 'Moderator') => firebaseService.demoteGroupMember(groupId, userToDemote, oldRole),
    removeGroupMember: (groupId: string, userToRemove: User) => firebaseService.removeGroupMember(groupId, userToRemove),
    approveJoinRequest: (groupId: string, userId: string) => firebaseService.approveJoinRequest(groupId, userId),
    rejectJoinRequest: (groupId: string, userId: string) => firebaseService.rejectJoinRequest(groupId, userId),
    approvePost: (postId: string) => firebaseService.approvePost(postId),
    rejectPost: (postId: string) => firebaseService.rejectPost(postId),
    getCategorizedExploreFeed: async (userId: string): Promise<CategorizedExploreFeed> => ({ trending: [], forYou: [], questions: [], funnyVoiceNotes: [], newTalent: [] }),
    generateImageForPost: async (prompt: string): Promise<string | null> => null,
    editImage: async (base64, mime, prompt) => null,
    createCall: (caller, callee, chatId, type) => firebaseService.createCall(caller, callee, chatId, type),
    listenForIncomingCalls: (userId, callback) => firebaseService.listenForIncomingCalls(userId, callback),
    listenToCall: (callId, callback) => firebaseService.listenToCall(callId, callback),
    updateCallStatus: (callId, status) => firebaseService.updateCallStatus(callId, status),
    getAgoraToken: (channelName: string, uid: string | number) => firebaseService.getAgoraToken(channelName, uid),
};
