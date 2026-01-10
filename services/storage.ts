import { child, get, off, onValue, push, ref, remove, set, update } from 'firebase/database';
import { Alert, Message, User } from '../types';
import { db } from './firebase';

const CURRENT_USER_KEY = 'guardian_current_user';

// --- In-Memory Cache for Speed ---
const userCache = new Map<string, User>();

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
  userCache.set(updatedUser.email, updatedUser);
  await update(ref(db, `users/${sanitizedEmail}`), updatedUser);
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
    if (!email) return null;
    if (userCache.has(email)) return userCache.get(email)!;

    const sanitizedEmail = sanitize(email);
    try {
        const snapshot = await get(child(ref(db), `users/${sanitizedEmail}`));
        if (snapshot.exists()) {
            const user = snapshot.val() as User;
            userCache.set(email, user);
            return user;
        }
    } catch (e) {
        console.error("User fetch error:", e);
    }
    return null;
};

// FAST Chat Contacts Loader
export const getChatContacts = async (currentUser: User): Promise<{email: string, name: string}[]> => {
    const contactEmails = new Set<string>();
    
    // 1. Always add my guardians (Immediate)
    if (currentUser.guardians) {
        currentUser.guardians.forEach(e => contactEmails.add(e));
    }

    // 2. Try to find people who added me, but TIMEOUT after 1 second to prevent hanging
    // This fixes the "Chat Loading Forever" bug if the DB is slow.
    try {
        const fetchAllPromise = get(ref(db, 'users'));
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject('timeout'), 1000));

        await Promise.race([fetchAllPromise, timeoutPromise])
            .then((snapshot: any) => {
                if (snapshot.exists()) {
                    const allUsers = Object.values(snapshot.val()) as User[];
                    allUsers.forEach(u => {
                        userCache.set(u.email, u);
                        if (u.guardians && u.guardians.includes(currentUser.email)) {
                            contactEmails.add(u.email);
                        }
                    });
                }
            })
            .catch(() => {
                // Ignore timeout, just proceed with guardians we have
                console.log("Skipping full user scan due to latency.");
            });
    } catch (e) { console.error(e); }

    // 3. Resolve names
    const results = [];
    for (const email of Array.from(contactEmails)) {
        // Try cache first
        let name = email.split('@')[0];
        const cached = userCache.get(email);
        if (cached) {
            name = cached.name;
        } else {
             // Try fetching individually if not in cache
             try {
                const u = await findUserByEmail(email);
                if (u) name = u.name;
             } catch {}
        }
        results.push({ email, name });
    }
    return results;
};

// --- Chat Logic ---
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
