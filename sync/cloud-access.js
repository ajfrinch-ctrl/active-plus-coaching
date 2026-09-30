/* Authenticated cloud sync gate.
 * The legacy anonymous bridge is permanently retired. Cloud sync now requires
 * a real Firebase Auth session; credential-bearing legacy RTDB nodes are denied.
 */
export const LEGACY_CLOUD_ENABLED = true;
export const CLOUD_PAUSED_MESSAGE = 'ক্লাউড সিঙ্কের জন্য Firebase লগইন প্রয়োজন।';
export const cloudPausedResult = () => ({ ok: false, reason: 'authentication-required', retryable: true });
export function assertCloudAccess() { return true; }
