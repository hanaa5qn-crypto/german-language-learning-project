// =============================================================================
// English track — learner stats (streak + study time), INDEPENDENT from German.
// -----------------------------------------------------------------------------
// The English IELTS/SAT track and the German track sign into the SAME Firebase
// account and share one `users/{uid}` profile document, but their streaks and
// weekly leaderboards are COMPLETELY SEPARATE:
//   • German owns the top-level fields: `studyDays`, `studySecondsByDate`, and
//     the scalar `streak` (managed in App.tsx).
//   • English owns its OWN fields: `studyDaysEn` + `studySecondsByDateEn`.
// This provider reuses the German recording + streak logic (App.tsx's tracker
// and learning.ts's calculateStreakWithGrace) but applies it ONLY to the
// English fields, so studying English advances only the English streak/board
// and never touches the German ones (and vice versa).
// =============================================================================
import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { subscribeToAuthedProfile, saveProfileProgress, logOutUser } from '../../frontend/src/auth';
import { calculateStreakWithGrace, localDateKey } from '../../frontend/src/learning';
import type { UserProfile } from '../../frontend/src/profiles';
import AccountScreen from '../../frontend/src/AccountScreen';
import {
  addEnglishMistake, clearEnglishMistake, type EnglishPlacementResult,
} from './englishLearning';

// Mirrors the German app's tracker tuning (App.tsx).
const ACTIVE_IDLE_LIMIT_MS = 2 * 60 * 1000; // stop counting after 2 min idle
const STUDY_SAVE_THRESHOLD_SECONDS = 120;   // flush to Firestore every ~2 min
const TICK_MS = 30_000;

export interface EnglishStats {
  /** The shared account profile, or null for guests / signed-out. */
  profile: UserProfile | null;
  /** English consecutive study-day streak (1-day grace), derived from studyDaysEn. */
  streak: number;
  /** True until the first auth callback resolves. */
  loading: boolean;
  /** Whether stats can be tracked (a real, non-guest account is signed in). */
  enabled: boolean;
  /** Mark today as studied after an English activity (adds today to studyDaysEn). */
  recordStudy: () => void;
  /**
   * Record a completed English library activity for the dashboard's Today's
   * Session / progress / mistake log. A wrong answer is added to the mistake
   * log; a right answer clears it. Also marks today as studied.
   */
  recordEnglishActivity: (activityId: string, correct: boolean) => void;
  /** Set the English CEFR target level (clears the pending-placement flag). */
  setEnglishLevel: (level: string) => void;
  /** Persist an English placement-test result (level + per-skill scores). */
  saveEnglishPlacement: (result: EnglishPlacementResult) => void;
  /** Dismiss the first-run placement without taking it (won't auto-open again). */
  skipEnglishPlacement: () => void;
  /** Push a profile edit (from the settings screen) into the provider's state. */
  applyProfile: (next: UserProfile) => void;
  /** Open the shared account/settings overlay (from the dashboard). */
  openSettings: () => void;
  /** Log out (or exit guest mode) — returns to the top-level hero/login. */
  logout: () => void;
}

const StatsContext = createContext<EnglishStats>({
  profile: null,
  streak: 0,
  loading: true,
  enabled: false,
  recordStudy: () => {},
  recordEnglishActivity: () => {},
  setEnglishLevel: () => {},
  saveEnglishPlacement: () => {},
  skipEnglishPlacement: () => {},
  applyProfile: () => {},
  openSettings: () => {},
  logout: () => {},
});

// Shared with AuthGate — the localStorage flag that marks a guest session.
const GUEST_KEY = 'vivid-lingua-guest';

export function useEnglishStats(): EnglishStats {
  return useContext(StatsContext);
}

export function EnglishStatsProvider({
  children,
  onSwitchLanguage,
}: {
  children: React.ReactNode;
  onSwitchLanguage?: () => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const profileRef = useRef<UserProfile | null>(null);
  // Mirror settingsOpen into a ref so the study-time interval can pause while the
  // settings overlay is up (time on the settings screen is not study time —
  // matches the German tracker excluding non-study tabs).
  const settingsOpenRef = useRef(false);
  useEffect(() => { settingsOpenRef.current = settingsOpen; }, [settingsOpen]);
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

  // Add today to the ENGLISH study days (studyDaysEn). Called when a learner
  // completes a discrete English activity (quiz, test, review). Writes ONLY the
  // English-track fields — never the German studyDays/streak — so the two tracks
  // keep fully independent streaks.
  const recordStudy = useCallback(() => {
    const p = profileRef.current;
    if (!canTrack(p)) return;
    const today = localDateKey();
    if ((p.studyDaysEn ?? []).includes(today)) return; // already counted today
    const studyDaysEn = Array.from(new Set([...(p.studyDaysEn ?? []), today])).sort();
    const next: UserProfile = {
      ...p,
      studyDaysEn,
      lastActiveAt: new Date().toISOString(),
    };
    profileRef.current = next;
    setProfile(next);
    saveProfileProgress(next).catch((err) => {
      console.warn('Could not save English study day to Firestore:', err);
    });
  }, []);

  // Merge a patch into the live profile and persist it. Used by the English
  // learning actions below (activity completion, level choice, placement).
  const patchProfile = useCallback((patch: Partial<UserProfile>) => {
    const p = profileRef.current;
    if (!canTrack(p)) return;
    const next: UserProfile = { ...p, ...patch, lastActiveAt: new Date().toISOString() };
    profileRef.current = next;
    setProfile(next);
    saveProfileProgress(next).catch((err) => {
      console.warn('Could not save English learning state to Firestore:', err);
    });
  }, []);

  // Record a completed English library activity: add it to the completion log
  // (drives progress + Today's Session), and update the mistake log — a wrong
  // answer is queued for review, a right answer clears any prior mistake. Also
  // marks today as studied so the streak advances.
  const recordEnglishActivity = useCallback((activityId: string, correct: boolean) => {
    const p = profileRef.current;
    if (!canTrack(p)) return;
    const completedActivityIdsEn = Array.from(
      new Set([...(p.completedActivityIdsEn ?? []), activityId]),
    );
    const mistakeIdsEn = correct
      ? clearEnglishMistake(p.mistakeIdsEn ?? [], activityId)
      : addEnglishMistake(p.mistakeIdsEn ?? [], activityId);
    const today = localDateKey();
    const studyDaysEn = (p.studyDaysEn ?? []).includes(today)
      ? p.studyDaysEn
      : Array.from(new Set([...(p.studyDaysEn ?? []), today])).sort();
    patchProfile({ completedActivityIdsEn, mistakeIdsEn, studyDaysEn });
  }, [patchProfile]);

  const setEnglishLevel = useCallback((level: string) => {
    patchProfile({ targetLevelEn: level, placementPendingEn: false });
  }, [patchProfile]);

  const saveEnglishPlacement = useCallback((result: EnglishPlacementResult) => {
    patchProfile({
      targetLevelEn: result.level,
      placementPendingEn: false,
      placementEn: {
        takenAt: result.takenAt,
        level: result.level,
        totalCorrect: result.totalCorrect,
        totalQuestions: result.totalQuestions,
        skillScores: result.skillScores,
      },
    });
  }, [patchProfile]);

  const skipEnglishPlacement = useCallback(() => {
    patchProfile({ placementPendingEn: false });
  }, [patchProfile]);

  // Accumulate real time-on-task into the ENGLISH seconds map
  // (studySecondsByDateEn), which drives the English weekly leaderboard. Time
  // alone does NOT advance the streak — only completing an activity
  // (recordStudy) adds a study day. Flushes to Firestore on a threshold to
  // limit writes. Never touches the German studySecondsByDate.
  const recordStudySeconds = useCallback((seconds: number) => {
    const p = profileRef.current;
    if (!canTrack(p) || seconds <= 0) return;
    const today = localDateKey();
    const studySecondsByDateEn = {
      ...(p.studySecondsByDateEn ?? {}),
      [today]: Math.round((p.studySecondsByDateEn?.[today] ?? 0) + seconds),
    };
    const next: UserProfile = {
      ...p,
      studySecondsByDateEn,
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
      if (!visible || !recentlyActive || settingsOpenRef.current || !canTrack(profileRef.current)) return;
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

  // English streak derives from the English-only study days, independent of the
  // German streak (profile.studyDays / profile.streak).
  const streak = calculateStreakWithGrace(profile?.studyDaysEn ?? []).streak;

  // Sync the provider after a settings save (saveProfileProgress doesn't re-fire
  // the auth listener, so the provider's copy would otherwise go stale).
  const applyProfile = useCallback((next: UserProfile) => {
    profileRef.current = next;
    setProfile(next);
  }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);

  // Mirrors the German logout: a guest (no Firebase session) clears its flag and
  // reloads so the top-level AuthGate returns to the hero/login; a signed-in user
  // signs out and the auth listener tears the session down.
  const logout = useCallback(() => {
    const p = profileRef.current;
    if (!p || p.isGuest) {
      try { localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
      window.location.reload();
      return;
    }
    logOutUser().catch((err) => console.warn('Sign out failed:', err));
  }, []);

  const value: EnglishStats = {
    profile,
    streak,
    loading,
    enabled: canTrack(profile),
    recordStudy,
    recordEnglishActivity,
    setEnglishLevel,
    saveEnglishPlacement,
    skipEnglishPlacement,
    applyProfile,
    openSettings,
    logout,
  };

  return (
    <StatsContext.Provider value={value}>
      {children}
      {/* Settings is a true overlay ON TOP of the track, so opening it mid-lesson
          keeps the underlying tab + in-progress lesson state intact. */}
      {settingsOpen && profile && (
        <div className="fixed inset-0 z-[200] bg-ink overflow-y-auto">
          <AccountScreen
            mode="settings"
            profile={profile}
            onSaved={applyProfile}
            onLogout={logout}
            onSwitchLanguage={onSwitchLanguage}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      )}
    </StatsContext.Provider>
  );
}
