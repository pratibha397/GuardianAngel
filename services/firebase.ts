import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// --- FIREBASE CONFIGURATION ---
// Configuration is loaded from environment variables (.env.local)
// Do not commit secrets to GitHub.

const getEnv = (key: string): string => {
  try {
    // 1. Check process.env (Standard Node/Webpack/CRA)
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key]!;
    }
    // 2. Check window.process.env (Our index.html polyfill)
    if ((window as any).process?.env?.[key]) {
        return (window as any).process.env[key];
    }
    // 3. Fallback for Vite (import.meta.env) - accessed safely to avoid TS errors in non-Vite envs
    // Note: If using Vite, variables usually must start with VITE_
    // const meta = (import.meta as any).env;
    // if (meta && meta[key]) return meta[key];
  } catch (e) {
    return "";
  }
  return "";
};

const firebaseConfig = {
  apiKey: getEnv("FIREBASE_API_KEY"),
  authDomain: getEnv("FIREBASE_AUTH_DOMAIN"),
  databaseURL: getEnv("FIREBASE_DB_URL"),
  projectId: getEnv("FIREBASE_PROJECT_ID"),
  storageBucket: getEnv("FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnv("FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnv("FIREBASE_APP_ID")
};

// Robust validation
const isConfigMissing = !firebaseConfig.apiKey || !firebaseConfig.databaseURL;

if (isConfigMissing) {
  console.warn(
    "%c FIREBASE CONFIG MISSING ", 
    "background: red; color: white; font-weight: bold; padding: 4px; font-size: 14px;",
    "\n\nCould not find Firebase environment variables.\nPlease create a '.env.local' file in your root directory with keys: FIREBASE_API_KEY, FIREBASE_DB_URL, etc.\n"
  );
}

// Initialize app (or allow crash if critical config missing to alert developer)
// We wrap in try/catch to prevent white-screen of death if config is totally malformed
let app;
try {
    app = initializeApp(firebaseConfig);
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}

export const db = app ? getDatabase(app) : {} as any;