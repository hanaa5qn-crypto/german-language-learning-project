// Lazy Firebase initialization.
//
// Nothing here runs until getAuthInstance()/getDb() is first called. That keeps
// Firebase out of the way during unit tests (which import App but never log in)
// and means the app boots fine even before you've pasted your config.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig';

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

function ensureInitialized() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    dbInstance = getFirestore(app);
    storageInstance = getStorage(app);
  }
}

export function getAuthInstance(): Auth {
  ensureInitialized();
  return authInstance!;
}

export function getDb(): Firestore {
  ensureInitialized();
  return dbInstance!;
}

export function getStorageInstance(): FirebaseStorage {
  ensureInitialized();
  return storageInstance!;
}

export { isFirebaseConfigured };
