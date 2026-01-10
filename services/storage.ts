import { User, Alert, Message } from '../types';
import { db } from './firebase';
import { ref, set, get, push, onValue, update, remove } from 'firebase/database';

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

// --- Chat Logic ---

const getConversationId = (email1: string, email2: string) => {
    return [sanitize(email1), sanitize(email2)].sort().join('_');
};

export const getChatContacts = async (currentUser: User): Promise<{email: string, name: string}[]> => {
    const contactsMap = new Map<string, {email: string, name: string}>();
    
    // 1. Add my guardians
    for (const gEmail of currentUser.guardians || []) {
        const user = await findUserByEmail(gEmail);
        if (user) contactsMap.set(gEmail, { email: user.email, name: user.name });
        else contactsMap.set(gEmail, { email: gEmail, name: 'Unknown' });
    }

    // 2. Add people who possess me as a guardian (reverse lookup)
    try {
        const snapshot = await get(ref(db, 'users'));
        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                const user = child.val() as User;
                // Check if I am in their guardians list
                if (user.guardians && Array.isArray(user.guardians) && user.guardians.includes(currentUser.email)) {
                     contactsMap.set(user.email, { email: user.email, name: user.name });
                }
            });
        }
    } catch (e) {
        console.error("Error fetching chat contacts", e);
    }

    return Array.from(contactsMap.values());
};

export const sendMessage = async (message: Omit<Message, 'id' | 'timestamp'>) => {
    const conversationId = getConversationId(message.senderEmail, message.receiverEmail);
    const chatRef = ref(db, `chats/${conversationId}`);
    const msgRef = push(chatRef);
    
    const newMessage: Message = {
        ...message,
        id: msgRef.key as string,
        timestamp: Date.now()
    };
    
    await set(msgRef, newMessage);
};

export const subscribeToMessages = (userEmail: string, otherEmail: string, callback: (msgs: Message[]) => void) => {
    const conversationId = getConversationId(userEmail, otherEmail);
    const chatRef = ref(db, `chats/${conversationId}`);
    
    return onValue(chatRef, (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            const msgs = Object.values(val) as Message[];
            // Sort by timestamp
            msgs.sort((a, b) => a.timestamp - b.timestamp);
            callback(msgs);
        } else {
            callback([]);
        }
    });
};

export const deleteConversation = async (userEmail: string, otherEmail: string) => {
    const conversationId = getConversationId(userEmail, otherEmail);
    await remove(ref(db, `chats/${conversationId}`));
};