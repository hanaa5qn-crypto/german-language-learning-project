// =============================================================================
// Vivid-Lingua subscription plans (Free / Pro / Max) + founder override.
// -----------------------------------------------------------------------------
// • Free  — өдөр тутмын зуршил: үгийн сан бүрэн, хичээлүүд A1 түвшинд,
//           шалгалтын сангийн эхний 10 асуулт, сард 2 AI туршилт.
// • Pro   — бүх контент (A1–C2 сан, TestDaF симуляци), сард 5 AI туршилт.
// • Max   — бүгд + хязгааргүй AI (орчуулагч, ярих/бичих үнэлгээ).
// • Founder — имэйлээр таних; бүх эрх үргэлж нээлттэй, төлбөр шаардахгүй.
// Display prices here are defaults; the authoritative charge amount always
// comes from the backend (/api/payments/methods).
// =============================================================================

import type { UserProfile } from './profiles';
import { EXAMS, EXAM_LEVEL_ORDER, type ExamLevel } from './exams';

export type PlanId = 'free' | 'pro' | 'max';
export type EffectivePlan = PlanId | 'founder';
export type ExamSection = 'reading' | 'listening' | 'writing' | 'speaking';
export type BillingInterval = 'month' | 'year';

// Founder accounts: always full access, no payment needed.
export const FOUNDER_EMAILS = ['hanaa5qn@gmail.com'];

// Free tier: only the first N questions of the exam question bank.
export const FREE_QUESTION_LIMIT = 10;

// Monthly AI teaser quota (server-enforced; these are the display defaults).
export const AI_TEASER: Record<PlanId, number | null> = { free: 2, pro: 5, max: null };

export interface PlanInfo {
  id: PlanId;
  name: string;
  nameMn: string;
  defaultAmountMnt: number;     // monthly fallback price; server price wins
  defaultYearAmountMnt: number; // annual fallback price (2 months free)
  taglineMn: string;
  featuresMn: string[];
  missingMn: string[];
}

export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'max'];

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    id: 'free',
    name: 'Free',
    nameMn: 'Үнэгүй',
    defaultAmountMnt: 0,
    defaultYearAmountMnt: 0,
    taglineMn: 'Өдөр бүр үнэгүй суралц',
    featuresMn: [
      'Үгийн сан, толь бичиг — бүрэн, хязгааргүй',
      'A1 түвшний бүх хичээл (унших/сонсох/ярих/бичих)',
      `Шалгалтын сангийн эхний ${FREE_QUESTION_LIMIT} асуулт`,
      'Сард 2 AI туршилт',
    ],
    missingMn: [
      'A2–C2 хичээл, шалгалтын сан',
      'TestDaF загвар шалгалт',
      'Хязгааргүй AI',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    nameMn: 'Pro багц',
    defaultAmountMnt: 19900,
    defaultYearAmountMnt: 199000,
    taglineMn: 'Бүх контент нээлттэй',
    featuresMn: [
      'Бүх түвшний хичээл (A1–B1 сан бүрэн)',
      'Бүрэн шалгалтын сан (A1–C2)',
      'TestDaF загвар шалгалт',
      'Загвар хариултууд',
      'Сард 5 AI туршилт',
    ],
    missingMn: [
      'Хязгааргүй AI орчуулагч, AI үнэлгээ',
    ],
  },
  max: {
    id: 'max',
    name: 'Max',
    nameMn: 'Max багц',
    defaultAmountMnt: 39900,
    defaultYearAmountMnt: 399000,
    taglineMn: 'Бүгд + хязгааргүй AI',
    featuresMn: [
      'Pro багцын бүх боломж',
      'AI орчуулагч — хязгааргүй',
      'Ярих дасгалын AI үнэлгээ — хязгааргүй',
      'Бичих дасгалын AI засвар, оноо — хязгааргүй',
    ],
    missingMn: [],
  },
};

const ACTIVE_BILLING_STATUSES = ['active', 'paid', 'trialing'];

export function isFounder(profile: UserProfile | null): boolean {
  if (!profile) return false;
  if ((profile.billing?.plan ?? '').toLowerCase() === 'founder') return true;
  return FOUNDER_EMAILS.includes(profile.email.trim().toLowerCase());
}

// The plan that actually applies right now (expired/canceled billing → free).
export function effectivePlan(profile: UserProfile | null): EffectivePlan {
  if (!profile) return 'free';
  if (isFounder(profile)) return 'founder';

  const billing = profile.billing ?? {};
  const status = (billing.status ?? '').toLowerCase();
  if (!ACTIVE_BILLING_STATUSES.includes(status)) return 'free';
  // Byl checkouts are one-off charges with no auto-renewal, so every plan
  // expires once its paid period ends. Trials must always carry a valid,
  // unexpired end date; paid plans trust legacy records that predate
  // currentPeriodEnd tracking (no end date stored → still active).
  const end = Date.parse(billing.currentPeriodEnd ?? '');
  if (status === 'trialing') {
    if (!Number.isFinite(end) || end < Date.now()) return 'free';
  } else if (Number.isFinite(end) && end < Date.now()) {
    return 'free';
  }

  const plan = (billing.plan ?? '').toLowerCase();
  if (plan === 'pro') return 'pro';
  if (plan === 'max') return 'max';
  // Legacy single-plan subscriptions ("Monthly") predate the tier split and
  // included AI access, so honor them as Max.
  return plan ? 'max' : 'free';
}

// Unlimited AI (Max/founder). Free/Pro still get a monthly teaser quota,
// enforced server-side and surfaced via /api/ai/quota.
export function canUseAi(profile: UserProfile | null): boolean {
  const plan = effectivePlan(profile);
  return plan === 'max' || plan === 'founder';
}

export function canAccessAllContent(profile: UserProfile | null): boolean {
  return effectivePlan(profile) !== 'free';
}

// Skill-library lessons: Free accounts only get A1 content.
export function isLessonLocked(profile: UserProfile | null, level: string): boolean {
  if (canAccessAllContent(profile)) return false;
  return level !== 'A1';
}

// How a question is positioned in the global exam bank order: levels A1→C2,
// inside each level reading→listening→writing→speaking, items in file order.
// Free accounts may only open questions whose global index is below the limit.
export function examQuestionGlobalIndex(level: ExamLevel, section: ExamSection, itemIdx: number): number {
  const sections: ExamSection[] = ['reading', 'listening', 'writing', 'speaking'];
  let count = 0;
  for (const lv of EXAM_LEVEL_ORDER) {
    for (const sec of sections) {
      if (lv === level && sec === section) return count + itemIdx;
      count += EXAMS[lv][sec].length;
    }
  }
  return count + itemIdx;
}

export function isExamQuestionLocked(
  profile: UserProfile | null,
  level: ExamLevel,
  section: ExamSection,
  itemIdx: number,
): boolean {
  if (canAccessAllContent(profile)) return false;
  return examQuestionGlobalIndex(level, section, itemIdx) >= FREE_QUESTION_LIMIT;
}
