/** Minimal Education icons. Decorative SVGs inherit their control's accessible name.
 * Name interactive controls with visible text or aria-label; never focus the SVG itself. */
const paths = {
"copy":"M8 8h13v13H8zM16 8V3H3v13h5","chat":"M3 3h18v14H9l-6 4zM7 8h10M7 12h6","chevron-down":"m5 9 7 7 7-7",
  "home": "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  "dashboard": "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  "user": "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2",
  "users": "M13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M3 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6M20 14a6 6 0 0 1 2 5v2",
  "book": "M12 5Q7 2 3 4v16q4-2 9 1 5-3 9-1V4q-4-2-9 1v16",
  "calendar": "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M7 3v4M17 3v4M3 11h18M7 15h2M15 15h2",
  "clock": "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 6v6l4 2",
  "exam": "M8 4H5v17h14V4h-3M8 2h8v5H8zM8 11h8M8 15h5",
  "mcq": "M3 4h3v3H3zM10 5h11M3 11h3v3H3zM10 12h11M3 18h3v3H3zM10 19h11",
  "result": "M17 8A5 5 0 1 1 7 8a5 5 0 0 1 10 0M8 13 6 22l6-3 6 3-2-9",
  "attendance": "M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M2 21v-2a6 6 0 0 1 12 0v2M15 13l2 2 5-6",
  "notice": "M3 9h5l11-5v16L8 15H3zM7 15l2 6h3l-2-5M22 9v6",
  "wallet": "M3 7V5h16v3M3 7h18v14H3zM21 12h-6v5h6M17 14h1",
  "receipt": "M5 3h14v19l-3-2-4 2-4-2-3 2zM8 7h8M8 11h8M8 15h5",
  "reports": "M4 3v18h17M8 17v-6M13 17V6M18 17V9",
  "settings": "M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6",
  "search": "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0M15 15l7 7",
  "add": "M12 4v16M4 12h16",
  "edit": "m4 16 12-12 4 4L8 20H4zM13 7l4 4",
  "delete": "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  "save": "M3 3h15l3 3v15H3zM7 3v6h10V3M7 21v-8h10v8",
  "download": "M12 3v12M7 10l5 5 5-5M4 16v5h16v-5",
  "upload": "M12 16V4M7 9l5-5 5 5M4 16v5h16v-5",
  "print": "M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7zM17 11h1",
  "logout": "M10 3H3v18h7M8 12h13M16 7l5 5-5 5",
  "back": "M20 12H4M10 6l-6 6 6 6",
  "next": "M4 12h16M14 6l6 6-6 6",
  "close": "M5 5l14 14M19 5 5 19",
  "filter": "M3 4h18l-7 8v8l-4-2v-6z",
  "check": "m4 12 5 5L20 6",
  "success": "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0m-13 0 3 3 5-6",
  "warning": "M12 3 2 21h20zM12 9v5M12 17v1",
  "help": "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9 9a3 3 0 1 1 4 3l-1 1v1M12 17v1",
  "info": "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v6M12 7v1",
  "bell": "M18 9a6 6 0 0 0-12 0v6l-2 3h16l-2-3zM10 21h4",
  "menu": "M3 5h18M3 12h18M3 19h18",
  "more": "M5 11v2M12 11v2M19 11v2",
  "assignment": "M4 3h11l5 5v13H4zM14 3v6h6M8 13h8M8 17h5",
  "shield": "m12 3 8 3v6q0 6-8 10-8-4-8-10V6zM8 12l3 3 5-6",
  "lock": "M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4",
  "sync": "M20 9a8 8 0 0 0-14-4L3 8M3 3v5h5M4 15a8 8 0 0 0 14 4l3-3M21 21v-5h-5",
  "online": "M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M9 16a5 5 0 0 1 6 0M12 20v1",
  "offline": "M2 2l20 20M2 8a16 16 0 0 1 4-2M10 5a16 16 0 0 1 12 3M5 12l3-2M15 11l4 1M9 16l2-1M12 20v1",
  "eye": "M2 12q10-15 20 0-10 15-20 0M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  "phone": "M4 3h5l2 5-3 2 6 6 2-3 5 2v5q-1 3-7 0Q4 16 3 7z",
  "mail": "M3 5h18v14H3zM3 5l9 8 9-8",
  "smartphone": "M6 2h12v20H6zM10 18h4",
  "cloud": "M6 19a5 5 0 0 1-1-10 7 7 0 0 1 14-1 5 5 0 0 1 0 11z",
  "key": "M11 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0m-1 3 10 10M16 17l3-3M19 20l3-3",
  "sun": "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1",
  "moon": "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11",
  "play": "m8 4 12 8-12 8z",
  "pause": "M8 4v16M16 4v16",
  "fingerprint": "M4 13V9a8 8 0 0 1 16 0v4M8 19V9a4 4 0 0 1 8 0v8M12 9v12",
  "bolt": "m14 2-9 12h6l-1 8 9-12h-6z"
};
const aliases = {
  "staff": "users",
  "students": "users",
  "teachers": "book",
  "teacher": "book",
  "managers": "users",
  "payments": "wallet",
  "payment": "wallet",
  "finance": "wallet",
  "money": "wallet",
  "courses": "book",
  "routine": "calendar",
  "results": "result",
  "notices": "notice",
  "profile": "user",
  "trash": "delete",
  "forward": "next",
  "refresh": "sync",
  "error": "warning",
  "notification": "bell",
  "approval": "success",
  "class": "book",
  "classes": "book",
  "security": "shield",
  "roles": "shield",
  "data": "reports",
  "backup": "cloud",
  "app": "smartphone",
  "exams": "exam",
  "sliders": "settings",
  "summary": "reports",
  "grid": "dashboard",
  "clipboard": "exam",
  "trending": "reports",
  "award": "result",
  "checkCircle": "success",
  "check-circle": "success",
  "arrow-right": "next",
  "arrow-left": "back",
  "chevron-right": "next",

  "plus": "add",
  "megaphone": "notice",
  "support": "help",
  "card": "receipt"
};
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function iconMarkup(name, className = 'apc-icon-svg') {
  const key = String(name).replace(/^icon-/, '');
  return `<svg class="${escape(className)}" data-icon="${escape(key)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${paths[aliases[key] || key] || paths.help}"/></svg>`;
}
export function iconElement(name, className) {
  const template = document.createElement('template');
  template.innerHTML = iconMarkup(name, className);
  return template.content.firstElementChild;
}
export function paintIcon(container, name, className) {
  if (!container) return null;
  container.replaceChildren(iconElement(name, className));
  return container;
}
