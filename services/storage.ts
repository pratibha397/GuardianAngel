import { child, get, off, onValue, push, ref, remove, set, update } from 'firebase/database';
import { Alert, Message, User } from '../types';
import { db } from './firebase';

const CURRENT_USER_KEY = 'guardian_current_user';
const USERS_STORAGE_KEY = 'guardian_users_backup';
const MESSAGES_STORAGE_KEY = 'guardian_messages_backup';
const ALERTS_STORAGE_KEY = 'guardian_alerts_backup';

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


// Helper: Run promise with short timeout to prevent UI blocking on slow network
const withTimeout = <T>(promise: Promise<T>, ms: number = 2500): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Firebase Operation Timeout")), ms);
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
    email: user.email.toLowerCase(), // Store normalized email
    id: generateId(),
    guardians: [],
    dangerPhrase: 'help me now'
  };

  // 1. Local Check (Instant)
  const localUsers = getLocalUsers();
  if (localUsers[sanitizedEmail]) return null; // Already exists locally

  // 2. Optimistic Write (Instant Success)
  saveLocalUser(newUser);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));

  // 3. Background Sync (Fire & Forget)
  withTimeout(
      (async () => {
          const userRef = ref(db, `users/${sanitizedEmail}`);
          await set(userRef, newUser);
      })(),
      2000
  ).catch(e => console.warn("Background sync skipped/failed:", e));

  return newUser;
};

export const loginUser = async (email: string, password: string): Promise<User | null> => {
  const sanitizedEmail = sanitize(email);
  
  // 1. Local Check (Instant)
  const localUsers = getLocalUsers();
  const localUser = localUsers[sanitizedEmail];
  
  if (localUser && localUser.password === password) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(localUser));
      return localUser;
  }

  // 2. If not local, try Remote (with timeout)
  try {
    const snapshot = await withTimeout(
        get(child(ref(db), `users/${sanitizedEmail}`)), 
        2000 
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
      console.warn("Remote login check failed/timed out:", e);
  }

  return null;
};

export const updateUser = async (updatedUser: User): Promise<void> => {
  const sanitizedEmail = sanitize(updatedUser.email);
  
  // 1. Update Local (Instant)
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
  saveLocalUser(updatedUser);

  // 2. Background Sync
  update(ref(db, `users/${sanitizedEmail}`), updatedUser).catch(e => 
      console.warn("Background update failed:", e)
  );
};

// NEW: Helper to find any user by email (Remote lookup)
export const findUserByEmail = async (email: string): Promise<User | null> => {
    const sanitizedEmail = sanitize(email);
    try {
        // Try Remote First for most up-to-date data (e.g. name changes)
        // Only use local if remote fails
        try {
            const snapshot = await get(child(ref(db), `users/${sanitizedEmail}`));
            if (snapshot.exists()) {
                const u = snapshot.val() as User;
                saveLocalUser(u); // Cache it
                return u;
            }
        } catch (e) {
            // Fallback to local
        }
        
        const local = getLocalUsers()[sanitizedEmail];
        if (local) return local;

    } catch (e) {
        console.error("Lookup failed", e);
    }
    return null;
};

export const getUsers = async (): Promise<User[]> => {
  // Try remote fetch
  try {
      const snapshot = await withTimeout(get(child(ref(db), 'users')), 1500);
      if (snapshot.exists()) {
          const usersObj = snapshot.val();
          return Object.values(usersObj);
      }
  } catch {}
  
  // Fallback local
  return Object.values(getLocalUsers());
};

// --- Chat Management ---

const getChatId = (email1: string, email2: string) => {
  // Sort alphabetically to ensure same ID regardless of sender/receiver order
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
  set(newMessageRef, { ...newMessage, id: newMessageRef.key! }).catch(e => 
      console.warn("Background message send failed:", e)
  );
};

export const subscribeToMessages = (user1Email: string, user2Email: string, callback: (msgs: Message[]) => void) => {
  const chatId = getChatId(user1Email, user2Email);
  const messagesRef = ref(db, `messages/${chatId}`);
  
  let unsubscribeFirebase: any;

  // Initial Load (Local)
  const initialLocal = getLocalMessages(chatId);
  callback(initialLocal.sort((a, b) => a.timestamp - b.timestamp));

  // Subscribe Remote
  try {
      unsubscribeFirebase = onValue(messagesRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const loadedMessages = Object.values(data) as Message[];
          loadedMessages.sort((a, b) => a.timestamp - b.timestamp);
          
          // Update Cache
          const all = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
          all[chatId] = loadedMessages;
          localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(all));

          callback(loadedMessages);
        }
      });
  } catch (e) {
      console.error("Firebase chat subscription failed", e);
  }

  return () => {
    if (unsubscribeFirebase) off(messagesRef);
  };
};

export const deleteConversation = async (user1Email: string, user2Email: string) => {
  const chatId = getChatId(user1Email, user2Email);
  const all = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
  delete all[chatId];
  localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(all));
  remove(ref(db, `messages/${chatId}`)).catch(e => console.warn(e));
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
    // Optimistic Local Save (if sending to self? Unlikely but good practice)
    if (sanitize(senderEmail) === recipientKey) {
        saveLocalAlert(receiverEmail, alert);
    }

    const alertsRef = ref(db, `alerts/${recipientKey}`);
    const newAlertRef = push(alertsRef);
    await set(newAlertRef, alert);
};

export const subscribeToAlerts = (userEmail: string, callback: (alerts: Alert[]) => void) => {
    const userKey = sanitize(userEmail);
    const alertsRef = ref(db, `alerts/${userKey}`);
    
    console.log("Subscribing to alerts for:", userKey);
    
    let unsubscribe: any;
    
    try {
        unsubscribe = onValue(alertsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const alerts = Object.values(data) as Alert[];
                console.log("Alerts received:", alerts.length);
                callback(alerts);
            } else {
                callback([]);
            }
        });
    } catch (e) {
        console.warn("Alert subscription failed", e);
    }
    
    return () => {
        if (unsubscribe) off(alertsRef);
    };
};
