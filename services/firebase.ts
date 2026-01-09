import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Safe access to process.env in browser environment
const getEnv = () => {
  if (typeof window !== 'undefined' && (window as any).process) {
    return (window as any).process.env || {};
  }
  return {};
};

const env = getEnv();

// Helper to ensure URL is valid to prevent SDK crash
const getValidUrl = (url: string | undefined, fallback: string) => {
  if (!url) return fallback;
  try {
    new URL(url);
    return url;
  } catch (e) {
    console.warn(`Invalid Firebase URL found: ${url}. Using fallback.`);
    return fallback;
  }
};

const firebaseConfig = {
  apiKey: env.FIREBASE_API_KEY || 'demo-key',
  authDomain: env.FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
  // CRITICAL FIX: The SDK throws a fatal error if this is not a valid URL.
  // We provide a syntactically valid placeholder if the env var is missing or invalid.
  databaseURL: getValidUrl(env.FIREBASE_DB_URL, 'https://guardian-sentinel-demo.firebaseio.com'),
  projectId: env.FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: env.FIREBASE_STORAGE_BUCKET || 'demo-project.appspot.com',
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: env.FIREBASE_APP_ID || '1:123456789:web:abcdef'
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);