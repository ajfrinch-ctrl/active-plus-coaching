/* Shared student/teacher account policy; enforce the same rules on the future server.
   Extra contacts are append-only and are not alternate login IDs. */
import { DEFAULT_PIN } from './config.js';

export function contactNumber(value) {
  let number = String(value ?? '').trim().replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/[\s()+-]/g, '');
  if (number.startsWith('880')) number = number.slice(2);
  return number;
}
export const isContactNumber = value => /^01[3-9]\d{8}$/.test(contactNumber(value));
export function protectAccountIdentity(candidate, previous = null) {
  const registrationMobile = contactNumber(previous?.registrationMobile || previous?.mobile || candidate.registrationMobile || candidate.mobile);
  if (!isContactNumber(registrationMobile)) throw new Error('সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন।');
  const additionalMobiles = [...new Set([
    ...(previous?.additionalMobiles || []), ...(candidate.additionalMobiles || []),
    // Preserve an existing legacy profile contact instead of silently losing it.
    previous?.student?.studentMobile
  ].filter(Boolean).map(contactNumber))].filter(n => n !== registrationMobile);
  if (additionalMobiles.some(n => !isContactNumber(n))) throw new Error('অতিরিক্ত মোবাইল নম্বর সঠিক নয়।');
  const account = { ...candidate, registrationMobile, mobile: registrationMobile, additionalMobiles, pin: candidate.pin || previous?.pin || DEFAULT_PIN };
  if (candidate.student) account.student = { ...candidate.student, studentMobile: registrationMobile };
  return account;
}
export function appendAccountMobile(account, value) {
  const current = protectAccountIdentity(account, account);
  const number = contactNumber(value);
  if (!isContactNumber(number)) throw new Error('সঠিক ১১ সংখ্যার নতুন মোবাইল নম্বর দিন।');
  if ([current.registrationMobile, ...current.additionalMobiles].includes(number)) throw new Error('এই নম্বরটি আগেই যুক্ত আছে।');
  return { ...current, additionalMobiles: [...current.additionalMobiles, number] };
}
