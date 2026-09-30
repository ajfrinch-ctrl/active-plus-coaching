import { assertCloudAccess } from './cloud-access.js';
// Protected Sync Core facade.
// UI imports this boundary; the Firebase implementation is loaded lazily.
//
// IMPORTANT: hydration is single-flight at this boundary. Login, first-use
// setup, reconnect and background sync must not run the same credential
// hydration concurrently or race to rewrite local state.
const implementation = async () => {
  assertCloudAccess();
  return import('../js/realtime-sync.js');
};

let staffHydrationFlight = null;
const identityHydrationFlights = new Map();

function identityFlightKey(options = {}) {
  return JSON.stringify([
    String(options?.identifier || ''),
    String(options?.password || '')
  ]);
}

function hydrateStaffAccountsOnce(...args) {
  if (staffHydrationFlight) return staffHydrationFlight;
  staffHydrationFlight = implementation()
    .then(m => m.hydrateStaffAccounts(...args))
    .finally(() => { staffHydrationFlight = null; });
  return staffHydrationFlight;
}

function hydrateUserIdentifiersOnce(options = {}) {
  const key = identityFlightKey(options);
  if (identityHydrationFlights.has(key)) return identityHydrationFlights.get(key);
  const flight = implementation()
    .then(m => m.hydrateUserIdentifiers(options))
    .finally(() => { identityHydrationFlights.delete(key); });
  identityHydrationFlights.set(key, flight);
  return flight;
}

export const SyncService = Object.freeze({
  start: (...args) => implementation().then(m => m.startRealtimeSync(...args)),
  syncNow: (...args) => implementation().then(m => m.startRealtimeSync(...args)),
  ensureCloudAuth: (...args) => implementation().then(m => m.ensureCloudAuth(...args)),
  hydrateStaffAccounts: (...args) => hydrateStaffAccountsOnce(...args),
  firstAdminExistsOnline: (...args) => implementation().then(m => m.firstAdminExistsOnline(...args)),
  hydrateUserIdentifiers: (...args) => hydrateUserIdentifiersOnce(...args),
  usernameTakenOnline: (...args) => implementation().then(m => m.usernameTakenOnline(...args)),
  getStatus: () => ({ ...document.documentElement.dataset })
});

export const startRealtimeSync = (...args) => implementation().then(m => m.startRealtimeSync(...args));
export const ensureCloudAuth = (...args) => implementation().then(m => m.ensureCloudAuth(...args));
export const hydrateStaffAccounts = (...args) => hydrateStaffAccountsOnce(...args);
export const firstAdminExistsOnline = (...args) => implementation().then(m => m.firstAdminExistsOnline(...args));
export const hydrateUserIdentifiers = (...args) => hydrateUserIdentifiersOnce(...args);
