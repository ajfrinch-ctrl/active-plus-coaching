# Unified UX Audit ও Workflow Unification Plan (v152)

Master prompt-এর ৪৫টি ধারার ভিত্তিতে পুরো অ্যাপের অডিট। প্রতিটি দাবির পাশে সেই ফাইল/লাইন
দেওয়া আছে যেখান থেকে এটি পড়া হয়েছে — অনুমান নয়। শেষে ধাপ-ভিত্তিক পরিকল্পনা এবং
এই ধাপে যা বাস্তবায়িত হয়েছে তার টেস্ট প্রমাণ।

> **এখন পর্যন্ত যাচাইয়ের সীমা:** সব যাচাই jsdom-এ আসল পেজ + আসল মডিউল চালিয়ে
> (`npm test`, ৮১৪টি টেস্ট)। স্যান্ডবক্সে Playwright ব্রাউজার ইনস্টল নেই, তাই **আসল
> ব্রাউজারে ভিজ্যুয়াল/রেসপনসিভ যাচাই এখনও করা হয়নি** — সেটি Phase 6-এর কাজ।

---

## ১. অডিট — যা সত্যিই আছে

### ১.১ প্যানেল ও নেভিগেশন

| প্যানেল | পেজ | বটম নেভ | ভিউ রাউটিং |
|---|---|---|---|
| শিক্ষার্থী | `index.html` | `.bottom-link` × ৫ (`index.html:369`) | `js/shell.js` → `setView()`, হ্যাশ রুট |
| Admin | `admin.html` | `.admin-bottom-item` × ৫ | `data-admin-view` |
| Manager | `manager.html` | `.admin-bottom-item` × ৪ | `js/manager.js` → `renderView()`, `js/panel-route.js` |
| Teacher | `teacher.html` | `.admin-bottom-item` × ৫ | `js/teacher.js` → `setView()` |
| Payment | `payment.html` | নেই (ডেস্ক) | এক পাতা |

**অসংগতি:** একই বটম নেভিগেশন দুই ক্লাস-পরিবারে (`.bottom-link` বনাম `.admin-bottom-item`)।
চেহারা প্রায় এক, কিন্তু মার্কআপ আলাদা — তাই একটি প্যানেলে ঠিক হওয়া গড়ন অন্যটিতে নিজ
থেকে আসে না।

> **সংশোধন (v157-এ যাচাই করে):** এই লেখা আগে দাবি করেছিল “তিনটি আলাদা রাউটার
> (`js/shell.js`, `js/manager.js:63`, `js/teacher.js:237`)” — **এটি ভুল ছিল**। তিনটি স্টাফ
> প্যানেলই একই `js/panel-route.js` ইমপোর্ট করে (`js/admin.js:34`, `js/manager.js:2`,
> `js/teacher.js:6`), অর্থাৎ রাউটার একটিই। আলাদা রাউটার আছে শুধু শিক্ষার্থী অ্যাপে
> (`js/shell.js`), এবং সেটি ইচ্ছাকৃত: ওখানে Back চাপলে দেখা পেজগুলোতে ফেরা যায়
> (`pushState`), স্টাফ প্যানেলে Back মানে প্যানেল ছাড়া (`replaceState`)। তাই রাউটার
> “এক করা” বাকি কাজ নয় — বাকি ছিল শুধু নেভিগেশনের মার্কআপ, যা v157-এ হয়েছে।
(v151-এ ঠিক এটাই ঘটেছিল: নোটিফিকেশন সেটিংস তিন প্যানেলে তিন রকম ছিল)।

### ১.২ বাটন

`*.html` + `js/*.js` জুড়ে গুনে পাওয়া বাটন পরিবার:

| ক্লাস | সংখ্যা | কোথায় |
|---|---|---|
| `admin-btn primary` | ৩১ | admin/manager/teacher |
| `mini-btn` (+ `approve`/`reject`/`primary`) | ৩৯ | অনুমোদন, নোটিশ, সেটিংস |
| `admin-btn ghost` | ১৭ | admin/manager |
| `admin-btn danger` | ৪ | delete |
| `pay-tile` / `pay-back` / `dashboard-text-link` / `exam-link` / `challenge-open` / `teacher-list-more` / `learning-card-actions .primary` / `settings-row-button` | — | প্রতিটি প্যানেলের নিজস্ব |

**অসংগতি:** primary CTA কখনো `admin-btn primary`, কখনো `mini-btn primary`, কখনো
`.teaching-actions button.primary`, কখনো `dashboard-text-link`। একই কাজের (যেমন “সব দেখুন”)
তিনটি চেহারা।

### ১.৩ Confirmation

* `window.confirm` — ব্রাউজারের নিজস্ব বক্স: `js/exam-manager.js:643,666,671,672,673,674,675,676,677,683`,
  `js/manager.js:439,450`।
* নিজস্ব modal/backdrop — `js/admin.js`, `js/notice-center.js`, `js/staff-management.js`,
  `js/registration-review.js`, `js/staff-password-dialog.js`।

**অসংগতি:** একই ধরনের গুরুত্বপূর্ণ action (publish/delete/complete) কোথাও সিস্টেম ডায়ালগ,
কোথাও ব্র্যান্ডেড modal। ধারা ৩০-এর দাবির সাথে মেলে না।

### ১.৪ Empty state

সাতটি আলাদা পরিবার: `admin-empty` (৩১), `teacher-empty` (১৩), `notice-empty`, `notice-empty-art`,
`rc-preview-empty`, `empty-routine`, `dashboard-empty`, `admin-empty-search`। বেশিরভাগই শুধু
এক লাইন টেক্সট — আইকন বা action নেই (ধারা ৩১ চায় আইকন + বার্তা + action)।

**v154–v155-এ যা এক হয়েছে:** Manager (১০), Teacher (১৩), শিক্ষার্থীর হোমওয়ার্ক তালিকা,
তারপর Admin/Academic Setup/Course Editor/Learning Hub/Staff/Payment (২০) — মোট ৪৩টি খালি
তালিকা এখন `js/ui-states.js`-এর একটি কার্ডে। `admin-empty`, `teacher-empty` ও
`admin-empty-search` পরিবার তিনটি কোড থেকে উঠে গেছে; শুধু `js/notification-settings.js:99`-এর
একটি বুট-লোডিং লাইন বাকি (ওটি “খালি” নয়, “এখনো চালু হচ্ছে”)। বাকি পরিবার — `notice-empty`,
`notice-empty-art`, `rc-preview-empty`, `empty-routine`, `dashboard-empty` — এখনো বাকি।

### ১.৫ তারিখ ও ফিল্টার

* **From → To আছে শুধু এক জায়গায়:** `js/exam-manager.js:87-88` (পরীক্ষা আর্কাইভ)।
* Teacher-এর কাজের তালিকা: সার্চ + শ্রেণি + অবস্থা চিপ + ১৫টি করে পেজিং
  (`teacher.html:85-91`, `js/teacher.js:160-190`)।
* শিক্ষার্থীর “শিক্ষকের দেওয়া কাজ”: শুধু ধরনের চিপ (`index.html:317-322`) — **এই ধাপে** এখানে
  সাম্প্রতিক/সব/তারিখ ধরে + সার্চ যোগ হয়েছে।
* Dashboard: কোনো ফিল্টার নেই; পুরো তালিকাই প্যানেলে।

### ১.৬ বাড়ির কাজ (homework) workflow

* **তৈরি:** modal-এ একটি সমতল ফর্ম — `js/teacher.js:296-320` (`showEditor()` →
  `openModal()`), সব ফিল্ড একসাথে খোলা (ধারা ৩, ৭, ৮ লঙ্ঘন)।
* **অ্যাকশন:** আলাদা “Save as Draft” / “শিক্ষার্থীদের দিন” নেই; একটি `<select>` থেকে
  `draft|published` (`js/teacher.js:313`)।
* **Status:** মাত্র `draft|published` (`js/teaching-data.js:47`) + শিক্ষার্থী-প্রতি
  `pending|done|reviewed` (`js/teaching-data.js:80`)। ধারা ১৩-এর `Assigned/Viewed/Submitted`
  নেই; শিক্ষার্থীর “কাজ সম্পন্ন হয়েছে জানাও” বোতামটি নিজেই বলে দেয় এটি জমা নয়
  (`js/student-teaching.js:42`)।
* **Template নেই** (ধারা ৯), **Student Preview নেই** (ধারা ১০), **শিক্ষকের জন্য PDF নেই**
  (ধারা ১৪) — শিক্ষার্থী পায় `js/material-pdf.js` → `activitySheetPDF`।
* **শিক্ষার্থী নির্বাচন:** বাড়ির কাজে নেই (শ্রেণি + বিভাগ ধরে সবাই); নম্বর/উপস্থিতির জন্য
  আলাদা একটি progress modal (`js/teacher.js:367`)।

### ১.৭ পরীক্ষা (exam) workflow

এটি সম্পূর্ণ আলাদা একটি সিস্টেম: `js/exam-core.js`, `exam-data.js`, `exam-ui.js`,
`exam-manager.js`, `exam-pdf.js`, `question-bank.js`, `exam-archive.js`।

* আছে: Exam Code, প্রশ্ন ব্যাংক, প্রশ্ন parse preview (`js/exam-manager.js:450-456`),
  draft → pending → approved → published → completed → archived, তারিখ/সময়/সময়কাল,
  Manager অনুমোদন, PDF, আর্কাইভ/ফেরত/ডুপ্লিকেট (`js/exam-manager.js:671-683`)।
* নেই: **শিক্ষার্থীর চোখে preview** (যা আছে তা প্রশ্ন-parse প্রিভিউ), “এখন নাও / পরে নাও”
  এক জায়গায় পরিষ্কার দুই অ্যাকশন, এবং homework-এর সাথে মিল রেখে একই step ভাষা।
* শিক্ষার্থীর দিক: সময় অনুযায়ী বোতাম বদলায় (`js/student-exams.js:29`) — কিন্তু
  “আসন্ন / এখন দেওয়া যাবে / সম্পন্ন” আলাদা গ্রুপ হিসেবে নেই (ধারা ২৪)।

**মূল অসংগতি:** একই অ্যাপে দুটি content-creation সিস্টেম — একটি modal+select, অন্যটি
step+bank+archive। ধারা ৪৪ ঠিক এটাই নিষেধ করেছে।

### ১.৮ নোটিশ

প্রকাশ ও ইনবক্স চলে `js/notice-center.js`-এর modal-এ; সেখানে **draft অবস্থা নেই**
(ফাইলটিতে কোনো draft state পাওয়া যায়নি)। ধারা ৩৮ চায় নোটিশও খসড়া হিসেবে রাখা।

### ১.৯ ডেটা-স্তরের একটি আসল সমস্যা — ✅ v158-এ ঠিক হয়েছে

শিক্ষার্থীর অ্যাপ শিক্ষকের কাজ পড়ে `teachingRepository.list()` দিয়ে
(`js/student-teaching.js`, `js/student-dashboard.js`), আর সেই মেথডটি ফেরত দেয়
**শিক্ষক-সীমিত** snapshot:

```js
// js/teaching-data.js:130
async list() { return teacherSnapshot(readData()); }
// js/teaching-data.js:101
activities.filter(a => a.teacherId === DEMO_TEACHER.id && isTeacherAssigned('teacher.apc', a.className, a.group))
```

অর্থাৎ একটি ডিভাইসে শিক্ষার্থী তখনই বাড়ির কাজ দেখবে, যখন সেই ডিভাইসে `teacher.apc`-এর
assignment রেকর্ডও থাকে। শিক্ষার্থীর নিজের ফোনে এটি নাও থাকতে পারে — তখন প্রকাশিত কাজ
দেখা যাবে না। `studentSnapshot()` (`js/teaching-data.js:104`) তৈরি আছে কিন্তু শুধু
`markHomeworkDone`-এ ব্যবহৃত। **এটি UI নয়, ডেটা-দৃশ্যমানতার বাগ** — Phase 2-এর আগে ঠিক
করা উচিত, কারণ শিক্ষার্থীর homework অভিজ্ঞতা এর ওপরেই দাঁড়িয়ে আছে।

**v158-এ যা করা হয়েছে:** প্রথমে বাগটি প্রমাণ করা হয়েছে, অনুমানে নয়। আসল `index.html`
দুবার বুট করে — একই seed, শুধু একটি জিনিস বদলে (ডিভাইসে `teacher.apc`-এর assignment
রেকর্ড আছে কি নেই):

| ডিভাইসে assignment রেকর্ড | প্রকাশিত কাজ আছে | প্যানেলে দেখা গেছে |
|---|---|---|
| আছে | হ্যাঁ | ১টি সারি |
| **নেই** | হ্যাঁ | **০টি সারি** ← বাগ |

তারপর সমাধান: `teachingRepository.listForStudent(student)` যোগ হয়েছে, যেটি
`studentSnapshot()` ব্যবহার করে (প্রকাশিত + এই শিক্ষার্থীর class/group)। শিক্ষার্থীর দুটি
পড়ার জায়গা (`js/student-dashboard.js`, `js/student-teaching.js`) এখন এটি ব্যবহার করে;
শিক্ষক প্যানেল আগের মতো `list()`-এই আছে, কারণ কোন শিক্ষক কোন ক্লাস *পরিচালনা* করতে
পারেন তা এখনো যাচাই হওয়া দরকার।

ঠিক করার পর একই দুই কেসই ১টি সারি দেখায়। `tests/student-datapath.test.mjs` (৩টি) এটি
আটকে রাখে — তৃতীয় টেস্টটি নিশ্চিত করে যে সমাধানটি অতিরিক্ত কিছু খুলে দেয়নি: অন্য
শ্রেণি, অন্য বিভাগ ও খসড়া কাজ আগের মতোই লুকানো থাকে।

---

## ২. Unified Design System — একটি মাত্র স্পেসিফিকেশন

একটি উপাদান = একটি ক্লাস-পরিবার = একটি আচরণ। নতুন কোড শুধু এগুলোই ব্যবহার করবে; পুরোনো
পরিবারগুলো ধাপে ধাপে এদের দিকে আসবে (একসাথে নয়, যাতে ৮০২টি টেস্ট একবারে না ভাঙে)।

| উপাদান | একটিমাত্র রূপ | অবস্থা |
|---|---|---|
| Header/টপবার | `.app-topbar` (সব প্যানেলে আছে) | ✅ আছে |
| পাতার শিরোনাম + ব্যাক | `.page-intro` + `.pay-back` | ✅ আছে (v151-এ নিয়ম করা: সাব-পেজের ব্যাক তার মালিক পাতায়) |
| বটম নেভ | প্রতিটি ট্যাবে `.nav-chip` + `.nav-label`, একটি `aria-current` | ✅ **v157-এ হয়েছে** |
| Primary CTA | `.admin-btn primary` (ফুল-উইডথ হলে `.is-block`) | ⏳ Phase 2 |
| Secondary | `.admin-btn ghost` | ⏳ Phase 4 |
| ছোট অ্যাকশন | `.mini-btn` (+ `approve`/`reject`/`primary`) | ✅ আছে |
| কার্ড | `.admin-card` / `.teaching-card` / `.learning-card` | ⏳ Phase 4 (টোকেন এক, মার্জআপ আলাদা) |
| ইনপুট/ড্রপডাউন/তারিখ | `.field` + native input | ✅ আছে |
| **ফিল্টার বার** | `.scope-bar` (সাম্প্রতিক / সব / তারিখ ধরে + From → To) | ✅ **এই ধাপে যোগ হয়েছে** |
| **Empty state** | `.apc-empty` (আইকন + শিরোনাম + বার্তা + action) | ✅ **এই ধাপে যোগ হয়েছে** |
| Confirmation | `.apc-confirm` (`বাতিল | অ্যাকশন`, ধ্বংসাত্মক কাজে লাল) | ✅ **v153-এ হয়েছে** |
| Toast | `.admin-toast` / `showFeedback()` | ✅ আছে |
| Status badge | `.apc-status` (draft/scheduled/live/…) | ⏳ Phase 2-3 |
| Draft indicator | `.teaching-status.draft` | ✅ আংশিক |
| PDF বোতাম | `Download PDF` একই ক্লাসে | ⏳ Phase 5 |
| Preview | `.apc-preview` — শিক্ষার্থীর আসল কার্ড মার্জআপই রি-ইউজ | ⏳ Phase 2 |

সব রং/spacing/radius শুধু `css/foundation.css`-এর টোকেন থেকে (এই নিয়ম আগে থেকেই আছে ও
টেস্টে ধরা পড়ে)। নতুন CSS-ও তাই করেছে: `css/ui-features.css`-এর নতুন ব্লকে কোনো নতুন রং নেই।

---

## ৩. Unified Workflow — সব content-এর জন্য একটি পথ

```
DASHBOARD  → শুধু সর্বশেষ + গুরুত্বপূর্ণ (সীমিত সংখ্যা)
PANEL      → সম্পূর্ণ তালিকা, ডিফল্ট = সাম্প্রতিক
FILTER     → সব / তারিখ ধরে (From → To) / সার্চ
ADD        → ফুল-স্ক্রিন তৈরির পাতা (modal নয়)
FORM       → গ্রুপ-ভিত্তিক: Basic → Content → Students → Status (প্রয়োজনে খোলে)
PREVIEW    → শিক্ষার্থীর চোখে হুবহু
DECIDE     → Save as Draft  |  Publish / Assign / Start / Schedule
STATUS     → badge একই ভাষায়
HISTORY    → প্যানেলের ভেতরে, কখনো dashboard-এ নয়
```

**তথ্যের ঘনত্ব (ধারা ৩, ৩৫):** ফর্মে শুধু আবশ্যিক ফিল্ড খোলা; বাকি সব `<details>`/accordion-এ।
**তারিখের নিয়ম (ধারা ৪):** ডিফল্ট = সাম্প্রতিক; পুরোনো তথ্য = From → To; “সব” সবসময় ফিরিয়ে আনে।
**Preview-first (ধারা ৩৯):** যে content শিক্ষার্থীর কাছে যাবে, প্রকাশের আগে প্রিভিউ বাধ্যতামূলক।

---

## ৪. ধাপ-ভিত্তিক পরিকল্পনা

| ধাপ | কী হবে | ধারা | ঝুঁকি |
|---|---|---|---|
| **0 — সম্পন্ন (v151)** | নোটিফিকেশন সেটিংস তিন প্যানেলে সেটিংসের ভেতরে | ২, ৩৩ | কম |
| **1 — সম্পন্ন (v152)** | সাম্প্রতিক-ডিফল্ট + From/To + সার্চ (শিক্ষার্থী dashboard ও panel), একটি empty state, একটি ফিল্টার বার | ৪, ৫, ৬, ২৫, ২৮, ৩১ | কম |
| **2** | ~~শিক্ষার্থীর ডেটা-পথ ঠিক করা (১.৯)~~ ✅ v158 · ~~Student Preview (§১০, ৩৯)~~ ✅ v159 · ~~status badge (§১৩)~~ ✅ v160 · ~~শিক্ষকের PDF (§১৪, ৪০)~~ ✅ v161 · ~~ফুল-স্ক্রিন Create পাতা + Step ১/২ (§৭–৯)~~ ✅ v162 · ~~খসড়া বনাম “শিক্ষার্থীদের দিন” (§১১)~~ ✅ v162 → বাকি **Homework**: ফুল-স্ক্রিন Create পাতা, Step ১/২, টেমপ্লেট, খসড়া বনাম "শিক্ষার্থীদের দিন", গ্রুপ-ওয়াইজ নির্বাচন, status badge, PDF |
| **3** | **Exam** একই প্যাটার্নে: step-based create, Student Preview, “এখন নাও / পরে নাও”, একই status ভাষা, শিক্ষার্থীর আসন্ন/চলমান/সম্পন্ন গ্রুপ | ১৬–২৪ | মাঝারি |
| **4 — সম্পন্ন (v153–v157)** | গ্লোবাল কম্পোনেন্ট: একটি confirmation modal (v153), একটি empty state (v154–v155), এক বাটন স্কেল (v156), এক বটম নেভ (v157) | ২, ২৯, ৩০, ৩৩, ৩৪ | বেশি (সব প্যানেল ছোঁয়) |
| **5** | নোটিশ/অ্যাসাইনমেন্ট/ফলাফল/রিপোর্ট একই প্যাটার্নে, ইউনিভার্সাল সার্চ, এক PDF বোতাম | ২৭, ৩৮, ৪০ | মাঝারি |
| **6** | মোবাইল/ট্যাবলেট/ডেস্কটপ পাস + offline/sync রিগ্রেশন + ২০-দফা acceptance চেকলিস্ট | ৩২, ৪১, ৪২, ৪৫ | কম (কিন্তু ব্রাউজার লাগবে) |

প্রতিটি ধাপ শেষে `npm test` সবুজ থাকতে হবে; ডেটা মডেল বদলালে migration সহ
(পুরোনো রেকর্ড যেন পড়া যায় — `js/teaching-data.js:74-90` এর validation যেন না ভাঙে)।

---

## ৫. এই ধাপে (v152) যা বাস্তবায়িত হয়েছে

**নতুন মডিউল `js/latest-scope.js`** — “সাম্প্রতিক কত দিন”-এর একমাত্র সংজ্ঞা + একটি ফিল্টার বার:

* `recencyDay()` — রেকর্ডের নিজের তারিখ, না থাকলে শেষ সম্পাদনার দিন (একাডেমিক নোটিশের নিজস্ব
  তারিখ নেই, তাই এই fallback দরকার)।
* `latestScope(days)` / `rangeScope(from, to)` / `ALL_SCOPE`, `inScope()`, `applyScope()`,
  `byRecency()`, `scopeNote()` (বাংলা সংখ্যায় “আরও Nটি পুরোনো” লাইন)।
* `initScopeBar()` — সাম্প্রতিক / সব / তারিখ ধরে চিপ + From → To + “দেখুন”। খালি বা ভুল
  তারিখ **কখনো তথ্য লুকায় না**: তখন রেঞ্জ খোলা ও অসীমিত থাকে (টেস্টে বাঁধা)।
* শেল: `sw.js`-এর precache-এ যোগ হয়েছে, তাই অফলাইনেও চলবে।

**শিক্ষার্থীর হোম (`index.html`, `js/student-dashboard.js`):** নতুন “সাম্প্রতিক বাড়ির কাজ”
সেকশন — সর্বশেষ ৩ দিন, সর্বোচ্চ ৩ সারি; প্রতি সারিতে বিষয়, শিরোনাম, শিক্ষক, দেওয়ার তারিখ,
জমার শেষ সময় ও status badge; নিচে “সব বাড়ির কাজ দেখুন” → সরাসরি homework প্যানেল।

**শিক্ষার্থীর প্যানেল (`js/student-teaching.js`):** ডিফল্ট = সাম্প্রতিক ৭ দিন; ফিল্টার বার +
সার্চ (বিষয়/শিক্ষক/শিরোনাম); রুটিন বোর্ড, ফলাফল বোর্ড ও মোট গণনা আগের মতোই সব রেকর্ড ধরে —
তাই সামনের ক্লাস কখনো লুকায় না। ফাঁকা ফলে নতুন `.apc-empty` + “সব কাজ দেখুন”।

## ৬. v153 — Confirmation এক করা (Phase 4-এর প্রথম অংশ)

`js/confirm-dialog.js` এখন পুরো অ্যাপের একমাত্র নিশ্চিতকরণ: `js/exam-manager.js`-এর ১০টি
ও `js/manager.js`-এর ৩টি `window.confirm` সরানো হয়েছে (অ্যাপে আর একটিও নেই)। নিয়ম:
শুধু অ্যাকশন বাটনে “হ্যাঁ”; ×/Escape/বাইরে চাপা = “না”; উত্তরহীন প্রশ্নের কাজ কখনো চলে না;
দুটি প্রশ্ন জমে না। টেস্ট `tests/confirm-dialog.test.mjs` (৪টি) — শেষ টেস্টটি আসল
`manager.html` বুট করে নোটিশ মুছতে গিয়ে দেখে যে ব্রাউজার ডায়ালগ নয়, এই কার্ডই উঠছে।

## ৭. v154 — Empty state এক করা (Phase 4-এর দ্বিতীয় অংশ)

`js/ui-states.js` → `emptyState({ icon, title, message, button })`। Manager প্যানেলের ১০টি,
Teacher প্যানেলের ১৩টি ও শিক্ষার্থীর হোমওয়ার্ক তালিকার খালি অবস্থা এখন এই একটি কার্ড
(`.apc-empty`): আইকন + এক লাইন + ব্যাখ্যা + প্রয়োজনে অ্যাকশন। ফিল্টারের কারণে ফাঁকা হলে
কার্ডে `[data-empty-action="show-all"]` বাটন থাকে, তাই “কিছু নেই” আর “লুকানো আছে” এক
রকম দেখায় না। লেখাগুলো অপরিবর্তিত — শুধু গড়ন এক হয়েছে।

## ৮. v156 — বাটন স্কেল এক করা (Phase 4-এর তৃতীয় অংশ)

`css/foundation.css` এখন বাটনের একমাত্র মাপ ঘোষণা করে:
`--btn-xs 32 / --btn-sm 38 / --btn-md 44 / --btn-lg 50`, `--btn-radius`, `--btn-border`,
`--btn-font`। `ui-forms.css` (ভিত্তি), `ui-auth.css`, `academics.css`, `course-hub.css`,
`app-polish.css`, `ui-features.css`, `notifications.css` ও শেষে `ui-wallet.css` — সবাই সেই
টোকেন ধারে। আগে একই বাটন ৪২/৪৪/৪৮/৫০px আর ৯/১০/১৩/৯৯৯px কোণায় আঁকা হতো।

`tests/button-scale.test.mjs` ধরে রাখে: স্কেল একবারই ঘোষিত, মাপগুলো ঊর্ধ্বক্রমে, ৩২px-এর
নিচে নয়, এবং কোনো বাটন নিয়ম নিজের সংখ্যা বসালে টেস্ট ফেল করে।

## ৯. v157 — বটম নেভিগেশন এক করা (Phase 4-এর শেষ অংশ)

চার পোর্টালের নেভ একই গড়নে এলো। আগে শিক্ষার্থী (`index.html`) ও Teacher (`teacher.html`)
ট্যাবের লেখা ছিল খালি `<span>`, যেটি চলত শুধু CSS-এর `> span:not(.nav-chip)` বিশেষ
নিয়মে; আর Manager-এর সক্রিয় ট্যাবে `aria-current="page"` ছিল না, তাই স্ক্রিন রিডার
বুঝত না কোন পেজ খোলা। এখন:

* চারটি পোর্টালের প্রতিটি ট্যাবে `.nav-chip` (আইকন) + `.nav-label` (লেখা)
* প্রতিটি বারে ঠিক একটি `aria-current="page"`, এবং সেটিই `.active`
* `css/ui-wallet.css`-এ একটি নিয়মই চারটি বারের লেখা সামলায়; `:not(.nav-chip)`
  ওয়ার্কঅ্যারাউন্ড মুছে গেছে

`tests/bottom-nav.test.mjs` (৫টি) চারটি পোর্টালের আসল মার্কআপ পড়ে এই গড়ন ধরে রাখে।

**Phase 4-এ বাকি:** শুধু বাকি empty-state পরিবার (`notice-empty`/`notice-empty-art`,
`rc-preview-empty`, `dashboard-empty-card`) — এগুলো নিজস্ব আর্ট/কার্ড গড়ন ব্যবহার করে,
তাই আলাদা সিদ্ধান্ত চাই।

**টেস্ট:** `tests/latest-scope.test.mjs` (৮টি) — বিশুদ্ধ নিয়ম + আসল `index.html` বুট করে
dashboard ও প্যানেল দুটোই চালানো। পুরো suite (v156-এ): **৮১৪টি টেস্ট, ৮১৪ পাস**।

এই ধাপে ইচ্ছাকৃতভাবে যা করা হয়নি: শিক্ষকের তৈরির workflow, status শব্দভাণ্ডার বদল, exam
রি-ওয়ার্ক — সেগুলো Phase 2-3, কারণ সেখানে চলমান ডেটা মডেল ছোঁয়া লাগবে।
