# One in-app dialog for decisions, edits and deletes — 148

## Reason

The Manager panel asked for a reject reason, a notice/routine edit and every
delete confirmation with the browser's own `window.prompt` / `window.confirm`.
That is a real availability problem, not just a styling one:

- an iOS home-screen web app ignores `window.prompt()` — the Manager could tap
  **Reject**, see nothing, and no decision would be recorded;
- a native dialog is browser chrome, so it ignores the app's theme, language
  layout, focus handling and screen-reader behaviour;
- editing a notice took **two** prompts: cancelling the second one after the
  first had been accepted was a half-applied edit waiting to happen.

The Admin/Manager registration review already used the app's own `.modal`
surface (`js/registration-review.js`), so the new component keeps exactly that
visual language.

## What shipped

- **`js/in-app-dialog.js`** — a small, promise-based component with no data
  writes of its own:
  - `confirmAction({ title, message, confirmLabel, tone })` → `Promise<boolean>`
  - `askText({ title, label, value, required, maxLength, multiline })` → `Promise<string|null>`
  - `askFields({ fields: [...] })` → `Promise<Record<string,string>|null>`
  - `dialogIsOpen()`
- The dialog is built from the existing shared classes (`.modal-backdrop`,
  `.modal`, `.modal-header`, `.modal-close`, `.modal-actions`, `.admin-btn`,
  `.finance-error`), so the glass/AMOLED palette, print exclusion and
  `js/ui-accessibility.js` focus trap all apply with **no new CSS and no new
  colour**.
- Behaviour: `role="dialog"` + `aria-modal` + `aria-labelledby` on the panel,
  Escape / backdrop / cancel resolve as “cancelled”, focus moves to the first
  field and returns to the opening control, `body.modal-open` is toggled once
  (and never removed while another panel dialog is still open), and only one
  dialog can exist — a newer request cancels the older one instead of stacking.
- Required fields are validated in Bangla, keep the dialog open, mark the field
  with `aria-invalid="true"` (the attribute the shared form CSS colours) and
  announce the reason through a `role="alert"` line; typing into a flagged
  field clears the flag and the message.
- The confirm control is a real submit button, so Enter works; its click is
  routed through `form.requestSubmit()`, which also makes programmatic clicks
  behave like a user click.

## Where it replaced native dialogs

| Flow | Before | After |
| --- | --- | --- |
| Approval queue → Reject | `prompt('Reject করার কারণ')` | `askText` with the student's name/ID in the message, required Bengali reason (max 500) |
| Payment queue → Reject | `prompt('Payment reject করার কারণ')` | same, with student + amount in the message |
| Notice → Edit | two chained prompts | **one** `askFields` dialog (title + body), one save |
| Routine → Edit | two chained prompts | **one** `askFields` dialog (subject + teacher) |
| Notice / routine / teacher assignment → Delete | `confirm` | `confirmAction` with `tone: 'danger'` and what will disappear |
| Exam draft → Delete (Manager & Teacher) | `confirm` | `confirmAction` |
| Offline role workspace → Restore | bare `confirm` | `confirmAction` (what is replaced, and to back up first) |

Every one of these still re-checks the Manager session *after* the dialog, so a
decision that waits for a typed reason can never be saved with a stale session.

## Accessibility pass (found by a dynamic scan)

A new scan boots each page for real and walks every view, checking that each
visible control has an accessible name. It found:

- **Admin → শিক্ষার্থী**: the search field sat inside an icon-only `<label>`, so
  it had no name at all (only a placeholder) → `aria-label="শিক্ষার্থী খুঁজুন"`.
- **Admin → সেটিংস**: the class on/off switches put their `aria-label` on the
  wrapping `<label>`, which names the label rather than the checkbox inside
  it → the label is now on the `<input>` itself.
- **Manager → ফি ও পেমেন্ট**: the search box and status filter had placeholders
  but no name → both have `aria-label`s.
- **Teacher → তালিকা**: “আরও দেখুন” had its text written only by script, so it
  was nameless until rows existed → the button ships with its own text.

Also fixed while in there: the student feedback toast is now a **persistent
`role="status"` live region** (created once, hidden between messages) instead of
a node that is inserted with its text and thrown away — that is the pattern
screen readers actually announce, and a repeated message still re-announces.

## Tests

- `tests/in-app-dialog.test.mjs` — 6 tests: labelled modal dialog, confirm /
  cancel / Escape / backdrop results, required-field validation and Bangla
  message, `askFields` values, cancel returning nothing, focus return, and the
  single-dialog rule.
- `tests/manager-dialogs.test.mjs` — 7 tests: a rejected registration really
  stores the typed reason (`reviewNote`, `reviewedRole`), an empty reason cannot
  decide anything, cancelling leaves the student pending, a notice edit is one
  dialog (and cancel writes nothing), delete-notice/routine go through the
  in-app confirm, Escape never deletes, and a static guard that no Manager /
  exam / offline-workspace module calls `window.prompt`/`window.confirm` (or a
  bare `confirm`).
- `tests/a11y-controls.test.mjs` + `tests/a11y-scan.mjs` — the scan above runs
  per page/role in its own process, plus static regression checks for each
  specific control that was fixed and a test for the persistent live region.
  Verified to fail when a fix is reverted (the scan reports
  `students input#studentSearch` and the 12 unlabelled class switches again).

## Release

- Service Worker cache version **148**, with `./js/in-app-dialog.js` added to
  the precache list; all six HTML entries ask for `?v=148`.
- Full Node suite: **704/704 passed** (688 before, 16 new).
- `node tests/ui-sweep.mjs manager.html manager` still reports the identical
  124 wired / 9 quiet / 19 skipped / 0 errors as before this change.
- No storage key, record shape, sync rule or financial value is touched.
