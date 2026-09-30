# Realtime Database: per-user / per-role rules — design plan

Status: **PROPOSAL. Nothing here is deployed or enabled.**
`firebase.json` still publishes `database.rules.json`, which denies all client
access (see `docs/CLOUD-CONTAINMENT-114.md`). That must stay true until every
gate in §8 passes.

| Artifact | Purpose |
| --- | --- |
| `tools/rtdb-rules/build-v2-draft.mjs` | Generator (role predicates are written once, then inlined) |
| `database.rules.v2.draft.json` | Generated draft rules. **Not referenced by `firebase.json`** |
| `tests/rtdb-v2-draft-rules.test.mjs` | Access matrix run with a local simulator (`npm test`); also asserts the draft is not deployed |
| `tests/rtdb-rules-sim.mjs` | Small RTDB rules simulator. Not the Firebase engine |
| `functions/test/rtdb-rules.test.js` | Authoritative emulator suite (`cd functions && npm run test:rtdb-rules`) |

---

## 1. Why not `auth != null` on `activePlusSync`

`auth != null` only proves that a caller has *some* Firebase identity.
Anonymous sign-in is enabled and the web config is public, so anyone can get an
identity. Under that rule every caller could:

* read `staffAccounts`, `studentAccounts`, `usernames` and `staffDirectory`,
  which hold PBKDF2 hashes that can be attacked offline, plus the whole roster,
  all transactions and every exam answer key;
* overwrite `staffAccounts/admin` with their own hash and log in as Admin on
  any device that syncs.

The client-side login cannot fix this. The rules are the only security
boundary.

## 2. Identity model

Use the Firebase Auth accounts that `functions/index.js` already provisions
(email/password on `user.<username>@accounts.activeplus.app`, created by
`createFirstAdmin` / `adminCreateAccount`). Only Cloud Functions set custom
claims:

| Claim | Values | Status |
| --- | --- | --- |
| `role` | `admin` `manager` `teacher` `payment` `student` | exists |
| `status` | staff `active` / `suspended`; student `pending` / `approved` / `rejected` | exists |
| `mustChangePassword` | `true` blocks all data access | exists |
| `studentId` | the app's roster id (`students/<id>`, `tx.studentId`, `attempt.studentId`) | **new** |
| `teacherId` | the app's teacher id (`exam.teacherId`) | **new** |

The draft rules require, on every grant:

* `auth.token.firebase.sign_in_provider !== 'anonymous'`, as defence in depth;
* `mustChangePassword !== true`;
* staff: `status === 'active'`. Students: `status === 'approved'`;
* teachers must have `teacherId`, and students must have `studentId`.
  Otherwise the account is locked out until it is linked.

## 3. Data layout (`activePlusV2/…`)

The legacy `activePlusSync` tree stays `false/false` permanently. A new root
avoids mixing old, credential-bearing data with the new data. Two rules of
Realtime Database drive the layout:

* **Rules are not filters.** A listener on `students` needs read access to the
  *whole* node. Data that a student may see only partly is therefore split into
  per-student subtrees (`attempts/<studentId>`, `studentLedger/<studentId>`, …).
* **Grants cascade and cannot be revoked lower down.** Grants therefore sit at
  the lowest level that works, and writes happen **one record at a time**.

| Path | Read | Write |
| --- | --- | --- |
| `settings` | any active account | Admin |
| `notices/{id}` | any active account | Admin |
| `routine/{id}` | any active account | Admin, Teacher |
| `teaching/{id}` | any active account | Admin, Teacher |
| `teacherAssignments/{id}` | Admin, Manager, Teacher | Admin, Manager |
| `students` / `students/{sid}` | staff: whole node. Student: own record only | Admin, Manager |
| `transactions/{id}` | Admin, Payment | Payment: **create only**. Admin: any |
| `studentLedger/{sid}` | Admin, Payment, owning student | *server only* (trigger copy) |
| `exams/{id}` (includes answer keys) | Admin, Manager, Teacher | Teacher: own, status draft/pending, never after publish. Admin: draft/pending or delete. **Publish/reject only via the `managerReviewExam` callable** |
| `studentExams/{sid}/{examId}` (no answers) | staff, owning student | *server only* (fan-out on publish) |
| `attempts/{sid}/{attemptId}` | staff, owning student | owning student, only for an exam in their `studentExams`, not once `submitted`, `startedAt <= now`. Admin: delete |
| `results/{sid}/{examId}` | staff, owning student | *server only* (scored from the answer key) |
| `pushTokens/{uid}/{deviceId}` | **nobody** (Functions only) | owner uid. `role` must equal the claim. `studentId` must equal the claim, or be empty for staff |
| `staffAccounts`, `studentAccounts`, `usernames`, `staffDirectory` | **removed** | **removed** |

### Where credentials go

No password hash, username registry or staff directory lives in RTDB any more:

* **Login:** `signInWithEmailAndPassword`, so Firebase Auth checks the password
  on its servers. A new device gets nothing until the password is correct.
* **Username availability:** a rate-limited callable backed by Firestore
  `usernameIndex`, which is already server-only.
* **Staff directory:** Firestore `users`, where rules already allow Admin/owner
  reads, managed through callables.
* The local PBKDF2 records can stay as an **offline unlock** for a device that
  has already logged in online. They never sync.

## 4. Decisions for the owner (the draft's defaults are in brackets)

1. May teachers read **all** exams, including colleagues' answer keys?
   [yes, for simplicity]. Stricter option: `examsByTeacher/{teacherId}`.
2. May teachers and Payment read the **full roster**, including guardian
   mobiles? [yes]. Stricter option: a trimmed `rosterPublic` mirror.
3. Who edits the roster? [Admin + Manager]. Student self-registration goes
   through a callable.
4. Suspension takes effect when the ID token refreshes (≤ 1 h), and open RTDB
   connections keep their auth until then. If that is too slow, also call
   `revokeRefreshTokens` and add a server-written `revoked/{uid}` check to every
   grant.
5. Notices: should Manager publish too? [no, matching `firestore.rules`].

## 5. Required code changes

### Cloud Functions (`functions/index.js`)
* `adminCreateAccount` / `managerReviewStudent`: set a `studentId` claim linked
  to the roster record. Add a `linkTeacher` step that sets `teacherId`.
* `adminSetAccountStatus`: also `revokeRefreshTokens(uid)`.
* New triggers:
  * on `exams/{id}` becoming published, fan out a copy **without `answer`
    fields** to `studentExams/{sid}/{id}` for each participant;
  * on `attempts/{sid}/{aid}` becoming `submitted`, score it against the key
    and write `results/{sid}/{examId}`;
  * on `transactions/{id}`, mirror to `studentLedger/{studentId}/{id}`.
* `managerReviewExam`: work on the RTDB `exams/{id}` (it currently updates
  Firestore `exams`).
* Callables `usernameAvailable`, `listStaff` / `updateStaff`.
* Move the push triggers' `BRIDGE_ROOT` to `activePlusV2`. `tokenEntries()`
  must read `pushTokens/{uid}/{deviceId}`, one level deeper than now.

### Client
* `js/realtime-sync.js`
  * `DB_ROOT` becomes `activePlusV2`. Delete `syncStaffRole`, `syncDirectory`,
    `syncUsernames`, `syncStudentAccount`, `hydrateStudent`,
    `hydrateStaffAccounts`, `firstAdminExistsOnline`, `usernameTakenOnline`
    and all their listeners.
  * Subscribe by role. A student listens to `students/<studentId>`,
    `studentExams/<sid>`, `attempts/<sid>`, `results/<sid>` and
    `studentLedger/<sid>`, never to whole collections they cannot read. Skip
    collections the role cannot read, so it doesn't get endless
    `permission_denied` retries.
  * Replace the examDb mirror with `exams/{id}` (staff) and
    `attempts/{sid}/{id}`.
* `js/record-sync.js`
  * `commit` currently runs **one transaction on the whole collection node**.
    Change it to per-record `runTransaction(collection/{id})` or a multi-path
    `update`, because the rules grant writes only at record level.
* `js/login.js` / `js/staff-auth.js`
  * Online login uses `signInWithEmailAndPassword`. Handle
    `mustChangePassword` with `updatePassword` →
    `completeTemporaryPasswordChange` → `getIdToken(true)`.
  * Drop the "upgrade local Admin by sending the typed password to
    `createFirstAdmin`" path in favour of an explicit, one-time bootstrap
    screen.
* Exams (`js/exam-data.js`, `js/student-dashboard.js`)
  * Students render from `studentExams` (no answer keys). Scores come from
    `results`. Client-side scoring stays for staff preview only.
* `js/push-notifications.js`
  * Write to `pushTokens/<auth.uid>/<deviceId>`. Set `role` from the ID-token
    claim (not `cash-counter`/`staff`), and `studentId` from the claim or `''`.
* `sync/cloud-access.js`
  * Currently `LEGACY_CLOUD_ENABLED = true` and `assertCloudAccess()` always
    returns `true`. This **contradicts** `CLOUD-CONTAINMENT-114.md`. It is
    harmless only because the rules deny everything and `ensureCloudAuth` never
    creates anonymous users. Replace it with a gate that is true only for a
    signed-in, claim-bearing Firebase user, and update the containment doc.

## 6. Migration

1. Export `activePlusSync/v1` with the Admin SDK on a trusted machine. Keep the
   export offline and encrypted.
2. Provision a Firebase Auth account for every real staff member and student
   through `adminCreateAccount`. **Do not import the PBKDF2 hashes.** Users get
   temporary passwords with `mustChangePassword: true`.
3. Set the `studentId` / `teacherId` claims from the roster mapping.
4. Use an Admin SDK script to copy the non-credential collections into
   `activePlusV2`, reshaping `examDb/attempts` into `attempts/{sid}`. Then run
   the fan-out triggers once, or a backfill script.
5. After verification, delete `activePlusSync` (a separate, explicit step).

## 7. Testing

* `npm test` includes `tests/rtdb-v2-draft-rules.test.mjs`. It checks the full
  matrix for 7 active identities and 9 blocked ones: signed-out, anonymous,
  anonymous with a forged role claim, no claims, `mustChangePassword`,
  suspended, pending student, unlinked student, unlinked teacher. It also
  asserts that the draft is not wired into `firebase.json` and that the
  committed JSON matches its generator. **It uses a simulator. It is not
  evidence about production.**
* `functions/test/rtdb-rules.test.js` runs the same boundary on the real
  emulator. It was **not run in the sandbox where it was written**: Java and the
  emulator download were unavailable. It must pass in CI or locally first.

## 8. Gates before `firebase.json` may point at these rules

- [ ] Owner decisions in §4 recorded and reflected in the generator.
- [ ] All §5 function and client changes merged. The app works using only
      per-record writes and role-scoped listeners.
- [ ] `npm run test:rtdb-rules` (emulator) and `npm test` are green.
- [ ] Migration §6 steps 1–4 done on a **staging** project and checked with
      real devices for each role.
- [ ] App Check enforcement turned on for Realtime Database in the console.
- [ ] Rules Playground spot-check: anonymous and signed-out are denied
      everywhere, and each role matches the table in §3.
- [ ] Rename the draft to `database.rules.json` in the same change that
      updates `tests/cloud-containment.test.mjs` and this document.
