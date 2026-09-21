/* Dummy dataset for the one-click Admin Panel.
   Future API work can replace these records without touching the admin UI. */
import { enabledClasses, schedule } from './config.js';

export const adminStudents = Object.freeze([
  {
    id: 'AP-1024',
    name: 'রাইসা ইসলাম',
    nameEn: 'Raisa Islam',
    fatherName: 'আব্দুল করিম',
    className: 'দশম শ্রেণি',
    group: 'বিজ্ঞান বিভাগ',
    mobile: '01700000000',
    guardianMobile: '01800000000',
    address: 'বাড়ি ১২, রোড ৫, শাহজাদপুর, দিনাজপুর',
    status: 'approved',
    attendance: 92,
    average: 86,
    enrolledAt: '১৪ সেপ্টেম্বর ২০২৬',
    lastActive: 'আজ, ০৯:৪২'
  },
  {
    id: '260810021',
    name: 'তহমিদ হাসান',
    nameEn: 'Tahmid Hasan',
    fatherName: 'জসিম উদ্দিন',
    className: 'দশম শ্রেণি',
    group: 'বিজ্ঞান বিভাগ',
    mobile: '01811223344',
    guardianMobile: '01911223344',
    address: 'গ্রাম বাসুদী, রংপুর সদর, রংপুর',
    status: 'approved',
    attendance: 88,
    average: 81,
    enrolledAt: '০২ আগস্ট ২০২৬',
    lastActive: 'গতকাল, ১৭:১৫'
  },
  {
    id: '260712005',
    name: 'সাদিয়া আফরিন',
    nameEn: 'Sadia Afrin',
    fatherName: 'মো. শফিকুল ইসলাম',
    className: 'দ্বাদশ শ্রেণি',
    group: 'ব্যবসায় শিক্ষা',
    mobile: '01677889900',
    guardianMobile: '01777889900',
    address: 'হাউজ ৭, ফ্ল্যাট ৩, ভুইয়াপাড়া, বনানী, ঢাকা',
    status: 'pending',
    attendance: 0,
    average: 0,
    enrolledAt: '১৯ সেপ্টেম্বর ২০২৬',
    lastActive: '—'
  },
  {
    id: '260909032',
    name: 'মেহেদী হাসান',
    nameEn: 'Mehedi Hasan',
    fatherName: 'আব্দুল মালেক',
    className: 'নবম শ্রেণি',
    group: 'সাধারণ',
    mobile: '01933445566',
    guardianMobile: '01833445566',
    address: 'বাড়ি ৪৫, বাজার রোড, বোচাগঞ্জ, দিনাজপুর',
    status: 'pending',
    attendance: 0,
    average: 0,
    enrolledAt: '২০ সেপ্টেম্বর ২০২৬',
    lastActive: '—'
  },
  {
    id: '260908018',
    name: 'আরিফ চৌধুরী',
    nameEn: 'Arif Chowdhury',
    fatherName: 'নূরুল চৌধুরী',
    className: 'অষ্টম শ্রেণি',
    group: 'সাধারণ',
    mobile: '01311223344',
    guardianMobile: '01411223344',
    address: 'গ্রাম পাঁচবিলা, বোচাগঞ্জ, দিনাজপুর',
    status: 'pending',
    attendance: 0,
    average: 0,
    enrolledAt: '২১ সেপ্টেম্বর ২০২৬',
    lastActive: '—'
  },
  {
    id: '260810019',
    name: 'ফারহান রহমান',
    nameEn: 'Farhan Rahman',
    fatherName: 'মো. আব্দুর রহমান',
    className: 'দশম শ্রেণি',
    group: 'মানবিক',
    mobile: '01422334455',
    guardianMobile: '01522334455',
    address: 'বাড়ি ৯, লালমাই, চরফয়া, মুন্সিগঞ্জ',
    status: 'rejected',
    attendance: 0,
    average: 0,
    enrolledAt: '২৮ জুলাই ২০২৬',
    lastActive: '—'
  },
  {
    id: '260716011',
    name: 'সুমাইয়া খাতুন',
    nameEn: 'Sumaiya Khatun',
    fatherName: 'মো. ইউসুফ আলী',
    className: 'অনার্স ১ম বর্ষ',
    group: 'বাংলা',
    mobile: '01766778899',
    guardianMobile: '01666778899',
    address: 'রোড ৩, হাউজ ২১, বক্সিবার, বেনাপোল, খুলনা',
    status: 'approved',
    attendance: 95,
    average: 89,
    enrolledAt: '১৫ জুলাই ২০২৬',
    lastActive: 'আজ, ০৮:০৫'
  },
  {
    id: '260613004',
    name: 'ইমরান হোসেন',
    nameEn: 'Imran Hossain',
    fatherName: 'মো. জসিম হোসেন',
    className: 'ডিগ্রি ১ম বর্ষ',
    group: 'সাধারণ',
    mobile: '01555667788',
    guardianMobile: '01755667788',
    address: 'গ্রাম চাঁদপুর, ফুলবাড়ী, মুন্সিগঞ্জ',
    status: 'approved',
    attendance: 78,
    average: 74,
    enrolledAt: '০৫ জুন ২০২৬',
    lastActive: '৩ দিন আগে'
  }
]);

export const adminNotices = Object.freeze([
  {
    id: 'n-101',
    title: 'নতুন ব্যাচের ভর্তি পরীক্ষার সময়সূচি',
    body: 'দশম ও একাদশ শ্রেণির ভর্তি পরীক্ষা আগামী শনি-রবিবার বিকেল ৩টায় অনুষ্ঠিত হবে। পরীক্ষায় উপস্থিত হতে ID কার্ড সঙ্গে আনতে হবে।',
    audience: 'সব শিক্ষার্থী',
    date: '১৮ সেপ্টেম্বর ২০২৬'
  },
  {
    id: 'n-100',
    title: 'ক্লাস রুটিন পরিবর্তন',
    body: 'রবিবার থেকে মঙ্গলবারের উচ্চতর গণিত ক্লাসটি বিকেল ৪:৩০-এর পরিবর্তে সন্ধ্যা ৬:০০-এ শুরু হবে। বাকি ক্লাস আগের মতোই থাকছে।',
    audience: 'বিজ্ঞান বিভাগ',
    date: '১৫ সেপ্টেম্বর ২০২৬'
  },
  {
    id: 'n-099',
    title: 'বার্ষিক দিবস রিপ্রজেন্টেশন',
    body: 'বুধবার বিকেল ৪:৩০-তে বার্ষিক দিবসের রিপ্রজেন্টেশন হবে। সব শিক্ষার্থীকে যথা সময়ে উপস্থিত থাকতে হবে।',
    audience: 'সব শিক্ষার্থী',
    date: '১২ সেপ্টেম্বর ২০২৬'
  }
]);

export const classEnrollment = Object.freeze([
  { className: 'অষ্টম শ্রেণি', count: 6 },
  { className: 'নবম শ্রেণি', count: 11 },
  { className: 'দশম শ্রেণি', count: 14 },
  { className: 'একাদশ শ্রেণি', count: 12 },
  { className: 'দ্বাদশ শ্রেণি', count: 9 },
  { className: 'ডিগ্রি ১ম বর্ষ', count: 4 },
  { className: 'ডিগ্রি ২য় বর্ষ', count: 3 },
  { className: 'ডিগ্রি ৩য় বর্ষ', count: 2 },
  { className: 'অনার্স ১ম বর্ষ', count: 2 },
  { className: 'অনার্স ২য় বর্ষ', count: 1 },
  { className: 'অনার্স ৩য় বর্ষ', count: 1 },
  { className: 'অনার্স ৪র্থ বর্ষ', count: 0 }
]);

export const dayNames = Object.freeze({
  sat: 'শনিবার',
  sun: 'রবিবার',
  mon: 'সোমবার',
  tue: 'মঙ্গলবার',
  wed: 'বুধবার',
  thu: 'বৃহস্পতিবার'
});

export { enabledClasses, schedule };
