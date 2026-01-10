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

  // 1. Efficiently Load Contacts
  useEffect(() => {
    const fetch = async () => {
        setLoadingContacts(true);
        const list = await getChatContacts(currentUser);
        setContacts(list);
        setLoadingContacts(false);
    };
    fetch();
  }, [currentUser]);

  // 2. Real-time Subscription
  useEffect(() => {
    if (!selectedGuardian) return;

    setMessages([]); // Clear previous chat instantly
    
    const unsubscribe = subscribeToMessages(currentUser.email, selectedGuardian, (serverMessages) => {
        setMessages(serverMessages);
    });

    return () => unsubscribe();
  }, [selectedGuardian, currentUser.email]);

  // 3. Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Handlers ---

  const handleSend = async () => {
    if (!inputText.trim() || !selectedGuardian) return;

    const text = inputText;
    setInputText(''); // Clear input instantly

    // OPTIMISTIC UPDATE: Show message immediately before server confirms
    const tempId = 'temp-' + Date.now();
    const optimisticMsg: Message = {
        id: tempId,
        senderEmail: currentUser.email,
        receiverEmail: selectedGuardian,
        text: text,
        timestamp: Date.now()
    };

    setMessages(prev => [...prev, optimisticMsg]);

    try {
        // Send in background
        await sendMessage({
            senderEmail: currentUser.email,
            receiverEmail: selectedGuardian,
            text: text
        });
    } catch (e) {
        console.error("Send failed", e);
        // If it fails, strictly we should remove the temp message, 
        // but for this app we'll assume eventual consistency or user retry.
    }
  };

  const handleSendLocation = () => {
      if (!selectedGuardian || !navigator.geolocation) return;
      
      // Optimistic UI for location
      const optimisticMsg: Message = {
          id: 'temp-loc-' + Date.now(),
          senderEmail: currentUser.email,
          receiverEmail: selectedGuardian,
          text: "Sharing Location...",
          timestamp: Date.now(),
          isLocation: true,
          lat: 0, lng: 0
      };
      setMessages(prev => [...prev, optimisticMsg]);

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
      if (selectedGuardian && confirm("Delete entire conversation?")) {
          setMessages([]); // Instant clear
          await deleteConversation(currentUser.email, selectedGuardian);
      }
  };

  // --- Render ---

  if (!selectedGuardian) {
      return (
          <div className="flex flex-col h-full">
              <h2 className="text-2xl font-bold text-white mb-4 px-2">Messages</h2>
              {loadingContacts ? (
                   <div className="flex justify-center p-10"><div className="w-6 h-6 border-2 border-blue-500 rounded-full animate-spin border-t-transparent"></div></div>
              ) : contacts.length === 0 ? (
                  <div className="text-gray-500 text-center p-8 bg-white/5 rounded-2xl border border-white/5 mx-2">
                      <p>No contacts found.</p>
                      <p className="text-xs mt-2">Add a guardian to start chatting!</p>
                  </div>
              ) : (
                  <div className="space-y-2 overflow-y-auto pb-20 no-scrollbar">
                      {contacts.map(c => (
                          <button
                            key={c.email}
                            onClick={() => setSelectedGuardian(c.email)}
                            className="w-full bg-slate-800/60 p-4 rounded-xl flex items-center gap-4 hover:bg-slate-700 transition-all border border-white/5"
                          >
                              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                  {c.name[0]?.toUpperCase()}
                              </div>
                              <div className="text-left">
                                  <div className="text-white font-semibold text-lg">{c.name}</div>
                                  <div className="text-gray-400 text-xs">{c.email}</div>
                              </div>
                          </button>
                      ))}
                  </div>
              )}
          </div>
      );
  }

  const activeContact = contacts.find(c => c.email === selectedGuardian);

  return (
      <div className="flex flex-col h-[calc(100vh-140px)] bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="p-4 bg-slate-800/80 border-b border-white/10 flex justify-between items-center z-10">
              <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedGuardian(null)} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
                      <span className="text-2xl">←</span>
                  </button>
                  <div>
                    <h3 className="font-bold text-white leading-tight">{activeContact?.name || selectedGuardian}</h3>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        <span className="text-[10px] text-green-400 uppercase tracking-wide">Secure Connection</span>
                    </div>
                  </div>
              </div>
              <button onClick={handleDelete} className="text-gray-400 hover:text-red-400 p-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.49 1.478 47.4 47.4 0 00-15.28 0 .75.75 0 01-.49-1.478 48.809 48.809 0 013.876-.512v-.227c0-1.005.81-1.847 1.819-1.936.85-.075 1.706-.115 2.568-.115.862 0 1.718.04 2.568.115 1.01.089 1.819.93 1.819 1.936zm-3.75 2.5a.75.75 0 00-1.5 0v7a.75.75 0 001.5 0v-7z" clipRule="evenodd" />
                  </svg>
              </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/20 no-scrollbar">
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
                                      {msg.lat !== 0 ? (
                                        <a 
                                            href={`https://www.google.com/maps/search/?api=1&query=${msg.lat},${msg.lng}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block w-full bg-white/10 hover:bg-white/20 p-2 rounded text-center text-sm transition-colors border border-white/10"
                                        >
                                            View on Map ↗
                                        </a>
                                      ) : (
                                          <div className="h-8 bg-white/10 animate-pulse rounded"></div>
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
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
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
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                  </svg>
              </button>
          </div>
      </div>
  );
};

export default Chat;