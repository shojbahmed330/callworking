import React, { useState } from 'react';
import { User } from '../types';
import Icon from './Icon';

// Define a more specific type for chat messages in this context
export interface LiveChatMessage {
    id: string;
    author: {
        id: string;
        name: string;
        avatarUrl: string;
    };
    text: string;
}

interface LiveChatDisplayProps {
    messages: LiveChatMessage[];
    currentUser: User;
    onSendMessage: (text: string) => void;
}

const LiveChatDisplay: React.FC<LiveChatDisplayProps> = ({ messages, currentUser, onSendMessage }) => {
    const [newMessage, setNewMessage] = useState('');

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim()) {
            onSendMessage(newMessage.trim());
            setNewMessage('');
        }
    };

    return (
        <div className="w-full h-full bg-black/30 rounded-lg p-2 flex flex-col">
            <div className="flex-grow overflow-y-auto pr-2">
                <div className="flex flex-col gap-2">
                    {messages.map((msg) => (
                        <div key={msg.id} className="flex items-start gap-2 text-sm">
                            <img src={msg.author.avatarUrl} alt={msg.author.name} className="w-6 h-6 rounded-full" />
                            <div className="flex flex-col">
                                <span className={`font-semibold ${msg.author.id === currentUser.id ? 'text-rose-400' : 'text-slate-300'}`}>
                                    {msg.author.name}
                                </span>
                                <p className="text-white break-words">{msg.text}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <form onSubmit={handleSendMessage} className="flex-shrink-0 pt-2">
                <div className="relative">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Say something..."
                        className="w-full bg-black/50 rounded-full py-2 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                     <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-400 disabled:opacity-50" disabled={!newMessage.trim()}>
                        <Icon name="paper-airplane" className="w-5 h-5" />
                    </button>
                </div>
            </form>
        </div>
    );
};

export default LiveChatDisplay;
