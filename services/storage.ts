import { get, off, onValue, push, ref, remove, set, update } from 'firebase/database';
import { Alert, Message, User } from '../types';
import { db } from './firebase';

const CURRENT_USER_KEY = 'guardian_current_user';

// Helper to sanitize email for Firebase paths
const sanitize = (email: string) => email.toLowerCase().replace(/\./g, '_');

const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

// --- Session ---
export const getCurrentUser = (): User | null => {
  try {
    const stored = localStorage.getItem(CURRENT_USER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (e) { return null; }
};

export const logoutUser = () => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

// --- User Management (Network First) ---

export const registerUser = async (user: Omit<User, 'id' | 'guardians' | 'dangerPhrase'>): Promise<User | null> => {
  const sanitizedEmail = sanitize(user.email);
  const userRef = ref(db, `users/${sanitizedEmail}`);
  
  // 1. Network Check
  const snapshot = await get(userRef);
  if (snapshot.exists()) return null; // Already registered

  const newUser: User = {
    ...user,
    email: user.email.toLowerCase(),
    id: generateId(),
    guardians: [],
    dangerPhrase: 'help me now'
  };

  // 2. Network Write
  await set(userRef, newUser);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));
  return newUser;
};

export const loginUser = async (email: string, password: string): Promise<User | null> => {
  const sanitizedEmail = sanitize(email);
  const userRef = ref(db, `users/${sanitizedEmail}`);
  
  try {
      const snapshot = await get(userRef);
      if (snapshot.exists()) {
          const user = snapshot.val() as User;
          if (user.password === password) {
              localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
              return user;
          }
      }
  } catch (e) {
      console.error("Login Network Error", e);
  }
  return null;
};

export const updateUser = async (updatedUser: User): Promise<void> => {
  const sanitizedEmail = sanitize(updatedUser.email);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser)); // Optimistic local update
  await update(ref(db, `users/${sanitizedEmail}`), updatedUser);
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
    const sanitizedEmail = sanitize(email);
    try {
        const snapshot = await get(ref(db, `users/${sanitizedEmail}`));
        return snapshot.exists() ? snapshot.val() : null;
    } catch (e) {
        return null;
    }
};

// --- Chat Logic (Guaranteed 2-Way) ---

const getChatId = (email1: string, email2: string) => {
  // Deterministic ID: alphabetically sorted emails joined by underscore
  return [sanitize(email1), sanitize(email2)].sort().join('_');
};

export const sendMessage = async (msg: Omit<Message, 'id' | 'timestamp'>): Promise<void> => {
  const chatId = getChatId(msg.senderEmail, msg.receiverEmail);
  const messagesRef = ref(db, `messages/${chatId}`);
  const newMessageRef = push(messagesRef);
  
  const payload: Message = { 
      ...msg, 
      id: newMessageRef.key!, 
      timestamp: Date.now() 
  };

  // Write to network. Firebase SDK handles offline queuing automatically.
  await set(newMessageRef, payload);
};

export const subscribeToMessages = (user1Email: string, user2Email: string, callback: (msgs: Message[]) => void) => {
  const chatId = getChatId(user1Email, user2Email);
  const messagesRef = ref(db, `messages/${chatId}`);
  
  // Real-time listener
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

/**
 * Robust Contact Discovery:
 * Finds everyone I have added as a guardian AND everyone who has added me.
 */
export const getChatContacts = async (currentUser: User): Promise<{email: string, name: string}[]> => {
    const contactsMap = new Map<string, string>(); // Email -> Name

    // 1. Add my guardians (Local knowledge)
    for (const gEmail of currentUser.guardians || []) {
        contactsMap.set(gEmail, gEmail.split('@')[0]); // Default name fallback
    }

    // 2. Network scan for people who added me
    // We fetch all users to check their guardians list. 
    // In a production app, we would use a reverse-index in DB, but for this scale, this is fine.
    try {
        const snapshot = await get(ref(db, 'users'));
        if (snapshot.exists()) {
            const allUsers = Object.values(snapshot.val()) as User[];
            
            // Populate names for my guardians if found
            allUsers.forEach(u => {
                if (contactsMap.has(u.email)) {
                    contactsMap.set(u.email, u.name);
                }
            });

            // Find users who have ME as a guardian
            allUsers.forEach(u => {
                if (u.guardians && u.guardians.includes(currentUser.email)) {
                    contactsMap.set(u.email, u.name);
                }
            });
        }
    } catch (e) {
        console.error("Error fetching contacts", e);
    }

    // Convert map to array
    return Array.from(contactsMap.entries()).map(([email, name]) => ({ email, name }));
};

// --- Alert Logic (Real-time) ---

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
    
    // Write to recipient's alert queue
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