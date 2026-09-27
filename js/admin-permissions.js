/* Admin Panel capability layer — a read-only projection of the role boundary
   that already exists in this repository.

   Sources of truth (never modified by this file):
     • firestore.rules      — Admin owns reports, settings, notices, routine,
                              transactions and exam records; a Manager is the
                              only role that may approve/reject a student or
                              publish/reject a pending exam.
     • functions/index.js   — "Manager is the only role allowed to publish or
                              reject pending exam records."
     • manager.html         — the separate approval portal (students + exams).
     • teacher.html / payment.html — their own panels, each with its own role.

   The module adds no storage key, no role and no business rule. It converts the
   role the signed-in staff account already carries into the set of Admin Panel
   views, menus, cards, shortcuts, actions and routes that may exist for that
   role, and provides the helpers used to enforce it on both sides of the app:

     1. UI visibility  — mark anything role-specific with `data-admin-cap`;
                         `enforceCapabilities()` removes what is not granted.
     2. Access control — `Access.allowsView()` guards `setView()`, the hash
                         route and every deep link.

   Removing an element (instead of styling it away) keeps unauthorised markup,
   data and handlers out of the DOM entirely, so a hidden feature can never be
   reached by keyboard, inspect-element or a copied URL.

   ---------------------------------------------------------------------------
   Admin Panel scope (System Control + Staff + Permissions + Security + Data +
   Reports + Settings)
   ---------------------------------------------------------------------------
   Daily operations are NOT Admin territory and are deliberately not granted
   here — they stay in the panel that owns them:

     • fee collection / cash-counter entry  → payment.html (Cash Counter)
     • routine entry, daily notices         → manager.html (Manager)
     • student approval, exam publish       → manager.html (Manager)
     • class teaching, homework, attendance → teacher.html (Teacher)
*/

/** Every capability the Admin Panel can expose. Keys are stable strings so
 *  markup (`data-admin-cap`), the view map and tests all speak one language. */
export const CAPABILITIES = Object.freeze({
  /* System-level sections the Admin Panel owns. */
  DASHBOARD: 'dashboard.view',
  STAFF_MANAGE: 'staff.manage',
  ROLES_MANAGE: 'roles.manage',
  STUDENTS_VIEW: 'students.view',
  STUDENTS_MANAGE: 'students.manage',
  REPORTS_VIEW: 'reports.view',
  DATA_MANAGE: 'data.manage',
  BACKUP_MANAGE: 'backup.manage',
  SECURITY_MANAGE: 'security.manage',
  SETTINGS_MANAGE: 'settings.manage',
  PROFILE_VIEW: 'profile.view',

  /* Kept so the existing role boundary stays readable in one place. None of
     these is granted to Admin: they belong to the Manager / Teacher / Cash
     Counter panels and to their own portals. */
  STUDENTS_APPROVE: 'students.approve',
  FINANCE_VIEW: 'finance.view',
  FINANCE_COLLECT: 'finance.collect',
  NOTICES_MANAGE: 'notices.manage',
  ROUTINE_MANAGE: 'routine.manage',
  CLASSES_MANAGE: 'classes.manage',
  APP_MANAGE: 'app.manage',
  EXAMS_VIEW: 'exams.view',
  EXAMS_PUBLISH: 'exams.publish',
  TEACHING_PANEL: 'teaching.panel',
  PAYMENT_PANEL: 'payment.panel'
});

/* The Admin role: system control, staff management, permissions, security,
   data, backup, reports, settings and the student overview. Daily collection,
   routine entry, notice publishing and teaching are intentionally absent. */
const ADMIN = Object.freeze([
  CAPABILITIES.DASHBOARD,
  CAPABILITIES.STAFF_MANAGE,
  CAPABILITIES.ROLES_MANAGE,
  CAPABILITIES.STUDENTS_VIEW,
  CAPABILITIES.STUDENTS_MANAGE,
  CAPABILITIES.REPORTS_VIEW,
  CAPABILITIES.DATA_MANAGE,
  CAPABILITIES.BACKUP_MANAGE,
  CAPABILITIES.SECURITY_MANAGE,
  CAPABILITIES.SETTINGS_MANAGE,
  CAPABILITIES.PROFILE_VIEW
]);

/* Kept for completeness so the same helper can drive any staff panel later.
   They are never granted inside admin.html. */
const MANAGER = Object.freeze([
  CAPABILITIES.STUDENTS_VIEW,
  CAPABILITIES.STUDENTS_APPROVE,
  CAPABILITIES.EXAMS_VIEW,
  CAPABILITIES.EXAMS_PUBLISH,
  CAPABILITIES.REPORTS_VIEW
]);

const TEACHER = Object.freeze([CAPABILITIES.TEACHING_PANEL, CAPABILITIES.ROUTINE_MANAGE, CAPABILITIES.EXAMS_VIEW]);
const PAYMENT = Object.freeze([CAPABILITIES.PAYMENT_PANEL, CAPABILITIES.FINANCE_COLLECT, CAPABILITIES.STUDENTS_VIEW]);
const STUDENT = Object.freeze([]);

export const ROLE_CAPABILITIES = Object.freeze({
  admin: ADMIN,
  manager: MANAGER,
  teacher: TEACHER,
  payment: PAYMENT,
  student: STUDENT
});

/** Which capability unlocks each Admin Panel view (route guard). */
export const VIEW_CAPABILITIES = Object.freeze({
  dashboard: CAPABILITIES.DASHBOARD,
  staff: CAPABILITIES.STAFF_MANAGE,
  roles: CAPABILITIES.ROLES_MANAGE,
  students: CAPABILITIES.STUDENTS_VIEW,
  reports: CAPABILITIES.REPORTS_VIEW,
  data: CAPABILITIES.DATA_MANAGE,
  backup: CAPABILITIES.BACKUP_MANAGE,
  security: CAPABILITIES.SECURITY_MANAGE,
  settings: CAPABILITIES.SETTINGS_MANAGE,
  profile: CAPABILITIES.PROFILE_VIEW
});

/** Views reachable from the "More" menu. */
export const MORE_VIEWS = Object.freeze(['roles', 'data', 'backup', 'security', 'settings', 'profile']);

/** Bottom-bar entries. `order` keeps the tab order stable no matter which
 *  entries survive the capability filter. */
export const ADMIN_BOTTOM_NAV = Object.freeze([
  { view: 'dashboard', label: 'ড্যাশবোর্ড', icon: 'dashboard', capability: CAPABILITIES.DASHBOARD, order: 1 },
  { view: 'staff', label: 'স্টাফ', icon: 'staff', capability: CAPABILITIES.STAFF_MANAGE, order: 2 },
  { view: 'students', label: 'শিক্ষার্থী', icon: 'students', capability: CAPABILITIES.STUDENTS_VIEW, order: 3 },
  { view: 'reports', label: 'রিপোর্ট', icon: 'reports', capability: CAPABILITIES.REPORTS_VIEW, order: 4 },
  { view: 'more', label: 'আরও', icon: 'more', capability: null, order: 5 }
]);

/** "More" menu entries (same shape as the bottom bar, plus a description). */
export const ADMIN_MORE_NAV = Object.freeze([
  { view: 'roles', label: 'Roles & Permissions', hint: 'রোলভিত্তিক অনুমতির ম্যাট্রিক্স', icon: 'roles', capability: CAPABILITIES.ROLES_MANAGE, order: 1 },
  { view: 'data', label: 'Data Management', hint: 'ডেটা সংগ্রহ, পরিসংখ্যান ও পরিষ্কার', icon: 'data', capability: CAPABILITIES.DATA_MANAGE, order: 2 },
  { view: 'backup', label: 'Backup & Restore', hint: 'সম্পূর্ণ ব্যাকআপ নিন ও ফিরিয়ে আনুন', icon: 'backup', capability: CAPABILITIES.BACKUP_MANAGE, order: 3 },
  { view: 'security', label: 'সিকিউরিটি', hint: 'সেশন, পাসওয়ার্ড নীতি ও সুরক্ষিত অ্যাকাউন্ট', icon: 'security', capability: CAPABILITIES.SECURITY_MANAGE, order: 4 },
  { view: 'settings', label: 'সিস্টেম সেটিংস', hint: 'অ্যাপ কন্ট্রোল, ক্লাস ও ব্র্যান্ডিং', icon: 'settings', capability: CAPABILITIES.SETTINGS_MANAGE, order: 5 },
  { view: 'profile', label: 'Admin Profile', hint: 'নিজের পরিচয় ও পাসওয়ার্ড', icon: 'profile', capability: CAPABILITIES.PROFILE_VIEW, order: 6 }
]);

/** Dashboard tiles show system sections only, generated from the capabilities
 *  the signed-in role holds. No daily cash/fee entry tile. */
export const ADMIN_FEATURE_TILES = Object.freeze([
  { view: 'staff', label: 'স্টাফ ম্যানেজমেন্ট', icon: 'staff', capability: CAPABILITIES.STAFF_MANAGE, order: 1 },
  { view: 'students', label: 'শিক্ষার্থী', icon: 'students', capability: CAPABILITIES.STUDENTS_VIEW, order: 2 },
  { view: 'reports', label: 'রিপোর্ট', icon: 'reports', capability: CAPABILITIES.REPORTS_VIEW, order: 3 },
  { view: 'roles', label: 'Roles & Permissions', icon: 'roles', capability: CAPABILITIES.ROLES_MANAGE, order: 4 },
  { view: 'security', label: 'সিকিউরিটি', icon: 'security', capability: CAPABILITIES.SECURITY_MANAGE, order: 5 },
  { view: 'settings', label: 'সিস্টেম সেটিংস', icon: 'settings', capability: CAPABILITIES.SETTINGS_MANAGE, order: 6 },
  { view: 'data', label: 'Data Management', icon: 'data', capability: CAPABILITIES.DATA_MANAGE, order: 7 },
  { view: 'backup', label: 'Backup & Restore', icon: 'backup', capability: CAPABILITIES.BACKUP_MANAGE, order: 8 },
  { view: 'profile', label: 'Admin Profile', icon: 'profile', capability: CAPABILITIES.PROFILE_VIEW, order: 9 }
]);

export function capabilitiesForRole(role) {
  const key = String(role || '').trim().toLowerCase();
  return new Set(ROLE_CAPABILITIES[key] || []);
}

/**
 * Access object for one role. Cheap to build, safe to keep around, and the
 * single gate used by both the renderer and the router.
 */
export function createAccess(role) {
  const capabilities = capabilitiesForRole(role);
  return {
    role: String(role || '').trim().toLowerCase(),
    capabilities,
    has(capability) {
      return Boolean(capability) && capabilities.has(capability);
    },
    /** Route guard: a view is openable only while its capability is granted. */
    allowsView(view) {
      const key = String(view || '').trim();
      if (!key) return false;
      if (key === 'more') return MORE_VIEWS.some(entry => this.has(VIEW_CAPABILITIES[entry]));
      const capability = VIEW_CAPABILITIES[key];
      return capability ? this.has(capability) : false;
    },
    /** First bottom-bar tab this role may open — the fallback destination.
     *  The "More" container counts only while it holds at least one sub-view. */
    defaultView() {
      const moreAllowed = MORE_VIEWS.some(view => this.has(VIEW_CAPABILITIES[view]));
      const first = ADMIN_BOTTOM_NAV
        .filter(entry => (entry.capability === null ? moreAllowed : this.has(entry.capability)))
        .sort((a, b) => a.order - b.order)[0];
      return first ? first.view : 'dashboard';
    },
    /** Entries (bottom bar / more menu / dashboard tiles) this role may see. */
    allowEntries(entries) {
      return entries
        .filter(entry => entry.capability === null || this.has(entry.capability))
        .sort((a, b) => a.order - b.order);
    }
  };
}

/** Capability required by a view, or null when the view is unknown. */
export function viewCapability(view) {
  return VIEW_CAPABILITIES[String(view || '').trim()] || null;
}

/** Route in the URL hash (admin.html#staff). Empty when absent/unknown. */
export function routeFromHash(hash) {
  const key = String(hash || '').replace(/^#/, '').replace(/^\/+/, '').trim();
  if (!key) return null;
  return Object.hasOwn(VIEW_CAPABILITIES, key) || key === 'more' ? key : null;
}

/**
 * Remove every role-specific element and view the access object does not grant.
 * Removal (not `hidden`, not `opacity`) is deliberate: the markup, the data and
 * the handlers leave the DOM, so nothing can be reached by keyboard, by a
 * copied URL or by dev-tools.
 */
export function enforceCapabilities({ root, access } = {}) {
  const scope = root || document;
  const removed = { elements: [], views: [] };

  scope.querySelectorAll('[data-admin-cap]').forEach(element => {
    const capability = element.dataset.adminCap;
    if (!capability || access.has(capability)) return;
    removed.elements.push(element);
    element.remove();
  });

  scope.querySelectorAll('.admin-view[data-view-panel]').forEach(section => {
    const capability = viewCapability(section.dataset.viewPanel);
    if (!capability || access.has(capability)) return;
    removed.views.push(section.dataset.viewPanel);
    section.remove();
  });

  return removed;
}
