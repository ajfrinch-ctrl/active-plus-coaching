/* Shared in-app dialog for every panel.
 *
 * Why this exists: the Manager panel used to ask for a reject reason, a notice
 * edit or a delete confirmation with the browser's native window.prompt /
 * window.confirm. On an installed Android/iOS app those native dialogs are
 * browser chrome at best — iOS standalone web apps ignore window.prompt
 * completely — so a rejected registration or payment could silently do
 * nothing. They also look nothing like the rest of the app and are not
 * reachable with the panel's own keyboard/screen-reader behaviour.
 *
 * This module builds the app's own dialog instead: the same glass/AMOLED
 * `.modal` surfaces, Bangla copy, a real form, inline validation, Escape /
 * backdrop cancel, focus handling and a promise-based API, so a caller reads
 * like before:
 *
 *   if (!await confirmAction({ title: 'মুছবেন?' })) return;
 *   const reason = await askText({ title: 'কারণ', required: true });
 *
 * Only presentation + input collection lives here. No data is written.
 */
const BACKDROP_SELECTOR = '.modal-backdrop[data-in-app-dialog]';
let counter = 0;
let current = null;         // { close } of the dialog currently on screen
let bodyLocked = false;

const DEFAULT_CANCEL = 'বাতিল';
const DEFAULT_CONFIRM = 'নিশ্চিত করুন';

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function buildField(field, dialogId) {
  const id = `${dialogId}-field-${field.name}`;
  const label = make('label', null, field.label || field.name);
  label.setAttribute('for', id);
  if (field.required) {
    const mark = make('i', null, ' *');
    mark.setAttribute('aria-hidden', 'true');
    label.append(mark);
  }
  const multiline = field.type === 'textarea';
  const input = make(multiline ? 'textarea' : 'input');
  input.id = id;
  input.name = field.name;
  if (multiline) { input.rows = field.rows || 4; if (field.maxLength) input.maxLength = field.maxLength; }
  else {
    input.type = field.type || 'text';
    if (field.maxLength) input.maxLength = field.maxLength;
    if (field.inputMode) input.inputMode = field.inputMode;
    if (field.autocomplete) input.autocomplete = field.autocomplete;
  }
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.value !== undefined && field.value !== null) input.value = String(field.value);
  if (field.required) input.required = true;
  if (field.hint) {
    const hint = make('small', 'fixed-field-note', field.hint);
    hint.id = `${id}-hint`;
    input.setAttribute('aria-describedby', hint.id);
    return { field: [label, input, hint], input, name: field.name };
  }
  return { field: [label, input], input, name: field.name };
}

function restoreFocus(opener) {
  if (bodyLocked) { document.body.classList.remove('modal-open'); bodyLocked = false; }
  if (!opener || typeof opener.focus !== 'function' || !opener.isConnected) return;
  try { opener.focus({ preventScroll: true }); } catch { /* older engine: no options object */ opener.focus(); }
}

/**
 * Open one dialog. Resolves with `true` when the user confirms, `false`
 * otherwise (cancel, Escape, backdrop or being replaced by a newer dialog).
 */
function openDialog(options) {
  const {
    kicker = 'Active Plus',
    title,
    message = '',
    fields = [],
    cancelLabel = DEFAULT_CANCEL,
    confirmLabel = DEFAULT_CONFIRM,
    tone = '',
    validate
  } = options;

  return new Promise(resolve => {
    // One dialog at a time: an older one is cancelled, never stacked.
    if (current) current.close(false);
    const opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    const dialogId = `in-app-dialog-${++counter}`;
    const titleId = `${dialogId}-title`;
    const errorId = `${dialogId}-error`;

    const backdrop = make('div', 'modal-backdrop');
    backdrop.setAttribute('data-in-app-dialog', '');
    const panel = make('section', 'modal');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', titleId);
    panel.dataset.dialogTone = tone || 'neutral';

    const header = make('div', 'modal-header');
    const heading = make('div');
    if (kicker) heading.append(make('p', 'eyebrow', kicker));
    const headingText = make('h2', null, title || DEFAULT_CONFIRM);
    headingText.id = titleId;
    heading.append(headingText);
    const close = make('button', 'modal-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'ডায়ালগ বন্ধ করুন');
    close.setAttribute('data-dialog-cancel', '');
    header.append(heading, close);

    const form = make('form', 'in-app-dialog-form');
    form.noValidate = true;
    if (message) form.append(make('p', 'modal-copy', message));
    const controls = fields.map(field => buildField(field, dialogId));
    controls.forEach(control => form.append(...control.field));

    const error = make('p', 'finance-error');
    error.id = errorId;
    error.setAttribute('role', 'alert');
    error.hidden = true;
    form.append(error);

    const actions = make('div', 'modal-actions');
    const cancel = make('button', 'admin-btn ghost', cancelLabel);
    cancel.type = 'button';
    cancel.setAttribute('data-dialog-cancel', '');
    const confirm = make('button', `admin-btn ${tone === 'danger' ? 'danger' : 'primary'}`, confirmLabel);
    confirm.type = 'submit';
    confirm.setAttribute('data-dialog-confirm', '');
    actions.append(cancel, confirm);

    form.append(actions);
    panel.append(header, form);
    backdrop.append(panel);

    let settled = false;
    function finish(confirmed, value) {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeydown, true);
      backdrop.remove();
      if (current?.close === closeDialog) current = null;
      restoreFocus(opener);
      resolve(confirmed ? value : null);
    }
    function closeDialog() { finish(false, null); }

    function showError(text, focusTarget) {
      error.textContent = text;
      error.hidden = false;
      if (focusTarget) focusTarget.focus();
    }

    function collect() {
      const values = {};
      let firstInvalid = null;
      for (const control of controls) {
        const raw = control.input.type === 'checkbox' ? control.input.checked : String(control.input.value ?? '').trim();
        values[control.name] = raw;
        const invalid = Boolean(control.input.required) && !raw;
        /* `[aria-invalid=true]` is what the shared form CSS colours, so the
           value must be written, not just the attribute presence. */
        if (invalid) control.input.setAttribute('aria-invalid', 'true');
        else control.input.removeAttribute('aria-invalid');
        if (invalid && !firstInvalid) firstInvalid = control.input;
      }
      return { values, firstInvalid };
    }

    function onKeydown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      finish(false, null);
    }

    form.addEventListener('submit', event => {
      event.preventDefault();
      const { values, firstInvalid } = collect();
      if (firstInvalid) return showError('তারকা (*) চিহ্নিত ঘরগুলো পূরণ করুন।', firstInvalid);
      const problem = validate ? validate(values) : '';
      if (problem) return showError(problem);
      error.hidden = true;
      finish(true, values);
    });
    /* Typing into a flagged field clears its flag at once; once nothing is
       flagged the inline message goes away too, so the dialog never keeps
       shouting at a filled-in form. */
    form.addEventListener('input', event => {
      const control = controls.find(item => item.input === event.target);
      if (!control || !control.input.hasAttribute('aria-invalid')) return;
      if (String(control.input.value ?? '').trim()) control.input.removeAttribute('aria-invalid');
      if (!controls.some(item => item.input.hasAttribute('aria-invalid'))) error.hidden = true;
    });
    close.addEventListener('click', () => finish(false, null));
    cancel.addEventListener('click', () => finish(false, null));
    /* The confirm control is a submit button, so Enter in a field already
       works. A programmatic click does not run the default form submission in
       every engine (and tests), so the click is routed through requestSubmit
       explicitly — preventDefault keeps a real browser from submitting twice. */
    confirm.addEventListener('click', event => {
      event.preventDefault();
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    backdrop.addEventListener('click', event => { if (event.target === backdrop) finish(false, null); });
    document.addEventListener('keydown', onKeydown, true);

    document.body.append(backdrop);
    if (!document.body.classList.contains('modal-open')) { document.body.classList.add('modal-open'); bodyLocked = true; }
    current = { close: closeDialog };
    (controls[0]?.input || confirm).focus();
  });
}

/** Yes/no dialog. `tone: 'danger'` marks the confirm button as destructive. */
export function confirmAction({ confirmLabel = 'হ্যাঁ, নিশ্চিত', ...rest }) {
  return openDialog({ ...rest, confirmLabel, fields: [] }).then(result => result !== null);
}

/** Single-line (or textarea) text request. Resolves `null` when cancelled. */
export async function askText({ label = 'লিখুন', name = 'value', value = '', required = true, ...rest }) {
  const result = await openDialog({
    ...rest,
    fields: [{ name, label, value, required, type: rest.multiline ? 'textarea' : 'text', maxLength: rest.maxLength, placeholder: rest.placeholder, hint: rest.hint, rows: rest.rows }]
  });
  return result ? result[name] : null;
}

/**
 * Small form dialog (the notice title+body and routine subject+teacher edits,
 * which used to be two chained native prompts that could half-apply an edit).
 * Resolves a `{name: value}` object, or `null` when cancelled.
 */
export function askFields({ fields = [], ...rest }) {
  return openDialog({ ...rest, fields });
}

/** Is a dialog of this module on screen? (used by tests and the panels) */
export function dialogIsOpen() {
  return Boolean(document.querySelector(BACKDROP_SELECTOR));
}
