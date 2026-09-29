# Firebase sync bridge and backend security foundation

The UI is local-first and now has a Realtime Database compatibility bridge.
`functions/index.js` and `firestore.rules` describe a separate, server-authorized
Firebase Auth/Firestore backend; the current login UI does **not** call it.

**Security boundary:** the compatibility bridge uses anonymous Firebase Auth and
mirrors local password hashes. The existing RTDB rule `auth != null` allows any
anonymous project user to read/write that shared bridge. This is not owner/role
isolation and is **not safe for real student, credential or financial data**.
These repairs do not turn the bridge into production authentication. No rules
have been opened or deployed. Production rollout needs verified account
migration to the backend, removal of credential mirrors, and UID/role rules.
Do not deploy blanket `true` rules to troubleshoot this code.

## Realtime sync (`activePlusSync`) — required console settings

The shipped cross-device login bridge (`js/realtime-sync.js`) talks to the
**Realtime Database** instance `https://active-plus.firebaseio.com` under the
path `activePlusSync/v1`, after `signInAnonymously()`. All four settings below
must hold at once; if any one fails, the bridge is dead and a second device
cannot see IDs created on the first.

1. **Realtime Database instance** — the `databaseURL` in `js/firebase-config.js`
   must match the actual instance shown in Firebase Console. The configured
   value is `https://active-plus.firebaseio.com`; do not guess a different name.
2. **Anonymous sign-in enabled** — Firebase Console → *Authentication →
   Sign-in method → Anonymous → Enable*. The repository rules require
   `auth != null`, so without anonymous auth every read/write is refused.
3. **Rules deployed** — `firebase deploy --only database` publishes
   `database.rules.json` (read/write on `activePlusSync` for signed-in users).
   Default locked rules refuse everything with `Permission denied`.
4. **App Check configured** — when enforcement is enabled, initialize App
   Check with the registered provider before starting Auth/database operations.
   The bridge awaits `appCheckReady`. A missing token can still cause denied
   requests even when database rules allow the path. Use the Console and the
   visible sync-error message for diagnostics, not a public export of the
   entire database. Only a separate test environment should run without App Check.

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

### Login ID key encoding fix (2026-09-29)

Generated IDs such as `test.admin.apc` previously became object keys directly
under `activePlusSync/v1/usernames`. Realtime Database rejects dots in keys,
regardless of security rules. This could abort startup at the username registry
before the existing student login was uploaded. The bridge now percent-encodes
registry keys on every write and decodes them on reads/listener updates. The
actual username and password do **not** change; existing plain valid keys are
still readable. The two-device mock now enforces Firebase key restrictions.

After deploying the updated static app, reopen/reload it online on the original
device first (do not clear its site data), then retry login on the other device.
If the original account never reached the cloud, a rule change on its own cannot
recover it on another device. Login now distinguishes a failed cloud lookup,
an offline first login, and a missing account without instructing existing
users to register again. Console Auth/App Check/rules requirements above still
apply; this fix does not bypass them or replace the test bridge with production
Firebase Authentication.

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
   `studentAccounts/<encoded-username>`, `examDb` (the exam mirror: `examDb/exams/<id>`,
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

The app still uses its `localStorage` login adapter with a compatibility cloud mirror; username reservations are not a production account-ownership guarantee. The Firestore/function role rules do not authorize operations in the RTDB bridge.

To review the role rules with the Firebase Emulator Suite (after network access installs dependencies):

```sh
npm install --prefix functions
npm --prefix functions run test:rules
```

This launches the Firestore emulator for a test proving Admin approval is denied, Manager approval succeeds, Manager finance/settings access is denied, and academic-report access is allowed.

The web Firebase config is in `js/firebase-config.js`; it is not an Admin credential. No service-account key is committed. Before production, configure a Firebase project, App Check, Auth providers, emulator/rules tests, backups, and deploy the functions/rules. Keep service-account credentials in Firebase-managed environments only; never place them in this repository or browser code.

## Current limitations

- Existing local-only student, payment, teacher and exam workflows are not yet migrated to Firestore/Auth. Rules describe the target remote collections; they do not replace the current local behavior yet.
- Manager-only approval becomes effective across devices only after the UI calls the Manager callables and the app reads/writes the remote collections. Do not deploy only the rules and expect the existing local panel to sync.

## Sync repair — 2026-09-29

Implemented and tested locally, **not deployed to Firebase or GitHub Pages**:

- `record-sync.js`: persisted per-record outbox and last-applied view for students,
  transactions, notices, routine, teaching, settings and teacher assignments.
  Offline edits/deletions survive page reloads and failed writes. Transactions
  merge changed IDs into current server state; different records are not lost
  by whole-collection overwrites. Same-record concurrent edits remain last-write
  wins; financial conflict resolution still belongs on the trusted backend.
- `sync-collections.js`: teaching retains `{version, activities}`. Weekly routine
  retains `{sat: {date, classes}, ...}` and transfers individual class IDs.
- `realtime-value-codec.js`: preserves empty arrays/objects and encodes nested
  Firebase-forbidden keys. `__apc_empty_*_v1__` nodes are transport markers, not
  business records. Old plain records are still readable.
- Cloud application writes use the unpatched storage setter and emit a marked
  same-window storage notification, so existing UI subscriptions refresh without
  echo writes or page reloads. Admin and payment roster state refresh too.
- Student logins have separate `studentAccounts/<encoded-username>` records.
  Login selects a cloud account only after verifying its password. Opening an
  unrelated page no longer replaces the device's selected student account.
  The legacy singleton is read only when it matches the requested login; local
  records on original devices seed the new paths. Password hashes remain a
  test-bridge limitation, not a substitute for Firebase Authentication.
- Staff directory writes merge changed permanent record IDs; revision baselines
  preserve local additions/deletions. Existing directories refresh during login.
  Username claims merge transactionally instead of replacing other claims.
- New document/student IDs include random suffixes to avoid fresh-device daily
  sequence collisions. Existing IDs are not changed. Receipt filename tests
  accept the new suffix.
- Firebase Auth restoration is awaited and anonymous initialization is shared;
  SDK local persistence is set before creating the bridge's anonymous session.
  App login sessions remain device-bound; they are never copied between devices.
- Sync startup isolates collection failures, deduplicates listeners, retries
  failures and reports errors/pending/offline state. Blue status requires database
  connection and successful startup; it is not a financial settlement receipt.

### Audit round 2 — 2026-09-29 (same branch, not deployed)

Re-read of every changed file plus new regression tests. Found and fixed:

- **A stale cloud copy could revert a newer local password.** The account
  mirror used to accept whatever the cloud held. Now every saved account is
  stamped with `updatedAt` (`js/storage.js`) and the merge keeps the newest
  copy (`js/sync-merge.js`): a password changed while the cloud was unreachable
  is uploaded instead of being silently restored to the old one. Student ties
  keep the device's verified copy; staff ties keep the long-standing
  cloud-first rule. Regression: `tests/sync-merge.test.mjs` and the two-device
  test *"a password changed while the cloud was unreachable is never reverted"*.
- **A failed or missed reconnect could leave changes unsent.** The outbox is now
  also flushed when `startRealtimeSync` is called on an already-running bridge,
  by a 3-second timer while anything is pending, and by a 20-second check for a
  lost database connection. Regression: the two-device test using a silent
  `navigator.onLine` flip (no `online`/`offline` event at all).
- **A wrong cloud password could block a valid local login.** The login page no
  longer stops at a cloud mismatch; it continues with the device's own
  credentials and only uses the cloud answer to choose the message. Also, the
  staff and student cloud lookups now run in parallel instead of one after the
  other.
- **Explicit `null` values disappeared.** Realtime Database deletes a node
  written as `null`, so a roster student's `monthlyFee: null` came back missing.
  The transport codec now carries a marker instead, and drops `undefined` the
  way `JSON.stringify` does.
- **Routine order could change after a round trip.** Firebase returns object
  keys in key order; classes now carry `_syncOrder`, so every device shows the
  order the Manager entered.
- **A future teaching document version could have wiped the cloud copy.** An
  unknown `version` is no longer treated as "empty list" and is never uploaded.
- **The outbox no longer stores a second copy of every record.** The persisted
  view keeps a short fingerprint per record, so the sync state cannot exhaust
  the device's storage quota; a pre-audit state shape is discarded instead of
  being replayed (which could have invented deletions).
- **A failing panel refresh could break the others.** The cloud-refresh handlers
  in the Admin, Cash Counter and student panels are individually guarded, so one
  error no longer stops the rest of the update.
- **Exam attempts** are normalised on arrival (an empty `answers` object, a
  missing `order` array), so a record RTDB trimmed is still readable.

Known limitations left in place (documented, not fixed):

- Logging in with a *mobile number* on a device that has never seen that
  student reads the whole `studentAccounts` subtree (RTDB has no indexed lookup
  here). Username logins read a single path. A small phone → login-ID index
  would remove the scan.
- `activePlus.directorySyncBaseline.v2` stays in plain localStorage: it holds
  Staff record IDs and their `updatedAt` only (no names, no password hashes),
  while the directory itself stays AES-encrypted.
- Same-record concurrent edits remain last-write-wins; balances, counters and
  approvals still need a trusted backend (Cloud Functions) to be authoritative.
- The exam mirror is one global node, so a device uploading the exam database is
  effectively the leader until another device opens the exam panel.

### Audit round 3 — 2026-09-29 (same branch, not deployed)

A fresh pass over the *identity* flows (registration, first use, staff
creation) and over real Realtime Database behaviour rather than the test mock.
Three ways one device could silently destroy another device's account, plus
smaller findings:

- **A duplicate registration could overwrite another student's cloud login.**
  Registration only checked this device's registry, so a phone that had not
  synced yet could register an ID that already belonged to somebody else; the
  mirror then treated the newer copy as the truth. Now
  `chooseStudentCopy()` (`js/sync-merge.js`) refuses to merge two different
  people: the cloud record is left untouched, the local registration stays
  usable, and a visible conflict message asks for the Admin. The student
  listener has the same guard, so a cloud record for another person is never
  adopted on this device either (that would have replaced the active account).
  Online registration and Staff Management now ask the cloud first
  (`usernameTakenOnline()`), so the duplicate is refused before anything is
  written.
- **A second Admin created on an unsynced device could replace the real Admin.**
  The one-time first-use form is per device: offline (or with App Check/rules
  blocking sync) a device can believe it is the first use and create its own
  Admin, whose newer timestamp then won the merge. `chooseStaffCopy()` now
  treats two different Admin usernames as a conflict: the cloud Admin stays,
  the device adopts it, and the banner explains what happened.
- **A fresh default role account could replace a real credential.** A reset or
  re-installed device bootstraps `manager.apc` / `teacher.apc` / `payment.apc`
  with default passwords; those now never outrank a real cloud account — a
  local record that was never personalised (`mustChangePassword`) always yields
  to the cloud copy, while genuine newest-wins merging stays for real changes.
- **The mock database now matches the SDK on aborted transactions.** Returning
  `undefined` from a transaction update must abort without writing; the mock
  deleted the node instead, which is exactly what the new guards rely on.
- Numeric-keyed maps returned by the database are rebuilt as lists in the value
  codec (for hand-written or gapped data), alongside the existing empty-node
  and null handling.
- `js/register.js`, `js/staff-directory.js` and `js/login.js` now load the
  bridge through one identical versioned specifier, so a page never ends up
  with two bridge instances (two anonymous sign-ins and duplicate listeners).

Regressions: `tests/sync-merge.test.mjs` (staff/student copy rules) and two new
two-device tests — *"a fresh device cannot register a login ID another student
already owns"* and *"a second Admin created on an unsynced device cannot replace
the real Admin"*. Both fail if any of the three guards is removed (verified by
temporarily reverting each one).

### Student ID দিয়ে লগইন (2026-09-29)

আগে লগইন ফরম শুধু **ইউজারনেম** ও **মোবাইল নম্বর** চিনত — প্রোফাইলে দেখানো
**Student ID** (`s260929001-…`) দিয়ে লগইন করা যেত না। এখন তিনটিই কাজ করে:
`matchesLoginIdentifier()` / `findLoginMatches()` (`js/sync-merge.js`) একই নিয়ম
লোকাল ও ক্লাউড দুই পথেই ব্যবহার করে।

- পূর্ণ Student ID, অথবা সংক্ষিপ্ত রূপ (`s260929001`) — কিন্তু সংক্ষিপ্ত রূপ তখনই
  খাটে যখন ঠিক একজন শিক্ষার্থীর সাথে মেলে; একাধিক হলে ফরম বলে দেয় সম্পূর্ণ ID
  লিখতে।
- পাসওয়ার্ড ছাড়া Student ID দিয়ে লগইন হয় না (আইডি পাসওয়ার্ড নয়)।
- আইডি না-মিললেও ব্যর্থ পাসওয়ার্ড যাচাইয়ে কোনো অ্যাকাউন্ট কখনো বসানো হয় না,
  এবং দুইজন আলাদা ব্যক্তি একই ID-তে এলে আগের মতোই conflict দেখায়।

ছোট আইডি খুঁজতে এখন বড় স্ক্যান লাগে (Student ID কোনো key নয়), তাই এই পথটি
মোবাইল-নম্বর লগইনের মতোই `studentAccounts` শাখাটি পড়ে — বড় ইনস্টলেশনে
Student-ID হুবহু key হিসেবে রাখা বা একটি index node রাখাই ভালো হবে।

### Publishing and acceptance

GitHub Pages currently publishes the repository's **main** branch at `/`.
Changes on the Arena branch are not automatically published there. Review/merge
the pull request, wait for the Pages deployment, then:

1. Back up existing data. Do **not** clear site storage on the original device.
2. Reload the original device online on the updated static app; check the sync
   status. Open every original device that holds an account not yet uploaded.
3. Reload the other device and sign in with the same ID/password.
4. Add a notice, routine class, teaching activity or teacher assignment. The
   second device should update without reload. Delete the last item and verify
   it disappears. Repeat in the opposite direction.
5. Disconnect A, edit a record, edit a different record on B, reconnect A: both
   changes must remain. Reopen A to check the durable collection outbox.
6. A sync error requires fixing the stated Console/network issue and retrying;
   changing rules to `true` cannot fix disabled anonymous Auth or App Check.

### দুই ডিভাইসের ব্যাকআপ মেলানো (ঐচ্ছিক, ব্রাউজার-টুল)

`tools/merge-backups.html` একটি সম্পূর্ণ অফলাইন পেজ: দুটি ব্যাকআপ JSON বাছাই করে
`js/backup-merge.js` দিয়ে প্রতি-ID ইউনিয়ন করে, দ্বন্দ্বের তালিকা দেখায়, আর
রিস্টোর-যোগ্য একটি মিলিত ব্যাকআপ ডাউনলোড দেয়। ব্যাকআপে ডিলিটের তথ্য থাকে না —
তাই এটি মুছে ফেলা রেকর্ড ফিরিয়ে আনতে পারে এবং লেনদেনের দ্বন্দ্ব নিজে মেলাতে হয়।
এই পেজটি সাইটের লিংক (http/https) থেকে খুলুন; ফাইল সরাসরি ডাবল-ক্লিক করলে
ES module নিষিদ্ধ হতে পারে।

`npm test` includes isolated multi-device integration tests using a local RTDB
mock (key restrictions, empty-node removal, transaction retries and listeners)
and pure outbox regression tests. These tests never write to the live project.
They do not certify deployed Firebase rules, Console settings or real mobile
network performance. Exam syncing retains its separate existing merge engine;
its pending-write tracking and identity password changes do not yet have the
same durable outbox guarantees as the listed application collections.
