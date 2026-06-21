// Lightweight, fire-and-forget traffic + funnel tracking. Posts a single event
// name to /api/track, which increments a per-day counter the admin dashboard
// reads. No PII, no cookies — anonymous counts only. Uses sendBeacon so the
// request survives navigation/tab-close and never blocks the UI.

export type TrackEvent = 'visit' | 'guest_start' | 'signup_click' | 'signup';

export function track(event: TrackEvent): void {
  if (typeof window === 'undefined') return;
  try {
    const body = JSON.stringify({ event });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
      return;
    }
    // Fallback for browsers without sendBeacon; keepalive lets it outlive unload.
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* tracking must never break the app */
  }
}

// Counts a visitor at most once per browser per UTC day, so `visitors` reads as
// "unique daily visitors" rather than raw page loads (Vercel Web Analytics
// already covers raw pageviews). The localStorage guard is best-effort.
export function trackVisitOncePerDay(): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `vl_visit_${new Date().toISOString().slice(0, 10)}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch {
    /* private mode / storage disabled → just track every load */
  }
  track('visit');
}
