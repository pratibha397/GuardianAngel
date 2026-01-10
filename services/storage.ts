import { child, get, off, onValue, push, ref, remove, set, update } from 'firebase/database';
import { Alert, Message, User } from '../types';
import { db } from './firebase';

const CURRENT_USER_KEY = 'guardian_current_user';

// --- In-Memory Cache for Speed ---
// This prevents re-fetching user details constantly, making the app feel instant.
const userCache = new Map<string, User>();

// Helper to sanitize email for Firebase paths
const sanitize = (email: string) => email.toLowerCase().replace(/\./g, '_');

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// --- Session ---

export const getCurrentUser = (): User | null => {
  const stored = localStorage.getItem(CURRENT_USER_KEY);
  return stored ? JSON.parse(stored) : null;
};

export const logoutUser = () => {
  localStorage.removeItem(CURRENT_USER_KEY);
  userCache.clear();
};

// --- User Logic ---

export const registerUser = async (user: Omit<User, 'id' | 'guardians' | 'dangerPhrase'>): Promise<User | null> => {
  const sanitizedEmail = sanitize(user.email);
  const userRef = ref(db, `users/${sanitizedEmail}`);
  
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
  userCache.set(newUser.email, newUser);
  return newUser;
};

export const loginUser = async (email: string, password: string): Promise<User | null> => {
  const sanitizedEmail = sanitize(email);
  // Try cache first (unlikely on login, but good practice)
  
  const userRef = ref(db, `users/${sanitizedEmail}`);
  const snapshot = await get(userRef);
  
  if (snapshot.exists()) {
      const user = snapshot.val() as User;
      if (user.password === password) {
          localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
          userCache.set(user.email, user);
          return user;
      }
  }
  return null;
};

export const updateUser = async (updatedUser: User): Promise<void> => {
  const sanitizedEmail = sanitize(updatedUser.email);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
  userCache.set(updatedUser.email, updatedUser); // Update cache
  await update(ref(db, `users/${sanitizedEmail}`), updatedUser);
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
    if (!email) return null;
    
    // 1. Check Cache (Instant)
    if (userCache.has(email)) {
        return userCache.get(email)!;
    }

    // 2. Fetch from DB
    const sanitizedEmail = sanitize(email);
    try {
        const snapshot = await get(child(ref(db), `users/${sanitizedEmail}`));
        if (snapshot.exists()) {
            const user = snapshot.val() as User;
            userCache.set(email, user); // Save to cache
            return user;
        }
    } catch (e) {
        console.error("User fetch error:", e);
    }
    return null;
};

// Optimized to find contacts for chat
export const getChatContacts = async (currentUser: User): Promise<{email: string, name: string}[]> => {
    const contactEmails = new Set<string>();
    
    // 1. Add my guardians
    if (currentUser.guardians) {
        currentUser.guardians.forEach(e => contactEmails.add(e));
    }

    // 2. Add people who added me (Scan all users - acceptable for this scale)
    try {
        const snapshot = await get(ref(db, 'users'));
        if (snapshot.exists()) {
            const allUsers = Object.values(snapshot.val()) as User[];
            allUsers.forEach(u => {
                userCache.set(u.email, u); // Cache everyone we find
                if (u.guardians && u.guardians.includes(currentUser.email)) {
                    contactEmails.add(u.email);
                }
            });
        }
    } catch (e) { console.error(e); }

    // 3. Resolve names from Cache
    const results = [];
    for (const email of Array.from(contactEmails)) {
        const u = await findUserByEmail(email);
        results.push({
            email: email,
            name: u ? u.name : email.split('@')[0]
        });
    }
    return results;
};

// --- Chat Logic (Fast & Real-time) ---

const getChatId = (email1: string, email2: string) => {
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

  // Return promise but don't force UI to wait for it if they don't want to
  return set(newMessageRef, newMessage);
};

export const subscribeToMessages = (user1Email: string, user2Email: string, callback: (msgs: Message[]) => void) => {
  const chatId = getChatId(user1Email, user2Email);
  const messagesRef = ref(db, `messages/${chatId}`);
  
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

  return () => off(messagesRef);
};

export const deleteConversation = async (user1Email: string, user2Email: string) => {
  const chatId = getChatId(user1Email, user2Email);
  await remove(ref(db, `messages/${chatId}`));
};

// --- Alert Logic ---

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
    await push(ref(db, `alerts/${recipientKey}`), alert);
};

export const subscribeToAlerts = (userEmail: string, callback: (alerts: Alert[]) => void) => {
    const userKey = sanitize(userEmail);
    const alertsRef = ref(db, `alerts/${userKey}`);
    
    return onValue(alertsRef, (snapshot) => {
        if (snapshot.exists()) {
            callback(Object.values(snapshot.val()) as Alert[]);
        } else {
            callback([]);
        }
    });
};