import { child, get, off, onValue, push, ref, remove, set, update } from 'firebase/database';
import { Alert, Message, User } from '../types';
import { db } from './firebase';

const CURRENT_USER_KEY = 'guardian_current_user';
const USERS_STORAGE_KEY = 'guardian_users_backup';
const MESSAGES_STORAGE_KEY = 'guardian_messages_backup'; // Restore local storage for messages
const LOCAL_STORAGE_EVENT = 'guardian_local_msg_update'; // Event for current tab updates

// Helper to sanitize email for Firebase paths (cannot contain '.')
const sanitize = (email: string) => email.toLowerCase().replace(/\./g, '_');

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
    // Avoid duplicates if merging
    if (!all[chatId].some((m: Message) => m.id === msg.id)) {
        all[chatId].push(msg);
        localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(all));
    }
};

const saveLocalMessagesBulk = (chatId: string, msgs: Message[]) => {
    const all = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
    all[chatId] = msgs;
    localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(all));
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
    email: user.email.toLowerCase(), 
    id: generateId(),
    guardians: [],
    dangerPhrase: 'help me now'
  };

  const localUsers = getLocalUsers();
  if (localUsers[sanitizedEmail]) return null; 

  saveLocalUser(newUser);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));

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

// --- Chat Management (Hybrid: Firebase + LocalStorage) ---

const getChatId = (email1: string, email2: string) => {
  return [sanitize(email1), sanitize(email2)].sort().join('_');
};

export const sendMessage = async (msg: Omit<Message, 'id' | 'timestamp'>): Promise<Message> => {
  const chatId = getChatId(msg.senderEmail, msg.receiverEmail);
  const timestamp = Date.now();
  
  // Create Message
  const newMessage: Message = { 
      ...msg, 
      id: generateId(), 
      timestamp 
  };

  // 1. Save Local (Instant for this device)
  saveLocalMessage(chatId, newMessage);
  
  // 2. Dispatch Local Event (To update current tab UI instantly via subscription if active)
  window.dispatchEvent(new CustomEvent(LOCAL_STORAGE_EVENT, { detail: { chatId } }));

  // 3. Send to Firebase (Async)
  try {
      const messagesRef = ref(db, `messages/${chatId}`);
      const newMessageRef = push(messagesRef);
      // Use the firebase ID for remote consistency, but local ID is fine for now
      await set(newMessageRef, newMessage);
  } catch(e) {
      console.warn("Firebase send failed, message saved locally", e);
  }
  
  return newMessage;
};

export const subscribeToMessages = (user1Email: string, user2Email: string, callback: (msgs: Message[]) => void) => {
  const chatId = getChatId(user1Email, user2Email);
  const messagesRef = ref(db, `messages/${chatId}`);
  
  const loadAndSend = () => {
      const msgs = getLocalMessages(chatId);
      msgs.sort((a, b) => a.timestamp - b.timestamp);
      callback(msgs);
  };

  // 1. Initial Load
  loadAndSend();

  // 2. Listen for Local Changes (Cross-tab)
  const storageListener = (e: StorageEvent) => {
      if (e.key === MESSAGES_STORAGE_KEY) {
          loadAndSend();
      }
  };
  window.addEventListener('storage', storageListener);

  // 3. Listen for Local Changes (Same-tab custom event)
  const customListener = (e: any) => {
      if (e.detail && e.detail.chatId === chatId) {
          loadAndSend();
      }
  };
  window.addEventListener(LOCAL_STORAGE_EVENT, customListener);

  // 4. Listen for Remote Changes (Firebase)
  const unsubscribeFB = onValue(messagesRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const loadedMessages = Object.values(data) as Message[];
      
      // Update Local Cache with Truth from Server
      saveLocalMessagesBulk(chatId, loadedMessages);
      
      // Trigger update
      loadAndSend();
    }
  });

  return () => {
      window.removeEventListener('storage', storageListener);
      window.removeEventListener(LOCAL_STORAGE_EVENT, customListener);
      off(messagesRef);
  };
};

export const deleteConversation = async (user1Email: string, user2Email: string) => {
  const chatId = getChatId(user1Email, user2Email);
  // Clear local
  const all = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
  delete all[chatId];
  localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(all));
  window.dispatchEvent(new CustomEvent(LOCAL_STORAGE_EVENT, { detail: { chatId } }));
  
  // Clear remote
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
