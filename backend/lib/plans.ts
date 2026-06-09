// =============================================================================
// Server-side subscription plans + entitlement checks.
// -----------------------------------------------------------------------------
// Paid tiers: Pro (all content, no AI) and Max (everything). Founder emails get
// full access without payment. Prices are MNT/month, configurable via env:
//   PLAN_PRO_AMOUNT_MNT (default 29900), PLAN_MAX_AMOUNT_MNT (default 49900),
//   FOUNDER_EMAILS (comma-separated; the founder address is always included).
// =============================================================================

import type { Request } from 'express';
import { getFirebaseAdmin, verifyFirebaseBearer } from './firebaseAdmin';

export type PaidPlanId = 'pro' | 'max';

export interface PaidPlan {
  id: PaidPlanId;
  name: string;
  amountMnt: number;
  currency: 'MNT';
  interval: 'month';
  aiAccess: boolean;
}

const DEFAULT_FOUNDER_EMAILS = ['hanaa5qn@icloud.com'];
const DEFAULT_AMOUNTS: Record<PaidPlanId, number> = { pro: 29900, max: 49900 };

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
      amountMnt: envAmount('PLAN_PRO_AMOUNT_MNT', DEFAULT_AMOUNTS.pro),
      currency: 'MNT',
      interval: 'month',
      aiAccess: false,
    },
    max: {
      id: 'max',
      name: 'Max',
      amountMnt: envAmount('PLAN_MAX_AMOUNT_MNT', DEFAULT_AMOUNTS.max),
      currency: 'MNT',
      interval: 'month',
      aiAccess: true,
    },
  };
}

export function parsePaidPlanId(value: unknown): PaidPlanId | null {
  const plan = String(value ?? '').trim().toLowerCase();
  return plan === 'pro' || plan === 'max' ? plan : null;
}

const ACTIVE_BILLING_STATUSES = ['active', 'paid', 'trialing'];

interface AiAccessResult {
  allowed: boolean;
  status: number;
  error?: string;
}

// AI endpoints (translator + speaking/writing evaluation) are Max/founder only.
// When Firebase Admin is not configured (local dev / demo without credentials)
// the check is skipped so the offline fallbacks keep working.
export async function checkAiAccess(req: Request): Promise<AiAccessResult> {
  const admin = getFirebaseAdmin();
  if (!admin) {
    console.warn('AI access check skipped: Firebase Admin is not configured (dev mode).');
    return { allowed: true, status: 200 };
  }

  let user;
  try {
    user = await verifyFirebaseBearer(req);
  } catch {
    user = null;
  }
  if (!user) {
    return { allowed: false, status: 401, error: 'AI боломж ашиглахын тулд нэвтэрч орно уу.' };
  }

  if (isFounderEmail(user.email)) return { allowed: true, status: 200 };

  try {
    const snap = await admin.db.collection('users').doc(user.uid).get();
    const billing = (snap.data()?.billing ?? {}) as { plan?: string; status?: string };
    const active = ACTIVE_BILLING_STATUSES.includes((billing.status ?? '').toLowerCase());
    const plan = (billing.plan ?? '').toLowerCase();
    // Legacy "Monthly" subscriptions predate the tier split and included AI.
    const aiPlan = plan === 'max' || plan === 'founder' || (plan !== '' && plan !== 'pro' && plan !== 'free');
    if (active && aiPlan) return { allowed: true, status: 200 };
  } catch (err) {
    console.error('AI access check failed to read billing:', err);
    return { allowed: false, status: 503, error: 'Эрхийн мэдээлэл шалгаж чадсангүй. Дахин оролдоно уу.' };
  }

  return {
    allowed: false,
    status: 403,
    error: 'AI боломжууд зөвхөн Max багцад нээлттэй. Профайл хэсгээс багцаа шинэчилнэ үү.',
  };
}
