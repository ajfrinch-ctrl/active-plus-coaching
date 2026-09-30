// Active Plus — the only Firebase SDK service import surface.
// Sync modules import services from here; UI modules never import Firebase SDKs.
export { getAuth, signInAnonymously, signInWithEmailAndPassword, setPersistence, browserLocalPersistence }
  from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
export { getDatabase, ref, get, set, runTransaction, onValue }
export { getFirestore, doc, getDoc }
  from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';