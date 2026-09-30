/* Emergency containment of the legacy anonymous RTDB bridge.
 * This is NOT authentication. Rules deny all client access independently.
 * Re-enable only after server-verified login and per-user authorization replace
 * the shared credential-bearing bridge. Never enable through localStorage/URL.
 */
export const LEGACY_CLOUD_ENABLED = false;
export const CLOUD_PAUSED_MESSAGE = 'নিরাপত্তার জন্য ক্লাউড সিঙ্ক ও অন্য ডিভাইসের অ্যাকাউন্ট আনা সাময়িক বন্ধ। এই ডিভাইসে সংরক্ষিত অ্যাকাউন্ট দিয়ে লগইন করুন।';
export const cloudPausedResult = () => ({ ok: false, reason: 'cloud-paused', retryable: false });
export function assertCloudAccess() {
  if (!LEGACY_CLOUD_ENABLED) {
    throw Object.assign(new Error(CLOUD_PAUSED_MESSAGE), { code: 'cloud-paused', retryable: false });
  }
}
