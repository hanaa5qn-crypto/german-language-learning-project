import type { Express, Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../lib/firebaseAdmin';

// =============================================================================
// Anonymous traffic counter. Visitors are logged-out, so this endpoint is
// public — it only ever increments integer counters, never reads or returns
// data. Each event maps to ONE field on a per-day document so the admin
// dashboard can chart visits and the signup funnel.
//
// Schema: analytics/{YYYY-MM-DD} = { date, visitors, guestStarts,
//   signupClicks, signups }. Written via the Admin SDK (bypasses Firestore
//   rules); the dashboard reads it under an isAdmin() rule.
//
// Abuse note: because it is unauthenticated, the counters can be inflated by
// anyone scripting the endpoint. That only skews vanity numbers (no data is
// exposed and no money/entitlement is touched). The EVENT_FIELD whitelist
// stops arbitrary field writes. Add per-IP rate limiting later if numbers
// start getting gamed.
// =============================================================================

const EVENT_FIELD: Record<string, 'visitors' | 'guestStarts' | 'signupClicks' | 'signups'> = {
  visit: 'visitors',
  guest_start: 'guestStarts',
  signup_click: 'signupClicks',
  signup: 'signups',
};

// UTC day key so counts don't double-roll across timezones / server regions.
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function registerTrackRoute(app: Express) {
  app.post('/api/track', async (req: Request, res: Response) => {
    const event = typeof req.body?.event === 'string' ? req.body.event : '';
    const field = EVENT_FIELD[event];
    // Unknown event → 204 (don't tell scripts what's valid, don't error the client).
    if (!field) return res.status(204).end();

    const admin = getFirebaseAdmin();
    // No backend Firebase config (e.g. local dev without creds) → silently no-op.
    if (!admin) return res.status(204).end();

    const date = todayKey();
    try {
      await admin.db.collection('analytics').doc(date).set(
        { date, [field]: FieldValue.increment(1) },
        { merge: true },
      );
    } catch (err) {
      console.warn('track increment failed:', err);
    }
    // Always 204 — the beacon is fire-and-forget; the client never waits on it.
    return res.status(204).end();
  });
}
