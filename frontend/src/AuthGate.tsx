import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { getAuthInstance, isFirebaseConfigured } from './firebase';
import LanguageGate from './LanguageGate';
import LoginScreen from './LoginScreen';
import HeroPage from './HeroPage';

// Login comes first — before the user picks a language. Once they're signed in
// (or chose to continue as a guest), we hand off to LanguageGate, which renders
// the German or English track. Both tracks read this same Firebase session, so
// they never show a second login screen.
//
// Guests have no Firebase session, so we remember the "continue without account"
// choice in localStorage. The German track reads this same key to auto-enter its
// built-in guest mode instead of bouncing back to its own landing page.
const GUEST_KEY = 'vivid-lingua-guest';
// LanguageGate persists the chosen track here so a plain reload resumes it. We
// clear it on a fresh, interactive login so signing in always lands the user on
// the "What do you want to learn?" chooser instead of silently reopening the
// last track (which made every login jump straight into German).
const TRACK_KEY = 'vivid-lingua-track';

function BrandLoader() {
  return (
    <div className="bg-ink text-paper font-sans min-h-screen flex flex-col justify-center items-center gap-4">
      <h1 className="text-3xl font-serif font-light tracking-tight">
        <span className="text-paper">Vivid</span> <span className="text-paper-2">Lingua</span>
      </h1>
      <Loader2 className="w-7 h-7 text-paper-2 animate-spin" />
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
  // Signed-out visitors see the hero first; the CTAs open the auth screen.
  const [view, setView] = useState<'hero' | 'login'>('hero');
  const [loginMode, setLoginMode] = useState<'login' | 'signup'>('login');
  // True once the visitor actively opens the auth screen (or picks guest). It
  // lets us tell a deliberate login from a silent session-restore on reload, so
  // we only reset the saved track for the former.
  const interactiveEntry = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured) { setReady(true); return; }
    const unsub = onAuthStateChanged(getAuthInstance(), (user) => {
      setSignedIn(!!user);
      if (user) {
        // A real session always wins over a lingering guest flag.
        try { localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
        setGuest(false);
        // Fresh, interactive sign-in → forget the last track so the chooser shows.
        if (interactiveEntry.current) {
          try { localStorage.removeItem(TRACK_KEY); } catch { /* ignore */ }
          interactiveEntry.current = false;
        }
      }
      setReady(true);
    });
    return unsub;
  }, []);

  function openLogin(mode: 'login' | 'signup') {
    interactiveEntry.current = true;
    setLoginMode(mode);
    setView('login');
  }

  function continueAsGuest() {
    // Entering as a guest is also a fresh start → land on the chooser.
    try {
      localStorage.setItem(GUEST_KEY, '1');
      localStorage.removeItem(TRACK_KEY);
    } catch { /* ignore */ }
    setGuest(true);
  }

  if (!ready) return <BrandLoader />;

  // Without Firebase configured we can't gate on auth — fall through so each
  // track can still boot and show its own "set up Firebase" notice.
  if (!isFirebaseConfigured) return <LanguageGate />;

  if (signedIn || guest) return <LanguageGate />;

  if (view === 'login') {
    return (
      <LoginScreen
        initialMode={loginMode}
        onBack={() => setView('hero')}
        onGuest={continueAsGuest}
      />
    );
  }

  return (
    <HeroPage
      onLogin={() => openLogin('login')}
      onSignup={() => openLogin('signup')}
      onGuest={continueAsGuest}
    />
  );
}
