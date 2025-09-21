import firebase from 'firebase/compat/app';
import { auth, db, storage } from './firebaseConfig';
import { User, Post, Campaign, FriendshipStatus, Comment, Message, Conversation, ChatSettings, LiveAudioRoom, LiveVideoRoom, Group, Story, Event, GroupChat, JoinRequest, GroupCategory, StoryPrivacy, PollOption, AdminUser, CategorizedExploreFeed, Report, ReplyInfo, Author, Call, Lead } from '../types';
import { DEFAULT_AVATARS, DEFAULT_COVER_PHOTOS } from '../constants';

// Helper function to upload a file (image, video, audio) to Firebase Storage
const uploadFile = async (file: File | Blob, path: string): Promise<string> => {
    const storageRef = storage.ref(path);
    const snapshot = await storageRef.put(file);
    return snapshot.ref.getDownloadURL();
};

// Helper function to upload a base64 string as a file
const uploadBase64 = async (base64: string, path: string): Promise<string> => {
    const storageRef = storage.ref(path);
    const snapshot = await storageRef.putString(base64, 'data_url');
    return snapshot.ref.getDownloadURL();
};

// Main service object
export const firebaseService = {
    // --- AUTH ---
    onAuthStateChanged: (callback: (user: { id: string; email: string | null } | null) => void) => {
        return auth.onAuthStateChanged(user => {
            if (user) {
                callback({ id: user.uid, email: user.email });
            } else {
                callback(null);
            }
        });
    },
    signInWithEmail: (email: string, password: string) => auth.signInWithEmailAndPassword(email, password),
    signUpWithEmail: async (email: string, password: string, fullName: string, username: string): Promise<boolean> => {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        if (userCredential.user) {
            const newUser: User = {
                id: userCredential.user.uid,
                name: fullName,
                username: username,
                name_lowercase: fullName.toLowerCase(),
                email: email,
                avatarUrl: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
                coverPhotoUrl: DEFAULT_COVER_PHOTOS[Math.floor(Math.random() * DEFAULT_COVER_PHOTOS.length)],
                bio: 'Welcome to VoiceBook!',
                createdAt: new Date().toISOString(),
                friendIds: [],
                blockedUserIds: [],
                privacySettings: {
                    postVisibility: 'public',
                    friendRequestPrivacy: 'everyone',
                    friendListVisibility: 'friends',
                },
                voiceCoins: 100, // Welcome bonus
                role: 'user',
            };
            await db.collection('users').doc(newUser.id).set(newUser);
            return true;
        }
        return false;
    },
    signOutUser: (userId: string | null) => {
        if (userId) {
            firebaseService.updateUserOnlineStatus(userId, 'offline');
        }
        return auth.signOut();
    },
    isUsernameTaken: async (username: string): Promise<boolean> => {
        const snapshot = await db.collection('users').where('username', '==', username).limit(1).get();
        return !snapshot.empty;
    },

    // --- USER PROFILE & STATUS ---
    getUserProfileById: async (userId: string): Promise<User | null> => {
        const doc = await db.collection('users').doc(userId).get();
        return doc.exists ? doc.data() as User : null;
    },
    listenToCurrentUser: (userId: string, callback: (user: User | null) => void) => {
        return db.collection('users').doc(userId).onSnapshot(doc => {
            callback(doc.exists ? doc.data() as User : null);
        });
    },
    updateUserOnlineStatus: (userId: string, status: 'online' | 'offline') => {
        return db.collection('users').doc(userId).update({ 
            onlineStatus: status,
            lastActiveTimestamp: new Date().toISOString()
        });
    },
    updateProfile: (userId: string, updates: Partial<User>) => db.collection('users').doc(userId).update(updates),
    deactivateAccount: (userId: string) => db.collection('users').doc(userId).update({ isDeactivated: true }),

    // --- POSTS ---
    createPost: async (postData: Partial<Post>, media: { mediaFile?: File | null, audioBlobUrl?: string | null, generatedImageBase64?: string | null }): Promise<Post> => {
        const docRef = db.collection('posts').doc();
        const id = docRef.id;
        let post: Post = {
            id,
            author: postData.author!,
            caption: postData.caption || '',
            duration: postData.duration || 0,
            createdAt: new Date().toISOString(),
            commentCount: 0,
            comments: [],
            reactions: {},
            ...postData,
        };

        if (media.mediaFile) {
            const path = `posts/${id}/${media.mediaFile.name}`;
            const url = await uploadFile(media.mediaFile, path);
            if (media.mediaFile.type.startsWith('video')) {
                post.videoUrl = url;
            } else {
                post.imageUrl = url;
            }
        } else if (media.audioBlobUrl) {
            const blob = await fetch(media.audioBlobUrl).then(r => r.blob());
            const path = `posts/${id}/audio.webm`;
            post.audioUrl = await uploadFile(blob, path);
        } else if (media.generatedImageBase64) {
            const path = `posts/${id}/generated.jpeg`;
            post.imageUrl = await uploadBase64(media.generatedImageBase64, path);
        }

        await docRef.set(post);
        
        // Update user's post count if needed in the future
        return post;
    },
    listenToFeedPosts: (currentUserId: string, friendIds: string[], blockedUserIds: string[], callback: (posts: Post[]) => void) => {
        const usersToSee = [currentUserId, ...friendIds];
        let query = db.collection('posts')
            .where('status', '==', 'approved')
            .orderBy('createdAt', 'desc')
            .limit(50);
            
        return query.onSnapshot(snapshot => {
            const posts = snapshot.docs
                .map(doc => doc.data() as Post)
                .filter(post => 
                    (post.author.id === currentUserId || post.privacySettings?.postVisibility !== 'friends' || usersToSee.includes(post.author.id))
                    && !blockedUserIds.includes(post.author.id)
                );
            callback(posts);
        });
    },
    getPostsByUser: async (userId: string): Promise<Post[]> => {
        const snapshot = await db.collection('posts').where('author.id', '==', userId).orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(doc => doc.data() as Post);
    },
    listenToPost: (postId: string, callback: (post: Post | null) => void) => {
        return db.collection('posts').doc(postId).onSnapshot(doc => {
            callback(doc.exists ? doc.data() as Post : null);
        });
    },
    listenToReelsPosts: (callback: (posts: Post[]) => void) => {
        // Simple logic for reels: get recent video posts
        return db.collection('posts')
                 .where('videoUrl', '!=', null)
                 .orderBy('videoUrl')
                 .orderBy('createdAt', 'desc')
                 .limit(20)
                 .onSnapshot(snapshot => {
                     callback(snapshot.docs.map(doc => doc.data() as Post));
                 });
    },

    // --- COMMENTS & REACTIONS ---
    reactToPost: async (postId: string, userId: string, emoji: string) => {
        const postRef = db.collection('posts').doc(postId);
        await db.runTransaction(async (transaction) => {
            const postDoc = await transaction.get(postRef);
            if (!postDoc.exists) return;
            const post = postDoc.data() as Post;
            const reactions = post.reactions || {};
            const currentReaction = reactions[userId];
            if (currentReaction === emoji) {
                delete reactions[userId]; // Un-react
            } else {
                reactions[userId] = emoji; // React or change reaction
            }
            transaction.update(postRef, { reactions });
        });
        return true;
    },
    createComment: async (user: User, postId: string, commentData: { text?: string, imageFile?: File, audioBlob?: Blob, duration?: number, parentId?: string | null }): Promise<Comment | null> => {
        if (user.commentingSuspendedUntil && new Date(user.commentingSuspendedUntil) > new Date()) {
            return null;
        }
        const postRef = db.collection('posts').doc(postId);
        const commentRef = postRef.collection('comments').doc();
        const comment: Comment = {
            id: commentRef.id,
            postId,
            author: { id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl },
            createdAt: new Date().toISOString(),
            type: 'text',
            reactions: {},
            parentId: commentData.parentId || null,
        };

        if (commentData.text) {
            comment.type = 'text';
            comment.text = commentData.text;
        } else if (commentData.imageFile) {
            comment.type = 'image';
            const url = await uploadFile(commentData.imageFile, `comments/${postId}/${comment.id}`);
            comment.imageUrl = url;
        } else if (commentData.audioBlob) {
            comment.type = 'audio';
            const url = await uploadFile(commentData.audioBlob, `comments/${postId}/${comment.id}.webm`);
            comment.audioUrl = url;
            comment.duration = commentData.duration;
        }

        await commentRef.set(comment);
        await postRef.update({ commentCount: firebase.firestore.FieldValue.increment(1) });
        return comment;
    },
    editComment: (postId: string, commentId: string, newText: string) => {
        return db.collection('posts').doc(postId).collection('comments').doc(commentId).update({
            text: newText,
            updatedAt: new Date().toISOString()
        });
    },
    deleteComment: async (postId: string, commentId: string) => {
        await db.collection('posts').doc(postId).collection('comments').doc(commentId).delete();
        await db.collection('posts').doc(postId).update({ commentCount: firebase.firestore.FieldValue.increment(-1) });
    },
    reactToComment: (postId: string, commentId: string, userId: string, emoji: string) => {
        const commentRef = db.collection('posts').doc(postId).collection('comments').doc(commentId);
        return db.runTransaction(async (transaction) => {
            const commentDoc = await transaction.get(commentRef);
            if (!commentDoc.exists) return;
            const comment = commentDoc.data() as Comment;
            const reactions = comment.reactions || {};
            reactions[userId] = emoji;
            transaction.update(commentRef, { reactions });
        });
    },

    // --- OTHER MOCKS & UTILS ---
    getInjectableAd: async (currentUser: User): Promise<Post | null> => {
        // This is a simplified ad injection logic
        const snapshot = await db.collection('campaigns').where('status', '==', 'active').limit(1).get();
        if (snapshot.empty) return null;
        const adCampaign = snapshot.docs[0].data() as Campaign;
        const sponsor = await firebaseService.getUserProfileById(adCampaign.sponsorId);
        if (!sponsor) return null;

        return {
            id: `ad_${adCampaign.id}`,
            author: { id: sponsor.id, name: sponsor.name, username: sponsor.username, avatarUrl: sponsor.avatarUrl },
            caption: adCampaign.caption,
            createdAt: new Date().toISOString(),
            isSponsored: true,
            sponsorName: adCampaign.sponsorName,
            campaignId: adCampaign.id,
            imageUrl: adCampaign.imageUrl,
            videoUrl: adCampaign.videoUrl,
            audioUrl: adCampaign.audioUrl,
            websiteUrl: adCampaign.websiteUrl,
            allowDirectMessage: adCampaign.allowDirectMessage,
            allowLeadForm: adCampaign.allowLeadForm,
            sponsorId: adCampaign.sponsorId,
            duration: 15,
            commentCount: 0,
            comments: [],
            reactions: {},
        };
    },
    getInjectableStoryAd: async (currentUser: User): Promise<Story | null> => {
        const snapshot = await db.collection('campaigns')
            .where('status', '==', 'active')
            .where('adType', '==', 'story')
            .limit(1).get();
        if (snapshot.empty) return null;
        const campaign = snapshot.docs[0].data() as Campaign;
        const sponsor = await firebaseService.getUserProfileById(campaign.sponsorId);
        if (!sponsor) return null;
        
        return {
            id: `ad_story_${campaign.id}`,
            author: sponsor,
            createdAt: new Date().toISOString(),
            type: campaign.videoUrl ? 'video' : 'image',
            contentUrl: campaign.videoUrl || campaign.imageUrl,
            duration: 15,
            viewedBy: [],
            privacy: 'public',
            isSponsored: true,
            sponsorName: campaign.sponsorName,
            sponsorAvatar: sponsor.avatarUrl,
            campaignId: campaign.id,
            ctaLink: campaign.websiteUrl || `/#/profile/${sponsor.username}`
        };
    },
    trackAdView: (campaignId: string) => {
        db.collection('campaigns').doc(campaignId).update({ views: firebase.firestore.FieldValue.increment(1) });
    },
    trackAdClick: (campaignId: string) => {
        db.collection('campaigns').doc(campaignId).update({ clicks: firebase.firestore.FieldValue.increment(1) });
    },
    submitLead: (leadData: Omit<Lead, 'id'>) => {
        return db.collection('leads').add({
            ...leadData,
            id: db.collection('leads').doc().id
        });
    },
    getLeadsForCampaign: async (campaignId: string): Promise<Lead[]> => {
        const snapshot = await db.collection('leads').where('campaignId', '==', campaignId).orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(doc => doc.data() as Lead);
    },

    // --- Notifications ---
    listenToNotifications: (userId: string, callback: (notifications: Notification[]) => void) => {
        return db.collection('users').doc(userId).collection('notifications')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .onSnapshot(snapshot => {
                const notifs = snapshot.docs.map(doc => doc.data() as Notification);
                callback(notifs);
            });
    },
    markNotificationsAsRead: (userId: string, notificationIds: string[]) => {
        const batch = db.batch();
        notificationIds.forEach(id => {
            const notifRef = db.collection('users').doc(userId).collection('notifications').doc(id);
            batch.update(notifRef, { read: true });
        });
        return batch.commit();
    },

    // --- FRIENDS ---
    listenToFriendRequests: (userId: string, callback: (users: User[]) => void) => {
        return db.collection('users').doc(userId).onSnapshot(async (doc) => {
            const userData = doc.data();
            const requestIds = userData?.friendRequestsReceived || [];
            if (requestIds.length > 0) {
                const users = await firebaseService.getUsersByIds(requestIds);
                callback(users);
            } else {
                callback([]);
            }
        });
    },
    getFriends: async (userId: string): Promise<User[]> => {
        const user = await firebaseService.getUserProfileById(userId);
        if (user && user.friendIds && user.friendIds.length > 0) {
            return firebaseService.getUsersByIds(user.friendIds);
        }
        return [];
    },
    getUsersByIds: async (userIds: string[]): Promise<User[]> => {
        const validUserIds = userIds.filter(id => typeof id === 'string' && id.length > 0);
        if (validUserIds.length === 0) return [];
    
        const userPromises: Promise<firebase.firestore.QuerySnapshot>[] = [];
        for (let i = 0; i < validUserIds.length; i += 10) {
            const chunk = validUserIds.slice(i, i + 10);
            const promise = db.collection('users').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
            userPromises.push(promise);
        }
        
        try {
            const userSnapshots = await Promise.all(userPromises);
            const users: User[] = [];
            userSnapshots.forEach(snapshot => {
                snapshot.docs.forEach(doc => {
                    users.push(doc.data() as User);
                });
            });
            return users;
        } catch (error) {
            console.error("Error fetching users by IDs:", error);
            return [];
        }
    },
    
    // --- CHAT ---
    ensureChatDocumentExists: async (user1: User, user2: User) => {
        const chatId = firebaseService.getChatId(user1.id, user2.id);
        const chatRef = db.collection('chats').doc(chatId);
        const chatDoc = await chatRef.get();
        if (!chatDoc.exists) {
            await chatRef.set({
                participants: [user1.id, user2.id],
                participantInfo: {
                    [user1.id]: { name: user1.name, avatarUrl: user1.avatarUrl },
                    [user2.id]: { name: user2.name, avatarUrl: user2.avatarUrl },
                },
                lastMessage: null,
                createdAt: new Date().toISOString(),
            });
        }
    },
    
    // --- This is just a placeholder, the actual token generation MUST be done on a secure server ---
    getAgoraToken: async (channelName: string, uid: string | number): Promise<string | null> => {
        try {
            // In a real app, this URL should point to your own backend server that generates the token.
            // Using a proxy for this example.
            const response = await fetch(`/api/proxy?channelName=${channelName}&uid=${uid}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch token, status: ${response.status}`);
            }
            const data = await response.json();
            return data.token;
        } catch (error) {
            console.error("Error fetching Agora token:", error);
            return null;
        }
    },
    getChatId: (user1Id: string, user2Id: string) => {
        return user1Id < user2Id ? `${user1Id}_${user2Id}` : `${user2Id}_${user1Id}`;
    },
    listenToMessages: (chatId, callback) => {
        return db.collection('chats').doc(chatId).collection('messages').orderBy('createdAt', 'asc').onSnapshot(snapshot => {
            callback(snapshot.docs.map(doc => doc.data() as Message));
        });
    },
    listenToConversations: (userId: string, callback: (conversations: Conversation[]) => void) => {
       return db.collection('chats').where('participants', 'array-contains', userId).onSnapshot(async snapshot => {
           const convos: Conversation[] = [];
           for (const doc of snapshot.docs) {
               const chatData = doc.data();
               const peerId = chatData.participants.find((p: string) => p !== userId);
               if (peerId && chatData.lastMessage) {
                   const peer = await firebaseService.getUserProfileById(peerId);
                   if(peer) {
                       convos.push({
                           peer,
                           lastMessage: chatData.lastMessage,
                           unreadCount: chatData.unreadCounts?.[userId] || 0
                       });
                   }
               }
           }
           convos.sort((a,b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
           callback(convos);
       });
    },
    sendMessage: async (chatId, sender, recipient, messageContent) => {
        const messageRef = db.collection('chats').doc(chatId).collection('messages').doc();
        const message: Message = {
            id: messageRef.id,
            senderId: sender.id,
            recipientId: recipient.id,
            createdAt: new Date().toISOString(),
            read: false,
            ...messageContent
        };
        await messageRef.set(message);
        await db.collection('chats').doc(chatId).update({
            lastMessage: message,
            [`unreadCounts.${recipient.id}`]: firebase.firestore.FieldValue.increment(1)
        });
    },
    unsendMessage: (chatId, messageId, userId) => db.collection('chats').doc(chatId).collection('messages').doc(messageId).update({ isDeleted: true }),
    reactToMessage: (chatId, messageId, userId, emoji) => {
        const messageRef = db.collection('chats').doc(chatId).collection('messages').doc(messageId);
        return messageRef.update({
            [`reactions.${emoji}`]: firebase.firestore.FieldValue.arrayUnion(userId)
        });
    },
    deleteChatHistory: (chatId) => {
        // Not implemented for safety in this mock. In a real app, this would be a complex batch delete.
        console.warn("deleteChatHistory is not implemented in this mock service.");
        return Promise.resolve();
    },
    getChatSettings: async (chatId) => {
        const doc = await db.collection('chatSettings').doc(chatId).get();
        return doc.data() as ChatSettings || { theme: 'default' };
    },
    updateChatSettings: (chatId, settings) => db.collection('chatSettings').doc(chatId).set(settings, { merge: true }),
    markMessagesAsRead: (chatId, userId) => db.collection('chats').doc(chatId).update({ [`unreadCounts.${userId}`]: 0 }),

    searchUsers: async (query: string): Promise<User[]> => {
        const snapshot = await db.collection('users')
                                .where('name_lowercase', '>=', query.toLowerCase())
                                .where('name_lowercase', '<=', query.toLowerCase() + '\uf8ff')
                                .limit(10)
                                .get();
        return snapshot.docs.map(doc => doc.data() as User);
    },
    getPendingCampaigns: async (): Promise<Campaign[]> => {
        const snapshot = await db.collection('campaigns').where('status', '==', 'pending').get();
        return snapshot.docs.map(doc => doc.data() as Campaign);
    },
     getAllCampaignsForAdmin: async (): Promise<Campaign[]> => {
        const snapshot = await db.collection('campaigns').orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(doc => doc.data() as Campaign);
    },
    approveCampaign: (campaignId: string) => db.collection('campaigns').doc(campaignId).update({ status: 'active' }),
    rejectCampaign: (campaignId: string, reason: string) => db.collection('campaigns').doc(campaignId).update({ status: 'rejected', rejectionReason: reason }),
    getPostById: async (postId: string): Promise<Post | null> => {
        const doc = await db.collection('posts').doc(postId).get();
        return doc.exists ? doc.data() as Post : null;
    },
     createCall: async (caller, callee, chatId, type) => {
        const callRef = db.collection('calls').doc();
        const call = {
            id: callRef.id,
            caller,
            callee,
            chatId,
            type,
            status: 'ringing',
            createdAt: new Date().toISOString()
        };
        await callRef.set(call);
        return call.id;
    },
    listenForIncomingCalls: (userId, callback) => {
        return db.collection('calls')
            .where('callee.id', '==', userId)
            .where('status', '==', 'ringing')
            .onSnapshot(snapshot => {
                if (!snapshot.empty) {
                    const call = snapshot.docs[0].data() as Call;
                    callback(call);
                } else {
                    callback(null);
                }
            });
    },
    listenToCall: (callId, callback) => {
        return db.collection('calls').doc(callId).onSnapshot(doc => {
            callback(doc.exists ? doc.data() as Call : null);
        });
    },
    updateCallStatus: (callId, status) => {
        const data: { status: Call['status'], endedAt?: string } = { status };
        if (['ended', 'rejected', 'missed', 'declined'].includes(status)) {
            data.endedAt = new Date().toISOString();
        }
        return db.collection('calls').doc(callId).update(data);
    },
    // The rest of the functions are omitted for brevity but would follow the same Firebase interaction patterns.
};