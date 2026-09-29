/* Active Plus — Firebase diagnostic button. UI-only helper; never changes app data. */
(() => {
  const boot = () => {
    if (document.getElementById('apcFirebaseDiagnosticButton')) return;

    const style = document.createElement('style');
    style.textContent = `
      #apcFirebaseDiagnosticButton{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:46px;margin:14px 0 0;padding:11px 14px;border:1px solid #d7e0ee;border-radius:14px;background:#f7f9fc;color:#173b8f;font:800 14px/1.2 inherit;cursor:pointer}
      #apcFirebaseDiagnosticButton:disabled{opacity:.65;cursor:wait}
      #apcFirebaseDiagnosticResult{margin:10px 0 0;padding:12px;border:1px solid #dfe5ee;border-radius:14px;background:#fff;color:#172033;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word;display:none}
      #apcFirebaseDiagnosticResult[data-state="error"]{border-color:#efb4b4;background:#fff7f7}
      #apcFirebaseDiagnosticResult[data-state="ok"]{border-color:#b8decf;background:#f7fffb}
    `;
    document.head.appendChild(style);

    const card = document.querySelector('.auth-card');
    if (!card) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <button id="apcFirebaseDiagnosticButton" type="button" aria-controls="apcFirebaseDiagnosticResult">☁ Firebase Sync Diagnostic</button>
      <div id="apcFirebaseDiagnosticResult" role="status" aria-live="polite"></div>
    `;
    card.appendChild(wrap);

    const button = wrap.querySelector('#apcFirebaseDiagnosticButton');
    const resultBox = wrap.querySelector('#apcFirebaseDiagnosticResult');

    const formatReport = report => {
      const lines = [
        \`SDK: \${report.sdk ? 'PASS' : 'FAIL'}\`,
        \`Database URL: \${report.databaseURL ? 'PASS' : 'FAIL'}\`,
        \`Authentication: \${report.authentication ? 'PASS' : 'FAIL'}\`,
        \`Firebase connection: \${report.firebaseConnection ? 'PASS' : 'FAIL'}\`,
        \`Database read: \${report.databaseRead ? 'PASS' : 'FAIL'}\`,
        \`Database write: \${report.databaseWrite}\`,
        \`LocalStorage protected: \${report.localStorageProtected ? 'PASS' : 'FAIL'}\`
      ];
      if (report.error) lines.push(\`Error: \${report.error.code || 'unknown'} — \${report.error.message || ''}\`);
      return lines.join('\\n');
    };

    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Diagnostic চলছে…';
      resultBox.style.display = 'block';
      resultBox.dataset.state = '';
      resultBox.textContent = 'Firebase connection পরীক্ষা করা হচ্ছে…';

      try {
        const module = await import('./firebase-diagnostics.js?v=20260929-ui');
        const report = await module.diagnoseFirebaseSync();
        resultBox.textContent = formatReport(report);
        resultBox.dataset.state = report.error ? 'error' : 'ok';
      } catch (error) {
        resultBox.dataset.state = 'error';
        resultBox.textContent = \`Diagnostic চালানো যায়নি\\n\${error?.message || String(error)}\`;
      } finally {
        button.disabled = false;
        button.textContent = '☁ Firebase Sync Diagnostic';
      }
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();