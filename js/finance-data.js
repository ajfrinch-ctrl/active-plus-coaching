/* Finance domain helpers. Records live in the transactions collection.
   Swap the database adapter for Firestore later; the payment UI awaits its save. */
import { KEYS, listDocumentsStrict, replaceDocumentsStrict } from './database.js';
export const TRANSACTIONS_KEY = KEYS.transactions;
export const DEFAULT_MONTHLY_FEE = 1500;
export const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
export const latinDigits = value => String(value ?? '').replace(/[০-৯]/g, digit => '০১২৩৪৫৬৭৮৯'.indexOf(digit));
const banglaDigits = value => String(value).replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[digit]);
export const monthLabel = (date = new Date()) => `${MONTHS[date.getMonth()]} ${banglaDigits(date.getFullYear())}`;
export const dateLabel = (date = new Date()) => `${banglaDigits(date.getDate())} ${monthLabel(date)}`;

export function searchStudents(students, query) {
  const text = latinDigits(query).normalize('NFC').trim().toLocaleLowerCase();
  if (!text) return [];
  const compact = text.replace(/[\s()+-]/g, '');
  return students.filter(s => [s.name, s.nameEn, s.id, s.mobile, s.guardianMobile].some(value => {
    const normalized = latinDigits(value).normalize('NFC').toLocaleLowerCase();
    return normalized.includes(text) || (compact && normalized.replace(/[\s()+-]/g, '').includes(compact));
  }));
}

function paymentDate(value) {
  const text = latinDigits(value).trim();
  const [day, month, year] = text.split(/\s+/);
  const index = MONTHS.indexOf(month);
  if (index >= 0 && Number(day) && Number(year)) return new Date(Number(year), index, Number(day)).getTime();
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

const recordedAt = tx => Number.isFinite(tx?.recordedAt) ? tx.recordedAt : paymentDate(tx?.date);
export function newestTransactions(transactions) {
  // Machine time wins when a record has it; same-day ties stay insertion-stable.
  return [...transactions].sort((a, b) => recordedAt(b) - recordedAt(a));
}

/** New ledger rows keep the Bengali display date and a sortable timestamp. */
export function stampTransaction(fields, now = new Date()) {
  return {
    ...fields,
    date: fields.date || dateLabel(now),
    recordedAt: Number.isFinite(fields.recordedAt) ? fields.recordedAt : now.getTime(),
    createdAt: fields.createdAt || now.toISOString()
  };
}

export function studentFeeSummary(student, transactions, now = new Date()) {
  const month = monthLabel(now);
  const own = transactions.filter(tx => tx.studentId === student.id);
  const monthly = own.filter(tx => tx.month === month);
  const configured = student.monthlyFee;
  const monthlyFee = configured != null && configured !== '' && Number.isFinite(Number(configured)) && Number(configured) >= 0
    ? Number(configured) : DEFAULT_MONTHLY_FEE;
  const paid = monthly.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const tuitionPaid = monthly.filter(tx => tx.feeType === 'মাসিক বেতন').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  return { month, monthlyFee, paid, tuitionPaid, due: Math.max(0, monthlyFee - tuitionPaid), lastPayment: newestTransactions(own)[0] || null };
}

function validTransaction(tx) {
  return Boolean(tx && tx.id && tx.studentId && Number.isFinite(Number(tx.amount)));
}

function readTransactions() {
  return listDocumentsStrict('transactions', validTransaction);
}

export const financeRepository = {
  async listTransactions() { return readTransactions(); },
  async saveTransaction(transaction) {
    const save = () => {
      // Re-read before writing so another tab's collections are not overwritten.
      const records = readTransactions();
      if (!records.some(tx => tx.id === transaction.id)) records.unshift(transaction);
      replaceDocumentsStrict('transactions', records);
      return records;
    };
    return navigator.locks ? navigator.locks.request(TRANSACTIONS_KEY, save) : save();
  }
};
