import React, { useEffect, useRef, useState } from 'react';
import { deleteConversation, getChatContacts, sendMessage, subscribeToMessages } from '../services/storage';
import { Message, User } from '../types';

interface ChatProps {
  currentUser: User;
}

const Chat: React.FC<ChatProps> = ({ currentUser }) => {
  const [selectedGuardian, setSelectedGuardian] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  
  const [contacts, setContacts] = useState<{email: string, name: string}[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Load Contacts (My Guardians + People who added me)
  useEffect(() => {
    const fetch = async () => {
        setLoadingContacts(true);
        const list = await getChatContacts(currentUser);
        setContacts(list);
        setLoadingContacts(false);
    };
    fetch();
  }, [currentUser]);

  // 2. Subscribe to Real-time Messages
  useEffect(() => {
    if (!selectedGuardian) return;

    setMessages([]); // Clear previous view
    
    // This listener is purely network-based via Firebase
    const unsubscribe = subscribeToMessages(currentUser.email, selectedGuardian, (serverMessages) => {
        setMessages(serverMessages);
    });

    return () => unsubscribe();
  }, [selectedGuardian, currentUser.email]);

  // 3. Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedGuardian) return;

    const text = inputText;
    setInputText(''); 

    // Optimistic UI update (shows message before server confirms, makes it feel instant)
    // Real consistency is handled by the subscription above.
    await sendMessage({
        senderEmail: currentUser.email,
        receiverEmail: selectedGuardian,
        text: text
    });
  };

  const handleSendLocation = () => {
      if (!selectedGuardian || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(async (pos) => {
          await sendMessage({
              senderEmail: currentUser.email,
              receiverEmail: selectedGuardian,
              text: "Shared Location",
              isLocation: true,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude
          });
      });
  };

  const handleDelete = async () => {
      if (selectedGuardian && confirm("Delete conversation history for both users?")) {
          await deleteConversation(currentUser.email, selectedGuardian);
      }
  };

  // --- Render Contact List ---
  if (!selectedGuardian) {
      return (
          <div className="flex flex-col h-full">
              <h2 className="text-2xl font-bold text-white mb-4 px-2">Communication Hub</h2>
              {loadingContacts ? (
                   <div className="flex justify-center p-10"><div className="w-8 h-8 border-4 border-blue-500 rounded-full animate-spin border-t-transparent"></div></div>
              ) : contacts.length === 0 ? (
                  <div className="text-gray-500 text-center p-8 bg-white/5 rounded-2xl border border-white/5 mx-2">
                      <p>No contacts found.</p>
                      <p className="text-xs mt-2">Add a guardian or wait for someone to add you.</p>
                  </div>
              ) : (
                  <div className="space-y-2 overflow-y-auto pb-20 no-scrollbar">
                      {contacts.map(c => (
                          <button
                            key={c.email}
                            onClick={() => setSelectedGuardian(c.email)}
                            className="w-full bg-slate-800/60 p-4 rounded-xl flex items-center gap-4 hover:bg-slate-700 transition-all border border-white/5 group"
                          >
                              <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:scale-110 transition-transform">
                                  {c.name[0]?.toUpperCase()}
                              </div>
                              <div className="text-left flex-1">
                                  <div className="text-white font-semibold text-lg">{c.name}</div>
                                  <div className="text-gray-400 text-xs">{c.email}</div>
                              </div>
                              <div className="text-gray-600 group-hover:text-blue-400">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                                </svg>
                              </div>
                          </button>
                      ))}
                  </div>
              )}
          </div>
      );
  }

  const activeContactName = contacts.find(c => c.email === selectedGuardian)?.name || selectedGuardian;

  // --- Render Chat View ---
  return (
      <div className="flex flex-col h-[calc(100vh-140px)] bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="p-4 bg-slate-800/80 border-b border-white/10 flex justify-between items-center z-10">
              <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedGuardian(null)} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors text-gray-300">
                      ← Back
                  </button>
                  <div>
                    <h3 className="font-bold text-white leading-tight">{activeContactName}</h3>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        <span className="text-[10px] text-green-400 uppercase tracking-wide">Network Active</span>
                    </div>
                  </div>
              </div>
              <button onClick={handleDelete} className="text-gray-500 hover:text-red-400 p-2" title="Clear History">
                  🗑️
              </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/20 no-scrollbar">
              {messages.length === 0 && (
                  <div className="text-center text-gray-600 text-sm mt-10">
                      Start the conversation...
                  </div>
              )}
              {messages.map((msg) => {
                  const isMe = msg.senderEmail === currentUser.email;
                  return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                          <div 
                            className={`max-w-[85%] p-3 px-4 rounded-2xl shadow-md relative ${
                                isMe 
                                ? 'bg-blue-600 text-white rounded-tr-sm' 
                                : 'bg-slate-700 text-gray-100 rounded-tl-sm'
                            }`}
                          >
                              {msg.isLocation ? (
                                  <div className="min-w-[200px]">
                                      <div className="flex items-center gap-2 mb-2 font-bold text-xs uppercase opacity-90">
                                          <span>📍 Location Shared</span>
                                      </div>
                                      {msg.lat !== undefined ? (
                                        <a 
                                            href={`https://www.google.com/maps/search/?api=1&query=${msg.lat},${msg.lng}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block w-full bg-white/10 hover:bg-white/20 p-2 rounded text-center text-sm transition-colors border border-white/10"
                                        >
                                            Open Map ↗
                                        </a>
                                      ) : (
                                          <div className="text-xs text-red-300">Location data error</div>
                                      )}
                                  </div>
                              ) : (
                                  <p className="text-[15px] leading-relaxed break-words">{msg.text}</p>
                              )}
                              <span className="text-[9px] opacity-60 block text-right mt-1">
                                  {new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                              </span>
                          </div>
                      </div>
                  );
              })}
              <div ref={messagesEndRef}></div>
          </div>

          {/* Input */}
          <div className="p-3 bg-slate-800/80 backdrop-blur border-t border-white/10 flex gap-2">
              <button 
                onClick={handleSendLocation}
                className="p-3 text-blue-400 bg-slate-700/50 hover:bg-slate-700 rounded-xl transition-colors"
                title="Send Location"
              >
                  📍
              </button>
              <input 
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Type a message..."
                className="flex-1 bg-slate-900/50 border border-white/10 rounded-xl px-4 text-white placeholder:text-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
              />
              <button 
                onClick={handleSend}
                className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl font-bold shadow-lg shadow-blue-900/20 transition-transform active:scale-95"
              >
                  ➤
              </button>
          </div>
      </div>
  );
};

export default Chat;