/* Admin Panel shell — one permission-driven icon/navigation system.

   Everything the panel shows as "a place you can go" is described once, in
   js/admin-permissions.js, and rendered here from the capabilities of the
   signed-in role:

     • the bottom bar      (icon + label, animated active state)
     • the "More" menu     (icon + label + hint)
     • the dashboard grid  (large icon + clear label)

   Each entry carries its own AI-generated icon from assets/icons/admin (the
   shared water-drop glass family lives in assets/icons/glass). No emoji and no
   generic placeholder: every symbol means one specific section. Entries whose
   capability is not granted are never rendered at all, and
   `enforceCapabilities()` drops the matching views from the DOM.

   Presentation only — no storage, no routing rules and no business logic. */

import {
  ADMIN_BOTTOM_NAV,
  ADMIN_MORE_NAV,
  ADMIN_FEATURE_TILES,
  enforceCapabilities
} from './admin-permissions.js';

/* One icon per section. assets/icons/admin holds the set generated for this
   panel; only the Teacher entry (never granted here) falls back to the shared
   water-drop family in assets/icons/glass. */
export const ADMIN_ICON_FILES = Object.freeze({
  dashboard: 'assets/icons/admin/dashboard.png',
  users: 'assets/icons/admin/users.png',
  finance: 'assets/icons/admin/finance.png',
  payment: 'assets/icons/admin/payment.png',
  reports: 'assets/icons/admin/reports.png',
  notices: 'assets/icons/admin/notices.png',
  classes: 'assets/icons/admin/classes.png',
  app: 'assets/icons/admin/app.png',
  exams: 'assets/icons/admin/exams.png',
  routine: 'assets/icons/admin/routine.png',
  more: 'assets/icons/admin/more.png',
  logout: 'assets/icons/admin/logout.png',
  teaching: 'assets/icons/glass/suggestion.png'
});

function iconImage(key, className) {
  const img = document.createElement('img');
  img.className = className || 'panel-icon';
  img.src = ADMIN_ICON_FILES[key] || ADMIN_ICON_FILES.dashboard;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.decoding = 'async';
  img.draggable = false;
  return img;
}

/** Replace the inline SVG of an existing chip with the generated icon. */
function paintIcon(container, key, className) {
  if (!container) return null;
  const svg = container.querySelector('svg');
  if (svg) svg.remove();
  container.querySelector('img')?.remove();
  container.append(iconImage(key, className));
  return container;
}

/* ---------- Bottom bar ---------- */

function renderBottomBar(bar, entries, onNavigate) {
  if (!bar) return [];
  bar.replaceChildren();
  const buttons = entries.map(entry => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-bottom-item';
    button.dataset.adminView = entry.view;
    if (entry.capability) button.dataset.adminCap = entry.capability;

    const chip = document.createElement('span');
    chip.className = 'nav-chip';
    chip.append(iconImage(entry.icon, 'nav-icon'));

    const label = document.createElement('span');
    label.className = 'nav-label';
    label.textContent = entry.label;

    button.append(chip, label);
    button.addEventListener('click', () => onNavigate(entry.view, button));
    bar.append(button);
    return button;
  });
  bar.hidden = buttons.length === 0;
  return buttons;
}

/* ---------- "More" menu ---------- */

function renderMoreMenu(root, access, onNavigate) {
  const items = [];
  root.querySelectorAll('.admin-more-item').forEach(item => {
    const entry = ADMIN_MORE_NAV.find(candidate => candidate.view === item.dataset.adminView);
    if (!entry) return;
    paintIcon(item.querySelector('.admin-more-icon'), entry.icon, 'admin-more-icon-image');
    const label = item.querySelector('.admin-more-copy strong');
    const hint = item.querySelector('.admin-more-copy small');
    if (label && entry.label && !label.textContent.trim()) label.textContent = entry.label;
    if (hint && entry.hint && !hint.textContent.trim()) hint.textContent = entry.hint;
    item.addEventListener('click', () => onNavigate(entry.view, item));
    items.push(item);
  });
  // The container is pointless when the role may open nothing inside it.
  if (!access.allowEntries(ADMIN_MORE_NAV).length) {
    root.querySelector('.admin-more-menu')?.remove();
    root.querySelector('.admin-view[data-view-panel="more"]')?.remove();
  }
  return items;
}

/* ---------- Dashboard feature grid ---------- */

function renderFeatureGrid(container, entries, onNavigate) {
  if (!container) return [];
  container.replaceChildren();
  const tiles = entries.map((entry, index) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'admin-feature-tile';
    tile.dataset.adminView = entry.view;
    if (entry.capability) tile.dataset.adminCap = entry.capability;
    if (entry.action) tile.dataset.adminAction = entry.action;
    // Staggered entrance, cheap and transform-only.
    tile.style.setProperty('--tile-index', String(index));

    const iconWrap = document.createElement('span');
    iconWrap.className = 'admin-feature-icon';
    iconWrap.append(iconImage(entry.icon, 'admin-feature-icon-image'));

    const label = document.createElement('span');
    label.className = 'admin-feature-label';
    label.textContent = entry.label;

    tile.append(iconWrap, label);
    tile.addEventListener('click', () => onNavigate(entry.view, tile));
    container.append(tile);
    return tile;
  });
  // An odd last tile spans the row so the grid never ends with a hole.
  if (tiles.length % 2 === 1) tiles.at(-1)?.classList.add('is-wide');
  container.hidden = tiles.length === 0;
  return tiles;
}

/**
 * Build the permission-driven shell. Safe to call once per sign-in.
 * Returns the entries that were rendered so tests and the panel can inspect
 * exactly what this role is allowed to see.
 */
export function initAdminPanelShell({ access, onNavigate } = {}) {
  const navigate = typeof onNavigate === 'function' ? onNavigate : () => {};
  const removed = enforceCapabilities({ access });

  const moreEntries = access.allowEntries(ADMIN_MORE_NAV);
  // The "More" tab is a container: it exists only while something inside it is
  // granted, so a role without sub-views never sees an empty menu.
  const bottomEntries = access.allowEntries(ADMIN_BOTTOM_NAV)
    .filter(entry => entry.view !== 'more' || moreEntries.length > 0);
  const tileEntries = access.allowEntries(ADMIN_FEATURE_TILES);

  const bottomButtons = renderBottomBar(document.querySelector('.admin-bottom'), bottomEntries, navigate);
  const moreItems = renderMoreMenu(document, access, navigate);
  const tiles = renderFeatureGrid(document.querySelector('#adminFeatureGrid'), tileEntries, navigate);

  // Title chip and the fee-collection card keep the same generated language.
  paintIcon(document.querySelector('.admin-hero-icon'), 'dashboard', 'admin-hero-icon-image');
  paintIcon(document.querySelector('#dashCollectFee .admin-dashboard-collect-icon'), 'payment', 'admin-collect-icon-image');

  // Hero summary tiles: students, then running classes.
  const heroIcons = ['users', 'classes'];
  document.querySelectorAll('.admin-hero-stats .admin-stat-tile .tile-icon').forEach((chip, index) => {
    paintIcon(chip, heroIcons[index] || 'dashboard', 'admin-tile-icon-image');
  });

  // Finance summary: total collected, this month, dues, transactions.
  const statIcons = ['finance', 'routine', 'payment', 'reports'];
  document.querySelectorAll('.admin-stats .admin-stat .admin-stat-icon').forEach((chip, index) => {
    paintIcon(chip, statIcons[index] || 'finance', 'admin-stat-icon-image');
  });

  // Top bar: logo link to the shared login page, then logout.
  paintIcon(document.querySelector('.admin-app-link'), 'app', 'topbar-icon');
  paintIcon(document.querySelector('.admin-exit'), 'logout', 'topbar-icon');

  return { access, removed, bottomEntries, moreEntries, tileEntries, bottomButtons, moreItems, tiles };
}

export { iconImage, paintIcon };
