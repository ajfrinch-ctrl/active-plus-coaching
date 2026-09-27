/* Admin Panel icon system — one source of truth for every symbol.

   Why inline SVG instead of the generated PNGs
   --------------------------------------------
   A PNG painted as a background *and* as an <img> inside a chip that also
   scales on tap is what produced overlapping, clipped icons. An inline SVG
   inside a fixed container can never leave that container:

     • the container owns the size (width/height/flex-basis, `overflow:hidden`)
     • the SVG is `width:100%; height:100%; max-width:100%; max-height:100%`
       inside it, centred with flex
     • nothing grows with `transform: scale()`, so nothing can spill over a
       label, another icon, a card edge or the bottom bar

   Every symbol is drawn on the same 24×24 grid, stroked with `currentColor`
   (no fill), so one CSS rule controls colour, contrast and size everywhere.
   No emoji: each icon is chosen so its meaning is obvious at a glance
   (Staff → people, Reports → chart/document, Security → lock, Settings → gear,
   Backup → cloud, Logout → exit door, Edit → pencil, Delete → trash, …).
*/

const STROKE_ICONS = Object.freeze({
  dashboard: '<path d="M3.2 10.6 12 3.6l8.8 7v9.2a1.2 1.2 0 0 1-1.2 1.2h-4.6v-6H8.9v6H4.4a1.2 1.2 0 0 1-1.2-1.2z"/>',
  staff: '<circle cx="9.2" cy="8.2" r="3.3"/><path d="M2.8 20.2a6.4 6.4 0 0 1 12.8 0"/><path d="M16.3 5.3a3.3 3.3 0 0 1 0 5.8"/><path d="M21.2 20.2a6.4 6.4 0 0 0-4.2-6"/>',
  students: '<path d="M2.8 8.6 12 4.8l9.2 3.8L12 12.4z"/><path d="M6.2 10.4v5.4c0 1.7 2.6 3 5.8 3s5.8-1.3 5.8-3v-5.4"/><path d="M21.2 9v5.2"/>',
  reports: '<path d="M5.4 3.2h8.2l5 5v12.6a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1V4.2a1 1 0 0 1 1-1z"/><path d="M13.6 3.2v5h5"/><path d="M8.6 17.4v-3.6M12 17.4v-6.4M15.4 17.4v-2.4"/>',
  roles: '<path d="M12 3.2 5.2 5.9v5.3c0 4.5 2.9 7.5 6.8 9.1 3.9-1.6 6.8-4.6 6.8-9.1V5.9z"/><path d="m9.3 12 2 2 3.5-3.7"/>',
  security: '<rect x="4.8" y="10.4" width="14.4" height="10.4" rx="2.6"/><path d="M8.2 10.4V7.9a3.8 3.8 0 0 1 7.6 0v2.5"/><path d="M12 14.6v2.4"/>',
  settings: '<circle cx="12" cy="12" r="3.1"/><path d="M19.1 14.6a1.5 1.5 0 0 0 .3 1.7l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.5 1.5 0 0 0-1.7-.3 1.5 1.5 0 0 0-.9 1.4v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.5 1.5 0 0 0-1-1.4 1.5 1.5 0 0 0-1.7.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9h-.2a1.9 1.9 0 1 1 0-3.8h.1a1.5 1.5 0 0 0 1.4-1 1.5 1.5 0 0 0-.3-1.7l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.2a1.9 1.9 0 1 1 3.8 0v.1a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.2a1.9 1.9 0 1 1 0 3.8h-.1a1.5 1.5 0 0 0-1.5.9z"/>',
  data: '<ellipse cx="12" cy="6" rx="7.6" ry="2.9"/><path d="M4.4 6v6c0 1.6 3.4 2.9 7.6 2.9s7.6-1.3 7.6-2.9V6"/><path d="M4.4 12v6c0 1.6 3.4 2.9 7.6 2.9s7.6-1.3 7.6-2.9v-6"/>',
  backup: '<path d="M7.2 18.6h9.9a3.4 3.4 0 0 0 .3-6.8 5.3 5.3 0 0 0-10-1.6 4.3 4.3 0 0 0-.2 8.4z"/><path d="M12 12.4v5.6M9.4 15.4 12 18l2.6-2.6"/>',
  profile: '<circle cx="12" cy="8.2" r="3.6"/><path d="M4.9 20.2a7.1 7.1 0 0 1 14.2 0"/>',
  app: '<rect x="6.6" y="2.6" width="10.8" height="18.8" rx="2.6"/><path d="M10.6 18.4h2.8"/>',
  logout: '<path d="M14.8 4.2h3.4a1.8 1.8 0 0 1 1.8 1.8v12a1.8 1.8 0 0 1-1.8 1.8h-3.4"/><path d="M10.2 16.8 5.6 12l4.6-4.8"/><path d="M5.6 12h10.4"/>',
  more: '<circle cx="5.4" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.6" cy="12" r="1.5"/>',
  search: '<circle cx="10.8" cy="10.8" r="6"/><path d="m15.4 15.4 4.4 4.4"/>',
  edit: '<path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0-3-3L5.2 17z"/><path d="m13.8 6.2 3 3"/>',
  trash: '<path d="M4.4 6.8h15.2"/><path d="M9.6 6.8V4.6h4.8v2.2"/><path d="M6.6 6.8 7.6 20.2h8.8l1-13.4"/><path d="M10.2 10.6v5.6M13.8 10.6v5.6"/>',
  close: '<path d="M18.4 5.6 5.6 18.4M5.6 5.6l12.8 12.8"/>',
  save: '<path d="M5 3.8h11L19.2 7v13.2H5z"/><path d="M8.2 3.8v5.4h7.6V3.8"/><path d="M8.2 20.2v-6.2h7.6v6.2"/>',
  add: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
  back: '<path d="M19.2 12H4.8M10.6 5.4 4 12l6.6 6.6"/>',
  forward: '<path d="M4.8 12h14.4M13.4 5.4 20 12l-6.6 6.6"/>',
  check: '<path d="M4.8 12.6 9.8 17.6 19.2 6.8"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.6"/><path d="m8.4 12.2 2.5 2.5 4.7-5"/>',
  eye: '<path d="M2.6 12S6.2 6.4 12 6.4 21.4 12 21.4 12 17.8 17.6 12 17.6 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h8.4M17.4 12v3.2M20 12v2.4"/>',
  pause: '<circle cx="12" cy="12" r="8.6"/><path d="M10 9.4v5.2M14 9.4v5.2"/>',
  play: '<circle cx="12" cy="12" r="8.6"/><path d="M10.4 8.8 15.6 12l-5.2 3.2z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20.2 4.4v4.4h-4.4"/>',
  download: '<path d="M12 4.4v10.4M7.8 11 12 15.2 16.2 11"/><path d="M4.8 18.6h14.4"/>',
  upload: '<path d="M12 15.2V4.8M7.8 8.6 12 4.4l4.2 4.2"/><path d="M4.8 18.6h14.4"/>',
  phone: '<path d="M6.2 3.4h3l1.9 4.8-2 1.4a12 12 0 0 0 5.3 5.3l1.4-2 4.8 1.9v3a1.9 1.9 0 0 1-2.1 1.9C10.9 19.4 4.6 13.1 4.3 5.5A1.9 1.9 0 0 1 6.2 3.4Z"/>',
  book: '<path d="M4.4 5.4A2.4 2.4 0 0 1 6.8 3H19.6v15.4H6.8a2.4 2.4 0 0 0-2.4 2.4z"/><path d="M4.4 19.8A2.4 2.4 0 0 1 6.8 17.4H19.6"/><path d="M8.4 7.4h7.2M8.4 11h5.4"/>',
  shield: '<path d="M12 3.2 5.2 5.9v5.3c0 4.5 2.9 7.5 6.8 9.1 3.9-1.6 6.8-4.6 6.8-9.1V5.9z"/>',
  lock: '<rect x="4.8" y="10.4" width="14.4" height="10.4" rx="2.6"/><path d="M8.2 10.4V7.9a3.8 3.8 0 0 1 7.6 0v2.5"/>',
  users: '<circle cx="9.2" cy="8.2" r="3.3"/><path d="M2.8 20.2a6.4 6.4 0 0 1 12.8 0"/><path d="M16.3 5.3a3.3 3.3 0 0 1 0 5.8"/><path d="M21.2 20.2a6.4 6.4 0 0 0-4.2-6"/>',
  sliders: '<path d="M4 7.4h9.4M17.6 7.4h2.4M4 12h3.4M11.6 12h8.4M4 16.6h9.4M17.6 16.6h2.4"/><circle cx="15.6" cy="7.4" r="2"/><circle cx="9.4" cy="12" r="2"/><circle cx="15.6" cy="16.6" r="2"/>',
  wallet: '<path d="M20.4 12.6V7.4H5.2a2.2 2.2 0 0 1 0-4.4h13.6v4.4"/><path d="M3.6 5.6v12a2.2 2.2 0 0 0 2.2 2.2h15.6v-5"/><path d="M17.6 12.6a2 2 0 0 0 0 4h3.8v-4z"/>',
  receipt: '<path d="M5 3.4v17.2l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V3.4l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8.8 8h6.4M8.8 11.6h6.4M8.8 15.2h4"/>',
  calendar: '<rect x="3.6" y="5.4" width="16.8" height="15" rx="2.4"/><path d="M15.8 3.2v4M8.2 3.2v4M3.6 10.2h16.8"/>',
  bolt: '<path d="M13.4 3.4 5.6 13.6h5l-1 7 7.8-10.2h-5z"/>',
  /* Report categories. Added here so the Reports module uses the same single
     icon source as the rest of the app — no emoji, one 24×24 stroke grid. */
  notice: '<path d="M4.4 10.2v3.4a1.6 1.6 0 0 0 1.6 1.6h1.2l4.8 3.8V5l-4.8 3.8H6a1.6 1.6 0 0 0-1.6 1.4z"/><path d="M16.4 9.4a4.6 4.6 0 0 1 0 5.2M18.8 7.2a8 8 0 0 1 0 9.6"/>',
  exam: '<path d="M8.4 3.6h7.2a1.8 1.8 0 0 1 1.8 1.8v13.2a1.8 1.8 0 0 1-1.8 1.8H8.4a1.8 1.8 0 0 1-1.8-1.8V5.4a1.8 1.8 0 0 1 1.8-1.8z"/><path d="M9.6 8.4h4.8M9.6 12h4.8M9.6 15.6h2.8"/>',
  result: '<circle cx="12" cy="9.4" r="5"/><path d="M8.6 14 7.4 20.6l4.6-2.4 4.6 2.4L15.4 14"/>',
  attendance: '<circle cx="9.4" cy="8.4" r="3.4"/><path d="M3.2 19.8a6.2 6.2 0 0 1 12.4 0"/><path d="m15.8 12.4 2 2 3.6-4"/>',
  assignment: '<path d="M6.2 3.6h8.4l4 4v12.8H6.2z"/><path d="M14.4 3.6v4h4"/><path d="M9 13.2h6M9 16.6h4"/>',
  summary: '<path d="M4.2 20.2V4.2M4.2 20.2h15.6"/><path d="M8 16.6v-4M12 16.6V7.4M16 16.6v-6.4"/>',
  teacher: '<path d="M3.4 5.4h9.2v6.2H3.4z"/><path d="M8 11.6v3.2M5.4 20.4h5.2"/><path d="M14.6 8.4h6M14.6 12.4h4.2"/>',
  filter: '<path d="M3.6 5.2h16.8l-6.4 7.6v5.2l-4 2.4v-7.6z"/>',
  money: '<rect x="2.8" y="6.4" width="18.4" height="11.2" rx="2.2"/><circle cx="12" cy="12" r="2.4"/><path d="M6.2 10.4v3.2M17.8 10.4v3.2"/>'
});

/**
 * One `<svg>` element per icon: fixed 24×24 grid, stroked with currentColor,
 * `aria-hidden` because every icon sits next to a real text label.
 */
export function iconMarkup(key, className = 'apc-icon-svg') {
  const paths = STROKE_ICONS[key] || STROKE_ICONS.dashboard;
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
}

/** Same markup as a detached element — for nodes built with createElement. */
export function iconElement(key, className = 'apc-icon-svg') {
  const holder = document.createElement('div');
  holder.innerHTML = iconMarkup(key, className);
  return holder.firstElementChild;
}

/** Replace whatever is inside a container with the right icon. */
export function paintIcon(container, key, className = 'apc-icon-svg') {
  if (!container) return null;
  container.replaceChildren(iconElement(key, className));
  return container;
}
