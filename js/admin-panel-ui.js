/* Admin Panel shell — one permission-driven icon/navigation system.

   Everything the panel shows as "a place you can go" is described once, in
   js/admin-permissions.js, and rendered here from the capabilities of the
   signed-in role:

     • the bottom bar      (icon + label, clear active state)
     • the "More" menu     (icon + label + hint)
     • the dashboard grid  (large icon + clear label)
     • the top bar         (student-app link + logout)

   Every icon comes from js/admin-icons.js: one inline SVG, drawn on a 24×24
   grid, inside a fixed-size glass container. The container owns the geometry
   and clips (see css/admin-icon-system.css), so an icon can never overlap a
   label, another icon, a card edge or the bottom bar.

   Entries whose capability is not granted are never rendered at all, and
   `enforceCapabilities()` drops the matching views from the DOM.

   Presentation only — no storage, no routing rules and no business logic. */

import { ADMIN_BOTTOM_NAV, ADMIN_MORE_NAV, ADMIN_FEATURE_TILES, enforceCapabilities } from './admin-permissions.js';
import { iconElement, paintIcon } from './admin-icons.js';

/* The bottom bar and the "More" menu use the same icon language, so a section
   looks identical wherever it appears. */
export const ADMIN_BOTTOM_ICONS = Object.freeze({
  dashboard: 'dashboard',
  staff: 'staff',
  students: 'students',
  reports: 'reports',
  roles: 'roles',
  security: 'security',
  settings: 'settings',
  data: 'data',
  backup: 'backup',
  profile: 'profile',
  more: 'more'
});

/* ---------- Bottom bar ---------- */

function renderBottomBar(bar, entries, onNavigate) {
  if (!bar) return [];
  bar.replaceChildren();
  const buttons = entries.map((entry, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-bottom-item';
    button.dataset.adminView = entry.view;
    if (entry.capability) button.dataset.adminCap = entry.capability;

    // Fixed container: the icon can never grow past it, so it can never
    // collide with the label below or with the next tab.
    const chip = document.createElement('span');
    chip.className = 'nav-chip';
    chip.append(iconElement(ADMIN_BOTTOM_ICONS[entry.icon] || entry.icon, 'nav-icon apc-icon-svg'));

    const label = document.createElement('span');
    label.className = 'nav-label';
    label.textContent = entry.label;

    button.append(chip, label);
    button.addEventListener('click', () => onNavigate(entry.view, button));
    // The first tab starts active so the bar is never state-less while the
    // router decides where to land (setView corrects it immediately after).
    if (index === 0) {
      button.classList.add('active');
      button.setAttribute('aria-current', 'page');
    }
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
    paintIcon(item.querySelector('.admin-more-icon'), ADMIN_BOTTOM_ICONS[entry.icon] || entry.icon, 'admin-more-icon-svg apc-icon-svg');
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
    iconWrap.append(iconElement(ADMIN_BOTTOM_ICONS[entry.icon] || entry.icon, 'admin-feature-icon-svg apc-icon-svg'));

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

/** Header actions: link to the student app, then logout (icon + label). */
function renderTopBar() {
  paintIcon(document.querySelector('.admin-exit .topbar-icon'), 'logout', 'topbar-icon apc-icon-svg');
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

  // System overview title uses the same icon language as the navigation.
  paintIcon(document.querySelector('.admin-hero-icon'), 'dashboard', 'admin-hero-icon-svg apc-icon-svg');

  // Hero summary tiles, in document order (see admin.html).
  const heroIcons = ['students', 'staff', 'data', 'security'];
  document.querySelectorAll('.admin-hero-stats .admin-stat-tile .tile-icon').forEach((chip, index) => {
    paintIcon(chip, heroIcons[index] || 'dashboard', 'admin-tile-icon-svg apc-icon-svg');
  });

  // Finance summary tiles (Reports → Finance Summary), in document order.
  const statIcons = ['receipt', 'calendar', 'wallet', 'bolt'];
  document.querySelectorAll('.admin-stats .admin-stat .admin-stat-icon').forEach((chip, index) => {
    paintIcon(chip, statIcons[index] || 'receipt', 'admin-stat-icon-svg apc-icon-svg');
  });

  renderTopBar();

  return { access, removed, bottomEntries, moreEntries, tileEntries, bottomButtons, moreItems, tiles };
}

export { iconElement, paintIcon };
