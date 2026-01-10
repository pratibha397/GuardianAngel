import { child, get, off, onValue, push, ref, remove, set, update } from 'firebase/database';
import { Alert, Message, User } from '../types';
import { db } from './firebase';

const CURRENT_USER_KEY = 'guardian_current_user';
const USERS_STORAGE_KEY = 'guardian_users_backup';
const MESSAGES_STORAGE_KEY = 'guardian_messages_backup';
const ALERTS_STORAGE_KEY = 'guardian_alerts_backup';

// Helper to sanitize email for Firebase paths
const sanitize = (email: string) => email.trim().toLowerCase().replace(/\./g, '_');

// Polyfill for randomUUID
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// --- TIMEOUT HELPER (Fixes Slow Login) ---
// If the promise doesn't resolve in ms, it rejects.
const withTimeout = <T>(promise: Promise<T>, ms: number = 2000): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Network timeout - switching to local")), ms);
        promise
            .then(res => { clearTimeout(timer); resolve(res); })
            .catch(err => { clearTimeout(timer); reject(err); });
    });
};

// --- LocalStorage Fallback Helpers ---
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

const getLocalMessages = (chatId: string): Message[] => {
     try {
        const all = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
        return all[chatId] || [];
    } catch { return []; }
};

const saveLocalMessage = (chatId: string, msg: Message) => {
    const all = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
    if (!all[chatId]) all[chatId] = [];
    all[chatId].push(msg);
    localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(all));
};

const saveLocalAlert = (recipientEmail: string, alert: Alert) => {
    const key = sanitize(recipientEmail);
    const all = JSON.parse(localStorage.getItem(ALERTS_STORAGE_KEY) || '{}');
    if (!all[key]) all[key] = [];
    all[key].push(alert);
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(all));
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
    id: generateId(),
    guardians: [],
    dangerPhrase: 'help'
  };
  
  // Optimistic Local Save (Instant UI feedback)
  saveLocalUser(newUser);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));

  // Sync to Firebase with Timeout
  // If this fails or times out, the user is still logged in locally
  withTimeout(get(child(ref(db), `users/${sanitizedEmail}`)))
    .then((snapshot) => {
       if (!snapshot.exists()) {
           set(ref(db, `users/${sanitizedEmail}`), newUser).catch(console.warn);
       }
    })
    .catch(() => console.warn("Network slow, using local mode for registration"));

  return newUser;
};

export const loginUser = async (email: string, password: string): Promise<User | null> => {
  const sanitizedEmail = sanitize(email);
  
  // 1. Try Remote with strict timeout
  try {
    const snapshot = await withTimeout(get(child(ref(db), `users/${sanitizedEmail}`)));
    if (snapshot.exists()) {
      const user = snapshot.val() as User;
      if (user.password === password) {
        saveLocalUser(user);
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        return user;
      }
    }
  } catch (e) {
      console.warn("Remote login failed/timed out, trying local backup");
  }

  // 2. Try Local
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
  // Fire and forget
  update(ref(db, `users/${sanitizedEmail}`), updatedUser).catch(console.warn);
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
    const searchEmail = email.trim().toLowerCase();
    const sanitizedEmail = sanitize(email);
    
    // 1. Remote Lookup with LONGER Timeout (5s) because this is critical
    try {
        const snapshot = await withTimeout(get(child(ref(db), `users/${sanitizedEmail}`)), 5000);
        if (snapshot.exists()) {
            const user = snapshot.val() as User;
            saveLocalUser(user);
            return user;
        }
    } catch (e) { console.warn("Direct lookup failed/timed out"); }
    
    // 2. Local Fallback
    const local = getLocalUsers();
    return Object.values(local).find(u => u.email.toLowerCase() === searchEmail) || null;
};

export const getUsers = async (): Promise<User[]> => {
  const localUsers = Object.values(getLocalUsers());
  // Background sync
  get(child(ref(db), 'users')).then(snapshot => {
      if (snapshot.exists()) {
          Object.values(snapshot.val()).forEach((u: any) => saveLocalUser(u));
      }
  }).catch(() => {});
  return localUsers;
};

// --- Chat Management ---

const getChatId = (email1: string, email2: string) => {
  return [sanitize(email1), sanitize(email2)].sort().join('_');
};

export const sendMessage = async (msg: Omit<Message, 'id' | 'timestamp'>) => {
  const chatId = getChatId(msg.senderEmail, msg.receiverEmail);
  const newMessage: Message = { ...msg, id: generateId(), timestamp: Date.now() };

  saveLocalMessage(chatId, newMessage);

  const messagesRef = ref(db, `messages/${chatId}`);
  const newMessageRef = push(messagesRef);
  set(newMessageRef, { ...newMessage, id: newMessageRef.key! }).catch(console.warn);
};

export const subscribeToMessages = (user1Email: string, user2Email: string, callback: (msgs: Message[]) => void) => {
  const chatId = getChatId(user1Email, user2Email);
  const messagesRef = ref(db, `messages/${chatId}`);
  
  const initialLocal = getLocalMessages(chatId);
  callback(initialLocal.sort((a, b) => a.timestamp - b.timestamp));

  const unsubscribe = onValue(messagesRef, (snapshot) => {
    if (snapshot.exists()) {
      const loadedMessages = Object.values(snapshot.val()) as Message[];
      loadedMessages.sort((a, b) => a.timestamp - b.timestamp);
      
      const all = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
      all[chatId] = loadedMessages;
      localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(all));

      callback(loadedMessages);
    }
  });

  return () => off(messagesRef);
};

export const deleteConversation = async (user1Email: string, user2Email: string) => {
  const chatId = getChatId(user1Email, user2Email);
  const all = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
  delete all[chatId];
  localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(all));
  remove(ref(db, `messages/${chatId}`)).catch(console.warn);
};

// --- Alert System ---

export const sendAlert = async (senderEmail: string, receiverEmail: string, reason: string, lat?: number, lng?: number) => {
    const alert: Alert = {
        id: generateId(),
        senderEmail,
        receiverEmail,
        reason,
        timestamp: Date.now(),
        lat, 
        lng,
        acknowledged: false
    };
    
    saveLocalAlert(receiverEmail, alert);
    const alertsRef = ref(db, `alerts/${sanitize(receiverEmail)}`);
    const newAlertRef = push(alertsRef);
    await set(newAlertRef, alert);
};

export const subscribeToAlerts = (userEmail: string, callback: (alerts: Alert[]) => void) => {
    const alertsRef = ref(db, `alerts/${sanitize(userEmail)}`);
    const unsubscribe = onValue(alertsRef, (snapshot) => {
        if (snapshot.exists()) {
            callback(Object.values(snapshot.val()) as Alert[]);
        } else {
            callback([]);
        }
    });
    return () => off(alertsRef);
};