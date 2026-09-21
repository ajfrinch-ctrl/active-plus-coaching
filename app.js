// ===== Mobile Menu =====
const menuBtn = document.getElementById('menuBtn');
const nav = document.getElementById('nav');

menuBtn?.addEventListener('click', () => {
  nav.classList.toggle('open');
});

// Close menu when clicking a link
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
  });
});

// ===== Active Nav Link on Scroll =====
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(section => {
    const sectionTop = section.offsetTop - 100;
    if (scrollY >= sectionTop) {
      current = section.getAttribute('id');
    }
  });

  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${current}`) {
      link.classList.add('active');
    }
  });
});

// ===== Contact Form =====
const contactForm = document.getElementById('contactForm');
contactForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  alert('ধন্যবাদ! আপনার বার্তা পাঠানো হয়েছে। শীঘ্রই আমরা যোগাযোগ করব।');
  contactForm.reset();
});

// ===== PWA Install Prompt =====
let deferredPrompt;
const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');
const closeBanner = document.getElementById('closeBanner');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Show banner after a short delay
  setTimeout(() => {
    if (installBanner) installBanner.hidden = false;
  }, 2000);
});

installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log('Install outcome:', outcome);
  deferredPrompt = null;
  if (installBanner) installBanner.hidden = true;
});

closeBanner?.addEventListener('click', () => {
  if (installBanner) installBanner.hidden = true;
});

// Hide banner if already installed
window.addEventListener('appinstalled', () => {
  if (installBanner) installBanner.hidden = true;
  deferredPrompt = null;
});

// ===== Service Worker Registration =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered:', reg.scope))
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}
