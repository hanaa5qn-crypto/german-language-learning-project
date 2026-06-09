// Shared protections for the AI endpoints so a public deploy can't run up the
// Gemini bill. Three layers, all tunable via env vars:
//   1. Per-IP sliding-window rate limit  -> HTTP 429 (abuse protection)
//   2. Text / audio size caps            -> clamp text, reject oversized audio
//   3. Global daily AI-call budget        -> past it, routes skip the AI call and
//      fall back to the local rule-based response (graceful degradation)
import type { Request } from 'express';

const num = (v: string | undefined, d: number) => {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const AI_LIMITS = {
  ratePerMin: num(process.env.AI_RATE_PER_MIN, 30),       // per-IP AI requests / minute
  dailyBudget: num(process.env.AI_DAILY_BUDGET, 500),     // total AI calls / day, then fallback
  maxTextChars: num(process.env.AI_MAX_TEXT_CHARS, 4000), // per text field sent to the model
  maxAudioBytes: num(process.env.AI_MAX_AUDIO_BYTES, 6_000_000), // decoded audio size (~6MB)
};

export function clientIp(req: Request): string {
  // Check X-Real-IP first (safely set by Vercel/Render edge proxies)
  const realIp = req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') {
    return realIp;
  }

  // Fall back to X-Forwarded-For if it exists (extract client IP)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor && typeof forwardedFor === 'string') {
    const ips = forwardedFor.split(',');
    if (ips[0]) return ips[0].trim();
  }

  // Local/direct connection fallback
  return (req.ip || req.socket?.remoteAddress || 'unknown').toString();
}

// --- per-IP fixed-window rate limit (shared across all AI endpoints) -------
const WINDOW_MS = 60_000;
interface RateLimitRecord {
  count: number;
  resetTime: number;
}
const hits = new Map<string, RateLimitRecord>();

export function rateLimited(ip: string): boolean {
  const now = Date.now();
  const record = hits.get(ip);

  if (!record || now > record.resetTime) {
    // Window expired or new IP connection
    hits.set(ip, {
      count: 1,
      resetTime: now + WINDOW_MS,
    });

    // Proactive cleanup of expired records if memory usage grows
    if (hits.size > 2000) {
      for (const [k, v] of hits.entries()) {
        if (now > v.resetTime) {
          hits.delete(k);
        }
      }
    }
    return false;
  }

  record.count++;
  return record.count > AI_LIMITS.ratePerMin;
}

// --- global daily AI-call budget (resets at UTC midnight) --------------------
let dayKey = '';
let dayCount = 0;
const today = () => new Date().toISOString().slice(0, 10);
function rollDay() {
  const d = today();
  if (dayKey !== d) { dayKey = d; dayCount = 0; }
}
export function budgetExhausted(): boolean {
  rollDay();
  return dayCount >= AI_LIMITS.dailyBudget;
}
export function consumeBudget(): void {
  rollDay();
  dayCount++;
}

// --- size guards ------------------------------------------------------------
export function clampText(s: string | undefined, max = AI_LIMITS.maxTextChars): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}
export function audioTooLarge(base64?: string): boolean {
  if (!base64) return false;
  const bytes = Math.floor((base64.length * 3) / 4); // base64 -> ~decoded bytes
  return bytes > AI_LIMITS.maxAudioBytes;
}

// Returns an AI client ONLY when within the daily budget; otherwise null so the
// caller degrades to its rule-based fallback. Does NOT consume budget — call
// consumeBudget() right before an actual model request.
import { getAIClient } from './ai';
export function aiClientWithinBudget() {
  return budgetExhausted() ? null : getAIClient();
}
