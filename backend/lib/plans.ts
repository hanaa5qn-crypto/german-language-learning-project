// =============================================================================
// Server-side subscription plans + entitlement checks.
// -----------------------------------------------------------------------------
// Paid tiers: Pro (all content) and Max (everything + unlimited AI). Founder
// emails get full access without payment. Non-Max accounts get a monthly AI
// teaser quota (Free 2, Pro 5) so everyone can taste the AI before buying Max.
//
// Prices are MNT, configurable via env:
//   PLAN_PRO_AMOUNT_MNT  (default 19900)   PLAN_PRO_YEAR_AMOUNT_MNT  (default 199000)
//   PLAN_MAX_AMOUNT_MNT  (default 39900)   PLAN_MAX_YEAR_AMOUNT_MNT  (default 399000)
//   FOUNDER_EMAILS (comma-separated; the founder address is always included)
//   AI_TEASER_FREE / AI_TEASER_PRO (monthly AI quota overrides)
// =============================================================================

import type { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin, verifyFirebaseBearer } from './firebaseAdmin';

export type PaidPlanId = 'pro' | 'max';
export type BillingInterval = 'month' | 'year';

export interface PaidPlan {
  id: PaidPlanId;
  name: string;
  amountMnt: number;       // monthly price
  yearAmountMnt: number;   // annual price (≈ 10× monthly = 2 months free)
  currency: 'MNT';
  aiAccess: boolean;       // unlimited AI
}

const DEFAULT_FOUNDER_EMAILS = ['hanaa5qn@gmail.com'];

function envAmount(name: string, fallback: number): number {
  const value = Number((process.env[name] ?? '').trim());
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function founderEmails(): string[] {
  const fromEnv = (process.env.FOUNDER_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_FOUNDER_EMAILS, ...fromEnv]));
}

export function isFounderEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return founderEmails().includes(email.trim().toLowerCase());
}

export function getPaidPlans(): Record<PaidPlanId, PaidPlan> {
  return {
    pro: {
      id: 'pro',
      name: 'Pro',
      amountMnt: envAmount('PLAN_PRO_AMOUNT_MNT', 19900),
      yearAmountMnt: envAmount('PLAN_PRO_YEAR_AMOUNT_MNT', 199000),
      currency: 'MNT',
      aiAccess: false,
    },
    max: {
      id: 'max',
      name: 'Max',
      amountMnt: envAmount('PLAN_MAX_AMOUNT_MNT', 39900),
      yearAmountMnt: envAmount('PLAN_MAX_YEAR_AMOUNT_MNT', 399000),
      currency: 'MNT',
      aiAccess: true,
    },
  };
}

export function parsePaidPlanId(value: unknown): PaidPlanId | null {
  const plan = String(value ?? '').trim().toLowerCase();
  return plan === 'pro' || plan === 'max' ? plan : null;
}

export function parseBillingInterval(value: unknown): BillingInterval {
  return String(value ?? '').trim().toLowerCase() === 'year' ? 'year' : 'month';
}

const ACTIVE_BILLING_STATUSES = ['active', 'paid', 'trialing'];

type EffectivePlan = 'free' | 'pro' | 'max' | 'founder';

function planFromBilling(billing: { plan?: string; status?: string; currentPeriodEnd?: string }): EffectivePlan {
  const status = (billing.status ?? '').toLowerCase();
  const active = ACTIVE_BILLING_STATUSES.includes(status);
  if (!active) return 'free';
  // Trialing status: expires strictly by currentPeriodEnd (no renewal flow).
  // Paid/active plans trust their status until a payment flow updates it.
  if (status === 'trialing') {
    const end = Date.parse(billing.currentPeriodEnd ?? '');
    if (!Number.isFinite(end) || end < Date.now()) return 'free';
  }
  const plan = (billing.plan ?? '').toLowerCase();
  if (plan === 'pro') return 'pro';
  if (plan === 'max' || plan === 'founder') return 'max';
  // Legacy "Monthly" subscriptions predate the tier split and included AI.
  return plan ? 'max' : 'free';
}

// Monthly AI teaser quota per plan; null = unlimited.
export function aiQuotaFor(plan: EffectivePlan): number | null {
  if (plan === 'max' || plan === 'founder') return null;
  if (plan === 'pro') return envAmount('AI_TEASER_PRO', 5);
  return envAmount('AI_TEASER_FREE', 2);
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7); // e.g. "2026-06"
}

export interface AiQuotaState {
  plan: EffectivePlan;
  limit: number | null; // null = unlimited
  used: number;
  remaining: number | null;
  month: string;
}

interface AiAccessResult {
  allowed: boolean;
  status: number;
  error?: string;
  code?: 'AI_QUOTA_EXCEEDED' | 'AUTH_REQUIRED';
  quota?: AiQuotaState;
}

// Read the caller's plan + AI usage. Returns null when Firebase Admin is not
// configured (local dev / demo) — callers treat that as "no limits".
async function loadQuotaState(req: Request): Promise<{ uid: string; state: AiQuotaState } | null | 'unauthenticated'> {
  const admin = getFirebaseAdmin();
  if (!admin) return null;

  let user;
  try {
    user = await verifyFirebaseBearer(req);
  } catch {
    user = null;
  }
  if (!user) return 'unauthenticated';

  const month = currentMonthKey();
  if (isFounderEmail(user.email)) {
    return { uid: user.uid, state: { plan: 'founder', limit: null, used: 0, remaining: null, month } };
  }

  const snap = await admin.db.collection('users').doc(user.uid).get();
  const data = snap.data() ?? {};
  const plan = planFromBilling((data.billing ?? {}) as { plan?: string; status?: string; currentPeriodEnd?: string });
  const limit = aiQuotaFor(plan);
  const usage = (data.aiUsage ?? {}) as { month?: string; count?: number };
  const used = usage.month === month ? Number(usage.count) || 0 : 0;

  return {
    uid: user.uid,
    state: {
      plan,
      limit,
      used,
      remaining: limit === null ? null : Math.max(0, limit - used),
      month,
    },
  };
}

export async function getAiQuota(req: Request): Promise<AiQuotaState | null | 'unauthenticated'> {
  const loaded = await loadQuotaState(req);
  if (loaded === null) return null;
  if (loaded === 'unauthenticated') return 'unauthenticated';
  return loaded.state;
}

// AI endpoints: Max/founder unlimited; Free/Pro consume one teaser use per call
// until the monthly quota runs out. When Firebase Admin is not configured the
// check is skipped so offline fallbacks keep working in dev.
export async function checkAiAccess(req: Request): Promise<AiAccessResult> {
  let loaded;
  try {
    loaded = await loadQuotaState(req);
  } catch (err) {
    console.error('AI access check failed to read billing:', err);
    return { allowed: false, status: 503, error: 'Эрхийн мэдээлэл шалгаж чадсангүй. Дахин оролдоно уу.' };
  }

  if (loaded === null) {
    console.warn('AI access check skipped: Firebase Admin is not configured (dev mode).');
    return { allowed: true, status: 200 };
  }

  if (loaded === 'unauthenticated') {
    return { allowed: false, status: 401, code: 'AUTH_REQUIRED', error: 'AI боломж ашиглахын тулд нэвтэрч орно уу.' };
  }

  const { uid, state } = loaded;
  if (state.limit === null) return { allowed: true, status: 200, quota: state };

  if (state.used >= state.limit) {
    return {
      allowed: false,
      status: 403,
      code: 'AI_QUOTA_EXCEEDED',
      quota: state,
      error: `Энэ сарын үнэгүй AI эрх (${state.limit}) дууслаа. Max багц хязгааргүй AI нээнэ.`,
    };
  }

  // Consume one teaser use. Stored as {month, count} so it auto-resets monthly.
  const admin = getFirebaseAdmin()!;
  try {
    await admin.db.collection('users').doc(uid).set({
      aiUsage: state.used === 0
        ? { month: state.month, count: 1 }
        : { month: state.month, count: FieldValue.increment(1) },
    }, { merge: true });
  } catch (err) {
    console.error('Could not record AI usage:', err);
  }

  const used = state.used + 1;
  return {
    allowed: true,
    status: 200,
    quota: { ...state, used, remaining: Math.max(0, state.limit - used) },
  };
}
