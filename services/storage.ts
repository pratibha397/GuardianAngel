import { child, get, off, onValue, push, ref, remove, set, update } from 'firebase/database';
import { Alert, Message, User } from '../types';
import { db } from './firebase';

const CURRENT_USER_KEY = 'guardian_current_user';
const USERS_STORAGE_KEY = 'guardian_users_backup';
const MESSAGES_STORAGE_KEY = 'guardian_messages_backup';
const ALERTS_STORAGE_KEY = 'guardian_alerts_backup';

// Helper to sanitize email for Firebase paths (cannot contain '.')
const sanitize = (email: string) => email.trim().toLowerCase().replace(/\./g, '_');

// Polyfill for randomUUID
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
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

const getLocalAlerts = (userEmail: string): Alert[] => {
    try {
        const all = JSON.parse(localStorage.getItem(ALERTS_STORAGE_KEY) || '{}');
        return all[sanitize(userEmail)] || [];
    } catch { return []; }
};

const saveLocalAlert = (recipientEmail: string, alert: Alert) => {
    const key = sanitize(recipientEmail);
    const all = JSON.parse(localStorage.getItem(ALERTS_STORAGE_KEY) || '{}');
    if (!all[key]) all[key] = [];
    all[key].push(alert);
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(all));
};


// Helper: Run promise with short timeout
const withTimeout = <T>(promise: Promise<T>, ms: number = 3000): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Network Timeout")), ms);
        promise.then(
            (res) => { clearTimeout(timer); resolve(res); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });
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
    dangerPhrase: 'help me now'
  };

  // 1. Local Check
  const localUsers = getLocalUsers();
  if (localUsers[sanitizedEmail]) return null; 

  // 2. Optimistic Write
  saveLocalUser(newUser);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));

  // 3. Remote Sync
  try {
      await set(ref(db, `users/${sanitizedEmail}`), newUser);
  } catch (e) {
      console.warn("Background sync skipped/failed:", e);
  }

  return newUser;
};

export const loginUser = async (email: string, password: string): Promise<User | null> => {
  const sanitizedEmail = sanitize(email);
  
  // 1. Remote Check (Priority)
  try {
    const snapshot = await withTimeout(
        get(child(ref(db), `users/${sanitizedEmail}`)), 
        3000 
    );
    if (snapshot.exists()) {
      const user = snapshot.val() as User;
      if (user.password === password) {
        saveLocalUser(user);
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        return user;
      }
    }
  } catch (e) {
      console.warn("Remote login check failed:", e);
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
  update(ref(db, `users/${sanitizedEmail}`), updatedUser).catch(e => console.warn(e));
};

// NEW FUNCTION: Direct Database Lookup
export const findUserByEmail = async (email: string): Promise<User | null> => {
    const sanitizedEmail = sanitize(email);
    
    // 1. Try Remote First (Crucial for adding guardians)
    try {
        const snapshot = await withTimeout(
            get(child(ref(db), `users/${sanitizedEmail}`)), 
            4000
        );
        if (snapshot.exists()) {
            const user = snapshot.val() as User;
            saveLocalUser(user); // Update local cache
            return user;
        }
    } catch (e) {
        console.warn("Remote lookup error:", e);
    }

    // 2. Try Local Cache
    const localUsers = getLocalUsers();
    return localUsers[sanitizedEmail] || null;
};

export const getUsers = async (): Promise<User[]> => {
  const localUsers = Object.values(getLocalUsers());
  try {
      withTimeout(get(child(ref(db), 'users')), 2000).then(snapshot => {
          if (snapshot.exists()) {
              const remoteData = snapshot.val();
              Object.values(remoteData).forEach((u: any) => saveLocalUser(u));
          }
      }).catch(() => {});
  } catch {}
  return localUsers;
};

// --- Chat Management ---

const getChatId = (email1: string, email2: string) => {
  return [sanitize(email1), sanitize(email2)].sort().join('_');
};

export const sendMessage = async (msg: Omit<Message, 'id' | 'timestamp'>) => {
  const chatId = getChatId(msg.senderEmail, msg.receiverEmail);
  const timestamp = Date.now();
  const id = generateId();
  const newMessage: Message = { ...msg, id, timestamp };

  saveLocalMessage(chatId, newMessage);
  const messagesRef = ref(db, `messages/${chatId}`);
  const newMessageRef = push(messagesRef);
  set(newMessageRef, { ...newMessage, id: newMessageRef.key! }).catch(console.warn);
};

export const subscribeToMessages = (user1Email: string, user2Email: string, callback: (msgs: Message[]) => void) => {
  const chatId = getChatId(user1Email, user2Email);
  const messagesRef = ref(db, `messages/${chatId}`);
  
  const initialLocal = getLocalMessages(chatId);
  if (initialLocal.length > 0) {
      callback(initialLocal.sort((a, b) => a.timestamp - b.timestamp));
  }

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
    
    saveLocalAlert(receiverEmail, alert);
    const alertsRef = ref(db, `alerts/${sanitize(receiverEmail)}`);
    const newAlertRef = push(alertsRef);
    await set(newAlertRef, alert);
};

export const subscribeToAlerts = (userEmail: string, callback: (alerts: Alert[]) => void) => {
    const userKey = sanitize(userEmail);
    const alertsRef = ref(db, `alerts/${userKey}`);
    
    const unsubscribe = onValue(alertsRef, (snapshot) => {
        if (snapshot.exists()) {
            callback(Object.values(snapshot.val()) as Alert[]);
        } else {
            callback([]);
        }
    });

    return () => off(alertsRef);
};