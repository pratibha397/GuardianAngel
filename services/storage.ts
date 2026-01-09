import { User, Message } from '../types';
import { db } from './firebase';
import { ref, set, get, child, push, onValue, remove, update } from 'firebase/database';

const CURRENT_USER_KEY = 'guardian_current_user';

// Helper to sanitize email for Firebase paths (cannot contain '.')
const sanitize = (email: string) => email.replace(/\./g, '_');

// --- Session Management (Local) ---

export const getCurrentUser = (): User | null => {
  const stored = localStorage.getItem(CURRENT_USER_KEY);
  return stored ? JSON.parse(stored) : null;
};

export const logoutUser = () => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

// --- User Management (Firebase) ---

export const registerUser = async (user: Omit<User, 'id' | 'guardians' | 'dangerPhrase'>): Promise<User | null> => {
  const sanitizedEmail = sanitize(user.email);
  const userRef = ref(db, `users/${sanitizedEmail}`);
  
  const snapshot = await get(userRef);
  if (snapshot.exists()) {
    return null; // User already exists
  }

  const newUser: User = {
    ...user,
    id: crypto.randomUUID(),
    guardians: [],
    dangerPhrase: 'help me now'
  };

  await set(userRef, newUser);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));
  return newUser;
};

export const loginUser = async (email: string, password: string): Promise<User | null> => {
  const sanitizedEmail = sanitize(email);
  const dbRef = ref(db);
  
  try {
    const snapshot = await get(child(dbRef, `users/${sanitizedEmail}`));
    if (snapshot.exists()) {
      const user = snapshot.val() as User;
      if (user.password === password) {
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        return user;
      }
    }
    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateUser = async (updatedUser: User): Promise<void> => {
  const sanitizedEmail = sanitize(updatedUser.email);
  await update(ref(db, `users/${sanitizedEmail}`), updatedUser);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
};

export const getUsers = async (): Promise<User[]> => {
  const dbRef = ref(db);
  const snapshot = await get(child(dbRef, 'users'));
  if (snapshot.exists()) {
    return Object.values(snapshot.val());
  }
  return [];
};

// --- Chat Management (Firebase) ---

const getChatId = (email1: string, email2: string) => {
  return [sanitize(email1), sanitize(email2)].sort().join('_');
};

export const sendMessage = async (msg: Omit<Message, 'id' | 'timestamp'>) => {
  const chatId = getChatId(msg.senderEmail, msg.receiverEmail);
  const messagesRef = ref(db, `messages/${chatId}`);
  const newMessageRef = push(messagesRef);
  
  const newMessage: Message = {
    ...msg,
    id: newMessageRef.key!,
    timestamp: Date.now()
  };
  
  await set(newMessageRef, newMessage);
};

// Real-time subscription to messages
export const subscribeToMessages = (user1Email: string, user2Email: string, callback: (msgs: Message[]) => void) => {
  const chatId = getChatId(user1Email, user2Email);
  const messagesRef = ref(db, `messages/${chatId}`);
  
  return onValue(messagesRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const loadedMessages = Object.values(data) as Message[];
      // Sort by timestamp
      loadedMessages.sort((a, b) => a.timestamp - b.timestamp);
      callback(loadedMessages);
    } else {
      callback([]);
    }
  });
};

export const deleteConversation = async (user1Email: string, user2Email: string) => {
  const chatId = getChatId(user1Email, user2Email);
  await remove(ref(db, `messages/${chatId}`));
};
