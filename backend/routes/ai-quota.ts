import type { Express } from 'express';
import { getFirebaseAdmin } from '../lib/firebaseAdmin';
import { isGeminiConfigured } from '../lib/ai';
import { getAiQuota } from '../lib/plans';

// Read-only view of the caller's monthly AI teaser quota — powers the
// "AI үлдсэн: X/Y" counter in the UI. Does not consume a use.
export function registerAiQuotaRoute(app: Express) {
  // Lightweight deploy check — does not expose secrets, only whether the server
  // can see GEMINI_API_KEY and Firebase Admin credentials.
  app.get('/api/ai/health', (_req, res) => {
    return res.json({
      geminiConfigured: isGeminiConfigured(),
      firebaseAdminConfigured: Boolean(getFirebaseAdmin()),
    });
  });

  app.get('/api/ai/quota', async (req, res) => {
    try {
      const quota = await getAiQuota(req);
      if (quota === null) {
        // Dev mode without Firebase Admin: no limits to report.
        return res.json({ plan: 'dev', limit: null, used: 0, remaining: null, month: null });
      }
      if (quota === 'unauthenticated') {
        return res.status(401).json({ error: 'Нэвтэрч орно уу.' });
      }
      return res.json(quota);
    } catch (err) {
      console.error('AI quota lookup failed:', err);
      return res.status(503).json({ error: 'Квотын мэдээлэл уншиж чадсангүй.' });
    }
  });
}
