/* Panel switch — the one place a device changes panels: the shared login page.

   The panels themselves never reach into another portal (js/panel-lockdown.js);
   this strip is what makes that rule liveable on an office device where the same
   phone or PC is used by two roles. It sits on index.html and does three things:

     • shows which panel this device currently has open, with a resume button
       (a remembered, still-valid session) and a "end session" button,
     • says out loud that switching needs no logout step: typing the other
       panel's username and password here switches this device to it,
     • offers a chip per panel whose account already exists on this device, and
       that chip ONLY fills the username box — the password is always required,
       so no panel can ever open from a tap alone.

   Every panel file name comes from js/panel-lockdown.js, so the login page and
   the panels cannot drift apart on which four pages exist. */

import { STAFF_ACCOUNTS, activeStaffRoles, clearStaffSession, loadStaffAccount, staffAccountRecordExists } from './staff-auth.js';
import { PANEL_BY_ROLE, PANEL_LABELS } from './panel-lockdown.js';

export const SWITCH_ID = 'staffSwitch';
export const SWITCH_ROLES = Object.freeze(Object.keys(STAFF_ACCOUNTS));
const ROLE_TITLE = Object.freeze({
  admin: 'এডমিন',
  manager: 'ম্যানেজার',
  teacher: 'শিক্ষক',
  payment: 'পেমেন্ট'
});

/** What the strip needs: the session(s) this device holds and the panels whose
    login account exists here (never the password — loadStaffAccount omits it). */
export async function panelSwitchState() {
  const active = await activeStaffRoles();
  const accounts = {};
  for (const role of SWITCH_ROLES) {
    if (!staffAccountRecordExists(role)) continue;
    const account = await loadStaffAccount(role);
    accounts[role] = {
      username: String(account?.username || STAFF_ACCOUNTS[role].username),
      fullName: String(account?.fullName || '')
    };
  }
  return { active, accounts };
}

function make(doc, tag, className = '', text = '') {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function panelTitle(role) {
  return PANEL_LABELS[PANEL_BY_ROLE[role]] || 'প্যানেল';
}

/** Only the username box is filled; the password stays the person's job. */
function fillLoginId(doc, role, username) {
  const input = doc.getElementById('loginMobile');
  if (input) {
    input.value = username;
    const view = doc.defaultView || globalThis;
    input.dispatchEvent(new view.Event('input', { bubbles: true }));
  }
  doc.getElementById('loginPin')?.focus?.();
  const note = doc.getElementById('staffSwitchNote');
  if (note) note.textContent = `${ROLE_TITLE[role] || role} প্যানেলের ইউজারনেম বসানো হলো — এবার নিজের পাসওয়ার্ড দিয়ে লগইন করুন।`;
}

/** Build (or rebuild) the strip. Safe to call again after a session changes. */
export async function mountPanelSwitch(doc = globalThis.document) {
  const host = doc?.getElementById?.(SWITCH_ID);
  if (!host) return null;
  const state = await panelSwitchState();
  const roles = Object.keys(state.accounts);
  const activeRole = state.active[0] || '';
  host.replaceChildren();
  if (!activeRole && !roles.length) {
    host.hidden = true;
    return { ...state, host };
  }

  const head = make(doc, 'strong', 'panel-switch-head', activeRole
    ? `এই ডিভাইসে এখন ${panelTitle(activeRole)} খোলা আছে`
    : 'এই ডিভাইসে এখন কোনো প্যানেল খোলা নেই');
  host.append(head);

  if (activeRole) {
    const actions = make(doc, 'div', 'panel-switch-actions');
    const resume = make(doc, 'button', 'panel-switch-primary', 'প্যানেলে ফিরে যান');
    resume.type = 'button';
    resume.id = 'staffSwitchResume';
    resume.addEventListener('click', () => { globalThis.location.replace(PANEL_BY_ROLE[activeRole]); });
    const end = make(doc, 'button', '', 'সেশন শেষ করুন');
    end.type = 'button';
    end.id = 'staffSwitchEnd';
    end.addEventListener('click', async () => {
      clearStaffSession(activeRole);
      await mountPanelSwitch(doc);
    });
    actions.append(resume, end);
    host.append(actions);
  }

  host.append(make(doc, 'p', 'panel-switch-note', activeRole
    ? 'প্যানেল বদলাতে আগে লগআউট করার দরকার নেই — নিচে অন্য প্যানেলের ইউজারনেম ও পাসওয়ার্ড দিলেই এই ডিভাইসে প্যানেল বদলে যাবে।'
    : 'নিচে প্যানেলের ইউজারনেম ও পাসওয়ার্ড দিলে এই ডিভাইসে সেই প্যানেল খুলবে।'));

  const others = roles.filter(role => role !== activeRole);
  if (others.length) {
    const row = make(doc, 'div', 'panel-switch-chips');
    row.append(make(doc, 'span', 'panel-switch-chips-label', 'লগইন আইডি বসান:'));
    for (const role of others) {
      const chip = make(doc, 'button', 'panel-switch-chip', ROLE_TITLE[role] || role);
      chip.type = 'button';
      chip.id = `staffSwitchFill-${role}`;
      chip.setAttribute('aria-label', `${ROLE_TITLE[role] || role} প্যানেলের লগইন আইডি বসান`);
      chip.addEventListener('click', () => fillLoginId(doc, role, state.accounts[role].username));
      row.append(chip);
    }
    host.append(row);
    host.append(make(doc, 'p', 'panel-switch-note panel-switch-tiny', 'চিপ শুধু ইউজারনেম বসায় — পাসওয়ার্ড ছাড়া কোনো প্যানেল খোলে না।'));
  } else {
    host.append(make(doc, 'p', 'panel-switch-note panel-switch-tiny', 'শুধু ট্যাপ করে কোনো প্যানেল খোলে না — অন্য প্যানেলের ইউজারনেম ও পাসওয়ার্ড দুটোই লাগবে।'));
  }

  const status = make(doc, 'p', 'panel-switch-note panel-switch-tiny');
  status.id = 'staffSwitchNote';
  host.append(status);
  host.hidden = false;
  return { ...state, host };
}
