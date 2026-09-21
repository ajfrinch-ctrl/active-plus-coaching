/* Shared application configuration. Future admin data can replace these local defaults. */
export const APP_TAGLINE = 'শিখতে থাকো, এগিয়ে যাও';

export const STORAGE_KEYS = Object.freeze({
  student: 'active-plus-student-v1',
  account: 'active-plus-account-v1',
  session: 'active-plus-session-v1',
  installDismissed: 'active-plus-install-dismissed',
  idSequence: 'active-plus-id-sequence'
});

export const enabledClasses = Object.freeze([
  'অষ্টম শ্রেণি', 'নবম শ্রেণি', 'দশম শ্রেণি', 'একাদশ শ্রেণি', 'দ্বাদশ শ্রেণি',
  'ডিগ্রি ১ম বর্ষ', 'ডিগ্রি ২য় বর্ষ', 'ডিগ্রি ৩য় বর্ষ',
  'অনার্স ১ম বর্ষ', 'অনার্স ২য় বর্ষ', 'অনার্স ৩য় বর্ষ', 'অনার্স ৪র্থ বর্ষ'
]);

export const defaultStudent = Object.freeze({
  name: 'রাইসা ইসলাম',
  nameBn: 'রাইসা ইসলাম',
  nameEn: 'Raisa Islam',
  className: 'দশম শ্রেণি',
  group: 'বিজ্ঞান বিভাগ',
  id: 'AP-1024',
  studentMobile: '01700000000',
  guardianMobile: '01800000000'
});

export const subjectInitials = Object.freeze({
  'উচ্চতর গণিত': 'গ', 'পদার্থবিজ্ঞান': 'প', 'বাংলা': 'ব',
  'রসায়ন': 'র', 'ইংরেজি': 'ই', 'মডেল টেস্ট': 'ম'
});

export const schedule = Object.freeze({
  sat: {
    date: 'শনিবার, ২১ সেপ্টেম্বর ২০২৬',
    classes: [
      { time: '০৪:৩০', period: 'বিকেল', subject: 'উচ্চতর গণিত', teacher: 'মো. সাইফুল ইসলাম', room: 'রুম ২০৩', tag: 'পরবর্তী', tone: 'green', current: true },
      { time: '০৬:০০', period: 'সন্ধ্যা', subject: 'পদার্থবিজ্ঞান', teacher: 'তানভীর আহমেদ', room: 'রুম ১০২', tag: 'ক্লাস', tone: 'blue' },
      { time: '০৭:৩০', period: 'সন্ধ্যা', subject: 'বাংলা', teacher: 'মাহমুদা আক্তার', room: 'রুম ২০৪', tag: 'ক্লাস', tone: 'purple' }
    ]
  },
  sun: {
    date: 'রবিবার, ২২ সেপ্টেম্বর ২০২৬',
    classes: [
      { time: '০৪:৩০', period: 'বিকেল', subject: 'রসায়ন', teacher: 'ফারহানা ইয়াসমিন', room: 'রুম ১০১', tag: 'ক্লাস', tone: 'orange' },
      { time: '০৬:০০', period: 'সন্ধ্যা', subject: 'ইংরেজি', teacher: 'নুসরাত জাহান', room: 'রুম ২০৩', tag: 'ক্লাস', tone: 'purple' }
    ]
  },
  mon: {
    date: 'সোমবার, ২৩ সেপ্টেম্বর ২০২৬',
    classes: [
      { time: '০৪:৩০', period: 'বিকেল', subject: 'উচ্চতর গণিত', teacher: 'মো. সাইফুল ইসলাম', room: 'রুম ২০৩', tag: 'ক্লাস', tone: 'green' },
      { time: '০৬:০০', period: 'সন্ধ্যা', subject: 'বাংলা', teacher: 'মাহমুদা আক্তার', room: 'রুম ২০৪', tag: 'ক্লাস', tone: 'purple' },
      { time: '০৭:৩০', period: 'সন্ধ্যা', subject: 'মডেল টেস্ট', teacher: 'একটিভ প্লাস একাডেমিক', room: 'পরীক্ষা হল', tag: 'টেস্ট', tone: 'orange' }
    ]
  },
  tue: {
    date: 'মঙ্গলবার, ২৪ সেপ্টেম্বর ২০২৬',
    classes: [
      { time: '০৬:০০', period: 'সন্ধ্যা', subject: 'পদার্থবিজ্ঞান', teacher: 'তানভীর আহমেদ', room: 'রুম ১০২', tag: 'ক্লাস', tone: 'blue' }
    ]
  },
  wed: {
    date: 'বুধবার, ২৫ সেপ্টেম্বর ২০২৬',
    classes: [
      { time: '০৪:৩০', period: 'বিকেল', subject: 'রসায়ন', teacher: 'ফারহানা ইয়াসমিন', room: 'রুম ১০১', tag: 'ক্লাস', tone: 'orange' },
      { time: '০৭:৩০', period: 'সন্ধ্যা', subject: 'ইংরেজি', teacher: 'নুসরাত জাহান', room: 'রুম ২০৩', tag: 'ক্লাস', tone: 'purple' }
    ]
  },
  thu: { date: 'বৃহস্পতিবার, ২৬ সেপ্টেম্বর ২০২৬', classes: [] }
});
