/* Reserve the actual fixed-bar heights, including safe areas and loaded fonts.
   Only the main panel scrolls; neither view animations nor long forms move the bars. */
export function initFixedShell() {
  const bars = [];
  for (const [shellSelector, headerSelector, footerSelector] of [
    ['#appShell', '#studentHeader', '.bottom-nav'],
    ['#adminShell', '.admin-topbar', '.admin-bottom'],
    ['#teacherShell', '.admin-topbar', '.admin-bottom']
  ]) {
    const shell = document.querySelector(shellSelector);
    if (!shell) continue;
    for (const [selector, variable] of [[headerSelector, '--shell-header-height'], [footerSelector, '--shell-footer-height']]) {
      const element = shell.querySelector(selector);
      if (element) bars.push({ shell, element, variable });
    }
  }
  const measure = () => {
    for (const { shell, element, variable } of bars) {
      const height = Math.ceil(element.getBoundingClientRect().height);
      // Keep sensible fallbacks while login/pending screens hide the app bars.
      if (height > 0) shell.style.setProperty(variable, `${height}px`);
    }
  };
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(measure);
    bars.forEach(({ element }) => observer.observe(element, { box: 'border-box' }));
  }
  window.addEventListener('resize', measure, { passive: true });
  document.fonts?.ready.then(measure);
  measure();
}
