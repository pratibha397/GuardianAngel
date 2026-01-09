export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // In a real app, this would be hashed
  dangerPhrase: string;
  guardians: string[]; // List of guardian emails
  isTracking?: boolean;
}

export interface Message {
  id: string;
  senderEmail: string;
  receiverEmail: string;
  text: string;
  timestamp: number;
  isLocation?: boolean;
  lat?: number;
  lng?: number;
}

export interface Alert {
  id: string;
  senderEmail: string;
  receiverEmail: string;
  reason: string;
  timestamp: number;
  lat?: number;
  lng?: number;
  acknowledged?: boolean;
}

export interface PlaceResult {
  title: string;
  uri: string;
  address?: string;
  rating?: number;
  distance?: string;
}

export enum AppRoute {
  AUTH = 'auth',
  DASHBOARD = 'dashboard',
  GUARDIANS = 'guardians',
  CHAT = 'chat',
  SETTINGS = 'settings'
}