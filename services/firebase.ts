import { initializeApp } from 'firebase/app';
import { Database, getDatabase } from 'firebase/database';

// Helper to safely access env vars in various environments (Vite, Webpack, etc.)
// Bundlers often require explicit access to process.env.VAR_NAME for replacement to work.
const getEnv = (key: string): string => {
  let val = '';
  
  // 1. Try Vite's import.meta.env (if available)
  try {
    // @ts-ignore
    if (import.meta && import.meta.env) {
      // @ts-ignore
      val = import.meta.env[`VITE_${key}`] || import.meta.env[key];
    }
  } catch (e) {}
  if (val) return val;

  // 2. Try process.env (Standard) - We must handle potential ReferenceError
  try {
    if (typeof process !== 'undefined' && process.env) {
      // We check multiple common prefixes
      val = process.env[key] || 
            process.env[`VITE_${key}`] || 
            process.env[`REACT_APP_${key}`] || 
            '';
    }
  } catch (e) {}
  if (val) return val;

  // 3. Fallback to window polyfill (from index.html)
  try {
    if ((window as any).process?.env) {
      val = (window as any).process.env[key] || '';
    }
  } catch (e) {}

  return val;
};

// Explicitly construct config to allow bundlers to see usage
const rawConfig = {
  apiKey: getEnv("FIREBASE_API_KEY"),
  authDomain: getEnv("FIREBASE_AUTH_DOMAIN"),
  databaseURL: getEnv("FIREBASE_DB_URL"),
  projectId: getEnv("FIREBASE_PROJECT_ID"),
  storageBucket: getEnv("FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnv("FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnv("FIREBASE_APP_ID")
};

// Filter out empty keys to prevent Firebase errors
const firebaseConfig = Object.fromEntries(
  Object.entries(rawConfig).filter(([_, v]) => !!v)
);

let dbInstance: Database | null = null;

// Only initialize if we have a valid database URL (prevents the Fatal Error)
if (firebaseConfig.databaseURL && firebaseConfig.databaseURL.startsWith('http')) {
  try {
    const app = initializeApp(firebaseConfig);
    dbInstance = getDatabase(app);
    console.log("Firebase connected successfully");
  } catch (e) {
    console.error("Firebase Initialization Failed:", e);
  }
} else {
  console.warn("Firebase Database URL missing or invalid. App running in LocalStorage-only mode.");
}

// Export db as nullable. Consumers must check existence.
export const db = dbInstance;