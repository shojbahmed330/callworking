import firebase from 'firebase/compat/app';
import { db, auth, storage } from './firebaseConfig';
import { 
    User, Post, Comment, FriendshipStatus, Campaign, 
    Message, Conversation, ChatSettings, LiveAudioRoom, 
    Listener, Speaker, LiveVideoRoom, VideoParticipantState, 
    Group, JoinRequest, Event, GroupChat, Story, Lead, 
    AdminUser, Report, Call, 
    Notification as AppNotification
} from '../types';
import { DEFAULT_AVATARS, DEFAULT_COVER_PHOTOS, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from '../constants';

// Helper function for Cloudinary uploads
const uploadToCloudinary = async (file: File | Blob, resourceType: 'image' | 'video' | 'raw' = 'raw'): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

    const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Cloudinary upload failed: ${errorData.error.message}`);
    }

    const data = await response.json();
    return data.secure_url;
};


export const firebaseService = {
    // --- AUTHENTICATION ---
    onAuthStateChanged: (callback: (user: User | null) => void): (() => void) => {
        return auth.onAuthStateChanged(async (firebaseUser) => {
            if (firebaseUser) {
                // User is signed in, get their profile from Firestore
                const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
                if (userDoc.exists) {
                    callback({ id: userDoc.id, ...userDoc.data() } as User);
                } else {
                    // This case might happen if a user is deleted from DB but auth state persists
                    callback(null);
                }
            } else {
                // User is signed out
                callback(null);
            }
        });
    },

    signInWithEmail: async (emailOrUsername: string, password: string): Promise<User> => {
        let email = emailOrUsername;
        // Check if it's a username
        if (!emailOrUsername.includes('@')) {
            const userQuery = await db.collection('users').where('username', '==', emailOrUsername).limit(1).get();
            if (userQuery.empty) {
                throw new Error("User not found.");
            }
            email = userQuery.docs[0].data().email;
        }

        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        if (!userCredential.user) {
            throw new Error("Login failed.");
        }
        const userDoc = await db.collection('users').doc(userCredential.user.uid).get();
        if (!userDoc.exists) {
            throw new Error("User profile not found.");
        }
        return { id: userDoc.id, ...userDoc.data() } as User;
    },

    signUpWithEmail: async (email: string, password: string, name: string, username: string): Promise<boolean> => {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        if (!userCredential.user) {
            return false;
        }
        const newUser: Omit<User, 'id'> = {
            name,
            username,
            email,
            avatarUrl: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
            coverPhotoUrl: DEFAULT_COVER_PHOTOS[Math.floor(Math.random() * DEFAULT_COVER_PHOTOS.length)],
            bio: 'Hey there! I am using VoiceBook.',
            friendIds: [],
            blockedUserIds: [],
            role: 'user',
            voiceCoins: 100, // Welcome bonus
            isDeactivated: false,
            isBanned: false,
            privacySettings: {
                postVisibility: 'public',
                friendRequestPrivacy: 'everyone',
                friendListVisibility: 'friends',
            },
            notificationSettings: {
                likes: true,
                comments: true,
                friendRequests: true,
                campaignUpdates: true,
                groupPosts: true
            },
            onlineStatus: 'online',
            lastActiveTimestamp: new Date().toISOString(),
        };
        await db.collection('users').doc(userCredential.user.uid).set(newUser);
        return true;
    },

    signOutUser: async (userId: string | null): Promise<void> => {
        if (userId) {
            await firebaseService.updateUserOnlineStatus(userId, 'offline');
        }
        await auth.signOut();
    },

    isUsernameTaken: async (username: string): Promise<boolean> => {
        const snapshot = await db.collection('users').where('username', '==', username).limit(1).get();
        return !snapshot.empty;
    },

    // --- USER PROFILE & STATUS ---
    getUserProfileById: async (userId: string): Promise<User | null> => {
        const doc = await db.collection('users').doc(userId).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() } as User;
    },

    getUserProfileByUsername: async (username: string): Promise<User | null> => {
        const snapshot = await db.collection('users').where('username', '==', username).limit(1).get();
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() } as User;
    },
    
    listenToCurrentUser: (userId: string, callback: (user: User | null) => void): (() => void) => {
        return db.collection('users').doc(userId).onSnapshot(doc => {
            if(doc.exists) {
                callback({ id: doc.id, ...doc.data() } as User);
            } else {
                callback(null);
            }
        });
    },

    listenToUserProfile: (username: string, callback: (user: User | null) => void): (() => void) => {
        return db.collection('users').where('username', '==', username).onSnapshot(snapshot => {
            if (snapshot.empty) {
                callback(null);
            } else {
                const doc = snapshot.docs[0];
                callback({ id: doc.id, ...doc.data() } as User);
            }
        });
    },

    updateUserOnlineStatus: (userId: string, status: 'online' | 'offline'): Promise<void> => {
        return db.collection('users').doc(userId).update({
            onlineStatus: status,
            lastActiveTimestamp: new Date().toISOString(),
        });
    },

    updateProfile: (userId: string, updates: Partial<User>): Promise<void> => {
        return db.collection('users').doc(userId).update(updates);
    },

    updateProfilePicture: async (userId: string, base64Url: string, caption?: string, captionStyle?: Post['captionStyle']): Promise<{ updatedUser: User, newPost: Post } | null> => {
        const response = await fetch(base64Url);
        const blob = await response.blob();
        const imageUrl = await uploadToCloudinary(blob, 'image');
        
        await db.collection('users').doc(userId).update({ avatarUrl: imageUrl });

        // Create a post for the profile picture change
        const userDoc = await db.collection('users').doc(userId).get();
        const user = { id: userDoc.id, ...userDoc.data() } as User;

        const newPostData: Omit<Post, 'id'> = {
            author: { id: user.id, name: user.name, username: user.username, avatarUrl: imageUrl },
            caption: caption || 'Updated their profile picture.',
            captionStyle,
            createdAt: new Date().toISOString(),
            commentCount: 0,
            comments: [],
            reactions: {},
            newPhotoUrl: imageUrl,
            postType: 'profile_picture_change'
        };
        const postRef = await db.collection('posts').add(newPostData);
        const newPost = { id: postRef.id, ...newPostData };

        return { updatedUser: { ...user, avatarUrl: imageUrl }, newPost };
    },
    
    updateCoverPhoto: async (userId: string, base64Url: string, caption?: string, captionStyle?: Post['captionStyle']): Promise<{ updatedUser: User, newPost: Post } | null> => {
        const response = await fetch(base64Url);
        const blob = await response.blob();
        const imageUrl = await uploadToCloudinary(blob, 'image');

        await db.collection('users').doc(userId).update({ coverPhotoUrl: imageUrl });
        
        const userDoc = await db.collection('users').doc(userId).get();
        const user = { id: userDoc.id, ...userDoc.data() } as User;

        const newPostData: Omit<Post, 'id'> = {
            author: { id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl },
            caption: caption || 'Updated their cover photo.',
            captionStyle,
            createdAt: new Date().toISOString(),
            commentCount: 0,
            comments: [],
            reactions: {},
            newPhotoUrl: imageUrl,
            postType: 'cover_photo_change'
        };
        const postRef = await db.collection('posts').add(newPostData);
        const newPost = { id: postRef.id, ...newPostData };

        return { updatedUser: { ...user, coverPhotoUrl: imageUrl }, newPost };
    },

    searchUsers: async (query: string): Promise<User[]> => {
        const cleanedQuery = query.toLowerCase().trim();
        if (!cleanedQuery) return [];
        const snapshot = await db.collection('users')
          .orderBy('username')
          .startAt(cleanedQuery)
          .endAt(cleanedQuery + '\uf8ff')
          .limit(10)
          .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
    },

    deactivateAccount: async (userId: string): Promise<boolean> => {
        try {
            await db.collection('users').doc(userId).update({ isDeactivated: true, onlineStatus: 'offline' });
            return true;
        } catch (error) {
            console.error("Error deactivating account:", error);
            return false;
        }
    },

    updateVoiceCoins: async (userId: string, amount: number): Promise<boolean> => {
        try {
            const userRef = db.collection('users').doc(userId);
            await userRef.update({
                voiceCoins: firebase.firestore.FieldValue.increment(amount)
            });
            return true;
        } catch (error) {
            console.error("Error updating voice coins:", error);
            return false;
        }
    },

    // --- FRIENDS & RELATIONSHIPS ---
    getFriendRequests: async (userId: string): Promise<User[]> => {
        const userDoc = await db.collection('users').doc(userId).get();
        const friendRequestIds = userDoc.data()?.friendRequestsReceived || [];
        if (friendRequestIds.length === 0) return [];
        return firebaseService.getUsersByIds(friendRequestIds);
    },

    getUsersByIds: async (userIds: string[]): Promise<User[]> => {
        if (userIds.length === 0) return [];
        const snapshot = await db.collection('users').where(firebase.firestore.FieldPath.documentId(), 'in', userIds).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
    },

    getFriends: async (userId: string): Promise<User[]> => {
        const userDoc = await db.collection('users').doc(userId).get();
        const friendIds = userDoc.data()?.friendIds || [];
        if (friendIds.length === 0) return [];
        return firebaseService.getUsersByIds(friendIds);
    },

    checkFriendshipStatus: async (currentUserId: string, profileUserId: string): Promise<FriendshipStatus> => {
        const currentUserDoc = await db.collection('users').doc(currentUserId).get();
        const currentUserData = currentUserDoc.data();

        if (currentUserData?.friendIds?.includes(profileUserId)) {
            return FriendshipStatus.FRIENDS;
        }
        if (currentUserData?.friendRequestsSent?.includes(profileUserId)) {
            return FriendshipStatus.REQUEST_SENT;
        }
        if (currentUserData?.friendRequestsReceived?.includes(profileUserId)) {
            return FriendshipStatus.PENDING_APPROVAL;
        }
        return FriendshipStatus.NOT_FRIENDS;
    },
    
    addFriend: async (currentUserId: string, targetUserId: string): Promise<{ success: boolean; reason?: string }> => {
        const targetUserDoc = await db.collection('users').doc(targetUserId).get();
        const targetUserData = targetUserDoc.data() as User;

        if (targetUserData.privacySettings?.friendRequestPrivacy === 'friends_of_friends') {
            const currentUserDoc = await db.collection('users').doc(currentUserId).get();
            const currentUserData = currentUserDoc.data() as User;
            const commonFriends = currentUserData.friendIds.filter(id => targetUserData.friendIds.includes(id));
            if (commonFriends.length === 0) {
                return { success: false, reason: 'friends_of_friends' };
            }
        }
        
        const batch = db.batch();
        const currentUserRef = db.collection('users').doc(currentUserId);
        const targetUserRef = db.collection('users').doc(targetUserId);

        batch.update(currentUserRef, { friendRequestsSent: firebase.firestore.FieldValue.arrayUnion(targetUserId) });
        batch.update(targetUserRef, { friendRequestsReceived: firebase.firestore.FieldValue.arrayUnion(currentUserId) });

        await batch.commit();
        return { success: true };
    },
    
    acceptFriendRequest: async (currentUserId: string, requestingUserId: string): Promise<void> => {
        const batch = db.batch();
        const currentUserRef = db.collection('users').doc(currentUserId);
        const requestingUserRef = db.collection('users').doc(requestingUserId);

        batch.update(currentUserRef, {
            friendIds: firebase.firestore.FieldValue.arrayUnion(requestingUserId),
            friendRequestsReceived: firebase.firestore.FieldValue.arrayRemove(requestingUserId)
        });
        batch.update(requestingUserRef, {
            friendIds: firebase.firestore.FieldValue.arrayUnion(currentUserId),
            friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(currentUserId)
        });

        await batch.commit();
    },

    declineFriendRequest: async (currentUserId: string, requestingUserId: string): Promise<void> => {
        const batch = db.batch();
        const currentUserRef = db.collection('users').doc(currentUserId);
        const requestingUserRef = db.collection('users').doc(requestingUserId);

        batch.update(currentUserRef, {
            friendRequestsReceived: firebase.firestore.FieldValue.arrayRemove(requestingUserId)
        });
        batch.update(requestingUserRef, {
            friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(currentUserId)
        });

        await batch.commit();
    },

    unfriendUser: async (currentUserId: string, targetUserId: string): Promise<boolean> => {
        try {
            const batch = db.batch();
            const currentUserRef = db.collection('users').doc(currentUserId);
            const targetUserRef = db.collection('users').doc(targetUserId);
            batch.update(currentUserRef, { friendIds: firebase.firestore.FieldValue.arrayRemove(targetUserId) });
            batch.update(targetUserRef, { friendIds: firebase.firestore.FieldValue.arrayRemove(currentUserId) });
            await batch.commit();
            return true;
        } catch (error) {
            console.error("Error unfriending user:", error);
            return false;
        }
    },
    
    cancelFriendRequest: async (currentUserId: string, targetUserId: string): Promise<boolean> => {
        try {
            const batch = db.batch();
            const currentUserRef = db.collection('users').doc(currentUserId);
            const targetUserRef = db.collection('users').doc(targetUserId);
            batch.update(currentUserRef, { friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(targetUserId) });
            batch.update(targetUserRef, { friendRequestsReceived: firebase.firestore.FieldValue.arrayRemove(currentUserId) });
            await batch.commit();
            return true;
        } catch (error) {
            console.error("Error cancelling friend request:", error);
            return false;
        }
    },

    blockUser: async (currentUserId: string, targetUserId: string): Promise<boolean> => {
        try {
            const batch = db.batch();
            const currentUserRef = db.collection('users').doc(currentUserId);
            const targetUserRef = db.collection('users').doc(targetUserId);
            batch.update(currentUserRef, {
                blockedUserIds: firebase.firestore.FieldValue.arrayUnion(targetUserId),
                friendIds: firebase.firestore.FieldValue.arrayRemove(targetUserId)
            });
            batch.update(targetUserRef, {
                friendIds: firebase.firestore.FieldValue.arrayRemove(currentUserId)
            });
            await batch.commit();
            return true;
        } catch (error) {
            console.error("Error blocking user:", error);
            return false;
        }
    },
    
    unblockUser: async (currentUserId: string, targetUserId: string): Promise<boolean> => {
        try {
            const currentUserRef = db.collection('users').doc(currentUserId);
            await currentUserRef.update({
                blockedUserIds: firebase.firestore.FieldValue.arrayRemove(targetUserId)
            });
            return true;
        } catch (error) {
            console.error("Error unblocking user:", error);
            return false;
        }
    },
    
    // --- POSTS & COMMENTS ---
    listenToPost: (postId: string, callback: (post: Post | null) => void): (() => void) => {
        return db.collection('posts').doc(postId).onSnapshot(async (doc) => {
            if (doc.exists) {
                const postData = { id: doc.id, ...doc.data() } as Post;
                // Fetch comments as a subcollection
                const commentsSnapshot = await doc.ref.collection('comments').orderBy('createdAt', 'asc').get();
                postData.comments = commentsSnapshot.docs.map(commentDoc => ({ id: commentDoc.id, ...commentDoc.data() } as Comment));
                callback(postData);
            } else {
                callback(null);
            }
        });
    },

    listenToFeedPosts: (userId: string, friendIds: string[], blockedUserIds: string[], callback: (posts: Post[]) => void): (() => void) => {
        const authorsToQuery = [userId, ...friendIds];
        let query = db.collection('posts').where('author.id', 'in', authorsToQuery).orderBy('createdAt', 'desc').limit(20);

        return query.onSnapshot(async (snapshot) => {
            let posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));

            // Client-side filter for blocked users
            const blockedSet = new Set(blockedUserIds);
            posts = posts.filter(post => !blockedSet.has(post.author.id));

            // Fetch comments for each post
            const postsWithComments = await Promise.all(posts.map(async (post) => {
                const commentsSnapshot = await db.collection('posts').doc(post.id).collection('comments').orderBy('createdAt', 'asc').get();
                post.comments = commentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
                return post;
            }));

            callback(postsWithComments);
        });
    },

    createPost: async (postData: Omit<Post, 'id'>, media: { mediaFile?: File | null, audioBlobUrl?: string | null, generatedImageBase64?: string | null }): Promise<Post> => {
        const postToSave: any = { ...postData };

        if (media.audioBlobUrl) {
            const response = await fetch(media.audioBlobUrl);
            const blob = await response.blob();
            postToSave.audioUrl = await uploadToCloudinary(blob, 'raw');
        }
        if (media.mediaFile) {
            const resourceType = media.mediaFile.type.startsWith('video') ? 'video' : 'image';
            const mediaUrl = await uploadToCloudinary(media.mediaFile, resourceType);
            if (resourceType === 'video') postToSave.videoUrl = mediaUrl;
            else postToSave.imageUrl = mediaUrl;
        }
        if (media.generatedImageBase64) {
             const response = await fetch(media.generatedImageBase64);
             const blob = await response.blob();
             postToSave.imageUrl = await uploadToCloudinary(blob, 'image');
        }

        const docRef = await db.collection('posts').add(postToSave);
        return { id: docRef.id, ...postToSave } as Post;
    },

    createComment: async (author: User, postId: string, commentData: { text?: string, parentId?: string | null, imageFile?: File, audioBlob?: Blob, duration?: number }): Promise<Comment | null> => {
        const postRef = db.collection('posts').doc(postId);
        
        const newComment: Partial<Comment> = {
            author: { id: author.id, name: author.name, username: author.username, avatarUrl: author.avatarUrl },
            createdAt: new Date().toISOString(),
            reactions: {},
            parentId: commentData.parentId || null,
            postId: postId,
        };

        if (commentData.text) {
            newComment.type = 'text';
            newComment.text = commentData.text;
        } else if (commentData.imageFile) {
            newComment.type = 'image';
            newComment.imageUrl = await uploadToCloudinary(commentData.imageFile, 'image');
        } else if (commentData.audioBlob && commentData.duration) {
            newComment.type = 'audio';
            newComment.audioUrl = await uploadToCloudinary(commentData.audioBlob, 'raw');
            newComment.duration = commentData.duration;
        } else {
            return null;
        }
        
        const commentRef = await postRef.collection('comments').add(newComment);
        await postRef.update({ commentCount: firebase.firestore.FieldValue.increment(1) });

        return { id: commentRef.id, ...newComment } as Comment;
    },
    
    reactToPost: async (postId: string, userId: string, emoji: string): Promise<boolean> => {
        const postRef = db.collection('posts').doc(postId);
        const doc = await postRef.get();
        if (!doc.exists) return false;

        const currentReactions = doc.data()?.reactions || {};
        const userPreviousReaction = currentReactions[userId];
        
        let update;
        if (userPreviousReaction === emoji) {
            // User is un-reacting
            update = { [`reactions.${userId}`]: firebase.firestore.FieldValue.delete() };
        } else {
            // User is adding or changing reaction
            update = { [`reactions.${userId}`]: emoji };
        }
        
        await postRef.update(update);
        return true;
    },

    reactToComment: async (postId: string, commentId: string, userId: string, emoji: string): Promise<void> => {
        const commentRef = db.collection('posts').doc(postId).collection('comments').doc(commentId);
        const doc = await commentRef.get();
        if (!doc.exists) return;
        const currentReactions = doc.data()?.reactions || {};

        if (currentReactions[userId] === emoji) {
             await commentRef.update({
                [`reactions.${userId}`]: firebase.firestore.FieldValue.delete()
            });
        } else {
             await commentRef.update({
                [`reactions.${userId}`]: emoji
            });
        }
    },
    
    editComment: async (postId: string, commentId: string, newText: string): Promise<void> => {
        await db.collection('posts').doc(postId).collection('comments').doc(commentId).update({ text: newText });
    },

    deleteComment: async (postId: string, commentId: string): Promise<void> => {
        await db.collection('posts').doc(postId).collection('comments').doc(commentId).delete();
        await db.collection('posts').doc(postId).update({ commentCount: firebase.firestore.FieldValue.increment(-1) });
    },
    
    // --- CHAT ---
    getChatId: (user1Id: string, user2Id: string): string => {
        return [user1Id, user2Id].sort().join('_');
    },

    ensureChatDocumentExists: async (user1: User, user2: User): Promise<void> => {
        const chatId = firebaseService.getChatId(user1.id, user2.id);
        const chatRef = db.collection('chats').doc(chatId);
        const chatDoc = await chatRef.get();

        if (!chatDoc.exists) {
            await chatRef.set({
                participants: {
                    [user1.id]: { name: user1.name, avatarUrl: user1.avatarUrl },
                    [user2.id]: { name: user2.name, avatarUrl: user2.avatarUrl }
                },
                lastMessage: null,
                unreadCounts: {
                    [user1.id]: 0,
                    [user2.id]: 0,
                }
            });
        }
    },

    listenToMessages: (chatId: string, callback: (messages: Message[]) => void): (() => void) => {
        return db.collection('chats').doc(chatId).collection('messages').orderBy('createdAt', 'asc').onSnapshot(snapshot => {
            const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
            callback(messages);
        });
    },

    sendMessage: async (chatId: string, sender: User, recipient: User, messageContent: any): Promise<void> => {
        const chatRef = db.collection('chats').doc(chatId);
        const messagesRef = chatRef.collection('messages');

        const newMessage: Omit<Message, 'id'> = {
            sender: { id: sender.id, name: sender.name, username: sender.username, avatarUrl: sender.avatarUrl },
            createdAt: new Date().toISOString(),
            type: messageContent.type,
            text: messageContent.text,
            replyTo: messageContent.replyTo,
        };

        if (messageContent.type === 'audio' && messageContent.audioBlob) {
            newMessage.audioUrl = await uploadToCloudinary(messageContent.audioBlob, 'raw');
            newMessage.duration = messageContent.duration;
        }
        // Add image/video handling here if needed

        const messageDoc = await messagesRef.add(newMessage);
        const finalMessage = { id: messageDoc.id, ...newMessage };

        // Update the parent chat document
        await chatRef.update({
            lastMessage: finalMessage,
            [`unreadCounts.${recipient.id}`]: firebase.firestore.FieldValue.increment(1)
        });
    },

    unsendMessage: async (chatId: string, messageId: string, userId: string): Promise<void> => {
        const messageRef = db.collection('chats').doc(chatId).collection('messages').doc(messageId);
        const messageDoc = await messageRef.get();
        if (messageDoc.exists && messageDoc.data()?.sender.id === userId) {
            await messageRef.update({ text: '', audioUrl: '', mediaUrl: '', isDeleted: true });
        }
    },
    
    reactToMessage: async (chatId: string, messageId: string, userId: string, emoji: string): Promise<void> => {
        const messageRef = db.collection('chats').doc(chatId).collection('messages').doc(messageId);
        await db.runTransaction(async (transaction) => {
            const messageDoc = await transaction.get(messageRef);
            if (!messageDoc.exists) return;
            const reactions = messageDoc.data()?.reactions || {};
            Object.keys(reactions).forEach(key => {
                reactions[key] = reactions[key].filter((id: string) => id !== userId);
                if (reactions[key].length === 0) delete reactions[key];
            });
            if (!reactions[emoji]) reactions[emoji] = [];
            reactions[emoji].push(userId);
            transaction.update(messageRef, { reactions });
        });
    },
    
    deleteChatHistory: async (chatId: string): Promise<void> => {
        const messagesRef = db.collection('chats').doc(chatId).collection('messages');
        const snapshot = await messagesRef.get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        await db.collection('chats').doc(chatId).update({ lastMessage: null });
    },

    getChatSettings: async (chatId: string): Promise<ChatSettings | null> => {
        const doc = await db.collection('chats').doc(chatId).get();
        return doc.exists ? (doc.data()?.settings as ChatSettings) : null;
    },

    updateChatSettings: async (chatId: string, settings: ChatSettings): Promise<void> => {
        await db.collection('chats').doc(chatId).set({ settings }, { merge: true });
    },

    markMessagesAsRead: async (chatId: string, userId: string): Promise<void> => {
        await db.collection('chats').doc(chatId).update({
            [`unreadCounts.${userId}`]: 0
        });
    },
    
    // --- NOTIFICATIONS ---
    listenToNotifications: (userId: string, callback: (notifications: AppNotification[]) => void): (() => void) => {
        return db.collection('users').doc(userId).collection('notifications').orderBy('createdAt', 'desc').limit(20).onSnapshot(snapshot => {
            const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppNotification));
            callback(notifications);
        });
    },

    markNotificationsAsRead: (userId: string, notificationIds: string[]): Promise<void> => {
        const batch = db.batch();
        notificationIds.forEach(id => {
            const notifRef = db.collection('users').doc(userId).collection('notifications').doc(id);
            batch.update(notifRef, { read: true });
        });
        return batch.commit();
    },
    
    // --- ADVERTISING ---
    trackAdView: (campaignId: string): Promise<void> => {
        return db.collection('campaigns').doc(campaignId).update({
            views: firebase.firestore.FieldValue.increment(1)
        });
    },

    trackAdClick: (campaignId: string): Promise<void> => {
        return db.collection('campaigns').doc(campaignId).update({
            clicks: firebase.firestore.FieldValue.increment(1)
        });
    },
    
    submitLead: (leadData: Omit<Lead, 'id'>): Promise<any> => {
        return db.collection('leads').add(leadData);
    },
    
    getLeadsForCampaign: async (campaignId: string): Promise<Lead[]> => {
        const snapshot = await db.collection('leads').where('campaignId', '==', campaignId).orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
    },

    // --- AGORA TOKEN ---
    getAgoraToken: async (channelName: string, uid: string | number): Promise<string | null> => {
        try {
            // Use the local token serverless function
            const tokenUrl = `/api/token?channelName=${channelName}&uid=${uid}`;
            const response = await fetch(tokenUrl);
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Token server error: ${response.status} ${errorText}`);
                throw new Error(`Failed to fetch token: ${response.statusText}`);
            }
            const data = await response.json();
            if (!data.rtcToken) {
              throw new Error("Token server response did not include rtcToken.");
            }
            return data.rtcToken;
        } catch (error) {
            console.error("Error fetching Agora token:", error);
            return null;
        }
    },
    
    updateSpeakerState: async (roomId: string, speakerId: string, newState: Partial<Speaker>): Promise<boolean> => {
        const roomRef = db.collection('liveAudioRooms').doc(roomId);
        try {
            await db.runTransaction(async (transaction) => {
                const roomDoc = await transaction.get(roomRef);
                if (!roomDoc.exists) {
                    throw "Room does not exist!";
                }
                const roomData = roomDoc.data() as LiveAudioRoom;
                const speakerIndex = roomData.speakers.findIndex(s => s.id === speakerId);

                if (speakerIndex !== -1) {
                    const newSpeakers = [...roomData.speakers];
                    newSpeakers[speakerIndex] = { ...newSpeakers[speakerIndex], ...newState };
                    transaction.update(roomRef, { speakers: newSpeakers });
                }
            });
            return true;
        } catch (error) {
            console.error("Firebase transaction failed to update speaker state: ", error);
            return false;
        }
    },

    getPostsByUser: async (userId: string): Promise<Post[]> => {
        const snapshot = await db.collection('posts').where('author.id', '==', userId).orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
    },

    listenToReelsPosts: (callback: (posts: Post[]) => void): (() => void) => {
        return db.collection('posts').where('videoUrl', '!=', null).orderBy('videoUrl').orderBy('createdAt', 'desc').limit(10).onSnapshot(snapshot => {
             const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
             callback(posts);
        });
    },

    listenToFriendRequests: (userId: string, callback: (users: User[]) => void): (() => void) => {
        return db.collection('users').doc(userId).onSnapshot(async (doc) => {
            const requestIds = doc.data()?.friendRequestsReceived || [];
            if (requestIds.length > 0) {
                const users = await firebaseService.getUsersByIds(requestIds);
                callback(users);
            } else {
                callback([]);
            }
        });
    },
    
    listenToConversations: (userId: string, callback: (convos: Conversation[]) => void): (() => void) => {
        return db.collection('chats').where(`participants.${userId}`, '!=', null).onSnapshot(async (snapshot) => {
            const conversations: Conversation[] = [];
            for (const doc of snapshot.docs) {
                const data = doc.data();
                const peerId = Object.keys(data.participants).find(id => id !== userId);
                if (peerId) {
                    const peer = await firebaseService.getUserProfileById(peerId);
                    if (peer) {
                        conversations.push({
                            peer,
                            lastMessage: data.lastMessage,
                            unreadCount: data.unreadCounts?.[userId] || 0
                        });
                    }
                }
            }
            callback(conversations);
        });
    },

    getInjectableAd: async (currentUser: User): Promise<Post | null> => {
        const snapshot = await db.collection('campaigns').where('status', '==', 'active').limit(10).get();
        const activeCampaigns = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Campaign));
        const validCampaign = activeCampaigns.find(c => !currentUser.blockedUserIds.includes(c.sponsorId));

        if (!validCampaign) return null;

        const sponsor = await firebaseService.getUserProfileById(validCampaign.sponsorId);
        if (!sponsor) return null;

        return {
            id: `ad_${validCampaign.id}`,
            author: { id: sponsor.id, name: sponsor.name, username: sponsor.username, avatarUrl: sponsor.avatarUrl },
            caption: validCampaign.caption,
            createdAt: new Date().toISOString(),
            imageUrl: validCampaign.imageUrl,
            videoUrl: validCampaign.videoUrl,
            audioUrl: validCampaign.audioUrl,
            commentCount: 0,
            comments: [],
            reactions: {},
            isSponsored: true,
            sponsorId: validCampaign.sponsorId,
            sponsorName: validCampaign.sponsorName,
            campaignId: validCampaign.id,
            websiteUrl: validCampaign.websiteUrl,
            allowDirectMessage: validCampaign.allowDirectMessage,
            allowLeadForm: validCampaign.allowLeadForm,
        };
    },
    
    listenToLiveAudioRooms: (callback: (rooms: LiveAudioRoom[]) => void): (() => void) => {
        return db.collection('liveAudioRooms').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
            const rooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiveAudioRoom));
            callback(rooms);
        });
    },

    createLiveAudioRoom: async (host: User, topic: string): Promise<LiveAudioRoom | null> => {
        try {
            const newRoom: Omit<LiveAudioRoom, 'id'> = {
                topic,
                host,
                speakers: [{ id: host.id, name: host.name, avatarUrl: host.avatarUrl, isMuted: false, isSpeaking: false }],
                listeners: [],
                raisedHands: [],
                createdAt: new Date().toISOString(),
            };
            const docRef = await db.collection('liveAudioRooms').add(newRoom);
            return { id: docRef.id, ...newRoom };
        } catch (error) {
            console.error("Error creating live audio room:", error);
            return null;
        }
    },
    
    getCommonFriends: async (userId1: string, userId2: string): Promise<User[]> => { return []; },
    getStories: async (userId: string): Promise<any[]> => { return []; },
    getInjectableStoryAd: async (user: User): Promise<Story | null> => { return null; },
    getExplorePosts: async (userId: string): Promise<Post[]> => { return []; },
    listenToLiveVideoRooms: (cb) => (() => {}),
    listenToRoom: (id, type, cb) => (() => {}),
    createLiveVideoRoom: async (host, topic) => null,
    joinLiveAudioRoom: async (userId, roomId) => {},
    joinLiveVideoRoom: async (userId, roomId) => {},
    leaveLiveAudioRoom: async (userId, roomId) => {},
    leaveLiveVideoRoom: async (userId, roomId) => {},
    endLiveAudioRoom: async (userId, roomId) => {},
    endLiveVideoRoom: async (userId, roomId) => {},
    getAudioRoomDetails: async (roomId) => null,
    raiseHandInAudioRoom: async (userId, roomId) => {},
    inviteToSpeakInAudioRoom: async (hostId, userId, roomId) => {},
    moveToAudienceInAudioRoom: async (hostId, userId, roomId) => {},
    getCampaignsForSponsor: async (id) => [],
    submitCampaignForApproval: async (data, trxId) => {},
    getRandomActiveCampaign: async () => null,
    markStoryAsViewed: async (storyId, userId) => {},
    createStory: async (data, file) => null,
    getGroupById: async (id) => null,
    getSuggestedGroups: async (id) => [],
    createGroup: async (...args) => null,
    joinGroup: async (...args) => false,
    leaveGroup: async (...args) => false,
    getPostsForGroup: async (id) => [],
    updateGroupSettings: async (id, settings) => false,
    pinPost: async (groupId, postId) => false,
    unpinPost: async (groupId) => false,
    voteOnPoll: async (userId, postId, optionIndex) => null,
    markBestAnswer: async (userId, postId, commentId) => null,
    inviteFriendToGroup: async (groupId, friendId) => false,
    getGroupChat: async (id) => null,
    sendGroupChatMessage: async (groupId, sender, text) => ({} as Message),
    getGroupEvents: async (id) => [],
    createGroupEvent: async (...args) => {},
    rsvpToEvent: async (userId, eventId) => false,
    adminLogin: async (email, pass) => null,
    adminRegister: async (email, pass) => null,
    getAdminDashboardStats: async () => ({} as any),
    getAllUsersForAdmin: async () => [],
    updateUserRole: async (id, role) => false,
    getPendingCampaigns: async () => [],
    approveCampaign: async (id) => {},
    rejectCampaign: async (id, reason) => {},
    getAllPostsForAdmin: async () => [],
    deletePostAsAdmin: async (id) => false,
    deleteCommentAsAdmin: async (commentId, postId) => false,
    getPostById: async (id) => null,
    getPendingReports: async () => [],
    resolveReport: async (id, resolution) => {},
    banUser: async (id) => false,
    unbanUser: async (id) => false,
    warnUser: async (id, msg) => false,
    suspendUserCommenting: async (id, days) => false,
    liftUserCommentingSuspension: async (id) => false,
    suspendUserPosting: async (id, days) => false,
    liftUserPostingSuspension: async (id) => false,
    getUserDetailsForAdmin: async (id) => null,
    sendSiteWideAnnouncement: async (msg) => false,
    getAllCampaignsForAdmin: async () => [],
    verifyCampaignPayment: async (id, adminId) => false,
    adminUpdateUserProfilePicture: async (id, base64) => null,
    reactivateUserAsAdmin: async (id) => false,
    promoteGroupMember: async (...args) => false,
    demoteGroupMember: async (...args) => false,
    removeGroupMember: async (...args) => false,
    approveJoinRequest: async (groupId, userId) => {},
    rejectJoinRequest: async (groupId, userId) => {},
    approvePost: async (id) => {},
    rejectPost: async (id) => {},
    createCall: async (caller, callee, chatId, type) => "mock_call_id",
    listenForIncomingCalls: (userId, cb) => (() => {}),
    listenToCall: (callId, cb) => (() => {}),
    updateCallStatus: async (callId, status) => {},
};