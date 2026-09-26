/* Admin Panel capability layer — a read-only projection of the role boundary
   that already exists in this repository.

   Sources of truth (never modified by this file):
     • firestore.rules      — Admin owns finance, reports, notices, routine,
                              settings and exam records; a Manager is the only
                              role that may approve/reject a student or
                              publish/reject a pending exam.
     • functions/index.js   — "Manager is the only role allowed to publish or
                              reject pending exam records."
     • manager.html         — the separate approval portal (students + exams).
     • teacher.html / payment.html — their own panels, each with its own role.

   The module adds no storage key, no role, no workflow and no business rule.
   It converts the role the signed-in staff account already carries into the
   set of Admin Panel views, menus, cards, shortcuts, actions and routes that
   may exist for that role, and provides the helpers used to enforce it on both
   sides of the app:

     1. UI visibility  — mark anything role-specific with `data-admin-cap`;
                         `enforceCapabilities()` removes what is not granted.
     2. Access control — `Access.allowsView()` guards `setView()`, the hash
                         route and every deep link.

   Removing an element (instead of styling it away) keeps unauthorised markup,
   data and handlers out of the DOM entirely, so a hidden feature can never be
   reached by keyboard, inspect-element or a copied URL. */

/** Every capability the Admin Panel can expose. Keys are stable strings so
 *  markup (`data-admin-cap`), the view map and tests all speak one language. */
export const CAPABILITIES = Object.freeze({
  DASHBOARD: 'dashboard.view',
  STUDENTS_VIEW: 'students.view',
  STUDENTS_MANAGE: 'students.manage',
  STUDENTS_APPROVE: 'students.approve',
  FINANCE_VIEW: 'finance.view',
  FINANCE_COLLECT: 'finance.collect',
  REPORTS_VIEW: 'reports.view',
  NOTICES_MANAGE: 'notices.manage',
  ROUTINE_MANAGE: 'routine.manage',
  CLASSES_MANAGE: 'classes.manage',
  APP_MANAGE: 'app.manage',
  EXAMS_VIEW: 'exams.view',
  EXAMS_PUBLISH: 'exams.publish',
  TEACHING_PANEL: 'teaching.panel',
  PAYMENT_PANEL: 'payment.panel'
});

/* The Admin role: reports, users and management (finance, notices, routine,
   classes, student-app control and exam records). Approval decisions belong to
   the Manager portal, teaching belongs to the Teacher panel and the payment
   desk belongs to the Payment counter — none of those are granted here. */
const ADMIN = Object.freeze([
  CAPABILITIES.DASHBOARD,
  CAPABILITIES.STUDENTS_VIEW,
  CAPABILITIES.STUDENTS_MANAGE,
  CAPABILITIES.FINANCE_VIEW,
  CAPABILITIES.FINANCE_COLLECT,
  CAPABILITIES.REPORTS_VIEW,
  CAPABILITIES.NOTICES_MANAGE,
  CAPABILITIES.ROUTINE_MANAGE,
  CAPABILITIES.CLASSES_MANAGE,
  CAPABILITIES.APP_MANAGE,
  CAPABILITIES.EXAMS_VIEW
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
  students: CAPABILITIES.STUDENTS_VIEW,
  finance: CAPABILITIES.FINANCE_VIEW,
  routine: CAPABILITIES.ROUTINE_MANAGE,
  exams: CAPABILITIES.EXAMS_VIEW,
  notices: CAPABILITIES.NOTICES_MANAGE,
  reports: CAPABILITIES.REPORTS_VIEW,
  'app-management': CAPABILITIES.APP_MANAGE,
  classes: CAPABILITIES.CLASSES_MANAGE
});

/** Views reachable from a bottom-bar tab. "more" is a container: it exists only
 *  while at least one sub-view is granted. */
export const BOTTOM_VIEWS = Object.freeze(['dashboard', 'students', 'finance', 'routine', 'more']);

/** Views reachable from the "More" menu. */
export const MORE_VIEWS = Object.freeze(['exams', 'notices', 'reports', 'app-management', 'classes']);

/** Bottom-bar entries. `order` keeps the tab order stable no matter which
 *  entries survive the capability filter. */
export const ADMIN_BOTTOM_NAV = Object.freeze([
  { view: 'dashboard', label: 'হোম', icon: 'dashboard', capability: CAPABILITIES.DASHBOARD, order: 1 },
  { view: 'students', label: 'শিক্ষার্থী', icon: 'users', capability: CAPABILITIES.STUDENTS_VIEW, order: 2 },
  { view: 'finance', label: 'হিসাব', icon: 'finance', capability: CAPABILITIES.FINANCE_VIEW, order: 3 },
  { view: 'routine', label: 'রুটিন', icon: 'routine', capability: CAPABILITIES.ROUTINE_MANAGE, order: 4 },
  { view: 'more', label: 'আরও', icon: 'more', capability: null, order: 5 }
]);

/** "More" menu entries (same shape as the bottom bar, plus a description). */
export const ADMIN_MORE_NAV = Object.freeze([
  { view: 'exams', label: 'পরীক্ষা', hint: 'পরীক্ষার তালিকা ও ফলাফল রিপোর্ট', icon: 'exams', capability: CAPABILITIES.EXAMS_VIEW, order: 1 },
  { view: 'notices', label: 'নোটিশ', hint: 'নোটিশ প্রকাশ ও ব্যবস্থাপনা', icon: 'notices', capability: CAPABILITIES.NOTICES_MANAGE, order: 2 },
  { view: 'reports', label: 'রিপোর্ট', hint: 'সব রিপোর্ট PDF/CSV ডাউনলোড', icon: 'reports', capability: CAPABILITIES.REPORTS_VIEW, order: 3 },
  { view: 'app-management', label: 'শিক্ষার্থী অ্যাপ', hint: 'অ্যাপের অবস্থা ও কন্ট্রোল', icon: 'app', capability: CAPABILITIES.APP_MANAGE, order: 4 },
  { view: 'classes', label: 'ক্লাস সেটিংস', hint: 'ক্লাস চালু বা বন্ধ করুন', icon: 'classes', capability: CAPABILITIES.CLASSES_MANAGE, order: 5 },
  { view: 'teaching', label: 'শিক্ষক প্যানেল', hint: 'শিক্ষক প্যানেল খুলুন', icon: 'teaching', capability: CAPABILITIES.TEACHING_PANEL, order: 6 }
]);

/** Dashboard tiles: one large icon + one clear label each, generated only for
 *  the capabilities the signed-in role holds. */
/* The fee-collection entry point is the full-width "ফি গ্রহণ করুন" card, so the
   grid lists the sections instead of repeating that action. */
export const ADMIN_FEATURE_TILES = Object.freeze([
  { view: 'students', label: 'শিক্ষার্থী', icon: 'users', capability: CAPABILITIES.STUDENTS_VIEW, order: 1 },
  { view: 'finance', label: 'হিসাব', icon: 'finance', capability: CAPABILITIES.FINANCE_VIEW, order: 2 },
  { view: 'reports', label: 'রিপোর্ট', icon: 'reports', capability: CAPABILITIES.REPORTS_VIEW, order: 3 },
  { view: 'notices', label: 'নোটিশ', icon: 'notices', capability: CAPABILITIES.NOTICES_MANAGE, order: 4 },
  { view: 'routine', label: 'রুটিন', icon: 'routine', capability: CAPABILITIES.ROUTINE_MANAGE, order: 5 },
  { view: 'exams', label: 'পরীক্ষা', icon: 'exams', capability: CAPABILITIES.EXAMS_VIEW, order: 6 },
  { view: 'classes', label: 'ক্লাস সেটিংস', icon: 'classes', capability: CAPABILITIES.CLASSES_MANAGE, order: 7 },
  { view: 'app-management', label: 'অ্যাপ কন্ট্রোল', icon: 'app', capability: CAPABILITIES.APP_MANAGE, order: 8 }
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

/** Route in the URL hash (admin.html#finance). Empty when absent/unknown. */
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
