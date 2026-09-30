/* Active Plus — cloud sync is available whenever the user has a real Firebase Auth session.
 * There is no temporary/pause switch in production: login and sync must stay
 * available so the same account can work across devices.
 */
export const LEGACY_CLOUD_ENABLED = true;
export const CLOUD_PAUSED_MESSAGE = '';
export const cloudPausedResult = () => ({ ok: false, reason: 'authentication-required', retryable: true });
export function assertCloudAccess() { return true; }
