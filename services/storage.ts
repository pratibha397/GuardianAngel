import { child, get, onValue, push, ref, remove, set, update } from 'firebase/database';
import { Alert, Message, User } from '../types';
import { db } from './firebase';

const CURRENT_USER_KEY = 'guardian_current_user';
const USERS_STORAGE_KEY = 'guardian_users_backup';

// Helper to sanitize email for Firebase paths (cannot contain '.')
// CRITICAL: Always lowercase to ensure consistency across devices/inputs
const sanitize = (email: string) => email.toLowerCase().replace(/\./g, '_');

// Polyfill for randomUUID
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// --- LocalStorage Fallback Helpers (User Auth Only) ---
const getLocalUsers = (): Record<string, User> => {
    try {
        return JSON.parse(localStorage.getItem(USERS_STORAGE_KEY) || '{}');
    } catch { return {}; }
};

const saveLocalUser = (user: User) => {
    const users = getLocalUsers();
    users[sanitize(user.email)] = user;
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
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
  const newUser: User = {
    ...user,
    email: user.email.toLowerCase(), // Store normalized email
    id: generateId(),
    guardians: [],
    dangerPhrase: 'help me now'
  };

  // 1. Local Check
  const localUsers = getLocalUsers();
  if (localUsers[sanitizedEmail]) return null; 

  // 2. Save Local
  saveLocalUser(newUser);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));

  // 3. Save Remote (Async, robust)
  try {
      const userRef = ref(db, `users/${sanitizedEmail}`);
      await set(userRef, newUser);
  } catch (e) {
      console.warn("Remote registration issue (offline?):", e);
  }

  return newUser;
};

export const loginUser = async (email: string, password: string): Promise<User | null> => {
  const sanitizedEmail = sanitize(email);
  
  // 1. Try Remote First (Source of Truth)
  try {
    const snapshot = await get(child(ref(db), `users/${sanitizedEmail}`));
    if (snapshot.exists()) {
      const user = snapshot.val() as User;
      if (user.password === password) {
        saveLocalUser(user);
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        return user;
      }
    }
  } catch (e) {
      console.warn("Remote login failed, trying local backup", e);
  }

  // 2. Local Fallback
  const localUsers = getLocalUsers();
  const localUser = localUsers[sanitizedEmail];
  
  if (localUser && localUser.password === password) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(localUser));
      return localUser;
  }

  return null;
};

export const updateUser = async (updatedUser: User): Promise<void> => {
  const sanitizedEmail = sanitize(updatedUser.email);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
  saveLocalUser(updatedUser);
  
  try {
    await update(ref(db, `users/${sanitizedEmail}`), updatedUser);
  } catch (e) {
      console.warn("Update failed", e);
  }
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
    const sanitizedEmail = sanitize(email);
    try {
        const snapshot = await get(child(ref(db), `users/${sanitizedEmail}`));
        if (snapshot.exists()) {
            return snapshot.val() as User;
        }
    } catch (e) {
        // Fallback to local if remote fails
        const local = getLocalUsers()[sanitizedEmail];
        if (local) return local;
    }
    return null;
};

export const getUsers = async (): Promise<User[]> => {
  try {
      const snapshot = await get(child(ref(db), 'users'));
      if (snapshot.exists()) {
          const usersObj = snapshot.val();
          return Object.values(usersObj);
      }
  } catch {}
  return Object.values(getLocalUsers());
};

// --- Chat Management ---

const getChatId = (email1: string, email2: string) => {
  return [sanitize(email1), sanitize(email2)].sort().join('_');
};

// MODIFIED: Return the message object immediately and don't await the network call
export const sendMessage = async (msg: Omit<Message, 'id' | 'timestamp'>): Promise<Message> => {
  const chatId = getChatId(msg.senderEmail, msg.receiverEmail);
  const timestamp = Date.now();
  const messagesRef = ref(db, `messages/${chatId}`);
  const newMessageRef = push(messagesRef);
  
  const newMessage: Message = { 
      ...msg, 
      id: newMessageRef.key!, 
      timestamp 
  };

  // Fire and forget - don't block the UI waiting for server ack
  set(newMessageRef, newMessage).catch(e => console.error("Background send failed", e));
  
  return newMessage;
};

export const subscribeToMessages = (user1Email: string, user2Email: string, callback: (msgs: Message[]) => void) => {
  const chatId = getChatId(user1Email, user2Email);
  const messagesRef = ref(db, `messages/${chatId}`);
  
  // Real-time listener
  // onValue returns the unsubscribe function in standard modular SDK
  const unsubscribe = onValue(messagesRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const loadedMessages = Object.values(data) as Message[];
      loadedMessages.sort((a, b) => a.timestamp - b.timestamp);
      callback(loadedMessages);
    } else {
      callback([]);
    }
  });

  return unsubscribe;
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
    
    const recipientKey = sanitize(receiverEmail);
    const alertsRef = ref(db, `alerts/${recipientKey}`);
    const newAlertRef = push(alertsRef);
    await set(newAlertRef, alert);
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
    
    return unsubscribe;
};