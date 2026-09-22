/* Collapses the Home identity into the fixed topbar after the student starts scrolling. */
export function initScrollHeader() {
  const topbar = document.querySelector('.app-shell .topbar');
  const content = document.querySelector('#appMain');
  if (!topbar || !content) return;
  let ticking = false;

  const update = () => {
    topbar.classList.toggle('is-scrolled', content.scrollTop > 76);
    ticking = false;
  };

  content.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
  update();
}
