import { child, get, off, onValue, push, ref, remove, set, update } from 'firebase/database';
import { Alert, Message, User } from '../types';
import { db } from './firebase';

const CURRENT_USER_KEY = 'guardian_current_user';
const USERS_STORAGE_KEY = 'guardian_users_backup';
const MESSAGES_STORAGE_KEY = 'guardian_messages_backup';
const ALERTS_STORAGE_KEY = 'guardian_alerts_backup';

// Helper to sanitize email for Firebase paths (cannot contain '.')
const sanitize = (email: string) => email.replace(/\./g, '_');

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

// --- Session Management ---

export const getCurrentUser = (): User | null => {
  const stored = localStorage.getItem(CURRENT_USER_KEY);
  if (!stored) return null;
  
  const user = JSON.parse(stored);
  if (!user.guardians) user.guardians = [];
  return user;
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

  // 2. Save Local
  saveLocalUser(newUser);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));

  // 3. Save to Firebase
  if (db) {
    try {
        const userRef = ref(db, `users/${sanitizedEmail}`);
        await set(userRef, newUser);
    } catch (e) {
        console.error("Firebase registration failed:", e);
    }
  }

  return newUser;
};

export const loginUser = async (email: string, password: string): Promise<User | null> => {
  const sanitizedEmail = sanitize(email);
  
  // 1. Local Check
  const localUsers = getLocalUsers();
  const localUser = localUsers[sanitizedEmail];
  
  if (localUser && localUser.password === password) {
      if (!localUser.guardians) localUser.guardians = [];
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(localUser));
      return localUser;
  }

  // 2. Remote Check
  if (db) {
      try {
        const snapshot = await get(child(ref(db), `users/${sanitizedEmail}`));
        
        if (snapshot.exists()) {
          const user = snapshot.val() as User;
          if (user.password === password) {
            if (!user.guardians) user.guardians = [];
            
            saveLocalUser(user);
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
            return user;
          }
        }
      } catch (e) {
          console.warn("Remote login check failed:", e);
      }
  }

  return null;
};

export const updateUser = async (updatedUser: User): Promise<void> => {
  const sanitizedEmail = sanitize(updatedUser.email);
  
  // 1. Update Local
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
  saveLocalUser(updatedUser);

  // 2. Update Firebase
  if (db) {
      try {
          await update(ref(db, `users/${sanitizedEmail}`), updatedUser);
      } catch (e) {
          console.error("Background update failed:", e);
      }
  }
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
    const sanitizedEmail = sanitize(email);
    if (db) {
        try {
            const snapshot = await get(child(ref(db), `users/${sanitizedEmail}`));
            if (snapshot.exists()) {
                const user = snapshot.val() as User;
                if (!user.guardians) user.guardians = [];
                return user;
            }
        } catch (e) {
            console.error("Error finding user in database:", e);
        }
    }
    return null;
};

export const getUsers = async (): Promise<User[]> => {
  const localUsers = Object.values(getLocalUsers());
  if (db) {
      try {
          const snapshot = await get(child(ref(db), 'users'));
          if (snapshot.exists()) {
              const remoteUsers = Object.values(snapshot.val()) as User[];
              remoteUsers.forEach(u => { if (!u.guardians) u.guardians = []; });
              return remoteUsers;
          }
      } catch {}
  }
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

  if (db) {
      const messagesRef = ref(db, `messages/${chatId}`);
      const newMessageRef = push(messagesRef);
      set(newMessageRef, { ...newMessage, id: newMessageRef.key! }).catch(e => 
          console.warn("Background message send failed:", e)
      );
  }
};

export const subscribeToMessages = (user1Email: string, user2Email: string, callback: (msgs: Message[]) => void) => {
  const chatId = getChatId(user1Email, user2Email);
  
  const initialLocal = getLocalMessages(chatId);
  if (initialLocal.length > 0) {
      callback(initialLocal.sort((a, b) => a.timestamp - b.timestamp));
  }

  if (db) {
      const messagesRef = ref(db, `messages/${chatId}`);
      const unsubscribe = onValue(messagesRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const loadedMessages = Object.values(data) as Message[];
          loadedMessages.sort((a, b) => a.timestamp - b.timestamp);
          
          const all = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
          all[chatId] = loadedMessages;
          localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(all));

          callback(loadedMessages);
        }
      });
      return () => off(messagesRef);
  }

  return () => {};
};

export const deleteConversation = async (user1Email: string, user2Email: string) => {
  const chatId = getChatId(user1Email, user2Email);
  
  const all = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
  delete all[chatId];
  localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(all));

  if (db) {
      remove(ref(db, `messages/${chatId}`)).catch(e => console.warn(e));
  }
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

    if (db) {
        const recipientKey = sanitize(receiverEmail);
        const alertsRef = ref(db, `alerts/${recipientKey}`);
        const newAlertRef = push(alertsRef);
        await set(newAlertRef, alert);
    }
};

export const subscribeToAlerts = (userEmail: string, callback: (alerts: Alert[]) => void) => {
    // If no DB, we can try to check local storage occasionally, 
    // but for now alerts are primarily real-time.
    if (db) {
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
    }
    return () => {};
};

// --- REAL-TIME LOCATION SHARING ---

export const updateLiveLocation = async (email: string, lat: number, lng: number) => {
    if (db) {
        const userKey = sanitize(email);
        const locationRef = ref(db, `locations/${userKey}`);
        await set(locationRef, {
            lat,
            lng,
            timestamp: Date.now()
        }).catch(e => console.warn("Location update failed", e));
    }
};

export const subscribeToLiveLocation = (email: string, callback: (loc: { lat: number, lng: number, timestamp: number } | null) => void) => {
    if (db) {
        const userKey = sanitize(email);
        const locationRef = ref(db, `locations/${userKey}`);
        
        const unsubscribe = onValue(locationRef, (snapshot) => {
            if (snapshot.exists()) {
                callback(snapshot.val());
            } else {
                callback(null);
            }
        });

        return () => off(locationRef);
    }
    return () => {};
};