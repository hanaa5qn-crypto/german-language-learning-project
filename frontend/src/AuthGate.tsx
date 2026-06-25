import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { getAuthInstance, isFirebaseConfigured } from './firebase';
import LanguageGate from './LanguageGate';
import LoginScreen from './LoginScreen';

// Login comes first — before the user picks a language. Once they're signed in
// (or chose to continue as a guest), we hand off to LanguageGate, which renders
// the German or English track. Both tracks read this same Firebase session, so
// they never show a second login screen.
//
// Guests have no Firebase session, so we remember the "continue without account"
// choice in localStorage. The German track reads this same key to auto-enter its
// built-in guest mode instead of bouncing back to its own landing page.
const GUEST_KEY = 'vivid-lingua-guest';

function BrandLoader() {
  return (
    <div className="bg-background text-white font-sans min-h-screen flex flex-col justify-center items-center gap-4">
      <h1 className="text-3xl font-black tracking-tight">
        <span className="text-primary">Vivid</span> Lingua
      </h1>
      <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
    </div>
  );
}

export default function AuthGate() {
  // `ready` flips true after the first auth callback so we don't flash the login
  // screen at a user whose saved session is still being restored.
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [guest, setGuest] = useState<boolean>(() => {
    try { return localStorage.getItem(GUEST_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!isFirebaseConfigured) { setReady(true); return; }
    const unsub = onAuthStateChanged(getAuthInstance(), (user) => {
      setSignedIn(!!user);
      if (user) {
        // A real session always wins over a lingering guest flag.
        try { localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
        setGuest(false);
      }
      setReady(true);
    });
    return unsub;
  }, []);

  function continueAsGuest() {
    try { localStorage.setItem(GUEST_KEY, '1'); } catch { /* ignore */ }
    setGuest(true);
  }

  if (!ready) return <BrandLoader />;

  // Without Firebase configured we can't gate on auth — fall through so each
  // track can still boot and show its own "set up Firebase" notice.
  if (!isFirebaseConfigured) return <LanguageGate />;

  if (signedIn || guest) return <LanguageGate />;

  return <LoginScreen onGuest={continueAsGuest} />;
}
