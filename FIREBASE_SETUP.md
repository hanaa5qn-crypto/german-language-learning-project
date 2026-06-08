# Vivid Lingua — Login & Saved Progress Setup (Firebase)

This adds **real accounts** (email + password) and **cloud-saved progress** that
follows each user across devices and survives every redeploy. It uses two free
Firebase services:

- **Firebase Authentication** — handles sign up / log in.
- **Cloud Firestore** — stores each user's profile + progress under `users/{uid}`.

You only have to do the setup below **once**. After that, deploying is one command.

---

## Step 1 — Create a Firebase project (~2 min)

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. Click **Add project**, give it a name (e.g. `vivid-lingua`), accept the
   defaults, and create it. (You can disable Google Analytics — not needed.)

## Step 2 — Turn on Email/Password login

1. In the left sidebar: **Build → Authentication → Get started**.
2. Open the **Sign-in method** tab.
3. Click **Email/Password**, toggle it **Enable**, and **Save**.

## Step 3 — Create the database

1. Left sidebar: **Build → Firestore Database → Create database**.
2. Choose a location near your users and click **Next**.
3. Start in **production mode** (our security rules in `firestore.rules` will be
   applied in Step 6). Click **Create**.

## Step 3b — Create Storage (for speaking audio uploads)

1. Left sidebar: **Build → Storage → Get started**.
2. Start in **production mode** (our security rules in `storage.rules` will protect it).
3. Choose a location (ideally the same as your Firestore database) and click **Done**.

## Step 4 — Get your web config and paste it in

1. Click the **gear icon ⚙ → Project settings**.
2. Scroll to **Your apps** → click the **web icon `</>`** to register a web app
   (give it any nickname; you do **not** need "Firebase Hosting" checkbox here).
3. Firebase shows a `firebaseConfig = { ... }` object. Copy those values.
4. Open **`frontend/src/firebaseConfig.ts`** and replace each `PASTE_...`
   placeholder with your real values. Save.

> These config values are **not secret** — Firebase sends them to the browser on
> purpose. Your data is protected by the security rules, not by hiding these.

At this point, login already works when you run the app locally (`npm run dev`).

---

## Step 5 — Install the Firebase command-line tool

```bash
npm install -g firebase-tools
firebase login
```

`firebase login` opens a browser window — sign in with the same Google account.

## Step 6 — Point the project at your Firebase project

Open **`.firebaserc`** and replace `PASTE_YOUR_PROJECT_ID` with your real Project
ID (you'll find it in **Project settings**, top of the page). Then publish the
database and storage security rules:

```bash
firebase deploy --only firestore:rules,storage
```

> Prefer no command line? You can instead paste the contents of `firestore.rules`
> into the Firebase console under **Firestore Database → Rules → Publish**, and the contents
> of `storage.rules` under **Storage → Rules → Publish**.

## Step 7 — Deploy the actual website

Firebase here only provides **login + the database**. The website itself
(frontend **and** the AI backend together) is hosted as one service on **Render**
for free. See **`DEPLOY.md`** for that step-by-step — it takes about 5 minutes.

Your progress is safe across redeploys because it lives in Firestore, not in the
deployed files.

---

## Password recovery ("Forgot password?")

This works automatically once Email/Password sign-in is enabled (Step 2) — no
extra setup, no email service to configure.

- On the login screen, a user clicks **"Нууц үгээ мартсан уу?"** (Forgot your
  password?). Firebase emails them a **secure one-time link** that lets them set
  a new password. The link is single-use and expires on its own.
- The email is sent by Firebase from `noreply@<your-project>.firebaseapp.com`.
  You can customize its wording/branding in **Authentication → Templates →
  Password reset** if you like (optional).

> Note: Firebase sends a one-time **link**, not a numeric code. Both are
> single-use and equally secure. A numeric **code** would require a separate
> always-on backend plus an email-sending service (e.g. SendGrid) and secret
> keys — tell me if you specifically need that and I'll set it up.

## How the pieces fit together

- **Render** runs your one combined server → it serves the website **and** the
  AI features (`/api/...`) at a single URL, exactly like a normal website.
- **Firebase Auth** handles sign up / log in / password recovery.
- **Cloud Firestore** stores each user's profile + progress in the cloud.

The website talks to Firebase straight from the browser, so it works no matter
where the site is hosted. Nothing to "connect" by hand.

---

## Quick checklist

- [ ] Firebase project created
- [ ] Email/Password sign-in enabled
- [ ] Firestore database created
- [ ] Firebase Storage bucket created
- [ ] `frontend/src/firebaseConfig.ts` filled in
- [ ] `.firebaserc` Project ID filled in
- [ ] Firestore & Storage rules published (`firebase deploy --only firestore:rules,storage`, or via the console)
- [ ] Website deployed on Render — see `DEPLOY.md`
