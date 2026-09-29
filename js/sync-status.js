/* No Firebase dependency: status remains available when the CDN/auth fails. */
export function setSyncStatus(state, error = null) {
  const code = String(error?.code || '').replace(/^auth\//, '');
  let message = {
    offline: 'অফলাইন — পরিবর্তন এই ডিভাইসে আছে',
    connecting: 'ক্লাউডে সংযোগ করা হচ্ছে…',
    pending: 'পরিবর্তন সিঙ্ক হচ্ছে…',
    online: 'ক্লাউড সিঙ্ক চালু',
    error: 'সিঙ্ক হয়নি — আবার চেষ্টা করুন'
  }[state] || 'সিঙ্কের অপেক্ষায়';
  if (/operation-not-allowed|admin-restricted-operation/.test(code)) message = 'Firebase Console-এ Anonymous sign-in চালু করুন';
  else if (/permission|denied/i.test(code)) message = 'Firebase Rules ও App Check পরীক্ষা করুন';
  else if (/network/.test(code)) message = 'ক্লাউডে পৌঁছানো যায়নি — ইন্টারনেট পরীক্ষা করুন';
  const root = document.documentElement;
  root.dataset.realtimeSync = state;
  root.dataset.realtimeSyncMessage = message;
  window.dispatchEvent(new CustomEvent('apc-sync-status', { detail: { state, message, code } }));
}

export function reportSyncError(error) {
  setSyncStatus(navigator.onLine ? 'error' : 'offline', error);
  // Never include database values, password hashes or tokens in diagnostics.
  console.warn('[Active Plus] Sync failed:', error?.code || error?.name || 'unknown');
}
