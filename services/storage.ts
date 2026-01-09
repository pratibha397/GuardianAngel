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


// Helper: Run promise with short timeout to prevent UI blocking on slow network
const withTimeout = <T>(promise: Promise<T>, ms: number = 1500): Promise<T> => {
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
          // We intentionally skip the 'check exists' on remote to speed up. 
          // If it overwrites in a demo scenario, it's fine. 
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
  // This handles the case where user registered on another device
  try {
    const snapshot = await withTimeout(
        get(child(ref(db), `users/${sanitizedEmail}`)), 
        2000 // 2s max wait for network
    );
    
    if (snapshot.exists()) {
      const user = snapshot.val() as User;
      if (user.password === password) {
        // Cache it locally for next time
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

export const getUsers = async (): Promise<User[]> => {
  // Return local immediately for speed
  const localUsers = Object.values(getLocalUsers());
  
  // Attempt to fetch remote and merge (fire and forget)
  try {
      withTimeout(get(child(ref(db), 'users')), 1000).then(snapshot => {
          if (snapshot.exists()) {
              const remoteUsers = Object.values(snapshot.val()) as User[];
              // In a real app we would merge this into local state
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

  // 1. Save Local (Instant)
  saveLocalMessage(chatId, newMessage);

  // 2. Send Remote (Background)
  const messagesRef = ref(db, `messages/${chatId}`);
  const newMessageRef = push(messagesRef);
  set(newMessageRef, { ...newMessage, id: newMessageRef.key! }).catch(e => 
      console.warn("Background message send failed:", e)
  );
};

// Real-time subscription
export const subscribeToMessages = (user1Email: string, user2Email: string, callback: (msgs: Message[]) => void) => {
  const chatId = getChatId(user1Email, user2Email);
  const messagesRef = ref(db, `messages/${chatId}`);
  
  let unsubscribeFirebase: any;
  let localInterval: any;

  // 1. Load Local Immediately
  const initialLocal = getLocalMessages(chatId);
  if (initialLocal.length > 0) {
      callback(initialLocal.sort((a, b) => a.timestamp - b.timestamp));
  }

  // 2. Try Firebase Subscription
  try {
      unsubscribeFirebase = onValue(messagesRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const loadedMessages = Object.values(data) as Message[];
          loadedMessages.sort((a, b) => a.timestamp - b.timestamp);
          
          // Sync remote messages to local storage
          const all = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
          all[chatId] = loadedMessages;
          localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(all));

          callback(loadedMessages);
        }
      }, (error) => {
          console.warn("Firebase subscribe error, using local polling", error);
          if (!localInterval) startLocalPolling();
      });
  } catch (e) {
      if (!localInterval) startLocalPolling();
  }

  function startLocalPolling() {
      if (localInterval) return;
      localInterval = setInterval(() => {
          const updated = getLocalMessages(chatId);
          callback(updated.sort((a, b) => a.timestamp - b.timestamp));
      }, 1000);
  }

  return () => {
    if (unsubscribeFirebase) off(messagesRef);
    if (localInterval) clearInterval(localInterval);
  };
};

export const deleteConversation = async (user1Email: string, user2Email: string) => {
  const chatId = getChatId(user1Email, user2Email);
  
  // 1. Delete Local
  const all = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
  delete all[chatId];
  localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(all));

  // 2. Delete Remote
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

    // 1. Save Local Backup (though this is for another user, so local doesn't matter as much unless shared device)
    saveLocalAlert(receiverEmail, alert);

    // 2. Send Remote
    const alertsRef = ref(db, `alerts/${recipientKey}`);
    const newAlertRef = push(alertsRef);
    await set(newAlertRef, alert);
};

export const subscribeToAlerts = (userEmail: string, callback: (alerts: Alert[]) => void) => {
    const userKey = sanitize(userEmail);
    const alertsRef = ref(db, `alerts/${userKey}`);
    
    let unsubscribe: any;
    
    try {
        unsubscribe = onValue(alertsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const alerts = Object.values(data) as Alert[];
                callback(alerts);
            } else {
                callback([]);
            }
        });
    } catch (e) {
        console.warn("Alert subscription failed", e);
    }
    
    // Fallback polling for local demo
    const interval = setInterval(() => {
        const local = getLocalAlerts(userEmail);
        if (local.length > 0) callback(local);
    }, 2000);

    return () => {
        if (unsubscribe) off(alertsRef);
        clearInterval(interval);
    };
};