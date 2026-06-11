// =============================================================================
// Нийгмийн API клиент — backend/routes/social.ts руу хандах нимгэн wrappers.
// Бүх endpoint Firebase bearer token шаарддаг (нийтийн duel preview-ээс бусад).
// =============================================================================

import { getAuthInstance, isFirebaseConfigured } from './firebase';

export interface DuelSlotView {
  name: string;
  avatar: string;
  score: number | null;
  total: number | null;
  timeMs: number | null;
  isMe: boolean;
  submitted: boolean;
}

export interface DuelView {
  code: string;
  seed: number;
  level: string;
  status: 'open' | 'finished';
  createdAt: string;
  challenger: DuelSlotView | null;
  opponent: DuelSlotView | null;
  winnerSide?: 'challenger' | 'opponent' | 'draw';
  iWon?: boolean;
  draw?: boolean;
  waitingForOpponent?: boolean;
}

export interface LeaderboardRow {
  name: string;
  avatar: string;
  minutes: number;
  isMe: boolean;
}

// Сервер тал тохируулагдаагүй (Firebase Admin байхгүй) үед UI бүх нийгмийн
// хэсгийг нууж зөөлөн доройтох тул 503-ыг тусгай алдаагаар ялгана.
export class SocialUnavailableError extends Error {
  constructor() {
    super('Social API is not configured on this server.');
    this.name = 'SocialUnavailableError';
  }
}

async function socialAuthHeaders(): Promise<Record<string, string>> {
  try {
    if (!isFirebaseConfigured) return {};
    const user = getAuthInstance().currentUser;
    if (!user) return {};
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  } catch {
    return {};
  }
}

async function socialFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await socialAuthHeaders()),
    ...(init?.headers as Record<string, string> | undefined),
  };
  const response = await fetch(path, { ...init, headers });
  if (response.status === 503) throw new SocialUnavailableError();
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || 'Сүлжээний алдаа гарлаа.');
  }
  return data as T;
}

export function createDuel(level: string): Promise<DuelView> {
  return socialFetch('/api/social/duels', { method: 'POST', body: JSON.stringify({ level }) });
}

export function fetchDuel(code: string): Promise<DuelView> {
  return socialFetch(`/api/social/duels/${encodeURIComponent(code)}`);
}

export function submitDuelScore(
  code: string,
  payload: { score: number; total: number; timeMs: number },
): Promise<DuelView> {
  return socialFetch(`/api/social/duels/${encodeURIComponent(code)}/submit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchMyDuels(): Promise<{ duels: DuelView[] }> {
  return socialFetch('/api/social/duels');
}

export function ensureReferralCode(): Promise<{ code: string; invitesCount: number }> {
  return socialFetch('/api/social/referral', { method: 'POST' });
}

// Урилга бүртгэх: энгийн referral код, эсвэл тулааны код (challenger урьсанд
// тооцогдоно). Аль нэгийг нь өгнө. Амжилттай бол хоёр тал байнгын Pro авна.
export function redeemReferralCode(
  payload: { code?: string; duelCode?: string },
): Promise<{ redeemed: boolean; proGranted?: boolean }> {
  return socialFetch('/api/social/referral/redeem', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchLeaderboard(): Promise<{ leaderboard: LeaderboardRow[] }> {
  return socialFetch('/api/social/leaderboard');
}

// Хуваалцах линкүүд.
export function duelLink(code: string): string {
  return `${window.location.origin}/?duel=${encodeURIComponent(code)}`;
}

export function referralLink(code: string): string {
  return `${window.location.origin}/?ref=${encodeURIComponent(code)}`;
}

// navigator.share байвал түүгээр, үгүй бол clipboard руу хуулна.
// true = clipboard-д хуулсан (UI "Хуулагдлаа" гэж үзүүлнэ).
export async function shareLink(text: string, url: string): Promise<boolean> {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Vivid Lingua', text, url });
      return false;
    }
  } catch {
    // share цуцлагдсан/бүтэлгүйтсэн — clipboard руу шилжинэ
  }
  await navigator.clipboard.writeText(url);
  return true;
}
