import React, { useEffect, useRef, useState } from 'react';
import { deleteConversation, findUserByEmail, getUsers, sendMessage, subscribeToMessages } from '../services/storage';
import { Message, User } from '../types';

interface ChatProps {
  currentUser: User;
}

const Chat: React.FC<ChatProps> = ({ currentUser }) => {
  const [selectedGuardian, setSelectedGuardian] = useState<string | null>(null);
  const [selectedGuardianName, setSelectedGuardianName] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [contacts, setContacts] = useState<{email: string, name: string}[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load contacts
  useEffect(() => {
    const fetchContacts = async () => {
      setLoadingContacts(true);
      try {
        const allUsers = await getUsers();
        
        // Find users that are either in my guardians list OR have me in their guardians list
        // Note: This relies on fetching all users, which is fine for a demo but not scalable for production.
        const relevantEmails = new Set<string>();
        
        // Add my guardians
        if (currentUser.guardians) {
            currentUser.guardians.forEach(g => relevantEmails.add(g));
        }

        // Add people who guard me (reverse lookup)
        allUsers.forEach(u => {
            if (u.guardians && u.guardians.includes(currentUser.email)) {
                relevantEmails.add(u.email);
            }
        });

        const contactList: {email: string, name: string}[] = [];
        for (const email of Array.from(relevantEmails)) {
            const user = await findUserByEmail(email);
            contactList.push({
                email: email,
                name: user ? user.name : email.split('@')[0]
            });
        }
        
        setContacts(contactList);
      } catch (e) {
          console.error("Error fetching contacts", e);
      } finally {
        setLoadingContacts(false);
      }
    };
    fetchContacts();
  }, [currentUser]);

  // Subscribe to messages
  useEffect(() => {
    if (selectedGuardian) {
      setMessages([]); // Clear previous messages while loading
      const unsubscribe = subscribeToMessages(currentUser.email, selectedGuardian, (msgs) => {
        setMessages(msgs);
      });
      
      // Update name for header
      const contact = contacts.find(c => c.email === selectedGuardian);
      setSelectedGuardianName(contact ? contact.name : selectedGuardian);

      return () => {
          unsubscribe(); // Cleanup listener on unmount or switch
      };
    }
  }, [selectedGuardian, currentUser.email, contacts]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedGuardian) return;
    const text = inputText;
    setInputText(''); 
    
    try {
        await sendMessage({
            senderEmail: currentUser.email,
            receiverEmail: selectedGuardian,
            text: text
        });
        // Optimistic update not needed as Firebase listener triggers immediately
    } catch (e) {
        console.error("Failed to send", e);
        alert("Failed to send message. Check connection.");
        setInputText(text); // Restore text
    }
  };

  const sendLocation = async () => {
    if (!selectedGuardian) return;
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            await sendMessage({
                senderEmail: currentUser.email,
                receiverEmail: selectedGuardian,
                text: "Shared a location",
                isLocation: true,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
            });
        });
    }
  };

  const handleDelete = async () => {
      if (selectedGuardian && window.confirm("Delete conversation history?")) {
          await deleteConversation(currentUser.email, selectedGuardian);
          setMessages([]);
      }
  };

  if (!selectedGuardian) {
      return (
        <div className="h-full flex flex-col">
            <h2 className="text-2xl font-bold text-white mb-6 px-2">Messages</h2>
            <div className="flex-1 overflow-y-auto space-y-3 pb-20 no-scrollbar">
                {loadingContacts && (
                    <div className="flex justify-center p-8">
                        <div className="w-6 h-6 border-2 border-blue-500 rounded-full animate-spin border-t-transparent"></div>
                    </div>
                )}
                {!loadingContacts && contacts.length === 0 && (
                     <div className="text-center py-12 bg-white/5 rounded-3xl border border-dashed border-white/10 mx-2">
                        <span className="text-4xl block mb-2 opacity-50">📭</span>
                        <p className="text-gray-400 text-sm">No conversations yet.</p>
                        <p className="text-gray-500 text-xs mt-2">Add a guardian to start chatting.</p>
                    </div>
                )}
                {contacts.map(c => (
                    <button 
                        key={c.email}
                        onClick={() => setSelectedGuardian(c.email)}
                        className="w-full text-left p-4 bg-card/60 hover:bg-card/80 backdrop-blur-md rounded-2xl border border-white/5 flex items-center gap-4 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shrink-0">
                            {c.name[0]?.toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                            <div className="text-gray-100 font-semibold truncate">{c.name}</div>
                            <div className="text-xs text-gray-500 truncate">{c.email}</div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
      );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-black/20 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
        {/* Chat Header */}
        <div className="p-4 bg-white/5 border-b border-white/5 flex justify-between items-center backdrop-blur-md z-10">
            <div className="flex items-center gap-3 overflow-hidden">
                <button 
                    onClick={() => setSelectedGuardian(null)} 
                    className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                    </svg>
                </button>
                <div className="flex flex-col overflow-hidden">
                    <span className="text-white font-bold text-sm truncate">{selectedGuardianName}</span>
                    <span className="text-[10px] text-green-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                        Live
                    </span>
                </div>
            </div>
            <button onClick={handleDelete} className="p-2 text-red-400 hover:bg-red-500/10 rounded-full transition-colors shrink-0" title="Delete Conversation">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                </svg>
            </button>
        </div>
        
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-dark/50 to-black/50 no-scrollbar">
            {messages.length === 0 && (
                <div className="text-center text-gray-500 mt-10 text-sm">
                    No messages yet. Say hello!
                </div>
            )}
            {messages.map(m => {
                const isMe = m.senderEmail === currentUser.email;
                return (
                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                        <div className={`max-w-[80%] p-3 px-4 rounded-2xl shadow-lg relative ${isMe ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-tr-none' : 'bg-slate-800 text-gray-200 rounded-tl-none border border-white/5'}`}>
                            {m.isLocation ? (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider opacity-90">
                                        <span className="animate-pulse">📍</span> Live Location
                                    </div>
                                    <div className="w-full h-24 bg-black/20 rounded-lg flex items-center justify-center border border-white/10 overflow-hidden relative group cursor-pointer">
                                        <div className="absolute inset-0 bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors"></div>
                                        <a 
                                            href={`https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="relative z-10 bg-white text-blue-900 text-xs font-bold px-3 py-1.5 rounded-full shadow-lg hover:scale-105 transition-transform"
                                        >
                                            View on Maps
                                        </a>
                                    </div>
                                </div>
                            ) : (
                                <p className="leading-relaxed text-sm break-words">{m.text}</p>
                            )}
                            <span className={`text-[9px] block text-right mt-1 opacity-70`}>
                                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                );
            })}
            <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 bg-white/5 border-t border-white/5 flex gap-2 backdrop-blur-md">
            <button 
                onClick={sendLocation} 
                className="p-3 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-xl transition-colors border border-white/5"
                title="Share Location"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
            </button>
            <input 
                className="flex-1 bg-slate-800/50 rounded-xl px-4 text-white outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-500 border border-white/5 transition-all"
                placeholder="Type a message..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
            <button 
                onClick={handleSend} 
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 rounded-xl font-bold shadow-lg shadow-blue-900/20 transition-all active:scale-95"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                </svg>
            </button>
        </div>
    </div>
  );
};

export default Chat;