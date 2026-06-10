import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Volume2, Play, Pause, CheckCircle, X, XCircle, AlertCircle,
  BookOpen, Headphones, Mic, Edit3, Languages, Settings, LogOut,
  Check, RotateCcw, Lightbulb, Flame, Award, ArrowRight, ArrowLeft,
  ChevronRight, Sparkles, HelpCircle, GraduationCap, ExternalLink, Search, Library,
  Square, AudioLines, Gauge, SpellCheck, MessageSquareText, ThumbsUp, Target,
  Mail, Lock, Loader2, QrCode, CreditCard, Shield, Calendar, Clock, Zap,
  ListChecks, BarChart3
} from 'lucide-react';
import { TabType, VocabularyWord, WordClass, CEFRLevel } from './types';
import { DICTIONARY } from './data';
import {
  READING_LIBRARY, LISTENING_LIBRARY, WRITING_LIBRARY, SPEAKING_LIBRARY,
  Level, ReadingItem, ListeningItem, WritingItem, SpeakingItem
} from './library';
import { EXAMS, EXAM_LEVEL_ORDER, ExamLevel } from './exams';
import TestDafExam from './TestDafExam';
import AdminDashboard from './AdminDashboard';
import { UserProfile, DEFAULT_PROFILES } from './profiles';
import LoginScreen from './LoginScreen';
import {
  subscribeToAuthedProfile, logOutUser, saveProfileProgress,
} from './auth';
import { isFirebaseConfigured, getStorageInstance, getAuthInstance } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  SrsMap, reviewSrs, srsWordKey, orderTrainerWords, countDueWords, isDue,
  calculateStreakWithGrace, StreakResult,
  buildUnitsForLevel, unitProgress, isUnitPassed, isUnitUnlocked, lockedItemIds, Unit, UnitActivity, UNIT_PASS_RATIO,
  addMistake, clearMistake, resolveMistakes, MistakeRef,
  buildTodaySession, TodaySession,
  localDateKey as learningLocalDateKey,
} from './learning';
import { buildInflectedLookup } from './inflect';
import OnboardingWizard from './OnboardingWizard';
import PlacementTest from './PlacementTest';
import { isFounderEmail } from './placement';
import GrammarTipCard from './GrammarTipCard';

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

const TRAINER_WORDS = DICTIONARY.filter((w) => w.mongolian.trim().length > 0);

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

// Rich AI feedback returned by /api/evaluate-speaking. All text fields are
// Mongolian except `transcript` (German). Optional fields keep the older
// text-only response shape working.
interface SpeakingEvaluation {
  isCorrect: boolean;
  feedbackMessage: string;
  analysis: string;
  transcript?: string;
  overallScore?: number;
  pronunciationScore?: number;
  fluencyScore?: number;
  accentNote?: string;
  pronunciationFeedback?: string;
  grammarFeedback?: string;
  vocabularyFeedback?: string;
  strengths?: string[];
  improvements?: string[];
}

// Rich free-writing feedback from /api/evaluate-composition. Mongolian text
// fields, except `corrected` and each correction's German fragments. Used by the
// writing library and every exam writing task to flag wrong grammar / wrong
// words and recommend better wording.
interface WritingCorrection {
  original: string;     // the wrong German fragment the learner wrote
  suggestion: string;   // the corrected / better German fragment
  type: string;         // grammar | vocabulary | spelling | style
  explanation: string;  // short Mongolian reason
}
interface WritingFeedback {
  isCorrect: boolean;
  feedbackMessage: string;
  analysis: string;
  corrected: string;
  corrections?: WritingCorrection[];
  overallScore?: number;
  grammarScore?: number;
  vocabularyScore?: number;
  grammarFeedback?: string;
  vocabularyFeedback?: string;
  strengths?: string[];
  improvements?: string[];
}

interface PaymentMethodsResponse {
  plan: {
    plan: string;
    amountMnt: number | null;
    currency: string;
    interval: string;
  };
  qpay: {
    status: 'ready' | 'needs_config';
    missing: string[];
    supports: string[];
  };
  alternatives: Array<{
    id: string;
    name: string;
    status: string;
    supports: string[];
    note: string;
  }>;
}

interface QPayCheckoutResponse {
  provider: 'qpay';
  senderInvoiceNo: string;
  providerInvoiceId: string;
  plan: string;
  amountMnt: number;
  currency: 'MNT';
  qrText?: string;
  qrImage?: string;
  shortUrl?: string;
  urls?: Array<{ name?: string; description?: string; link?: string }>;
}

function formatMnt(amountMnt: number | null | undefined): string {
  if (!amountMnt) return 'Үнэ тохируулаагүй';
  return new Intl.NumberFormat('mn-MN', {
    style: 'currency',
    currency: 'MNT',
    maximumFractionDigits: 0,
  }).format(amountMnt);
}

function qpayQrImageSrc(qrImage?: string): string | null {
  if (!qrImage) return null;
  if (qrImage.startsWith('data:') || qrImage.startsWith('http')) return qrImage;
  return `data:image/png;base64,${qrImage}`;
}

async function audioBlobToWavBlob(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new AudioCtx();
  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  ctx.close();

  const targetRate = 16000;
  const srcRate = decoded.sampleRate;
  const srcData = decoded.getChannelData(0); // mono: first channel is enough
  const ratio = srcRate / targetRate;
  const outLen = Math.floor(srcData.length / ratio);
  const samples = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const s = srcData[Math.floor(i * ratio)] || 0;
    samples[i] = Math.max(-1, Math.min(1, s)) * 0x7fff;
  }

  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  const dataLen = samples.length * bytesPerSample;
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataLen, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * bytesPerSample, true); view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true); writeStr(36, 'data'); view.setUint32(40, dataLen, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i], true);

  return new Blob([buffer], { type: 'audio/wav' });
}

// Decode a recorded audio Blob (webm/opus, mp4/aac, …) and re-encode it as a
// 16 kHz mono 16-bit WAV, returned base64-encoded. WAV is the format Gemini
// reliably accepts, so this sidesteps browser codec/container differences.
async function audioBlobToWavBase64(blob: Blob): Promise<string> {
  const wavBlob = await audioBlobToWavBlob(blob);
  const arrayBuffer = await wavBlob.arrayBuffer();
  // Base64-encode the WAV bytes in chunks (avoids call-stack limits on big files).
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

// Level filter chips shared by every skill-library browser.
const LIB_LEVELS: (Level | 'all')[] = ['all', 'A1', 'A2', 'B1'];

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
const LEVEL_OPTIONS: (CEFRLevel | 'all')[] = ['all', 'A1', 'A2', 'B1', 'B2'];

interface MCQBlockProps {
  choices: string[];
  correctIndex: number;
  selectedAnswer: number | null;
  onSelect: (index: number) => void;
  feedbackText?: string;
}

function MCQBlock({
  choices,
  correctIndex,
  selectedAnswer,
  onSelect,
  feedbackText
}: MCQBlockProps) {
  const answered = selectedAnswer !== null;
  const isCorrect = selectedAnswer === correctIndex;
  
  const displayFeedback = feedbackText !== undefined
    ? feedbackText
    : (isCorrect ? 'Та зөв сонголтыг хийлээ.' : `Зөв хариулт нь: "${choices[correctIndex]}"`);

  return (
    <>
      <div className="flex flex-col gap-4">
        {choices.map((c, i) => {
          const isSel = selectedAnswer === i;
          const isOptionCorrect = i === correctIndex;
          
          let containerClass = "bg-white";
          let circleClass = "bg-white";
          let borderEffect = null;
          
          if (answered) {
            if (isOptionCorrect) {
              containerClass = "bg-secondary-container text-on-secondary-fixed border-secondary";
              circleClass = "bg-secondary text-white";
              borderEffect = <div className="absolute inset-0 border-2 border-secondary rounded-xl pointer-events-none"></div>;
            } else if (isSel) {
              containerClass = "bg-error-container text-on-error-container border-error";
              circleClass = "bg-error text-white";
              borderEffect = <div className="absolute inset-0 border-2 border-error rounded-xl pointer-events-none"></div>;
            } else {
              containerClass = "bg-white opacity-60 border-on-background/40";
            }
          }
          
          return (
            <button
              key={i}
              disabled={answered}
              onClick={() => { if (!answered) onSelect(i); }}
              className={`relative flex items-center p-4 border-2 border-on-background rounded-xl text-left transition-all group block-shadow select-none text-body-md font-bold text-on-surface ${
                !answered ? 'cursor-pointer hover:bg-surface-container hover:text-primary' : 'cursor-default'
              } ${containerClass}`}
            >
              <div className={`w-6 h-6 rounded-full border-2 border-on-background mr-4 flex items-center justify-center shrink-0 transition-all ${circleClass}`}>
                {answered && isOptionCorrect && <Check className="w-4 h-4 stroke-[3px]" />}
                {answered && isSel && !isOptionCorrect && <X className="w-4 h-4 stroke-[3px]" />}
              </div>
              <span className="flex-grow">{c}</span>
              {borderEffect}
            </button>
          );
        })}
      </div>
      
      {answered && (
        <div className={`mt-6 p-4 rounded-xl border-2 border-on-background animate-fade-in ${
          isCorrect ? 'bg-secondary-container text-on-secondary-fixed border-on-secondary-container' : 'bg-error-container text-on-error-container border-on-error-container'
        }`}>
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-2xl font-bold fill mt-0.5">
              {isCorrect ? 'check_circle' : 'cancel'}
            </span>
            <div>
              <h4 className="font-extrabold text-[15px]">
                {isCorrect ? 'Сүрхий зөв хариуллаа!' : 'Өө, буруу хувилбар! Дахин оролдоод үзээрэй.'}
              </h4>
              <p className="text-xs mt-1 leading-normal font-mono whitespace-pre-line">
                {displayFeedback}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  if (window.location.pathname.startsWith('/admin')) {
    return <AdminDashboard />;
  }

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
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodsResponse | null>(null);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
  const [paymentActionLoading, setPaymentActionLoading] = useState(false);
  const [paymentStatusLoading, setPaymentStatusLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [qpayCheckout, setQpayCheckout] = useState<QPayCheckoutResponse | null>(null);

  // Session & UI States
  const [activeTab, setActiveTab] = useState<TabType>('read');
  const [streak, setStreak] = useState<number>(isTest ? DEFAULT_PROFILES[0].streak : 0);
  const [lessonProgress, setLessonProgress] = useState<number>(isTest ? DEFAULT_PROFILES[0].progress : 0);
  const [completedActivityIds, setCompletedActivityIds] = useState<string[]>([]);
  const [studyDays, setStudyDays] = useState<string[]>([]);
  const [studySecondsByDate, setStudySecondsByDate] = useState<Record<string, number>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentUserRef = useRef<UserProfile | null>(currentUser);
  const activeTabRef = useRef<TabType>(activeTab);
  const studySecondsRef = useRef<Record<string, number>>(studySecondsByDate);
  const lastInteractionRef = useRef(Date.now());
  const pendingStudySaveSecondsRef = useRef(0);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

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
        setCurrentUser(normalizedProfile);
        setStreak(normalizedProfile.streak);
        setLessonProgress(normalizedProfile.progress);
        setCompletedActivityIds(normalizedProfile.completedActivityIds ?? []);
        setStudyDays(normalizedProfile.studyDays ?? []);
        setStudySecondsByDate(normalizedProfile.studySecondsByDate ?? {});
        setActiveTab('profile');
      } else {
        setCurrentUser(null);
        setCompletedActivityIds([]);
        setStudyDays([]);
        setStudySecondsByDate({});
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
  const [libReadAnswer, setLibReadAnswer] = useState<number | null>(null);
  // Translation starts hidden so the learner reads/attempts first and only
  // reveals the Mongolian once stuck. Follows the "auto-show" setting if the
  // user opts into always-on translations.
  const [libReadTrans, setLibReadTrans] = useState<boolean>(readTranslateEnabled);
  const [libReadLevel, setLibReadLevel] = useState<Level | 'all'>('all');

  const [libListenId, setLibListenId] = useState<number>(LISTENING_LIBRARY[0].id);
  const [libListenAnswer, setLibListenAnswer] = useState<number | null>(null);
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
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioSpeed, setAudioSpeed] = useState<'0.8' | '1.0'>('1.0');
  const [audioDurationPercent, setAudioDurationPercent] = useState(0);
  const [waveformWave, setWaveformWave] = useState<number[]>([]);
  const listeningAudioInterval = useRef<any>(null);

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
  const [vocabTotalCount] = useState(TRAINER_WORDS.length);

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
    });
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


  const translateText = async (textToTranslate?: string) => {
    const targetText = textToTranslate !== undefined ? textToTranslate : translationInput;
    if (!targetText.trim()) return;

    setTranslationLoading(true);
    setTranslationError(null);
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: targetText })
      });

      if (!response.ok) {
        throw new Error('Орчуулгын серверээс алдаа ирлээ.');
      }

      const data = await response.json();
      setTranslationResult(data);
    } catch (err: any) {
      console.error(err);
      setTranslationError('Орчуулга түр амжилтгүй боллоо. Сүлжээгээ шалгаад хэсэг хугацааны дараа дахин оролдоно уу.');
    } finally {
      setTranslationLoading(false);
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

    // Initialize decorative Audio Waveform values
    const bars = Array.from({ length: 42 }, () => Math.floor(Math.random() * 80) + 20);
    setWaveformWave(bars);
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
              <span className="block bg-[#0a0a16] text-white border-2 border-on-background font-space font-bold text-xs rounded-xl p-3 shadow-2xl flex flex-col gap-1">
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

  // Pulse Waveform bar elements during Listening playback simulation
  useEffect(() => {
    if (audioPlaying) {
      listeningAudioInterval.current = setInterval(() => {
        setAudioDurationPercent(prev => {
          if (prev >= 100) {
            setAudioPlaying(false);
            clearInterval(listeningAudioInterval.current);
            return 0;
          }
          return prev + 2;
        });
      }, 100);
    } else {
      if (listeningAudioInterval.current) {
        clearInterval(listeningAudioInterval.current);
      }
    }
    return () => clearInterval(listeningAudioInterval.current);
  }, [audioPlaying]);


  // Evaluation trigger: Speaking (TEXT path) — used by the type-to-test box and
  // as a fallback when real audio recording isn't available.
  const evaluateSpeechText = async (text: string, target: string = speakTargetRef.current) => {
    if (!text.trim()) return;
    setSpeakingLoading(true);
    try {
      const response = await fetch('/api/evaluate-speaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        
      applyMetricProfile({
        ...profile,
        srsByWord: nextSrs,
        completedActivityIds: nextCompleted,
      });
    }

    if (knows) {
      setVocabMemorizedCount(prev => Math.min(prev + 1, vocabTotalCount));
    }
    
    // Advance carousel index
    setTimeout(() => {
      setCurrentVocabIndex(prev => (prev + 1) % vocabList.length);
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
        setLibReadAnswer(null);
        setLibReadTrans(false);
        setLibReadLevel(item.level);
        setActiveTab('read');
      }
    } else if (tab === 'listen') {
      const item = LISTENING_LIBRARY.find((l) => l.id === itemId);
      if (item) {
        setLibListenId(item.id);
        setLibListenAnswer(null);
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
      const ordered = orderTrainerWords(TRAINER_WORDS, currentUserRef.current?.srsByWord ?? {});
      setVocabList(ordered);
      setCurrentVocabIndex(0);
    }
  };

  const logoutUser = () => {
    // The auth listener clears currentUser once Firebase signs out; we reset the
    // tab immediately so the UI feels responsive.
    setActiveTab('read');
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

  useEffect(() => {
    if (!currentUser || isTest) return;
    loadPaymentMethods();
  }, [currentUser?.email, isTest]);

  const getCurrentIdToken = async () => {
    if (!isFirebaseConfigured) throw new Error('Firebase тохиргоо дутуу байна.');
    const user = getAuthInstance().currentUser;
    if (!user) throw new Error('Төлбөр эхлүүлэхийн тулд дахин нэвтэрнэ үү.');
    return user.getIdToken();
  };

  const startQPayCheckout = async () => {
    setPaymentActionLoading(true);
    setPaymentMessage(null);
    try {
      const token = await getCurrentIdToken();
      const response = await fetch('/api/payments/qpay/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: paymentMethods?.plan.plan ?? 'Monthly' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'QPay төлбөр эхлүүлэхэд алдаа гарлаа.');

      setQpayCheckout(data);
      setPaymentMessage({ type: 'info', text: 'QPay нэхэмжлэл үүслээ. QR уншуулах эсвэл банкны апп сонгоно уу.' });
    } catch (err: any) {
      setPaymentMessage({ type: 'error', text: err?.message || 'QPay төлбөр эхлүүлэхэд алдаа гарлаа.' });
    } finally {
      setPaymentActionLoading(false);
    }
  };

  const checkQPayPaymentStatus = async () => {
    if (!qpayCheckout) return;
    setPaymentStatusLoading(true);
    setPaymentMessage(null);
    try {
      const token = await getCurrentIdToken();
      const response = await fetch(`/api/payments/qpay/invoices/${encodeURIComponent(qpayCheckout.senderInvoiceNo)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'QPay төлөв шалгахад алдаа гарлаа.');

      if (data.paid || data.status === 'paid') {
        if (data.billing && currentUserRef.current) {
          const nextProfile = normalizeProfileMetrics({
            ...currentUserRef.current,
            billing: {
              ...currentUserRef.current.billing,
              ...data.billing,
            },
          });
          currentUserRef.current = nextProfile;
          setCurrentUser(nextProfile);
        }
        setPaymentMessage({ type: 'success', text: 'Төлбөр баталгаажлаа. Эрх идэвхтэй боллоо.' });
      } else {
        setPaymentMessage({ type: 'info', text: 'QPay дээр төлбөр хараахан баталгаажаагүй байна.' });
      }
    } catch (err: any) {
      setPaymentMessage({ type: 'error', text: err?.message || 'QPay төлөв шалгахад алдаа гарлаа.' });
    } finally {
      setPaymentStatusLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Shared AI speaking-judge UI. `target` is the German model sentence the recording
  // (or typed text) is graded against. Reused by every library item AND the detailed
  // lesson, so importing new speaking resources gets the AI judge automatically.
  // ---------------------------------------------------------------------------
  const renderSpeakingJudge = (target: string) => (
    // Microphone Interface Area — real voice recording for the AI coach
    <div className="w-full flex flex-col items-center justify-center relative py-6 bg-surface-container-low border-2 border-on-background border-dashed rounded-xl block-shadow my-4">

      <span className="inline-flex items-center gap-1.5 px-3 py-1 mb-4 bg-primary-container border-2 border-on-background text-[11px] font-black font-space rounded-full uppercase tracking-wider block-shadow">
        <AudioLines className="w-3.5 h-3.5" /> Дуут AI багш
      </span>

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
            className="flex-grow bg-white border-2 border-on-background font-bold text-sm px-3 py-2 rounded-xl outline-none focus:border-primary transition-all text-slate-900"
          />
          <button
            onClick={() => evaluateSpeechText(speakingTextEntered, target)}
            disabled={!speakingTextEntered.trim() || speakingLoading}
            className="px-4 py-2 border-2 border-on-background text-sm font-bold bg-primary text-white rounded-xl block-shadow cursor-pointer disabled:opacity-50"
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
        <div className="w-full bg-white border-2 border-on-background rounded-xl p-6 flex items-start gap-4 shadow-sm block-shadow">
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
              const tone = v >= 75 ? 'text-secondary' : v >= 50 ? 'text-yellow-600' : 'text-error';
              const barTone = v >= 75 ? 'bg-secondary' : v >= 50 ? 'bg-yellow-500' : 'bg-error';
              return (
                <div key={i} className="bg-white border-2 border-on-background rounded-xl p-4 block-shadow flex flex-col items-center text-center">
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
            <div key={i} className="bg-white border-2 border-on-background rounded-xl p-4 block-shadow">
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
  ) => (
    <>
      <div className="mt-4">
        <button
          onClick={() => checkComposition(text, ctx)}
          disabled={!text.trim() || writeFeedbackLoading}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white border-2 border-on-background rounded-lg font-bold text-sm cursor-pointer block-shadow hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="w-full bg-white border-2 border-on-background rounded-xl p-6 flex items-start gap-4 shadow-sm block-shadow">
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
              const tone = v >= 75 ? 'text-secondary' : v >= 50 ? 'text-yellow-600' : 'text-error';
              const barTone = v >= 75 ? 'bg-secondary' : v >= 50 ? 'bg-yellow-500' : 'bg-error';
              return (
                <div key={i} className="bg-white border-2 border-on-background rounded-xl p-4 block-shadow flex flex-col items-center text-center">
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
          <div className="bg-white border-2 border-on-background rounded-xl p-4 block-shadow">
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
              <div key={i} className="bg-white border-2 border-on-background rounded-xl p-4 block-shadow">
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

  const renderBillingCard = () => {
    if (!currentUser) return null;

    const billing = currentUser.billing ?? {};
    const activeBilling = ['active', 'paid', 'trialing'].includes((billing.status ?? '').toLowerCase());
    const plan = paymentMethods?.plan;
    const qpayReady = paymentMethods?.qpay.status === 'ready';
    const qrSrc = qpayQrImageSrc(qpayCheckout?.qrImage);
    const priceLabel = formatMnt(plan?.amountMnt ?? (billing.monthlyAmountCents ? billing.monthlyAmountCents / 100 : null));

    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 block-shadow space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
          <div className="flex-grow space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
                <CreditCard className="w-5 h-5" />
              </span>
              <div>
                <p className="text-xs text-slate-400 font-black uppercase font-space">Төлбөр / Subscription</p>
                <h2 className="text-xl font-extrabold text-white">
                  {activeBilling ? `${billing.plan ?? 'Monthly'} эрх идэвхтэй` : 'QPay төлбөрөөр эрх нээх'}
                </h2>
              </div>
              <span className={`lg:ml-auto px-3 py-1 rounded-full text-[11px] font-black border ${
                activeBilling
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-white/5 border-white/10 text-slate-300'
              }`}>
                {activeBilling ? 'ACTIVE' : (billing.status ?? 'FREE').toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950/50 border border-white/10 rounded-xl p-4">
                <p className="text-[10px] text-slate-500 font-black uppercase font-space">Plan</p>
                <p className="text-sm font-extrabold text-white">{plan?.plan ?? billing.plan ?? 'Monthly'}</p>
              </div>
              <div className="bg-slate-950/50 border border-white/10 rounded-xl p-4">
                <p className="text-[10px] text-slate-500 font-black uppercase font-space">Price</p>
                <p className="text-sm font-extrabold text-white">{priceLabel}</p>
              </div>
              <div className="bg-slate-950/50 border border-white/10 rounded-xl p-4">
                <p className="text-[10px] text-slate-500 font-black uppercase font-space">Provider</p>
                <p className="text-sm font-extrabold text-white">QPay first</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-[11px] font-bold text-emerald-200">QPay QR</span>
              <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full text-[11px] font-bold text-blue-200">Bank app deeplink</span>
              <span className="px-3 py-1 bg-purple-500/10 border border-purple-500/30 rounded-full text-[11px] font-bold text-purple-200">Bonum: Apple Pay / Google Pay next</span>
            </div>

            {paymentMethods?.alternatives?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {paymentMethods.alternatives.map((method) => (
                  <div key={method.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-sm font-extrabold text-slate-100">{method.name}</p>
                    <p className="text-[11px] text-slate-400 font-semibold mt-1">{method.note}</p>
                    <p className="text-[10px] text-slate-500 font-bold mt-2 uppercase">{method.supports.join(' / ')}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="w-full lg:w-[320px] bg-slate-950/60 border border-white/10 rounded-2xl p-5 space-y-4">
            <button
              onClick={startQPayCheckout}
              disabled={!qpayReady || paymentActionLoading || activeBilling}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-slate-500 text-slate-950 border border-emerald-300/40 rounded-xl font-black text-sm cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              {paymentActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              {activeBilling ? 'Эрх идэвхтэй' : 'QPay төлбөр үүсгэх'}
            </button>

            {!qpayReady && !paymentMethodsLoading && (
              <p className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                QPay live болгохын тулд сервер дээр merchant credentials, Firebase Admin credentials, мөн MNT үнийг тохируулна.
              </p>
            )}

            {paymentMethodsLoading && (
              <p className="text-[11px] text-slate-400 font-semibold flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Төлбөрийн тохиргоо уншиж байна...
              </p>
            )}

            {paymentMessage && (
              <div className={`border rounded-xl p-3 text-[12px] font-bold leading-relaxed ${
                paymentMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : paymentMessage.type === 'error'
                    ? 'bg-red-500/10 border-red-500/30 text-red-200'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-200'
              }`}>
                {paymentMessage.text}
              </div>
            )}

            {qpayCheckout && (
              <div className="space-y-4">
                {qrSrc ? (
                  <img src={qrSrc} alt="QPay QR" className="w-full aspect-square object-contain bg-white rounded-xl p-3" />
                ) : (
                  <div className="w-full aspect-square bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-center p-4 text-xs text-slate-400 font-bold">
                    QPay QR image хараахан ирээгүй байна.
                  </div>
                )}

                {qpayCheckout.shortUrl && (
                  <a
                    href={qpayCheckout.shortUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-xs font-bold text-white transition-colors"
                  >
                    QPay checkout нээх <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}

                {(qpayCheckout.urls?.length ?? 0) > 0 && (
                  <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto pr-1">
                    {qpayCheckout.urls!.slice(0, 8).map((url, index) => (
                      <a
                        key={`${url.name ?? 'bank'}-${index}`}
                        href={url.link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] font-bold text-slate-200"
                      >
                        <span>{url.name || url.description || 'Bank app'}</span>
                        <ExternalLink className="w-3 h-3 text-slate-500" />
                      </a>
                    ))}
                  </div>
                )}

                <button
                  onClick={checkQPayPaymentStatus}
                  disabled={paymentStatusLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-400/30 rounded-xl text-xs font-black text-blue-200 disabled:opacity-60"
                >
                  {paymentStatusLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Төлбөр шалгах
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };


  // Render Profile / Dashboard View
  const renderProfileTab = () => {
    if (!currentUser) return null;

    const todaySession = buildTodaySession(
      currentUser.targetLevel,
      new Set(completedActivityIds),
      currentUser.srsByWord ?? {},
      TRAINER_WORDS
    );
    const unresolvedMistakes = resolveMistakes(currentUser.mistakeIds ?? []);
    const currentUnits = buildUnitsForLevel(currentUser.targetLevel as Level);

    const completedCount = completedActivityIds.length;
    const lastStudyDay = studyDays[studyDays.length - 1];
    // We draw an SVG line chart representing study hours (learningCurve)
    const maxHours = Math.max(...currentUser.learningCurve.map(c => c.hours), 4);
    const points = currentUser.learningCurve.map((c, i) => {
      const x = 40 + i * (520 / 6);
      const y = 160 - (c.hours / maxHours) * 120;
      return { x, y, day: c.day, hours: c.hours };
    });

    const linePath = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
    
    // Draw horizontal grid lines
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
      const y = 160 - ratio * 120;
      const label = (ratio * maxHours).toFixed(1) + 'ц';
      return { y, label };
    });

    return (
      <div className="w-full pb-24 space-y-8 animate-fade-in text-white select-none">
        {/* Welcome Header Hero Banner */}
        <div className="relative overflow-hidden bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-2 border-white/10 rounded-3xl p-6 md:p-8 block-shadow">
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none"></div>
          
          <div className="flex flex-col lg:flex-row items-center gap-6 relative z-10">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-4 border-purple-500/50 shadow-lg shrink-0">
              <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover bg-slate-800" />
            </div>
            <div className="text-center lg:text-left space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-950/60 border border-purple-500/30 text-[10px] font-black font-space rounded-full uppercase tracking-wider text-purple-300">
                <GraduationCap className="w-3.5 h-3.5" /> {currentUser.role}
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white">Тавтай морил, {currentUser.name}!</h1>
              <p className="text-sm text-slate-400 max-w-xl leading-relaxed font-semibold">
                Герман хэлний сургалтын хувийн танхимд тавтай морилно уу. Таны суралцах зорилго болон одоогийн явцыг доор нэгтгэв.
              </p>
            </div>

            <div className="lg:ml-auto flex items-center gap-3 shrink-0">
              <div className="text-center bg-white/5 border border-white/10 rounded-xl px-4 py-3 block-shadow">
                <span className="text-[10px] font-bold text-slate-400 uppercase font-space block mb-0.5">Зорилтот Түвшин</span>
                <p className="text-2xl font-black text-secondary">{currentUser.targetLevel}</p>
              </div>
              <button 
                onClick={logoutUser}
                className="px-4 py-3 bg-red-950/20 hover:bg-red-900/30 border border-red-500/30 hover:border-red-500/50 text-red-300 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" /> Гарах
              </button>
            </div>
          </div>
        </div>

        {/* Today's Session & Mistake Log Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Today's Session Card */}
          <div className="lg:col-span-8 bg-white/5 border border-purple-500/20 rounded-2xl p-6 md:p-8 backdrop-blur-md block-shadow space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-400 animate-bounce" />
              <h2 className="text-xl font-extrabold text-purple-300 font-space">Өнөөдрийн Даалгавар</h2>
            </div>
            <p className="text-slate-400 text-xs font-semibold">
              Суралцах хэвшлийг хадгалахад туслах өнөөдрийн санал болгож буй дасгалууд:
            </p>
            
            {todaySession && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {/* Reading suggestion */}
                {todaySession.reading ? (
                  <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:border-purple-500/30 transition-all">
                    <div className="flex items-center gap-3 overflow-hidden mr-2">
                      <span className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg shrink-0">
                        <BookOpen className="w-5 h-5" />
                      </span>
                      <div className="overflow-hidden">
                        <p className="text-[10px] text-blue-400 font-bold uppercase font-space">УНШИХ</p>
                        <p className="text-sm font-bold text-white truncate">{todaySession.reading.titleMn}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => startActivity('read', todaySession.reading!.id)}
                      className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl text-xs cursor-pointer hover:opacity-90 shrink-0"
                    >
                      Эхлэх
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center p-4 bg-white/5 border border-white/5 opacity-55 rounded-xl">
                    <span className="p-2.5 bg-slate-800 text-slate-500 rounded-lg shrink-0 mr-3">
                      <BookOpen className="w-5 h-5" />
                    </span>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase font-space">УНШИХ</p>
                      <p className="text-xs text-slate-400 font-medium">Бүгд дууссан</p>
                    </div>
                  </div>
                )}

                {/* Listening suggestion */}
                {todaySession.listening ? (
                  <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:border-purple-500/30 transition-all">
                    <div className="flex items-center gap-3 overflow-hidden mr-2">
                      <span className="p-2.5 bg-purple-500/10 text-purple-400 rounded-lg shrink-0">
                        <Headphones className="w-5 h-5" />
                      </span>
                      <div className="overflow-hidden">
                        <p className="text-[10px] text-purple-400 font-bold uppercase font-space">СОНСОХ</p>
                        <p className="text-sm font-bold text-white truncate">{todaySession.listening.titleMn}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => startActivity('listen', todaySession.listening!.id)}
                      className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl text-xs cursor-pointer hover:opacity-90 shrink-0"
                    >
                      Эхлэх
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center p-4 bg-white/5 border border-white/5 opacity-55 rounded-xl">
                    <span className="p-2.5 bg-slate-800 text-slate-500 rounded-lg shrink-0 mr-3">
                      <Headphones className="w-5 h-5" />
                    </span>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase font-space">СОНСОХ</p>
                      <p className="text-xs text-slate-400 font-medium">Бүгд дууссан</p>
                    </div>
                  </div>
                )}

                {/* Speaking suggestion */}
                {todaySession.speaking ? (
                  <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:border-purple-500/30 transition-all">
                    <div className="flex items-center gap-3 overflow-hidden mr-2">
                      <span className="p-2.5 bg-green-500/10 text-green-400 rounded-lg shrink-0">
                        <Mic className="w-5 h-5" />
                      </span>
                      <div className="overflow-hidden">
                        <p className="text-[10px] text-green-400 font-bold uppercase font-space">ЯРИХ</p>
                        <p className="text-sm font-bold text-white truncate">{todaySession.speaking.titleMn}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => startActivity('speak', todaySession.speaking!.id)}
                      className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl text-xs cursor-pointer hover:opacity-90 shrink-0"
                    >
                      Эхлэх
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center p-4 bg-white/5 border border-white/5 opacity-55 rounded-xl">
                    <span className="p-2.5 bg-slate-800 text-slate-500 rounded-lg shrink-0 mr-3">
                      <Mic className="w-5 h-5" />
                    </span>
                    <div>
                      <p className="text-[10px] text-slate-550 font-bold uppercase font-space">ЯРИХ</p>
                      <p className="text-xs text-slate-400 font-medium">Бүгд дууссан</p>
                    </div>
                  </div>
                )}

                {/* Vocab review suggestion */}
                {todaySession.dueWordCount > 0 ? (
                  <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:border-purple-500/30 transition-all">
                    <div className="flex items-center gap-3 overflow-hidden mr-2">
                      <span className="p-2.5 bg-amber-500/10 text-amber-400 rounded-lg shrink-0">
                        <RotateCcw className="w-5 h-5" />
                      </span>
                      <div className="overflow-hidden">
                        <p className="text-[10px] text-amber-400 font-bold uppercase font-space">ҮГСИЙН САН</p>
                        <p className="text-sm font-bold text-white truncate">{todaySession.dueWordCount} үг давтах</p>
                      </div>
                    </div>
                    <button
                      onClick={() => selectTab('vocab')}
                      className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl text-xs cursor-pointer hover:opacity-90 shrink-0"
                    >
                      Давтах
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center p-4 bg-white/5 border border-white/5 opacity-55 rounded-xl">
                    <span className="p-2.5 bg-slate-800 text-slate-500 rounded-lg shrink-0 mr-3">
                      <RotateCcw className="w-5 h-5" />
                    </span>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase font-space">ҮГСИЙН САН</p>
                      <p className="text-xs text-slate-400 font-medium font-space">Сэргээх үг байхгүй</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mistakes Card */}
          <div className="lg:col-span-4 bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-md block-shadow space-y-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-400 animate-pulse" />
              <h2 className="text-xl font-extrabold text-red-300 font-space">Миний Алдаанууд</h2>
            </div>
            <p className="text-slate-400 text-xs font-semibold">
              Дахин давтах алдаатай дасгалууд:
            </p>
            
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
              {unresolvedMistakes.length > 0 ? (
                unresolvedMistakes.map((m, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-red-950/20 border border-red-500/20 rounded-xl hover:border-red-500/40 transition-colors">
                    <div className="overflow-hidden mr-2">
                      <span className="text-[9px] font-space bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 uppercase font-black">{m.tab === 'read' ? 'Унших' : 'Сонсох'}</span>
                      <p className="text-xs font-bold text-white truncate mt-1">{m.titleMn}</p>
                    </div>
                    <button
                      onClick={() => startActivity(m.tab, m.itemId)}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-650 text-white font-bold rounded-lg text-[10px] cursor-pointer transition-colors shrink-0"
                    >
                      Засах
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-slate-500 text-xs font-bold font-sans">
                  ✨ Тэмдэглэгдсэн алдаа байхгүй. Хичээлээ алдаагүй үргэлжлүүлнэ үү!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Streak */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 block-shadow flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Flame className="w-6 h-6 fill-orange-500/20" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase font-space">Streak</p>
              <h3 className="text-xl font-black">{streak} өдөр дараалан</h3>
              <p className="text-[11px] text-orange-300 font-bold">Өдөр бүр зорилгодоо хүрээрэй!</p>
            </div>
          </div>

          {/* Lesson Progress */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 block-shadow flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div className="flex-grow">
              <p className="text-xs text-slate-400 font-bold uppercase font-space">Прогресс</p>
              <h3 className="text-xl font-black">{lessonProgress}% дууссан</h3>
              <p className="text-[11px] text-purple-300 font-bold">{completedCount}/{TRACKABLE_ACTIVITY_TOTAL} дасгал</p>
              {/* Progress bar inside card */}
              <div className="w-full h-1.5 bg-white/5 rounded-full mt-1.5 overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: `${lessonProgress}%` }} />
              </div>
            </div>
          </div>

          {/* Goals Completed */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 block-shadow flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase font-space">Судлагдсан сэдэв</p>
              <h3 className="text-xl font-black">{completedCount} дасгал</h3>
              <p className="text-[11px] text-blue-300 font-bold">
                {lastStudyDay ? `Сүүлд: ${lastStudyDay}` : 'Эхний дасгалаа дуусгаарай'}
              </p>
            </div>
          </div>
        </div>

        {renderBillingCard()}

        {/* Goal and Suggestions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Goal and Learning Curve Chart */}
          <div className="lg:col-span-8 bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-md block-shadow space-y-6">
            <div>
              <h2 className="text-xl font-extrabold flex items-center gap-2 text-purple-300 mb-2 font-sans">
                <Target className="w-5 h-5" /> Суралцах Гол Зорилго
              </h2>
              <div className="bg-purple-950/20 border border-purple-500/20 rounded-xl p-4 text-sm font-bold text-purple-200">
                "{currentUser.learningGoal}"
              </div>
            </div>

            {/* Learning Curve SVG Chart */}
            <div className="space-y-3 pt-2">
              <h3 className="text-base font-extrabold flex items-center gap-2 text-blue-300">
                <Gauge className="w-5 h-5 text-blue-400" /> Суралцах хурд / Давтамжийн муруй (Study Hours)
              </h3>
              <p className="text-slate-400 text-xs font-semibold">
                Долоо хоногийн хоногоор тооцсон хичээллэсэн цагийн график. Муруйн хэлбэр хүн бүрийн суралцах хэмнэлээс хамааран өөр байна.
              </p>

              {/* Chart container */}
              <div className="bg-slate-950/60 border border-white/5 rounded-xl p-4 relative overflow-x-auto">
                <svg className="w-full min-w-[500px] h-[220px]" viewBox="0 0 600 200">
                  {/* Grid Lines */}
                  {gridLines.map((line, i) => (
                    <g key={i}>
                      <line 
                        x1="40" 
                        y1={line.y} 
                        x2="560" 
                        y2={line.y} 
                        className="stroke-white/10" 
                        strokeDasharray="4 4" 
                      />
                      <text 
                        x="10" 
                        y={line.y + 4} 
                        className="fill-slate-500 text-[10px] font-space font-bold"
                      >
                        {line.label}
                      </text>
                    </g>
                  ))}

                  {/* Shaded Area Under Line */}
                  <path
                    d={`M ${points[0].x} 160 ${linePath} L ${points[points.length - 1].x} 160 Z`}
                    fill="url(#chart-glow)"
                    className="opacity-20"
                  />

                  {/* Line Connection */}
                  <path
                    d={linePath}
                    fill="none"
                    className="stroke-purple-400"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Points & Labels */}
                  {points.map((p, i) => (
                    <g key={i} className="group/point">
                      {/* Hours Bubble Label on top of point */}
                      <text
                        x={p.x}
                        y={p.y - 12}
                        textAnchor="middle"
                        className="fill-purple-300 text-[11px] font-space font-bold transition-all"
                      >
                        {p.hours}ц
                      </text>
                      
                      {/* Glowing Dot */}
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="6"
                        className="fill-purple-400 stroke-[#020205] stroke-2 shadow-lg"
                      />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="12"
                        className="fill-purple-400/20 stroke-none animate-pulse"
                      />

                      {/* Day Label at bottom */}
                      <text
                        x={p.x}
                        y="182"
                        textAnchor="middle"
                        className="fill-slate-450 text-[11px] font-bold"
                      >
                        {p.day}
                      </text>
                    </g>
                  ))}

                  {/* Definitions for Gradients */}
                  <defs>
                    <linearGradient id="chart-glow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c084fc" />
                      <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            {/* Lesson Path: Curriculum structure */}
            <div className="space-y-4 pt-6 border-t border-white/10">
              <h3 className="text-xl font-extrabold flex items-center gap-2 text-purple-300">
                <Shield className="w-5 h-5 text-purple-400" /> Сургалтын зам ({currentUser.targetLevel})
              </h3>
              <p className="text-slate-400 text-xs font-semibold font-sans">
                Түвшин бүрт тохирсон сэдвүүд. Хэсэг бүрийг {Math.round(UNIT_PASS_RATIO * 100)}%-иас дээш амжилттай дуусгаснаар дараагийн хэсэг нээгдэнэ.
              </p>
              
              <div className="space-y-4 mt-3">
                {currentUnits.map((unit, idx) => {
                  const unlocked = isUnitUnlocked(currentUnits, idx, new Set(completedActivityIds));
                  const progress = unitProgress(unit, new Set(completedActivityIds));
                  const passed = isUnitPassed(unit, new Set(completedActivityIds));
                  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
                  
                  return (
                    <div 
                      key={idx} 
                      className={`relative overflow-hidden rounded-2xl border transition-all p-5 block-shadow ${
                        unlocked 
                          ? passed 
                            ? 'bg-purple-950/20 border-purple-500/40' 
                            : 'bg-white/5 border border-white/10 hover:border-purple-500/30' 
                          : 'bg-slate-950/40 border border-white/5 opacity-60'
                      }`}
                    >
                      {/* Top Bar of unit card */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center font-black font-space text-sm shrink-0 border ${
                            unlocked 
                              ? passed 
                                ? 'bg-purple-500/10 border-purple-500 text-purple-400' 
                                : 'bg-blue-500/10 border-blue-500 text-blue-400' 
                              : 'bg-white/5 border border-white/10 text-slate-500'
                          }`}>
                            {idx + 1}
                          </span>
                          <div>
                            <h4 className="font-extrabold text-white text-base font-space">
                              {unit.title} {passed && ' (Дууссан)'}
                            </h4>
                            <p className="text-xs text-slate-400 font-sans">
                              {progress.done} / {progress.total} дасгал хийсэн ({percent}%)
                            </p>
                          </div>
                        </div>
                        
                        <div>
                          {unlocked ? (
                            passed ? (
                              <span className="text-[11px] font-space bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full border border-purple-500/30 font-bold">Дууссан</span>
                            ) : (
                              <span className="text-[11px] font-space bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full border border-blue-500/30 font-bold animate-pulse">Идэвхтэй</span>
                            )
                          ) : (
                            <span className="text-[11px] font-space bg-white/5 text-slate-500 px-3 py-1 rounded-full border border-white/10 font-bold">Түгжигдсэн</span>
                          )}
                        </div>
                      </div>

                      {/* Progress bar inside unit card */}
                      {unlocked && (
                        <div className="w-full h-2 bg-white/5 border border-white/10 rounded-full overflow-hidden mb-4">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      )}

                      {/* Activities detail nested inside the unit */}
                      {unlocked && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                          {unit.activities.map((act, aIdx) => {
                            const isDone = completedActivityIds.includes(act.activityId);
                            const skillNames = {
                              read: 'Унших',
                              listen: 'Сонсох',
                              speak: 'Ярих',
                              write: 'Бичих',
                            };
                            const skillIcons = {
                              read: <BookOpen className="w-3.5 h-3.5" />,
                              listen: <Headphones className="w-3.5 h-3.5" />,
                              speak: <Mic className="w-3.5 h-3.5" />,
                              write: <Edit3 className="w-3.5 h-3.5" />,
                            };
                            return (
                              <button
                                key={aIdx}
                                onClick={() => startActivity(act.tab, act.itemId)}
                                className={`flex items-center justify-between text-left p-3 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                                  isDone 
                                    ? 'bg-purple-950/10 border-purple-500/20 text-slate-300 hover:bg-purple-950/20' 
                                    : 'bg-white/5 border border-white/10 text-white hover:border-purple-500/40 hover:bg-white/10'
                                }`}
                              >
                                <div className="flex items-center gap-2 overflow-hidden mr-2">
                                  <span className={`p-1.5 rounded-lg shrink-0 ${
                                    isDone ? 'bg-purple-500/10 text-purple-400' : 'bg-white/5 text-slate-300'
                                  }`}>
                                    {skillIcons[act.tab]}
                                  </span>
                                  <div className="overflow-hidden text-left">
                                    <p className="text-[10px] text-slate-400 uppercase font-space">{skillNames[act.tab]}</p>
                                    <p className="font-bold truncate max-w-[180px] text-white">{act.titleMn}</p>
                                  </div>
                                </div>
                                {isDone ? (
                                  <Check className="w-4 h-4 text-purple-400 shrink-0" />
                                ) : (
                                  <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Tailored Suggestions */}
          <div className="lg:col-span-4 bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-md block-shadow space-y-6 flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-extrabold flex items-center gap-2 text-blue-300 mb-2 font-sans">
                <Lightbulb className="w-5 h-5 text-blue-400" /> Хувийн зөвлөмж
              </h2>
              <p className="text-slate-450 text-xs mb-4 font-semibold">
                Таны сонгосон сэдэв болон түвшинд тохируулж манай системээс дараах зөвлөмжүүдийг өгч байна:
              </p>

              <div className="space-y-4">
                {currentUser.suggestions.map((suggestion, i) => (
                  <div key={i} className="flex gap-3 items-start bg-white/5 p-4 rounded-xl border border-white/15 block-shadow hover:border-blue-500/30 transition-colors">
                    <span className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400 font-bold text-xs mt-0.5 font-space">
                      {i + 1}
                    </span>
                    <p className="text-sm font-bold text-slate-205 leading-relaxed">
                      {suggestion}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions Router */}
            <div className="pt-4 border-t border-white/5">
              <h3 className="text-xs font-bold text-slate-450 uppercase tracking-wider mb-3 font-space">Хичээл рүү шилжих</h3>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => selectTab('read')} 
                  className="py-2.5 px-3 text-center bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold rounded-lg cursor-pointer transition-colors"
                >
                  Унших дасгал
                </button>
                <button 
                  onClick={() => selectTab('listen')} 
                  className="py-2.5 px-3 text-center bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold rounded-lg cursor-pointer transition-colors"
                >
                  Сонсох дасгал
                </button>
                <button 
                  onClick={() => selectTab('speak')} 
                  className="py-2.5 px-3 text-center bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold rounded-lg cursor-pointer transition-colors animate-pulse text-purple-300"
                >
                  Дуут AI Багш
                </button>
                <button 
                  onClick={() => selectTab('write')} 
                  className="py-2.5 px-3 text-center bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold rounded-lg cursor-pointer transition-colors"
                >
                  Бичих дасгал
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // While Firebase is checking for a saved session, show a brief loading screen
  // so we don't flash the login page at an already-signed-in user.
  if (authLoading) {
    return (
      <div className="bg-[#020205] text-white font-sans min-h-screen flex flex-col justify-center items-center gap-4">
        <h1 className="text-3xl font-black font-space tracking-tight">
          <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Vivid</span> Lingua
        </h1>
        <Loader2 className="w-7 h-7 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen />;
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
        onFinish={(record) => {
          setPlacementOpen(false);
          applyMetricProfile({
            ...currentUser,
            placementPending: false,
            placement: record,
            ...(record.unlocked ? { targetLevel: record.level } : {}),
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

      {/* TestDaF бүрэн загвар шалгалт — бүрэн дэлгэц overlay (sidebar-аас дээгүүр) */}
      {testdafOpen && <TestDafExam onExit={() => setTestdafOpen(false)} />}

      {/* Standalone Duolingo Core Quiz Overlay (Matches Screen 1 format explicitly) */}
      {coreLessonActive && (
        <div id="core-lesson-modal" className="fixed inset-0 bg-[#020205] z-100 flex flex-col items-center justify-between pb-8 pt-4 px-4 md:px-12 animate-fade-in text-white">
          {/* Atmospheric background glows in overlay */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-900/10 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-900/10 rounded-full blur-[120px] pointer-events-none"></div>
          
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
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500 relative"
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
                    coreLessonFeedback !== null ? 'opacity-40 cursor-not-allowed' : 'hover:border-purple-500/50 hover:bg-white/10'
                  }`}
                >
                  <span className="absolute top-4 right-4 border border-white/10 bg-white/5 px-2 py-1 rounded font-space text-[12px] font-bold text-slate-400 group-hover:border-purple-500/50 group-hover:text-purple-400">1</span>
                  <span className={`font-sans text-lg font-bold ${coreLessonAnswer === 0 && coreLessonFeedback === 'incorrect' ? 'text-red-300' : 'text-slate-250 group-hover:text-purple-300'}`}>Өглөөний мэнд</span>
                </button>

                {/* Option 2 (Correct) */}
                <button 
                  onClick={() => !coreLessonFeedback && submitCoreLessonAnswer(1)}
                  disabled={coreLessonFeedback !== null}
                  className={`choice-card relative w-full text-left rounded-xl p-6 group transition-all block-shadow cursor-pointer ${
                    coreLessonAnswer === 1 && coreLessonFeedback === 'correct' ? 'bg-purple-950/40 border-purple-500 text-purple-200 opacity-100 shadow-[0_0_15px_rgba(168,85,247,0.3)]' :
                    coreLessonFeedback === 'incorrect' ? 'bg-purple-950/20 border-dashed border-purple-500/40 opacity-100' : 
                    coreLessonFeedback !== null ? 'opacity-40 cursor-not-allowed' : 'bg-white/5 border border-white/10 hover:border-purple-500/50'
                  }`}
                >
                  <span className="absolute top-4 right-4 border border-white/10 bg-white/5 px-2 py-1 rounded font-space text-[12px] font-bold text-slate-400 group-hover:border-purple-500/50 group-hover:text-purple-400">2</span>
                  <span className={`font-sans text-lg font-bold ${coreLessonAnswer === 1 && coreLessonFeedback === 'correct' ? 'text-purple-200' : 'text-slate-200 group-hover:text-purple-300'}`}>Өдрийн мэнд</span>
                </button>

                {/* Option 3 */}
                <button 
                  onClick={() => !coreLessonFeedback && submitCoreLessonAnswer(2)}
                  disabled={coreLessonFeedback !== null}
                  className={`choice-card relative w-full text-left bg-white/5 border border-white/10 rounded-xl p-6 group transition-all block-shadow cursor-pointer ${
                    coreLessonAnswer === 2 && coreLessonFeedback === 'incorrect' ? 'bg-red-950/40 border-red-500 text-white opacity-100 shadow-[0_0_15px_rgba(239,68,68,0.2)]' :
                    coreLessonFeedback !== null ? 'opacity-40 cursor-not-allowed' : 'hover:border-purple-500/50 hover:bg-white/10'
                  }`}
                >
                  <span className="absolute top-4 right-4 border border-white/10 bg-white/5 px-2 py-1 rounded font-space text-[12px] font-bold text-slate-400 group-hover:border-purple-500/50 group-hover:text-purple-400">3</span>
                  <span className={`font-sans text-lg font-bold ${coreLessonAnswer === 2 && coreLessonFeedback === 'incorrect' ? 'text-red-300' : 'text-slate-200 group-hover:text-purple-300'}`}>Баяртай</span>
                </button>

                {/* Option 4 */}
                <button 
                  onClick={() => !coreLessonFeedback && submitCoreLessonAnswer(3)}
                  disabled={coreLessonFeedback !== null}
                  className={`choice-card relative w-full text-left bg-white/5 border border-white/10 rounded-xl p-6 group transition-all block-shadow cursor-pointer ${
                    coreLessonAnswer === 3 && coreLessonFeedback === 'incorrect' ? 'bg-red-950/40 border-red-500 text-white opacity-100 shadow-[0_0_15px_rgba(239,68,68,0.2)]' :
                    coreLessonFeedback !== null ? 'opacity-40 cursor-not-allowed' : 'hover:border-purple-500/50 hover:bg-white/10'
                  }`}
                >
                  <span className="absolute top-4 right-4 border border-white/10 bg-white/5 px-2 py-1 rounded font-space text-[12px] font-bold text-slate-400 group-hover:border-purple-500/50 group-hover:text-purple-400">4</span>
                  <span className={`font-sans text-lg font-bold ${coreLessonAnswer === 3 && coreLessonFeedback === 'incorrect' ? 'text-red-300' : 'text-slate-200 group-hover:text-purple-300'}`}>Сайн байна уу</span>
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
              <div className="bg-white border-2 border-on-background rounded-xl p-6 max-w-sm block-shadow w-full flex justify-around items-center">
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
      <nav aria-label="Desktop menu" className="hidden md:flex flex-col h-screen py-8 px-4 gap-y-6 bg-[#04040a] w-[280px] fixed left-0 top-0 text-white border-r border-white/10 select-none z-30 shadow-[4px_0_24px_rgba(0,0,0,0.5)]">
        <div>
          <h1 className="text-2xl font-black tracking-tight font-space flex items-center gap-2">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Vivid</span> Lingua
          </h1>
        </div>

        {/* User Context Avatar Panel */}
        {currentUser ? (
          <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/10 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => selectTab('profile')}>
            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 border-purple-500/50">
              <img 
                alt="Profile" 
                className="w-full h-full object-cover bg-slate-800" 
                src={currentUser.avatar}
              />
            </div>
            <div className="overflow-hidden">
              <p className="text-[10px] font-black uppercase text-purple-400 tracking-wider flex items-center gap-1">
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
            <span className="flex items-center gap-2 text-purple-300">
              <Flame className="w-5 h-5 text-purple-400 fill-purple-400 animate-pulse" />
              Streak: {streak} өдөр
            </span>
            <span className="text-[11px] font-space bg-gradient-to-r from-purple-500 to-blue-500 text-white px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wide">AUTO</span>
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
              <Sparkles className={`w-5 h-5 ${activeTab === 'translate' ? 'text-secondary-fixed text-purple-450' : ''}`} />
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
              <GraduationCap className={`w-5 h-5 ${activeTab === 'exam' ? 'text-secondary-fixed' : ''} text-yellow-400`} />
              <span className="text-[14px] font-bold">Шалгалт</span>
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
      <header className="md:hidden flex justify-between items-center w-full px-4 h-16 bg-white border-b-2 border-on-background fixed top-0 left-0 z-40 shrink-0">
        <button 
          onClick={() => setMobileMenuOpen(prev => !prev)}
          className="text-primary p-2 border-2 border-on-background rounded-lg bg-surface-container-low hover:bg-surface shadow-[2px_2px_0_0_#1E293B] cursor-pointer"
        >
          <span className="material-symbols-outlined text-xl font-bold">menu</span>
        </button>
        <h1 className="text-xl font-black text-primary tracking-tight">Vivid Lingua</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center p-2 text-secondary select-none">
            <Flame className="w-5 h-5 text-orange-500 fill-orange-500 animate-pulse" />
            <span className="text-xs font-black text-on-background ml-1">{streak}</span>
          </div>
          <div className="p-2 text-yellow-500 select-none">
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
              <h1 className="text-2xl font-black font-space">Vivid Lingua</h1>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 cursor-pointer"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {currentUser ? (
              <div className="bg-white/5 p-3 rounded-xl border border-white/10 mx-2 flex gap-3 items-center cursor-pointer hover:bg-white/10" onClick={() => selectTab('profile')}>
                <div className="w-10 h-10 rounded-full overflow-hidden bg-white/20 border border-purple-500/50 flex-shrink-0">
                  <img alt="User" className="w-full h-full object-cover" src={currentUser.avatar} />
                </div>
                <div className="overflow-hidden">
                  <h3 className="text-sm font-bold truncate text-white leading-tight">{currentUser.name}</h3>
                  <p className="text-[10px] text-purple-300 font-bold truncate leading-none mt-0.5">{currentUser.role}</p>
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
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  <span>Орчуулагч</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => selectTab('exam')}
                  className={`flex items-center gap-3 py-3 w-full text-left font-bold pl-4 rounded-xl cursor-pointer ${activeTab === 'exam' ? 'bg-white/15' : 'text-on-primary-container'}`}
                >
                  <GraduationCap className="w-5 h-5 text-yellow-400" />
                  <span>Шалгалт</span>
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
      <main className="flex-grow md:ml-[280px] px-4 md:px-8 flex flex-col justify-between pt-24 md:pt-8 w-full min-h-screen relative overflow-hidden bg-[#020205]">
        {/* Ambient neon flares */}
        <div className="absolute top-10 left-10 w-96 h-96 bg-purple-900/15 rounded-full blur-[140px] pointer-events-none"></div>
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-900/10 rounded-full blur-[140px] pointer-events-none"></div>

        <div className="w-full max-w-[1200px] mx-auto flex flex-col h-full relative z-10">

          {/* Unified Lesson Progress Bar - Screen 2/3 style */}
          {activeTab !== 'settings' && activeTab !== 'profile' && (
            <div className="w-full mb-8 flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 block-shadow">
              <div className="h-4 flex-grow bg-white/5 border border-white/10 rounded-full overflow-hidden relative shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 rounded-full relative" 
                  style={{ width: `${lessonProgress}%` }}
                >
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-white/35"></div>
                </div>
              </div>
              <span className="text-xs font-space font-bold bg-gradient-to-r from-purple-500 to-blue-500 text-white px-4 py-1.5 rounded-full border border-white/20 shadow-[0_0_15px_rgba(168,85,247,0.25)]">
                {lessonProgress}% дууссан
              </span>
            </div>
          )}

          {/* Render Active View Modules */}

          {/* Tab 0: Профайл / Хяналтын самбар */}
          {activeTab === 'profile' && renderProfileTab()}

          {/* Tab 1: Унших (Reading) - Screen 3 layout */}
          {activeTab === 'read' && (
            <div className="w-full pb-24">


              {/* LIBRARY browser — 50+ readings */}
              {(() => {
                const filtered = libReadLevel === 'all' ? READING_LIBRARY : READING_LIBRARY.filter(r => r.level === libReadLevel);
                const item = READING_LIBRARY.find(r => r.id === libReadId) || READING_LIBRARY[0];
                const answered = libReadAnswer !== null;
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* List of readings */}
                    <aside className="lg:col-span-4 bg-white border-2 border-on-background rounded-xl p-4 block-shadow">
                      <div className="flex gap-1 mb-3">
                        {LIB_LEVELS.map(lv => (
                          <button key={lv} onClick={() => setLibReadLevel(lv)}
                            className={`flex-1 py-1.5 rounded-lg border-2 border-on-background text-xs font-bold cursor-pointer transition-colors ${libReadLevel === lv ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                            {lv === 'all' ? 'Бүгд' : lv}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto pr-1">
                        {filtered.map(r => {
                          const isLocked = lockedActivityIds.read.has(r.id) && r.level === currentUser?.targetLevel;
                          return (
                            <button key={r.id} onClick={() => { setLibReadId(r.id); setLibReadAnswer(null); setLibReadTrans(readTranslateEnabled); }}
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
                    <section className="lg:col-span-8 bg-white border-2 border-on-background rounded-xl p-6 md:p-8 block-shadow text-slate-800">
                      {lockedActivityIds.read.has(item.id) && item.level === currentUser?.targetLevel ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                            <Shield className="w-8 h-8" />
                          </div>
                          <h2 className="text-xl font-bold text-slate-800">🔒 Энэ дасгал түгжигдсэн байна</h2>
                          <p className="text-sm text-slate-500 max-w-sm font-sans font-medium">
                            Шалгалт өгөх эсвэл өмнөх хэсгийг дуусгаж нээнэ үү.
                          </p>
                          <button 
                            onClick={() => selectTab('profile')}
                            className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl text-sm hover:opacity-95 transition-all shadow-md cursor-pointer font-space"
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

                          {/* Comprehension question */}
                          <div className="mt-6 pt-5 border-t border-outline-variant">
                            <p className="text-xs font-space font-bold uppercase text-primary mb-2">Ойлголт шалгах:</p>
                            <p className="text-base font-bold text-on-surface mb-3">{item.question}</p>
                            <div className="mb-4 flex flex-wrap gap-2">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-container border-2 border-on-background text-xs font-semibold rounded-full font-space block-shadow text-on-surface">
                                <Lightbulb className="w-4 h-4 text-orange-500 fill-orange-500" />
                                {item.hint ?? 'Санамж: тодруулсан үг дээр дарж утга, дуудлагыг нь үзээрэй.'}
                              </span>
                            </div>
                            <MCQBlock
                              choices={item.choices}
                              correctIndex={item.correctIndex}
                              selectedAnswer={libReadAnswer}
                              feedbackText={item.explanation}
                              onSelect={(index) => {
                                setLibReadAnswer(index);
                                const actId = activityKey('library:read', item.id);
                                if (index === item.correctIndex) {
                                  recordStudyActivity(actId);
                                  
                                  const profile = currentUserRef.current;
                                  if (profile && profile.mistakeIds?.includes(actId)) {
                                    applyMetricProfile({
                                      ...profile,
                                      mistakeIds: clearMistake(profile.mistakeIds, actId),
                                    });
                                  }
                                } else {
                                  const profile = currentUserRef.current;
                                  if (profile) {
                                    applyMetricProfile({
                                      ...profile,
                                      mistakeIds: addMistake(profile.mistakeIds, actId),
                                    });
                                  }
                                }
                              }}
                            />
                            {libReadAnswer !== null && libReadAnswer !== item.correctIndex && (
                              <GrammarTipCard
                                correctAnswer={item.choices[item.correctIndex]}
                                explanation={item.explanation}
                                germanContext={item.text}
                                level={item.level}
                              />
                            )}
                          </div>
                        </>
                      )}
                    </section>
                  </div>
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
                const answered = libListenAnswer !== null;
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <aside className="lg:col-span-4 bg-white border-2 border-on-background rounded-xl p-4 block-shadow">
                      <div className="flex gap-1 mb-3">
                        {LIB_LEVELS.map(lv => (
                          <button key={lv} onClick={() => setLibListenLevel(lv)}
                            className={`flex-1 py-1.5 rounded-lg border-2 border-on-background text-xs font-bold cursor-pointer transition-colors ${libListenLevel === lv ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                            {lv === 'all' ? 'Бүгд' : lv}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto pr-1">
                        {filtered.map(r => {
                          const isLocked = lockedActivityIds.listen.has(r.id) && r.level === currentUser?.targetLevel;
                          return (
                            <button key={r.id} onClick={() => { setLibListenId(r.id); setLibListenAnswer(null); setLibListenTrans(readTranslateEnabled); }}
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

                    <section className="lg:col-span-8 bg-white border-2 border-on-background rounded-xl p-6 md:p-8 block-shadow text-slate-800">
                      {lockedActivityIds.listen.has(item.id) && item.level === currentUser?.targetLevel ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                            <Shield className="w-8 h-8" />
                          </div>
                          <h2 className="text-xl font-bold text-slate-800">🔒 Энэ дасгал түгжигдсэн байна</h2>
                          <p className="text-sm text-slate-500 max-w-sm font-sans font-medium">
                            Шалгалт өгөх эсвэл өмнөх хэсгийг дуусгаж нээнэ үү.
                          </p>
                          <button 
                            onClick={() => selectTab('profile')}
                            className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl text-sm hover:opacity-95 transition-all shadow-md cursor-pointer font-space"
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
                            <button onClick={() => speakGerman(item.audioText, audioSpeed === '0.8' ? 0.8 : 1.0)}
                              className="w-16 h-16 rounded-full bg-secondary text-white border-2 border-on-background flex items-center justify-center cursor-pointer hover:scale-105 transition-transform block-shadow">
                              <Volume2 className="w-7 h-7" />
                            </button>
                            <p className="text-xs text-on-surface-variant font-sans">Бичлэгийг сонсохын тулд дарна уу (2 удаа)</p>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setAudioSpeed('0.8')}
                                className={`px-3 py-1 rounded-full border-2 border-on-background text-[11px] font-bold font-space cursor-pointer block-shadow ${audioSpeed === '0.8' ? 'bg-primary-container text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                                0.8x (Удаан)
                              </button>
                              <button onClick={() => setAudioSpeed('1.0')}
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

                          {/* Comprehension */}
                          <div className="pt-5 border-t border-outline-variant">
                            <p className="text-xs font-space font-bold uppercase text-primary mb-2">Ойлголт шалгах:</p>
                            <p className="text-base font-bold text-on-surface mb-3">{item.question}</p>
                            <div className="mb-4 flex flex-wrap gap-2">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-container border-2 border-on-background text-xs font-semibold rounded-full font-space block-shadow text-on-surface">
                                <Lightbulb className="w-4 h-4 text-orange-500 fill-orange-500" />
                                {item.hint ?? 'Санамж: "Текст" товчийг дарж, тодруулсан үг дээр дарна уу.'}
                              </span>
                            </div>
                            <MCQBlock
                              choices={item.choices}
                              correctIndex={item.correctIndex}
                              selectedAnswer={libListenAnswer}
                              feedbackText={item.explanation}
                              onSelect={(index) => {
                                setLibListenAnswer(index);
                                const actId = activityKey('library:listen', item.id);
                                if (index === item.correctIndex) {
                                  recordStudyActivity(actId);
                                  
                                  const profile = currentUserRef.current;
                                  if (profile && profile.mistakeIds?.includes(actId)) {
                                    applyMetricProfile({
                                      ...profile,
                                      mistakeIds: clearMistake(profile.mistakeIds, actId),
                                    });
                                  }
                                } else {
                                  const profile = currentUserRef.current;
                                  if (profile) {
                                    applyMetricProfile({
                                      ...profile,
                                      mistakeIds: addMistake(profile.mistakeIds, actId),
                                    });
                                  }
                                }
                              }}
                            />
                            {libListenAnswer !== null && libListenAnswer !== item.correctIndex && (
                              <GrammarTipCard
                                correctAnswer={item.choices[item.correctIndex]}
                                explanation={item.explanation}
                                germanContext={item.audioText}
                                level={item.level}
                              />
                            )}
                          </div>
                        </>
                      )}
                    </section>
                  </div>
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
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <aside className="lg:col-span-4 bg-white border-2 border-on-background rounded-xl p-4 block-shadow">
                      <div className="flex gap-1 mb-3">
                        {LIB_LEVELS.map(lv => (
                          <button key={lv} onClick={() => setLibSpeakLevel(lv)}
                            className={`flex-1 py-1.5 rounded-lg border-2 border-on-background text-xs font-bold cursor-pointer transition-colors ${libSpeakLevel === lv ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                            {lv === 'all' ? 'Бүгд' : lv}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto pr-1">
                        {filtered.map(r => {
                          const isLocked = lockedActivityIds.speak.has(r.id) && r.level === currentUser?.targetLevel;
                          return (
                            <button key={r.id} onClick={() => { setLibSpeakId(r.id); setLibSpeakReveal(false); resetSpeakingJudge(); }}
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

                    <section className="lg:col-span-8 bg-white border-2 border-on-background rounded-xl p-6 md:p-8 block-shadow text-slate-800">
                      {lockedActivityIds.speak.has(item.id) && item.level === currentUser?.targetLevel ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                            <Shield className="w-8 h-8" />
                          </div>
                          <h2 className="text-xl font-bold text-slate-800">🔒 Энэ дасгал түгжигдсэн байна</h2>
                          <p className="text-sm text-slate-500 max-w-sm font-sans font-medium">
                            Шалгалт өгөх эсвэл өмнөх хэсгийг дуусгаж нээнэ үү.
                          </p>
                          <button 
                            onClick={() => selectTab('profile')}
                            className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl text-sm hover:opacity-95 transition-all shadow-md cursor-pointer font-space"
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
                          <Lightbulb className="w-4 h-4 text-yellow-400 fill-current" /> {libSpeakReveal ? 'Нуух' : 'Загвар хариулт харах'}
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
                    </>
                  )}
                </section>
              </div>
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
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <aside className="lg:col-span-4 bg-white border-2 border-on-background rounded-xl p-4 block-shadow">
                      <div className="flex gap-1 mb-3">
                        {LIB_LEVELS.map(lv => (
                          <button key={lv} onClick={() => setLibWriteLevel(lv)}
                            className={`flex-1 py-1.5 rounded-lg border-2 border-on-background text-xs font-bold cursor-pointer transition-colors ${libWriteLevel === lv ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                            {lv === 'all' ? 'Бүгд' : lv}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto pr-1">
                        {filtered.map(r => {
                          const isLocked = lockedActivityIds.write.has(r.id) && r.level === currentUser?.targetLevel;
                          return (
                            <button key={r.id} onClick={() => { setLibWriteId(r.id); setLibWriteText(''); setLibWriteReveal(false); resetWritingFeedback(); }}
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

                    <section className="lg:col-span-8 bg-white border-2 border-on-background rounded-xl p-6 md:p-8 block-shadow text-slate-800">
                      {lockedActivityIds.write.has(item.id) && item.level === currentUser?.targetLevel ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                            <Shield className="w-8 h-8" />
                          </div>
                          <h2 className="text-xl font-bold text-slate-800">🔒 Энэ дасгал түгжигдсэн байна</h2>
                          <p className="text-sm text-slate-500 max-w-sm font-sans font-medium">
                            Шалгалт өгөх эсвэл өмнөх хэсгийг дуусгаж нээнэ үү.
                          </p>
                          <button 
                            onClick={() => selectTab('profile')}
                            className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-xl text-sm hover:opacity-95 transition-all shadow-md cursor-pointer font-space"
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
                        className="w-full px-3 py-2 text-sm border-2 border-on-background rounded-lg bg-white text-slate-900 placeholder:text-slate-400 outline-none focus:border-secondary resize-y" />

                      <div className="flex items-center justify-between mt-3">
                        <span className="text-[11px] text-on-surface-variant">{words} үг</span>
                        <button onClick={() => setLibWriteReveal(v => !v)}
                          className="px-4 py-2 bg-surface-container text-primary border-2 border-on-background rounded-lg font-bold text-xs cursor-pointer block-shadow hover:scale-[1.02] transition-transform flex items-center gap-1">
                          <Lightbulb className="w-3.5 h-3.5 text-yellow-400 fill-current" /> {libWriteReveal ? 'Загварыг нуух' : 'Загвар хариулт харах'}
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
                    </>
                  )}
                </section>
              </div>
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
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

              {/* Central carousel card element block */}
              <div className="lg:col-span-8 flex flex-col items-center justify-center min-h-[500px]">
                
                {/* Visual tactile card flip display wrapper */}
                <div 
                  onClick={() => setVocabFlipped(prev => !prev)}
                  className="w-full max-w-2xl aspect-[4/3] sm:aspect-video perspective-1000 cursor-pointer"
                >
                  <div className="relative w-full h-full transform-style-3d border-2 border-on-background rounded-2xl block-shadow bg-white">
                    
                    {/* FRONT of the card (displays German word) - Backface hidden layout */}
                    <div className={`absolute inset-0 w-full h-full backface-hidden bg-white text-slate-900 rounded-2xl flex flex-col items-center justify-between p-8 transition-transform duration-500 transform-style-3d ${
                      vocabFlipped ? '[transform:rotateY(-180deg)]' : '[transform:rotateY(0deg)]'
                    }`}>
                      <span className="text-xs font-space font-bold text-on-surface-variant uppercase tracking-wider px-3 py-1 bg-surface-container border border-on-background rounded-full">
                        Шинэ үг
                      </span>
                      
                      <div className="flex flex-col items-center gap-4">
                        {vocabList[currentVocabIndex].article && (
                          <span className={`text-base font-black lowercase tracking-widest px-4 py-1 rounded-full border-2 border-on-background block-shadow ${
                            vocabList[currentVocabIndex].article === 'der' ? 'bg-blue-100 text-blue-700' :
                            vocabList[currentVocabIndex].article === 'die' ? 'bg-rose-100 text-rose-700' :
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
                          className="p-4 rounded-full bg-surface-container hover:bg-neutral-200 border-2 border-on-background hover:scale-110 text-secondary transition-all block-shadow cursor-pointer flex items-center justify-center"
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
                    <div className={`absolute inset-0 w-full h-full backface-hidden bg-white text-slate-900 rounded-2xl flex flex-col items-center justify-between p-8 border-2 border-secondary shadow-[0_4px_16px_rgba(0,108,73,0.1)] transition-transform duration-500 transform-style-3d ${
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
                          <p className="text-sm leading-normal text-slate-600 italic mb-2 font-sans font-bold">
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
                        className="mb-2 px-6 py-2.5 bg-primary text-white border-2 border-on-background rounded-xl font-bold font-sans text-sm shadow-[0_4px_18px_-2px_rgba(0,0,0,0.35)] cursor-pointer hover:scale-105 transition-all"
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
                    className="flex-1 basis-0 flex items-center justify-center gap-2 bg-white border-2 border-orange-500 text-orange-600 hover:bg-orange-500 hover:text-white py-4 px-6 rounded-xl font-bold font-sans text-lg block-shadow-orange cursor-pointer transition-all active:scale-95"
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
                <div className="bg-white rounded-xl border-2 border-on-background p-6 block-shadow flex flex-col items-center">
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
                <div className="bg-white rounded-xl border-2 border-on-background p-6 block-shadow">
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
                              : 'bg-surface-container hover:bg-neutral-200 text-on-surface-variant'
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
                <div className="bg-white rounded-xl border-2 border-on-background p-6 block-shadow">
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

            {/* Dictionary (Browse) — searchable, filterable German→Mongolian word list */}
            {vocabView === 'browse' && (
            <div className="flex flex-col gap-6 pb-24">

              {/* Header + search + filters */}
              <div className="bg-white rounded-2xl border-2 border-on-background p-6 block-shadow flex flex-col gap-5">
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
                    className="w-full bg-surface-container-low border-2 border-on-background rounded-xl pl-12 pr-10 py-3 text-md font-bold text-slate-900 focus:border-secondary outline-none transition-all placeholder:text-outline placeholder:font-normal shadow-inner"
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
                        dictClass === c.value ? 'bg-primary-container text-white' : 'bg-surface-container hover:bg-neutral-200 text-on-surface-variant'
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
                        dictLevel === lvl ? 'bg-secondary text-white' : 'bg-surface-container hover:bg-neutral-200 text-on-surface-variant'
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
                <div className="bg-white rounded-2xl border-2 border-on-background p-12 block-shadow text-center">
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
                        className="bg-white rounded-xl border-2 border-on-background p-5 block-shadow flex flex-col gap-3 hover:-translate-y-0.5 transition-transform"
                      >
                        <div className="flex items-start justify-between gap-2">
                          {w.article ? (
                            <span className={`text-sm font-black lowercase tracking-widest px-3 py-0.5 rounded-full border-2 border-on-background ${
                              w.article === 'der' ? 'bg-blue-100 text-blue-700' :
                              w.article === 'die' ? 'bg-rose-100 text-rose-700' :
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
                            className="shrink-0 p-2.5 rounded-full bg-surface-container hover:bg-neutral-200 border-2 border-on-background hover:scale-110 text-secondary transition-all cursor-pointer"
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
                        className="flex items-center gap-2 bg-white border-2 border-on-background text-on-background hover:bg-surface-container py-3 px-8 rounded-xl font-bold font-sans text-sm block-shadow cursor-pointer hover:scale-[1.02] active:scale-95 transition-all"
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
          {activeTab === 'translate' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-24 animate-fade-in font-sans">
              
              {/* Left Side: Translation Workspace */}
              <div className="lg:col-span-12 xl:col-span-7 flex flex-col gap-6">
                <div className="bg-white rounded-xl p-6 md:p-8 border-2 border-on-background block-shadow relative">
                  
                  {/* Neon top accent */}
                  <div className="absolute top-0 left-0 w-full h-[5px] bg-gradient-to-r from-purple-500 to-blue-500 rounded-t-xl"></div>
                  
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-purple-500 fill-purple-300 animate-pulse" />
                      <h2 className="text-2xl font-black text-on-background font-space">
                        Орчуулагч
                      </h2>
                    </div>
                    <span className="text-[11px] font-space font-extrabold bg-[#0a0a16] text-purple-300 px-3 py-1 rounded-full border border-purple-500/20 uppercase tracking-widest">
                      PRO
                    </span>
                  </div>

                  <p className="text-xs text-outline mb-4 leading-relaxed font-sans text-stone-500">
                    Энгийн орчуулгын системүүд шиг шууд холбож орчуулахгүй, энэхүү ухаалаг систем нь өгүүлбэрийн зүй, үгс тус бүрийн хувирал, дуудлагыг дүрмийн тайлбартай хамт гаргаж заах сургалтын зориулалттай.
                  </p>

                  <div className="relative">
                    <textarea 
                      value={translationInput}
                      onChange={(e) => setTranslationInput(e.target.value)}
                      placeholder="Орчуулах герман эсвэл монгол өгүүлбэрээ энд бичнэ үү..."
                      className="w-full min-h-[120px] bg-white border-2 border-on-background font-bold rounded-xl p-4 text-md text-slate-900 focus:border-purple-500 outline-none transition-all placeholder:text-outline resize-none shadow-inner"
                    />
                    {translationInput && (
                      <button 
                        onClick={() => setTranslationInput('')}
                        className="absolute right-3 top-3 text-[12px] text-stone-400 font-bold border border-stone-200 bg-white hover:bg-stone-50 px-2.5 py-1 rounded-md transition-all cursor-pointer"
                        title="Арилгах"
                      >
                        Цэвэрлэх
                      </button>
                    )}
                  </div>

                  {/* Sample Phrases cards */}
                  <div className="mt-4">
                    <p className="text-xs font-bold text-stone-400 font-space mb-2 uppercase">Туршиж үзэх жишээ өгүүлбэрүүд:</p>
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => {
                          setTranslationInput('Ich trinke jeden Morgen eine große Tasse Kaffee in der Küche.');
                          translateText('Ich trinke jeden Morgen eine große Tasse Kaffee in der Küche.');
                        }}
                        className="text-left py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg hover:border-purple-400 text-xs font-semibold hover:bg-purple-50/20 text-stone-700 transition-all flex justify-between items-center group cursor-pointer"
                      >
                        <span>🇩🇪 "Ich trinke jeden Morgen eine große Tasse Kaffee in der Küche."</span>
                        <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all text-purple-500" />
                      </button>
                      <button 
                        onClick={() => {
                          setTranslationInput('Өнөөдөр цаг агаар сайхан байгаа тул бид цэцэрлэгт хүрээлэнд зугаална.');
                          translateText('Өнөөдөр цаг агаар сайхан байгаа тул бид цэцэрлэгт хүрээлэнд зугаална.');
                        }}
                        className="text-left py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg hover:border-purple-400 text-xs font-semibold hover:bg-purple-50/20 text-stone-700 transition-all flex justify-between items-center group cursor-pointer"
                      >
                        <span>🇲🇳 "Өнөөдөр цаг агаар сайхан байгаа тул бид цэцэрлэгт хүрээлэнд зугаална."</span>
                        <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all text-purple-500" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button 
                      onClick={() => translateText()}
                      disabled={translationLoading || !translationInput.trim()}
                      className="px-6 py-3 border-2 border-on-background text-sm font-bold bg-[#0a0a16] text-purple-300 rounded-xl hover:bg-purple-950/20 transition-all cursor-pointer block-shadow flex items-center gap-2 border-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {translationLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-purple-300 border-t-transparent rounded-full animate-spin"></div>
                          Орчуулж байна...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 fill-current text-purple-400" />
                          Нэгдсэн Орчуулга Хийх
                        </>
                      )}
                    </button>
                  </div>

                  {translationError && (
                    <div className="mt-4 p-4 border border-rose-200 bg-rose-50 rounded-xl text-rose-700 text-xs font-bold leading-relaxed flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>{translationError}</span>
                    </div>
                  )}

                </div>
              </div>

              {/* Right Side: Translation Details & Deep Linguistic breakdown */}
              <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-6">
                
                {translationLoading ? (
                  <div className="bg-white rounded-xl border-2 border-on-background p-8 block-shadow h-[400px] flex flex-col items-center justify-center text-center">
                    <div className="relative mb-6">
                      <div className="w-16 h-16 border-4 border-purple-100 border-t-purple-500 rounded-full animate-spin"></div>
                      <Sparkles className="w-6 h-6 text-purple-400 absolute inset-0 m-auto animate-pulse" />
                    </div>
                    <h3 className="text-lg font-bold text-primary font-space mb-2">Герман Хэлний Үйлчилгээ</h3>
                    <p className="text-xs text-stone-500 max-w-xs leading-normal">
                      Өгүүлбэрийг орчуулж, үгс бүрийн үндсэн хэлбэрийг олох болон хэл зүйн бүтцийг судалж байна.
                    </p>
                  </div>
                ) : translationResult ? (
                  <div className="flex flex-col gap-6 animate-scale-up">
                    
                    {/* Translation Core Card */}
                    <div className="bg-white rounded-xl border-2 border-on-background p-6 block-shadow">
                      <div className="flex justify-between items-center pb-3 border-b border-stone-100 mb-4">
                        <span className="text-xs font-extrabold uppercase tracking-widest text-[#006c49] bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
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
                        <p className="text-[10px] uppercase font-bold text-stone-400 font-space tracking-wide mb-1">Гүйцэтгэсэн Орчуулга:</p>
                        <p className="text-lg font-black text-stone-800 leading-snug">
                          {translationResult.translation}
                        </p>
                      </div>

                      {translationResult.pronunciation && (
                        <div className="mb-1 p-3 bg-stone-50 border border-stone-100 rounded-lg">
                          <p className="text-[10px] uppercase font-bold text-stone-400 font-space tracking-wide mb-0.5">Унших удирдамж:</p>
                          <code className="text-xs font-mono font-bold text-purple-600">
                            {translationResult.pronunciation}
                          </code>
                        </div>
                      )}
                    </div>

                    {/* Linguistic Grammar Explanation Card */}
                    <div className="bg-white rounded-xl border-2 border-on-background p-6 block-shadow">
                      <h3 className="text-sm font-black text-purple-600 font-space mb-3 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-amber-500 fill-amber-300 animate-pulse" />
                        БҮТЭЦ & ДҮРМИЙН ТАЙЛБАР:
                      </h3>
                      <p className="text-xs leading-relaxed text-stone-600 font-sans">
                        {translationResult.grammarExplanation}
                      </p>
                    </div>

                    {/* Vocabulary Parsing List */}
                    <div className="bg-white rounded-xl border-2 border-on-background p-6 block-shadow">
                      <h3 className="text-sm font-black text-blue-600 font-space mb-4 pb-2 border-b border-stone-100 uppercase tracking-wider">
                        Үгсийн бүтэц (Дэлгэрэнгүй):
                      </h3>
                      <div className="flex flex-col gap-3">
                        {translationResult.words && translationResult.words.map((w, index) => (
                          <div key={index} className="flex flex-col gap-1 p-2.5 bg-slate-50 border border-slate-150 rounded-lg text-xs hover:border-purple-200 transition-all">
                            <div className="flex justify-between items-center">
                              <span className="font-extrabold text-stone-800">{w.word}</span>
                              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                                {w.partOfSpeech}
                              </span>
                            </div>
                            <div className="text-[11px] text-stone-500 flex justify-between mt-1">
                              <span>Толь бичгийн хэлбэр: <strong className="text-purple-600">{w.baseForm}</strong></span>
                              <span>= <strong className="text-stone-700">{w.translation}</strong></span>
                            </div>
                            <p className="text-[10.5px] text-stone-400 leading-normal mt-1 border-t border-dashed border-slate-200 pt-1">
                              {w.explanation}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Context Examples */}
                    {translationResult.examples && translationResult.examples.length > 0 && (
                      <div className="bg-white rounded-xl border-2 border-on-background p-6 block-shadow">
                        <h3 className="text-sm font-black text-stone-800 font-space mb-3 uppercase tracking-wider">
                          Холбогдох Жишээнүүд:
                        </h3>
                        <div className="space-y-3">
                          {translationResult.examples.map((ex, idx) => (
                            <div key={idx} className="p-3 bg-stone-50 rounded-xl border border-stone-100">
                              <p className="text-xs font-bold text-purple-600">🇩🇪 {ex.german}</p>
                              <p className="text-xs text-stone-600 mt-1">🇲🇳 {ex.mongolian}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="bg-white rounded-xl border-2 border-on-background p-8 block-shadow h-[320px] flex flex-col items-center justify-center text-center relative overflow-hidden group">
                    <div className="w-16 h-16 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-500 mb-4 transition-all group-hover:scale-110">
                      <Languages className="w-8 h-8 text-purple-400" />
                    </div>
                    <h3 className="text-lg font-bold text-primary font-space mb-2">Үгийн Шинжилгээ Ба Орчуулга</h3>
                    <p className="text-xs text-stone-500 max-w-xs leading-normal font-sans">
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
                <GraduationCap className="w-8 h-8 text-yellow-400" />
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
                    className="w-full text-left mb-4 bg-gradient-to-br from-purple-600 to-blue-600 border-2 border-on-background rounded-2xl p-5 md:p-6 block-shadow hover:scale-[1.01] active:scale-95 transition-transform cursor-pointer">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-white/15 border-2 border-on-background flex items-center justify-center shrink-0">
                        <Sparkles className="w-7 h-7 text-yellow-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg md:text-xl font-black font-space text-white">Түвшин тогтоох тест</h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-300 text-blue-900">Einstufungstest</span>
                        </div>
                        <p className="text-xs text-white/85 leading-relaxed mt-1">Дөрвөн ур чадварыг бүгдийг шалгаад <b className="text-white">CEFR түвшнээ</b> (A1–C2) тогтоолгоно. Асуултууд таны түвшинд автоматаар тохирно. 10–15 минут.</p>
                        <span className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-white bg-white/15 border border-on-background px-3 py-1 rounded-full">Тест эхлүүлэх <ArrowRight className="w-3.5 h-3.5" /></span>
                      </div>
                    </div>
                  </button>

                  {/* TestDaF бүрэн загвар шалгалтын симуляци */}
                  <button onClick={() => setTestdafOpen(true)}
                    className="w-full text-left mb-6 bg-gradient-to-br from-violet-600 to-fuchsia-600 border-2 border-on-background rounded-2xl p-5 md:p-6 block-shadow hover:scale-[1.01] active:scale-95 transition-transform cursor-pointer">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-white/15 border-2 border-on-background flex items-center justify-center shrink-0">
                        <GraduationCap className="w-7 h-7 text-yellow-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg md:text-xl font-black font-space text-white">TestDaF — Бүрэн загвар шалгалт</h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-300 text-violet-900">Prüfungssimulation</span>
                        </div>
                        <p className="text-xs text-white/85 leading-relaxed mt-1">Жинхэнэ шалгалтын бүтэц: <b className="text-white">Унших</b> 60′/30, <b className="text-white">Сонсох</b> 40′/25, <b className="text-white">Бичих</b> 60′/график-эссэ, <b className="text-white">Ярих</b> 35′/7 ситуаци. Цаг хэмжсэн, дараалсан, AI үнэлгээтэй.</p>
                        <span className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-white bg-white/15 border border-on-background px-3 py-1 rounded-full">Симуляци эхлүүлэх <ArrowRight className="w-3.5 h-3.5" /></span>
                      </div>
                    </div>
                  </button>

                  <p className="text-sm text-on-surface-variant mb-5 max-w-2xl">Эсвэл <b className="text-on-surface">CEFR түвшнээ</b> сонгоно уу. Түвшин бүр <b className="text-on-surface">Унших, Сонсох, Бичих, Ярих</b> гэсэн дөрвөн хэсэгтэй бөгөөд хэсэг бүрт 5+ тест байна. Доош нь A1 хамгийн хялбар, C2 хамгийн хүнд.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {EXAM_LEVEL_ORDER.map((lv) => {
                      const ex = EXAMS[lv];
                      const total = ex.reading.length + ex.listening.length + ex.writing.length + ex.speaking.length;
                      return (
                        <button key={lv} onClick={() => { setExamLevelSel(lv); selectExamSection('reading'); }}
                          className="text-left bg-white border-2 border-on-background rounded-xl p-5 block-shadow hover:scale-[1.02] active:scale-95 transition-transform cursor-pointer">
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

                    {/* Test selector chips */}
                    <div className="flex flex-wrap gap-2 mb-5">
                      {items.map((_, i) => (
                        <button key={i} onClick={() => selectExamItem(i)}
                          className={`px-3 py-1.5 rounded-lg border-2 border-on-background text-xs font-bold cursor-pointer transition-colors ${examItemIdx === i ? 'bg-secondary-container text-on-surface' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                          Тест {i + 1}
                        </button>
                      ))}
                    </div>

                    {/* Detail card */}
                    <div className="bg-white border-2 border-on-background rounded-xl p-6 md:p-8 block-shadow">
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
                        return (
                          <>
                            <p className="text-lg leading-relaxed text-on-surface whitespace-pre-line font-medium">{r.text}</p>
                            {examItemTrans && <p className="text-sm leading-relaxed text-on-surface-variant whitespace-pre-line mt-4 pt-4 border-t border-outline-variant/50 italic">{r.translation}</p>}
                            <div className="mt-6 pt-5 border-t border-outline-variant">
                              <p className="text-xs font-space font-bold uppercase text-primary mb-2">Ойлголт шалгах:</p>
                              <p className="text-base font-bold text-on-surface mb-3">{r.question}</p>
                              <MCQBlock
                                choices={r.choices}
                                correctIndex={r.correctIndex}
                                selectedAnswer={examItemAns}
                                onSelect={(index) => {
                                  setExamItemAns(index);
                                  if (index === r.correctIndex) recordStudyActivity(activityKey(`exam:${exam.level}:reading`, r.id));
                                }}
                              />
                            </div>
                          </>
                        );
                      })()}

                      {/* LISTENING */}
                      {examSec === 'listening' && (() => {
                        const l = item as typeof exam.listening[number];
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
                                choices={l.choices}
                                correctIndex={l.correctIndex}
                                selectedAnswer={examItemAns}
                                onSelect={(index) => {
                                  setExamItemAns(index);
                                  if (index === l.correctIndex) recordStudyActivity(activityKey(`exam:${exam.level}:listening`, l.id));
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
                              className="w-full px-3 py-2 text-sm border-2 border-on-background rounded-lg bg-white text-slate-900 placeholder:text-slate-400 outline-none focus:border-secondary resize-y" />
                            <div className="flex items-center justify-between mt-3">
                              <span className="text-[11px] text-on-surface-variant">{words} үг</span>
                              <button onClick={() => setExamItemReveal(v => !v)}
                                className="px-4 py-2 bg-surface-container text-primary border-2 border-on-background rounded-lg font-bold text-xs cursor-pointer block-shadow hover:scale-[1.02] transition-transform flex items-center gap-1">
                                <Lightbulb className="w-3.5 h-3.5 text-yellow-400 fill-current" /> {examItemReveal ? 'Загварыг нуух' : 'Загвар хариулт харах'}
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
                                <Lightbulb className="w-4 h-4 text-yellow-400 fill-current" /> {examItemReveal ? 'Нуух' : 'Загвар хариулт харах'}
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
            <div className="max-w-xl mx-auto w-full bg-white border-2 border-on-background rounded-xl p-8 block-shadow animate-fade-in pb-24">
              <div className="flex items-center gap-3 pb-4 border-b border-outline-variant mb-6 text-primary">
                <Settings className="w-6 h-6 outline" />
                <h2 className="text-2xl font-extrabold font-space">Тохиргоо ба Хувийн Төлөв</h2>
              </div>

              <div className="space-y-6 font-sans">
                {/* 1. Account details info */}
                <div className="flex items-center gap-4 bg-surface-container-low p-4 rounded-xl border border-outline-variant block-shadow">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-surface-container border border-on-background">
                    <img 
                      alt="User headshot" 
                      className="w-full h-full object-cover" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDGo9hHrBej5CE-2Zqv7WKD_WlNnMPp5LhLhoWYQnISE98hKpqouHR1fXi-1_b6aTvvHEagN1LYfh_9xXd4hi4rf1fT-FFwWLpLL3XAc5F9M3l_bolycDYkpJQc3jkJliRnkmfii5Pm67hZsN3lVfrph5SlOW-VscKA9zxEhkPIMGpopxB5T3c5c2GcjfFOpJscEmBFYn7Mr2LPCoErVxKtHlEi7EzLzeLLczv-M3FW4TgsDn-Ay6CMDaucbHBIbyXCkG63NTo5oys"
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-on-surface">Суралцагч</h3>
                    <p className="text-xs text-on-surface-variant font-mono">Танд амжилт хүсье! Суралцаж буй хэл: Герман хэл</p>
                  </div>
                </div>

                {/* 2. Interactive toggles state */}
                <div className="space-y-4">
                  <h4 className="text-xs font-space font-bold uppercase text-outline">Хичээлийн тохируулга:</h4>
                  
                  <div className="flex justify-between items-center p-3 border-2 border-on-background rounded-xl bg-white select-none block-shadow">
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

                  <div className="flex justify-between items-center p-3 border-2 border-on-background rounded-xl bg-white select-none block-shadow">
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

                  <div className="flex justify-between items-center p-3 border-2 border-on-background rounded-xl bg-white select-none block-shadow">
                    <div>
                      <h5 className="text-sm font-bold">Streak автоматаар тооцох</h5>
                      <p className="text-[11px] text-outline">Зөв дуусгасан дасгалтай өдөр streak-д автоматаар орно.</p>
                    </div>
                    <span className="font-bold text-sm bg-surface-container px-3 py-1 border border-on-background rounded-lg">{streak} өдөр</span>
                  </div>
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
                  activeTab === 'translate' ? 'text-purple-400' : 'text-on-primary-container'
                }`}
              >
                {activeTab === 'translate' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-purple-400 rounded-b-full text-purple-400"></div>}
                <Sparkles className="w-5 h-5 text-purple-400" />
                <span className="text-[10px] font-bold font-space">Орч</span>
              </button>

              <button 
                onClick={() => selectTab('exam')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 relative cursor-pointer ${
                  activeTab === 'exam' ? 'text-secondary-fixed' : 'text-on-primary-container'
                }`}
              >
                {activeTab === 'exam' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-secondary-fixed rounded-b-full text-secondary-fixed"></div>}
                <GraduationCap className="w-5 h-5 text-yellow-400" />
                <span className="text-[10px] font-bold font-space">Сорил</span>
              </button>
            </div>
          </nav>

        </div>
      </main>
    </div>
  );
}
