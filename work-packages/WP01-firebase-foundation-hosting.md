# WP01 — Firebase Foundation & Hosting Infrastructure

## 1. Objective
Establish the foundational Firebase architecture, local development environment, hosting setup, and continuous deployment pipeline for the MMC web service.

---

## 2. Background & Context
MMC currently runs purely in the client browser with assets served statically or from file system. To become a scalable hosted service, we need:
- Firebase project initialization (`firebase.json`, `.firebaserc`).
- Firebase Hosting setup supporting Single Page Application (SPA) routing (e.g. `/`, `/canvas/:id`, `/view/:uuid`).
- Firebase Emulator Suite configuration for local development and offline unit testing without incurring cloud charges.

---

## 3. Scope of Work

### 3.1 Project Structure & Config
- Initialize Firebase config files:
  - `firebase.json`: Configuration for Firebase Hosting, Firestore, Realtime Database, Cloud Functions, and Emulators.
  - `.firebaserc`: Project aliases (e.g., `default`, `staging`, `production`).
  - `.env.example`: Template for environment-specific Firebase credentials (`apiKey`, `authDomain`, `projectId`, `storageBucket`, etc.).
- Configure clean URL rewrites in `firebase.json`:
  ```json
  {
    "hosting": {
      "public": ".",
      "ignore": [
        "firebase.json",
        "**/.*",
        "**/node_modules/**",
        "work-packages/**",
        "AGENTS.md"
      ],
      "rewrites": [
        {
          "source": "/view/**",
          "destination": "/index.html"
        },
        {
          "source": "/canvas/**",
          "destination": "/index.html"
        },
        {
          "source": "**",
          "destination": "/index.html"
        }
      ]
    }
  }
  ```

### 3.2 Firebase Client SDK Integration
- Choose a lightweight, modern module bundling strategy or native ES module imports:
  - Utilize Firebase v10/v11 modular SDK (`firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/database`).
  - Keep bundles tiny, utilizing CDN/ESM imports or a minimal Vite bundler configured to output directly to static distribution.
- Create `/js/firebase-config.js` to manage Firebase initialization:
  - Automatic detection of local emulator when running on `localhost` or `127.0.0.1`.
  - Production credential bootstrapping.

### 3.3 Firebase Emulator Suite
- Configure local emulators for:
  - Authentication (port `9099`)
  - Firestore (port `8080`)
  - Realtime Database (port `9000`)
  - Cloud Functions (port `5001`)
  - Hosting (port `5000`)
  - Emulator UI (port `4000`)

---

## 4. Deliverables & Acceptance Criteria
- [x] `firebase.json` and `.firebaserc` created and committed.
- [x] Firebase modular SDK integrated cleanly without degrading page load speed.
- [x] `npm run serve` or `firebase emulators:start` successfully spins up local environment.
- [ ] Direct routing to `/` and subpaths (`/canvas/xyz`, `/view/uuid`) serves the application without 404s. (`/invite/:canvasId/:inviteToken` route works client-side; hosting rewrites not yet verified against a deployed build)
- [ ] Dark mode, print mode, and CSS grid layout verified intact on hosted build. (verified locally only — no hosted/deployed build yet)
