// Active Plus — login-page Firebase diagnostic button.
(() => {
  const addButton = () => {
    const card = document.querySelector('.auth-card');
    if (!card || card.querySelector('#firebaseDiagnosticButton')) return;
    const button = document.createElement('button');
    button.id = 'firebaseDiagnosticButton';
    button.type = 'button';
    button.textContent = '☁ Firebase Sync Diagnostic';
    button.style.cssText = 'display:block;width:100%;margin:14px 0 0;padding:11px 14px;border:1px solid #315efb;border-radius:14px;background:rgba(49,94,251,.08);color:#2146c7;font:600 13px/1.4 inherit;cursor:pointer;';
    const output = document.createElement('pre');
    output.id = 'firebaseDiagnosticOutput';
    output.hidden = true;
    output.style.cssText = 'margin:10px 0 0;padding:12px;border:1px solid #dbe2ec;border-radius:14px;background:#f8faff;color:#18233d;font:12px/1.55 system-ui,sans-serif;white-space:pre-wrap;overflow:auto;';
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'চেক হচ্ছে...';
      output.hidden = false;
      output.textContent = 'Firebase connection পরীক্ষা চলছে...';
      try {
        const { diagnoseFirebaseSync } = await import('./firebase-diagnostics.js?v=20260929-login');
        const r = await diagnoseFirebaseSync();
        output.textContent =
          'SDK: ' + (r.sdk ? 'PASS' : 'FAIL') + '\n' +
          'Database URL: ' + r.databaseURL + '\n' +
          'Authentication: ' + (r.authentication ? 'PASS' : 'FAIL') + '\n' +
          'Firebase Connection: ' + (r.firebaseConnection ? 'PASS' : 'FAIL') + '\n' +
          'Database Read: ' + (r.databaseRead ? 'PASS' : 'FAIL') + '\n' +
          'Database Write: ' + r.databaseWrite + '\n' +
          'LocalStorage Protected: ' + (r.localStorageProtected ? 'PASS' : 'FAIL') + '\n' +
          'Error: ' + (r.error || 'None');
      } catch (error) {
        output.textContent = 'Diagnostic error: ' + (error?.message || error);
      } finally {
        button.disabled = false;
        button.textContent = '☁ Firebase Sync Diagnostic';
      }
    });
    card.append(button, output);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton, { once: true });
  else addButton();
})();
