# Active Plus Coaching — শিক্ষার্থী অ্যাপ

**Fixed tagline:** “শিখতে থাকো, এগিয়ে যাও”

Active Plus Coaching-এর মোবাইল-ফার্স্ট Progressive Web App (PWA)। Chrome থেকে ইনস্টল করে অ্যাপের মতো ব্যবহার করা যায়। এই ধাপে শিক্ষার্থী অংশটি তৈরি করা হয়েছে এবং সব ডেটা লোকাল ডিভাইসে থাকে—কোনো সার্ভার বা API-এর উপর নির্ভর করে না।

## এই ধাপে যা আছে

- অফলাইন লগইন পেজ — মোবাইল নম্বর ও ৪–৬ সংখ্যার PIN
- ধাপে ধাপে শিক্ষার্থী self-registration; শিক্ষক ও এডমিন account management পরবর্তী Admin Panel-এ থাকবে
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
- নোটিশ দেখার জন্য অফলাইন মডাল
- ব্যক্তিগত তথ্য লোকালস্টোরেজে সম্পাদনা ও সংরক্ষণ
- PWA install prompt এবং service worker cache
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
  profile.css           profile and settings
  shell.css             app header and shell
  navigation.css        bottom navigation
  overlays.css          modals, install and toast
  responsive.css        responsive rules
js/
  main.js               application composition root
  auth.js               login, registration and PIN recovery
  storage.js            localStorage/sessionStorage adapter
  routine.js            routine rendering and day tabs
  profile.js            profile editing
  navigation.js         page/action routing
  install.js            PWA install prompt
  connectivity.js       offline status indicator
  service-worker.js     service worker registration
  config.js             classes, schedule and local defaults
  ui.js                 shared DOM and feedback helpers
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
