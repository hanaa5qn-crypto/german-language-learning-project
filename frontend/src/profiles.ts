export interface UserProfile {
  email: string;
  name: string;
  avatar: string;
  role: string;
  targetLevel: string;
  streak: number;
  progress: number;
  completedLessons: number;
  learningGoal: string;
  suggestions: string[];
  learningCurve: { day: string; hours: number }[];
  completedActivityIds?: string[];
  studyDays?: string[];
  studySecondsByDate?: Record<string, number>;
  // Per-track study tracking for the English (IELTS/SAT) track. The German
  // track owns the top-level studyDays/studySecondsByDate (and the `streak`
  // scalar). English keeps its OWN study days + seconds here so the two tracks
  // have completely independent streaks and weekly leaderboards — studying
  // English never touches the German streak and vice versa.
  studyDaysEn?: string[];
  studySecondsByDateEn?: Record<string, number>;
  // English-track learning state (kept separate from the German fields above so
  // the two tracks never interfere). Drive the English dashboard's Today's
  // Session, mistake log, progress and learning path.
  completedActivityIdsEn?: string[];
  mistakeIdsEn?: string[];
  // English CEFR target level (A1..C2). Set by the English placement test on
  // first English signup, or chosen by the learner on the English dashboard.
  targetLevelEn?: string;
  // New English learners take the placement test on first entry; cleared once
  // it is finished or the learner picks a level manually.
  placementPendingEn?: boolean;
  // English placement outcome (CEFR level + per-skill scores).
  placementEn?: {
    takenAt: string;
    level: string;
    totalCorrect: number;
    totalQuestions: number;
    skillScores: Record<string, { correct: number; total: number }>;
  };
  createdAt?: string;
  lastActiveAt?: string;
  // Spaced repetition state per vocabulary word (SM-2 style)
  srsByWord?: Record<string, { ease: number; intervalDays: number; reps: number; due: string; lastReviewed: string }>;
  // Mistake log — failed MCQ activity ids for review queue (most recent first)
  mistakeIds?: string[];
  // Onboarding wizard completion flag
  onboardingDone?: boolean;
  // Guest/visitor session: an in-memory, non-persisted profile so visitors can
  // sample the app (free tier) without an account. Never written to Firestore.
  isGuest?: boolean;
  // Daily study goal in minutes (set during onboarding)
  dailyGoalMinutes?: number;
  // Streak freeze: how many 1-day grace days the user has available
  streakFreezeCount?: number;
  // New signups take the placement test right after onboarding; cleared once
  // the test is finished or skipped.
  placementPending?: boolean;
  // Placement test outcome. `unlocked` = the learner may see the result
  // (paid the reveal fee, or founder account).
  placement?: {
    takenAt: string;
    level: string;
    totalCorrect: number;
    totalQuestions: number;
    skillScores: Record<string, { correct: number; total: number }>;
    unlocked: boolean;
    unlockedBy?: string;
  };
  // Free placement-test reveals from subscription purchases (1 granted each).
  // Spent server-side via /api/payments/placement/redeem-credit.
  placementCredits?: number;
  // --- Нийгмийн өсөлтийн боломжууд (урилга, тулаан, найзууд) ---
  // Миний хуваалцах урилгын код (сервер үүсгэнэ).
  referralCode?: string;
  // Намайг урьсан хэрэглэгчийн uid (нэг л удаа тавигдана).
  referredBy?: string;
  // Амжилттай урьсан хүний тоо.
  invitesCount?: number;
  // Тулаан/урилгаар холбогдсон найзуудын uid жагсаалт.
  friendUids?: string[];
  // Тулааны статистик.
  duelStats?: { wins: number; losses: number; draws: number };
  // Багшийн promo код (server-owned). Сурагч кодоо холбоход backend тавина;
  // эхний төлбөр дээр хямдрал, багшид комисс. firstPaymentDone=true болсны
  // дараа дахин хямдрал/комисс олгохгүй.
  promo?: {
    code: string;
    teacherName: string;
    discountPercent: number;
    commissionPercent: number;
    firstPaymentDone: boolean;
  };
  // Which learning track the account belongs to: 'de' = German, 'en' = English
  // (IELTS/SAT). The track is currently a client-side choice (localStorage), so
  // this isn't written yet — it's the hook the admin English/German views filter
  // on once track tagging is wired up. Until then a track view shows no rows.
  track?: 'en' | 'de';
  billing?: {
    plan?: string;
    status?: string;
    monthlyAmountCents?: number;
    lifetimeValueCents?: number;
    currency?: string;
    provider?: string;
    currentPeriodEnd?: string;
  };
}

// Fields that only the trusted backend (Firebase Admin SDK) may write:
// entitlements and metered usage. Firestore rules reject client writes to
// these; the client must also strip them before saving its own profile so a
// stale value can never fail an otherwise-valid progress write.
export const SERVER_OWNED_PROFILE_FIELDS = ['billing', 'placementCredits', 'aiUsage', 'promo'] as const;

export function stripServerOwnedFields(profile: UserProfile): UserProfile {
  const copy = { ...(profile as unknown as Record<string, unknown>) };
  for (const field of SERVER_OWNED_PROFILE_FIELDS) {
    delete copy[field];
  }
  return copy as unknown as UserProfile;
}

// --- Avatars: user-chosen or uploaded, NEVER auto-assigned ----------------
// Product decision: we do NOT assign a cute character avatar automatically.
// New users get a neutral monogram placeholder (their initials) and pick a
// cute avatar from the Settings grid or upload their own photo. The grid
// offers DiceBear `fun-emoji` faces to CHOOSE from; nothing is assigned for
// them. We store the full resolved SVG/photo URL on `profile.avatar`
// (matches the existing storage shape; safe in an <img src>).
// Cute DiceBear styles the user can pick from. `adventurer` is the app's
// original beloved style; kept as the default the grid opens on.
export const AVATAR_STYLES = [
  { id: 'adventurer', label: 'Дүрс' },
  { id: 'fun-emoji', label: 'Эможи' },
  { id: 'big-smile', label: 'Инээд' },
  { id: 'lorelei', label: 'Лорелей' },
  { id: 'bottts', label: 'Робот' },
] as const;
export type AvatarStyleId = (typeof AVATAR_STYLES)[number]['id'];
export const DEFAULT_AVATAR_STYLE: AvatarStyleId = 'adventurer';

export function avatarUrlFromSeed(seed: string, style: string = DEFAULT_AVATAR_STYLE): string {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

// Neutral initials/monogram placeholder for users who haven't chosen a
// picture yet. Deliberately NOT a cute character — it reads as an empty
// "set your photo" state, not an avatar assigned on the user's behalf.
export function placeholderAvatarFor(name: string): string {
  const seed = name.trim() || 'Vivid Lingua';
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}`;
}

// One page of cute avatar CHOICES for the Settings picker grid, in the given
// style. The user selects one; none is pre-applied. "Re-roll" advances `page`.
export const AVATAR_GRID_SIZE = 12;
export function avatarOptions(key: string, page = 0, style: string = DEFAULT_AVATAR_STYLE): string[] {
  const out: string[] = [];
  for (let i = 0; i < AVATAR_GRID_SIZE; i++) {
    const n = page * AVATAR_GRID_SIZE + i;
    out.push(avatarUrlFromSeed(`${key}-${n}`, style));
  }
  return out;
}

export const DEFAULT_PROFILES: UserProfile[] = [
  {
    email: 'bat@gmail.com',
    name: 'Бат-Эрдэнэ',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&q=80',
    role: 'Ахлах ангийн сурагч',
    targetLevel: 'B1',
    streak: 0,
    progress: 0,
    completedLessons: 0,
    learningGoal: 'Герман дахь их сургуульд суралцахаар бэлтгэж, Goethe-Zertifikat B1 шалгалт өгөх',
    suggestions: [
      'Дуудлага сайжруулахын тулд "Ярих" хэсгийн AI багшийн дасгалыг өдөр бүр хийх.',
      'B1 шалгалтын Бичих хэсэгт түлхүү ажиллаж, AI-аас дүрмийн засвар авах.',
      'Үгсийн сандах Browse хэсгээс B1 түвшний холбоос үгсийг цээжлэх.'
    ],
    learningCurve: [
      { day: 'Даваа', hours: 1.2 },
      { day: 'Мягмар', hours: 1.8 },
      { day: 'Лхагва', hours: 0.8 },
      { day: 'Пүрэв', hours: 2.2 },
      { day: 'Баасан', hours: 1.5 },
      { day: 'Бямба', hours: 2.5 },
      { day: 'Ням', hours: 1.8 }
    ],
    onboardingDone: true,
    // Showcase/demo account (also the test-mode default): full Max access so
    // every feature, including the AI tools, is visible out of the box.
    billing: { plan: 'max', status: 'active', currency: 'MNT' }
  },
  {
    email: 'nomin@gmail.com',
    name: 'Номин',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
    role: 'Програм хангамжийн инженер',
    targetLevel: 'B2',
    streak: 0,
    progress: 0,
    completedLessons: 0,
    learningGoal: 'Мюнхен хотод инженерээр ажиллахад зориулж бизнесийн болон техникийн герман хэл сурах',
    suggestions: [
      'Унших практикт техникийн болон ажлын орчны сэдэвт нийтлэлүүдийг сонгох.',
      'Герман хамтран ажиллагсадтай ярихад зориулж "Ярианы номын сан"-аас B2 хэллэгүүдийг сонсох.',
      'Төслийн мэйл бичих чадвараа сайжруулахын тулд AI орчуулагч ашиглан практик хийх.'
    ],
    learningCurve: [
      { day: 'Даваа', hours: 0.5 },
      { day: 'Мягмар', hours: 1.2 },
      { day: 'Лхагва', hours: 1.0 },
      { day: 'Пүрэв', hours: 1.5 },
      { day: 'Баасан', hours: 0.8 },
      { day: 'Бямба', hours: 3.0 },
      { day: 'Ням', hours: 2.0 }
    ],
    onboardingDone: true
  },
  {
    email: 'gerel@gmail.com',
    name: 'Гэрэл',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
    role: 'Жуулчин / Аялагч',
    targetLevel: 'A1',
    streak: 0,
    progress: 0,
    completedLessons: 0,
    learningGoal: 'Австри, Герман улсаар аялах явцдаа өдөр тутмын хэрэгцээндээ амьд харилцаа үүсгэх',
    suggestions: [
      '"Сонсох" цэсний анхан шатны харилцан яриануудыг (A1) дахин дахин тоглуулах.',
      'Ресторанд захиалга өгөх, чиглэл асуух хэллэгүүдийг өнгөт картаар цээжлэх.',
      'Ярих хэсэгт өөрийгөө танилцуулах хэсгийг AI шүүгчээр 90%+ үнэлгээтэй болтол давтах.'
    ],
    learningCurve: [
      { day: 'Даваа', hours: 0.4 },
      { day: 'Мягмар', hours: 0.5 },
      { day: 'Лхагва', hours: 0.3 },
      { day: 'Пүрэв', hours: 0.6 },
      { day: 'Баасан', hours: 0.4 },
      { day: 'Бямба', hours: 1.0 },
      { day: 'Ням', hours: 0.8 }
    ],
    onboardingDone: true
  },
  {
    email: 'anar@gmail.com',
    name: 'Анар',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
    role: 'Хүний их эмч',
    targetLevel: 'B2',
    streak: 0,
    progress: 0,
    completedLessons: 0,
    learningGoal: 'Германд мэргэжил дээшлүүлж, эмнэлгийн мэргэжлийн герман хэлний шалгалт өгөх',
    suggestions: [
      'Анагаах ухааны унших материалуудыг орчуулгатай харьцуулж унших.',
      'Ахисан шатны Бичих дасгалууд дээр өвчтөний түүх бичиж AI-аар үнэлүүлэх.',
      'Сонсох хэсэгт B2 түвшний ярианы дасгалуудыг 1.0x хурдаар сонсож бататгах.'
    ],
    learningCurve: [
      { day: 'Даваа', hours: 2.0 },
      { day: 'Мягмар', hours: 2.5 },
      { day: 'Лхагва', hours: 3.0 },
      { day: 'Пүрэв', hours: 1.5 },
      { day: 'Баасан', hours: 2.8 },
      { day: 'Бямба', hours: 4.0 },
      { day: 'Ням', hours: 3.5 }
    ],
    onboardingDone: true
  }
];

// In-memory guest profile so a visitor can try the app before signing up.
// Free-tier billing, onboarding/placement skipped (no friction), and flagged
// isGuest so the UI can prompt sign-up and saves can no-op. Nothing here is
// persisted — saveProfileProgress() bails when there is no Firebase user.
export function createGuestProfile(): UserProfile {
  const now = new Date().toISOString();
  const days = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];
  return {
    email: '',
    name: 'Зочин',
    avatar: placeholderAvatarFor('Зочин'),
    role: 'Суралцагч',
    targetLevel: 'A1',
    streak: 0,
    progress: 0,
    completedLessons: 0,
    learningGoal: 'Герман хэлийг туршиж үзэх',
    suggestions: [
      'Унших, сонсох дасгалуудыг туршиж үзээрэй.',
      'Үгийн сангаас эхний 10 үгийг цээжилж эхэлээрэй.',
      'Бүртгүүлбэл явц чинь хадгалагдаж, A2–C2 нээгдэнэ.',
    ],
    learningCurve: days.map((day) => ({ day, hours: 0 })),
    completedActivityIds: [],
    studyDays: [],
    studySecondsByDate: {},
    srsByWord: {},
    mistakeIds: [],
    onboardingDone: true,
    placementPending: false,
    dailyGoalMinutes: 15,
    streakFreezeCount: 0,
    isGuest: true,
    createdAt: now,
    lastActiveAt: now,
    billing: { plan: 'Free', status: 'free', monthlyAmountCents: 0, lifetimeValueCents: 0, currency: 'MNT' },
  };
}

export function createCustomProfile(
  email: string,
  name: string,
  targetLevel: string,
  learningGoal: string
): UserProfile {
  const now = new Date().toISOString();
  // Generate suggestions based on chosen goal/role type
  let suggestions: string[] = [];
  const goalClean = learningGoal.toLowerCase();
  
  if (goalClean.includes('сур') || goalClean.includes('сургууль') || goalClean.includes('шалгал')) {
    suggestions = [
      `CEFR ${targetLevel} түвшний унших, сонсох тестүүдийг "Шалгалт" цэснээс долоо хоног бүр өгөх.`,
      `Шивж бичих дасгал бүрт AI багшийн дүрмийн зөвлөмжүүдийг анхааралтай судалж тэмдэглэх.`,
      `Өдөр бүр үгсийн сангаас 10 шинэ үг цээжилж, өдрийн нормоо гүйцээх.`
    ];
  } else if (goalClean.includes('ажил') || goalClean.includes('инженер') || goalClean.includes('мэргэжил')) {
    suggestions = [
      `Харилцан ярианы сэдвүүдийг "Ярих" цэснээс сонгож, бизнесийн суурь хэллэгүүдийг давтах.`,
      `AI Орчуулагчийг ашиглан өөрийн мэргэжлийн холбогдолтой мэдээллүүдийг орчуулж сурах.`,
      `${targetLevel} түвшний техникийн үгсийг толь бичиг хэсгээс шүүн цээжлэх.`
    ];
  } else if (goalClean.includes('аял') || goalClean.includes('жуулч') || goalClean.includes('сонирхол')) {
    suggestions = [
      `Мэндчилгээ, танилцуулга болон ресторан, дэлгүүрийн сэдэвт дасгалуудыг түлхүү хийх.`,
      `Ярих цэсэн дэх "AI Дуут багш" дасгал дээр дуудлагаа 80%+ хүртэл давтах.`,
      `Үг цээжлэх хэсгийг ашиглан өдөр тутмын 100 орчим түгээмэл үгийг цэгцлэх.`
    ];
  } else {
    // Default suggestions
    suggestions = [
      `Сонсох ба Унших практик дасгалуудыг өдөр бүр тогтмол хослуулан хийх.`,
      `Герман өгүүлбэрийн бүтцийг сурахын тулд өгүүлбэр угсрах дасгал дээр илүү ажиллах.`,
      `Шинэ сурсан үгсээ үгсийн сангийн флаш карт ашиглан тогтмол сэргээн санах.`
    ];
  }

  const days = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];
  const learningCurve = days.map((day) => ({ day, hours: 0 }));

  // Start new profiles from scratch
  const streak = 0;
  const progress = 0;
  const completedLessons = 0;

  return {
    email,
    name,
    // Neutral monogram placeholder — the user chooses or uploads their own.
    avatar: placeholderAvatarFor(name),
    role: goalClean.includes('сургууль') ? 'Оюутан' : goalClean.includes('ажил') ? 'Мэргэжилтэн' : 'Суралцагч',
    targetLevel,
    streak,
    progress,
    completedLessons,
    learningGoal,
    suggestions,
    learningCurve,
    completedActivityIds: [],
    studyDays: [],
    studySecondsByDate: {},
    srsByWord: {},
    mistakeIds: [],
    onboardingDone: false,
    placementPending: true,
    dailyGoalMinutes: 15,
    streakFreezeCount: 1,
    createdAt: now,
    lastActiveAt: now,
    billing: {
      plan: 'Free',
      status: 'free',
      monthlyAmountCents: 0,
      lifetimeValueCents: 0,
      currency: 'USD'
    }
  };
}
