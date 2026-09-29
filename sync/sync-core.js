// Protected Sync Core facade.
// UI imports this boundary; the Firebase implementation is loaded lazily.
const implementation = () => import('../js/realtime-sync.js');

export const SyncService = Object.freeze({
  start: (...args) => implementation().then(m => m.startRealtimeSync(...args)),
  syncNow: (...args) => implementation().then(m => m.startRealtimeSync(...args)),
  ensureCloudAuth: (...args) => implementation().then(m => m.ensureCloudAuth(...args)),
  hydrateStaffAccounts: (...args) => implementation().then(m => m.hydrateStaffAccounts(...args)),
  hydrateUserIdentifiers: (...args) => implementation().then(m => m.hydrateUserIdentifiers(...args)),
  usernameTakenOnline: (...args) => implementation().then(m => m.usernameTakenOnline(...args)),
  getStatus: () => ({ ...document.documentElement.dataset })
});

export const startRealtimeSync = (...args) => implementation().then(m => m.startRealtimeSync(...args));
export const ensureCloudAuth = (...args) => implementation().then(m => m.ensureCloudAuth(...args));
export const hydrateStaffAccounts = (...args) => implementation().then(m => m.hydrateStaffAccounts(...args));
export const hydrateUserIdentifiers = (...args) => implementation().then(m => m.hydrateUserIdentifiers(...args));
