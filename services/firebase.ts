import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Using environment variables for configuration
// Fallbacks provided to prevent app crash if keys are missing (common in dev/preview)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  databaseURL: process.env.FIREBASE_DB_URL || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || ''
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);