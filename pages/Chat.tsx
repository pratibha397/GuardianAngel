import React, { useEffect, useRef, useState } from 'react';
import { deleteConversation, findUserByEmail, getUsers, sendMessage, subscribeToMessages } from '../services/storage';
import { Message, User } from '../types';

interface ChatProps {
  currentUser: User;
}

const Chat: React.FC<ChatProps> = ({ currentUser }) => {
  const [selectedGuardian, setSelectedGuardian] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  
  // List of people I can chat with (Guardians + People who have me as guardian)
  const [chatContacts, setChatContacts] = useState<{email: string, name: string}[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Contacts
  useEffect(() => {
    const loadContacts = async () => {
        setLoadingContacts(true);
        const contactEmails = new Set<string>();
        
        // Add my guardians
        if (currentUser.guardians) {
            currentUser.guardians.forEach(email => contactEmails.add(email));
        }

        // Add people I protect (Need to scan all users - crude but effective for small scale)
        const allUsers = await getUsers();
        allUsers.forEach(u => {
            if (u.guardians && u.guardians.includes(currentUser.email)) {
                contactEmails.add(u.email);
            }
        });

        // Resolve names
        const loadedContacts = [];
        for (const email of Array.from(contactEmails)) {
            const user = await findUserByEmail(email);
            loadedContacts.push({
                email: email,
                name: user ? user.name : email // Fallback to email if name not found
            });
        }
        setChatContacts(loadedContacts);
        setLoadingContacts(false);
    };
    loadContacts();
  }, [currentUser]);

  // 2. Subscribe to Messages when a chat is selected
  useEffect(() => {
    if (!selectedGuardian) {
        setMessages([]);
        return;
    }

    // Subscribe
    const unsubscribe = subscribeToMessages(currentUser.email, selectedGuardian, (newMessages) => {
        setMessages(newMessages);
    });

    return () => {
        unsubscribe();
    };
  }, [selectedGuardian, currentUser.email]);

  // 3. Auto Scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedGuardian) return;

    const textToSend = inputText;
    setInputText(''); // Clear UI immediately

    try {
        await sendMessage({
            senderEmail: currentUser.email,
            receiverEmail: selectedGuardian,
            text: textToSend
        });
    } catch (e) {
        alert("Failed to send message");
        setInputText(textToSend); // Put it back if failed
    }
  };

  const handleSendLocation = async () => {
      if (!selectedGuardian) return;
      if (!navigator.geolocation) return;

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
      if (!selectedGuardian) return;
      if (confirm("Clear chat history?")) {
          await deleteConversation(currentUser.email, selectedGuardian);
      }
  };

  const selectedContactName = chatContacts.find(c => c.email === selectedGuardian)?.name || selectedGuardian;

  // View: Contact List
  if (!selectedGuardian) {
      return (
          <div className="flex flex-col h-full">
              <h2 className="text-2xl font-bold text-white mb-6">Chats</h2>
              {loadingContacts ? (
                  <div className="text-gray-500 text-center mt-10">Loading contacts...</div>
              ) : chatContacts.length === 0 ? (
                  <div className="text-gray-500 text-center mt-10 p-6 border border-white/10 rounded-2xl">
                      No contacts found. Add a guardian first!
                  </div>
              ) : (
                  <div className="space-y-3">
                      {chatContacts.map(c => (
                          <button
                            key={c.email}
                            onClick={() => setSelectedGuardian(c.email)}
                            className="w-full text-left p-4 bg-card/60 rounded-xl border border-white/5 flex items-center gap-4 hover:bg-white/10 transition-colors"
                          >
                              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                                  {c.name[0].toUpperCase()}
                              </div>
                              <div>
                                  <div className="text-white font-bold">{c.name}</div>
                                  <div className="text-gray-500 text-xs">{c.email}</div>
                              </div>
                          </button>
                      ))}
                  </div>
              )}
          </div>
      );
  }

  // View: Chat Interface
  return (
      <div className="flex flex-col h-[calc(100vh-140px)] bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
          {/* Header */}
          <div className="p-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedGuardian(null)} className="text-gray-400 hover:text-white">
                      ← Back
                  </button>
                  <span className="font-bold text-white">{selectedContactName}</span>
              </div>
              <button onClick={handleDelete} className="text-red-400 text-xs hover:underline">Clear Chat</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
              {messages.length === 0 && <div className="text-center text-gray-500 text-xs mt-4">Start the conversation...</div>}
              {messages.map(msg => {
                  const isMe = msg.senderEmail === currentUser.email;
                  return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] p-3 rounded-2xl ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-700 text-gray-200 rounded-tl-none'}`}>
                              {msg.isLocation ? (
                                  <div className="flex flex-col gap-2">
                                      <span className="font-bold text-xs uppercase flex items-center gap-1">📍 Shared Location</span>
                                      <a 
                                        href={`https://www.google.com/maps/search/?api=1&query=${msg.lat},${msg.lng}`}
                                        target="_blank"
                                        className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs text-center transition-colors"
                                      >
                                          Open Maps
                                      </a>
                                  </div>
                              ) : (
                                  <div className="text-sm">{msg.text}</div>
                              )}
                              <div className="text-[9px] opacity-50 text-right mt-1">
                                  {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </div>
                          </div>
                      </div>
                  );
              })}
              <div ref={messagesEndRef}></div>
          </div>

          {/* Input */}
          <div className="p-3 bg-white/5 border-t border-white/10 flex gap-2">
              <button 
                onClick={handleSendLocation}
                className="p-3 bg-slate-700 text-blue-400 rounded-xl hover:bg-slate-600 transition-colors"
                title="Send Location"
              >
                  📍
              </button>
              <input 
                  className="flex-1 bg-slate-900 rounded-xl px-4 text-white outline-none border border-white/10 focus:border-blue-500 transition-colors"
                  placeholder="Type a message..."
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
              />
              <button 
                onClick={handleSend}
                className="p-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-colors"
              >
                  Send
              </button>
          </div>
      </div>
  );
};

export default Chat;
