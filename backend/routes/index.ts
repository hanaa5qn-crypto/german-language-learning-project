import type { Express } from 'express';
import { registerEvaluateSpeakingRoute } from './evaluate-speaking';
import { registerEvaluateWritingRoute } from './evaluate-writing';
import { registerEvaluateCompositionRoute } from './evaluate-composition';
import { registerPaymentsRoute } from './payments';
import { registerTranslateRoute } from './translate';
import { registerAiQuotaRoute } from './ai-quota';

export function registerApiRoutes(app: Express) {
  registerPaymentsRoute(app);
  registerAiQuotaRoute(app);
  registerEvaluateWritingRoute(app);
  registerEvaluateCompositionRoute(app);
  registerTranslateRoute(app);
  registerEvaluateSpeakingRoute(app);
}
