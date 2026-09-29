// Protected Sync Core facade.
// Keep UI independent from Firebase implementation details.
import * as realtime from '../js/realtime-sync.js';
export const SyncService = Object.freeze({
  start: realtime.startRealtimeSync,
  syncNow: realtime.startRealtimeSync,
  ensureCloudAuth: realtime.ensureCloudAuth,
  hydrateStaffAccounts: realtime.hydrateStaffAccounts,
  hydrateUserIdentifiers: realtime.hydrateUserIdentifiers,
  usernameTakenOnline: realtime.usernameTakenOnline,
  getStatus: () => ({ ...document.documentElement.dataset })
});
export const startRealtimeSync = realtime.startRealtimeSync;
export const ensureCloudAuth = realtime.ensureCloudAuth;
export const hydrateStaffAccounts = realtime.hydrateStaffAccounts;
export const hydrateUserIdentifiers = realtime.hydrateUserIdentifiers;