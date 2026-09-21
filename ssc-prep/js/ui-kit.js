/**
 * Tiny DOM helpers. Deliberately minimal: one escaping function, one delegate,
 * one toast — enough to render from templates without an innerHTML XSS hole.
 */

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ENTITIES[char]);
}

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

/** One delegated click listener for the whole SPA: data-action="name" + data-* payload. */
export function onAction(root, handlers) {
  root.addEventListener('click', event => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger || !root.contains(trigger)) return;
    const handler = handlers[trigger.dataset.action];
    if (!handler) return;
    event.preventDefault();
    handler(trigger.dataset, trigger, event);
  });
}

export function onKey(root, handler) {
  document.addEventListener('keydown', event => {
    if (event.target.matches('input, textarea, select')) return;
    handler(event, root);
  });
}

export function onChange(root, selector, handler) {
  root.addEventListener('change', event => {
    const target = event.target.closest(selector);
    if (target) handler(event, target);
  });
}

export function onInput(root, selector, handler) {
  root.addEventListener('input', event => {
    const target = event.target.closest(selector);
    if (target) handler(event, target);
  });
}

let toastTimer = null;

export function toast(message, tone = 'neutral') {
  const host = $('#toastHost');
  if (!host) return;
  const tones = {
    neutral: 'bg-slate-900 text-white',
    good: 'bg-emerald-600 text-white',
    warn: 'bg-amber-500 text-slate-900',
    bad: 'bg-rose-600 text-white'
  };
  host.className = `pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 transition-opacity duration-200 sm:bottom-8 ${
    message ? 'opacity-100' : 'opacity-0'
  }`;
  host.innerHTML = message
    ? `<div role="status" class="max-w-md rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${tones[tone] || tones.neutral}">${esc(message)}</div>`
    : '';
  window.clearTimeout(toastTimer);
  if (message) toastTimer = window.setTimeout(() => { host.innerHTML = ''; host.classList.add('opacity-0'); }, 2800);
}

/** Focus-trap-free but accessible sheet; Escape and backdrop close it. */
export function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.querySelector('button, [href], input, select')?.focus();
}

export function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

export function setProgress(element, percent) {
  if (!element) return;
  element.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  element.setAttribute('aria-valuenow', String(Math.round(percent)));
}
