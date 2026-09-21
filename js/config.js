/* Shared application configuration. Future admin data can replace these local defaults. */
export const APP_TAGLINE = 'শিখতে থাকো, এগিয়ে যাও';

export const STORAGE_KEYS = Object.freeze({
  student: 'active-plus-student-v1',
  account: 'active-plus-account-v1',
  session: 'active-plus-session-v1',
  installDismissed: 'active-plus-install-dismissed',
  idSequence: 'active-plus-id-sequence',
  weather: 'active-plus-weather-v1',
  exams: 'active-plus-exams-v1',
  admin: 'active-plus-admin-v1'
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

/* Exam module defaults. `answer` is a salted hash of the correct option text
 * (see tools/answer-hash.mjs), never the text itself, so an offline question
 * bank does not hand out the key. Written answers stay on the device until the
 * Admin Panel publishes the teacher's marks. */
export const exams = Object.freeze([
  {
    id: 'math-weekly-09',
    subject: 'উচ্চতর গণিত',
    title: 'গণিত সাপ্তাহিক টেস্ট',
    scope: 'বীজগণিত · সমীকরণ ও ধারা',
    teacher: 'মো. সাইফুল ইসলাম',
    date: '২১ সেপ্টেম্বর ২০২৬',
    startsAt: null,
    endsAt: null,
    minutes: 12,
    passPercent: 50,
    instructions: 'প্রতিটি প্রশ্নে একটি উত্তর বাছো। সময় শেষ হলে উত্তর স্বয়ংক্রিয়ভাবে জমা হয়।',
    questions: [
      {
        id: 'q1',
        type: 'mcq',
        marks: 2,
        prompt: '২x + ৫ = ১৩ হলে x এর মান কত?',
        options: ['৩', '৪', '৫', '১৩'],
        answer: '0x2jwjsvd1v9s',
        explanation: '২x = ১৩ − ৫ = ৮, অতএব x = ৮ ÷ ২ = ৪।'
      },
      {
        id: 'q2',
        type: 'mcq',
        marks: 2,
        prompt: 'x² − ৫x + ৬ = ০ সমীকরণের মূলদ্বয়ের গুণফল কত?',
        options: ['৫', '৬', '−৫', '−৬'],
        answer: '1dcpk3uqlbuo2',
        explanation: 'আকার ax² + bx + c = ০ এ মূলদ্বয়ের গুণফল c ÷ a = ৬ ÷ ১ = ৬।'
      },
      {
        id: 'q3',
        type: 'mcq',
        marks: 2,
        prompt: 'log₁₀ ১০০ এর মান কত?',
        options: ['১', '২', '১০', '১০০'],
        answer: '0fy1z5ycya5u6',
        explanation: '১০০ = ১০², তাই log₁₀ ১০০ = ২।'
      },
      {
        id: 'q4',
        type: 'mcq',
        marks: 2,
        prompt: '৩, ৬, ১২, ২৪ … ধারাটির সাধারণ অনুপাত কত?',
        options: ['২', '৩', '৪', '৬'],
        answer: '0fy1z5ycya5u6',
        explanation: 'প্রতিটি পদ আগের পদের ২ গুণ (৬ ÷ ৩ = ২), সুতরাং সাধারণ অনুপাত ২।'
      },
      {
        id: 'q5',
        type: 'mcq',
        marks: 2,
        prompt: 'একটি সমকোণী ত্রিভুজের লম্ব ৮ একক ও ভূমি ৬ একক হলে অতিভুজ কত?',
        options: ['৯', '১০', '১২', '১৪'],
        answer: '1f03i0z1lo6vim',
        explanation: 'অতিভুজ² = ৮² + ৬² = ৬৪ + ৩৬ = ১০০, অতএব অতিভুজ = ১০।'
      },
      {
        id: 'q6',
        type: 'written',
        marks: 4,
        prompt: '২x² − ৭x + ৩ = ০ সমীকরণটি উৎপাদকে বিশ্লেষণ করে মূলদ্বয় নির্ণয় করো।',
        checkpoints: [
          'মধ্যপদ দুই ভাগে ভাগ করা (−৬x ও −১x)',
          'উৎপাদক রূপ: (২x − ১)(x − ৩)',
          'মূল দুটি স্পষ্টভাবে লেখা: x = ১/২ ও x = ৩',
          'একটি মূল যাচাই করে দেখানো'
        ]
      }
    ]
  },
  {
    id: 'physics-ch04-02',
    subject: 'পদার্থবিজ্ঞান',
    title: 'পদার্থবিজ্ঞান অধ্যায়ভিত্তিক মূল্যায়ন',
    scope: 'অধ্যায় ২ ও ৩ · গতি ও বল',
    teacher: 'তানভীর আহমেদ',
    date: '২৩ সেপ্টেম্বর ২০২৬',
    startsAt: null,
    endsAt: null,
    minutes: 15,
    passPercent: 45,
    instructions: 'এই পরীক্ষায় ৬টি বহুনির্বাচন ও ১টি লিখিত প্রশ্ন আছে। লিখিত উত্তর নিজের ভাষায় লেখো।',
    questions: [
      {
        id: 'q1',
        type: 'mcq',
        marks: 2,
        prompt: 'প্রারম্ভিক বেগ u, সমত্বরণ a এবং সময় t হলে শেষ বেগের সূত্র কোনটি?',
        options: ['v = u + at', 'v = u − at', 'v = at − u', 'v = u + a/t'],
        answer: '0ozb6a83ki5ns',
        explanation: 'গতির প্রথম সমীকরণ: v = u + at।'
      },
      {
        id: 'q2',
        type: 'mcq',
        marks: 2,
        prompt: '১ নিউটন কত ডাইনের সমান?',
        options: ['১০³ ডাইন', '১০⁵ ডাইন', '১০⁷ ডাইন', '১০² ডাইন'],
        answer: '094b9l0705usl',
        explanation: '১ N = ১০⁵ ডাইন (১ kg·m/s² = ১০⁵ g·cm/s²)।'
      },
      {
        id: 'q3',
        type: 'mcq',
        marks: 2,
        prompt: 'তড়িৎ প্রবাহের SI একক কোনটি?',
        options: ['ভোল্ট', 'ওহম', 'অ্যাম্পিয়ার', 'ওয়াট'],
        answer: 'n9o070103dzbn',
        explanation: 'তড়িৎ প্রবাহের একক অ্যাম্পিয়ার (A); ভোল্ট বিভব পার্থক্যের, ওহম রোধের একক।'
      },
      {
        id: 'q4',
        type: 'mcq',
        marks: 2,
        prompt: 'কাজের SI একক কোনটি?',
        options: ['নিউটন', 'জুল', 'পাস্ক', 'ওয়াট'],
        answer: '1115a5j1u22ib1',
        explanation: 'কাজ = বল × সরণ = ১ N·m = ১ জুল (J)।'
      },
      {
        id: 'q5',
        type: 'mcq',
        marks: 2,
        prompt: 'শুদ্ধ পানির ঘনত্ব প্রায় কত?',
        options: ['১০০ kg/m³', '১০০০ kg/m³', '১৩৬০০ kg/m³', '১০০০০ kg/m³'],
        answer: '1dycvei10oqoaj',
        explanation: 'পানির ঘনত্ব ১০০০ kg/m³; ১৩৬০০ kg/m³ হলো পা পারদের।'
      },
      {
        id: 'q6',
        type: 'mcq',
        marks: 2,
        prompt: 'বস্তুর জড়তার পরিমাপ কোন রাশি?',
        options: ['বেগ', 'ভর', 'ত্বরণ', 'ওজন'],
        answer: '47olh71ph4itv',
        explanation: 'ভরই জড়তার পরিমাপ; ওজন মহাকর্ষজনিত বল, তাই স্থানভেদে বদলায়।'
      },
      {
        id: 'q7',
        type: 'written',
        marks: 5,
        prompt: 'নিউটনের দ্বিতীয় সূত্র থেকে F = ma সমীকরণটি প্রতিপাদন করো এবং বলের একক নির্ণয় করো।',
        checkpoints: [
          'সূত্রের বিবৃতি: ভরবেগের পরিবর্তনের হার প্রযুক্ত বলের সমানুপাতিক',
          'সম্মানিত ধ্রুবক K = ১ ধরে F ∝ dp/dt লেখা',
          'p = mv বসিয়ে F = m(dv/dt) = ma পাওয়া',
          'একক: ১ N = ১ kg·m/s²',
          'প্রয়োগের একটি ছোট উদাহরণ'
        ]
      }
    ]
  },
  {
    id: 'math-class-test-22',
    subject: 'উচ্চতর গণিত',
    title: 'উচ্চতর গণিত ক্লাস টেস্ট',
    scope: 'সূচক, বীজগাণিতিক রাশি ও প্রতিশত',
    teacher: 'মো. সাইফুল ইসলাম',
    date: '২২ সেপ্টেম্বর ২০২৬ · বিকাল ৪:৩০',
    startsAt: '2026-09-22T16:30:00+06:00',
    endsAt: '2026-09-22T21:00:00+06:00',
    minutes: 10,
    passPercent: 50,
    instructions: 'নোটিশে দেওয়া ক্লাস টেস্টটি এই সময়ের মধ্যে দিতে হবে। শুরু হওয়ার আগে পর্যন্ত প্রশ্ন দেখা যাবে না।',
    questions: [
      {
        id: 'q1',
        type: 'mcq',
        marks: 2,
        prompt: '(a + b)² এর বিস্তৃতি কোনটি?',
        options: ['a² + b²', 'a² + 2ab + b²', 'a² − 2ab + b²', '2a² + 2b²'],
        answer: '15xne3k1mc2qy',
        explanation: '(a + b)² = a² + 2ab + b²।'
      },
      {
        id: 'q2',
        type: 'mcq',
        marks: 2,
        prompt: 'x − ১/x = ৩ হলে x² + ১/x² এর মান কত?',
        options: ['৬', '৯', '১১', '১২'],
        answer: '0sq19marrthk6',
        explanation: '(x − ১/x)² = ৯ ⇒ x² + ১/x² − ২ = ৯ ⇒ x² + ১/x² = ১১।'
      },
      {
        id: 'q3',
        type: 'mcq',
        marks: 2,
        prompt: '১০০০ টাকার একটি বস্তু ২০% ছাড়ে বিক্রয়মূল্য কত?',
        options: ['২০০ টাকা', '৮০০ টাকা', '৮২০ টাকা', '৯০০ টাকা'],
        answer: '1yjxo9sd23pfq',
        explanation: 'ছাড় ১০০০ × ২০% = ২০০ টাকা, বিক্রয়মূল্য ১০০০ − ২০০ = ৮০০ টাকা।'
      },
      {
        id: 'q4',
        type: 'mcq',
        marks: 2,
        prompt: 'একটি ত্রিভুজের একটি কোণ ৬০° এবং বাকি দুটি কোণ সমান হলে প্রতিটি কোণ কত?',
        options: ['৪০°', '৬০°', '৭০°', '৮০°'],
        answer: 'ulb3u81xe0dhf',
        explanation: 'বাকি দুই কোণের সমষ্টি ১৮০° − ৬০° = ১২০°, প্রতিটি ১২০° ÷ ২ = ৬০°।'
      },
      {
        id: 'q5',
        type: 'written',
        marks: 3,
        prompt: 'ল.সা.গু পদ্ধতিতে x² + ৫x + ৬ = ০ সমীকরণটি সমাধান করো।',
        checkpoints: [
          '৬ কে এমন দুটি সংখ্যায় ভাগ করা (২ ও ৩) যাদের যোগফল ৫',
          'উৎপাদক রূপ (x + ২)(x + ৩) = ০',
          'মূল: x = −২ ও x = −৩'
        ]
      }
    ]
  },
  {
    id: 'chemistry-model-08',
    subject: 'রসায়ন',
    title: 'রসায়ন মডেল টেস্ট',
    scope: 'পর্যায় সারণি ও রাসায়নিক বিক্রিয়া',
    teacher: 'ফারহানা ইয়াসমিন',
    date: '১৫ সেপ্টেম্বর ২০২৬',
    startsAt: '2026-09-10T10:00:00+06:00',
    endsAt: '2026-09-15T20:00:00+06:00',
    minutes: 8,
    passPercent: 40,
    instructions: 'এই পরীক্ষার সময় শেষ। জমা দেওয়া উত্তর ও প্রকাশিত নম্বর ফলাফল সেকশনে দেখা যাবে।',
    questions: [
      {
        id: 'q1',
        type: 'mcq',
        marks: 2,
        prompt: 'আধুনিক পর্যায় সারণিতে মোট কতটি পর্যায় (period) আছে?',
        options: ['৭', '৮', '১৬', '১৮'],
        answer: '1veu3yz1jtzh1l',
        explanation: 'পর্যায় সারণিতে ৭টি পর্যায় ও ১৮টি গ্রুপ আছে।'
      },
      {
        id: 'q2',
        type: 'mcq',
        marks: 2,
        prompt: 'সোডিয়ামের রাসায়নিক প্রতীক কোনটি?',
        options: ['So', 'S', 'Na', 'Sd'],
        answer: '02zqm2bceqo7z',
        explanation: 'সোডিয়াম = Na (ল্যাটিন natrium); S হলো গন্ধক।'
      },
      {
        id: 'q3',
        type: 'mcq',
        marks: 2,
        prompt: 'অ্যাসিড দ্রবণে নীল লিটমাস কাগজের রঙ কী হয়?',
        options: ['লাল', 'নীল', 'বেগুনি', 'পরিবর্তন হয় না'],
        answer: '18i7yz81qumrg4',
        explanation: 'অ্যাসিড নীল লিটমাসকে লাল করে; ক্ষারক লাল লিটমাসকে নীল করে।'
      },
      {
        id: 'q4',
        type: 'written',
        marks: 4,
        prompt: 'আয়নিক ও সমযোজী বন্ধনের মধ্যে চারটি পার্থক্য লেখো।',
        checkpoints: [
          'ইলেকট্রন স্থানান্তন বনাম ইলেকট্রন শেয়ার',
          'ধাতু–অধাতু বনাম অ-ধাতু–অ-ধাতুর মধ্যে গঠন',
          'গলনাঙ্ক/স্ফুটনাঙ্ক বেশি বনাম কম',
          'জলীয় দ্রবণে পরিবাহিতা আছে বনাম নেই'
        ]
      }
    ]
  }
]);

export const examSubjectTones = Object.freeze({
  'উচ্চতর গণিত': 'green',
  'পদার্থবিজ্ঞান': 'blue',
  'রসায়ন': 'yellow',
  'বাংলা': 'purple',
  'ইংরেজি': 'coral'
});
