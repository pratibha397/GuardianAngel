import { child, get, off, onValue, push, ref, remove, set, update } from 'firebase/database';
import { Alert, Message, User } from '../types';
import { db } from './firebase';

const CURRENT_USER_KEY = 'guardian_current_user';

// Helper to sanitize email for Firebase paths (cannot contain '.')
const sanitize = (email: string) => email.toLowerCase().replace(/\./g, '_');

// ID Generator
const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// --- Session Management ---

export const getCurrentUser = (): User | null => {
  const stored = localStorage.getItem(CURRENT_USER_KEY);
  return stored ? JSON.parse(stored) : null;
};

export const logoutUser = () => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

// --- User Management ---

export const registerUser = async (user: Omit<User, 'id' | 'guardians' | 'dangerPhrase'>): Promise<User | null> => {
  const sanitizedEmail = sanitize(user.email);
  const userRef = ref(db, `users/${sanitizedEmail}`);
  
  // Check if exists
  const snapshot = await get(userRef);
  if (snapshot.exists()) return null;

  const newUser: User = {
    ...user,
    email: user.email.toLowerCase(), 
    id: generateId(),
    guardians: [],
    dangerPhrase: 'help me now'
  };

  await set(userRef, newUser);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));
  return newUser;
};

export const loginUser = async (email: string, password: string): Promise<User | null> => {
  const sanitizedEmail = sanitize(email);
  const userRef = ref(db, `users/${sanitizedEmail}`);
  
  const snapshot = await get(userRef);
  if (snapshot.exists()) {
      const user = snapshot.val() as User;
      if (user.password === password) {
          localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
          return user;
      }
  }
  return null;
};

export const updateUser = async (updatedUser: User): Promise<void> => {
  const sanitizedEmail = sanitize(updatedUser.email);
  // Update Local
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
  // Update Remote
  await update(ref(db, `users/${sanitizedEmail}`), updatedUser);
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
    if (!email) return null;
    const sanitizedEmail = sanitize(email);
    try {
        const snapshot = await get(child(ref(db), `users/${sanitizedEmail}`));
        if (snapshot.exists()) {
            return snapshot.val() as User;
        }
    } catch (e) {
        console.error("Error finding user:", e);
    }
    return null;
};

export const getUsers = async (): Promise<User[]> => {
    try {
        const snapshot = await get(child(ref(db), 'users'));
        if (snapshot.exists()) {
            return Object.values(snapshot.val());
        }
    } catch (e) {
        console.error(e);
    }
    return [];
};

// --- Chat Management (Pure Firebase for 2-Way Consistency) ---

const getChatId = (email1: string, email2: string) => {
  // Sort emails to ensure both users generate the SAME chat ID
  return [sanitize(email1), sanitize(email2)].sort().join('_');
};

export const sendMessage = async (msg: Omit<Message, 'id' | 'timestamp'>): Promise<void> => {
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

export const subscribeToMessages = (user1Email: string, user2Email: string, callback: (msgs: Message[]) => void) => {
  const chatId = getChatId(user1Email, user2Email);
  const messagesRef = ref(db, `messages/${chatId}`);
  
  const unsubscribe = onValue(messagesRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const loadedMessages = Object.values(data) as Message[];
      // Sort by time
      loadedMessages.sort((a, b) => a.timestamp - b.timestamp);
      callback(loadedMessages);
    } else {
      callback([]);
    }
  });

  return () => off(messagesRef);
};

export const deleteConversation = async (user1Email: string, user2Email: string) => {
  const chatId = getChatId(user1Email, user2Email);
  await remove(ref(db, `messages/${chatId}`));
};

// --- Alert System ---

export const sendAlert = async (senderEmail: string, receiverEmail: string, reason: string, lat?: number, lng?: number) => {
    const alertId = generateId();
    const alert: Alert = {
        id: alertId,
        senderEmail,
        receiverEmail,
        reason,
        timestamp: Date.now(),
        lat, 
        lng,
        acknowledged: false
    };
    
    // Push to the receiver's alert queue
    const recipientKey = sanitize(receiverEmail);
    await push(ref(db, `alerts/${recipientKey}`), alert);
};

export const subscribeToAlerts = (userEmail: string, callback: (alerts: Alert[]) => void) => {
    const userKey = sanitize(userEmail);
    const alertsRef = ref(db, `alerts/${userKey}`);
    
    const unsubscribe = onValue(alertsRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const alerts = Object.values(data) as Alert[];
            callback(alerts);
        } else {
            callback([]);
        }
    });
    
    return () => off(alertsRef);
};
