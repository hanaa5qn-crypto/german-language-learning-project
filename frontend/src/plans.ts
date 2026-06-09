// =============================================================================
// Vivid-Lingua subscription plans (Free / Pro / Max) + founder override.
// -----------------------------------------------------------------------------
// • Free  — танилцуулга эрх: шалгалтын сангийн зөвхөн эхний 10 асуулт, AI байхгүй.
// • Pro   — бүх контент нээлттэй, гэхдээ AI боломжууд (орчуулагч, ярих/бичих
//           AI үнэлгээ) хаалттай.
// • Max   — бүгд нээлттэй (AI орчуулагч + AI үнэлгээ).
// • Founder — имэйлээр таних; бүх эрх үргэлж нээлттэй, төлбөр шаардахгүй.
// Display prices here are defaults; the authoritative charge amount always
// comes from the backend (/api/payments/methods).
// =============================================================================

import type { UserProfile } from './profiles';
import { EXAMS, EXAM_LEVEL_ORDER, type ExamLevel } from './exams';

export type PlanId = 'free' | 'pro' | 'max';
export type EffectivePlan = PlanId | 'founder';
export type ExamSection = 'reading' | 'listening' | 'writing' | 'speaking';

// Founder accounts: always full access, no payment needed.
export const FOUNDER_EMAILS = ['hanaa5qn@icloud.com'];

// Free tier: only the first N questions of the exam question bank.
export const FREE_QUESTION_LIMIT = 10;

export interface PlanInfo {
  id: PlanId;
  name: string;
  nameMn: string;
  defaultAmountMnt: number; // fallback display price; server price wins
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
    taglineMn: 'Танилцах эрх',
    featuresMn: [
      `Шалгалтын сангийн эхний ${FREE_QUESTION_LIMIT} асуулт`,
      'Үндсэн хичээлийн орчин',
    ],
    missingMn: [
      'Бүрэн шалгалтын сан (A1–C2)',
      'TestDaF загвар шалгалт',
      'AI орчуулагч',
      'Ярих / бичих AI үнэлгээ',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    nameMn: 'Pro багц',
    defaultAmountMnt: 29900,
    taglineMn: 'Бүх контент нээлттэй',
    featuresMn: [
      'Бүрэн шалгалтын сан (A1–C2)',
      'TestDaF загвар шалгалт',
      'Бүх унших / сонсох / бичих / ярих сан',
      'Загвар хариултууд',
    ],
    missingMn: [
      'AI орчуулагч',
      'Ярих / бичих AI үнэлгээ',
    ],
  },
  max: {
    id: 'max',
    name: 'Max',
    nameMn: 'Max багц',
    defaultAmountMnt: 49900,
    taglineMn: 'Бүгд + AI боломжууд',
    featuresMn: [
      'Pro багцын бүх боломж',
      'AI орчуулагч (дүрмийн задаргаатай)',
      'Ярих дасгалын AI үнэлгээ',
      'Бичих дасгалын AI засвар, оноо',
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
  if (!ACTIVE_BILLING_STATUSES.includes((billing.status ?? '').toLowerCase())) return 'free';

  const plan = (billing.plan ?? '').toLowerCase();
  if (plan === 'pro') return 'pro';
  if (plan === 'max') return 'max';
  // Legacy single-plan subscriptions ("Monthly") predate the tier split and
  // included AI access, so honor them as Max.
  return plan ? 'max' : 'free';
}

export function canUseAi(profile: UserProfile | null): boolean {
  const plan = effectivePlan(profile);
  return plan === 'max' || plan === 'founder';
}

export function canAccessAllContent(profile: UserProfile | null): boolean {
  return effectivePlan(profile) !== 'free';
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
