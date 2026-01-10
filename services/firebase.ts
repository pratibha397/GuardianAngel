import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// --- FIREBASE CONFIGURATION ---
// To enable cloud syncing, you MUST replace these values with your Firebase Project keys.
// 1. Go to https://console.firebase.google.com/
// 2. Create a project
// 3. Add a Web App
// 4. Copy the "firebaseConfig" object
// 5. Ensure "Realtime Database" is enabled in the console and Rules are set to public (read: true, write: true) for testing.

const firebaseConfig = {
  // If you are using a bundler (like Vite/Webpack) with .env files, keep the process.env part.
  // Otherwise, directly paste your strings over the "PASTE_..." text.
  apiKey: process.env.FIREBASE_API_KEY || "PASTE_YOUR_API_KEY_HERE",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "PASTE_YOUR_AUTH_DOMAIN_HERE",
  // IMPORTANT: This URL must be correct for Realtime Database to work
  databaseURL: process.env.FIREBASE_DB_URL || "PASTE_YOUR_DATABASE_URL_HERE", 
  projectId: process.env.FIREBASE_PROJECT_ID || "PASTE_YOUR_PROJECT_ID_HERE",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "PASTE_YOUR_STORAGE_BUCKET_HERE",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "PASTE_YOUR_SENDER_ID_HERE",
  appId: process.env.FIREBASE_APP_ID || "PASTE_YOUR_APP_ID_HERE"
};

// Validation to help debug connection issues
if (firebaseConfig.apiKey.includes("PASTE_") || !firebaseConfig.databaseURL.startsWith("http")) {
  console.warn(
    "%c FIREBASE NOT CONFIGURED ", 
    "background: red; color: white; font-weight: bold; padding: 4px; font-size: 14px;",
    "\n\nData is NOT saving to the cloud. Please open 'services/firebase.ts' and paste your Firebase credentials.\n"
  );
}

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);