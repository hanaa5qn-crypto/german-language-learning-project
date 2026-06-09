// ─────────────────────────────────────────────────────────────────────────────
// PASTE YOUR FIREBASE WEB CONFIG HERE
// ─────────────────────────────────────────────────────────────────────────────
// Where to get it (one time, ~2 minutes):
//   1. Go to https://console.firebase.google.com and create a project (free).
//   2. In the project, click the gear icon → "Project settings".
//   3. Scroll to "Your apps" → click the web icon ( </> ) to register a web app.
//   4. Copy the values from the "firebaseConfig" object it shows you.
//   5. Replace each PASTE_... placeholder below with your real value.
//
// These values are NOT secret — Firebase ships them to the browser on purpose.
// What actually protects your data is the Firestore security rules
// (see firestore.rules in the project root).
// ─────────────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyDsDyqbk7X2RZrj3XZ1pUZirhrNncrCJDo",
  authDomain: "gipfel-german-language-learn.firebaseapp.com",
  projectId: "gipfel-german-language-learn",
  storageBucket: "gipfel-german-language-learn.firebasestorage.app",
  messagingSenderId: "531983273119",
  appId: "1:531983273119:web:bdcec947d392229f35e6aa",
};

// Automatically becomes `true` once you replace the placeholders above.
// Until then, the app stays usable but shows a "set up Firebase" notice on the
// login screen instead of crashing.
export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith('PASTE_');
