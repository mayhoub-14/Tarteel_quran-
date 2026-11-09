import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Firebase Authentication is used only for Google sign-in.
// All application data is accessed through authenticated server API routes;
// the browser must never access Firestore collections directly.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
