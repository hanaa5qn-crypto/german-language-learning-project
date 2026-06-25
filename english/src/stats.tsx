// =============================================================================
// English track — shared learner stats (streak + study time).
// -----------------------------------------------------------------------------
// The English IELTS/SAT track and the German track sign into the SAME Firebase
// account and read the SAME `users/{uid}` profile. The German app (App.tsx)
// records `studyDays` + `studySecondsByDate` and derives the streak from them;
// the leaderboard endpoint reads the same `studySecondsByDate`.
//
// Previously the English track recorded nothing, so studying IELTS/SAT never
// advanced the streak or the weekly leaderboard — the streak effectively
// reflected only the *other* section. This provider gives the English track the
// exact same recording + streak logic the German track uses, against the same
// shared profile, so the streak and leaderboard are correct in either section.
// =============================================================================
import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { subscribeToAuthedProfile, saveProfileProgress } from '../../frontend/src/auth';
import { calculateStreakWithGrace, localDateKey } from '../../frontend/src/learning';
import type { UserProfile } from '../../frontend/src/profiles';

// Mirrors the German app's tracker tuning (App.tsx).
const ACTIVE_IDLE_LIMIT_MS = 2 * 60 * 1000; // stop counting after 2 min idle
const STUDY_SAVE_THRESHOLD_SECONDS = 120;   // flush to Firestore every ~2 min
const TICK_MS = 30_000;

export interface EnglishStats {
  /** The shared account profile, or null for guests / signed-out. */
  profile: UserProfile | null;
  /** Consecutive study-day streak (with 1-day grace), derived from studyDays. */
  streak: number;
  /** True until the first auth callback resolves. */
  loading: boolean;
  /** Whether stats can be tracked (a real, non-guest account is signed in). */
  enabled: boolean;
  /** Mark today as studied after an English activity (adds today to studyDays). */
  recordStudy: () => void;
}

const StatsContext = createContext<EnglishStats>({
  profile: null,
  streak: 0,
  loading: true,
  enabled: false,
  recordStudy: () => {},
});

export function useEnglishStats(): EnglishStats {
  return useContext(StatsContext);
}

export function EnglishStatsProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const profileRef = useRef<UserProfile | null>(null);
  const lastInteractionRef = useRef<number>(Date.now());
  const pendingSaveSecondsRef = useRef<number>(0);

  // Keep a ref in sync so the interval/event handlers always see the latest
  // profile without re-subscribing.
  useEffect(() => { profileRef.current = profile; }, [profile]);

  // Single source of truth for "who is signed in" — shared with the German app.
  useEffect(() => {
    const unsub = subscribeToAuthedProfile((p) => {
      profileRef.current = p;
      setProfile(p);
      setLoading(false);
    });
    return unsub;
  }, []);

  const canTrack = (p: UserProfile | null): p is UserProfile => !!p && !p.isGuest;

  // Add today to studyDays + recompute streak. Called when a learner completes a
  // discrete activity (quiz, test, review). Identical shape to the German
  // recordStudyActivity, minus the German-only completedActivityIds.
  const recordStudy = useCallback(() => {
    const p = profileRef.current;
    if (!canTrack(p)) return;
    const today = localDateKey();
    if ((p.studyDays ?? []).includes(today)) return; // already counted today
    const studyDays = Array.from(new Set([...(p.studyDays ?? []), today])).sort();
    const next: UserProfile = {
      ...p,
      studyDays,
      streak: calculateStreakWithGrace(studyDays).streak,
      lastActiveAt: new Date().toISOString(),
    };
    profileRef.current = next;
    setProfile(next);
    saveProfileProgress(next).catch((err) => {
      console.warn('Could not save English study day to Firestore:', err);
    });
  }, []);

  // Accumulate real time-on-task into studySecondsByDate (drives the weekly
  // leaderboard). Mirrors the German recordStudySeconds exactly: time alone does
  // NOT advance the streak — only completing an activity (recordStudy) adds a
  // study day. Flushes to Firestore on a threshold to limit writes.
  const recordStudySeconds = useCallback((seconds: number) => {
    const p = profileRef.current;
    if (!canTrack(p) || seconds <= 0) return;
    const today = localDateKey();
    const studySecondsByDate = {
      ...(p.studySecondsByDate ?? {}),
      [today]: Math.round((p.studySecondsByDate?.[today] ?? 0) + seconds),
    };
    const next: UserProfile = {
      ...p,
      studySecondsByDate,
      lastActiveAt: new Date().toISOString(),
    };
    profileRef.current = next;
    setProfile(next);

    pendingSaveSecondsRef.current += seconds;
    if (pendingSaveSecondsRef.current >= STUDY_SAVE_THRESHOLD_SECONDS) {
      pendingSaveSecondsRef.current = 0;
      saveProfileProgress(next).catch((err) => {
        console.warn('Could not save English study time to Firestore:', err);
      });
    }
  }, []);

  // Active study-time tracker — counts only while the tab is visible and the
  // learner interacted recently, so an idle open tab stops adding minutes.
  // Mirrors the German App.tsx tracker (whole English app is a "study tab").
  useEffect(() => {
    const markInteraction = () => { lastInteractionRef.current = Date.now(); };
    const savePending = () => {
      const p = profileRef.current;
      if (!canTrack(p) || pendingSaveSecondsRef.current <= 0) return;
      pendingSaveSecondsRef.current = 0;
      saveProfileProgress(p).catch((err) => {
        console.warn('Could not save English study time to Firestore:', err);
      });
    };

    const events = ['click', 'keydown', 'pointerdown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, markInteraction, { passive: true }));

    let lastTick = Date.now();
    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.min(30, Math.max(0, (now - lastTick) / 1000));
      lastTick = now;
      const visible = document.visibilityState === 'visible';
      const recentlyActive = now - lastInteractionRef.current <= ACTIVE_IDLE_LIMIT_MS;
      if (!visible || !recentlyActive || !canTrack(profileRef.current)) return;
      recordStudySeconds(elapsed);
    }, TICK_MS);

    const onVisibility = () => {
      markInteraction();
      if (document.visibilityState === 'hidden') savePending();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', savePending);

    return () => {
      window.clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, markInteraction));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', savePending);
      savePending();
    };
  }, [recordStudySeconds]);

  const streak = calculateStreakWithGrace(profile?.studyDays ?? []).streak;

  const value: EnglishStats = {
    profile,
    streak,
    loading,
    enabled: canTrack(profile),
    recordStudy,
  };

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}
