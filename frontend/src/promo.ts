// =============================================================================
// Promo / affiliate API клиент — backend/routes/promo.ts + account.ts руу хандах
// нимгэн wrappers. Бүх endpoint Firebase bearer token шаарддаг.
// =============================================================================

import { getAuthInstance, isFirebaseConfigured } from './firebase';
import type { UserProfile } from './profiles';

export interface MyPromo {
  code: string;
  teacherName: string;
  discountPercent: number;
  firstPaymentDone: boolean;
}

export interface TeacherCodeView {
  code: string;
  teacherName: string;
  teacherContact: string;
  discountPercent: number;
  commissionPercent: number;
  active: boolean;
  createdAt: string;
  redeemCount: number;
  paidConversions: number;
  commissionAccruedCents: number;
}

async function authHeaders(): Promise<Record<string, string>> {
  try {
    if (!isFirebaseConfigured) return {};
    const user = getAuthInstance().currentUser;
    if (!user) return {};
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  } catch {
    return {};
  }
}

async function promoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
    ...(init?.headers as Record<string, string> | undefined),
  };
  const response = await fetch(path, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || 'Сүлжээний алдаа гарлаа.');
  }
  return data as T;
}

// --- Сурагч ------------------------------------------------------------------

// Шинэ данс бүрт 3 өдрийн үнэгүй туршилт (idempotent — давхар олгохгүй).
// `billing` буцаавал клиент шууд merge хийж, туршилтыг reload-гүйгээр нээнэ.
export function ensureSignupTrial(): Promise<{
  granted: boolean;
  plan?: string;
  trialDays?: number;
  billing?: NonNullable<UserProfile['billing']>;
}> {
  return promoFetch('/api/account/ensure-trial', { method: 'POST' });
}

// Багшийн promo кодоо холбоно (нэг л удаа, урилгатай давхцахгүй).
export function redeemPromoCode(code: string): Promise<{ redeemed: boolean; discountPercent?: number; teacherName?: string; already?: boolean }> {
  return promoFetch('/api/promo/redeem', { method: 'POST', body: JSON.stringify({ code }) });
}

// Одоогийн promo-гийн төлөв (paywall дээр хямдрал харуулахад).
export function getMyPromo(): Promise<{ promo: MyPromo | null }> {
  return promoFetch('/api/promo/me');
}

// Холбосон promo-гоо салгана (өөр код холбохын тулд). Зөвхөн хэрэглээгүй код.
export function removeMyPromo(): Promise<{ removed: boolean; already?: boolean }> {
  return promoFetch('/api/promo/me', { method: 'DELETE' });
}

// --- Admin -------------------------------------------------------------------

export function adminListTeacherCodes(): Promise<{ codes: TeacherCodeView[] }> {
  return promoFetch('/api/admin/teacher-codes');
}

export function adminCreateTeacherCode(input: {
  code: string;
  teacherName: string;
  teacherContact?: string;
  discountPercent: number;
  commissionPercent: number;
}): Promise<TeacherCodeView> {
  return promoFetch('/api/admin/teacher-codes', { method: 'POST', body: JSON.stringify(input) });
}

export function adminToggleTeacherCode(code: string, active: boolean): Promise<TeacherCodeView> {
  return promoFetch(`/api/admin/teacher-codes/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
}

// Кодыг бүрмөсөн устгана — устгасны дараа хэн ч ашиглах боломжгүй.
export function adminDeleteTeacherCode(code: string): Promise<{ deleted: boolean; code: string }> {
  return promoFetch(`/api/admin/teacher-codes/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  });
}
