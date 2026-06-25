import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Volume2, Play, Pause, CheckCircle, X, XCircle, AlertCircle,
  BookOpen, Headphones, Mic, Edit3, Languages, Settings, LogOut,
  Check, RotateCcw, Lightbulb, Flame, Award, ArrowRight, ArrowLeft,
  ChevronRight, Sparkles, HelpCircle, GraduationCap, ExternalLink, Search, Library,
  Square, AudioLines, Gauge, SpellCheck, MessageSquareText, ThumbsUp, Target,
  Mail, Lock, Loader2, QrCode, CreditCard, Shield, Calendar, Clock, Zap,
  ListChecks, BarChart3, Crown, Swords, Save, Camera, Shuffle, Upload
} from 'lucide-react';
import {
  TabType, VocabularyWord, WordClass, CEFRLevel,
  SpeakingEvaluation, WritingFeedback, WritingCorrection,
  PaymentMethodsResponse, DummyCheckoutResponse, BylCheckoutResponse,
} from './types';
import { DICTIONARY } from './data';
import {
  READING_LIBRARY, LISTENING_LIBRARY, WRITING_LIBRARY, SPEAKING_LIBRARY,
  Level, ReadingItem, ListeningItem, WritingItem, SpeakingItem,
  QuizQuestion, getReadingQuestions, getListeningQuestions, shuffleQuiz,
} from './library';
import { resourcesFor, SkillTab } from './externalResources';
import { EXAMS, EXAM_LEVEL_ORDER, ExamLevel } from './exams';
import TestDafExam from './TestDafExam';
import AdminDashboard from './AdminDashboard';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import ContactPage from './pages/ContactPage';
import { UserProfile, DEFAULT_PROFILES, createGuestProfile, stripServerOwnedFields, avatarOptions, AVATAR_STYLES, DEFAULT_AVATAR_STYLE } from './profiles';
import { getMyPromo, redeemPromoCode, ensureSignupTrial, type MyPromo } from './promo';
import LoginScreen from './LoginScreen';
import LandingPage from './LandingPage';
import { track, trackVisitOncePerDay } from './analytics';
import {
  subscribeToAuthedProfile, logOutUser, saveProfileProgress, sendResetEmail,
} from './auth';
import { isFirebaseConfigured, getStorageInstance, getAuthInstance } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  SrsMap, reviewSrs, srsWordKey, orderTrainerWords, countDueWords, isDue,
  compareWordsByLevel, suggestedWordLevel,
  calculateStreakWithGrace, StreakResult,
  buildUnitsForLevel, unitProgress, isUnitPassed, isUnitUnlocked, lockedItemIds, Unit, UnitActivity, UNIT_PASS_RATIO,
  addMistake, clearMistake, resolveMistakes, MistakeRef,
  buildTodaySession, TodaySession,
  localDateKey as learningLocalDateKey,
} from './learning';
import { buildInflectedLookup } from './inflect';
import {
  PLANS, PLAN_ORDER, PlanId, effectivePlan, isFounder as isFounderProfile,
  canUseAi, canAccessAllContent, isExamQuestionLocked, isLessonLocked,
  FREE_QUESTIONS_PER_SECTION, applyPromoDiscount, type BillingInterval,
} from './plans';
import OnboardingWizard from './OnboardingWizard';
import PlacementTest from './PlacementTest';
import { isFounderEmail, placementProfilePatch } from './placement';
import GrammarTipCard from './GrammarTipCard';
import DuelScreen from './DuelScreen';
import SocialSection from './SocialSection';
import { fetchDuel, fetchMyDuels, redeemReferralCode, DuelView } from './social';
import type { InviteContext } from './LoginScreen';
import MCQBlock from './components/MCQBlock';
import ExternalResourcesPanel from './components/ExternalResourcesPanel';
import QuizNav from './components/QuizNav';
import { BillingCard } from './components/BillingCard';
import { ProfileTab } from './tabs/ProfileTab';
import { audioBlobToWavBase64, audioBlobToWavBlob } from './utils/audioUtils';
import { formatMnt } from './utils/paymentUtils';

// Union of all exam item types — they all share `topic`, `title`, `titleMn`.
type ExamItem = ReadingItem | ListeningItem | WritingItem | SpeakingItem;

const WEEKDAY_LABELS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
const STUDY_TABS: TabType[] = ['read', 'listen', 'speak', 'write', 'vocab', 'translate', 'exam'];
const ACTIVE_IDLE_LIMIT_MS = 2 * 60 * 1000;
const STUDY_SAVE_THRESHOLD_SECONDS = 120;
const TRACKABLE_ACTIVITY_TOTAL =
  4 + // core quick lesson + detailed reading/listening/writing lessons
  DICTIONARY.filter((w) => w.mongolian.trim().length > 0).length +
  READING_LIBRARY.length +
  LISTENING_LIBRARY.length +
  SPEAKING_LIBRARY.length +
  WRITING_LIBRARY.length +
  Object.values(EXAMS).reduce(
    (sum, exam) => sum + exam.reading.length + exam.listening.length + exam.speaking.length + exam.writing.length,
    0,
  );

// Trainer deck, easiest first (A1 → C2) so beginners meet beginner words.
const TRAINER_WORDS = DICTIONARY.filter((w) => w.mongolian.trim().length > 0).sort(compareWordsByLevel);

// How many cards a "Дахин давтах" (don't know) word waits before reappearing
// in the same session.
const VOCAB_REQUEUE_GAP = 5;

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromLocalKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildLearningCurve(studySecondsByDate: Record<string, number> = {}): UserProfile['learningCurve'] {
  const today = new Date();
  return Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(today, index - 6);
    const key = localDateKey(date);
    const seconds = Math.max(0, studySecondsByDate[key] ?? 0);
    return {
      day: WEEKDAY_LABELS[date.getDay()],
      hours: Number((seconds / 3600).toFixed(1)),
    };
  });
}

function calculateStreak(studyDays: string[] = [], today = new Date()): number {
  return calculateStreakWithGrace(studyDays, today).streak;
}

function calculateProgress(completedActivityIds: string[] = []): number {
  if (TRACKABLE_ACTIVITY_TOTAL <= 0) return 0;
  const uniqueCompleted = new Set(completedActivityIds).size;
  return Math.min(100, Math.round((uniqueCompleted / TRACKABLE_ACTIVITY_TOTAL) * 100));
}

function activityKey(prefix: string, value: string | number): string {
  return `${prefix}:${String(value).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 96)}`;
}

function normalizeProfileMetrics(profile: UserProfile): UserProfile {
  const completedActivityIds = Array.from(new Set(profile.completedActivityIds ?? []));
  const studyDays = Array.from(new Set(profile.studyDays ?? [])).sort();
  const studySecondsByDate = profile.studySecondsByDate ?? {};
  
  // Calculate streak with grace using learning.ts engine
  const streakRes = calculateStreakWithGrace(studyDays);
  const streak = streakRes.streak;
  
  const progress = calculateProgress(completedActivityIds);
  return {
    ...profile,
    completedActivityIds,
    studyDays,
    studySecondsByDate,
    streak,
    progress,
    completedLessons: completedActivityIds.length,
    learningCurve: buildLearningCurve(studySecondsByDate),
    // Ensure all custom profile fields are present
    srsByWord: profile.srsByWord ?? {},
    mistakeIds: profile.mistakeIds ?? [],
    onboardingDone: profile.onboardingDone ?? false,
    dailyGoalMinutes: profile.dailyGoalMinutes ?? 15,
    streakFreezeCount: profile.streakFreezeCount ?? 1,
  };
}



// Level filter chips shared by every skill-library browser.
const LIB_LEVELS: (Level | 'all')[] = ['all', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// Mongolian labels for dictionary word-class filter chips.
const WORD_CLASS_LABELS: { value: WordClass | 'all'; label: string }[] = [
  { value: 'all', label: 'Бүгд' },
  { value: 'noun', label: 'Нэр үг' },
  { value: 'verb', label: 'Үйл үг' },
  { value: 'adjective', label: 'Тэмдэг нэр' },
  { value: 'adverb', label: 'Дайвар үг' },
  { value: 'preposition', label: 'Угтвар үг' },
  { value: 'pronoun', label: 'Төлөөний үг' },
  { value: 'numeral', label: 'Тооны нэр' },
  { value: 'conjunction', label: 'Холбоос үг' },
  { value: 'interjection', label: 'Аялга үг' },
  { value: 'article', label: 'Артикль' },
  { value: 'phrase', label: 'Хэллэг' },
];

// Short Mongolian part-of-speech labels shown inside the library vocabulary
// tooltips (the dictionary-backed hover popups on each German passage).
const WORD_CLASS_MN: Record<string, string> = {
  noun: 'Нэр үг', verb: 'Үйл үг', adjective: 'Тэмдэг нэр', adverb: 'Дайвар үг',
  preposition: 'Угтвар үг', pronoun: 'Төлөөний үг', numeral: 'Тооны нэр',
  conjunction: 'Холбоос үг', interjection: 'Аялга үг', article: 'Артикль', phrase: 'Хэллэг',
};
const LEVEL_OPTIONS: (CEFRLevel | 'all')[] = ['all', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function BrandLogo({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="brand-logo-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0cd7e" />
          <stop offset="1" stopColor="#cf982f" />
        </linearGradient>
      </defs>
      <circle cx="13" cy="19" r="9" fill="url(#brand-logo-grad)" />
      <line x1="43" y1="16" x2="30" y2="48" stroke="url(#brand-logo-grad)" strokeWidth="18" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith('/admin')) return <AdminDashboard />;
  if (path.startsWith('/terms')) return <TermsPage />;
  if (path.startsWith('/privacy')) return <PrivacyPage />;
  if (path.startsWith('/contact')) return <ContactPage />;
  return <LearnerApp />;
}

function LearnerApp() {
  // Whether the user is logged in is now driven by Firebase Authentication.
  // The signed-in user's profile + progress lives in Firestore (users/{uid}),
  // so it follows them across devices and survives every redeploy.
  const isTest = process.env.NODE_ENV === 'test';

  // User Profile State — populated by the Firebase auth listener below.
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(
    isTest ? DEFAULT_PROFILES[0] : null
  );
  // True until Firebase reports whether a saved session exists, so we can show a
  // loading screen instead of briefly flashing the login page on refresh.
  const [authLoading, setAuthLoading] = useState<boolean>(!isTest);
  // Logged-out routing: false → marketing landing page; true → login/signup
  // screen. Visitors can also enter a no-account "guest" session from either.
  const [showAuth, setShowAuth] = useState<boolean>(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodsResponse | null>(null);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
  const [paymentActionLoading, setPaymentActionLoading] = useState(false);
  const [paymentStatusLoading, setPaymentStatusLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [bylCheckout, setBylCheckout] = useState<BylCheckoutResponse | null>(null);
  const [dummyInvoice, setDummyInvoice] = useState<DummyCheckoutResponse | null>(null);
  // Teacher-promo for the signed-in student (null = none). When present and the
  // first paid subscription hasn't happened yet, the paywall shows discounted
  // prices; a 100%-off code unlocks for free on checkout. Display only — the
  // server stays authoritative on the actual charge.
  const [myPromo, setMyPromo] = useState<MyPromo | null>(null);
  const [manualPromoCode, setManualPromoCode] = useState('');
  const [manualPromoLoading, setManualPromoLoading] = useState(false);
  const [manualPromoError, setManualPromoError] = useState<string | null>(null);
  // Monthly vs annual pricing toggle on the plan cards.
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('month');
  // Monthly AI teaser quota reported by /api/ai/quota (null until loaded; limit
  // null = unlimited). Free 2/month, Pro 5/month, Max/founder unlimited.
  const [aiQuota, setAiQuota] = useState<{ plan: string; limit: number | null; used: number; remaining: number | null } | null>(null);

  // Subscription entitlements — what the signed-in account may open right now.
  // Free: A1 lessons + first FREE_QUESTIONS_PER_SECTION questions of each A1
  // exam section. Pro: all content. Max/founder: everything + unlimited AI.
  const userPlan = effectivePlan(currentUser);
  const founderAccess = isFounderProfile(currentUser);
  const aiAllowed = canUseAi(currentUser);
  const fullContent = canAccessAllContent(currentUser);
  // AI buttons stay live while teaser uses remain; until the quota has loaded
  // we let the server be the judge rather than blocking optimistically.
  const aiUsable = aiAllowed || (aiQuota ? (aiQuota.remaining ?? 1) > 0 : true);

  // Session & UI States
  const [activeTab, setActiveTab] = useState<TabType>('read');
  const [streak, setStreak] = useState<number>(isTest ? DEFAULT_PROFILES[0].streak : 0);
  const [lessonProgress, setLessonProgress] = useState<number>(isTest ? DEFAULT_PROFILES[0].progress : 0);
  const [completedActivityIds, setCompletedActivityIds] = useState<string[]>([]);
  const [studyDays, setStudyDays] = useState<string[]>([]);
  const [studySecondsByDate, setStudySecondsByDate] = useState<Record<string, number>>({});
  // Set when a saved streak is found broken on login (holds the lost streak
  // length); shows a dismissible notice on the profile tab.
  const [brokenStreakNotice, setBrokenStreakNotice] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentUserRef = useRef<UserProfile | null>(currentUser);
  const activeTabRef = useRef<TabType>(activeTab);
  const studySecondsRef = useRef<Record<string, number>>(studySecondsByDate);
  const lastInteractionRef = useRef(Date.now());
  const pendingStudySaveSecondsRef = useRef(0);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // --- Profile editor (Settings tab) -------------------------------------
  // A local draft holds in-progress edits so background progress saves (study
  // time) can keep updating `currentUser` without clobbering what the learner
  // is typing. Seeded once from the signed-in profile; reset on sign-out.
  type ProfileDraft = { name: string; avatar: string; targetLevel: string; dailyGoalMinutes: number; learningGoal: string };
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const profileDraftKeyRef = useRef<string | null>(null);
  const [avatarPage, setAvatarPage] = useState(0);
  const [avatarStyle, setAvatarStyle] = useState<string>(DEFAULT_AVATAR_STYLE);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Seed the draft when the signed-in *identity* changes (login / account
  // switch / logout) — keyed by email, NOT on every currentUser update, so a
  // background study-time save can't reset what the learner is typing.
  useEffect(() => {
    if (!currentUser) { setProfileDraft(null); profileDraftKeyRef.current = null; return; }
    if (profileDraftKeyRef.current !== currentUser.email) {
      profileDraftKeyRef.current = currentUser.email;
      setProfileDraft({
        name: currentUser.name,
        avatar: currentUser.avatar,
        targetLevel: currentUser.targetLevel,
        dailyGoalMinutes: currentUser.dailyGoalMinutes ?? 15,
        learningGoal: currentUser.learningGoal ?? '',
      });
    }
  }, [currentUser]);

  const saveProfileEdits = async () => {
    if (!currentUser || !profileDraft) return;
    const name = profileDraft.name.trim().slice(0, 30);
    if (!name) return;
    setProfileSaving(true);
    setProfileSaved(false);
    setProfileSaveError(false);
    const learningGoal = profileDraft.learningGoal.trim().slice(0, 280);
    // Keep `role` consistent with the goal (mirrors createCustomProfile).
    const goalClean = learningGoal.toLowerCase();
    const role = goalClean.includes('сургууль') ? 'Оюутан' : goalClean.includes('ажил') ? 'Мэргэжилтэн' : 'Суралцагч';
    // Spread from the ref so a background study-time save that landed since
    // this render isn't clobbered (saveProfileProgress merges).
    const base = currentUserRef.current ?? currentUser;
    const next = stripServerOwnedFields({
      ...base,
      name,
      avatar: profileDraft.avatar,
      targetLevel: profileDraft.targetLevel,
      dailyGoalMinutes: profileDraft.dailyGoalMinutes,
      learningGoal,
      role,
    });
    currentUserRef.current = next;
    setCurrentUser(next);
    try {
      await saveProfileProgress(next);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      console.warn('Could not save profile edits:', err);
      setProfileSaveError(true);
      setTimeout(() => setProfileSaveError(false), 4000);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!currentUser?.email) return;
    try {
      await sendResetEmail(currentUser.email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 4000);
    } catch (err) {
      console.warn('Password reset email failed:', err);
    }
  };

  // Upload a custom profile picture to Firebase Storage and point the draft
  // avatar at its public download URL. Owner-only path; images ≤5MB.
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the user re-pick the same file later
    if (!file) return;
    // Raster only — exclude SVG (stored on a public-read bucket, an SVG could
    // carry script and become a stored-XSS vector if ever opened directly).
    const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) { setAvatarError('PNG, JPG, WEBP, GIF зураг оруулна уу.'); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Зураг 5MB-аас бага байх ёстой.'); return; }
    if (!isFirebaseConfigured) { setAvatarError('Зураг оруулах боломжгүй байна.'); return; }
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const storage = getStorageInstance();
      const userId = getAuthInstance().currentUser?.uid;
      if (!userId) throw new Error('Not signed in');
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const fileRef = ref(storage, `avatars/${userId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setProfileDraft((d) => d && { ...d, avatar: url });
    } catch (err) {
      console.warn('Avatar upload failed:', err);
      setAvatarError('Зураг оруулж чадсангүй. Дахин оролдоно уу.');
    } finally {
      setAvatarUploading(false);
    }
  };

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    studySecondsRef.current = studySecondsByDate;
  }, [studySecondsByDate]);

  // Listen for login / logout / restored sessions. Skipped in tests (no Firebase)
  // and before the config is filled in (so the app still boots and shows the
  // "set up Firebase" notice on the login screen).
  useEffect(() => {
    if (isTest) return;
    if (!isFirebaseConfigured) { setAuthLoading(false); return; }
    const unsubscribe = subscribeToAuthedProfile((profile) => {
      if (profile) {
        const normalizedProfile = normalizeProfileMetrics(profile);
        // The saved streak is a snapshot from the last study session; the
        // recomputed one reflects the days actually missed since. When it has
        // collapsed to 0, tell the learner and persist the reset so Firestore
        // (and the leaderboard) stop showing the stale number.
        if ((profile.streak ?? 0) > 0 && normalizedProfile.streak === 0) {
          setBrokenStreakNotice(profile.streak);
          saveProfileProgress(normalizedProfile).catch((err) => {
            console.warn('Could not persist streak reset to Firestore:', err);
          });
        }
        setCurrentUser(normalizedProfile);
        setStreak(normalizedProfile.streak);
        setLessonProgress(normalizedProfile.progress);
        setCompletedActivityIds(normalizedProfile.completedActivityIds ?? []);
        setStudyDays(normalizedProfile.studyDays ?? []);
        setStudySecondsByDate(normalizedProfile.studySecondsByDate ?? {});
        setActiveTab('profile');
      } else {
        // No Firebase session. If the visitor chose "try without account" at the
        // language gate (AuthGate), enter guest mode here instead of bouncing
        // them to this track's own landing page.
        let wantGuest = false;
        try { wantGuest = localStorage.getItem('vivid-lingua-guest') === '1'; } catch { /* ignore */ }
        if (wantGuest) {
          const guest = createGuestProfile();
          currentUserRef.current = guest;
          setCurrentUser(guest);
        } else {
          setCurrentUser(null);
        }
        setCompletedActivityIds([]);
        setStudyDays([]);
        setStudySecondsByDate({});
        setBrokenStreakNotice(null);
      }
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // Active Lesson Mode / Standard mode toggler (Screen 1 quick core lesson overlay)
  const [coreLessonActive, setCoreLessonActive] = useState(false);
  const [coreLessonStep, setCoreLessonStep] = useState(1); // 1: "Guten Tag" screen, 2: "Ich bin Student" quick, 3: completed
  const [coreLessonAnswer, setCoreLessonAnswer] = useState<number | null>(null);
  const [coreLessonFeedback, setCoreLessonFeedback] = useState<'correct' | 'incorrect' | null>(null);

  // Text Selection / Accent toggles for Reading (Screen 3)
  const [readTranslateEnabled, setReadTranslateEnabled] = useState(false);
  const [readingQuizAnswer, setReadingQuizAnswer] = useState<number | null>(null);
  const [readingQuizFeedback, setReadingQuizFeedback] = useState<string | null>(null);

  // Resource Library (50+ items per skill) — browse/select state for each tab.
  const [libReadId, setLibReadId] = useState<number>(READING_LIBRARY[0].id);
  // Multi-question state: which question is open + the chosen answer per question.
  const [libReadQIdx, setLibReadQIdx] = useState<number>(0);
  const [libReadAnswers, setLibReadAnswers] = useState<Record<number, number>>({});
  // Translation starts hidden so the learner reads/attempts first and only
  // reveals the Mongolian once stuck. Follows the "auto-show" setting if the
  // user opts into always-on translations.
  const [libReadTrans, setLibReadTrans] = useState<boolean>(readTranslateEnabled);
  const [libReadLevel, setLibReadLevel] = useState<Level | 'all'>('all');

  const [libListenId, setLibListenId] = useState<number>(LISTENING_LIBRARY[0].id);
  const [libListenQIdx, setLibListenQIdx] = useState<number>(0);
  const [libListenAnswers, setLibListenAnswers] = useState<Record<number, number>>({});
  const [libListenTrans, setLibListenTrans] = useState<boolean>(false);
  const [libListenLevel, setLibListenLevel] = useState<Level | 'all'>('all');

  const [libSpeakId, setLibSpeakId] = useState<number>(SPEAKING_LIBRARY[0].id);
  const [libSpeakReveal, setLibSpeakReveal] = useState<boolean>(false);
  const [libSpeakLevel, setLibSpeakLevel] = useState<Level | 'all'>('all');

  const [libWriteId, setLibWriteId] = useState<number>(WRITING_LIBRARY[0].id);
  const [libWriteText, setLibWriteText] = useState<string>('');
  const [libWriteReveal, setLibWriteReveal] = useState<boolean>(false);
  const [libWriteLevel, setLibWriteLevel] = useState<Level | 'all'>('all');

  const lockedActivityIds = useMemo(() => {
    if (!currentUser) return { read: new Set<number>(), listen: new Set<number>(), speak: new Set<number>(), write: new Set<number>() };
    const levelUnits = buildUnitsForLevel(currentUser.targetLevel as Level);
    return lockedItemIds(levelUnits, new Set(completedActivityIds));
  }, [currentUser?.targetLevel, completedActivityIds]);

  const dueCount = useMemo(() => {
    return countDueWords(TRAINER_WORDS, currentUser?.srsByWord ?? {});
  }, [currentUser?.srsByWord, TRAINER_WORDS]);

  // Audio player variables for Listening (Screen 2)
  const [audioSpeed, setAudioSpeed] = useState<'0.8' | '1.0'>('1.0');
  // Real TTS playback state for the listening player (pause / resume / replay)
  const [listenState, setListenState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const listenUtterRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Draggable-type Word Chips for Listening (Screen 2)
  const [listeningPool, setListeningPool] = useState<string[]>([]);
  const [listeningDropZone, setListeningDropZone] = useState<string[]>([]);
  const [listeningFeedback, setListeningFeedback] = useState<{ isCorrect: boolean; show: boolean } | null>(null);

  // Microphone recording variables for Speaking (Screen 4)
  const [isRecording, setIsRecording] = useState(false);
  const [speakingTextEntered, setSpeakingTextEntered] = useState('');
  const [speakingEvaluation, setSpeakingEvaluation] = useState<SpeakingEvaluation | null>(null);
  const [speakingLoading, setSpeakingLoading] = useState(false);
  const [voiceSupportMessage, setVoiceSupportMessage] = useState('');
  const recognitionRef = useRef<any>(null);
  // The German sentence the AI judge currently grades against. Library items and
  // the detailed lesson share one judge, so this ref carries whichever target is
  // active into the async record/evaluate callbacks (which can't see render scope).
  const speakTargetRef = useRef<string>(SPEAKING_LIBRARY[0]?.modelAnswer ?? '');

  // Real-audio recording (the "voice AI" path): capture the actual mic audio,
  // re-encode to WAV in the browser, and send the bytes to Gemini to listen to.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Translation writing exercise variables for Writing (Screen 6)
  const [writingInput, setWritingInput] = useState('');
  const [writingLoading, setWritingLoading] = useState(false);
  const [writingEvaluation, setWritingEvaluation] = useState<{
    isCorrect: boolean;
    corrected: string;
    explanation: string;
    feedbackMessage: string;
  } | null>(null);

  // Rich AI writing check shared by the writing library AND every exam writing
  // task. `writeFeedbackText` holds the exact text that was graded so the report
  // can show it regardless of which textarea (library vs exam) submitted it.
  const [writeFeedback, setWriteFeedback] = useState<WritingFeedback | null>(null);
  const [writeFeedbackLoading, setWriteFeedbackLoading] = useState(false);
  const [writeFeedbackText, setWriteFeedbackText] = useState('');

  // Flashcards state for Vocabulary Trainer (Screen 5) — draws from the dictionary
  // entries that already have a Mongolian translation, so the trainer stays polished.
  // (The Browse dictionary below shows the full set incl. words still awaiting Mongolian.)
  const [currentVocabIndex, setCurrentVocabIndex] = useState(0);
  const [vocabList, setVocabList] = useState<VocabularyWord[]>([...TRAINER_WORDS]);
  const [vocabFlipped, setVocabFlipped] = useState(false);
  const [vocabMemorizedCount, setVocabMemorizedCount] = useState(0);
  const vocabTotalCount = vocabList.length;
  // Trainer CEFR filter. Defaults to the learner's placement-test level the
  // first time they open the trainer (see selectTab); they can switch freely after.
  const [trainerLevel, setTrainerLevel] = useState<CEFRLevel | 'all'>('all');
  const trainerLevelInitRef = useRef(false);
  // Placement-based suggestion — only once the result is unlocked, so the
  // trainer never leaks a level the learner hasn't paid to reveal.
  const placementSuggestedLevel = useMemo(() => {
    const placement = currentUser?.placement;
    if (!placement?.unlocked) return null;
    return suggestedWordLevel(placement.level);
  }, [currentUser?.placement?.level, currentUser?.placement?.unlocked]);

  // Rebuild the trainer queue: filter by level, then SRS order (due → new → scheduled).
  const rebuildTrainerQueue = (level: CEFRLevel | 'all') => {
    const words = level === 'all' ? TRAINER_WORDS : TRAINER_WORDS.filter((w) => w.level === level);
    setVocabList(orderTrainerWords(words, currentUserRef.current?.srsByWord ?? {}));
    setCurrentVocabIndex(0);
    setVocabFlipped(false);
    setVocabMemorizedCount(0);
  };

  const selectTrainerLevel = (level: CEFRLevel | 'all') => {
    setTrainerLevel(level);
    rebuildTrainerQueue(level);
  };

  // Dictionary (Browse) state — vocabeo-style searchable/filterable word list
  const [vocabView, setVocabView] = useState<'trainer' | 'browse'>('trainer');
  const [dictSearch, setDictSearch] = useState('');
  const [dictClass, setDictClass] = useState<WordClass | 'all'>('all');
  const [dictLevel, setDictLevel] = useState<CEFRLevel | 'all'>('all');
  const [dictVisible, setDictVisible] = useState(24); // how many results to render (load-more paging)

  const filteredDictionary = useMemo(() => {
    const q = dictSearch.trim().toLowerCase();
    return DICTIONARY.filter((w) => {
      if (dictClass !== 'all' && w.wordClass !== dictClass) return false;
      if (dictLevel !== 'all' && w.level !== dictLevel) return false;
      if (!q) return true;
      return (
        w.german.toLowerCase().includes(q) ||
        w.mongolian.toLowerCase().includes(q) ||
        (w.english ? w.english.toLowerCase().includes(q) : false) ||
        (w.article ? `${w.article} ${w.german}`.toLowerCase().includes(q) : false)
      );
    }).sort(compareWordsByLevel); // easiest first: A1 → C2
  }, [dictSearch, dictClass, dictLevel]);

  // Reset paging whenever the filters change so the list starts from the top.
  useEffect(() => {
    setDictVisible(24);
  }, [dictSearch, dictClass, dictLevel]);

  const applyMetricProfile = (profile: UserProfile, save = true) => {
    const normalizedProfile = normalizeProfileMetrics(profile);
    currentUserRef.current = normalizedProfile;
    studySecondsRef.current = normalizedProfile.studySecondsByDate ?? {};
    setCurrentUser(normalizedProfile);
    setStreak(normalizedProfile.streak);
    if (normalizedProfile.streak > 0) setBrokenStreakNotice(null);
    setLessonProgress(normalizedProfile.progress);
    setCompletedActivityIds(normalizedProfile.completedActivityIds ?? []);
    setStudyDays(normalizedProfile.studyDays ?? []);
    setStudySecondsByDate(normalizedProfile.studySecondsByDate ?? {});
    if (save && !isTest) {
      saveProfileProgress(normalizedProfile).catch((err) => {
        console.warn('Could not save progress to Firestore:', err);
      });
    }
  };

  const recordStudyActivity = (activityId: string) => {
    const profile = currentUserRef.current;
    if (!profile) return;

    const today = localDateKey();
    const nextCompleted = Array.from(new Set([...(profile.completedActivityIds ?? []), activityId]));
    const nextStudyDays = Array.from(new Set([...(profile.studyDays ?? []), today])).sort();
    const alreadyCompleted = (profile.completedActivityIds ?? []).includes(activityId);
    const alreadyStudiedToday = (profile.studyDays ?? []).includes(today);

    if (alreadyCompleted && alreadyStudiedToday) return;

    applyMetricProfile({
      ...profile,
      completedActivityIds: nextCompleted,
      studyDays: nextStudyDays,
      studySecondsByDate: studySecondsRef.current,
      lastActiveAt: new Date().toISOString(),
    });
  };

  const recordStudySeconds = (seconds: number) => {
    const profile = currentUserRef.current;
    if (!profile || seconds <= 0) return;

    const today = localDateKey();
    const nextSeconds = {
      ...studySecondsRef.current,
      [today]: Math.round((studySecondsRef.current[today] ?? 0) + seconds),
    };
    const nextProfile = normalizeProfileMetrics({
      ...profile,
      studySecondsByDate: nextSeconds,
      lastActiveAt: new Date().toISOString(),
    });

    currentUserRef.current = nextProfile;
    studySecondsRef.current = nextSeconds;
    setCurrentUser(nextProfile);
    setStudySecondsByDate(nextSeconds);

    pendingStudySaveSecondsRef.current += seconds;
    if (pendingStudySaveSecondsRef.current >= STUDY_SAVE_THRESHOLD_SECONDS && !isTest) {
      pendingStudySaveSecondsRef.current = 0;
      saveProfileProgress(nextProfile).catch((err) => {
        console.warn('Could not save study time to Firestore:', err);
      });
    }
  };

  // Track real active study time. Time counts only while the page is visible, a
  // study tab is open, and the learner interacted recently; idle open tabs stop
  // adding hours.
  useEffect(() => {
    if (isTest) return;

    const markInteraction = () => {
      lastInteractionRef.current = Date.now();
    };
    const savePendingStudyTime = () => {
      const profile = currentUserRef.current;
      if (!profile || pendingStudySaveSecondsRef.current <= 0) return;
      pendingStudySaveSecondsRef.current = 0;
      saveProfileProgress(profile).catch((err) => {
        console.warn('Could not save study time to Firestore:', err);
      });
    };

    const interactionEvents = ['click', 'keydown', 'pointerdown', 'touchstart', 'scroll'];
    interactionEvents.forEach((eventName) => window.addEventListener(eventName, markInteraction, { passive: true }));

    let lastTick = Date.now();
    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = Math.min(30, Math.max(0, (now - lastTick) / 1000));
      lastTick = now;

      const isVisible = document.visibilityState === 'visible';
      const isRecentlyActive = now - lastInteractionRef.current <= ACTIVE_IDLE_LIMIT_MS;
      const isStudyTab = STUDY_TABS.includes(activeTabRef.current);
      if (!isVisible || !isRecentlyActive || !isStudyTab || !currentUserRef.current) return;

      recordStudySeconds(elapsedSeconds);
    }, 30000);

    const handleVisibilityChange = () => {
      markInteraction();
      if (document.visibilityState === 'hidden') savePendingStudyTime();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', savePendingStudyTime);

    return () => {
      window.clearInterval(interval);
      interactionEvents.forEach((eventName) => window.removeEventListener(eventName, markInteraction));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', savePendingStudyTime);
      savePendingStudyTime();
    };
  }, [isTest]);

  // Dedicated Professional Translator states
  const [translationInput, setTranslationInput] = useState('');
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationResult, setTranslationResult] = useState<{
    translation: string;
    detectedLanguage: string;
    pronunciation: string;
    grammarExplanation: string;
    words: Array<{
      word: string;
      baseForm: string;
      partOfSpeech: string;
      translation: string;
      explanation: string;
    }>;
    examples: Array<{
      german: string;
      mongolian: string;
    }>;
  } | null>(null);


  // CEFR level-based exams (A1–C2) — test tab
  const [examLevelSel, setExamLevelSel] = useState<ExamLevel | null>(null);
  // Бүрэн TestDaF загвар шалгалтын симуляци (бүрэн дэлгэц overlay).
  const [testdafOpen, setTestdafOpen] = useState(false);
  // Түвшин тогтоох тест: шинэ хэрэглэгчид onboarding-ийн дараа автоматаар,
  // бусад нь Шалгалт табын картаар нээнэ.
  const [placementOpen, setPlacementOpen] = useState(false);

  // --- Нийгмийн боломжууд: тулаан, урилга --------------------------------------
  // Одоо тоглож/харж буй тулаан (бүтэн дэлгэцийн overlay).
  const [activeDuel, setActiveDuel] = useState<DuelView | null>(null);
  // activeDuel-ийн хамгийн сүүлийн утгыг interval доторх closure-аас уншихад.
  const activeDuelRef = useRef<DuelView | null>(null);
  useEffect(() => { activeDuelRef.current = activeDuel; }, [activeDuel]);
  // Player ID-аар над руу ирсэн, хараахан тоглоогүй тулааны урилга (pop-up).
  const [incomingDuel, setIncomingDuel] = useState<DuelView | null>(null);
  // Тулаан дуусахад профайлын нийгмийн хэсгийг дахин ачаалуулах тоолуур.
  const [socialRefreshKey, setSocialRefreshKey] = useState(0);
  // Login дэлгэцэд харуулах урилгын контекст (?duel= / ?ref= линкээр ирсэн зочин).
  const [inviteContext, setInviteContext] = useState<InviteContext | null>(null);

  // Аль тулааны урилгыг аль хэдийн үзүүлснийг localStorage-д хадгална (дахин
  // дахин гарч ирэхгүйн тулд). Тоглосон тулаан submitted болж байгалиар нь
  // алга болно.
  const incomingDuelSeenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    try { incomingDuelSeenRef.current = new Set(JSON.parse(localStorage.getItem('duelChallengeSeen') || '[]')); }
    catch { incomingDuelSeenRef.current = new Set(); }
  }, []);
  const markDuelChallengeSeen = (code: string) => {
    const set = incomingDuelSeenRef.current;
    set.add(code);
    try { localStorage.setItem('duelChallengeSeen', JSON.stringify([...set].slice(-100))); } catch { /* үл тоомсорлоно */ }
  };

  // Над руу чиглэсэн (opponent = би), хараахан тоглоогүй нээлттэй тулааныг хайж
  // pop-up болгож үзүүлнэ. Тоглож буй/нээлттэй pop-up байвал давхарлахгүй.
  const checkIncomingDuels = useCallback(async () => {
    if (activeDuelRef.current) return;
    try {
      const { duels } = await fetchMyDuels();
      const seen = incomingDuelSeenRef.current;
      const incoming = duels.find((d) =>
        d.status !== 'finished' &&
        d.opponent?.isMe === true && d.opponent.submitted === false &&
        !!d.challenger && d.challenger.isMe === false &&
        !seen.has(d.code));
      if (incoming) setIncomingDuel((prev) => prev ?? incoming);
    } catch { /* нийгмийн API байхгүй (503) — үл тоомсорлоно */ }
  }, []);

  // ?duel=/?ref=/?promo= параметрүүдийг localStorage-д хадгалаад URL-ийг цэвэрлэнэ:
  // нэвтрэлт/бүртгэлийн дараа ашиглагдана (refresh даваад үлдэнэ).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const duelCode = params.get('duel');
    const refCode = params.get('ref');
    const promoCode = params.get('promo');
    if (!duelCode && !refCode && !promoCode) return;
    try {
      if (duelCode) localStorage.setItem('pendingDuelCode', duelCode);
      if (refCode) localStorage.setItem('pendingRefCode', refCode);
      if (promoCode) localStorage.setItem('pendingPromoCode', promoCode);
    } catch { /* private mode — урилгагүйгээр үргэлжилнэ */ }
    params.delete('duel');
    params.delete('ref');
    params.delete('promo');
    const qs = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, []);

  // Нэвтрээгүй зочинд урилгын баннер харуулахын тулд нийтийн duel preview-г татна.
  useEffect(() => {
    if (isTest) return;
    let duelCode: string | null = null;
    let refCode: string | null = null;
    try {
      duelCode = localStorage.getItem('pendingDuelCode');
      refCode = localStorage.getItem('pendingRefCode');
    } catch { return; }
    if (duelCode) {
      fetchDuel(duelCode)
        .then((duel) => setInviteContext({ kind: 'duel', challengerName: duel.challenger?.name }))
        .catch(() => setInviteContext(null));
    } else if (refCode) {
      setInviteContext({ kind: 'ref' });
    }
  }, []);

  // Нэвтэрсний дараа хүлээгдэж буй урилга болон багшийн кодыг холбож,
  // шинэ хэрэглэгчид 3 өдрийн туршилтын эрх олгоно.
  const socialBootstrapDoneRef = useRef(false);
  useEffect(() => {
    // Guests have no Firebase token, so trial/promo/duel bootstrap calls would
    // only 401 — skip them entirely for the no-account session.
    if (!currentUser || currentUser.isGuest || isTest || socialBootstrapDoneRef.current) return;
    socialBootstrapDoneRef.current = true;
    void (async () => {
      let duelCode: string | null = null;
      let refCode: string | null = null;
      let promoCode: string | null = null;
      try {
        duelCode = localStorage.getItem('pendingDuelCode');
        refCode = localStorage.getItem('pendingRefCode');
        promoCode = localStorage.getItem('pendingPromoCode');
        localStorage.removeItem('pendingDuelCode');
        localStorage.removeItem('pendingRefCode');
        localStorage.removeItem('pendingPromoCode');
      } catch { return; }

      // 1. Шинэ бүртгэлд 3 өдрийн Pro туршилтын эрх олгох (idempotent)
      try {
        await ensureSignupTrial();
      } catch (err) {
        console.error('ensureSignupTrial error:', err);
      }

      // 2. Багшийн promo холбох
      if (promoCode) {
        try {
          await redeemPromoCode(promoCode);
          await loadMyPromo();
        } catch (err) {
          console.error('redeemPromoCode error:', err);
        }
      }

      // 3. Урилгын кредит: энгийн ref код, эсвэл тулааны challenger урьсанд тооцно.
      // Хуучин данс серверээс зөөлөн татгалзана (400) — алдааг үл тоомсорлоно.
      if (refCode) {
        try { await redeemReferralCode({ code: refCode }); } catch { /* үл тоомсорлоно */ }
      } else if (duelCode) {
        try { await redeemReferralCode({ duelCode }); } catch { /* үл тоомсорлоно */ }
      }
      if (duelCode) {
        try {
          const duel = await fetchDuel(duelCode);
          setActiveDuel(duel);
        } catch { /* тулаан устсан/олдоогүй — юу ч нээхгүй */ }
      }
      setInviteContext(null);

      // Линкээр тулаан нээгээгүй бол над руу ирсэн challenge байгаа эсэхийг шалгана.
      if (!duelCode) void checkIncomingDuels();
    })();
  }, [currentUser]);

  // Над руу чиглэсэн тулааны урилгыг тогтмол шалгаж (60 сек), нөгөө хүн над руу
  // challenge илгээмэгц "X таныг дуэлд уриалаа" pop-up гарч ирнэ.
  useEffect(() => {
    if (!currentUser || isTest) return;
    const id = setInterval(() => { void checkIncomingDuels(); }, 60000);
    return () => clearInterval(id);
  }, [currentUser, checkIncomingDuels]);
  const [examSec, setExamSec] = useState<'reading' | 'listening' | 'writing' | 'speaking'>('reading');
  const [examItemIdx, setExamItemIdx] = useState(0);
  const [examItemAns, setExamItemAns] = useState<number | null>(null);
  const [examItemReveal, setExamItemReveal] = useState(false);
  const [examItemWrite, setExamItemWrite] = useState('');
  const [examItemTrans, setExamItemTrans] = useState(false);

  // Reset the per-test sub-state when switching section or test. Also clears the
  // shared speaking judge so a report never carries over to a different prompt.
  const selectExamSection = (sec: 'reading' | 'listening' | 'writing' | 'speaking') => {
    setExamSec(sec); setExamItemIdx(0); setExamItemAns(null); setExamItemReveal(false); setExamItemWrite(''); resetSpeakingJudge(); resetWritingFeedback();
  };
  const selectExamItem = (idx: number) => {
    setExamItemIdx(idx); setExamItemAns(null); setExamItemReveal(false); setExamItemWrite(''); resetSpeakingJudge(); resetWritingFeedback();
  };
  const [translationError, setTranslationError] = useState<string | null>(null);


  // Bearer token for the AI endpoints — the server only serves AI features to
  // Max/founder accounts, so every AI call has to prove who is asking.
  const aiAuthHeaders = async (): Promise<Record<string, string>> => {
    try {
      if (!isFirebaseConfigured) return {};
      const user = getAuthInstance().currentUser;
      if (!user) return {};
      return { Authorization: `Bearer ${await user.getIdToken()}` };
    } catch {
      return {};
    }
  };

  // Refresh the monthly AI teaser counter (cheap read; never consumes a use).
  const refreshAiQuota = async () => {
    try {
      const headers = await aiAuthHeaders();
      if (!headers.Authorization) return;
      const response = await fetch('/api/ai/quota', { headers });
      if (!response.ok) return;
      const data = await response.json();
      if (typeof data?.used === 'number') setAiQuota(data);
    } catch {
      // Non-fatal: the counter just stays stale until the next AI call.
    }
  };

  const translateText = async (textToTranslate?: string) => {
    const targetText = textToTranslate !== undefined ? textToTranslate : translationInput;
    if (!targetText.trim()) return;

    setTranslationLoading(true);
    setTranslationError(null);
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await aiAuthHeaders()) },
        body: JSON.stringify({ text: targetText })
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        if (errBody?.quota) setAiQuota(errBody.quota);
        throw new Error(errBody?.error || 'Орчуулгын серверээс алдаа ирлээ.');
      }

      const data = await response.json();
      setTranslationResult(data);
    } catch (err: any) {
      console.error(err);
      setTranslationError(err?.message || 'Орчуулга түр амжилтгүй боллоо. Сүлжээгээ шалгаад хэсэг хугацааны дараа дахин оролдоно уу.');
    } finally {
      setTranslationLoading(false);
      refreshAiQuota();
    }
  };

  // Speech Recognition setup (Web Speech API)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.lang = 'de-DE';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => {
        setIsRecording(true);
        setVoiceSupportMessage('Микрофон сонсож байна... Германоор хэлнэ үү.');
      };

      rec.onresult = (e: any) => {
        const spoken = e.results[0][0].transcript;
        setSpeakingTextEntered(spoken);
        evaluateSpeechText(spoken, speakTargetRef.current);
      };

      rec.onerror = (e: any) => {
        console.error('Speech recognition error:', e);
        setIsRecording(false);
        setVoiceSupportMessage('Микрофон алдаа заалаа. Та доорх талбарт шууд шивж шалгуулах боломжтой.');
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    } else {
      setVoiceSupportMessage('Таны хөтөч дуу хоолой танихыг дэмждэггүй тул доорх хайрцагт шивж шалгуулна уу.');
    }
  }, []);

  // Clean up any active recording resources when leaving the page.
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    };
  }, [recordedAudioUrl]);

  // Text-To-Speech Play helper (German voice standard audio synthesis)
  const speakGerman = (text: string, speedMultiplier = 1.0) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'de-DE';
      utterance.rate = speedMultiplier;
      window.speechSynthesis.speak(utterance);
    } else {
      alert('Таны төхөөрөмж дээр дуут уншигч (TTS) дэмжигдээгүй байна.');
    }
  };

  // --- Listening player controls (pause / resume / replay over Web Speech TTS) ---
  // TTS has no seekable timeline, so "replay" restarts from the top; pause/resume
  // map to the native speechSynthesis pause()/resume().
  const playListening = (text: string, rate: number) => {
    if (!('speechSynthesis' in window)) {
      alert('Таны төхөөрөмж дээр дуут уншигч (TTS) дэмжигдээгүй байна.');
      return;
    }
    // Detach the previous utterance's handlers BEFORE cancelling — cancel() fires
    // its onend, which would otherwise clobber the new 'playing' state to 'idle'.
    if (listenUtterRef.current) {
      listenUtterRef.current.onend = null;
      listenUtterRef.current.onerror = null;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = rate;
    u.onend = () => setListenState('idle');
    u.onerror = () => setListenState('idle');
    listenUtterRef.current = u;
    setListenState('playing');
    window.speechSynthesis.speak(u);
  };
  const pauseListening = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.pause();
    setListenState('paused');
  };
  const resumeListening = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.resume();
    setListenState('playing');
  };
  const stopListening = () => {
    if (listenUtterRef.current) {
      listenUtterRef.current.onend = null;
      listenUtterRef.current.onerror = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    listenUtterRef.current = null;
    setListenState('idle');
  };

  // Fast lookup built once: lowercased German headword -> dictionary entry.
  // Powers the library vocabulary tooltips so every passage gets the same kind
  // of detailed word help the old "Дэлгэрэнгүй хичээл" lesson had — automatically.
  const dictLookup = useMemo(() => buildInflectedLookup(DICTIONARY), []);

  // Render a German passage with dictionary-backed vocabulary tooltips, matching
  // the detailed-lesson look: content words get a dashed underline, hover reveals
  // the Mongolian meaning + part of speech, and clicking hears the word spoken.
  const GLOSS_CLASSES = new Set(['noun', 'verb', 'adjective', 'adverb', 'phrase']);
  const renderRichGerman = (text: string) =>
    text.split(/(\s+)/).map((token, i) => {
      if (token === '' || /^\s+$/.test(token)) return <React.Fragment key={i}>{token}</React.Fragment>;
      const m = token.match(/^([„"«(\[]*)(.*?)([.,!?;:…”"»)\]]*)$/);
      const lead = m ? m[1] : '';
      const core = m ? m[2] : token;
      const trail = m ? m[3] : '';
      const entry = core ? dictLookup.get(core.toLowerCase()) : undefined;
      const glossable = !!entry && core.length > 1 &&
        (entry.wordClass ? GLOSS_CLASSES.has(entry.wordClass) : core.length >= 4);
      if (!glossable || !entry) return <React.Fragment key={i}>{token}</React.Fragment>;
      const cls = entry.wordClass ? (WORD_CLASS_MN[entry.wordClass] ?? '') : '';
      const spoken = entry.article ? `${entry.article} ${core}` : core;
      return (
        <React.Fragment key={i}>
          {lead}
          <span
            className="word-highlight font-extrabold text-secondary tracking-tight cursor-pointer relative"
            onClick={() => speakGerman(spoken)}
          >
            {core}
            <span className="tooltip-container">
              <span className="block bg-surface text-white border-2 border-on-background font-space font-bold text-xs rounded-xl p-3 shadow-2xl flex flex-col gap-1">
                <span className="flex items-center gap-2 text-secondary-fixed">
                  <Volume2 className="w-3 h-3 fill-current text-secondary" />
                  <span className="text-[13px] text-white">{entry.article ? `${entry.article} ` : ''}{core} — {entry.mongolian}</span>
                </span>
                {cls && <span className="text-[11px] text-slate-400">{cls}</span>}
              </span>
            </span>
          </span>
          {trail}
        </React.Fragment>
      );
    });

  // Listening player: stop speech when leaving the tab or switching clip,
  // and cancel any in-flight utterance on unmount so it never keeps talking.
  useEffect(() => {
    if (activeTab !== 'listen') stopListening();
  }, [activeTab]);
  useEffect(() => {
    stopListening();
  }, [libListenId]);
  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);


  // Evaluation trigger: Speaking (TEXT path) — used by the type-to-test box and
  // as a fallback when real audio recording isn't available.
  const evaluateSpeechText = async (text: string, target: string = speakTargetRef.current) => {
    if (!text.trim()) return;
    setSpeakingLoading(true);
    try {
      const response = await fetch('/api/evaluate-speaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await aiAuthHeaders()) },
        body: JSON.stringify({
          sentence: target,
          spokenText: text
        })
      });
      const data = await response.json();
      setSpeakingEvaluation(data);
      if (data.isCorrect) recordStudyActivity(activityKey('speak', target));
    } catch (e) {
      console.error(e);
      // Heuristic fallback
      setSpeakingEvaluation({
        isCorrect: text.toLowerCase().includes('wie geht') || text.toLowerCase().includes('ihnen'),
        analysis: 'Таны дуудлагыг хэмжлээ. Хэлсэн үг: "' + text + '". "Wie geht es Ihnen" дуудлагатай таарч байна.',
        feedbackMessage: 'Сайн байна! Гэхдээ...'
      });
      if (text.toLowerCase().includes('wie geht') || text.toLowerCase().includes('ihnen')) {
        recordStudyActivity(activityKey('speak', target));
      }
    } finally {
      setSpeakingLoading(false);
      refreshAiQuota();
    }
  };

  // Evaluation trigger: Speaking (AUDIO path) — the real "voice AI". Sends the
  // actual recorded audio to Gemini so it can hear pronunciation and accent.
  const evaluateSpeechAudio = async (blob: Blob, target: string = speakTargetRef.current) => {
    setSpeakingLoading(true);
    setVoiceSupportMessage('AI таны дуу хоолойг сонсож, дүн шинжилгээ хийж байна...');
    try {
      const wavBlob = await audioBlobToWavBlob(blob);
      const bodyData: any = {
        sentence: target,
        mimeType: 'audio/wav',
      };

      if (isFirebaseConfigured) {
        try {
          const storage = getStorageInstance();
          const auth = getAuthInstance();
          const userId = auth.currentUser?.uid || 'anonymous';
          const fileRef = ref(storage, `audio-evaluations/${userId}/${Date.now()}-${Math.random().toString(36).substring(2)}.wav`);
          
          await uploadBytes(fileRef, wavBlob);
          const downloadUrl = await getDownloadURL(fileRef);
          bodyData.audioUrl = downloadUrl;
        } catch (storageErr) {
          console.error('Firebase Storage upload failed, falling back to base64:', storageErr);
          const wavBase64 = await audioBlobToWavBase64(blob);
          bodyData.audio = wavBase64;
        }
      } else {
        const wavBase64 = await audioBlobToWavBase64(blob);
        bodyData.audio = wavBase64;
      }

      const response = await fetch('/api/evaluate-speaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await aiAuthHeaders()) },
        body: JSON.stringify(bodyData)
      });
      const data = await response.json();
      setSpeakingEvaluation(data);
      if (data.isCorrect) recordStudyActivity(activityKey('speak', target));
      if (data.transcript) setSpeakingTextEntered(data.transcript);
      setVoiceSupportMessage('Шинжилгээ бэлэн боллоо! Доороос үр дүнгээ хараарай.');
    } catch (e) {
      console.error('Audio evaluation failed:', e);
      setVoiceSupportMessage('Дуу хоолой шинжлэхэд алдаа гарлаа. Доорх талбарт шивж туршина уу.');
    } finally {
      setSpeakingLoading(false);
      refreshAiQuota();
    }
  };

  // Begin capturing real microphone audio via MediaRecorder. `target` is the
  // German model sentence to grade against; stored on a ref so the async onstop
  // callback evaluates the same item even if the user navigates afterwards.
  const startAudioRecording = async (target: string = speakTargetRef.current) => {
    speakTargetRef.current = target;
    setSpeakingEvaluation(null);
    setSpeakingTextEntered('');
    if (recordedAudioUrl) { URL.revokeObjectURL(recordedAudioUrl); setRecordedAudioUrl(null); }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      // Older browser: fall back to Web Speech API text recognition if present.
      setVoiceSupportMessage('Таны хөтөч дуу бичлэгийг дэмжихгүй байна. Доорх талбарт шивж туршина уу.');
      try { recognitionRef.current?.start(); } catch { /* no-op */ }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      // Pick a mime type the browser actually supports (Chrome: webm, Safari: mp4).
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mimeType = candidates.find((t) => (window as any).MediaRecorder?.isTypeSupported?.(t)) || '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 0) {
          setRecordedAudioUrl(URL.createObjectURL(blob));
          await evaluateSpeechAudio(blob);
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
      setVoiceSupportMessage('Бичиж байна... Германоор хэлчихээд зогсоох товчийг дарна уу.');
    } catch (e) {
      console.error('Microphone access failed:', e);
      setIsRecording(false);
      setVoiceSupportMessage('Микрофон руу хандах боломжгүй байна. Зөвшөөрлөө шалгах эсвэл доор шивж туршина уу.');
    }
  };

  // Stop recording; onstop handler runs the AI evaluation.
  const stopAudioRecording = () => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    try { mediaRecorderRef.current?.stop(); } catch { /* no-op */ }
    setIsRecording(false);
  };

  // Toggle Microphone recording (real-audio voice-AI pipeline). `target` is the
  // German model sentence the AI judge grades the recording against.
  const toggleMic = (target: string = speakTargetRef.current) => {
    if (isRecording) {
      stopAudioRecording();
    } else {
      startAudioRecording(target);
    }
  };

  // Clear the shared AI-judge state (report, typed text, recording playback).
  // Called when switching speaking library items or modes so a stale report
  // never lingers under a different prompt.
  const resetSpeakingJudge = () => {
    setSpeakingEvaluation(null);
    setSpeakingTextEntered('');
    setVoiceSupportMessage('');
    if (recordedAudioUrl) { URL.revokeObjectURL(recordedAudioUrl); setRecordedAudioUrl(null); }
  };


  // Clear the shared AI writing report. Called when switching writing library
  // items/modes, exam items/sections, or main tabs so a report never lingers
  // under a different prompt.
  const resetWritingFeedback = () => {
    setWriteFeedback(null);
    setWriteFeedbackText('');
  };

  // Evaluation trigger: free writing (library + every exam writing task). Sends
  // the learner's text plus the task context to the AI, which flags wrong grammar
  // / wrong words and recommends better wording. `ctx` is the active item.
  const checkComposition = async (
    text: string,
    ctx: { prompt: string; points: string[]; modelAnswer: string; level: string },
  ) => {
    if (!text.trim()) return;
    setWriteFeedbackLoading(true);
    setWriteFeedbackText(text);
    setWriteFeedback(null);
    try {
      const response = await fetch('/api/evaluate-composition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await aiAuthHeaders()) },
        body: JSON.stringify({
          prompt: ctx.prompt,
          points: ctx.points,
          modelAnswer: ctx.modelAnswer,
          level: ctx.level,
          text,
        }),
      });
      const data = await response.json();
      setWriteFeedback(data);
      if (data.isCorrect) recordStudyActivity(activityKey(`write:${ctx.level}`, ctx.prompt));
    } catch (e) {
      console.error('Composition evaluation failed:', e);
      setWriteFeedback({
        isCorrect: false,
        feedbackMessage: 'Алдаа гарлаа',
        analysis: 'Шинжилгээ хийх үед алдаа гарлаа. Сүлжээгээ шалгаад дахин оролдоно уу.',
        corrected: text,
        corrections: [],
      });
    } finally {
      setWriteFeedbackLoading(false);
      refreshAiQuota();
    }
  };


  // Vocabulary list card selections
  const handleVocabAction = (knows: boolean) => {
    setVocabFlipped(false);
    if (vocabList.length === 0) return;
    const word = vocabList[currentVocabIndex];
    const key = srsWordKey(word);
    
    const profile = currentUserRef.current;
    if (profile) {
      const currentSrsByWord = profile.srsByWord ?? {};
      const prevEntry = currentSrsByWord[key];
      const nextEntry = reviewSrs(prevEntry, knows);
      
      const nextSrs = {
        ...currentSrsByWord,
        [key]: nextEntry
      };
      
      const actId = activityKey('vocab', word.rank ?? `${word.german}-${word.mongolian}`);
      const nextCompleted = knows
        ? Array.from(new Set([...(profile.completedActivityIds ?? []), actId]))
        : (profile.completedActivityIds ?? []);
      // A correct vocab review marks today as studied like every other activity;
      // otherwise vocab-only days never reach studyDays and the streak breaks.
      const nextStudyDays = knows
        ? Array.from(new Set([...(profile.studyDays ?? []), localDateKey()])).sort()
        : (profile.studyDays ?? []);

      applyMetricProfile({
        ...profile,
        srsByWord: nextSrs,
        completedActivityIds: nextCompleted,
        studyDays: nextStudyDays,
        lastActiveAt: new Date().toISOString(),
      });
    }

    if (knows) {
      setVocabMemorizedCount(prev => Math.min(prev + 1, vocabTotalCount));
    }

    // Advance after the flip-back animation. A known word just moves on; an
    // unknown word is pulled out and reinserted a few cards ahead so it comes
    // back around in this same session.
    setTimeout(() => {
      if (knows) {
        setCurrentVocabIndex(prev => (prev + 1) % vocabList.length);
        return;
      }
      const idx = currentVocabIndex;
      setVocabList(prev => {
        const next = [...prev];
        const [again] = next.splice(idx, 1);
        next.splice(Math.min(idx + VOCAB_REQUEUE_GAP, next.length), 0, again);
        return next;
      });
      // Removing the current card shifts the next one into this index — except
      // on the last card, where the reinsert lands back on itself; wrap then.
      if (idx >= vocabList.length - 1) {
        setCurrentVocabIndex(0);
      }
    }, 200);
  };

  // Trigger main quick core quiz options (Screen 1 mock-flow helper)
  const submitCoreLessonAnswer = (optionIndex: number) => {
    setCoreLessonAnswer(optionIndex);
    // Correct option is "Өдрийн мэнд" which is index 1
    if (optionIndex === 1) {
      setCoreLessonFeedback('correct');
      recordStudyActivity('lesson:core-guten-tag');
    } else {
      setCoreLessonFeedback('incorrect');
    }
  };

  // Central function to launch activities from suggested sections or unit curriculum path
  const startActivity = (tab: 'read' | 'listen' | 'speak' | 'write', itemId: number) => {
    if (tab === 'read') {
      const item = READING_LIBRARY.find((r) => r.id === itemId);
      if (item) {
        setLibReadId(item.id);
        setLibReadQIdx(0);
        setLibReadAnswers({});
        setLibReadTrans(false);
        setLibReadLevel(item.level);
        setActiveTab('read');
      }
    } else if (tab === 'listen') {
      const item = LISTENING_LIBRARY.find((l) => l.id === itemId);
      if (item) {
        setLibListenId(item.id);
        setLibListenQIdx(0);
        setLibListenAnswers({});
        setLibListenTrans(false);
        setLibListenLevel(item.level);
        setActiveTab('listen');
      }
    } else if (tab === 'speak') {
      const item = SPEAKING_LIBRARY.find((s) => s.id === itemId);
      if (item) {
        setLibSpeakId(item.id);
        setLibSpeakReveal(false);
        resetSpeakingJudge();
        setLibSpeakLevel(item.level);
        setActiveTab('speak');
      }
    } else if (tab === 'write') {
      const item = WRITING_LIBRARY.find((w) => w.id === itemId);
      if (item) {
        setLibWriteId(item.id);
        resetWritingFeedback();
        setLibWriteLevel(item.level);
        setActiveTab('write');
      }
    }
  };

  // Side bar navigation helper with auto menu closing on mobile. Clears the
  // shared AI reports so a speaking/writing result never bleeds across tabs.
  const selectTab = (tab: TabType) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    resetSpeakingJudge();
    resetWritingFeedback();
    
    if (tab === 'vocab') {
      // First visit: preselect the level the placement test suggested.
      let level = trainerLevel;
      if (!trainerLevelInitRef.current) {
        trainerLevelInitRef.current = true;
        if (placementSuggestedLevel) {
          level = placementSuggestedLevel;
          setTrainerLevel(level);
        }
      }
      rebuildTrainerQueue(level);
    }
  };

  // Count each browser once per day so the admin dashboard sees real traffic,
  // not just signups. Runs regardless of auth state (the whole point is to
  // measure logged-out visitors who never convert).
  useEffect(() => {
    if (isTest) return;
    trackVisitOncePerDay();
  }, []);

  // Enter a no-account guest session so visitors can sample the app (free tier)
  // before signing up. Nothing persists — saveProfileProgress() bails with no
  // Firebase user. The free-tier gating already limits guests appropriately.
  const startGuest = () => {
    if (!isTest) track('guest_start');
    setActiveTab('read');
    const guest = createGuestProfile();
    currentUserRef.current = guest;
    setCurrentUser(guest);
  };

  // Guest hits a "sign up to save" prompt → drop the guest session and show the
  // signup screen.
  const exitGuestToSignup = () => {
    if (!isTest) track('signup_click');
    currentUserRef.current = null;
    setCurrentUser(null);
    setShowAuth(true);
  };

  const logoutUser = () => {
    // The auth listener clears currentUser once Firebase signs out; we reset the
    // tab immediately so the UI feels responsive.
    setActiveTab('read');
    // Guests have no Firebase session — the listener won't fire. Clear the guest
    // flag and reload so the top-level AuthGate returns to the login screen
    // (where they can sign in, sign up, or guest into a language again).
    if (currentUserRef.current?.isGuest) {
      currentUserRef.current = null;
      try { localStorage.removeItem('vivid-lingua-guest'); } catch { /* ignore */ }
      window.location.reload();
      return;
    }
    logOutUser().catch((err) => console.warn('Sign out failed:', err));
  };

  const loadPaymentMethods = async () => {
    setPaymentMethodsLoading(true);
    try {
      const response = await fetch('/api/payments/methods');
      if (!response.ok) throw new Error('Could not load payment methods.');
      const data = await response.json();
      setPaymentMethods(data);
    } catch (err) {
      console.warn('Payment methods load failed:', err);
      setPaymentMessage({ type: 'error', text: 'Төлбөрийн сонголтуудыг ачаалж чадсангүй.' });
    } finally {
      setPaymentMethodsLoading(false);
    }
  };

  // Teacher-promo lookup for the paywall (discount display + free-grant CTA).
  const loadMyPromo = async () => {
    try {
      const { promo } = await getMyPromo();
      setMyPromo(promo);
    } catch {
      setMyPromo(null);
    }
  };

  const handleRedeemManualPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPromoCode.trim()) return;
    setManualPromoLoading(true);
    setManualPromoError(null);
    setPaymentMessage(null);
    try {
      const res = await redeemPromoCode(manualPromoCode.trim());
      if (res.redeemed) {
        setPaymentMessage({
          type: 'success',
          text: `Багш ${res.teacherName || ''}-ийн код холбогдлоо. (${res.discountPercent}% хямдрал эхний төлбөрт ажиллана.)`
        });
        setManualPromoCode('');
        await loadMyPromo();
      } else if (res.already) {
        setManualPromoError('Энэ код аль хэдийн таны дансанд холбогдсон байна.');
      } else {
        setManualPromoError('Код холбож чадсангүй.');
      }
    } catch (err: any) {
      setManualPromoError(err.message || 'Код холбоход алдаа гарлаа.');
    } finally {
      setManualPromoLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser || isTest) return;
    loadPaymentMethods();
    refreshAiQuota();
    // Promo lookup needs a Firebase token — guests would only 401.
    if (!currentUser.isGuest) loadMyPromo();
  }, [currentUser?.email, currentUser?.billing?.plan, currentUser?.isGuest, isTest]);

  const getCurrentIdToken = async () => {
    if (!isFirebaseConfigured) throw new Error('Firebase тохиргоо дутуу байна.');
    const user = getAuthInstance().currentUser;
    if (!user) throw new Error('Төлбөр эхлүүлэхийн тулд дахин нэвтэрнэ үү.');
    return user.getIdToken();
  };

  // Merge a billing object returned by the payments API into the local profile.
  const applyBillingUpdate = (billing: NonNullable<UserProfile['billing']>) => {
    if (!currentUserRef.current) return;
    const nextProfile = normalizeProfileMetrics({
      ...currentUserRef.current,
      billing: {
        ...currentUserRef.current.billing,
        ...billing,
      },
    });
    currentUserRef.current = nextProfile;
    setCurrentUser(nextProfile);
  };

  // 100%-off teacher code: the server granted the subscription for free and
  // returns billing with no checkout `url`. Reuse the exact billing-refresh path
  // the paid success flow uses (applyBillingUpdate), close the paywall panels,
  // and re-read the promo so its firstPaymentDone flips. Returns true if it
  // handled a free grant (caller should stop).
  const handleFreeGrant = (data: any): boolean => {
    if (!data || data.free !== true || data.url) return false;
    if (data.billing) applyBillingUpdate(data.billing);
    setBylCheckout(null);
    setDummyInvoice(null);
    setPaymentMessage({ type: 'success', text: 'Урамшууллын кодоор танд үнэгүй эрх нээгдлээ 🎉' });
    loadMyPromo();
    return true;
  };

  const startBylCheckout = async (planId: 'pro' | 'max') => {
    setPaymentActionLoading(true);
    setPaymentMessage(null);
    setDummyInvoice(null);
    try {
      const token = await getCurrentIdToken();
      const response = await fetch('/api/payments/byl/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: planId, interval: billingInterval }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Төлбөр эхлүүлэхэд алдаа гарлаа.');

      // 100%-off teacher code: server already granted access (no URL to open) —
      // refresh billing the same way the paid success path does and close out.
      if (handleFreeGrant(data)) return;

      setBylCheckout(data);
      // Pop the hosted checkout right away; the panel keeps a link in case the
      // browser blocked the popup.
      if (data.url) window.open(data.url, '_blank', 'noopener');
      setPaymentMessage({ type: 'info', text: 'Төлбөрийн хуудас нээгдлээ. QPay, SocialPay эсвэл Pocket-оор төлнө үү.' });
    } catch (err: any) {
      setPaymentMessage({ type: 'error', text: err?.message || 'Төлбөр эхлүүлэхэд алдаа гарлаа.' });
    } finally {
      setPaymentActionLoading(false);
    }
  };

  // Dummy provider: creates a pending invoice, then "Төлбөр төлөх (туршилт)"
  // simulates the bank confirmation and activates the plan — same Firestore
  // billing flow live Byl uses, minus the real money.
  const startDummyCheckout = async (planId: 'pro' | 'max') => {
    setPaymentActionLoading(true);
    setPaymentMessage(null);
    setBylCheckout(null);
    try {
      const token = await getCurrentIdToken();
      const response = await fetch('/api/payments/dummy/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: planId, interval: billingInterval }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Туршилтын нэхэмжлэл үүсгэхэд алдаа гарлаа.');

      // 100%-off teacher code path also short-circuits the dummy flow.
      if (handleFreeGrant(data)) return;

      setDummyInvoice(data);
      setPaymentMessage({ type: 'info', text: 'Туршилтын нэхэмжлэл үүслээ. "Төлбөр төлөх (туршилт)" товчоор баталгаажуулна уу.' });
    } catch (err: any) {
      setPaymentMessage({ type: 'error', text: err?.message || 'Туршилтын нэхэмжлэл үүсгэхэд алдаа гарлаа.' });
    } finally {
      setPaymentActionLoading(false);
    }
  };

  const payDummyInvoice = async () => {
    if (!dummyInvoice) return;
    setPaymentStatusLoading(true);
    setPaymentMessage(null);
    try {
      const token = await getCurrentIdToken();
      const response = await fetch(`/api/payments/dummy/invoices/${encodeURIComponent(dummyInvoice.senderInvoiceNo)}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Туршилтын төлбөр амжилтгүй боллоо.');

      if (data.billing) applyBillingUpdate(data.billing);
      setDummyInvoice(null);
      setPaymentMessage({ type: 'success', text: `Туршилтын төлбөр амжилттай. ${PLANS[dummyInvoice.plan].name} багц идэвхтэй боллоо!` });
    } catch (err: any) {
      setPaymentMessage({ type: 'error', text: err?.message || 'Туршилтын төлбөр амжилтгүй боллоо.' });
    } finally {
      setPaymentStatusLoading(false);
    }
  };

  // Byl if the merchant token is live, otherwise the dummy simulator.
  const startCheckout = (planId: 'pro' | 'max') => {
    if (paymentMethods?.byl.status === 'ready') return startBylCheckout(planId);
    return startDummyCheckout(planId);
  };

  // Polls one Byl checkout; returns true once Byl reports it paid. Used by the
  // manual "Одоо шалгах" button (silent=false) and the auto-poll loop below
  // (silent=true — no "not yet paid" noise every few seconds).
  const bylCheckoutRef = useRef<BylCheckoutResponse | null>(null);
  bylCheckoutRef.current = bylCheckout;
  const bylPollBusyRef = useRef(false);
  const pollBylInvoice = async (silent: boolean): Promise<boolean> => {
    const checkout = bylCheckoutRef.current;
    if (!checkout || bylPollBusyRef.current) return false;
    bylPollBusyRef.current = true;
    if (!silent) {
      setPaymentStatusLoading(true);
      setPaymentMessage(null);
    }
    try {
      const token = await getCurrentIdToken();
      const response = await fetch(`/api/payments/byl/invoices/${encodeURIComponent(checkout.senderInvoiceNo)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Төлбөрийн төлөв шалгахад алдаа гарлаа.');

      if (data.paid || data.status === 'paid') {
        if (data.billing) applyBillingUpdate(data.billing);
        setBylCheckout(null);
        setPaymentMessage({ type: 'success', text: 'Төлбөр баталгаажлаа. Эрх идэвхтэй боллоо! 🎉' });
        return true;
      }
      if (!silent) {
        setPaymentMessage({ type: 'info', text: 'Төлбөр хараахан баталгаажаагүй байна. Төлбөрийн хуудсан дээр төлснөөс хойш хэдхэн секундэд автоматаар баталгаажна.' });
      }
      return false;
    } catch (err: any) {
      if (!silent) setPaymentMessage({ type: 'error', text: err?.message || 'Төлбөрийн төлөв шалгахад алдаа гарлаа.' });
      return false;
    } finally {
      bylPollBusyRef.current = false;
      if (!silent) setPaymentStatusLoading(false);
    }
  };
  const checkBylPaymentStatus = () => pollBylInvoice(false);

  // While a Byl checkout is open, auto-confirm: the learner pays on the hosted
  // page, Byl clears it, and the plan activates here without any clicking.
  // Polls every 4s for up to 15 minutes (then the manual button still works).
  useEffect(() => {
    if (!bylCheckout) return;
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > 15 * 60 * 1000) { clearInterval(timer); return; }
      const paid = await pollBylInvoice(true);
      if (paid) clearInterval(timer);
    }, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bylCheckout?.senderInvoiceNo]);

  // ---------------------------------------------------------------------------
  // Locked-feature card. Shown wherever the current plan doesn't cover a
  // feature; the button jumps to the Profile tab where plans are sold.
  // ---------------------------------------------------------------------------
  const renderPlanLockCard = (title: string, description: string, requiredPlan: 'pro' | 'max') => (
    <div className="w-full flex flex-col items-center justify-center text-center gap-3 py-8 px-6 bg-surface-container-low border-2 border-on-background border-dashed rounded-xl block-shadow my-4">
      <span className="w-14 h-14 rounded-full bg-primary-container border-2 border-on-background flex items-center justify-center block-shadow">
        <Lock className="w-6 h-6 text-on-surface" />
      </span>
      <h4 className="text-lg font-black font-space text-on-surface">{title}</h4>
      <p className="text-sm text-on-surface-variant max-w-md leading-relaxed">{description}</p>
      <button
        onClick={() => setActiveTab('profile')}
        className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-white border-2 border-on-background rounded-lg font-bold text-sm cursor-pointer block-shadow hover:scale-[1.02] active:scale-95 transition-transform"
      >
        <Zap className="w-4 h-4" /> {PLANS[requiredPlan].name} багц авах
      </button>
    </div>
  );

  // What the AI lock card says: quota ran out vs. plain Max-only pitch.
  const aiLockDesc = (feature: string) =>
    aiQuota && aiQuota.limit !== null
      ? `Энэ сарын үнэгүй AI туршилт (${aiQuota.limit}) дууслаа. ${feature} Max багцад хязгааргүй.`
      : `${feature} Max багцад хязгааргүй нээлттэй.`;

  // Small counter strip shown above AI features while teaser uses remain.
  const renderAiTeaserBanner = () =>
    !aiAllowed && aiQuota && aiQuota.limit !== null && (aiQuota.remaining ?? 0) > 0 ? (
      <div className="w-full flex flex-wrap items-center justify-center gap-2 px-4 py-2 mb-3 bg-primary-container/60 border-2 border-on-background rounded-xl text-xs font-bold text-on-surface block-shadow">
        <Sparkles className="w-3.5 h-3.5" />
        Энэ сарын үнэгүй AI туршилт: {aiQuota.remaining}/{aiQuota.limit} үлдсэн
        <button onClick={() => setActiveTab('profile')} className="text-secondary underline cursor-pointer font-black">
          Max багцаар хязгааргүй
        </button>
      </div>
    ) : null;

  // ---------------------------------------------------------------------------
  // Shared AI speaking-judge UI. `target` is the German model sentence the recording
  // (or typed text) is graded against. Reused by every library item AND the detailed
  // lesson, so importing new speaking resources gets the AI judge automatically.
  // Free/Pro accounts spend monthly teaser uses; once exhausted, the upgrade
  // card replaces the judge until next month.
  // ---------------------------------------------------------------------------
  const renderSpeakingJudge = (target: string) => !aiUsable ? renderPlanLockCard(
    'Дуут AI багш',
    aiLockDesc('Ярианы дасгалын AI үнэлгээ (дуудлага, оноо, зөвлөмж)'),
    'max',
  ) : (
    // Microphone Interface Area — real voice recording for the AI coach
    <div className="w-full flex flex-col items-center justify-center relative py-6 bg-surface-container-low border-2 border-on-background border-dashed rounded-xl block-shadow my-4">

      <span className="inline-flex items-center gap-1.5 px-3 py-1 mb-4 bg-primary-container border-2 border-on-background text-[11px] font-black font-space rounded-full uppercase tracking-wider block-shadow">
        <AudioLines className="w-3.5 h-3.5" /> Дуут AI багш
      </span>

      <div className="px-6 w-full flex justify-center">{renderAiTeaserBanner()}</div>

      <div className="relative flex items-center justify-center mb-6">
        <button
          onClick={() => toggleMic(target)}
          disabled={speakingLoading && !isRecording}
          title={isRecording ? 'Зогсоох' : 'Бичиж эхлэх'}
          className={`relative z-10 w-24 h-24 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform duration-200 focus:outline-none border-2 border-on-background cursor-pointer block-shadow disabled:opacity-60 disabled:cursor-not-allowed ${
            isRecording ? 'bg-error text-white animate-ripple' : 'bg-secondary'
          }`}
        >
          {isRecording ? <Square className="w-9 h-9 fill-current" /> : <Mic className="w-10 h-10 stroke-[2.5px]" />}
        </button>
      </div>

      <h4 className="text-xl font-black text-secondary font-sans mb-1 flex items-center gap-2">
        {isRecording && <span className="w-2.5 h-2.5 rounded-full bg-error animate-pulse" />}
        {speakingLoading && !isRecording
          ? 'AI сонсож байна...'
          : isRecording
            ? `Бичиж байна  ${String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:${String(recordSeconds % 60).padStart(2, '0')}`
            : 'Бичихийн тулд дарна уу'}
      </h4>
      <p className="text-sm font-semibold text-outline text-center px-4 max-w-md">
        {voiceSupportMessage || 'Микрофон дээр дарж германаар чанга ярина уу. Дуусаад зогсоох товчийг дарвал AI таны дуу хоолойг сонсож, дуудлага, аялга, дүрэм, үгсийн санг үнэлнэ.'}
      </p>

      {/* Playback of the learner's own recording */}
      {recordedAudioUrl && !isRecording && (
        <div className="mt-5 w-full max-w-sm px-4 flex flex-col items-center gap-1.5">
          <p className="text-[11px] font-space text-outline font-bold uppercase">Таны бичлэг:</p>
          <audio src={recordedAudioUrl} controls className="w-full h-10" />
        </div>
      )}

      {/* Text alternative input field for users with missing micro permissions */}
      <div className="mt-6 w-full max-w-sm px-4 flex flex-col gap-2">
        <p className="text-[11px] font-space text-outline font-bold uppercase text-center">Эсвэл дуу бичихгүйгээр шивж туршина уу:</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Германаар бичнэ үү (e.g., Wie geht es Ihnen?)"
            value={speakingTextEntered}
            onChange={(e) => setSpeakingTextEntered(e.target.value)}
            maxLength={500}
            className="flex-grow bg-surface-container-low border-2 border-on-background font-bold text-sm px-3 py-2 rounded-xl outline-none focus:border-primary transition-all text-on-surface"
          />
          <button
            onClick={() => evaluateSpeechText(speakingTextEntered, target)}
            disabled={!speakingTextEntered.trim() || speakingLoading}
            className="px-4 py-2 border-2 border-on-background text-sm font-bold bg-primary text-on-primary rounded-xl block-shadow cursor-pointer disabled:opacity-50"
          >
            {speakingLoading ? 'Үнэлж байна...' : 'Шалгах'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderSpeakingReport = (target: string) => (
    // AI voice-coach report — pronunciation, accent, grammar, vocabulary
    !speakingEvaluation ? null : (
      <div className="w-full flex flex-col gap-4 animate-scale-up">

        {/* Headline + summary */}
        <div className="w-full border-2 border-on-background rounded-xl p-6 flex items-start gap-4 shadow-sm block-shadow">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center border-2 border-on-background shrink-0 block-shadow ${
            speakingEvaluation.isCorrect ? 'bg-secondary-container' : 'bg-error-container'
          }`}>
            {speakingEvaluation.isCorrect ? <CheckCircle className="w-5 h-5 text-secondary" /> : <AlertCircle className="w-5 h-5 text-error" />}
          </div>
          <div className="flex-grow">
            <h5 className="text-lg font-black text-on-surface mb-1 font-sans">{speakingEvaluation.feedbackMessage}</h5>
            <p className="text-sm text-on-surface-variant leading-relaxed font-sans">{speakingEvaluation.analysis}</p>
          </div>
        </div>

        {/* Score row (only when the AI returned numeric scores) */}
        {typeof speakingEvaluation.overallScore === 'number' && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Нийт оноо', value: speakingEvaluation.overallScore, icon: Target },
              { label: 'Дуудлага', value: speakingEvaluation.pronunciationScore, icon: AudioLines },
              { label: 'Чөлөөтэй байдал', value: speakingEvaluation.fluencyScore, icon: Gauge },
            ].filter((s) => typeof s.value === 'number').map((s, i) => {
              const v = s.value as number;
              const tone = v >= 75 ? 'text-secondary' : v >= 50 ? 'text-amber-600' : 'text-error';
              const barTone = v >= 75 ? 'bg-secondary' : v >= 50 ? 'bg-amber-500' : 'bg-error';
              return (
                <div key={i} className="border-2 border-on-background rounded-xl p-4 block-shadow flex flex-col items-center text-center">
                  <s.icon className={`w-5 h-5 mb-1 ${tone}`} />
                  <span className={`text-3xl font-black font-space ${tone}`}>{v}</span>
                  <span className="text-[10px] font-bold uppercase text-outline tracking-wide mt-0.5">{s.label}</span>
                  <div className="w-full h-1.5 bg-surface-container-high rounded-full mt-2 overflow-hidden">
                    <div className={`h-full ${barTone} rounded-full transition-all`} style={{ width: `${v}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* What the AI heard */}
        {speakingEvaluation.transcript && (
          <div className="w-full bg-surface-container-low border-2 border-on-background rounded-xl p-4 block-shadow">
            <p className="text-[11px] font-space font-bold uppercase text-outline mb-1 flex items-center gap-1.5">
              <MessageSquareText className="w-3.5 h-3.5" /> AI сонссон нь
            </p>
            <p className="text-base font-bold text-on-surface font-sans">"{speakingEvaluation.transcript}"</p>
          </div>
        )}

        {/* Detailed feedback cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { label: 'Дуудлага', text: speakingEvaluation.pronunciationFeedback, icon: AudioLines, tint: 'bg-primary-container' },
            { label: 'Аялга', text: speakingEvaluation.accentNote, icon: Languages, tint: 'bg-secondary-container' },
            { label: 'Дүрэм', text: speakingEvaluation.grammarFeedback, icon: SpellCheck, tint: 'bg-error-container' },
            { label: 'Үгсийн сан', text: speakingEvaluation.vocabularyFeedback, icon: BookOpen, tint: 'bg-primary-container' },
          ].filter((c) => c.text).map((c, i) => (
            <div key={i} className="border-2 border-on-background rounded-xl p-4 block-shadow">
              <p className="text-xs font-black uppercase text-on-surface mb-1.5 flex items-center gap-1.5">
                <span className={`w-6 h-6 rounded-full ${c.tint} border-2 border-on-background flex items-center justify-center`}>
                  <c.icon className="w-3.5 h-3.5" />
                </span>
                {c.label}
              </p>
              <p className="text-sm text-on-surface-variant leading-relaxed font-sans">{c.text}</p>
            </div>
          ))}
        </div>

        {/* Strengths / improvements */}
        {((speakingEvaluation.strengths?.length || 0) > 0 || (speakingEvaluation.improvements?.length || 0) > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(speakingEvaluation.strengths?.length || 0) > 0 && (
              <div className="bg-secondary-container/40 border-2 border-secondary rounded-xl p-4">
                <p className="text-xs font-black uppercase text-secondary mb-2 flex items-center gap-1.5"><ThumbsUp className="w-4 h-4" /> Сайн байгаа тал</p>
                <ul className="space-y-1.5">
                  {speakingEvaluation.strengths!.map((s, i) => (
                    <li key={i} className="text-sm text-on-surface font-medium flex items-start gap-2"><Check className="w-4 h-4 text-secondary shrink-0 mt-0.5" />{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {(speakingEvaluation.improvements?.length || 0) > 0 && (
              <div className="bg-error-container/40 border-2 border-error rounded-xl p-4">
                <p className="text-xs font-black uppercase text-error mb-2 flex items-center gap-1.5"><Target className="w-4 h-4" /> Сайжруулах зүйл</p>
                <ul className="space-y-1.5">
                  {speakingEvaluation.improvements!.map((s, i) => (
                    <li key={i} className="text-sm text-on-surface font-medium flex items-start gap-2"><ArrowRight className="w-4 h-4 text-error shrink-0 mt-0.5" />{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => speakGerman(target)}
            className="px-4 py-2 bg-surface border-2 border-on-background rounded-lg text-xs font-bold text-primary hover:bg-surface-container transition-colors font-space flex items-center gap-2 block-shadow cursor-pointer"
          >
            <Volume2 className="w-4 h-4" /> Загвар дуудлага сонсох
          </button>
          <button
            onClick={() => toggleMic(target)}
            disabled={isRecording || speakingLoading}
            className="px-4 py-2 bg-secondary border-2 border-on-background rounded-lg text-xs font-bold text-white hover:scale-[1.02] transition-transform font-space flex items-center gap-2 block-shadow cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" /> Дахин бичих
          </button>
        </div>
      </div>
    )
  );

  // ---------------------------------------------------------------------------
  // Shared AI writing checker. Reused by the writing library AND every exam
  // writing task, so importing new writing resources gets the AI check
  // automatically. `text` is the learner's input; `ctx` is the active item.
  // ---------------------------------------------------------------------------
  const renderWritingChecker = (
    text: string,
    ctx: { prompt: string; points: string[]; modelAnswer: string; level: string },
  ) => !aiUsable ? renderPlanLockCard(
    'AI бичгийн засвар',
    aiLockDesc('Бичсэн зохиолын AI үнэлгээ, засвар, оноо'),
    'max',
  ) : (
    <>
      <div className="mt-4">
        {renderAiTeaserBanner()}
        <button
          onClick={() => checkComposition(text, ctx)}
          disabled={!text.trim() || writeFeedbackLoading}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary border-2 border-on-background rounded-lg font-bold text-sm cursor-pointer block-shadow hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4" /> {writeFeedbackLoading ? 'AI шалгаж байна...' : 'AI-аар шалгуулах'}
        </button>
      </div>
      {renderCompositionReport()}
    </>
  );

  const renderCompositionReport = () => (
    !writeFeedback ? null : (
      <div className="w-full flex flex-col gap-4 mt-5 animate-scale-up">

        {/* Headline + summary */}
        <div className="w-full border-2 border-on-background rounded-xl p-6 flex items-start gap-4 shadow-sm block-shadow">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center border-2 border-on-background shrink-0 block-shadow ${
            writeFeedback.isCorrect ? 'bg-secondary-container' : 'bg-error-container'
          }`}>
            {writeFeedback.isCorrect ? <CheckCircle className="w-5 h-5 text-secondary" /> : <AlertCircle className="w-5 h-5 text-error" />}
          </div>
          <div className="flex-grow">
            <h5 className="text-lg font-black text-on-surface mb-1 font-sans">{writeFeedback.feedbackMessage}</h5>
            <p className="text-sm text-on-surface-variant leading-relaxed font-sans">{writeFeedback.analysis}</p>
          </div>
        </div>

        {/* Score row (only when the AI returned numeric scores) */}
        {typeof writeFeedback.overallScore === 'number' && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Нийт оноо', value: writeFeedback.overallScore, icon: Target },
              { label: 'Дүрэм', value: writeFeedback.grammarScore, icon: SpellCheck },
              { label: 'Үгсийн сан', value: writeFeedback.vocabularyScore, icon: BookOpen },
            ].filter((s) => typeof s.value === 'number').map((s, i) => {
              const v = s.value as number;
              const tone = v >= 75 ? 'text-secondary' : v >= 50 ? 'text-amber-600' : 'text-error';
              const barTone = v >= 75 ? 'bg-secondary' : v >= 50 ? 'bg-amber-500' : 'bg-error';
              return (
                <div key={i} className="border-2 border-on-background rounded-xl p-4 block-shadow flex flex-col items-center text-center">
                  <s.icon className={`w-5 h-5 mb-1 ${tone}`} />
                  <span className={`text-3xl font-black font-space ${tone}`}>{v}</span>
                  <span className="text-[10px] font-bold uppercase text-outline tracking-wide mt-0.5">{s.label}</span>
                  <div className="w-full h-1.5 bg-surface-container-high rounded-full mt-2 overflow-hidden">
                    <div className={`h-full ${barTone} rounded-full transition-all`} style={{ width: `${v}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* What you wrote vs the corrected version */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {writeFeedbackText && (
            <div className="bg-surface-container-low border-2 border-on-background rounded-xl p-4 block-shadow">
              <p className="text-[11px] font-space font-bold uppercase text-outline mb-1 flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5" /> Таны бичсэн нь
              </p>
              <p className="text-sm text-on-surface font-sans whitespace-pre-line leading-relaxed">{writeFeedbackText}</p>
            </div>
          )}
          {writeFeedback.corrected && (
            <div className="bg-secondary-container/30 border-2 border-secondary rounded-xl p-4 block-shadow">
              <p className="text-[11px] font-space font-bold uppercase text-secondary mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Засаж сайжруулсан хувилбар
              </p>
              <p className="text-sm text-on-surface font-medium font-sans whitespace-pre-line leading-relaxed">{writeFeedback.corrected}</p>
            </div>
          )}
        </div>

        {/* Specific corrections — wrong grammar / wrong word → better wording */}
        {(writeFeedback.corrections?.length || 0) > 0 && (
          <div className="border-2 border-on-background rounded-xl p-4 block-shadow">
            <p className="text-xs font-black uppercase text-on-surface mb-3 flex items-center gap-1.5">
              <SpellCheck className="w-4 h-4 text-primary" /> Засварууд ({writeFeedback.corrections!.length})
            </p>
            <div className="flex flex-col gap-2.5">
              {writeFeedback.corrections!.map((c, i) => (
                <div key={i} className="border-2 border-on-background rounded-lg p-3 bg-surface-container-low">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="text-sm font-bold text-error line-through font-mono">{c.original}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-outline shrink-0" />
                    <span className="text-sm font-bold text-secondary font-mono">{c.suggestion}</span>
                    <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-container border border-on-background text-on-surface">{c.type}</span>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">{c.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grammar / vocabulary summary cards */}
        {(writeFeedback.grammarFeedback || writeFeedback.vocabularyFeedback) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { label: 'Дүрэм', text: writeFeedback.grammarFeedback, icon: SpellCheck, tint: 'bg-error-container' },
              { label: 'Үгсийн сан', text: writeFeedback.vocabularyFeedback, icon: BookOpen, tint: 'bg-primary-container' },
            ].filter((c) => c.text).map((c, i) => (
              <div key={i} className="border-2 border-on-background rounded-xl p-4 block-shadow">
                <p className="text-xs font-black uppercase text-on-surface mb-1.5 flex items-center gap-1.5">
                  <span className={`w-6 h-6 rounded-full ${c.tint} border-2 border-on-background flex items-center justify-center`}>
                    <c.icon className="w-3.5 h-3.5" />
                  </span>
                  {c.label}
                </p>
                <p className="text-sm text-on-surface-variant leading-relaxed font-sans">{c.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* Strengths / improvements */}
        {((writeFeedback.strengths?.length || 0) > 0 || (writeFeedback.improvements?.length || 0) > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(writeFeedback.strengths?.length || 0) > 0 && (
              <div className="bg-secondary-container/40 border-2 border-secondary rounded-xl p-4">
                <p className="text-xs font-black uppercase text-secondary mb-2 flex items-center gap-1.5"><ThumbsUp className="w-4 h-4" /> Сайн байгаа тал</p>
                <ul className="space-y-1.5">
                  {writeFeedback.strengths!.map((s, i) => (
                    <li key={i} className="text-sm text-on-surface font-medium flex items-start gap-2"><Check className="w-4 h-4 text-secondary shrink-0 mt-0.5" />{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {(writeFeedback.improvements?.length || 0) > 0 && (
              <div className="bg-error-container/40 border-2 border-error rounded-xl p-4">
                <p className="text-xs font-black uppercase text-error mb-2 flex items-center gap-1.5"><Target className="w-4 h-4" /> Сайжруулах зүйл</p>
                <ul className="space-y-1.5">
                  {writeFeedback.improvements!.map((s, i) => (
                    <li key={i} className="text-sm text-on-surface font-medium flex items-start gap-2"><ArrowRight className="w-4 h-4 text-error shrink-0 mt-0.5" />{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    )
  );

  // While Firebase is checking for a saved session, show a brief loading screen
  // so we don't flash the login page at an already-signed-in user.
  if (authLoading) {
    return (
      <div className="bg-background text-white font-sans min-h-screen flex flex-col justify-center items-center gap-4">
        <h1 className="text-3xl font-black font-space tracking-tight flex items-center gap-3">
          <BrandLogo className="w-9 h-9" />
          <span><span className="text-primary">Vivid</span> Lingua</span>
        </h1>
        <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    // Invite links (duel / referral) jump straight to signup. Otherwise show
    // the marketing landing page first, and only swap in the auth screen once
    // the visitor chooses to log in or sign up.
    if (showAuth || inviteContext) {
      return (
        <LoginScreen
          inviteContext={inviteContext ?? undefined}
          onBack={inviteContext ? undefined : () => setShowAuth(false)}
        />
      );
    }
    return (
      <LandingPage
        onGetStarted={() => { if (!isTest) track('signup_click'); setShowAuth(true); }}
        onLogin={() => setShowAuth(true)}
        onTryGuest={startGuest}
      />
    );
  }

  if (currentUser && !currentUser.onboardingDone) {
    return (
      <OnboardingWizard
        userName={currentUser.name}
        onComplete={(data) => {
          applyMetricProfile({
            ...currentUser,
            onboardingDone: true,
            learningGoal: data.goal,
            targetLevel: data.level,
            dailyGoalMinutes: data.dailyGoalMinutes,
          });
        }}
      />
    );
  }

  // Шинэ хэрэглэгч onboarding дуусмагц түвшин тогтоох тест өгнө; бусад үед
  // Шалгалт табын картаар дахин нээж болно. Үр дүн нээгдсэн (төлбөртэй/founder)
  // үед л targetLevel-ийг тестийн түвшнээр шинэчилнэ.
  if (currentUser && (currentUser.placementPending || placementOpen)) {
    return (
      <PlacementTest
        isFounder={isFounderEmail(currentUser.email)}
        evalCredits={currentUser.placementCredits ?? 0}
        onFinish={(record) => {
          setPlacementOpen(false);
          // The CEFR result is given + assigned automatically; content gating
          // (Free = A1 only) still locks higher-level lessons until upgrade.
          applyMetricProfile({
            ...currentUser,
            ...placementProfilePatch(record),
          });
        }}
        onSkip={() => {
          setPlacementOpen(false);
          if (currentUser.placementPending) {
            applyMetricProfile({ ...currentUser, placementPending: false });
          }
        }}
      />
    );
  }

  return (
    <div className="bg-background text-white font-sans min-h-screen flex flex-col md:flex-row relative overflow-x-hidden">

      {/* Зочин горим — явцаа хадгалахын тулд бүртгүүлэх уриалга (бусад дэлгэцийг хаахгүй, хөвдөг) */}
      {currentUser?.isGuest && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[120] w-[calc(100%-2rem)] max-w-md animate-fade-in">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface/95 backdrop-blur-md border border-primary/40 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
            <Sparkles className="w-5 h-5 text-amber-300 flex-shrink-0" />
            <p className="text-xs md:text-sm font-semibold text-slate-200 flex-grow">
              Зочин горимоор үзэж байна. Явцаа хадгалж, бүх түвшин нээхийн тулд бүртгүүлээрэй.
            </p>
            <button
              onClick={exitGuestToSignup}
              className="flex-shrink-0 px-4 py-2 rounded-xl bg-primary hover:bg-surface-tint text-on-primary text-xs md:text-sm font-bold border border-primary/40 transition-all cursor-pointer"
            >
              Бүртгүүлэх
            </button>
          </div>
        </div>
      )}

      {/* TestDaF бүрэн загвар шалгалт — бүрэн дэлгэц overlay (sidebar-аас дээгүүр) */}
      {testdafOpen && <TestDafExam onExit={() => setTestdafOpen(false)} />}

      {/* Тулааны урилгын pop-up — над руу challenge ирэхэд */}
      {incomingDuel && !activeDuel && (
        <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 animate-fade-in">
          <div className="bg-surface border border-primary/30 rounded-2xl p-6 max-w-sm w-full space-y-4 animate-scale-up text-on-surface shadow-[0_0_40px_rgba(0,0,0,0.5)]">
            <div className="flex flex-col items-center text-center gap-3">
              <span className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300">
                <Swords className="w-7 h-7" />
              </span>
              {incomingDuel.challenger?.avatar && (
                <img src={incomingDuel.challenger.avatar} alt="" className="w-12 h-12 rounded-full object-cover -mt-1" />
              )}
              <h3 className="text-xl font-black font-space">
                <span className="text-primary">
                  {incomingDuel.challenger?.name ?? 'Нэгэн суралцагч'}
                </span>{' '}
                таныг тулаанд уриалаа!
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                {incomingDuel.level} түвшний 10 асуултад өрсөлдөнө — ялагч <b className="text-teal-300">+1 Streak Freeze</b> авна.
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { markDuelChallengeSeen(incomingDuel.code); setIncomingDuel(null); }}
                className="flex-1 py-3 border border-white/10 hover:bg-white/5 rounded-xl font-bold transition-all text-slate-300 cursor-pointer"
              >
                Дараа
              </button>
              <button
                onClick={() => { markDuelChallengeSeen(incomingDuel.code); setActiveDuel(incomingDuel); setIncomingDuel(null); }}
                className="flex-[2] bg-primary text-on-primary font-bold rounded-xl py-3 px-4 hover:bg-surface-tint transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Swords className="w-4 h-4" /> Тоглох
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Тулаан (quiz duel) — бүрэн дэлгэц overlay */}
      {activeDuel && (
        <DuelScreen
          duel={activeDuel}
          onExit={(changed) => {
            setActiveDuel(null);
            if (changed) setSocialRefreshKey((k) => k + 1);
          }}
        />
      )}

      {/* Standalone Duolingo Core Quiz Overlay (Matches Screen 1 format explicitly) */}
      {coreLessonActive && (
        <div id="core-lesson-modal" className="fixed inset-0 bg-background z-100 flex flex-col items-center justify-between pb-8 pt-4 px-4 md:px-12 animate-fade-in text-white">
          {/* Atmospheric background glows in overlay */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-900/10 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-900/10 rounded-full blur-[120px] pointer-events-none"></div>
          
          {/* Top Header progress & close buttons */}
          <header className="w-full max-w-[800px] flex items-center gap-4 py-2 relative z-10">
            <button 
              id="close-lesson-btn"
              onClick={() => {
                setCoreLessonActive(false);
                setCoreLessonAnswer(null);
                setCoreLessonFeedback(null);
              }}
              className="w-12 h-12 flex items-center justify-center border border-white/10 rounded-full hover:bg-white/10 transition-all block-shadow bg-white/5 text-white cursor-pointer"
            >
              <span className="material-symbols-outlined text-xl font-bold">close</span>
            </button>
            <div className="flex-grow h-4 bg-white/5 border border-white/10 rounded-full overflow-hidden relative">
              <div 
                className="h-full bg-primary transition-all duration-500 relative"
                style={{ width: coreLessonStep === 1 ? '60%' : '100%' }}
              >
                <div className="absolute top-0 left-0 w-full h-[2px] bg-white/40"></div>
              </div>
            </div>
          </header>

          {/* Core Exercise Workspace */}
          {coreLessonStep === 1 ? (
            <main className="flex-grow w-full max-w-[800px] flex flex-col justify-between py-8 md:py-16">
              {/* Present German Word Display */}
              <div className="flex flex-col items-center justify-center flex-grow mb-12">
                <div className="flex items-center gap-6">
                  <h1 className="font-sans font-extrabold text-4xl md:text-5xl text-center tracking-tight text-on-background">
                    Guten Tag
                  </h1>
                  <button 
                    id="audio-prompt-btn"
                    onClick={() => speakGerman('Guten Tag')}
                    className="w-16 h-16 flex items-center justify-center bg-primary text-on-primary rounded-full border-2 border-on-background block-shadow hover:bg-surface-tint hover:scale-105 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-2xl fill">volume_up</span>
                  </button>
                </div>
              </div>

              {/* Choices Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {/* Option 1 */}
                <button 
                  onClick={() => !coreLessonFeedback && submitCoreLessonAnswer(0)}
                  disabled={coreLessonFeedback !== null}
                  className={`choice-card relative w-full text-left bg-white/5 border border-white/10 rounded-xl p-6 group transition-all block-shadow cursor-pointer ${
                    coreLessonAnswer === 0 && coreLessonFeedback === 'incorrect' ? 'bg-red-950/40 border-red-500 text-white opacity-100 shadow-[0_0_15px_rgba(239,68,68,0.2)]' :
                    coreLessonFeedback !== null ? 'opacity-40 cursor-not-allowed' : 'hover:border-amber-500/50 hover:bg-white/10'
                  }`}
                >
                  <span className="absolute top-4 right-4 border border-white/10 bg-white/5 px-2 py-1 rounded font-space text-[12px] font-bold text-slate-400 group-hover:border-amber-500/50 group-hover:text-amber-400">1</span>
                  <span className={`font-sans text-lg font-bold ${coreLessonAnswer === 0 && coreLessonFeedback === 'incorrect' ? 'text-red-300' : 'text-slate-200 group-hover:text-amber-300'}`}>Өглөөний мэнд</span>
                </button>

                {/* Option 2 (Correct) */}
                <button 
                  onClick={() => !coreLessonFeedback && submitCoreLessonAnswer(1)}
                  disabled={coreLessonFeedback !== null}
                  className={`choice-card relative w-full text-left rounded-xl p-6 group transition-all block-shadow cursor-pointer ${
                    coreLessonAnswer === 1 && coreLessonFeedback === 'correct' ? 'bg-amber-950/40 border-amber-500 text-amber-200 opacity-100 shadow-[0_0_15px_rgba(230,184,92,0.32)]' :
                    coreLessonFeedback === 'incorrect' ? 'bg-amber-950/20 border-dashed border-amber-500/40 opacity-100' : 
                    coreLessonFeedback !== null ? 'opacity-40 cursor-not-allowed' : 'bg-white/5 border border-white/10 hover:border-amber-500/50'
                  }`}
                >
                  <span className="absolute top-4 right-4 border border-white/10 bg-white/5 px-2 py-1 rounded font-space text-[12px] font-bold text-slate-400 group-hover:border-amber-500/50 group-hover:text-amber-400">2</span>
                  <span className={`font-sans text-lg font-bold ${coreLessonAnswer === 1 && coreLessonFeedback === 'correct' ? 'text-amber-200' : 'text-slate-200 group-hover:text-amber-300'}`}>Өдрийн мэнд</span>
                </button>

                {/* Option 3 */}
                <button 
                  onClick={() => !coreLessonFeedback && submitCoreLessonAnswer(2)}
                  disabled={coreLessonFeedback !== null}
                  className={`choice-card relative w-full text-left bg-white/5 border border-white/10 rounded-xl p-6 group transition-all block-shadow cursor-pointer ${
                    coreLessonAnswer === 2 && coreLessonFeedback === 'incorrect' ? 'bg-red-950/40 border-red-500 text-white opacity-100 shadow-[0_0_15px_rgba(239,68,68,0.2)]' :
                    coreLessonFeedback !== null ? 'opacity-40 cursor-not-allowed' : 'hover:border-amber-500/50 hover:bg-white/10'
                  }`}
                >
                  <span className="absolute top-4 right-4 border border-white/10 bg-white/5 px-2 py-1 rounded font-space text-[12px] font-bold text-slate-400 group-hover:border-amber-500/50 group-hover:text-amber-400">3</span>
                  <span className={`font-sans text-lg font-bold ${coreLessonAnswer === 2 && coreLessonFeedback === 'incorrect' ? 'text-red-300' : 'text-slate-200 group-hover:text-amber-300'}`}>Баяртай</span>
                </button>

                {/* Option 4 */}
                <button 
                  onClick={() => !coreLessonFeedback && submitCoreLessonAnswer(3)}
                  disabled={coreLessonFeedback !== null}
                  className={`choice-card relative w-full text-left bg-white/5 border border-white/10 rounded-xl p-6 group transition-all block-shadow cursor-pointer ${
                    coreLessonAnswer === 3 && coreLessonFeedback === 'incorrect' ? 'bg-red-950/40 border-red-500 text-white opacity-100 shadow-[0_0_15px_rgba(239,68,68,0.2)]' :
                    coreLessonFeedback !== null ? 'opacity-40 cursor-not-allowed' : 'hover:border-amber-500/50 hover:bg-white/10'
                  }`}
                >
                  <span className="absolute top-4 right-4 border border-white/10 bg-white/5 px-2 py-1 rounded font-space text-[12px] font-bold text-slate-400 group-hover:border-amber-500/50 group-hover:text-amber-400">4</span>
                  <span className={`font-sans text-lg font-bold ${coreLessonAnswer === 3 && coreLessonFeedback === 'incorrect' ? 'text-red-300' : 'text-slate-200 group-hover:text-amber-300'}`}>Сайн байна уу</span>
                </button>
              </div>
            </main>
          ) : (
            // Core Lesson Completed Screen
            <div className="flex-grow w-full max-w-[800px] flex flex-col items-center justify-center p-8 text-center my-auto transition-all animate-scale-up">
              <div className="w-24 h-24 rounded-full bg-secondary-container flex items-center justify-center border-4 border-on-background block-shadow-green mb-8">
                <span className="material-symbols-outlined text-4xl text-on-secondary-container font-black fill">trophy</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-on-background mb-4">Хичээл Амжилттай Дууслаа!</h2>
              <p className="text-body-lg text-on-surface-variant max-w-md mb-8">
                Баяр хүргэе! Та өнөөдрийн quick-lesson даалгаврыг амжилттай дуусгаж, Германы суурь мэндийг цээжиллээ.
              </p>
              <div className="border-2 border-on-background rounded-xl p-6 max-w-sm block-shadow w-full flex justify-around items-center">
                <div>
                  <p className="text-[12px] font-space text-outline font-bold uppercase">Streak</p>
                  <p className="text-2xl font-black text-secondary flex items-center justify-center gap-1">
                    <Flame className="w-6 h-6 text-orange-500 fill-orange-500" /> {streak} өдөр
                  </p>
                </div>
                <div className="w-[1px] h-10 bg-outline-variant"></div>
                <div>
                  <p className="text-[12px] font-space text-outline font-bold uppercase">Прогресс</p>
                  <p className="text-2xl font-black text-primary flex items-center justify-center gap-1">
                    <CheckCircle className="w-6 h-6 text-secondary fill-secondary-container" /> {lessonProgress}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Slider Toast Bottom Panel */}
          {coreLessonFeedback && (
            <div className={`w-full max-w-[800px] p-6 border-4 border-on-background rounded-2xl flex flex-col sm:flex-row justify-between items-center shadow-[0_-8px_24px_rgba(0,0,0,0.1)] gap-4 transition-all duration-300 ${
              coreLessonFeedback === 'correct' 
                ? 'bg-secondary-container text-on-secondary-fixed border-on-secondary-container shadow-secondary/15' 
                : 'bg-error-container text-on-error-container border-on-error-container shadow-error/15'
            }`}>
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-4xl fill">
                  {coreLessonFeedback === 'correct' ? 'check_circle' : 'cancel'}
                </span>
                <div>
                  <h3 className="text-xl font-black font-sans">
                    {coreLessonFeedback === 'correct' ? 'Зөв байна! Сүрхий!' : 'Өө, буруу даралт!'}
                  </h3>
                  <p className="text-[14px]">
                    {coreLessonFeedback === 'correct' ? '"Guten Tag" нь өдрийн мэндийг илэрхийлдэг.' : 'Хариулт 2 ("Өдрийн мэнд") нь зөв хувилбар байв.'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  if (coreLessonStep === 1) {
                    setCoreLessonStep(2);
                    setCoreLessonAnswer(null);
                    setCoreLessonFeedback(null);
                  } else {
                    // Close lesson overlay
                    setCoreLessonActive(false);
                    setCoreLessonStep(1);
                    setCoreLessonAnswer(null);
                    setCoreLessonFeedback(null);
                  }
                }}
                className={`px-8 py-3 font-sans font-bold text-[16px] rounded-xl border-2 border-on-background transition-all block-shadow w-full sm:w-auto cursor-pointer ${
                  coreLessonFeedback === 'correct' 
                    ? 'bg-secondary text-on-secondary hover:bg-on-secondary-fixed-variant' 
                    : 'bg-error text-on-error hover:bg-on-error-container'
                }`}
              >
                Үргэлжлүүлэх
              </button>
            </div>
          )}
        </div>
      )}

      {/* Shared Sidebar - Visible on Desktop only */}
      <nav aria-label="Desktop menu" className="hidden md:flex flex-col h-screen py-8 px-4 gap-y-6 bg-surface-container-lowest w-[280px] fixed left-0 top-0 text-on-surface border-r border-outline-variant select-none z-30 shadow-[4px_0_24px_rgba(0,0,0,0.6)]">
        <div>
          <h1 className="text-2xl font-black tracking-tight font-space flex items-center gap-2">
            <BrandLogo className="w-8 h-8" />
            <span><span className="text-primary">Vivid</span> Lingua</span>
          </h1>
        </div>

        {/* User Context Avatar Panel */}
        {currentUser ? (
          <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/10 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => selectTab('profile')}>
            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 border-amber-500/50">
              <img 
                alt="Profile" 
                className="w-full h-full object-cover bg-slate-800" 
                src={currentUser.avatar}
              />
            </div>
            <div className="overflow-hidden">
              <p className="text-[10px] font-black uppercase text-amber-400 tracking-wider flex items-center gap-1">
                <Target className="w-2.5 h-2.5" /> {currentUser.targetLevel} ТҮВШИН
              </p>
              <h2 className="text-[15px] font-extrabold truncate text-white leading-tight">{currentUser.name}</h2>
              <p className="text-[11px] text-slate-400 truncate leading-none mt-0.5">{currentUser.role}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border border-white/20 flex items-center justify-center bg-white/5 text-slate-400">
              <span className="material-symbols-outlined">account_circle</span>
            </div>
            <div>
              <p className="text-xs text-slate-400">Сайн байна уу?</p>
              <h2 className="text-[16px] font-bold">Нэвтрээгүй</h2>
            </div>
          </div>
        )}

        {/* Dynamic Streak Badge Card */}
        <div>
          <div className="bg-white/5 text-white text-[14px] font-bold rounded-xl px-4 py-3 flex items-center justify-between border border-white/10">
            <span className="flex items-center gap-2 text-amber-300">
              <Flame className="w-5 h-5 text-amber-400 fill-amber-400 animate-pulse" />
              Streak: {streak} өдөр
            </span>
            <span className="text-[11px] font-space bg-primary text-on-primary px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wide">AUTO</span>
          </div>
        </div>

        {/* Tabs Lists layout */}
        <ul className="flex flex-col gap-2 flex-grow mt-2 overflow-y-auto pr-1">
          {currentUser && (
            <li>
              <button 
                onClick={() => selectTab('profile')}
                className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 transition-all rounded-r-lg group cursor-pointer ${
                  activeTab === 'profile' 
                    ? 'text-on-primary border-l-4 border-secondary bg-white/15' 
                    : 'text-on-primary-container hover:text-secondary-fixed hover:bg-white/5'
                }`}
              >
                <Target className={`w-5 h-5 ${activeTab === 'profile' ? 'text-secondary-fixed' : ''}`} />
                <span className="text-[14px] font-bold">Хяналтын самбар</span>
              </button>
            </li>
          )}
          <li>
            <button 
              onClick={() => selectTab('read')}
              className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 transition-all rounded-r-lg group cursor-pointer ${
                activeTab === 'read' 
                  ? 'text-on-primary border-l-4 border-secondary bg-white/15' 
                  : 'text-on-primary-container hover:text-secondary-fixed hover:bg-white/5'
              }`}
            >
              <BookOpen className={`w-5 h-5 ${activeTab === 'read' ? 'text-secondary-fixed' : ''}`} />
              <span className="text-[14px] font-bold">Унших</span>
            </button>
          </li>
          <li>
            <button 
              onClick={() => selectTab('listen')}
              className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 transition-all rounded-r-lg group cursor-pointer ${
                activeTab === 'listen' 
                  ? 'text-on-primary border-l-4 border-secondary bg-white/15' 
                  : 'text-on-primary-container hover:text-secondary-fixed hover:bg-white/5'
              }`}
            >
              <Headphones className={`w-5 h-5 ${activeTab === 'listen' ? 'text-secondary-fixed' : ''}`} />
              <span className="text-[14px] font-bold">Сонсох</span>
            </button>
          </li>
          <li>
            <button 
              onClick={() => selectTab('speak')}
              className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 transition-all rounded-r-lg group cursor-pointer ${
                activeTab === 'speak' 
                  ? 'text-on-primary border-l-4 border-secondary bg-white/15' 
                  : 'text-on-primary-container hover:text-secondary-fixed hover:bg-white/5'
              }`}
            >
              <Mic className={`w-5 h-5 ${activeTab === 'speak' ? 'text-secondary-fixed' : ''}`} />
              <span className="text-[14px] font-bold">Ярих</span>
            </button>
          </li>
          <li>
            <button 
              onClick={() => selectTab('write')}
              className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 transition-all rounded-r-lg group cursor-pointer ${
                activeTab === 'write' 
                  ? 'text-on-primary border-l-4 border-secondary bg-white/15' 
                  : 'text-on-primary-container hover:text-secondary-fixed hover:bg-white/5'
              }`}
            >
              <Edit3 className={`w-5 h-5 ${activeTab === 'write' ? 'text-secondary-fixed' : ''}`} />
              <span className="text-[14px] font-bold">Бичих</span>
            </button>
          </li>
          <li>
            <button 
              onClick={() => selectTab('vocab')}
              className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 transition-all rounded-r-lg group cursor-pointer ${
                activeTab === 'vocab' 
                  ? 'text-on-primary border-l-4 border-secondary bg-white/15' 
                  : 'text-on-primary-container hover:text-secondary-fixed hover:bg-white/5'
              }`}
            >
              <Languages className={`w-5 h-5 ${activeTab === 'vocab' ? 'text-secondary-fixed' : ''}`} />
              <span className="text-[14px] font-bold flex-grow flex justify-between items-center pr-4">
                <span>Үгсийн сан</span>
                {dueCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-black font-space px-2 py-0.5 rounded-full">
                    {dueCount}
                  </span>
                )}
              </span>
            </button>
          </li>
          <li>
            <button 
              onClick={() => selectTab('translate')}
              className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 transition-all rounded-r-lg group cursor-pointer ${
                activeTab === 'translate' 
                  ? 'text-on-primary border-l-4 border-secondary bg-white/15' 
                  : 'text-on-primary-container hover:text-secondary-fixed hover:bg-white/5'
              }`}
            >
              <Sparkles className={`w-5 h-5 ${activeTab === 'translate' ? 'text-secondary-fixed text-amber-400' : ''}`} />
              <span className="text-[14px] font-bold">Орчуулагч</span>
            </button>
          </li>
          <li>
            <button 
              onClick={() => selectTab('exam')}
              className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 transition-all rounded-r-lg group cursor-pointer ${
                activeTab === 'exam' 
                  ? 'text-on-primary border-l-4 border-secondary bg-white/15' 
                  : 'text-on-primary-container hover:text-secondary-fixed hover:bg-white/5'
              }`}
            >
              <GraduationCap className={`w-5 h-5 ${activeTab === 'exam' ? 'text-secondary-fixed' : ''} text-amber-400`} />
              <span className="text-[14px] font-bold">Шалгалт</span>
            </button>
          </li>
          <li>
            <button
              onClick={() => selectTab('friends')}
              className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 transition-all rounded-r-lg group cursor-pointer ${
                activeTab === 'friends'
                  ? 'text-on-primary border-l-4 border-secondary bg-white/15'
                  : 'text-on-primary-container hover:text-secondary-fixed hover:bg-white/5'
              }`}
            >
              <Swords className={`w-5 h-5 ${activeTab === 'friends' ? 'text-secondary-fixed' : ''} text-amber-400`} />
              <span className="text-[14px] font-bold">Найзууд</span>
            </button>
          </li>
        </ul>

        {/* Sidebar Settings Footer */}
        <div className="border-t border-white/15 pt-4 flex flex-col gap-1">
          <button 
            onClick={() => selectTab('settings')}
            className={`flex items-center gap-3 py-2 px-4 rounded-lg font-bold text-left transition-colors cursor-pointer ${
              activeTab === 'settings' ? 'text-white bg-white/10' : 'text-on-primary-container hover:text-white hover:bg-white/5'
            }`}
          >
            <Settings className="w-4 h-4 text-outline" />
            <span className="text-sm">Тохиргоо</span>
          </button>
          {currentUser && (
            <button 
              onClick={logoutUser}
              className="flex items-center gap-3 py-2 px-4 rounded-lg font-bold text-left text-on-primary-container hover:text-error hover:bg-white/5 transition-colors cursor-pointer w-full"
            >
              <LogOut className="w-4 h-4 text-outline" />
              <span className="text-sm">Гарах</span>
            </button>
          )}
        </div>
      </nav>

      {/* Shared TopAppBar - Mobile Only */}
      <header className="md:hidden flex justify-between items-center w-full px-4 h-16 bg-surface border-b-2 border-on-background fixed top-0 left-0 z-40 shrink-0">
        <button 
          onClick={() => setMobileMenuOpen(prev => !prev)}
          className="text-primary p-2 border-2 border-on-background rounded-lg bg-surface-container-low hover:bg-surface shadow-[2px_2px_0_0_#3a352a] cursor-pointer"
        >
          <span className="material-symbols-outlined text-xl font-bold">menu</span>
        </button>
        <h1 className="text-xl font-black text-primary tracking-tight flex items-center gap-2">
          <BrandLogo className="w-6 h-6" />
          Vivid Lingua
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center p-2 text-secondary select-none">
            <Flame className="w-5 h-5 text-orange-500 fill-orange-500 animate-pulse" />
            <span className="text-xs font-black text-on-background ml-1">{streak}</span>
          </div>
          <div className="p-2 text-amber-500 select-none">
            <span className="material-symbols-outlined fill text-lg">military_tech</span>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Slide menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-45 md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div 
            className="w-[280px] h-full bg-primary py-8 px-4 flex flex-col gap-y-6 text-on-primary animate-slide-right relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-2">
              <h1 className="text-2xl font-black font-space flex items-center gap-2">
                <BrandLogo className="w-7 h-7" />
                Vivid Lingua
              </h1>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 cursor-pointer"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {currentUser ? (
              <div className="bg-white/5 p-3 rounded-xl border border-white/10 mx-2 flex gap-3 items-center cursor-pointer hover:bg-white/10" onClick={() => selectTab('profile')}>
                <div className="w-10 h-10 rounded-full overflow-hidden bg-white/20 border border-amber-500/50 flex-shrink-0">
                  <img alt="User" className="w-full h-full object-cover" src={currentUser.avatar} />
                </div>
                <div className="overflow-hidden">
                  <h3 className="text-sm font-bold truncate text-white leading-tight">{currentUser.name}</h3>
                  <p className="text-[10px] text-amber-300 font-bold truncate leading-none mt-0.5">{currentUser.role}</p>
                </div>
              </div>
            ) : (
              <div className="bg-white/5 p-3 rounded-xl border border-white/10 mx-2 flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-slate-400">
                  <span className="material-symbols-outlined">account_circle</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Нэвтрээгүй</h3>
                  <p className="text-[10px] text-slate-400">Сайн байна уу?</p>
                </div>
              </div>
            )}

            <ul className="flex flex-col gap-2 mt-4 flex-grow px-2 overflow-y-auto">
              {currentUser && (
                <li>
                  <button 
                    onClick={() => selectTab('profile')}
                    className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 rounded-xl cursor-pointer ${activeTab === 'profile' ? 'bg-white/15' : 'text-on-primary-container'}`}
                  >
                    <Target className="w-5 h-5" />
                    <span>Хяналтын самбар</span>
                  </button>
                </li>
              )}
              <li>
                <button 
                  onClick={() => selectTab('read')}
                  className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 rounded-xl cursor-pointer ${activeTab === 'read' ? 'bg-white/15' : 'text-on-primary-container'}`}
                >
                  <BookOpen className="w-5 h-5" />
                  <span>Унших</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => selectTab('listen')}
                  className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 rounded-xl cursor-pointer ${activeTab === 'listen' ? 'bg-white/15' : 'text-on-primary-container'}`}
                >
                  <Headphones className="w-5 h-5" />
                  <span>Сонсох</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => selectTab('speak')}
                  className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 rounded-xl cursor-pointer ${activeTab === 'speak' ? 'bg-white/15' : 'text-on-primary-container'}`}
                >
                  <Mic className="w-5 h-5" />
                  <span>Ярих</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => selectTab('write')}
                  className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 rounded-xl cursor-pointer ${activeTab === 'write' ? 'bg-white/15' : 'text-on-primary-container'}`}
                >
                  <Edit3 className="w-5 h-5" />
                  <span>Бичих</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => selectTab('vocab')}
                  className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 rounded-xl cursor-pointer ${activeTab === 'vocab' ? 'bg-white/15' : 'text-on-primary-container'}`}
                >
                  <Languages className="w-5 h-5" />
                  <span className="flex-grow flex justify-between items-center pr-4">
                    <span>Үгсийн сан</span>
                    {dueCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-black font-space px-2 py-0.5 rounded-full">
                        {dueCount}
                      </span>
                    )}
                  </span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => selectTab('translate')}
                  className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 rounded-xl cursor-pointer ${activeTab === 'translate' ? 'bg-white/15' : 'text-on-primary-container'}`}
                >
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <span>Орчуулагч</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => selectTab('exam')}
                  className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 rounded-xl cursor-pointer ${activeTab === 'exam' ? 'bg-white/15' : 'text-on-primary-container'}`}
                >
                  <GraduationCap className="w-5 h-5 text-amber-400" />
                  <span>Шалгалт</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => selectTab('friends')}
                  className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 rounded-xl cursor-pointer ${activeTab === 'friends' ? 'bg-white/15' : 'text-on-primary-container'}`}
                >
                  <Swords className="w-5 h-5 text-amber-400" />
                  <span>Найзууд</span>
                </button>
              </li>
            </ul>

            <div className="border-t border-white/10 pt-4 px-2 flex flex-col gap-1 shrink-0">
              <button 
                onClick={() => selectTab('settings')}
                className="flex items-center gap-3 py-2 w-full text-left text-on-primary-container hover:text-white"
              >
                <Settings className="w-4 h-4" />
                <span>Тохиргоо</span>
              </button>
              {currentUser && (
                <button 
                  onClick={() => {
                    logoutUser();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 py-2 w-full text-left text-on-primary-container hover:text-error cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-outline" />
                  <span>Гарах</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Frame */}
      <main className="flex-grow md:ml-[280px] px-4 md:px-8 flex flex-col justify-between pt-24 md:pt-8 w-full min-h-screen relative overflow-x-hidden max-lg:overflow-y-auto max-lg:overscroll-y-contain lg:overflow-hidden bg-background">
        {/* Ambient neon flares */}
        <div className="absolute top-10 left-10 w-96 h-96 bg-amber-900/15 rounded-full blur-[140px] pointer-events-none"></div>
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-teal-900/10 rounded-full blur-[140px] pointer-events-none"></div>

        <div className="w-full max-w-[1200px] mx-auto flex flex-col h-full relative z-10">

          {/* Unified Lesson Progress Bar - Screen 2/3 style */}
          {activeTab !== 'settings' && activeTab !== 'profile' && activeTab !== 'friends' && (
            <div className="w-full mb-8 flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 block-shadow">
              <div className="h-4 flex-grow bg-white/5 border border-white/10 rounded-full overflow-hidden relative shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div 
                  className="h-full bg-primary transition-all duration-300 rounded-full relative" 
                  style={{ width: `${lessonProgress}%` }}
                >
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-white/35"></div>
                </div>
              </div>
              <span className="text-xs font-space font-bold bg-primary text-on-primary px-4 py-1.5 rounded-full border border-white/20 shadow-[0_0_15px_rgba(230,184,92,0.28)]">
                {lessonProgress}% дууссан
              </span>
            </div>
          )}

          {/* Render Active View Modules */}

          {/* Tab 0: Профайл / Хяналтын самбар */}
          {activeTab === 'profile' && (
            <ProfileTab
              authLoading={authLoading}
              brokenStreakNotice={brokenStreakNotice}
              setBrokenStreakNotice={setBrokenStreakNotice}
              completedActivityIds={completedActivityIds}
              currentUser={currentUser}
              lessonProgress={lessonProgress}
              logoutUser={logoutUser}
              selectTab={selectTab}
              startActivity={startActivity}
              streak={streak}
              studyDays={studyDays}
              TRAINER_WORDS={TRAINER_WORDS}
              TRACKABLE_ACTIVITY_TOTAL={TRACKABLE_ACTIVITY_TOTAL}
              billingCard={
                <BillingCard
                  currentUser={currentUser}
                  billingInterval={billingInterval}
                  setBillingInterval={setBillingInterval}
                  bylCheckout={bylCheckout}
                  setBylCheckout={setBylCheckout}
                  checkBylPaymentStatus={checkBylPaymentStatus}
                  dummyInvoice={dummyInvoice}
                  payDummyInvoice={payDummyInvoice}
                  manualPromoCode={manualPromoCode}
                  setManualPromoCode={setManualPromoCode}
                  manualPromoError={manualPromoError}
                  manualPromoLoading={manualPromoLoading}
                  handleRedeemManualPromo={handleRedeemManualPromo}
                  myPromo={myPromo}
                  paymentActionLoading={paymentActionLoading}
                  paymentMessage={paymentMessage}
                  setPaymentMessage={setPaymentMessage}
                  paymentMethods={paymentMethods}
                  paymentMethodsLoading={paymentMethodsLoading}
                  paymentStatusLoading={paymentStatusLoading}
                  startCheckout={startCheckout}
                  founderAccess={founderAccess}
                  userPlan={userPlan}
                />
              }
            />
          )}

          {/* Tab: Найзууд — тулаан, найз урих, долоо хоногийн самбар, badges */}
          {activeTab === 'friends' && currentUser && (
            <div className="w-full pb-24 animate-fade-in">
              <SocialSection
                targetLevel={currentUser.targetLevel}
                onPlayDuel={(duel) => setActiveDuel(duel)}
                refreshKey={socialRefreshKey}
              />
            </div>
          )}

          {/* Tab 1: Унших (Reading) - Screen 3 layout */}
          {activeTab === 'read' && (
            <div className="w-full pb-24">


              {/* LIBRARY browser — 50+ readings */}
              {(() => {
                const filtered = libReadLevel === 'all' ? READING_LIBRARY : READING_LIBRARY.filter(r => r.level === libReadLevel);
                const item = READING_LIBRARY.find(r => r.id === libReadId) || READING_LIBRARY[0];
                // Multi-question set: per-item questions get a stable per-question shuffle
                // so the correct answer position can't be gamed ("always B").
                const questions = getReadingQuestions(item).map((qq, qi) => shuffleQuiz(`read:${item.id}:${qi}`, qq));
                const qIdx = Math.min(libReadQIdx, questions.length - 1);
                const q = questions[qIdx];
                const qAnswer = libReadAnswers[qIdx] ?? null;
                const idxInFiltered = filtered.findIndex(r => r.id === item.id);
                const openReadItem = (next: ReadingItem) => { setLibReadId(next.id); setLibReadQIdx(0); setLibReadAnswers({}); setLibReadTrans(readTranslateEnabled); };
                return (
                  <>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* List of readings */}
                    <aside className="lg:col-span-4 border-2 border-on-background rounded-xl p-4 block-shadow">
                      <div className="flex gap-1 mb-3">
                        {LIB_LEVELS.map(lv => (
                          <button key={lv} onClick={() => setLibReadLevel(lv)}
                            className={`flex-1 py-1.5 rounded-lg border-2 border-on-background text-xs font-bold cursor-pointer transition-colors ${libReadLevel === lv ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                            {lv === 'all' ? 'Бүгд' : lv}
                          </button>
                        ))}
                      </div>
                      <div className="nested-scroll flex flex-col gap-2 max-h-[55vh] max-lg:h-[45vh] max-lg:max-h-[45vh] pr-1">
                        {filtered.map(r => {
                          const isLocked = (lockedActivityIds.read.has(r.id) && r.level === currentUser?.targetLevel) || isLessonLocked(currentUser, r.level);
                          return (
                            <button key={r.id} onClick={() => openReadItem(r)}
                              className={`text-left p-2.5 rounded-lg border-2 border-on-background cursor-pointer transition-colors ${r.id === libReadId ? 'bg-secondary-container' : 'bg-surface-container hover:bg-surface-container-high'}`}>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-secondary text-white shrink-0">{r.level}</span>
                                <span className="text-xs font-bold text-on-surface truncate flex items-center gap-1.5">
                                  {isLocked && <span>🔒</span>}
                                  {r.titleMn}
                                </span>
                              </div>
                              <p className="text-[10px] text-on-surface-variant mt-0.5 truncate">{r.title} · {r.topic}</p>
                            </button>
                          );
                        })}
                      </div>
                    </aside>

                    {/* Reader */}
                    <section className="lg:col-span-8 border-2 border-on-background rounded-xl p-6 md:p-8 block-shadow text-on-surface">
                      {isLessonLocked(currentUser, item.level) ? renderPlanLockCard('Энэ хичээл Pro багцад нээлттэй', item.level + ' түвшний хичээлүүд үнэгүй эрхэд хаалттай. Үнэгүй эрхээр A1 түвшний бүх хичээл, үгийн сан нээлттэй.', 'pro') : lockedActivityIds.read.has(item.id) && item.level === currentUser?.targetLevel ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                          <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant">
                            <Shield className="w-8 h-8" />
                          </div>
                          <h2 className="text-xl font-bold text-on-surface">🔒 Энэ дасгал түгжигдсэн байна</h2>
                          <p className="text-sm text-on-surface-variant max-w-sm font-sans font-medium">
                            Шалгалт өгөх эсвэл өмнөх хэсгийг дуусгаж нээнэ үү.
                          </p>
                          <button 
                            onClick={() => selectTab('profile')}
                            className="px-5 py-2.5 bg-primary text-on-primary font-bold rounded-xl text-sm hover:bg-surface-tint transition-all shadow-md cursor-pointer font-space"
                          >
                            Сургалтын зам руу очих
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-space font-bold text-secondary bg-secondary-container border border-on-background px-3 py-1.5 rounded-full">{item.level} · {item.topic}</span>
                            <div className="flex gap-2">
                              <button onClick={() => speakGerman(item.text, audioSpeed === '0.8' ? 0.8 : 1.0)} title="Сонсох"
                                className="p-2 border-2 border-on-background rounded-full bg-surface-container hover:scale-105 transition-transform text-on-surface block-shadow cursor-pointer">
                                <Volume2 className="w-5 h-5" />
                              </button>
                              <button onClick={() => setLibReadTrans(v => !v)}
                                className={`px-3 py-1 border-2 border-on-background rounded-full font-bold text-xs block-shadow cursor-pointer hover:scale-105 transition-transform flex items-center gap-1 ${libReadTrans ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface'}`}>
                                <Languages className="w-4 h-4" /> {libReadTrans ? 'Нуух' : 'Орчуулга'}
                              </button>
                            </div>
                          </div>

                          <h2 className="text-2xl md:text-3xl font-extrabold text-on-surface mb-1 tracking-tight">{item.title}</h2>
                          <p className="text-sm text-on-surface-variant mb-5">{item.titleMn}</p>

                          <p className="text-lg leading-relaxed text-on-surface whitespace-pre-line font-medium">{renderRichGerman(item.text)}</p>
                          {libReadTrans && (
                            <p className="text-sm leading-relaxed text-on-surface-variant whitespace-pre-line mt-4 pt-4 border-t border-outline-variant/50 italic">{item.translation}</p>
                          )}

                          {/* Comprehension questions — multi-question set with prev/next */}
                          <div className="mt-6 pt-5 border-t border-outline-variant">
                            <p className="text-xs font-space font-bold uppercase text-primary mb-2">Ойлголт шалгах · Асуулт {qIdx + 1}/{questions.length}:</p>
                            <p className="text-base font-bold text-on-surface mb-3">{q.question}</p>
                            <div className="mb-4 flex flex-wrap gap-2">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-container border-2 border-on-background text-xs font-semibold rounded-full font-space block-shadow text-on-surface">
                                <Lightbulb className="w-4 h-4 text-orange-500 fill-orange-500" />
                                {q.hint ?? 'Санамж: тодруулсан үг дээр дарж утга, дуудлагыг нь үзээрэй.'}
                              </span>
                            </div>
                            <MCQBlock
                              choices={q.choices}
                              correctIndex={q.correctIndex}
                              selectedAnswer={qAnswer}
                              feedbackText={q.explanation}
                              onSelect={(index) => {
                                const nextAnswers = { ...libReadAnswers, [qIdx]: index };
                                setLibReadAnswers(nextAnswers);
                                const actId = activityKey('library:read', item.id);
                                const profile = currentUserRef.current;
                                if (index === q.correctIndex) {
                                  // The activity counts as done once EVERY question is answered correctly.
                                  const allCorrect = questions.every((qq, i) => nextAnswers[i] === qq.correctIndex);
                                  if (allCorrect) {
                                    recordStudyActivity(actId);
                                    if (profile && profile.mistakeIds?.includes(actId)) {
                                      applyMetricProfile({
                                        ...profile,
                                        mistakeIds: clearMistake(profile.mistakeIds, actId),
                                      });
                                    }
                                  }
                                } else if (profile) {
                                  applyMetricProfile({
                                    ...profile,
                                    mistakeIds: addMistake(profile.mistakeIds, actId),
                                  });
                                }
                              }}
                            />
                            {qAnswer !== null && qAnswer !== q.correctIndex && (
                              <>
                                <button
                                  onClick={() => { const na = { ...libReadAnswers }; delete na[qIdx]; setLibReadAnswers(na); }}
                                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-surface-container text-on-surface border-2 border-on-background rounded-lg font-bold text-xs font-space cursor-pointer block-shadow hover:scale-[1.02] transition-transform">
                                  <RotateCcw className="w-3.5 h-3.5" /> Дахин оролдох
                                </button>
                                <GrammarTipCard
                                  correctAnswer={q.choices[q.correctIndex]}
                                  explanation={q.explanation}
                                  germanContext={item.text}
                                  level={item.level}
                                />
                              </>
                            )}
                            <QuizNav
                              qIdx={qIdx}
                              total={questions.length}
                              answered={qAnswer !== null}
                              onPrev={() => setLibReadQIdx(Math.max(0, qIdx - 1))}
                              onNext={() => {
                                if (qIdx < questions.length - 1) setLibReadQIdx(qIdx + 1);
                                else if (filtered.length > 0) openReadItem(filtered[(Math.max(idxInFiltered, 0) + 1) % filtered.length]);
                              }}
                              nextLessonLabel={qIdx === questions.length - 1}
                            />
                          </div>

                          {/* Prev/next lesson */}
                          {idxInFiltered >= 0 && filtered.length > 1 && (
                            <div className="flex items-center justify-between mt-6 pt-4 border-t border-outline-variant">
                              <button onClick={() => openReadItem(filtered[(idxInFiltered - 1 + filtered.length) % filtered.length])}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-on-background bg-surface-container text-on-surface font-bold text-xs font-space cursor-pointer block-shadow hover:scale-[1.02] transition-transform">
                                <ArrowLeft className="w-3.5 h-3.5" /> Өмнөх хичээл
                              </button>
                              <span className="text-[11px] font-space font-bold text-on-surface-variant">{idxInFiltered + 1} / {filtered.length}</span>
                              <button onClick={() => openReadItem(filtered[(idxInFiltered + 1) % filtered.length])}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-on-background bg-surface-container text-on-surface font-bold text-xs font-space cursor-pointer block-shadow hover:scale-[1.02] transition-transform">
                                Дараах хичээл <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </section>
                  </div>
                  <ExternalResourcesPanel skill="read" level={libReadLevel} />
                  </>
                );
              })()}

            </div>
          )}

          {/* Tab 2: Сонсох (Listening) - Screen 2 layout */}
          {activeTab === 'listen' && (
            <div className="w-full pb-24">


              {/* LIBRARY browser — 50+ listening clips */}
              {(() => {
                const filtered = libListenLevel === 'all' ? LISTENING_LIBRARY : LISTENING_LIBRARY.filter(r => r.level === libListenLevel);
                const item = LISTENING_LIBRARY.find(r => r.id === libListenId) || LISTENING_LIBRARY[0];
                const questions = getListeningQuestions(item).map((qq, qi) => shuffleQuiz(`listen:${item.id}:${qi}`, qq));
                const qIdx = Math.min(libListenQIdx, questions.length - 1);
                const q = questions[qIdx];
                const qAnswer = libListenAnswers[qIdx] ?? null;
                const idxInFiltered = filtered.findIndex(r => r.id === item.id);
                const openListenItem = (next: ListeningItem) => { setLibListenId(next.id); setLibListenQIdx(0); setLibListenAnswers({}); setLibListenTrans(readTranslateEnabled); };
                return (
                  <>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <aside className="lg:col-span-4 border-2 border-on-background rounded-xl p-4 block-shadow">
                      <div className="flex gap-1 mb-3">
                        {LIB_LEVELS.map(lv => (
                          <button key={lv} onClick={() => setLibListenLevel(lv)}
                            className={`flex-1 py-1.5 rounded-lg border-2 border-on-background text-xs font-bold cursor-pointer transition-colors ${libListenLevel === lv ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                            {lv === 'all' ? 'Бүгд' : lv}
                          </button>
                        ))}
                      </div>
                      <div className="nested-scroll flex flex-col gap-2 max-h-[55vh] max-lg:h-[45vh] max-lg:max-h-[45vh] pr-1">
                        {filtered.map(r => {
                          const isLocked = (lockedActivityIds.listen.has(r.id) && r.level === currentUser?.targetLevel) || isLessonLocked(currentUser, r.level);
                          return (
                            <button key={r.id} onClick={() => openListenItem(r)}
                              className={`text-left p-2.5 rounded-lg border-2 border-on-background cursor-pointer transition-colors ${r.id === libListenId ? 'bg-secondary-container' : 'bg-surface-container hover:bg-surface-container-high'}`}>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-secondary text-white shrink-0">{r.level}</span>
                                <span className="text-xs font-bold text-on-surface truncate flex items-center gap-1.5">
                                  {isLocked && <span>🔒</span>}
                                  {r.titleMn}
                                </span>
                              </div>
                              <p className="text-[10px] text-on-surface-variant mt-0.5 truncate">{r.title} · {r.topic}</p>
                            </button>
                          );
                        })}
                      </div>
                    </aside>

                    <section className="lg:col-span-8 border-2 border-on-background rounded-xl p-6 md:p-8 block-shadow text-on-surface">
                      {isLessonLocked(currentUser, item.level) ? renderPlanLockCard('Энэ хичээл Pro багцад нээлттэй', item.level + ' түвшний хичээлүүд үнэгүй эрхэд хаалттай. Үнэгүй эрхээр A1 түвшний бүх хичээл, үгийн сан нээлттэй.', 'pro') : lockedActivityIds.listen.has(item.id) && item.level === currentUser?.targetLevel ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                          <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant">
                            <Shield className="w-8 h-8" />
                          </div>
                          <h2 className="text-xl font-bold text-on-surface">🔒 Энэ дасгал түгжигдсэн байна</h2>
                          <p className="text-sm text-on-surface-variant max-w-sm font-sans font-medium">
                            Шалгалт өгөх эсвэл өмнөх хэсгийг дуусгаж нээнэ үү.
                          </p>
                          <button 
                            onClick={() => selectTab('profile')}
                            className="px-5 py-2.5 bg-primary text-on-primary font-bold rounded-xl text-sm hover:bg-surface-tint transition-all shadow-md cursor-pointer font-space"
                          >
                            Сургалтын зам руу очих
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-5">
                            <span className="text-xs font-space font-bold text-secondary bg-secondary-container border border-on-background px-3 py-1.5 rounded-full">{item.level} · {item.topic}</span>
                            <button onClick={() => setLibListenTrans(v => !v)}
                              className={`px-3 py-1 border-2 border-on-background rounded-full font-bold text-xs block-shadow cursor-pointer hover:scale-105 transition-transform flex items-center gap-1 ${libListenTrans ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface'}`}>
                              <Languages className="w-4 h-4" /> {libListenTrans ? 'Нуух' : 'Текст'}
                            </button>
                          </div>

                          <h2 className="text-xl md:text-2xl font-extrabold text-on-surface mb-1">{item.titleMn}</h2>
                          <p className="text-xs text-on-surface-variant mb-5">{item.title}</p>

                          {/* Play controls */}
                          <div className="flex flex-col items-center gap-3 py-6 bg-surface-container-low border-2 border-on-background rounded-xl mb-5">
                            <div className="flex items-center gap-4">
                              {/* Replay from start */}
                              <button onClick={() => playListening(item.audioText, audioSpeed === '0.8' ? 0.8 : 1.0)}
                                title="Эхнээс дахин тоглуулах"
                                className="w-11 h-11 rounded-full bg-surface-container text-on-surface border-2 border-on-background flex items-center justify-center cursor-pointer hover:scale-105 transition-transform block-shadow">
                                <RotateCcw className="w-5 h-5" />
                              </button>
                              {/* Play / Pause / Resume toggle */}
                              <button onClick={() => {
                                  if (listenState === 'playing') pauseListening();
                                  else if (listenState === 'paused') resumeListening();
                                  else playListening(item.audioText, audioSpeed === '0.8' ? 0.8 : 1.0);
                                }}
                                title={listenState === 'playing' ? 'Түр зогсоох' : 'Тоглуулах'}
                                className={`w-16 h-16 rounded-full bg-secondary text-white border-2 border-on-background flex items-center justify-center cursor-pointer hover:scale-105 transition-transform block-shadow ${listenState === 'playing' ? 'animate-pulse ring-4 ring-secondary/30' : ''}`}>
                                {listenState === 'playing' ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
                              </button>
                            </div>
                            <p className="text-xs text-on-surface-variant font-sans">
                              {listenState === 'playing' ? 'Тоглож байна… дарж түр зогсоо' : listenState === 'paused' ? 'Түр зогссон… дарж үргэлжлүүл' : 'Сонсохын тулд тоглуулах товчийг дарна уу'}
                            </p>
                            <div className="flex items-center gap-2">
                              <button onClick={() => { setAudioSpeed('0.8'); if (listenState !== 'idle') playListening(item.audioText, 0.8); }}
                                className={`px-3 py-1 rounded-full border-2 border-on-background text-[11px] font-bold font-space cursor-pointer block-shadow ${audioSpeed === '0.8' ? 'bg-primary-container text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                                0.8x (Удаан)
                              </button>
                              <button onClick={() => { setAudioSpeed('1.0'); if (listenState !== 'idle') playListening(item.audioText, 1.0); }}
                                className={`px-3 py-1 rounded-full border-2 border-on-background text-[11px] font-bold font-space cursor-pointer block-shadow ${audioSpeed === '1.0' ? 'bg-primary-container text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                                1.0x (Хэвийн)
                              </button>
                            </div>
                          </div>

                          {libListenTrans && (
                            <div className="bg-surface-container-low border-l-4 border-secondary rounded-lg p-3 mb-5">
                              <p className="text-sm text-on-surface font-medium whitespace-pre-line">{renderRichGerman(item.audioText)}</p>
                              <p className="text-xs text-on-surface-variant mt-2 pt-2 border-t border-outline-variant/50 italic">{item.transcriptMn}</p>
                            </div>
                          )}

                          {/* Comprehension — multi-question set with prev/next */}
                          <div className="pt-5 border-t border-outline-variant">
                            <p className="text-xs font-space font-bold uppercase text-primary mb-2">Ойлголт шалгах · Асуулт {qIdx + 1}/{questions.length}:</p>
                            <p className="text-base font-bold text-on-surface mb-3">{q.question}</p>
                            <div className="mb-4 flex flex-wrap gap-2">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-container border-2 border-on-background text-xs font-semibold rounded-full font-space block-shadow text-on-surface">
                                <Lightbulb className="w-4 h-4 text-orange-500 fill-orange-500" />
                                {q.hint ?? 'Санамж: "Текст" товчийг дарж, тодруулсан үг дээр дарна уу.'}
                              </span>
                            </div>
                            <MCQBlock
                              choices={q.choices}
                              correctIndex={q.correctIndex}
                              selectedAnswer={qAnswer}
                              feedbackText={q.explanation}
                              onSelect={(index) => {
                                const nextAnswers = { ...libListenAnswers, [qIdx]: index };
                                setLibListenAnswers(nextAnswers);
                                const actId = activityKey('library:listen', item.id);
                                const profile = currentUserRef.current;
                                if (index === q.correctIndex) {
                                  const allCorrect = questions.every((qq, i) => nextAnswers[i] === qq.correctIndex);
                                  if (allCorrect) {
                                    recordStudyActivity(actId);
                                    if (profile && profile.mistakeIds?.includes(actId)) {
                                      applyMetricProfile({
                                        ...profile,
                                        mistakeIds: clearMistake(profile.mistakeIds, actId),
                                      });
                                    }
                                  }
                                } else if (profile) {
                                  applyMetricProfile({
                                    ...profile,
                                    mistakeIds: addMistake(profile.mistakeIds, actId),
                                  });
                                }
                              }}
                            />
                            {qAnswer !== null && qAnswer !== q.correctIndex && (
                              <>
                                <button
                                  onClick={() => { const na = { ...libListenAnswers }; delete na[qIdx]; setLibListenAnswers(na); }}
                                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-surface-container text-on-surface border-2 border-on-background rounded-lg font-bold text-xs font-space cursor-pointer block-shadow hover:scale-[1.02] transition-transform">
                                  <RotateCcw className="w-3.5 h-3.5" /> Дахин оролдох
                                </button>
                                <GrammarTipCard
                                  correctAnswer={q.choices[q.correctIndex]}
                                  explanation={q.explanation}
                                  germanContext={item.audioText}
                                  level={item.level}
                                />
                              </>
                            )}
                            <QuizNav
                              qIdx={qIdx}
                              total={questions.length}
                              answered={qAnswer !== null}
                              onPrev={() => setLibListenQIdx(Math.max(0, qIdx - 1))}
                              onNext={() => {
                                if (qIdx < questions.length - 1) setLibListenQIdx(qIdx + 1);
                                else if (filtered.length > 0) openListenItem(filtered[(Math.max(idxInFiltered, 0) + 1) % filtered.length]);
                              }}
                              nextLessonLabel={qIdx === questions.length - 1}
                            />
                          </div>

                          {/* Prev/next lesson */}
                          {idxInFiltered >= 0 && filtered.length > 1 && (
                            <div className="flex items-center justify-between mt-6 pt-4 border-t border-outline-variant">
                              <button onClick={() => openListenItem(filtered[(idxInFiltered - 1 + filtered.length) % filtered.length])}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-on-background bg-surface-container text-on-surface font-bold text-xs font-space cursor-pointer block-shadow hover:scale-[1.02] transition-transform">
                                <ArrowLeft className="w-3.5 h-3.5" /> Өмнөх хичээл
                              </button>
                              <span className="text-[11px] font-space font-bold text-on-surface-variant">{idxInFiltered + 1} / {filtered.length}</span>
                              <button onClick={() => openListenItem(filtered[(idxInFiltered + 1) % filtered.length])}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-on-background bg-surface-container text-on-surface font-bold text-xs font-space cursor-pointer block-shadow hover:scale-[1.02] transition-transform">
                                Дараах хичээл <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </section>
                  </div>
                  <ExternalResourcesPanel skill="listen" level={libListenLevel} />
                  </>
                );
              })()}

            </div>
          )}

          {/* Tab 3: Ярих (Speaking) - Screen 4 layout */}
          {activeTab === 'speak' && (
            <div className="w-full pb-24">


              {/* LIBRARY browser — 50+ speaking prompts */}
              {(() => {
                const filtered = libSpeakLevel === 'all' ? SPEAKING_LIBRARY : SPEAKING_LIBRARY.filter(r => r.level === libSpeakLevel);
                const item = SPEAKING_LIBRARY.find(r => r.id === libSpeakId) || SPEAKING_LIBRARY[0];
                const idxInFiltered = filtered.findIndex(r => r.id === item.id);
                const openSpeakItem = (next: SpeakingItem) => { setLibSpeakId(next.id); setLibSpeakReveal(false); resetSpeakingJudge(); };
                return (
                  <>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <aside className="lg:col-span-4 border-2 border-on-background rounded-xl p-4 block-shadow">
                      <div className="flex gap-1 mb-3">
                        {LIB_LEVELS.map(lv => (
                          <button key={lv} onClick={() => setLibSpeakLevel(lv)}
                            className={`flex-1 py-1.5 rounded-lg border-2 border-on-background text-xs font-bold cursor-pointer transition-colors ${libSpeakLevel === lv ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                            {lv === 'all' ? 'Бүгд' : lv}
                          </button>
                        ))}
                      </div>
                      <div className="nested-scroll flex flex-col gap-2 max-h-[55vh] max-lg:h-[45vh] max-lg:max-h-[45vh] pr-1">
                        {filtered.map(r => {
                          const isLocked = (lockedActivityIds.speak.has(r.id) && r.level === currentUser?.targetLevel) || isLessonLocked(currentUser, r.level);
                          return (
                            <button key={r.id} onClick={() => openSpeakItem(r)}
                              className={`text-left p-2.5 rounded-lg border-2 border-on-background cursor-pointer transition-colors ${r.id === libSpeakId ? 'bg-secondary-container' : 'bg-surface-container hover:bg-surface-container-high'}`}>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-secondary text-white shrink-0">{r.level}</span>
                                <span className="text-xs font-bold text-on-surface truncate flex items-center gap-1.5">
                                  {isLocked && <span>🔒</span>}
                                  {r.titleMn}
                                </span>
                              </div>
                              <p className="text-[10px] text-on-surface-variant mt-0.5 truncate">{r.title} · {r.topic}</p>
                            </button>
                          );
                        })}
                      </div>
                    </aside>

                    <section className="lg:col-span-8 border-2 border-on-background rounded-xl p-6 md:p-8 block-shadow text-on-surface">
                      {isLessonLocked(currentUser, item.level) ? renderPlanLockCard('Энэ хичээл Pro багцад нээлттэй', item.level + ' түвшний хичээлүүд үнэгүй эрхэд хаалттай. Үнэгүй эрхээр A1 түвшний бүх хичээл, үгийн сан нээлттэй.', 'pro') : lockedActivityIds.speak.has(item.id) && item.level === currentUser?.targetLevel ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                          <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant">
                            <Shield className="w-8 h-8" />
                          </div>
                          <h2 className="text-xl font-bold text-on-surface">🔒 Энэ дасгал түгжигдсэн байна</h2>
                          <p className="text-sm text-on-surface-variant max-w-sm font-sans font-medium">
                            Шалгалт өгөх эсвэл өмнөх хэсгийг дуусгаж нээнэ үү.
                          </p>
                          <button 
                            onClick={() => selectTab('profile')}
                            className="px-5 py-2.5 bg-primary text-on-primary font-bold rounded-xl text-sm hover:bg-surface-tint transition-all shadow-md cursor-pointer font-space"
                          >
                            Сургалтын зам руу очих
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-xs font-space font-bold text-secondary bg-secondary-container border border-on-background px-3 py-1.5 rounded-full">{item.level} · {item.topic}</span>
                          <h2 className="text-xl md:text-2xl font-extrabold text-on-surface mt-4 mb-1">{item.titleMn}</h2>
                          <p className="text-xs text-on-surface-variant mb-4">{item.title}</p>

                      {/* Task prompt */}
                      <div className="bg-surface-container-low border-l-4 border-secondary rounded-lg p-4 mb-5">
                        <p className="text-xs font-space font-bold uppercase text-primary mb-1">Даалгавар:</p>
                        <p className="text-base font-bold text-on-surface">{item.prompt}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-5">
                        <button onClick={() => speakGerman(item.modelAnswer, 1.0)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-white border-2 border-on-background rounded-lg font-bold text-sm cursor-pointer block-shadow hover:scale-[1.02] active:scale-95 transition-transform">
                          <Volume2 className="w-4 h-4" /> Загварыг сонсох
                        </button>
                        <button onClick={() => setLibSpeakReveal(v => !v)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-surface-container text-primary border-2 border-on-background rounded-lg font-bold text-sm cursor-pointer block-shadow hover:scale-[1.02] transition-transform">
                          <Lightbulb className="w-4 h-4 text-amber-400 fill-current" /> {libSpeakReveal ? 'Нуух' : 'Загвар хариулт харах'}
                        </button>
                      </div>

                      {/* Tips */}
                      <div className="mb-2">
                        <p className="text-[11px] font-space font-bold uppercase text-on-surface-variant mb-2">Хэрэгтэй хэллэг:</p>
                        <div className="flex flex-col gap-1.5">
                          {item.tips.map((t, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-on-surface">
                              <span className="text-secondary font-black">›</span>{t}
                            </div>
                          ))}
                        </div>
                      </div>

                      {libSpeakReveal && (
                        <div className="bg-secondary-container/40 border-2 border-secondary rounded-lg p-4 mt-4">
                          <p className="text-[10px] font-bold uppercase text-secondary mb-1">Загвар хариулт:</p>
                          <p className="text-base text-on-surface font-medium leading-relaxed">{renderRichGerman(item.modelAnswer)}</p>
                          <p className="text-xs text-on-surface-variant mt-2 italic leading-relaxed">{item.modelMn}</p>
                        </div>
                      )}
                      <p className="text-[11px] text-on-surface-variant mt-4 italic">Зөвлөмж: эхлээд өөрөө чангаар хэлж үзээд, дараа нь загвартай харьцуулаарай.</p>

                      {/* AI judge — graded against this item's model answer. Every imported
                          speaking resource gets it automatically because it is data-driven. */}
                      {renderSpeakingJudge(item.modelAnswer)}
                      {renderSpeakingReport(item.modelAnswer)}

                      {/* Prev/next lesson */}
                      {idxInFiltered >= 0 && filtered.length > 1 && (
                        <div className="flex items-center justify-between mt-6 pt-4 border-t border-outline-variant">
                          <button onClick={() => openSpeakItem(filtered[(idxInFiltered - 1 + filtered.length) % filtered.length])}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-on-background bg-surface-container text-on-surface font-bold text-xs font-space cursor-pointer block-shadow hover:scale-[1.02] transition-transform">
                            <ArrowLeft className="w-3.5 h-3.5" /> Өмнөх хичээл
                          </button>
                          <span className="text-[11px] font-space font-bold text-on-surface-variant">{idxInFiltered + 1} / {filtered.length}</span>
                          <button onClick={() => openSpeakItem(filtered[(idxInFiltered + 1) % filtered.length])}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-on-background bg-surface-container text-on-surface font-bold text-xs font-space cursor-pointer block-shadow hover:scale-[1.02] transition-transform">
                            Дараах хичээл <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </div>
                  <ExternalResourcesPanel skill="speak" level={libSpeakLevel} />
                  </>
                );
              })()}

            </div>
          )}

          {/* Tab 4: Бичих (Writing) - Screen 6 layout */}
          {activeTab === 'write' && (
            <div className="w-full pb-24">


              {/* LIBRARY browser — 50+ writing tasks */}
              {(() => {
                const filtered = libWriteLevel === 'all' ? WRITING_LIBRARY : WRITING_LIBRARY.filter(r => r.level === libWriteLevel);
                const item = WRITING_LIBRARY.find(r => r.id === libWriteId) || WRITING_LIBRARY[0];
                const words = libWriteText.trim() ? libWriteText.trim().split(/\s+/).length : 0;
                const idxInFiltered = filtered.findIndex(r => r.id === item.id);
                const openWriteItem = (next: WritingItem) => { setLibWriteId(next.id); setLibWriteText(''); setLibWriteReveal(false); resetWritingFeedback(); };
                return (
                  <>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <aside className="lg:col-span-4 border-2 border-on-background rounded-xl p-4 block-shadow">
                      <div className="flex gap-1 mb-3">
                        {LIB_LEVELS.map(lv => (
                          <button key={lv} onClick={() => setLibWriteLevel(lv)}
                            className={`flex-1 py-1.5 rounded-lg border-2 border-on-background text-xs font-bold cursor-pointer transition-colors ${libWriteLevel === lv ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                            {lv === 'all' ? 'Бүгд' : lv}
                          </button>
                        ))}
                      </div>
                      <div className="nested-scroll flex flex-col gap-2 max-h-[55vh] max-lg:h-[45vh] max-lg:max-h-[45vh] pr-1">
                        {filtered.map(r => {
                          const isLocked = (lockedActivityIds.write.has(r.id) && r.level === currentUser?.targetLevel) || isLessonLocked(currentUser, r.level);
                          return (
                            <button key={r.id} onClick={() => openWriteItem(r)}
                              className={`text-left p-2.5 rounded-lg border-2 border-on-background cursor-pointer transition-colors ${r.id === libWriteId ? 'bg-secondary-container' : 'bg-surface-container hover:bg-surface-container-high'}`}>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-secondary text-white shrink-0">{r.level}</span>
                                <span className="text-xs font-bold text-on-surface truncate flex items-center gap-1.5">
                                  {isLocked && <span>🔒</span>}
                                  {r.titleMn}
                                </span>
                              </div>
                              <p className="text-[10px] text-on-surface-variant mt-0.5 truncate">{r.title} · {r.topic}</p>
                            </button>
                          );
                        })}
                      </div>
                    </aside>

                    <section className="lg:col-span-8 border-2 border-on-background rounded-xl p-6 md:p-8 block-shadow text-on-surface">
                      {isLessonLocked(currentUser, item.level) ? renderPlanLockCard('Энэ хичээл Pro багцад нээлттэй', item.level + ' түвшний хичээлүүд үнэгүй эрхэд хаалттай. Үнэгүй эрхээр A1 түвшний бүх хичээл, үгийн сан нээлттэй.', 'pro') : lockedActivityIds.write.has(item.id) && item.level === currentUser?.targetLevel ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                          <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant">
                            <Shield className="w-8 h-8" />
                          </div>
                          <h2 className="text-xl font-bold text-on-surface">🔒 Энэ дасгал түгжигдсэн байна</h2>
                          <p className="text-sm text-on-surface-variant max-w-sm font-sans font-medium">
                            Шалгалт өгөх эсвэл өмнөх хэсгийг дуусгаж нээнэ үү.
                          </p>
                          <button 
                            onClick={() => selectTab('profile')}
                            className="px-5 py-2.5 bg-primary text-on-primary font-bold rounded-xl text-sm hover:bg-surface-tint transition-all shadow-md cursor-pointer font-space"
                          >
                            Сургалтын зам руу очих
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-xs font-space font-bold text-secondary bg-secondary-container border border-on-background px-3 py-1.5 rounded-full">{item.level} · {item.topic}</span>
                          <h2 className="text-xl md:text-2xl font-extrabold text-on-surface mt-4 mb-1">{item.titleMn}</h2>
                          <p className="text-xs text-on-surface-variant mb-4">{item.title}</p>

                      <div className="bg-surface-container-low rounded-lg p-4 mb-4">
                        <p className="text-xs font-space font-bold uppercase text-primary mb-1">Даалгавар:</p>
                        <p className="text-sm font-bold text-on-surface mb-2">{item.prompt}</p>
                        <ul className="text-xs text-on-surface-variant space-y-1 list-disc list-inside">
                          {item.points.map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>

                      <textarea value={libWriteText} onChange={(e) => setLibWriteText(e.target.value)}
                        placeholder="Энд герман хэлээр бичнэ үү..." rows={6} maxLength={2000}
                        className="w-full px-3 py-2 text-sm border-2 border-on-background rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline outline-none focus:border-secondary resize-y" />

                      <div className="flex items-center justify-between mt-3">
                        <span className="text-[11px] text-on-surface-variant">{words} үг</span>
                        <button onClick={() => setLibWriteReveal(v => !v)}
                          className="px-4 py-2 bg-surface-container text-primary border-2 border-on-background rounded-lg font-bold text-xs cursor-pointer block-shadow hover:scale-[1.02] transition-transform flex items-center gap-1">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-400 fill-current" /> {libWriteReveal ? 'Загварыг нуух' : 'Загвар хариулт харах'}
                        </button>
                      </div>

                      {libWriteReveal && (
                        <div className="bg-secondary-container/40 border-2 border-secondary rounded-lg p-4 mt-4">
                          <p className="text-[10px] font-bold uppercase text-secondary mb-1">Загвар хариулт:</p>
                          <p className="text-sm text-on-surface whitespace-pre-line leading-relaxed font-medium">{renderRichGerman(item.modelAnswer)}</p>
                          <p className="text-xs text-on-surface-variant whitespace-pre-line leading-relaxed mt-2 pt-2 border-t border-secondary/30 italic">{item.modelMn}</p>
                        </div>
                      )}

                      {/* AI writing check — flags wrong grammar / words and recommends
                          better wording. Data-driven, so new imports get it automatically. */}
                      {renderWritingChecker(libWriteText, { prompt: item.prompt, points: item.points, modelAnswer: item.modelAnswer, level: item.level })}

                      {/* Prev/next lesson */}
                      {idxInFiltered >= 0 && filtered.length > 1 && (
                        <div className="flex items-center justify-between mt-6 pt-4 border-t border-outline-variant">
                          <button onClick={() => openWriteItem(filtered[(idxInFiltered - 1 + filtered.length) % filtered.length])}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-on-background bg-surface-container text-on-surface font-bold text-xs font-space cursor-pointer block-shadow hover:scale-[1.02] transition-transform">
                            <ArrowLeft className="w-3.5 h-3.5" /> Өмнөх хичээл
                          </button>
                          <span className="text-[11px] font-space font-bold text-on-surface-variant">{idxInFiltered + 1} / {filtered.length}</span>
                          <button onClick={() => openWriteItem(filtered[(idxInFiltered + 1) % filtered.length])}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-on-background bg-surface-container text-on-surface font-bold text-xs font-space cursor-pointer block-shadow hover:scale-[1.02] transition-transform">
                            Дараах хичээл <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </div>
                  <ExternalResourcesPanel skill="write" level={libWriteLevel} />
                  </>
            );
              })()}

            </div>
          )}

          {/* Tab 5: Үгсийн сан (Vocabulary) — Trainer (flashcards) + Dictionary (browse) */}
          {activeTab === 'vocab' && (
          <div className="mt-4 animate-fade-in">

            {/* Sub-view toggle: flashcard Trainer vs in-app Dictionary */}
            <div className="flex w-full sm:w-auto sm:inline-flex p-1.5 bg-surface-container border-2 border-on-background rounded-2xl block-shadow mb-6">
              <button
                onClick={() => setVocabView('trainer')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold font-space text-sm transition-all cursor-pointer ${
                  vocabView === 'trainer' ? 'bg-secondary text-white border-2 border-on-background block-shadow-green' : 'text-on-surface-variant hover:bg-white/60'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                Дасгал
              </button>
              <button
                onClick={() => setVocabView('browse')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold font-space text-sm transition-all cursor-pointer ${
                  vocabView === 'browse' ? 'bg-secondary text-white border-2 border-on-background block-shadow-green' : 'text-on-surface-variant hover:bg-white/60'
                }`}
              >
                <Library className="w-4 h-4" />
                Толь бичиг
              </button>
            </div>

            {vocabView === 'trainer' && (
            <>
            {/* Trainer level filter (A1 → C2) + placement-based suggestion */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <span className="text-xs font-space font-bold text-outline uppercase tracking-wider mr-1">Түвшин:</span>
              {LEVEL_OPTIONS.map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => selectTrainerLevel(lvl)}
                  className={`px-3.5 py-1.5 border-2 border-on-background rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer block-shadow ${
                    trainerLevel === lvl ? 'bg-secondary text-white' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                  }`}
                >
                  {lvl === 'all' ? 'Бүгд' : lvl}
                  {lvl !== 'all' && lvl === placementSuggestedLevel && (
                    <span className="ml-1.5 text-[10px] uppercase opacity-80">★</span>
                  )}
                </button>
              ))}
              {placementSuggestedLevel && (
                <span className="text-xs font-bold text-secondary font-sans ml-1">
                  ★ Түвшин тогтоох шалгалтын дүнгээр танд {placementSuggestedLevel} түвшний үгсийг санал болгож байна
                </span>
              )}
            </div>

            {vocabList.length === 0 ? (
              <div className="rounded-2xl border-2 border-on-background p-10 block-shadow text-center">
                <p className="font-bold text-on-surface-variant font-sans">
                  Энэ түвшинд дасгал хийх үг алга. Өөр түвшин сонгоно уу.
                </p>
              </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

              {/* Central carousel card element block */}
              <div className="lg:col-span-8 flex flex-col items-center justify-center min-h-[500px]">
                
                {/* Visual tactile card flip display wrapper */}
                <div 
                  onClick={() => setVocabFlipped(prev => !prev)}
                  className="w-full max-w-2xl aspect-[4/3] sm:aspect-video perspective-1000 cursor-pointer"
                >
                  <div className="relative w-full h-full transform-style-3d border-2 border-on-background rounded-2xl block-shadow">
                    
                    {/* FRONT of the card (displays German word) - Backface hidden layout */}
                    <div className={`absolute inset-0 w-full h-full backface-hidden bg-surface-container-high text-on-surface rounded-2xl flex flex-col items-center justify-between p-8 transition-transform duration-500 transform-style-3d ${
                      vocabFlipped ? '[transform:rotateY(-180deg)]' : '[transform:rotateY(0deg)]'
                    }`}>
                      <span className="text-xs font-space font-bold text-on-surface-variant uppercase tracking-wider px-3 py-1 bg-surface-container border border-on-background rounded-full">
                        Шинэ үг
                      </span>
                      
                      <div className="flex flex-col items-center gap-4">
                        {vocabList[currentVocabIndex].article && (
                          <span className={`text-base font-black lowercase tracking-widest px-4 py-1 rounded-full border-2 border-on-background block-shadow ${
                            vocabList[currentVocabIndex].article === 'der' ? 'bg-teal-100 text-teal-700' :
                            vocabList[currentVocabIndex].article === 'die' ? 'bg-orange-100 text-orange-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {vocabList[currentVocabIndex].article}
                          </span>
                        )}
                        <h2 className="text-4xl sm:text-5xl font-black text-primary text-center font-sans tracking-tight">
                          {vocabList[currentVocabIndex].german}
                        </h2>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const w = vocabList[currentVocabIndex];
                            speakGerman(w.article ? `${w.article} ${w.german}` : w.german);
                          }}
                          className="p-4 rounded-full bg-surface-container hover:bg-surface-container-high border-2 border-on-background hover:scale-110 text-secondary transition-all block-shadow cursor-pointer flex items-center justify-center"
                        >
                          <Volume2 className="w-8 h-8 font-black stroke-[2.5px]" />
                        </button>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setVocabFlipped(true);
                        }}
                        className="mb-2 px-6 py-2.5 bg-secondary text-white border-2 border-on-background rounded-xl font-bold font-sans text-sm shadow-[0_4px_18px_-2px_rgba(0,0,0,0.35)] cursor-pointer hover:scale-105 transition-all"
                      >
                        Хариултыг харах ↺
                      </button>
                    </div>

                    {/* BACK of the card (displays Mongolian definitions & explanations) */}
                    <div className={`absolute inset-0 w-full h-full backface-hidden bg-surface-container-high text-on-surface rounded-2xl flex flex-col items-center justify-between p-8 border-2 border-secondary shadow-[0_4px_16px_rgba(0,108,73,0.1)] transition-transform duration-500 transform-style-3d ${
                      vocabFlipped ? '[transform:rotateY(0deg)]' : '[transform:rotateY(180deg)]'
                    }`}>
                      <span className="text-xs font-space font-bold text-secondary bg-secondary-container px-3 py-1 border border-on-background rounded-full uppercase tracking-wider">
                        {vocabList[currentVocabIndex].category}
                      </span>

                      <div className="flex flex-col items-center gap-6 w-full max-w-md">
                        <h2 className="text-3xl font-extrabold text-primary text-center font-sans tracking-tight">
                          {vocabList[currentVocabIndex].mongolian}
                        </h2>
                        
                        <div className="w-full bg-surface-container-low p-4 rounded-xl border-2 border-on-background block-shadow text-center">
                          <p className="text-sm leading-normal text-on-surface-variant italic mb-2 font-sans font-bold">
                            "{vocabList[currentVocabIndex].exampleGerman}"
                          </p>
                          <p className="text-sm font-bold text-secondary leading-normal font-sans">
                            {vocabList[currentVocabIndex].exampleMongolian}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setVocabFlipped(false);
                        }}
                        className="mb-2 px-6 py-2.5 bg-primary text-on-primary border-2 border-on-background rounded-xl font-bold font-sans text-sm shadow-[0_4px_18px_-2px_rgba(0,0,0,0.35)] cursor-pointer hover:scale-105 transition-all"
                      >
                        Үгийг харах ↺
                      </button>
                    </div>

                  </div>
                </div>

                {/* Display tactile repeat-repeat actions buttons on flipped cards */}
                <div className={`flex flex-col sm:flex-row gap-4 mt-8 w-full max-w-2xl transition-opacity duration-300 ${
                  vocabFlipped ? 'opacity-100 pointer-events-auto' : 'opacity-30 pointer-events-none'
                }`}>
                  <button
                    onClick={() => handleVocabAction(false)}
                    className="flex-1 basis-0 flex items-center justify-center gap-2 border-2 border-orange-500 text-orange-400 hover:bg-orange-500 hover:text-white py-4 px-6 rounded-xl font-bold font-sans text-lg block-shadow-orange cursor-pointer transition-all active:scale-95"
                  >
                    <RotateCcw className="w-5 h-5 font-black" />
                    Дахин давтах
                  </button>
                  <button
                    onClick={() => handleVocabAction(true)}
                    className="flex-1 basis-0 flex items-center justify-center gap-2 bg-secondary border-2 border-on-background text-white hover:bg-on-secondary-fixed-variant py-4 px-6 rounded-xl font-bold font-sans text-lg block-shadow-green cursor-pointer transition-all active:scale-95"
                  >
                    <CheckCircle className="w-5 h-5 font-black fill-current" />
                    Мэднэ
                  </button>
                </div>

              </div>

              {/* Right Sidebar: Progression Circular SVG & upcoming word panels */}
              <aside className="lg:col-span-4 flex flex-col gap-6">
                {/* SVGs Progress tracking ring list items */}
                <div className="rounded-xl border-2 border-on-background p-6 block-shadow flex flex-col items-center">
                  <h3 className="text-lg font-bold text-primary mb-6 w-full font-space pb-2 border-b border-outline-variant uppercase tracking-wider">
                    Өнөөдрийн явц
                  </h3>
                  
                  <div className="relative w-40 h-40 mb-4 flex items-center justify-center select-none">
                    {/* SVG circular calculation */}
                    <svg className="w-full h-full transform -rotate-90">
                      <circle 
                        className="text-surface-container stroke-current" 
                        cx="80" 
                        cy="80" 
                        fill="transparent" 
                        r="60" 
                        strokeWidth="10"                      ></circle>
                      <circle 
                        className="text-secondary stroke-current progress-ring__circle transition-all duration-500" 
                        cx="80" 
                        cy="80" 
                        fill="transparent" 
                        r="60" 
                        strokeWidth="10"
                        strokeDasharray={376.8}
                        strokeDashoffset={376.8 - (376.8 * vocabMemorizedCount) / vocabTotalCount}
                        strokeLinecap="round"                      ></circle>
                    </svg>
                    
                    {/* Central counter summary text */}
                    <div className="absolute flex flex-col items-center justify-center text-center">
                      <span className="text-3xl font-extrabold text-primary font-space">
                        {vocabMemorizedCount}/{vocabTotalCount}
                      </span>
                      <span className="text-xs font-bold text-outline uppercase font-space">Цээжилсэн үг</span>
                    </div>
                  </div>

                  <div className="flex justify-between w-full mt-4 text-xs font-space font-bold border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-2 text-on-surface-variant">
                      <div className="w-3 h-3 rounded-full bg-secondary"></div>
                      <span>Мэдэхгүй</span>
                    </div>
                    <div className="flex items-center gap-2 text-on-surface-variant">
                      <div className="w-3 h-3 rounded-full bg-secondary-container"></div>
                      <span>Цээжилсэн</span>
                    </div>
                  </div>
                </div>

                {/* Carousel Upcoming Cards lists previews */}
                <div className="rounded-xl border-2 border-on-background p-6 block-shadow">
                  <h3 className="text-lg font-bold text-primary mb-4 font-space pb-2 border-b border-slate-100 uppercase tracking-wider">
                    Дараагийн үгс
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {/* Show the current word + a short upcoming window (the dictionary has 200+ words) */}
                    {Array.from({ length: Math.min(12, vocabList.length) }).map((_, i) => {
                      const idx = (currentVocabIndex + i) % vocabList.length;
                      const item = vocabList[idx];
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setVocabFlipped(false);
                            setCurrentVocabIndex(idx);
                          }}
                          className={`px-3 py-1.5 border-2 border-on-background rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer block-shadow ${
                            idx === currentVocabIndex
                              ? 'bg-primary-container text-white border-on-background'
                              : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                          }`}
                        >
                          {item.german}
                        </button>
                      );
                    })}
                    <span className="px-3 py-1.5 bg-surface-container border-2 border-on-background rounded-lg text-xs font-bold text-on-surface-variant blur-[0.5px] opacity-70">
                      ...
                    </span>
                  </div>
                </div>

                {/* Resource card — opens the in-app dictionary (Browse) */}
                <div className="rounded-xl border-2 border-on-background p-6 block-shadow">
                  <h3 className="text-lg font-bold text-primary mb-2 font-space pb-2 border-b border-slate-100 uppercase tracking-wider">
                    Нэмэлт эх сурвалж
                  </h3>
                  <p className="text-xs text-on-surface-variant mb-4 leading-normal font-sans">
                    Илүү олон герман үг, жишээ өгүүлбэрийг апп дотроос шууд хайж, түвшингээр шүүж үзээрэй.
                  </p>
                  <button
                    onClick={() => setVocabView('browse')}
                    className="w-full flex items-center justify-center gap-2 bg-secondary text-white border-2 border-on-background py-3 px-4 rounded-xl font-bold font-sans text-sm block-shadow-green cursor-pointer hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    <Library className="w-4 h-4" />
                    Толь бичиг нээх ({DICTIONARY.length})
                  </button>
                </div>
              </aside>

            </div>
            )}
            </>
            )}

            {/* Dictionary (Browse) — searchable, filterable German→Mongolian word list */}
            {vocabView === 'browse' && (
            <div className="flex flex-col gap-6 pb-24">

              {/* Header + search + filters */}
              <div className="rounded-2xl border-2 border-on-background p-6 block-shadow flex flex-col gap-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-2xl font-black text-on-background font-space flex items-center gap-2">
                      <Library className="w-6 h-6 text-secondary" />
                      Герман–Монгол толь бичиг
                    </h2>
                    <p className="text-xs text-on-surface-variant font-sans mt-1">
                      Нийт {DICTIONARY.length} үг · хайж, төрөл болон түвшингээр шүүнэ
                    </p>
                  </div>
                </div>

                {/* Search box */}
                <div className="relative">
                  <Search className="w-5 h-5 text-outline absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={dictSearch}
                    onChange={(e) => setDictSearch(e.target.value)}
                    placeholder="Герман эсвэл монгол үгээр хайх..."
                    className="w-full bg-surface-container-low border-2 border-on-background rounded-xl pl-12 pr-10 py-3 text-md font-bold text-on-surface focus:border-secondary outline-none transition-all placeholder:text-outline placeholder:font-normal shadow-inner"
                  />
                  {dictSearch && (
                    <button
                      onClick={() => setDictSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-background cursor-pointer"
                      title="Цэвэрлэх"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {/* Word-class filter chips */}
                <div className="flex flex-wrap gap-2">
                  {WORD_CLASS_LABELS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setDictClass(c.value)}
                      className={`px-3.5 py-1.5 border-2 border-on-background rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer block-shadow ${
                        dictClass === c.value ? 'bg-primary-container text-white' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Level filter chips */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-space font-bold text-outline uppercase tracking-wider mr-1">Түвшин:</span>
                  {LEVEL_OPTIONS.map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setDictLevel(lvl)}
                      className={`px-3.5 py-1.5 border-2 border-on-background rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer block-shadow ${
                        dictLevel === lvl ? 'bg-secondary text-white' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {lvl === 'all' ? 'Бүгд' : lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Results count */}
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-bold text-on-surface-variant font-space">
                  {filteredDictionary.length} үг олдлоо
                </span>
              </div>

              {/* Word cards grid */}
              {filteredDictionary.length === 0 ? (
                <div className="rounded-2xl border-2 border-on-background p-12 block-shadow text-center">
                  <HelpCircle className="w-12 h-12 text-outline mx-auto mb-3" />
                  <p className="text-on-surface-variant font-bold font-sans">Тохирох үг олдсонгүй.</p>
                  <p className="text-xs text-outline mt-1">Хайлт эсвэл шүүлтүүрээ өөрчилж үзнэ үү.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredDictionary.slice(0, dictVisible).map((w, idx) => (
                      <div
                        key={`${w.german}-${idx}`}
                        className="rounded-xl border-2 border-on-background p-5 block-shadow flex flex-col gap-3 hover:-translate-y-0.5 transition-transform"
                      >
                        <div className="flex items-start justify-between gap-2">
                          {w.article ? (
                            <span className={`text-sm font-black lowercase tracking-widest px-3 py-0.5 rounded-full border-2 border-on-background ${
                              w.article === 'der' ? 'bg-teal-100 text-teal-700' :
                              w.article === 'die' ? 'bg-orange-100 text-orange-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {w.article}
                            </span>
                          ) : (
                            <span className="text-[11px] font-space font-bold text-secondary bg-secondary-container px-2.5 py-1 border border-on-background rounded-full uppercase tracking-wider">
                              {WORD_CLASS_LABELS.find((c) => c.value === w.wordClass)?.label || ''}
                            </span>
                          )}
                          <span className="text-[11px] font-space font-extrabold text-on-surface-variant bg-surface-container px-2.5 py-1 border border-on-background rounded-full">
                            {w.level}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-2xl font-black text-primary font-sans tracking-tight leading-tight truncate">
                              {w.german}
                            </h3>
                            {w.phonetic && (
                              <p className="text-xs text-on-surface-variant/70 font-mono mt-0.5">{w.phonetic}</p>
                            )}
                          </div>
                          <button
                            onClick={() => speakGerman(w.article ? `${w.article} ${w.german}` : w.german)}
                            className="shrink-0 p-2.5 rounded-full bg-surface-container hover:bg-surface-container-high border-2 border-on-background hover:scale-110 text-secondary transition-all cursor-pointer"
                            title="Дуудлага сонсох"
                          >
                            <Volume2 className="w-5 h-5 stroke-[2.5px]" />
                          </button>
                        </div>

                        {/* Meaning: Mongolian once translated, otherwise the English gloss. */}
                        {w.mongolian.trim() ? (
                          <p className="text-base font-bold text-secondary font-sans">{w.mongolian}</p>
                        ) : (
                          <p className="text-base font-bold text-secondary font-sans">
                            {w.english}
                            <span className="ml-1.5 text-[10px] font-space font-bold text-outline align-middle">EN</span>
                          </p>
                        )}
                        {w.wordClass === 'noun' && w.plural && (
                          <p className="text-xs text-on-surface-variant/80 font-sans -mt-1">
                            Олон тоо: <span className="font-bold">die {w.plural}</span>
                          </p>
                        )}

                        {w.exampleGerman.trim() && (
                          <div className="mt-auto bg-surface-container-low p-3 rounded-lg border border-outline-variant">
                            <p className="text-xs leading-normal text-on-surface-variant italic font-sans font-semibold mb-1">
                              „{w.exampleGerman}“
                            </p>
                            <p className="text-xs text-on-surface-variant/80 leading-normal font-sans">
                              {w.exampleMongolian}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Load more */}
                  {dictVisible < filteredDictionary.length && (
                    <div className="flex justify-center mt-2">
                      <button
                        onClick={() => setDictVisible((n) => n + 24)}
                        className="flex items-center gap-2 border-2 border-on-background text-on-background hover:bg-surface-container py-3 px-8 rounded-xl font-bold font-sans text-sm block-shadow cursor-pointer hover:scale-[1.02] active:scale-95 transition-all"
                      >
                        <ChevronRight className="w-4 h-4 rotate-90" />
                        Цааш үзэх ({filteredDictionary.length - dictVisible})
                      </button>
                    </div>
                  )}
                </>
              )}

              <p className="text-center text-[11px] text-outline font-sans mt-2">
                Vocabeo.com-ийн загвараар бүтээв
              </p>
            </div>
            )}

          </div>
          )}

          {/* Tab: Орчуулагч (Professional Translation & Lingua Helper) */}
          {/* AI translator: Free/Pro spend monthly teaser uses, Max is unlimited.
              Once the teaser runs out the upgrade card replaces the workspace. */}
          {activeTab === 'translate' && !aiUsable && (
            <div className="max-w-2xl mx-auto w-full pb-24 animate-fade-in">
              {renderPlanLockCard(
                'AI Орчуулагч',
                aiLockDesc('Дүрмийн задаргаатай ухаалаг орчуулагч'),
                'max',
              )}
            </div>
          )}
          {activeTab === 'translate' && aiUsable && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-24 animate-fade-in font-sans">
              <div className="lg:col-span-12">{renderAiTeaserBanner()}</div>
              
              {/* Left Side: Translation Workspace */}
              <div className="lg:col-span-12 xl:col-span-7 flex flex-col gap-6">
                <div className="rounded-xl p-6 md:p-8 border-2 border-on-background block-shadow relative">
                  
                  {/* Neon top accent */}
                  <div className="absolute top-0 left-0 w-full h-[5px] bg-primary rounded-t-xl"></div>
                  
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500 fill-amber-300 animate-pulse" />
                      <h2 className="text-2xl font-black text-on-background font-space">
                        Орчуулагч
                      </h2>
                    </div>
                    <span className="text-[11px] font-space font-extrabold bg-surface text-amber-300 px-3 py-1 rounded-full border border-amber-500/20 uppercase tracking-widest">
                      PRO
                    </span>
                  </div>

                  <p className="text-xs text-on-surface-variant mb-4 leading-relaxed font-sans">
                    Энгийн орчуулгын системүүд шиг шууд холбож орчуулахгүй, энэхүү ухаалаг систем нь өгүүлбэрийн зүй, үгс тус бүрийн хувирал, дуудлагыг дүрмийн тайлбартай хамт гаргаж заах сургалтын зориулалттай.
                  </p>

                  <div className="relative">
                    <textarea 
                      value={translationInput}
                      onChange={(e) => setTranslationInput(e.target.value)}
                      placeholder="Орчуулах герман эсвэл монгол өгүүлбэрээ энд бичнэ үү..."
                      className="w-full min-h-[120px] bg-surface-container-low border-2 border-on-background font-bold rounded-xl p-4 text-md text-on-surface focus:border-amber-500 outline-none transition-all placeholder:text-outline resize-none shadow-inner"
                    />
                    {translationInput && (
                      <button 
                        onClick={() => setTranslationInput('')}
                        className="absolute right-3 top-3 text-[12px] text-outline font-bold border border-outline-variant bg-surface-container hover:bg-surface-container-high px-2.5 py-1 rounded-md transition-all cursor-pointer"
                        title="Арилгах"
                      >
                        Цэвэрлэх
                      </button>
                    )}
                  </div>

                  {/* Sample Phrases cards */}
                  <div className="mt-4">
                    <p className="text-xs font-bold text-outline font-space mb-2 uppercase">Туршиж үзэх жишээ өгүүлбэрүүд:</p>
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => {
                          setTranslationInput('Ich trinke jeden Morgen eine große Tasse Kaffee in der Küche.');
                          translateText('Ich trinke jeden Morgen eine große Tasse Kaffee in der Küche.');
                        }}
                        className="text-left py-2 px-3 bg-surface-container border border-outline-variant rounded-lg hover:border-amber-400 text-xs font-semibold hover:bg-surface-container-high text-on-surface-variant transition-all flex justify-between items-center group cursor-pointer"
                      >
                        <span>🇩🇪 "Ich trinke jeden Morgen eine große Tasse Kaffee in der Küche."</span>
                        <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all text-amber-500" />
                      </button>
                      <button 
                        onClick={() => {
                          setTranslationInput('Өнөөдөр цаг агаар сайхан байгаа тул бид цэцэрлэгт хүрээлэнд зугаална.');
                          translateText('Өнөөдөр цаг агаар сайхан байгаа тул бид цэцэрлэгт хүрээлэнд зугаална.');
                        }}
                        className="text-left py-2 px-3 bg-surface-container border border-outline-variant rounded-lg hover:border-amber-400 text-xs font-semibold hover:bg-surface-container-high text-on-surface-variant transition-all flex justify-between items-center group cursor-pointer"
                      >
                        <span>🇲🇳 "Өнөөдөр цаг агаар сайхан байгаа тул бид цэцэрлэгт хүрээлэнд зугаална."</span>
                        <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all text-amber-500" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button 
                      onClick={() => translateText()}
                      disabled={translationLoading || !translationInput.trim()}
                      className="px-6 py-3 border-2 border-on-background text-sm font-bold bg-surface text-amber-300 rounded-xl hover:bg-amber-950/20 transition-all cursor-pointer block-shadow flex items-center gap-2 border-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {translationLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-amber-300 border-t-transparent rounded-full animate-spin"></div>
                          Орчуулж байна...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 fill-current text-amber-400" />
                          Нэгдсэн Орчуулга Хийх
                        </>
                      )}
                    </button>
                  </div>

                  {translationError && (
                    <div className="mt-4 p-4 border border-orange-200 bg-orange-50 rounded-xl text-orange-700 text-xs font-bold leading-relaxed flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
                      <span>{translationError}</span>
                    </div>
                  )}

                </div>
              </div>

              {/* Right Side: Translation Details & Deep Linguistic breakdown */}
              <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-6">
                
                {translationLoading ? (
                  <div className="rounded-xl border-2 border-on-background p-8 block-shadow h-[400px] flex flex-col items-center justify-center text-center">
                    <div className="relative mb-6">
                      <div className="w-16 h-16 border-4 border-amber-100 border-t-amber-500 rounded-full animate-spin"></div>
                      <Sparkles className="w-6 h-6 text-amber-400 absolute inset-0 m-auto animate-pulse" />
                    </div>
                    <h3 className="text-lg font-bold text-primary font-space mb-2">Герман Хэлний Үйлчилгээ</h3>
                    <p className="text-xs text-on-surface-variant max-w-xs leading-normal">
                      Өгүүлбэрийг орчуулж, үгс бүрийн үндсэн хэлбэрийг олох болон хэл зүйн бүтцийг судалж байна.
                    </p>
                  </div>
                ) : translationResult ? (
                  <div className="flex flex-col gap-6 animate-scale-up">
                    
                    {/* Translation Core Card */}
                    <div className="rounded-xl border-2 border-on-background p-6 block-shadow">
                      <div className="flex justify-between items-center pb-3 border-b border-outline-variant mb-4">
                        <span className="text-xs font-extrabold uppercase tracking-widest text-[#0c5440] bg-[#e7f7f0] px-2.5 py-1 rounded-md border border-[#bfe9da]">
                          Илэрсэн хэл: {translationResult.detectedLanguage === 'German' ? '🇩🇪 Герман' : '🇲🇳 Монгол'}
                        </span>
                        <div className="flex gap-2">
                          {translationResult.detectedLanguage === 'German' || translationResult.detectedLanguage === 'german' ? (
                            <button 
                              onClick={() => speakGerman(translationInput)}
                              className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-stone-700 cursor-pointer"
                              title="Германаар уншуулах"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button 
                              onClick={() => speakGerman(translationResult.translation)}
                              className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-stone-700 cursor-pointer"
                              title="Орчуулгыг германаар уншуулах"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mb-4">
                        <p className="text-[10px] uppercase font-bold text-outline font-space tracking-wide mb-1">Гүйцэтгэсэн Орчуулга:</p>
                        <p className="text-lg font-black text-on-surface leading-snug">
                          {translationResult.translation}
                        </p>
                      </div>

                      {translationResult.pronunciation && (
                        <div className="mb-1 p-3 bg-surface-container-low border border-outline-variant rounded-lg">
                          <p className="text-[10px] uppercase font-bold text-outline font-space tracking-wide mb-0.5">Унших удирдамж:</p>
                          <code className="text-xs font-mono font-bold text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20">
                            {translationResult.pronunciation}
                          </code>
                        </div>
                      )}
                    </div>

                    {/* Linguistic Grammar Explanation Card */}
                    <div className="rounded-xl border-2 border-on-background p-6 block-shadow">
                      <h3 className="text-sm font-black text-amber-300 font-space mb-3 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-amber-500 fill-amber-300 animate-pulse" />
                        БҮТЭЦ & ДҮРМИЙН ТАЙЛБАР:
                      </h3>
                      <p className="text-xs leading-relaxed text-on-surface-variant font-sans">
                        {translationResult.grammarExplanation}
                      </p>
                    </div>

                    {/* Vocabulary Parsing List */}
                    <div className="rounded-xl border-2 border-on-background p-6 block-shadow">
                      <h3 className="text-sm font-black text-secondary font-space mb-4 pb-2 border-b border-outline-variant uppercase tracking-wider">
                        Үгсийн бүтэц (Дэлгэрэнгүй):
                      </h3>
                      <div className="flex flex-col gap-3">
                        {translationResult.words && translationResult.words.map((w, index) => (
                          <div key={index} className="flex flex-col gap-1 p-2.5 bg-surface-container-low border border-outline-variant rounded-lg text-xs hover:border-amber-400 transition-all">
                            <div className="flex justify-between items-center">
                              <span className="font-extrabold text-on-surface">{w.word}</span>
                              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-teal-100 text-teal-800">
                                {w.partOfSpeech}
                              </span>
                            </div>
                            <div className="text-[11px] text-on-surface-variant flex justify-between mt-1">
                              <span>Толь бичгийн хэлбэр: <strong className="text-amber-300">{w.baseForm}</strong></span>
                              <span>= <strong className="text-on-surface">{w.translation}</strong></span>
                            </div>
                            <p className="text-[10.5px] text-outline leading-normal mt-1 border-t border-dashed border-outline-variant pt-1">
                              {w.explanation}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Context Examples */}
                    {translationResult.examples && translationResult.examples.length > 0 && (
                      <div className="rounded-xl border-2 border-on-background p-6 block-shadow">
                        <h3 className="text-sm font-black text-on-surface font-space mb-3 uppercase tracking-wider">
                          Холбогдох Жишээнүүд:
                        </h3>
                        <div className="space-y-3">
                          {translationResult.examples.map((ex, idx) => (
                            <div key={idx} className="p-3 bg-surface-container-low rounded-xl border border-outline-variant">
                              <p className="text-xs font-bold text-amber-300">🇩🇪 {ex.german}</p>
                              <p className="text-xs text-on-surface-variant mt-1">🇲🇳 {ex.mongolian}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="rounded-xl border-2 border-on-background p-8 block-shadow h-[320px] flex flex-col items-center justify-center text-center relative overflow-hidden group">
                    <div className="w-16 h-16 rounded-full bg-primary-container border border-amber-500/30 flex items-center justify-center text-amber-300 mb-4 transition-all group-hover:scale-110">
                      <Languages className="w-8 h-8 text-amber-400" />
                    </div>
                    <h3 className="text-lg font-bold text-primary font-space mb-2">Үгийн Шинжилгээ Ба Орчуулга</h3>
                    <p className="text-xs text-on-surface-variant max-w-xs leading-normal font-sans">
                      Зүүн талбар дахь өгүүлбэрийг орчуулсны дараа энд дэлгэрэнгүй толь бичиг, дуудлагын зөвлөмжүүд болон дүрэм харагдах болно.
                    </p>
                  </div>
                )}

              </div>

            </div>
          )}

          {/* Tab 8: Шалгалт — CEFR түвшний шалгалтууд (A1–C2) */}
          {activeTab === 'exam' && (
            <div className="w-full pb-24 animate-fade-in">

              {/* Header */}
              <div className="flex items-center gap-3 pb-4 border-b border-outline-variant mb-6 text-primary">
                <GraduationCap className="w-8 h-8 text-amber-400" />
                <div>
                  <h2 className="text-2xl font-extrabold font-space text-on-surface">Шалгалт</h2>
                  <p className="text-xs text-on-surface-variant font-mono">CEFR түвшин (A1–C2) · Унших · Сонсох · Бичих · Ярих</p>
                </div>
              </div>

              {/* LEVEL SELECTOR */}
              {examLevelSel === null && (
                <>
                  {/* Түвшин тогтоох үнэлгээний тест — 4 ур чадвар, CEFR түвшин */}
                  <button onClick={() => setPlacementOpen(true)}
                    className="w-full text-left mb-4 bg-gradient-to-br from-primary-container to-surface-variant border-2 border-on-background rounded-2xl p-5 md:p-6 block-shadow hover:scale-[1.01] active:scale-95 transition-transform cursor-pointer">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-white/15 border-2 border-on-background flex items-center justify-center shrink-0">
                        <Sparkles className="w-7 h-7 text-amber-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg md:text-xl font-black font-space text-white">Түвшин тогтоох тест</h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-300 text-teal-900">Einstufungstest</span>
                        </div>
                        <p className="text-xs text-white/85 leading-relaxed mt-1">Дөрвөн ур чадварыг бүгдийг шалгаад <b className="text-white">CEFR түвшнээ</b> (A1–C2) тогтоолгоно. Асуултууд таны түвшинд автоматаар тохирно. 10–15 минут.</p>
                        <span className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-white bg-white/15 border border-on-background px-3 py-1 rounded-full">Тест эхлүүлэх <ArrowRight className="w-3.5 h-3.5" /></span>
                      </div>
                    </div>
                  </button>

                  {/* TestDaF бүрэн загвар шалгалтын симуляци — Pro ба түүнээс дээш багцад. */}
                  <button onClick={() => fullContent ? setTestdafOpen(true) : setActiveTab('profile')}
                    className="w-full text-left mb-6 bg-gradient-to-br from-secondary-container to-surface-variant border-2 border-on-background rounded-2xl p-5 md:p-6 block-shadow hover:scale-[1.01] active:scale-95 transition-transform cursor-pointer">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-white/15 border-2 border-on-background flex items-center justify-center shrink-0">
                        <GraduationCap className="w-7 h-7 text-amber-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg md:text-xl font-black font-space text-white">TestDaF — Бүрэн загвар шалгалт</h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-300 text-amber-900">Prüfungssimulation</span>
                        </div>
                        <p className="text-xs text-white/85 leading-relaxed mt-1">Жинхэнэ шалгалтын бүтэц: <b className="text-white">Унших</b> 60′/30, <b className="text-white">Сонсох</b> 40′/25, <b className="text-white">Бичих</b> 60′/график-эссэ, <b className="text-white">Ярих</b> 35′/7 ситуаци. Цаг хэмжсэн, дараалсан, AI үнэлгээтэй.</p>
                        <span className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-white bg-white/15 border border-on-background px-3 py-1 rounded-full">
                          {fullContent ? <>Симуляци эхлүүлэх <ArrowRight className="w-3.5 h-3.5" /></> : <><Lock className="w-3.5 h-3.5" /> Pro багцаар нээгдэнэ</>}
                        </span>
                      </div>
                    </div>
                  </button>

                  <p className="text-sm text-on-surface-variant mb-5 max-w-2xl">Эсвэл <b className="text-on-surface">CEFR түвшнээ</b> сонгоно уу. Түвшин бүр <b className="text-on-surface">Унших, Сонсох, Бичих, Ярих</b> гэсэн дөрвөн хэсэгтэй бөгөөд хэсэг бүрт 5+ тест байна. Доош нь A1 хамгийн хялбар, C2 хамгийн хүнд.</p>

                  {/* Free tier: only the first N questions of the bank are open. */}
                  {!fullContent && (
                    <div className="flex items-start gap-3 mb-5 p-4 bg-primary-container/60 border-2 border-on-background rounded-xl block-shadow max-w-2xl">
                      <Lock className="w-5 h-5 text-on-surface shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-extrabold text-on-surface">Үнэгүй эрхээр A1 шалгалт бүрийн (унших/сонсох/бичих/ярих) эхний {FREE_QUESTIONS_PER_SECTION} асуулт нээлттэй.</p>
                        <p className="text-xs text-on-surface-variant mt-1">
                          Бүх түвшний {EXAM_LEVEL_ORDER.reduce((n, lv) => n + EXAMS[lv].reading.length + EXAMS[lv].listening.length + EXAMS[lv].writing.length + EXAMS[lv].speaking.length, 0)} тестийг бүрэн нээхийн тулд{' '}
                          <button onClick={() => setActiveTab('profile')} className="font-bold text-secondary underline cursor-pointer">Pro эсвэл Max багц</button> аваарай.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {EXAM_LEVEL_ORDER.map((lv) => {
                      const ex = EXAMS[lv];
                      const total = ex.reading.length + ex.listening.length + ex.writing.length + ex.speaking.length;
                      return (
                        <button key={lv} onClick={() => { setExamLevelSel(lv); selectExamSection('reading'); }}
                          className="text-left border-2 border-on-background rounded-xl p-5 block-shadow hover:scale-[1.02] active:scale-95 transition-transform cursor-pointer">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-3xl font-black font-space text-on-surface">{lv}</span>
                            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-secondary text-white">{total} тест</span>
                          </div>
                          <p className="text-sm font-extrabold text-secondary mb-1">{ex.titleMn}</p>
                          <p className="text-xs text-on-surface-variant leading-relaxed">{ex.descriptionMn}</p>
                          <div className="flex items-center gap-2 mt-3 text-on-surface-variant">
                            <BookOpen className="w-4 h-4" /><Headphones className="w-4 h-4" /><Edit3 className="w-4 h-4" /><Mic className="w-4 h-4" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* LEVEL EXAM (4 sections, each with 5+ tests) */}
              {examLevelSel !== null && (() => {
                const exam = EXAMS[examLevelSel];
                const items = exam[examSec];
                const item = items[Math.min(examItemIdx, items.length - 1)];
                const answered = examItemAns !== null;
                // Free plan: only the first FREE_QUESTIONS_PER_SECTION questions
                // of each A1 section (reading/listening/writing/speaking).
                const itemLocked = isExamQuestionLocked(currentUser, examLevelSel, examSec, Math.min(examItemIdx, items.length - 1));
                const sections = [
                  { key: 'reading' as const, icon: BookOpen, mn: 'Унших' },
                  { key: 'listening' as const, icon: Headphones, mn: 'Сонсох' },
                  { key: 'writing' as const, icon: Edit3, mn: 'Бичих' },
                  { key: 'speaking' as const, icon: Mic, mn: 'Ярих' },
                ];
                return (
                  <div className="font-sans">
                    {/* Back + level title */}
                    <div className="flex items-center gap-3 mb-4">
                      <button onClick={() => setExamLevelSel(null)}
                        className="px-3 py-2 bg-surface-container text-on-surface border-2 border-on-background rounded-xl font-bold text-xs cursor-pointer block-shadow hover:bg-surface-container-high transition-colors flex items-center gap-1">
                        <ArrowLeft className="w-4 h-4" /> Түвшнүүд
                      </button>
                      <span className="text-lg font-black font-space text-on-surface">{examLevelSel} · {exam.titleMn}</span>
                    </div>

                    {/* Section tabs */}
                    <div className="grid grid-cols-4 gap-2 mb-5">
                      {sections.map((s) => {
                        const Icon = s.icon; const active = examSec === s.key;
                        return (
                          <button key={s.key} onClick={() => selectExamSection(s.key)}
                            className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg border-2 border-on-background cursor-pointer transition-colors ${active ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                            <Icon className="w-4 h-4" />
                            <span className="text-[10px] font-bold font-space">{s.mn} ({exam[s.key].length})</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Test selector chips — a lock marks questions beyond the free limit. */}
                    <div className="flex flex-wrap gap-2 mb-5">
                      {items.map((_, i) => {
                        const locked = isExamQuestionLocked(currentUser, examLevelSel, examSec, i);
                        return (
                          <button key={i} onClick={() => selectExamItem(i)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-on-background text-xs font-bold cursor-pointer transition-colors ${examItemIdx === i ? 'bg-secondary-container text-on-surface' : locked ? 'bg-surface-container text-on-surface-variant opacity-60 hover:opacity-80' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                            {locked && <Lock className="w-3 h-3" />} Тест {i + 1}
                          </button>
                        );
                      })}
                    </div>

                    {/* Detail card */}
                    <div className="border-2 border-on-background rounded-xl p-6 md:p-8 block-shadow">
                      {itemLocked ? renderPlanLockCard(
                        `Тест ${examItemIdx + 1} түгжээтэй`,
                        `Үнэгүй эрхээр A1 шалгалт бүрийн эхний ${FREE_QUESTIONS_PER_SECTION} асуулт нээлттэй. Энэ тестийг нээхийн тулд Pro эсвэл Max багц аваарай.`,
                        'pro',
                      ) : (<>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-space font-bold text-secondary bg-secondary-container border border-on-background px-3 py-1.5 rounded-full">{examLevelSel} · {(item as ExamItem).topic}</span>
                        {(examSec === 'reading' || examSec === 'listening') && (
                          <div className="flex gap-2">
                            {examSec === 'reading' && (
                              <button onClick={() => speakGerman((item as typeof exam.reading[number]).text, audioSpeed === '0.8' ? 0.8 : 1.0)} title="Сонсох"
                                className="p-2 border-2 border-on-background rounded-full bg-surface-container hover:scale-105 transition-transform text-on-surface block-shadow cursor-pointer">
                                <Volume2 className="w-5 h-5" />
                              </button>
                            )}
                            <button onClick={() => setExamItemTrans(v => !v)}
                              className={`px-3 py-1 border-2 border-on-background rounded-full font-bold text-xs block-shadow cursor-pointer hover:scale-105 transition-transform flex items-center gap-1 ${examItemTrans ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface'}`}>
                              <Languages className="w-4 h-4" /> {examItemTrans ? 'Нуух' : (examSec === 'reading' ? 'Орчуулга' : 'Текст')}
                            </button>
                          </div>
                        )}
                      </div>

                      <h3 className="text-xl md:text-2xl font-extrabold text-on-surface mb-1">{(item as ExamItem).titleMn}</h3>
                      <p className="text-xs text-on-surface-variant mb-5">{(item as ExamItem).title}</p>

                      {/* READING */}
                      {examSec === 'reading' && (() => {
                        const r = item as typeof exam.reading[number];
                        const sq = shuffleQuiz(`exam:${exam.level}:reading:${r.id}`, { question: r.question, choices: r.choices, correctIndex: r.correctIndex });
                        return (
                          <>
                            <p className="text-lg leading-relaxed text-on-surface whitespace-pre-line font-medium">{r.text}</p>
                            {examItemTrans && <p className="text-sm leading-relaxed text-on-surface-variant whitespace-pre-line mt-4 pt-4 border-t border-outline-variant/50 italic">{r.translation}</p>}
                            <div className="mt-6 pt-5 border-t border-outline-variant">
                              <p className="text-xs font-space font-bold uppercase text-primary mb-2">Ойлголт шалгах:</p>
                              <p className="text-base font-bold text-on-surface mb-3">{r.question}</p>
                              <MCQBlock
                                choices={sq.choices}
                                correctIndex={sq.correctIndex}
                                selectedAnswer={examItemAns}
                                onSelect={(index) => {
                                  setExamItemAns(index);
                                  if (index === sq.correctIndex) recordStudyActivity(activityKey(`exam:${exam.level}:reading`, r.id));
                                }}
                              />
                            </div>
                          </>
                        );
                      })()}

                      {/* LISTENING */}
                      {examSec === 'listening' && (() => {
                        const l = item as typeof exam.listening[number];
                        const sq = shuffleQuiz(`exam:${exam.level}:listening:${l.id}`, { question: l.question, choices: l.choices, correctIndex: l.correctIndex });
                        return (
                          <>
                            <div className="flex flex-col items-center gap-3 py-6 bg-surface-container-low border-2 border-on-background rounded-xl mb-5">
                              <button onClick={() => speakGerman(l.audioText, audioSpeed === '0.8' ? 0.8 : 1.0)}
                                className="w-16 h-16 rounded-full bg-secondary text-white border-2 border-on-background flex items-center justify-center cursor-pointer hover:scale-105 transition-transform block-shadow">
                                <Volume2 className="w-7 h-7" />
                              </button>
                              <p className="text-xs text-on-surface-variant">Бичлэгийг сонсохын тулд дарна уу (2 удаа)</p>
                            </div>
                            {examItemTrans && (
                              <div className="bg-surface-container-low border-l-4 border-secondary rounded-lg p-3 mb-5">
                                <p className="text-sm text-on-surface font-medium">{l.audioText}</p>
                                <p className="text-xs text-on-surface-variant mt-2 pt-2 border-t border-outline-variant/50 italic">{l.transcriptMn}</p>
                              </div>
                            )}
                            <div className="pt-5 border-t border-outline-variant">
                              <p className="text-xs font-space font-bold uppercase text-primary mb-2">Ойлголт шалгах:</p>
                              <p className="text-base font-bold text-on-surface mb-3">{l.question}</p>
                              <MCQBlock
                                choices={sq.choices}
                                correctIndex={sq.correctIndex}
                                selectedAnswer={examItemAns}
                                onSelect={(index) => {
                                  setExamItemAns(index);
                                  if (index === sq.correctIndex) recordStudyActivity(activityKey(`exam:${exam.level}:listening`, l.id));
                                }}
                              />
                            </div>
                          </>
                        );
                      })()}

                      {/* WRITING */}
                      {examSec === 'writing' && (() => {
                        const w = item as typeof exam.writing[number];
                        const words = examItemWrite.trim() ? examItemWrite.trim().split(/\s+/).length : 0;
                        return (
                          <>
                            <div className="bg-surface-container-low rounded-lg p-4 mb-4">
                              <p className="text-xs font-space font-bold uppercase text-primary mb-1">Даалгавар:</p>
                              <p className="text-sm font-bold text-on-surface mb-2">{w.prompt}</p>
                              <ul className="text-xs text-on-surface-variant space-y-1 list-disc list-inside">{w.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
                            </div>
                            <textarea value={examItemWrite} onChange={(e) => setExamItemWrite(e.target.value)} placeholder="Энд герман хэлээр бичнэ үү..." rows={6} maxLength={2000}
                              className="w-full px-3 py-2 text-sm border-2 border-on-background rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline outline-none focus:border-secondary resize-y" />
                            <div className="flex items-center justify-between mt-3">
                              <span className="text-[11px] text-on-surface-variant">{words} үг</span>
                              <button onClick={() => setExamItemReveal(v => !v)}
                                className="px-4 py-2 bg-surface-container text-primary border-2 border-on-background rounded-lg font-bold text-xs cursor-pointer block-shadow hover:scale-[1.02] transition-transform flex items-center gap-1">
                                <Lightbulb className="w-3.5 h-3.5 text-amber-400 fill-current" /> {examItemReveal ? 'Загварыг нуух' : 'Загвар хариулт харах'}
                              </button>
                            </div>
                            {examItemReveal && (
                              <div className="bg-secondary-container/40 border-2 border-secondary rounded-lg p-4 mt-4">
                                <p className="text-[10px] font-bold uppercase text-secondary mb-1">Загвар хариулт:</p>
                                <p className="text-sm text-on-surface whitespace-pre-line leading-relaxed font-medium">{w.modelAnswer}</p>
                                <p className="text-xs text-on-surface-variant whitespace-pre-line leading-relaxed mt-2 pt-2 border-t border-secondary/30 italic">{w.modelMn}</p>
                              </div>
                            )}

                            {/* AI writing check for the exam writing task. */}
                            {renderWritingChecker(examItemWrite, { prompt: w.prompt, points: w.points, modelAnswer: w.modelAnswer, level: w.level })}
                          </>
                        );
                      })()}

                      {/* SPEAKING */}
                      {examSec === 'speaking' && (() => {
                        const sp = item as typeof exam.speaking[number];
                        return (
                          <>
                            <div className="bg-surface-container-low border-l-4 border-secondary rounded-lg p-4 mb-5">
                              <p className="text-xs font-space font-bold uppercase text-primary mb-1">Даалгавар:</p>
                              <p className="text-base font-bold text-on-surface">{sp.prompt}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mb-5">
                              <button onClick={() => speakGerman(sp.modelAnswer, 1.0)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-white border-2 border-on-background rounded-lg font-bold text-sm cursor-pointer block-shadow hover:scale-[1.02] active:scale-95 transition-transform">
                                <Volume2 className="w-4 h-4" /> Загварыг сонсох
                              </button>
                              <button onClick={() => setExamItemReveal(v => !v)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-surface-container text-primary border-2 border-on-background rounded-lg font-bold text-sm cursor-pointer block-shadow hover:scale-[1.02] transition-transform">
                                <Lightbulb className="w-4 h-4 text-amber-400 fill-current" /> {examItemReveal ? 'Нуух' : 'Загвар хариулт харах'}
                              </button>
                            </div>
                            <div className="mb-2">
                              <p className="text-[11px] font-space font-bold uppercase text-on-surface-variant mb-2">Хэрэгтэй хэллэг:</p>
                              <div className="flex flex-col gap-1.5">{sp.tips.map((t, i) => <div key={i} className="flex items-start gap-2 text-xs text-on-surface"><span className="text-secondary font-black">›</span>{t}</div>)}</div>
                            </div>
                            {examItemReveal && (
                              <div className="bg-secondary-container/40 border-2 border-secondary rounded-lg p-4 mt-4">
                                <p className="text-[10px] font-bold uppercase text-secondary mb-1">Загвар хариулт:</p>
                                <p className="text-base text-on-surface font-medium leading-relaxed">{sp.modelAnswer}</p>
                                <p className="text-xs text-on-surface-variant mt-2 italic leading-relaxed">{sp.modelMn}</p>
                              </div>
                            )}
                            <p className="text-[11px] text-on-surface-variant mt-4 italic">Зөвлөмж: эхлээд өөрөө чангаар хэлж үзээд, дараа нь загвартай харьцуулаарай.</p>

                            {/* AI judge for exam speaking — graded against this item's model answer. */}
                            {renderSpeakingJudge(sp.modelAnswer)}
                            {renderSpeakingReport(sp.modelAnswer)}
                          </>
                        );
                      })()}
                      </>)}
                    </div>

                    {/* Prev / Next navigation */}
                    <div className="flex justify-between items-center mt-6 pt-4 border-t border-outline-variant/50">
                      <button
                        onClick={() => selectExamItem(examItemIdx - 1)}
                        disabled={examItemIdx === 0}
                        className={`flex items-center gap-1 px-4 py-2.5 border-2 border-on-background rounded-xl font-bold text-xs block-shadow transition-colors ${examItemIdx === 0 ? 'opacity-40 cursor-not-allowed bg-surface-container text-on-surface-variant' : 'bg-surface-container text-on-surface cursor-pointer hover:bg-surface-container-high'}`}
                      >
                        <ArrowLeft className="w-4 h-4" /> Өмнөх
                      </button>
                      <span className="text-xs text-on-surface-variant font-space font-bold">{examItemIdx + 1} / {items.length}</span>
                      <button
                        onClick={() => selectExamItem(examItemIdx + 1)}
                        disabled={examItemIdx >= items.length - 1}
                        className={`flex items-center gap-1 px-4 py-2.5 border-2 border-on-background rounded-xl font-bold text-xs block-shadow transition-colors ${examItemIdx >= items.length - 1 ? 'opacity-40 cursor-not-allowed bg-surface-container text-on-surface-variant' : 'bg-secondary text-white cursor-pointer hover:scale-[1.02]'}`}
                      >
                        Дараах <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Legacy A1 model-test panel — superseded by the level-based exams above. */}

          {/* Special view Module: Settings (Тохиргоо) view panel */}
          {activeTab === 'settings' && (
            <div className="max-w-xl mx-auto w-full border-2 border-on-background rounded-xl p-8 block-shadow animate-fade-in pb-24">
              <div className="flex items-center gap-3 pb-4 border-b border-outline-variant mb-6 text-primary">
                <Settings className="w-6 h-6 outline" />
                <h2 className="text-2xl font-extrabold font-space">Тохиргоо ба Хувийн Төлөв</h2>
              </div>

              <div className="space-y-6 font-sans">
                {/* 1. Profile editor — avatar, name, level, daily goal, learning goal */}
                {profileDraft && currentUser && (
                  <div className="space-y-5 bg-surface-container-low p-4 md:p-5 rounded-xl border-2 border-on-background block-shadow">
                    <div className="flex items-center gap-2 text-primary">
                      <Target className="w-5 h-5" />
                      <h4 className="text-sm font-space font-bold uppercase tracking-wide">Профайл</h4>
                    </div>

                    {/* Avatar + name */}
                    <div className="flex items-center gap-4">
                      <div className="relative shrink-0">
                        <div className="w-20 h-20 rounded-full overflow-hidden bg-surface-container border-2 border-on-background block-shadow">
                          <img src={profileDraft.avatar} alt={profileDraft.name} className="w-full h-full object-cover" />
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAvatarPicker((v) => !v)}
                          className="absolute -bottom-1 -right-1 p-1.5 bg-secondary text-on-secondary rounded-full border-2 border-on-background block-shadow cursor-pointer hover:opacity-90"
                          aria-label="Зураг солих"
                        >
                          <Camera className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="text-[11px] font-bold uppercase text-outline font-space">Нэр</label>
                        <input
                          type="text"
                          value={profileDraft.name}
                          maxLength={30}
                          onChange={(e) => setProfileDraft((d) => d && { ...d, name: e.target.value })}
                          className="w-full mt-1 px-3 py-2 bg-surface-container border-2 border-on-background rounded-xl text-on-surface font-bold outline-none focus:border-secondary"
                          placeholder="Таны нэр"
                        />
                      </div>
                    </div>

                    {/* Avatar picker grid */}
                    {showAvatarPicker && (
                      <div className="space-y-3 p-3 bg-surface-container rounded-xl border border-outline-variant">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-bold uppercase text-outline font-space">Зургаа сонгох эсвэл оруулах</span>
                          <div className="flex items-center gap-2">
                            <input
                              ref={avatarFileInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              onChange={handleAvatarUpload}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => avatarFileInputRef.current?.click()}
                              disabled={avatarUploading}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-on-secondary border-2 border-on-background rounded-lg text-xs font-bold cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {avatarUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                              Зураг оруулах
                            </button>
                            <button
                              type="button"
                              onClick={() => setAvatarPage((p) => p + 1)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-low border-2 border-on-background rounded-lg text-xs font-bold cursor-pointer hover:bg-secondary/10"
                            >
                              <Shuffle className="w-3.5 h-3.5" /> Шинэчлэх
                            </button>
                          </div>
                        </div>
                        {avatarError && <p className="text-[11px] text-red-300 font-semibold">{avatarError}</p>}
                        <div className="flex flex-wrap gap-1.5">
                          {AVATAR_STYLES.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => { setAvatarStyle(s.id); setAvatarPage(0); }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border-2 cursor-pointer transition-all ${avatarStyle === s.id ? 'bg-secondary text-on-secondary border-on-background' : 'bg-surface-container-low border-on-background text-on-surface hover:bg-secondary/10'}`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                          {avatarOptions(currentUser.email, avatarPage, avatarStyle).map((url) => {
                            const selected = profileDraft.avatar === url;
                            return (
                              <button
                                key={url}
                                type="button"
                                onClick={() => setProfileDraft((d) => d && { ...d, avatar: url })}
                                className={`relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${selected ? 'border-secondary ring-2 ring-secondary/40' : 'border-on-background hover:border-secondary/60'}`}
                              >
                                <img src={url} alt="avatar" className="w-full h-full object-cover bg-surface-container-low" />
                                {selected && (
                                  <span className="absolute top-0.5 right-0.5 bg-secondary text-on-secondary rounded-full p-0.5">
                                    <Check className="w-3 h-3" />
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Target level */}
                    <div>
                      <label className="text-[11px] font-bold uppercase text-outline font-space">Зорилтот түвшин</label>
                      <div className="grid grid-cols-6 gap-1.5 mt-1.5">
                        {(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setProfileDraft((d) => d && { ...d, targetLevel: lvl })}
                            className={`py-2 rounded-lg text-sm font-black border-2 cursor-pointer transition-all ${profileDraft.targetLevel === lvl ? 'bg-secondary text-on-secondary border-on-background' : 'bg-surface-container border-on-background text-on-surface hover:bg-secondary/10'}`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Daily goal */}
                    <div>
                      <label className="text-[11px] font-bold uppercase text-outline font-space">Өдрийн зорилго</label>
                      <div className="grid grid-cols-5 gap-1.5 mt-1.5">
                        {[5, 10, 15, 30, 60].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setProfileDraft((d) => d && { ...d, dailyGoalMinutes: m })}
                            className={`py-2 rounded-lg text-xs font-bold border-2 cursor-pointer transition-all ${profileDraft.dailyGoalMinutes === m ? 'bg-secondary text-on-secondary border-on-background' : 'bg-surface-container border-on-background text-on-surface hover:bg-secondary/10'}`}
                          >
                            {m}<span className="text-[9px]">мин</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Learning goal */}
                    <div>
                      <label className="text-[11px] font-bold uppercase text-outline font-space">Суралцах зорилго</label>
                      <textarea
                        value={profileDraft.learningGoal}
                        maxLength={280}
                        rows={3}
                        onChange={(e) => setProfileDraft((d) => d && { ...d, learningGoal: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-surface-container border-2 border-on-background rounded-xl text-on-surface text-sm outline-none focus:border-secondary resize-none"
                        placeholder="Жишээ: Goethe B1 шалгалт өгөх"
                      />
                      <p className="text-right text-[10px] text-outline mt-0.5">{profileDraft.learningGoal.length}/280</p>
                    </div>

                    {/* Save */}
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={saveProfileEdits}
                        disabled={profileSaving || !profileDraft.name.trim()}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-secondary text-on-secondary font-black rounded-xl border-2 border-on-background block-shadow cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : profileSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {profileSaved ? 'Хадгалагдлаа' : 'Хадгалах'}
                      </button>
                      {profileSaveError && <p className="text-center text-[11px] text-red-300 font-semibold">Хадгалж чадсангүй. Дахин оролдоно уу.</p>}
                    </div>
                  </div>
                )}

                {/* 2. Interactive toggles state */}
                <div className="space-y-4">
                  <h4 className="text-xs font-space font-bold uppercase text-outline">Хичээлийн тохируулга:</h4>
                  
                  <div className="flex justify-between items-center p-3 border-2 border-on-background rounded-xl select-none block-shadow">
                    <div>
                      <h5 className="text-sm font-bold">Орчуулга автоматаар харуулах</h5>
                      <p className="text-[11px] text-outline">Унших, сонсох зохиолд орчуулгыг шууд харуулна. Унтраалттай үед эхлээд өөрөө уншиж, гацсан үедээ "Орчуулга" товчоор нээнэ.</p>
                    </div>
                    <button
                      onClick={() => setReadTranslateEnabled(prev => { const next = !prev; setLibReadTrans(next); setLibListenTrans(next); return next; })}
                      className={`w-12 h-6 rounded-full transition-colors relative border border-on-background block-shadow cursor-pointer ${
                        readTranslateEnabled ? 'bg-secondary' : 'bg-slate-300'
                      }`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-[3px] transition-all ${
                        readTranslateEnabled ? 'left-6' : 'left-1'
                      }`}></div>
                    </button>
                  </div>

                  <div className="flex justify-between items-center p-3 border-2 border-on-background rounded-xl select-none block-shadow">
                    <div>
                      <h5 className="text-sm font-bold">Удаан хэмнэлтийн сонсох зам</h5>
                      <p className="text-[11px] text-outline">Сонсох СД зам дээр Германы хурдыг 0.8х дээр удирдах тохиргоо.</p>
                    </div>
                    <button 
                      onClick={() => setAudioSpeed(prev => prev === '1.0' ? '0.8' : '1.0')}
                      className={`w-12 h-6 rounded-full transition-colors relative border border-on-background block-shadow cursor-pointer ${
                        audioSpeed === '0.8' ? 'bg-secondary' : 'bg-slate-300'
                      }`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-[3px] transition-all ${
                        audioSpeed === '0.8' ? 'left-6' : 'left-1'
                      }`}></div>
                    </button>
                  </div>

                  <div className="flex justify-between items-center p-3 border-2 border-on-background rounded-xl select-none block-shadow">
                    <div>
                      <h5 className="text-sm font-bold">Streak автоматаар тооцох</h5>
                      <p className="text-[11px] text-outline">Зөв дуусгасан дасгалтай өдөр streak-д автоматаар орно.</p>
                    </div>
                    <span className="font-bold text-sm bg-surface-container px-3 py-1 border border-on-background rounded-lg">{streak} өдөр</span>
                  </div>
                </div>

                {/* 3. Account essentials */}
                <div className="space-y-3">
                  <h4 className="text-xs font-space font-bold uppercase text-outline">Бүртгэл:</h4>
                  <div className="flex items-center justify-between p-3 border-2 border-on-background rounded-xl block-shadow">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="w-4 h-4 text-outline shrink-0" />
                      <span className="text-sm font-bold text-on-surface truncate">{currentUser?.email}</span>
                    </div>
                    <span className="text-[10px] text-outline font-mono shrink-0 ml-2">Имэйл</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="w-full flex items-center justify-between p-3 border-2 border-on-background rounded-xl block-shadow cursor-pointer hover:bg-secondary/5 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-sm font-bold text-on-surface"><Lock className="w-4 h-4 text-outline" /> Нууц үг солих</span>
                    <span className="text-[11px] text-secondary font-bold shrink-0 ml-2">{resetSent ? 'Имэйл илгээлээ ✓' : 'Имэйл авах'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={logoutUser}
                    className="w-full flex items-center justify-center gap-2 p-3 bg-red-950/20 border-2 border-red-500/40 text-red-300 font-bold rounded-xl cursor-pointer hover:bg-red-900/30 transition-all"
                  >
                    <LogOut className="w-4 h-4" /> Гарах
                  </button>
                </div>

                {/* Explanations instructions */}
                <div className="bg-surface-container-low border border-outline-variant p-4 rounded-xl text-center">
                  <p className="text-xs text-on-surface-variant leading-snug">
                    Vivid Lingua аппликэйшний бүхий л хичээлийн загваруудыг цээжлүүлэн бэлтгэлээ. Та settings цэсийг ашиглан хичээлийн удирдамжийг хялбархан тааруулж болно.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Interactive Sticky Navbar (Mobile Only) - matches screen specs */}
          <nav aria-label="Mobile Navigation Drawer" className="md:hidden fixed bottom-0 left-0 w-full bg-primary border-t-2 border-on-background z-40 pb-safe">
            <div className="flex justify-around items-center h-16">
              
              <button 
                onClick={() => selectTab('read')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 relative cursor-pointer ${
                  activeTab === 'read' ? 'text-secondary-fixed' : 'text-on-primary-container'
                }`}
              >
                {activeTab === 'read' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-secondary-fixed rounded-b-full"></div>}
                <BookOpen className="w-5 h-5" />
                <span className="text-[10px] font-bold font-space">Унших</span>
              </button>

              <button 
                onClick={() => selectTab('listen')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 relative cursor-pointer ${
                  activeTab === 'listen' ? 'text-secondary-fixed' : 'text-on-primary-container'
                }`}
              >
                {activeTab === 'listen' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-secondary-fixed rounded-b-full"></div>}
                <Headphones className="w-5 h-5" />
                <span className="text-[10px] font-bold font-space">Сонсох</span>
              </button>

              <button 
                onClick={() => selectTab('speak')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 relative cursor-pointer ${
                  activeTab === 'speak' ? 'text-secondary-fixed' : 'text-on-primary-container'
                }`}
              >
                {activeTab === 'speak' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-secondary-fixed rounded-b-full"></div>}
                <Mic className="w-5 h-5" />
                <span className="text-[10px] font-bold font-space">Ярих</span>
              </button>

              <button 
                onClick={() => selectTab('write')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 relative cursor-pointer ${
                  activeTab === 'write' ? 'text-secondary-fixed' : 'text-on-primary-container'
                }`}
              >
                {activeTab === 'write' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-secondary-fixed rounded-b-full"></div>}
                <Edit3 className="w-5 h-5" />
                <span className="text-[10px] font-bold font-space">Бичих</span>
              </button>

              <button 
                onClick={() => selectTab('vocab')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 relative cursor-pointer ${
                  activeTab === 'vocab' ? 'text-secondary-fixed' : 'text-on-primary-container'
                }`}
              >
                {activeTab === 'vocab' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-secondary-fixed rounded-b-full"></div>}
                <Languages className="w-5 h-5" />
                <span className="text-[10px] font-bold font-space font-medium">Үгс</span>
              </button>

              <button 
                onClick={() => selectTab('translate')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 relative cursor-pointer ${
                  activeTab === 'translate' ? 'text-amber-400' : 'text-on-primary-container'
                }`}
              >
                {activeTab === 'translate' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-amber-400 rounded-b-full text-amber-400"></div>}
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span className="text-[10px] font-bold font-space">Орч</span>
              </button>

              <button 
                onClick={() => selectTab('exam')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 relative cursor-pointer ${
                  activeTab === 'exam' ? 'text-secondary-fixed' : 'text-on-primary-container'
                }`}
              >
                {activeTab === 'exam' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-secondary-fixed rounded-b-full text-secondary-fixed"></div>}
                <GraduationCap className="w-5 h-5 text-amber-400" />
                <span className="text-[10px] font-bold font-space">Сорил</span>
              </button>

              <button
                onClick={() => selectTab('friends')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 relative cursor-pointer ${
                  activeTab === 'friends' ? 'text-secondary-fixed' : 'text-on-primary-container'
                }`}
              >
                {activeTab === 'friends' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-secondary-fixed rounded-b-full"></div>}
                <Swords className="w-5 h-5 text-amber-400" />
                <span className="text-[10px] font-bold font-space">Найз</span>
              </button>
            </div>
          </nav>

        </div>
      </main>
    </div>
  );
}
