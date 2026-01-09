import React, { useState, useEffect } from 'react';
import { User, Message } from '../types';
import { subscribeToMessages, sendMessage, deleteConversation, getUsers } from '../services/storage';

interface ChatProps {
  currentUser: User;
}

const Chat: React.FC<ChatProps> = ({ currentUser }) => {
  const [selectedGuardian, setSelectedGuardian] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [contacts, setContacts] = useState<string[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Load contacts (Guardians + People who added me)
  useEffect(() => {
    const fetchContacts = async () => {
      setLoadingContacts(true);
      const allUsers = await getUsers();
      const uniqueContacts = Array.from(new Set([
          ...currentUser.guardians,
          ...allUsers.filter(u => u.guardians && u.guardians.includes(currentUser.email)).map(u => u.email)
      ]));
      setContacts(uniqueContacts);
      setLoadingContacts(false);
    };
    fetchContacts();
  }, [currentUser]);

  // Subscribe to messages when guardian is selected
  useEffect(() => {
    if (selectedGuardian) {
      const unsubscribe = subscribeToMessages(currentUser.email, selectedGuardian, (msgs) => {
        setMessages(msgs);
      });
      return () => unsubscribe();
    }
  }, [selectedGuardian, currentUser.email]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedGuardian) return;
    const text = inputText;
    setInputText(''); // Optimistic clear
    await sendMessage({
        senderEmail: currentUser.email,
        receiverEmail: selectedGuardian,
        text: text
    });
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
      if (selectedGuardian && window.confirm("Delete conversation?")) {
          await deleteConversation(currentUser.email, selectedGuardian);
          setMessages([]);
      }
  };

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col bg-card rounded-xl overflow-hidden border border-gray-800">
      {!selectedGuardian ? (
        <div className="p-4 overflow-y-auto h-full">
            <h2 className="text-white font-bold mb-4">Select Contact</h2>
            {loadingContacts && <p className="text-gray-500">Loading contacts...</p>}
            {!loadingContacts && contacts.length === 0 && <p className="text-gray-500">No contacts found.</p>}
            {contacts.map(c => (
                <button 
                    key={c}
                    onClick={() => setSelectedGuardian(c)}
                    className="w-full text-left p-4 hover:bg-dark border-b border-gray-700 text-gray-200 transition"
                >
                    {c}
                </button>
            ))}
        </div>
      ) : (
        <>
            <div className="bg-gray-800 p-3 flex justify-between items-center">
                <button onClick={() => setSelectedGuardian(null)} className="text-gray-400 hover:text-white">← Back</button>
                <span className="text-white font-medium">{selectedGuardian}</span>
                <button onClick={handleDelete} className="text-red-400 text-sm">🗑️</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-dark">
                {messages.map(m => {
                    const isMe = m.senderEmail === currentUser.email;
                    return (
                        <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] p-3 rounded-xl ${isMe ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                                {m.isLocation ? (
                                    <div>
                                        <p className="font-bold mb-1">📍 Live Location</p>
                                        <a 
                                            href={`https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="underline text-sm opacity-80"
                                        >
                                            Open in Maps
                                        </a>
                                    </div>
                                ) : (
                                    <p>{m.text}</p>
                                )}
                                <span className="text-[10px] opacity-50 block text-right mt-1">
                                    {new Date(m.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="p-3 bg-gray-800 flex gap-2">
                <button onClick={sendLocation} className="text-2xl" title="Send Location">📍</button>
                <input 
                    className="flex-1 bg-dark rounded px-3 text-white outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Type a message..."
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                />
                <button onClick={handleSend} className="bg-blue-600 text-white px-4 rounded font-bold">Send</button>
            </div>
        </>
      )}
    </div>
  );
};

export default Chat;