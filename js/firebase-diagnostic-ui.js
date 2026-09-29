// Active Plus — login-page Firebase diagnostic button.
(() => {
  const addButton = () => {
    const card = document.querySelector('.auth-card');
    if (!card || card.querySelector('#firebaseDiagnosticButton')) return;
    const button = document.createElement('button');
    button.id = 'firebaseDiagnosticButton';
    button.type = 'button';
    button.textContent = 'সিঙ্ক সংযোগ পরীক্ষা';
    const output = document.createElement('pre');
    output.id = 'firebaseDiagnosticOutput';
    output.hidden = true;
    output.setAttribute('role', 'status');
    button.setAttribute('aria-controls', output.id);
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
        button.textContent = 'সিঙ্ক সংযোগ পরীক্ষা';
      }
    });
    card.append(button, output);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton, { once: true });
  else addButton();
})();
