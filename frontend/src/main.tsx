import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {SpeedInsights} from '@vercel/speed-insights/react';
import {Analytics} from '@vercel/analytics/react';
import AuthGate from './AuthGate.tsx';
import './index.css';
import {setupNativeApi} from './native.ts';

// On native (iOS/Android) builds, route relative /api calls to the live backend.
setupNativeApi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
    <SpeedInsights />
    <Analytics />
  </StrictMode>,
);
