// Active Plus — Firebase online test configuration.
// Loaded only when the app is online; the app remains independent offline.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAW9t4luwORjyu6T926qhL4mhOguxuTstI',
  authDomain: 'active-plus.firebaseapp.com',
  databaseURL: 'https://active-plus.firebaseio.com',
  projectId: 'active-plus',
  storageBucket: 'active-plus.firebasestorage.app',
  messagingSenderId: '267388759271',
  appId: '1:267388759271:web:a2ed1103cae476be784642'
};

export const firebaseApp = initializeApp(firebaseConfig);
export { firebaseConfig };
