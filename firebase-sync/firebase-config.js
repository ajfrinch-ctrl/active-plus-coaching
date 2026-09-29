// Public configuration only. Never place Admin credentials in this directory.
export { firebaseConfig } from '../firebase/firebase-config.js';
export const syncConfig = Object.freeze({
  schemaVersion: 1,
  enabled: false, // Requires deployed, tested server authorization and migration.
  queuePrefix: 'activePlus.secureSync.queue.v1:',
  retryBaseMs: 2000,
  retryCapMs: 300000,
  periodicMs: 60000
});
