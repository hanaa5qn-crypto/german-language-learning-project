import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { registerApiRoutes } from './routes';

const projectRoot = process.cwd();
const frontendDir = path.join(projectRoot, 'frontend');

dotenv.config({ path: path.join(projectRoot, '.env') });

export const app = express();
// Trust the first proxy hop (ngrok / Cloud Run) so req.ip is the real client IP,
// which the per-IP AI rate limiter relies on.
app.set('trust proxy', 1);
// Larger limit so base64-encoded audio recordings from the speaking section fit.
// `verify` keeps the raw body around so the Byl webhook can check its
// HMAC-SHA256 Byl-Signature header against the exact bytes Byl signed.
app.use(express.json({
  limit: '25mb',
  verify: (req, _res, buf) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  },
}));

// Security headers — applied to every response.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://firebasestorage.googleapis.com https://*.googleapis.com https://*.firebase.com https://*.firebaseio.com; media-src 'self' blob:; font-src 'self' data:;",
  );
  next();
});

// Hosts (Render, Cloud Run, Azure, etc.) tell the app which port to listen on
// via the PORT env var. Fall back to 3000 for local development.
const PORT = Number(process.env.PORT) || 3000;

registerApiRoutes(app);

function resolveDistPath() {
  const candidates = [
    path.join(projectRoot, 'dist'),
    projectRoot,
    path.join(projectRoot, 'frontend', 'dist'),
  ];

  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html'))) ?? candidates[0];
}

function registerProductionStatic() {
  const distPath = resolveDistPath();
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

if (process.env.NODE_ENV === 'production') {
  registerProductionStatic();
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Vite is only needed for the local dev server, so it's loaded lazily here.
    // This keeps it out of the production bundle/runtime (it's a devDependency).
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: frontendDir,
      configFile: path.join(frontendDir, 'vite.config.ts'),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Vivid Lingua Server running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  const isServerless = process.env.VERCEL && !process.env.PORT;
  if (!isServerless) {
    startServer();
  }
}

export default app;
