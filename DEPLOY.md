# Deploy Vivid Lingua for Free (website + AI backend together)

## The big picture (read this first)

Your app is **one server**, not two. The same Express server serves the website
*and* the AI endpoints (`/api/...`). So you do **not** deploy the frontend and
backend separately — you deploy **one service**, get **one URL**, and it behaves
like a normal website. There is nothing to "connect" by hand: the frontend
already calls `/api/...` on the same address.

```
        ┌──────────────────────────────────────────┐
        │   One web service (Render)                │
        │                                            │
   you → │   /            → the website (frontend)    │
        │   /api/...      → AI features (backend)     │
        └──────────────────────────────────────────┘
                     │  (browser talks directly to Firebase)
                     ▼
        ┌──────────────────────────────────────────┐
        │  Firebase Auth  → login / signup / reset   │
        │  Firestore      → saved progress           │
        └──────────────────────────────────────────┘
```

Firebase (login + saved progress) works from any host, so it needs no special
wiring. Do the Firebase setup once in **`FIREBASE_SETUP.md`**, then follow the
steps below to put the website online.

---

## What you need first

- [ ] Your code pushed to GitHub (you already have a repo).
- [ ] Firebase set up and `firebaseConfig.ts` filled in (see `FIREBASE_SETUP.md`).
- [ ] Your `GEMINI_API_KEY` (for the AI features).

### Push the latest code to GitHub

From inside `antigravity/Vivid-Lingua`:

```bash
git add -A
git commit -m "Add Firebase auth + cloud progress; prep for deploy"
git push
```

---

## Recommended: Render (100% free, no credit card)

Render's free tier runs a Node server straight from your GitHub repo. It's the
simplest way to get exactly what you asked for.

### Steps

1. Go to <https://render.com> and **Sign up with GitHub** (free).
2. Click **New ➜ Blueprint**.
3. Pick your `german-language-learning-project` repo and approve access.
   Render reads the included **`render.yaml`** and fills everything in for you
   (build command, start command, free plan).
4. When prompted for environment variables, set **`GEMINI_API_KEY`** to your key.
   (Leave it blank to ship without AI for now — the app still runs and the AI
   features fall back to offline mode.)
5. Click **Apply / Create**. Render installs, builds, and starts the app.
   First build takes a few minutes.
6. When it's live, Render shows a URL like **`https://vivid-lingua.onrender.com`**.
   That's your website. Open it, sign up, and your progress saves to the cloud.

> Prefer clicking over blueprints? Use **New ➜ Web Service** instead, pick the
> repo, and set: Build Command `npm install --include=dev && npm run build`,
> Start Command `npm start`, Instance Type **Free**, and add the
> `GEMINI_API_KEY` env var. Same result.

### One Firebase setting after you get your URL

So Firebase trusts your new address:

1. Firebase console ➜ **Authentication ➜ Settings ➜ Authorized domains**.
2. Click **Add domain** and paste your Render host (e.g.
   `vivid-lingua.onrender.com`, no `https://`).

(Email/password login usually works without this, but adding it avoids surprises
— and it's required if you ever add Google sign-in.)

### Redeploying later

With `autoDeploy` on (set in `render.yaml`), every `git push` to your default
branch redeploys automatically. **Progress is never lost on redeploy** — it
lives in Firestore, not in the deployed files.

### The one free-tier trade-off

A free Render service **sleeps after ~15 minutes** of no traffic, so the *first*
visit after a quiet spell takes ~30–60 seconds to wake up. After that it's
instant. Fine for a student/demo project. The Student Pack options below remove
this.

---

## Alternative: use your GitHub Student Pack (no sleeping)

You don't need these to be free — Render already is — but if you want to avoid
the cold-start, your Student Pack includes credits that do:

- **DigitalOcean — $200 credit.** Create an **App Platform** app from your repo;
  it auto-detects Node. Build `npm install --include=dev && npm run build`,
  Run `npm start`, add `GEMINI_API_KEY`. No sleeping. (Needs a card to verify;
  the credit covers the cost.)
- **Microsoft Azure for Students — $100 credit, no card.** Verify with your
  student email, then deploy as an **App Service** (Node 20). No sleeping.
- **Namecheap — free `.me` domain for a year.** Optional: point a nicer domain
  (e.g. `vividlingua.me`) at whichever host you pick, instead of the default
  `onrender.com` address. Add it under the host's "Custom domain" setting, then
  also add it to Firebase Authorized domains.

The deployment steps are the same idea everywhere: connect the GitHub repo, use
`npm install --include=dev && npm run build` to build and `npm start` to run, set
`GEMINI_API_KEY`, and add the final URL to Firebase Authorized domains.

---

## "Can I still deploy them separately?"

Yes, technically — but I don't recommend it for this app. Splitting the frontend
and backend onto two hosts would force you to deal with CORS and a configurable
API address, for no benefit, since they're already one server. Keep it as one
service: simpler, and it just works like a normal website.

---

## Quick checklist

- [ ] Code pushed to GitHub
- [ ] Render Blueprint created from the repo
- [ ] `GEMINI_API_KEY` set in Render
- [ ] Build succeeded, site is live at the Render URL
- [ ] Render URL added to Firebase **Authorized domains**
- [ ] Signed up a test account and confirmed progress saves
