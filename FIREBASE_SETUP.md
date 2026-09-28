# Firebase security foundation (not deployed)

This repository is local-first today: existing pages and repositories still use browser `localStorage`. The Firebase files here are a reviewed backend foundation for the later cross-device migration; they do not connect the current UI to Firebase until the project Web config and client adapter are added.

## Realtime sync (`activePlusSync`) — required console settings

The shipped cross-device login bridge (`js/realtime-sync.js`) talks to the
**Realtime Database** instance `https://active-plus.firebaseio.com` under the
path `activePlusSync/v1`, after `signInAnonymously()`. All four settings below
must hold at once; if any one fails, the bridge is dead and a second device
cannot see IDs created on the first.

1. **Realtime Database instance** — the `databaseURL` in `js/firebase-config.js`
   must match an existing instance (`active-plus.firebaseio.com` responds; the
   `-default-rtdb` name does not exist for this project).
2. **Anonymous sign-in enabled** — Firebase Console → *Authentication →
   Sign-in method → Anonymous → Enable*. The deployed rules require
   `auth != null`, so without anonymous auth every read/write is refused.
3. **Rules deployed** — `firebase deploy --only database` publishes
   `database.rules.json` (read/write on `activePlusSync` for signed-in users).
   Default locked rules refuse everything with `Permission denied`.
4. **App Check enforcement OFF for Realtime Database** (or App Check
   initialized in the client — see below). When the console enforces App Check
   and the client sends no token, every request fails with
   `{"error": "Missing appcheck token"}`. Verify with:
   `curl https://active-plus.firebaseio.com/.json` — the answer must NOT be
   `Missing appcheck token` (an unauthenticated `Permission denied` is the
   expected, healthy response).

To keep App Check enforcement ON instead, register this web app under
*Firebase Console → App Check* with a reCAPTCHA v3 site key and paste that key
into `APP_CHECK_SITE_KEY` in `js/firebase-config.js` (debug-token instructions
are in the same file).

### Symptom checklist — "এই ডিভাইসে কোনো অ্যাকাউন্ট নেই। আগে রেজিস্ট্রেশন করুন।"

An ID that works on the device where it was created but shows this message on a
second device means the cloud bridge never carried it: device A could not push
(sync is broken on A) or device B could not pull (sync is broken on B). Check
settings 2–4 above, open the app once online on device A so it pushes the
missing records, then try the second device again. The login page now also
distinguishes this case: when the cloud lookup itself fails, it says so
explicitly instead of asking the user to register.

### Verifying that realtime sync actually runs

1. **Topbar border colour** (all panels + the login page): red = no internet,
   green = internet but the Firebase bridge has not connected yet, **blue =
   realtime sync is live** (`<html data-realtime-sync="online">`).
2. **Console check** (DevTools → Console on any page, a few seconds after
   load while online):
   `document.documentElement.dataset.realtimeSync` → `'online'` means the
   bridge started; anything else/undefined means it did not.
3. **Proof of data movement** — every mirrored write fires an event:
   `window.addEventListener('apc-sync-updated', e => console.log('sync:', e.detail));`
   then change a notice/student record and watch the event.
4. **Firebase Console → Realtime Database → Data** — the `activePlusSync/v1`
   node should contain `staffAccounts`, `staffDirectory`, `usernames`,
   `studentAccount`, `examDb` (the exam mirror: `examDb/exams/<id>`,
   `examDb/attempts/<id>`) and the mirrored collections. The console viewer
   shows the data regardless of rules.
5. **End-to-end**: create a login on device A (online), wait ~10 seconds,
   sign in with the same ID + password on device B.

## Role boundary

- The first Admin is claimed once through `createFirstAdmin`. A Firestore transaction lock allows only one successful bootstrap; the callable writes the `admin/active` role claim and a complete owner profile.
- The same bootstrap automatically creates one Manager, one Teacher and one Payment bootstrap identity. It generates unique usernames and strong temporary passwords, returns credentials once to the first Admin, and never writes passwords to Firestore. The future UI must show them once for secure handoff; bootstrap staff must change temporary passwords before Firestore access.
- Student IDs are not created as one shared/generic login. Each Student account is created per actual enrollment and starts `pending`; a Manager handles the decision. Admin can provision additional Manager/Teacher/Payment/Student identities with `adminCreateAccount`.
- **Manager can:** inspect pending student profiles and teaching/exam submissions needed for review; approve/reject Student enrollment; publish/reject pending Teacher exams; read academic reports. **Manager cannot:** create/manage accounts, view financial/general reports or transactions, collect payments, edit global settings, or change role authority.
- **Admin can:** provision/manage accounts, read general and financial reports, access finance, manage settings, and create staff/student accounts. Admin is deliberately rejected by student/exam approval callables and cannot directly update approval fields under `firestore.rules`.
- Admin can suspend/reactivate non-admin staff through `adminSetAccountStatus`; it cannot use this function to approve students.
- Client writes to role profiles, bootstrap documents, and username index are denied. Trusted Cloud Functions use Admin SDK to make those writes.

## Offline review / Emulator check

The app's `localStorage` adapter remains unchanged until a later client migration, so the current account form is device-local and must not be represented as globally unique. These rule/function files cannot enforce policy in the running app before Firebase is configured and deployed.

To review the role rules with the Firebase Emulator Suite (after network access installs dependencies):

```sh
npm install --prefix functions
npm --prefix functions run test:rules
```

This launches the Firestore emulator for a test proving Admin approval is denied, Manager approval succeeds, Manager finance/settings access is denied, and academic-report access is allowed.

No Firebase project ID, Web config, service-account key, or credentials are committed. Before production, configure a Firebase project, App Check, Auth providers, emulator/rules tests, backups, and deploy the functions/rules. Keep service-account credentials in Firebase-managed environments only; never place them in this repository or browser code.

## Current limitations

- Existing local-only student, payment, teacher and exam workflows are not yet migrated to Firestore/Auth. Rules describe the target remote collections; they do not replace the current local behavior yet.
- Manager-only approval becomes effective across devices only after the UI calls the Manager callables and the app reads/writes the remote collections. Do not deploy only the rules and expect the existing local panel to sync.
