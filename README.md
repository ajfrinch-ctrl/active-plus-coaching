# Active Plus Coaching — শিক্ষার্থী অ্যাপ

**Fixed tagline:** “শিখতে থাকো, এগিয়ে যাও”

Active Plus Coaching-এর মোবাইল-ফার্স্ট Progressive Web App (PWA)। Chrome থেকে ইনস্টল করে অ্যাপের মতো ব্যবহার করা যায়। এই ধাপে শিক্ষার্থী অংশটি তৈরি করা হয়েছে এবং সব ডেটা লোকাল ডিভাইসে থাকে—কোনো সার্ভার বা API-এর উপর নির্ভর করে না।

## এই ধাপে যা আছে

- অফলাইন লগইন পেজ — মোবাইল নম্বর ও ৪–৬ সংখ্যার PIN
- স্থানীয় Noto Sans Bengali variable font; অ্যাপেই preload ও offline cache করা আছে, ভবিষ্যতের offline PDF export-এর জন্য প্রস্তুত
- ধাপে ধাপে শিক্ষার্থী self-registration; শিক্ষক/এডমিন account management-এর ডেমো রূপ “শিক্ষার্থী এপ ম্যানেজমেন্ট” প্যানেলে আছে (নিচে দেখুন)
- Login-এর মোবাইল নম্বরই যোগাযোগের নম্বর হিসেবে fixed থাকে এবং registration-এর যোগাযোগ ধাপে read-only দেখায়
- বাংলা ও ইংরেজি নাম, অভিভাবক, জন্মতারিখ, লিঙ্গ, মোবাইল, পূর্ণ ঠিকানা, ক্লাস, গ্রুপ ও ঐচ্ছিক শিক্ষা তথ্য
- নিরাপত্তা প্রশ্নের মাধ্যমে PIN পুনরুদ্ধার; ভবিষ্যতে এডমিন PIN reset করতে পারবেন
- ৮ম শ্রেণি থেকে অনার্স ৪র্থ বর্ষ পর্যন্ত enabled class তালিকা
- রেজিস্ট্রেশনের পরে স্বয়ংক্রিয় ইউনিক Student ID — বছর, মাস, class code ও sequence
- অনুমোদনের আগেও লগইন করা যাবে, কিন্তু pending account-এ শিক্ষার্থী ফিচার ব্যবহার করতে পারবে না
- শিক্ষার্থীর অফলাইন হোম ড্যাশবোর্ড
- সাপ্তাহিক অগ্রগতি, উপস্থিতি, গড় ফলাফল ও বাকি কাজ
- ক্লাস রুটিন — দিনভিত্তিক ফিল্টারসহ
- চলমান কোর্স ও অধ্যায়ভিত্তিক অগ্রগতি
- সাম্প্রতিক পরীক্ষার ফলাফল
- পরীক্ষা মডিউল — শিক্ষার্থী নিজেই অফলাইনে পরীক্ষা দিতে পারে (MCQ ও লিখিত)
- ঘড়িসহ পরীক্ষা রানার: প্রতিটি উত্তর সঙ্গে সঙ্গে লোকালস্টোরেজে সংরক্ষিত হয়, ট্যাব বন্ধ করলেও উত্তর হারায় না; সময় শেষ হলে স্বয়ংক্রিয় জমা
- জমার পরপরই MCQ অংশের স্বয়ংক্রিয় স্কোর, প্রতিটি প্রশ্নের ব্যাখ্যাসহ উত্তর পর্যালোচনা ও লিখিত অংশের স্ব-মূল্যায়ন (শিক্ষকের নম্বর পরে চূড়ান্ত হবে)
- আসন্ন, খোলা, চলমান ও সম্পন্ন — চারটি অবস্থায় পরীক্ষার তালিকা; ফলাফল সেকশনে "আমার দেওয়া পরীক্ষা" ব্লক যুক্ত
- নোটিশ দেখার জন্য অফলাইন মডাল
- ব্যক্তিগত তথ্য লোকালস্টোরেজে সম্পাদনা ও সংরক্ষণ
- PWA install prompt এবং service worker cache
- local time ও offline weather profile অনুযায়ী nature theme পরিবর্তন
- অষ্টম শ্রেণি থেকে অনার্স ৪র্থ বর্ষ পর্যন্ত ক্লাস কনফিগারেশনের ভিত্তি

## অফলাইন নকশা ও মডিউল কাঠামো

কোনো external font, CDN বা remote API ব্যবহার করা হয়নি। HTML শুধু page structure রাখে; feature logic ও style আলাদা module-এ ভাগ করা হয়েছে।

```text
index.html              page structure and SVG icon sprite
styles.css              CSS entry point (feature imports)
css/
  tokens.css            design tokens and reset
  auth.css              login, registration and recovery
  dashboard.css         student home dashboard
  routine.css           routine timeline
  courses.css           courses and progress
  results.css           results cards
  exams.css             exam catalogue, runner and review
  profile.css           profile and settings
  shell.css             app header and shell
  navigation.css        bottom navigation
  overlays.css          modals, install and toast
  responsive.css        responsive rules
  glass.css             translucent glass visual layer
  theme.css             time and weather visual states
  typography.css        local font and mobile reading sizes
  scroll-header.css      scroll-aware topbar transition
assets/fonts/
  NotoSansBengali-Variable.ttf  offline UI/PDF-ready Bengali font
assets/icons/
  app-logo.png         in-app logo + browser favicon (green ring, black A, red +)
  install-icon.png     PWA install/app icon (same mark, notched ring)
  legacy-*             previous logo.svg / icon-192 / icon-512 kept for reference
js/
  main.js               application composition root
  login.js              login (mobile + PIN) and auth tab switching
  register.js           step-by-step registration and Student ID
  recovery.js           PIN recovery via security question
  logout.js             logout confirmation modal and session clearing
  storage.js            localStorage/sessionStorage adapter
  routine.js            routine rendering and day tabs
  exams.js              exam catalogue, runner, scoring and review
  exam-hash.js          offline answer keys (salted hash, never plain text)
  profile.js            profile editing
  navigation.js         page/action routing
  modals.js             notice and modal triggers
  install.js            PWA install prompt
  connectivity.js       offline status indicator
  service-worker.js     service worker registration
  config.js             classes, schedule and local defaults
  theme.js              time and weather visual states
  scroll-header.js      scroll-aware student name in topbar
  ui.js                 shared DOM and feedback helpers
tools/
  answer-hash.mjs       dev CLI that prints the hash config.js needs for an answer
package.json            no dependencies; only `npm run serve` and `npm run hash`
```

ভবিষ্যতে Admin Panel-এর **শিক্ষার্থী অ্যাপ ম্যানেজমেন্ট** অংশ থেকে enabled class, routine, course, notice ও result data নিয়ন্ত্রণ করার জন্য config ও storage adapter আলাদা রাখা হয়েছে। API যুক্ত করার সময় মূল UI feature files বদলানোর প্রয়োজন হবে না।

## লোকালি চালানো

Service worker চালানোর জন্য একটি static server ব্যবহার করুন:

```bash
python3 -m http.server 4173
```

তারপর Chrome-এ `http://localhost:4173` খুলুন। PWA install এবং offline cache দেখতে প্রথমে একবার পেজ লোড করে Chrome DevTools-এর Application → Service Workers থেকে পরীক্ষা করা যায়।

GitHub Pages-এ প্রকাশ করলেও relative asset path ব্যবহার করা হয়েছে, তাই repository subpath থেকেও অ্যাপটি চলবে।

## ব্যবহার

1. Chrome-এ পেজটি খুলুন।
2. Chrome-এর install icon বা অ্যাপের install prompt চাপুন।
3. ইনস্টল হওয়ার পর হোম স্ক্রিন থেকে **Active Plus** খুলুন।
4. প্রোফাইল থেকে নাম, শ্রেণি ও বিভাগ বদলালে তথ্য এই ডিভাইসেই সংরক্ষিত থাকবে।

পরবর্তী ধাপে একই offline data model ব্যবহার করে শিক্ষক ও Admin Panel যোগ করা যাবে।

## পরীক্ষা মডিউল (শিক্ষার্থী নিজে পরীক্ষা দেয়)

নেভিগেশনের **পরীক্ষা** ট্যাব বা হোমের “পরীক্ষা” কার্ড থেকে সেকশনটি খোলে। প্রতিটি পরীক্ষার জন্য `js/config.js`-এর `exams` অ্যারে-তে ডেটা রাখা হয়েছে — প্রশ্ন, অপশন, নম্বর, সময় ও `startsAt`/`endsAt` উইন্ডো। Admin Panel যুক্ত হলে একই গঠনে ডেটা সার্ভার থেকে আসবে, UI ফাইল বদলাতে হবে না।

- **অবস্থা:** `startsAt` ভবিষ্যতে হলে *আসন্ন*, `endsAt` পেরোলে *সময় শেষ*, নাহলে *খোলা আছে* (`endsAt: null` মানে যেকোনো সময়)।
- **উত্তর চিহ্ন:** প্রশ্নের সঠিক অপশনটি `answer: '<hash>'` হিসেবে সংরক্ষিত হয়। হ্যাশটি লোকাল, তাই গ্রডিং সম্পূর্ণ অফলাইনেই হয়; কোনো সার্ভারে উত্তর যায় না।
- **স্কোর:** MCQ সঙ্গে সঙ্গে সঠিক/ভুল ধরা পড়ে। লিখিত প্রশ্নের জন্য শিক্ষার্থী চেকপয়েন্ট টিক দিয়ে আনুমানিক স্ব-মূল্যায়ন করে; চূড়ান্ত নম্বর শিক্ষক নির্ধারণ করবেন।
- **প্রতিরোধ:** সঠিক অপশনের টেক্সট HTML-এ থাকে না, তাই ডেভটুলস বা সোর্স দেখে উত্তর বের করা যায় না (একটি অফলাইন অ্যাপে এটি সীমাবদ্ধতা-সহ প্রয়োগ; পরীক্ষার কাগজ কখনোই ১০০% সুরক্ষিত থাকে না)।

নতুন প্রশ্ন যোগ করার সময় হ্যাশ বানাও:

```bash
npm run hash -- --mcq "ভোল্ট" "ওহম" "অ্যাম্পিয়ার" "ওয়াট"
# 3. অ্যাম্পিয়ার  →  answer: 'n9o070103dzbn'   ← এই হ্যাশটি config.js-এ বসাও
```

সব উত্তর, খসড়া ও নম্বর একটিমাত্র কী-তে থাকে: `active-plus-exams-v1` (লোকালস্টোরেজ)। “সব দেখুন” বাটন এখন পরীক্ষা তালিকার *সম্পন্ন* ফিল্টার খোলে।

## শিক্ষার্থী এপ ম্যানেজমেন্ট (এক ক্লিকে — দুটো অ্যাপ একসাথে)

লগইন স্ক্রিনের **“শিক্ষার্থী এপ ম্যানেজমেন্ট — এক ক্লিকে (ডেমো)”** বোতামে চাপলেই প্যানেল খুলে যায় — আলাদা অ্যাকাউন্ট, PIN বা সার্ভার লাগে না। ডেমো সেশন চালু থাকলে শিক্ষার্থী টপবারে একটি স্লাইডার আইকনও দেখা যায়, সেখান থেকেও ঢোকা যায়।

| ট্যাব | কী করা যায় |
| --- | --- |
| সারসংক্ষেপ | দুটো অ্যাপের পরিসংখ্যান এক নজরে (স্কোপ কার্ডসহ); JSON এক্সপোর্ট ও এক ক্লিকে দুটো স্কোপই রিসেট |
| প্রশ্নব্যাংক | শিপ করা + লোকাল সব পরীক্ষার তালিকা; লুকাও/চালু করো; শিপ করা পরীক্ষার সময়সীমা-নির্দেশনা বদলাও |
| পরীক্ষা বানাও | নাম, বিষয়, সময়, পাস মার্ক, শুরু/শেষ উইন্ডো + MCQ/লিখিত প্রশ্ন; সেভ করলেই শিক্ষার্থীর তালিকায় |
| নম্বর দাও | শিক্ষার্থীর জমা দেওয়া attempt দেখে চূড়ান্ত নম্বর ও মন্তব্য (ফলাফল সেকশনে সঙ্গে সঙ্গে বদলায়) |
| অনুমোদন | এই ডিভাইসের অ্যাকাউন্ট ছাড়া/বাতিল, PIN রিসেট; ডেমো আবেদনের তালিকা |
| নোটিশ | নোটিশ লেখা ও প্রকাশ — শিক্ষার্থীর ঘণ্টা আইকনে সঙ্গে সঙ্গে ওঠে |
| SSC প্রস্তুতি | `ssc-prep/`-এর MCQ ব্যাংক, সৃজনশীল প্রশ্ন, সেট (প্র্যাকটিস/মডেল/লাইভ উইন্ডোসহ), জমা হওয়া ফলাফল ও JSON টুল — ভেতরের সাব-ট্যাবে |

- **এক জায়গাই একমার:** এডমিন সফটওয়্যার দুটো নয়। `ssc-prep/`-এর নিজস্ব এডমিন UI আর নেই — সেখানার হেডারে শুধু “ম্যানেজমেন্ট” লিঙ্ক (যেখানে মূল অ্যাপ পাওয়া যায়), আর সব এডিট হয় এই প্যানেলের **SSC প্রস্তুতি** ট্যাব থেকে।
- **সরাসরি ঠিকানা:** `/?manage=1&tab=ssc` খুললেই ডেমো সেশন বসে গিয়ে সোজা SSC ট্যাবে নামে; `/?manage=1` দিলে সারসংক্ষেপে।
- **কী-ভাগ, ফাইল-ভাগ নয়:** Active Plus অংশ লেখে `localStorage`-এর `active-plus-admin-v1`-এ, SSC অংশ লেখে `ssc-prep-bank-v1`-এ (ssc-prep অ্যাপের নিজস্ব ওভারলে কী)। দুটোই ডিভাইস-লোকাল — `js/config.js` কিংবা `ssc-prep/data/questions.json` কখনো লেখা হয় না, তাই git-এ কোনো এডিট যায় না।
- **শর্ত:** SSC ট্যাব কাজ করতে হলে অ্যাপটা রিপো রুট থেকে সার্ভ করতে হবে (`/` ও `/ssc-prep/` একই origin-এ)। আলাদাভাবে শুধু `ssc-prep/` সার্ভ করলে ব্যাংক ফেইল করে এবং প্যানেল পরিষ্কার বার্তা দেখায়।
- **উত্তর নিরাপত্তা:** এডমিন সঠিক অপশনটি প্লেইন টেক্সটে লেখে, সেভ করার সময় `js/exam-hash.js` দিয়ে হ্যাশ হয় — শিক্ষার্থীর কাছে যাওয়া তালিকায় উত্তর থাকে না (ইনডেক্সটা শুধু এডমিনের ম্যাপে থাকে)। SSC পাশের সঠিক উত্তর ওভারলেতেই থাকে, সেটি শিক্ষার্থীর ভিউতে কখনো রেন্ডার হয় না।
- **মডুল বিন্যাস:** `js/admin-data.js` (Active Plus ডেটা লেয়ার) + `js/admin.js` (প্যানেল শেল ও ট্যাব) + `js/admin-ssc.js` (SSC স্কোপ; `ssc-prep/js/exam-logic.js`-এর পিওর ফাংশনই ব্যবহার করে, লজিক ডুপ্লিকেট করে না) + `js/notices.js` + `css/admin.css`; `index.html`-এ শুধু ট্যাব ও `#adminBody` হুক।
- **সীমাবদ্ধতা:** এটি ডেমো — কোনো প্রমাণিকরণ নেই, তাই এই ডিভাইসে যে কেউ প্যানেলে ঢুকে লোকাল ডেটা দেখতে/বদলাতে পারবে। আসল প্যানেলে লগইন, ভূমিকা (role) ও সার্ভার-সাইড গ্রডিং লাগবে; তখন একই ডেটা শেপ সার্ভার থেকে আসবে।

## সম্পর্কিত: `ssc-prep/` (আলাদা assessment মডিউল)

MCQ প্র্যাকটিস, টাইড মডেল টেস্ট/লাইভ এক্সাম, সৃজনশীল প্রশ্ন ও পারফরম্যান্স ড্যাশবোর্ড — Tailwind CSS + vanilla JS + JSON দিয়ে `ssc-prep/` ফোল্ডারে একটি স্বয়ংসম্পূর্ণ প্রোটোটাইপ আছে। এটি আলাদা entry point হিসেবেও চলে (নিজস্ব `data/questions.json`, নিজস্ব localStorage key), তাই মূল অ্যাপের cache বা UI-এর সাথে সংঘর্ষ হয় না; শুধু এর **ম্যানেজমেন্ট এই অ্যাপেই থাকে** — উপরের SSC প্রস্তুতি ট্যাব দেখুন। চালানোর নিয়ম ও JSON চুক্তি `ssc-prep/README.md`-এ।
