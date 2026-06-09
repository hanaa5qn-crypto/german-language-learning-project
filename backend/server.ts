import express from 'express';
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
app.use(express.json({ limit: '25mb' }));

// Hosts (Render, Cloud Run, Azure, etc.) tell the app which port to listen on
// via the PORT env var. Fall back to 3000 for local development.
const PORT = Number(process.env.PORT) || 3000;

registerApiRoutes(app);

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
  } else {
    const distPath = path.join(projectRoot, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
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
