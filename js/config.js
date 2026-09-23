/* Shared application configuration. Document keys come from the database catalog. */
import { KEYS } from './database.js';
export const APP_TAGLINE = 'শিখতে থাকো, এগিয়ে যাও';

export const STORAGE_KEYS = Object.freeze({
  student: KEYS.studentProfile,
  account: KEYS.account,
  session: 'active-plus-session-v1',
  sessionExpiry: 'active-plus-session-expiry-v1',
  trustedDevice: 'active-plus-trusted-v1',
  skipSecurity: 'active-plus-skip-security-v1',
  installDismissed: 'active-plus-install-dismissed',
  idSequence: 'active-plus-id-sequence',
  usernames: KEYS.usernames,
  weather: 'active-plus-weather-v1',
  appConfig: KEYS.settings
});

export const DEFAULT_PIN = '123123';

export const ADMIN_ID = '01819486966';

export const DEFAULT_APP_SETTINGS = Object.freeze({
  maintenanceMode: false,
  maintenanceMessage: 'সম্মানিত শিক্ষার্থী, অ্যাপটিতে বর্তমানে সিস্টেম আপডেট চলছে। সাময়িক অসুবিধার জন্য আন্তরিকভাবে দুঃখিত।',
  allowRegistration: true,
  allowTeacherRegistration: true,
  skipSecurityCheck: false,
  tagline: 'শিখতে থাকো, এগিয়ে যাও',
  helplineMobile: '01819486966',
  whatsappNumber: '01819486966',
  officialEmail: 'activeplus.coaching@gmail.com',
  campusAddress: 'দিনাজপুর সদর, দিনাজপুর',
  broadcastAlert: false,
  broadcastMessage: '',
  broadcastTone: 'green',
  modules: {
    routine: true,
    courses: true,
    results: true,
    installPrompt: true
  },
  themeMode: 'auto'
});

export const enabledClasses = Object.freeze([
  'অষ্টম শ্রেণি', 'নবম শ্রেণি', 'দশম শ্রেণি', 'একাদশ শ্রেণি', 'দ্বাদশ শ্রেণি',
  'ডিগ্রি ১ম বর্ষ', 'ডিগ্রি ২য় বর্ষ', 'ডিগ্রি ৩য় বর্ষ',
  'অনার্স ১ম বর্ষ', 'অনার্স ২য় বর্ষ', 'অনার্স ৩য় বর্ষ', 'অনার্স ৪র্থ বর্ষ'
]);

export const defaultStudent = Object.freeze({
  name: '',
  nameBn: '',
  nameEn: '',
  className: '',
  group: '',
  id: '',
  username: '',
  studentMobile: '',
  guardianMobile: '',
  fatherName: '', motherName: '', guardianName: '',
  birthDate: '', gender: '', address: '',
  major: '', institution: '', roll: '', registrationNo: ''
});

export const subjectInitials = Object.freeze({
  'উচ্চতর গণিত': 'গ', 'পদার্থবিজ্ঞান': 'প', 'বাংলা': 'ব',
  'রসায়ন': 'র', 'ইংরেজি': 'ই', 'মডেল টেস্ট': 'ম'
});

export const schedule = Object.freeze({
  sat: { date: '', classes: [] },
  sun: { date: '', classes: [] },
  mon: { date: '', classes: [] },
  tue: { date: '', classes: [] },
  wed: { date: '', classes: [] },
  thu: { date: '', classes: [] }
});
