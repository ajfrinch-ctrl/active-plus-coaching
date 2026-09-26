# Firebase security foundation (not deployed)

This repository is local-first today: existing pages and repositories still use browser `localStorage`. The Firebase files here are a reviewed backend foundation for the later cross-device migration; they do not connect the current UI to Firebase until the project Web config and client adapter are added.

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
