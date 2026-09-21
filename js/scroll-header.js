/* Collapses the Home identity into the fixed topbar after the student starts scrolling. */
export function initScrollHeader() {
  const topbar = document.querySelector('.app-shell .topbar');
  if (!topbar) return;
  let ticking = false;

  const update = () => {
    topbar.classList.toggle('is-scrolled', window.scrollY > 76);
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
  update();
}
