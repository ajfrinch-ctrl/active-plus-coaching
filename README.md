# Active Plus Coaching — শিক্ষার্থী, শিক্ষক ও Admin

**Fixed tagline:** “শিখতে থাকো, এগিয়ে যাও”

Active Plus Coaching-এর মোবাইল-ফার্স্ট Progressive Web App (PWA)। Chrome থেকে ইনস্টল করে অ্যাপের মতো ব্যবহার করা যায়। শিক্ষার্থী অ্যাপ, আলাদা শিক্ষক প্যানেল ও ডামি Admin প্যানেল তৈরি করা হয়েছে। সব ডেটা লোকাল ডিভাইসে থাকে—কোনো সার্ভার বা API-এর উপর নির্ভর করে না।

## এই ধাপে যা আছে

- অফলাইন লগইন পেজ — মোবাইল নম্বর ও ৪–৬ সংখ্যার PIN; তৃতীয় **“পেমেন্ট কাউন্টার”** ট্যাবে কাউন্টার আইডি+PIN দিলে সরাসরি পেমেন্ট রিসিভ ডেস্কে অটো-লগিন
- স্থানীয় Noto Sans Bengali variable font; অ্যাপেই preload ও offline cache করা আছে, ভবিষ্যতের offline PDF export-এর জন্য প্রস্তুত
- ধাপে ধাপে শিক্ষার্থী self-registration; শিক্ষক ও এডমিন account management পরবর্তী Admin Panel-এ থাকবে
- Login-এর মোবাইল নম্বরই যোগাযোগের নম্বর হিসেবে fixed থাকে এবং registration-এর যোগাযোগ ধাপে read-only দেখায়
- বাংলা ও ইংরেজি নাম, অভিভাবক, জন্মতারিখ, লিঙ্গ, মোবাইল, পূর্ণ ঠিকানা, ক্লাস, গ্রুপ ও ঐচ্ছিক শিক্ষা তথ্য
- **আমার কোর্স (শিক্ষার্থী পোর্টাল)** — ক্যাটাগরি টাইল সবসময় সারিতে **দুটি করে অর্ধেক প্রস্থে** (৩টি হলে ২+১ ফুল, ৪টি হলে ২+২); শিক্ষকের দেওয়া কাজের কার্ড ও ডেমো কোর্স তালিকা **চাপলেই তথ্য খোলে** (সংক্ষিপ্ত ভিউতে ধরন/অবস্থা/শেষ সময়, খুললে বিস্তারিত-মেটা, শিক্ষক ও অ্যাকশন); কার্ডের কোণায় ঘোরানো চেভরন খোলা/বন্ধ বোঝায়; **এই টার্মের অগ্রগতি** কার্ডটি এখন তালিকার একদম উপরে
- ফলাফল ভিউ: **সর্বশেষ মডেল টেস্ট** সারাংশ এখন সবার উপরে দেখা যায়; প্রোফাইলের **তথ্য হালনাগাদ**-এ রেজিস্ট্রেশন নম্বর স্থায়ীভাবে লকড (Student ID-র মতো — ফর্মে বদলানো যায় না)।
- নিরাপত্তা প্রশ্নের মাধ্যমে PIN পুনরুদ্ধার; ভবিষ্যতে এডমিন PIN reset করতে পারবেন
- ৮ম শ্রেণি থেকে অনার্স ৪র্থ বর্ষ পর্যন্ত enabled class তালিকা
- রেজিস্ট্রেশনের পরে স্বয়ংক্রিয় ইউনিক Student ID — বছর, মাস, class code ও sequence
- অনুমোদনের আগেও লগইন করা যাবে, কিন্তু pending account-এ শিক্ষার্থী ফিচার ব্যবহার করতে পারবে না
- শিক্ষার্থীর অফলাইন হোম ড্যাশবোর্ড — ShopLedGer স্টাইলে নতুন ডিজাইন: ফ্ল্যাট ব্যাকগ্রাউন্ড, সাদা কার্ড, গ্রিন প্রাইমারি, স্বাগত কার্ড, "আজকের পড়াশোনা" স্ট্যাট কার্ড, দ্রুত কাজ গ্রিড ও লিস্ট রো
- শিক্ষার্থী অংশে লগইন পেইজের একই লোগো, নাম ও ট্যাগলাইনসহ fixed হেডার; শুধু নোটিফিকেশনের ঘণ্টা অতিরিক্ত আছে। পুরোনো শিক্ষার্থীর নাম/আবহাওয়া/তারিখ/ঘড়ির হেডার সরানো হয়েছে।
- সাপ্তাহিক অগ্রগতি, উপস্থিতি, গড় ফলাফল ও বাকি কাজ
- ক্লাস রুটিন — দিনভিত্তিক ফিল্টারসহ
- চলমান কোর্স ও অধ্যায়ভিত্তিক অগ্রগতি
- সাম্প্রতিক পরীক্ষার ফলাফল
- হেডারের ঘণ্টায় একটিমাত্র নোটিশ ইনবক্স; খুললে অপঠিত চিহ্ন সরে যায়, আগের নোটিশ ইতিহাসে থাকে। শিক্ষার্থীভিত্তিক পড়ার অবস্থা একই ডিভাইসে অফলাইন/রিলোডেও থাকে; ঘোষণার লেখা বদলালে আবার অপঠিত হয়।
- শিক্ষকের দেওয়া কাজে মোট/বাকি/সম্পন্ন বাড়ির কাজের সারসংক্ষেপ, সংখ্যাসহ ধরনভিত্তিক ফিল্টার, বিষয়–তারিখ–শিক্ষক–অবস্থাসহ মোবাইল কার্ড ও বড় অ্যাকশন বাটন
- ব্যক্তিগত তথ্য লোকালস্টোরেজে সম্পাদনা ও সংরক্ষণ
- PWA install prompt এবং service worker cache
- local time অনুযায়ী হোমের অভিবাদন, পরামর্শ ও ক্লাসের তারিখ আপডেট হয়
- অষ্টম শ্রেণি থেকে অনার্স ৪র্থ বর্ষ পর্যন্ত ক্লাস কনফিগারেশনের ভিত্তি
- ডামি এডমিন প্যানেল — পাসওয়ার্ড/PIN ছাড়া এক ক্লিকে প্রবেশ (`admin.html`)

## ডামি এডমিন প্যানেল (এক ক্লিকে প্রবেশ)

`admin.html` খুললেই এডমিন এন্ট্রি স্ক্রিন দেখা যায় — পাসওয়ার্ড বা PIN লাগে না, “এক ক্লিকে প্যানেলে ঢুকুন” বাটনে একবার চাপ দিলেই প্যানেলে ঢুকে যাওয়া যায়। শিক্ষার্থী অ্যাপের লগইন পেইজের নিচ থেকেও এই প্যানেলে সরাসরি যেতে পারা যায়।

প্যানেলে আছে (সব ডেটা লোকাল ডেমো):

- **সংক্ষিপ্ত ড্যাশবোর্ড** — বর্তমান তারিখ, মোট শিক্ষার্থী, চলমান ক্লাস ও অনুমোদনের অপেক্ষমাণ সংখ্যা; অপেক্ষমাণ সংখ্যায় চাপলে সরাসরি filtered শিক্ষার্থী তালিকা। ফি গ্রহণের একটি দ্রুত বাটন। **অর্থ ব্যবস্থাপনা ও ফি সারাংশ কার্ড** — আজকের আদায় (লেনদেন সংখ্যাসহ), এই মাসের আদায়, চলতি মাসের বকেয়া ও সর্বমোট আদায়; "বিস্তারিত হিসাব" চাপলে হিসাব পেজে যায়। নোটিশের সংখ্যা, পুনরাবৃত্ত শিক্ষার্থী/ক্লাস তালিকা ও অ্যাপের বিস্তারিত status কার্ড সরানো হয়েছে; মূল বিভাগে সব ফিচার রয়েছে।
- **৫টি মোবাইল নেভিগেশন** — ড্যাশবোর্ড, শিক্ষার্থী, হিসাব, রুটিন ও আরও। **আরও**-এর মধ্যে নোটিশ, শিক্ষার্থী অ্যাপ কন্ট্রোল ও ক্লাস সেটিংস; প্রতিটি পেজ থেকে আরও-তে ফেরার বাটন আছে। এই পেজগুলোতেও ফুটারের আরও বাটন সক্রিয় থাকে। আলাদা desktop sidebar বা desktop navigation নেই; বড় স্ক্রিনেও একই মোবাইল নেভিগেশন থাকে।
- **ইউনিক আইডি ও অডিট ট্র্যাকিং** — প্রতিটি এন্ট্রি (শিক্ষার্থী ID, ট্রানজেকশন ID, রসিদ ভাউচার, নোটিশ স্মারক, রুটিন ক্লাস কোড, কোর্স কোড ও স্টেটমেন্ট মেমো)-তে স্ট্যান্ডার্ড ইউনিক অডিট কোড সংরক্ষণ
- **শিক্ষার্থী** — নাম/ID/মোবাইল দিয়ে স্মার্ট সার্চ, লাইভ অটো-হাইড, স্ট্যাটাস ফিল্টার, রেকর্ড দেখা, PIN রিসেট (নতুন PIN ডেমোভাবে দেখায়)। **শ্রেণি ফিল্টার** — সার্চের নিচের ড্রপডাউন থেকে শ্রেণি বেছে নিলে তালিকায় শুধু সেই শ্রেণির শিক্ষার্থীরা থাকে; রিপোর্ট সেন্টারের শ্রেণি-ভিত্তিক রিপোর্ট থেকে "শিক্ষার্থী তালিকায় খুলুন" চাপলে একই ফিল্টার প্রয়োগ হয়ে শিক্ষার্থী পেজে চলে যায়।
- **রিপোর্ট জেনারেটর (আরও → রিপোর্ট জেনারেটর)** — প্রতিটি রিপোর্ট অফলাইন ব্র্যান্ডেড PDF (`js/report-generator.js`, রসিদের মতো canvas render) বা Excel-রেডি CSV হিসেবে সরাসরি ডাউনলোডযোগ্য — ফাইলের নাম `APC-<রিপোর্ট>-report-YYYY-MM-DD.<ext>`। ফিল্টারযোগ্য **কালেকশন রিপোর্ট** (লাইভ টোটাল), **আজকের কালেকশন**, **বকেয়া**, **শিক্ষার্থী তালিকা** ও **সাপ্তাহিক রুটিন** রিপোর্ট, সঙ্গে একাডেমিক রিপোর্ট:
  - **শ্রেণি অনুযায়ী শিক্ষার্থী রিপোর্ট** — শ্রেণি ও বিভাগ বেছে নিলে সেই ক্লাসের মোট শিক্ষার্থী, অনুমোদিত সংখ্যা, মোট বকেয়া ও গড় উপস্থিতিসহ যোগাযোগ/ফলাফল/বকেয়া টালিকা; "শিক্ষার্থী তালিকায় খুলুন" বাটনে একই ক্লাস-ফিল্টারে ম্যানেজমেন্ট পেজ।
  - **ফলাফল রিপোর্ট** — অনলাইন পরীক্ষা (`js/exam-data.js`) বা ক্লাস নভেয়া (`js/teaching-data.js`) নির্বাচন করে র‍্যাংক, প্রাপ্ত নম্বর, গ্রেড ও অবস্থাসহ তালিকা; শ্রেণি-ফিল্টারসহ। জমা দিয়েছে/অনুপস্থিত/গড় নম্বর সারাংশ; অনুপস্থিত শিক্ষার্থীরা তালিকার শেষে "অনুপস্থিত" অবস্থায় থাকে।
  - **উপস্থিতি-অনুপস্থিতি রিপোর্ট** — প্রকাশিত ক্লাস সেশন (রুটিন সেশন) বেছে নিলে প্রতিজনের উপস্থিত/অনুপস্থিত/দেরিতে অবস্থা ও সেশনের উপস্থিতির হার।
- **অর্থব্যবস্থাপনা ও ফি কালেকশন** — মোট ফি আদায়, চলতি মাসের কালেকশন ও বকেয়া হিসাবের ড্যাশবোর্ড; নতুন ফি গ্রহণ (নগদ/বিকাশ/নগদ/রকেট), অফিশিয়াল মানি রসিদ তৈরি ও সরাসরি PDF ডাউনলোড; শিক্ষার্থী লেজার এবং মাস/শ্রেণি/ফি ধরন/মাধ্যমভিত্তিক ফিল্টারযোগ্য মোবাইল কালেকশন রিপোর্ট—বড় টেবিল বা প্রিন্ট অপশন ছাড়া
- **নোটিশ** — শিরোনাম, বিবরণ ও প্রাপক নির্বাচন করে নতুন নোটিশ প্রকাশ ও পুরনো নোটিশ মুছে ফেলা
- **ক্লাস রুটিন** — দিনভিত্তিক রুটিন দেখা, নতুন ক্লাস যোগ ও মুছে ফেলা। নতুন ক্লাস যোগ করার সময় **কোন শ্রেণির জন্য** তা ড্রপডাউন থেকে নির্বাচন করা যায় (সব enabled শ্রেণি), **শিক্ষক ড্রপডাউন** থেকে শিক্ষক নির্বাচন করা যায় (রুটিনে থাকা শিক্ষকরা নিজে থেকেই তালিকায় যোগ হয়) এবং **বিষয় একবার টাইপ করলেই অটোফিল** হয় — পরের এন্ট্রিতে টাইপ করার সময় আগের বিষয়গুলো সাজেশন হিসেবে দেখায়; সেভের পরেও বিষয়টি পরের এন্ট্রির জন্য মনে থাকে। রুটিনের প্রতিটি সারিতে শ্রেণি ব্যাজ দেখা যায়।
- **শিক্ষক রেজিস্ট্রেশন নিয়ন্ত্রণ** — শিক্ষার্থী অ্যাপ ম্যানেজমেন্টের "শিক্ষক রেজিস্ট্রেশন নিয়ন্ত্রণ" কার্ড থেকে টগল করে শিক্ষক প্যানেলের নতুন রেজিস্ট্রেশন/প্রবেশ খোলা ও বন্ধ করা যায়; সেভ করলে `teacher.html`-এ সঙ্গে সঙ্গে কার্যকর হয় — বন্ধ থাকলে এন্ট্রি স্ক্রিনে ব্যাখ্যাসহ নোটিশ দেখায় ও প্রবেশ বাটন নিষ্ক্রিয় থাকে। কার্ডে বর্তমানে যুক্ত শিক্ষকদের তালিকাও দেখা যায় (রুটিনের শিক্ষক তালিকা থেকে স্বয়ংক্রিয়)।
- **ক্লাস সেটিংস** — `config.js`-এর enabled class তালিকা থেকে ক্লাস চালু/বন্ধ করা

### পেমেন্ট রিসিভ প্যানেল (`payment.html`) — শুধু কালেকশন, আর কিছুই নয়

এডমিন প্যানেলের বাইরে আলাদা, খুব হালকা একটি কাউন্টার পেজ — ইউনিক ইউসার আইডি ও PIN দিয়ে প্রবেশ; কোনো নেভিগেশন, রিপোর্ট বা ম্যানেজমেন্ট নেই। ধারাবাহিকতা: **লগইন → সার্চ → সংক্ষিপ্ত তথ্য → পেমেন্ট → রসিদ**। পেজটি এখন অ্যাপ-শেল স্টাইলে: স্থির টপবার, একটি স্ক্রল করা কলাম ও নিচে স্থির “টাকা নিন” বার।

- **লগইন পেজ থেকে সরাসরি প্রবেশ (অটো-লগিন)** — শিক্ষার্থী লগইন পেজে (`index.html`) তিন নম্বর ট্যাব **“পেমেন্ট কাউন্টার”**: কাউন্টারের ইউসার আইডি ও PIN দিলেই যাচাই হয়ে সরাসরি পেমেন্ট ডেস্ক খুলে যায়, আলাদা লগইন ফর্ম দেখতে হয় না। একই আইডি+PIN **শিক্ষার্থী লগইন ঘরে** (মোবাইলের জায়গায় `APC-PAY-001`) লিখলেও সেখান থেকেই অটো-লগিন হয় — শিক্ষার্থী অ্যাপ খোলে না। ভুল হলে বাংলা ত্রুটি-বার্তা। লগইন পেজের নিচে “পেমেন্ট রিসিভ কাউন্টার” লিংকও আছে; দুই জায়গাতেই “এই ডিভাইসে মনে রাখুন” থাকলে ৯০ দিনের সেশন। ক্রেডেনশিয়াল/সেশন লজিক এক জায়গায় — `js/payment-auth.js` — তাই `payment.html` ও `index.html` একই নিয়ম মানে।
- **প্রবেশাধিকার** — ইউনিক ইউসার আইডি `APC-PAY-001`, ডিফল্ট PIN **১২৩১২৩** (ডেমো ফর্মে আগেই লেখা থাকে)। আইডি ছোট-বড় হরফে লেখা যায়, PIN-এ বাংলা সংখ্যাও চলে। ভুল আইডি/PIN-এ বাংলা ত্রুটি-বার্তা; "এই ডিভাইসে মনে রাখুন" চেক করা থাকলে সেশন ৯০ দিন মনে থাকে, না হলে ট্যাব-সেশন পর্যন্ত। সেশন থাকলে `payment.html` খোলার সঙ্গে সঙ্গেই ডেস্ক দেখা যায় (এন্ট্রি স্ক্রিন ঝলকায় না)। টপবারের **লক আইকনে** বর্তমান PIN যাচাই করে নতুন PIN (৪–৬ সংখ্যা, বাংলা সংখ্যাও চলে) দুইবার লিখে বদলানো যায় — অ্যাকাউন্ট `activePlus.paymentAccount.v1`, সেশন `activePlus.paymentSession.v1` কী-তে সংরক্ষিত; ডেমো হিসেবে সাধারণ localStorage-এ সাদামাটা ভাবে রাখা, সার্ভার যুক্ত হলে এই কী-গুলোই API অ্যাকাউন্ট দিয়ে বদলাবে। **প্রস্থান** আইকনে লগআউট (সেশন ও নির্বাচন দুটোই মুছে যায়)।
- **আজকের আদায় এক নজরে** — ডেস্কের উপরেই বড় কার্ডে আজকের আদায় (লেনদেন সংখ্যাসহ), এই মাসের আদায় ও কত জনের বকেয়া; নিচে **আজকের লেনদেন** তালিকা — যেকোনো সারিতে চাপলে সেই রসিদ আবার খোলে, রিফ্রেশ আইকনে অন্য ট্যাবের কালেকশনসহ তালিকা হালনাগাদ হয়।
- **সার্চবার** — শিক্ষার্থীর নাম, মোবাইল নম্বর, Student ID **অথবা অভিভাবকের মোবাইল নম্বর** দিয়ে খোঁজা যায় (বাংলা সংখ্যা ও `+880` ফরম্যাটসহ)। ফলাফলে প্রতিজনের বকেয়াও দেখা যায়; কীবোর্ডে `/` চাপলেই সার্চ ঘরে ফোকাস। এডমিন প্যানেলের ফি-সার্চেও এখন অভিভাবকের নম্বর কাজ করে।
- **টাইপ না করে এক চাপে** — সার্চের নিচে **যাদের বকেয়া আছে** ও **সাম্প্রতিক পেমেন্ট** চিপ; চাপলেই সেই শিক্ষার্থী নির্বাচিত।
- **সংক্ষিপ্ত তথ্য** — নির্বাচন করলেই শ্রেণি-বিভাগ, শিক্ষার্থী ও অভিভাবকের মোবাইল, সর্বশেষ পেমেন্ট, নির্ধারিত মাসিক ফি, চলতি মাসে পরিশোধ ও বকেয়া; বকেয়া বড় করে হিরো ব্লকে দেখায়, সঙ্গে কোন নম্বরে রসিদ যাবে তার হিন্ট। নিচের স্থির বারে শিক্ষার্থীর নাম ও বকেয়া থাকে, তাই যেকোনো জায়গা থেকে এক চাপে পেমেন্ট ফর্ম খোলা/জমা দেওয়া যায়।
- **পেমেন্ট** — ফি ধরন, মাস, দ্রুত পরিমাণ চিপ (পূর্ণ বকেয়া/মাসিক ফি/অর্ধেক), **বড় অঙ্কের ঘর ও থাম্ব-ফ্রেন্ডলি কীপ্যাড** (১–৯, ০, ০০, ⌫), মাধ্যমের জন্য **পিল বাটন** (নগদ/বিকাশ/Nagad/রকেট/ব্যাংক — `paymentMethods` থেকেই তৈরি), Trx ID ও নোট। সেভ বাটনে লাইভ পরিমাণ (“৳৭০০ জমা নিন ও রসিদ দিন”) দেখা যায়; **বাতিল** বাটনে ফর্ম বন্ধ। একই `financeRepository` localStorage contract-এ সংরক্ষণ — এডমিন প্যানেলের হিসাব, লেজার ও রিপোর্টে সঙ্গে সঙ্গে দেখা যায়। সংরক্ষণ ব্যর্থ হলে রসিদ হয় না।
- **হোয়াটসঅ্যাপে রসিদ (এক ক্লিকে)** — রসিদ সেভ হলেই সাফল্যের চিহ্নসহ মোডাল খোলে: "হোয়াটসঅ্যাপে পাঠান" বাটনে রসিদটি অফলাইন canvas-এ ছবি (PNG) আঁকা হয় এবং Web Share API-তে ফাইলসহ শেয়ার মেনু খোলে — WhatsApp বেছে নিলেই শিক্ষার্থীর নম্বরে ছবি চলে যায়। শেয়ার সাপোর্ট না থাকলে ছবিটি ডাউনলোড হয়ে শিক্ষার্থীর নম্বরে `wa.me` চ্যাট (৮৮০ প্রিফিক্সসহ) খুলে যায়, পেমেন্টের সংক্ষিপ্ত টেক্সটসহ; শিক্ষার্থীর নম্বর না থাকলে অভিভাবকের নম্বর ব্যবহৃত হয়। "রসিদ PDF ডাউনলোড" বাটনে আগের মতোই ব্র্যান্ডেড PDF; **"টেক্সট কপি"** বাটনে রসিদের টেক্সট কপি হয়ে হোয়াটসঅ্যাপে পেস্ট করার সুবিধা, আর **"নতুন পেমেন্ট নিন"** বাটনে সরাসরি পরের শিক্ষার্থীর সার্চে ফেরা যায়। `Esc` চাপলে যেকোনো মোডাল বন্ধ হয়।
- সীমাবদ্ধতা: এটি ডেমো — WhatsApp-এ সরাসরি সার্ভার-সাইড পাঠানো নেই; মোবাইলে OS শেয়ার মেনু/চ্যাট খোলে, চূড়ান্ত "Send" চাপা ব্যবহারকারীর হাতে।
- এডমিন প্যানেলের হিসাব পেজের "শিক্ষার্থী খুঁজুন" কার্ড থেকে "পেমেন্ট রিসিভ প্যানেল" লিংকে সরাসরি যাওয়া যায়।

এটি ডেমো: কোনো সার্ভার বা API নেই। শিক্ষার্থী/নোটিশ/রুটিনের পরিবর্তন পেজ রিফ্রেশে রিসেট হয়; **ফি ট্রানজ্যাকশন এখন localStorage-এ সংরক্ষিত থাকে**। এটি production authentication বা online payment gateway নয়।

### ফি কালেকশন: সার্চ → প্রোফাইল → পেমেন্ট → রসিদ

- Admin → অর্থব্যবস্থাপনা → নাম (বাংলা/ইংরেজি), মোবাইল বা Student ID দিয়ে সার্চ করুন। বাংলা অঙ্কও ব্যবহার করা যায়। খালি সার্চে কোনো শিক্ষার্থী নেই; অমিল হলে “কোনো শিক্ষার্থী পাওয়া যায়নি” দেখায়।
- নাম চাপলে কুইক প্রোফাইলে শ্রেণি/বিভাগ, মোবাইল, স্ট্যাটাস, মাসিক ফি, চলতি মাসে পরিশোধ, বকেয়া এবং সর্বশেষ পেমেন্ট দেখা যায়। সেখান থেকে **পেমেন্ট গ্রহণ**।
- ফি ধরন, মাস, পরিমাণ, মাধ্যম, ঐচ্ছিক Reference ও Note পূরণ করে সেভ করুন। সফলভাবে সংরক্ষণের পরই totals/profile/ledger আপডেট হয় এবং লোগোসহ রসিদ খোলে। সেভের সময় ডাবল সাবমিট বন্ধ; স্টোরেজ ব্যর্থ হলে ফর্ম অপরিবর্তিত থাকে, রসিদ তৈরি হয় না।
- Recent Collection-এ তারিখ অনুযায়ী সর্বশেষ **৫টি** আদায়; প্রতিটি থেকে রসিদ দেখা ও ডাউনলোড করা যায়। একই দিনের রেকর্ডে নতুন এন্ট্রি আগে থাকে। রিপোর্টে সব রেকর্ড থাকে।
- **রসিদ ডাউনলোড** চাপলেই সরাসরি `.pdf` ফাইল পাওয়া যায়—কোনো print dialog, নতুন window বা HTML ফাইলের মধ্যবর্তী ধাপ নেই। মোবাইলে সহজে পেতে বাটনটি রসিদ preview-এর উপরেই আছে; Recent Collection থেকেও একই PDF ডাউনলোড হয়। লোগো ও স্থানীয় বাংলা ফন্ট দিয়ে Canvas-এ উচ্চ রেজোলিউশনে render করে PDF-এ image হিসেবে সংরক্ষণ হয়, তাই বাংলা যুক্তাক্ষর ঠিক থাকে ও ফাইল offline-এ দেখা যায়; PDF-এর লেখা selectable নয়। কোনো CDN বা নতুন runtime library লাগে না। রসিদ ও রিপোর্টের প্রিন্ট অপশন সরানো হয়েছে; রিপোর্টের প্রতিটি লেনদেন থেকেও রসিদ ডাউনলোড করা যায়।
- বর্তমান মাস/বছর ডিভাইসের তারিখ থেকে নির্ধারিত। `student.monthlyFee` থাকলে তা ব্যবহৃত হয়, না থাকলে আগের **৳১,৫০০** ডিফল্ট। পুরনো Student record বদলানো হয়নি।
- “চলতি মাসে পরিশোধ” নির্বাচিত ফি-মাসের সব ফি যোগ করে। **বকেয়া শুধু বর্তমান মাসের মাসিক বেতন**, আংশিক পেমেন্ট বাদ দিয়ে; ভর্তি/পরীক্ষার ফি মাসিক বেতন কমায় না। আগের মাসের billing/arrears schedule নেই, তাই ঐতিহাসিক বকেয়া অনুমান করা হয় না। সারাংশের বকেয়া শুধু অনুমোদিত শিক্ষার্থীদের, বিদ্যমান নিয়ম অনুযায়ী।

**Persistence / ভবিষ্যৎ API:** `js/finance-data.js`-এর `financeRepository.listTransactions()` এবং `saveTransaction(tx)` asynchronous boundary। প্রথমটি transaction array দেয়; দ্বিতীয়টি durable save শেষে updated array দেয়। API adapter-এ এই contract রাখলে UI workflow অপরিবর্তিত থাকবে। বর্তমান adapter `activePlus.admin.transactions.v1` localStorage key ব্যবহার করে, seed data একবার থেকে শুরু করে; Student/Transaction field shape অপরিবর্তিত। একই ID-র save idempotent; Web Locks থাকলে একই origin-এর tab-গুলোর write serialized হয়। সার্ভার সংস্করণে authentication, authoritative validation, unique receipt number, idempotency এবং atomic writes server-side enforce করতে হবে।

ডেটা এই ব্রাউজার/origin-এ থাকে—অন্য ডিভাইসে sync বা backup হয় না এবং browser storage মুছলে হারাবে। নতুন receipt CSS/JS service-worker cache-এ যুক্ত ও cache version আপডেট করা হয়েছে।

### সম্পূর্ণ মোবাইল ইন্টারফেস

শিক্ষার্থী ও Admin—দুই অংশে একটিই ফোন-কেন্দ্রিক UI। `css/mobile.css` দুই entry page-এ শেষে load হয়। Desktop sidebar, বড়-স্ক্রিনের আলাদা layout/media query, desktop login frame এবং report print controls সরানো হয়েছে। সব মূল ফর্ম ও section এক কলামে; ছোট summary tiles পাশাপাশি থাকতে পারে। Admin-এর নিচের ৫টি বাটন সব viewport-এ থাকে। ইনপুট ১৬px, প্রধান touch control কমপক্ষে ৪৪px; safe-area ও mobile viewport-height বিবেচিত। রিপোর্ট এখন readable transaction cards, ফিল্টার ও মোট হিসাবসহ।

বড় স্ক্রিনে খুললেও সর্বোচ্চ ৪৮০px চওড়া একই মোবাইল UI দেখা যাবে—কম্পিউটারের জন্য আলাদা সুবিধা নেই। User-agent/device blocking করা হয়নি, তাই preview, tablet, phone landscape ও accessibility tools চালু থাকে। Student/Transaction data এবং সরাসরি PDF রসিদ ডাউনলোড অপরিবর্তিত।

### স্থির হেডার ও ফুটার

শিক্ষার্থী ও Admin-এর হেডার এবং নিচের ৫টি নেভিগেশন বাটন fixed থাকে। সম্পূর্ণ পেজের বদলে মাঝের `#appMain` / `#adminMain` অংশটি scroll হয়। `js/fixed-shell.js` header/footer-এর প্রকৃত height মেপে জায়গা রাখে—বাংলা font load, safe-area বা screen resize হলেও কনটেন্ট চাপা পড়ে না। পেজ/ট্যাব বদলালে মাঝের অংশ শুরুতে ফিরে আসে; scroll-aware student name আগের মতো কাজ করে। Login form ও pending-account screen নিজস্ব scroll রাখে, modal খোলা থাকলে পেছনের content scroll বন্ধ থাকে।

### Admin workflow পরীক্ষা

Fixed-shell tests-এ scroll-এর সময় header/footer অবস্থান, শেষ কনটেন্ট দেখা, view reset, resize, login ও pending screen যাচাই করা হয়। Mobile-layout tests-এ শিক্ষার্থী/Admin login, পাঁচটি student view, narrow/wide/landscape viewport, এক-কলামের ফর্ম, overflow ও mobile report filters যাচাই করা হয়। Navigation tests-এ ৫টি ফুটার বাটন, আরও মেনু ও ফেরত আসা, dashboard shortcuts, অপেক্ষমাণ অনুমোদন, ক্লাস সেটিংস ও নোটিশ প্রকাশ যাচাই করা হয়। `tests/payment-panel.spec.cjs` পেমেন্ট রিসিভ প্যানেল যাচাই করে: ইউনিক আইডি+PIN লগইন (ভুল প্রবেশাধিকার বাতিল, সেশন মনে রাখা, লগআউট), PIN পরিবর্তন (পুরনো PIN যাচাই, নতুন PIN-এ প্রবেশ), খালি কাউন্টার লেআউট, নাম/মোবাইল/ID/অভিভাবকের মোবাইল-সার্চ (বাংলা সংখ্যাসহ), সংক্ষিপ্ত প্রোফাইল, financeRepository-তে পেমেন্ট সংরক্ষণ, রসিদ PDF ডাউনলোড এবং হোয়াটসঅ্যাপ শেয়ার (Web Share ফাইল-শেয়ার ও wa.me fallback দুই পথেই)। `tests/payment-entry.spec.cjs` লগইন পেজ থেকে সরাসরি প্রবেশ (পেমেন্ট কাউন্টার ট্যাব ও শিক্ষার্থী লগইন ঘরে আইডি+PIN → অটো-লগিন), কীপ্যাড, মাধ্যমের পিল, স্থির “টাকা নিন” বার ও আজকের তালিকা যাচাই করে।

ব্রাউজার ছাড়াও একই ফ্লো ইউনিট টেস্টে ঢাকা আছে (`npm test`): `tests/payment-auth.test.mjs` শেয়ারড কাউন্টার ক্রেডেনশিয়াল/সেশন/PIN নিয়ম, `tests/payment-desk.test.mjs` আসল `payment.html` + `js/payment.js` jsdom-এ চালিয়ে এন্ট্রি গার্ড, সার্চ, কীপ্যাড-কালেকশন, durable সেভ, রসিদ মোডাল, আজকের সারাংশ ও লগআউট, `tests/login-payment-entry.test.mjs` আসল `index.html` + `js/login.js` চালিয়ে অটো-লগিন হ্যান্ডঅফ (শিক্ষার্থী অ্যাপ খোলে না) এবং `tests/payment-autologin.test.mjs` সেশন থাকলে এন্ট্রি ফর্ম ছাড়াই ডেস্ক খোলা যাচাই করে।

Runtime আগের মতো static HTML/CSS/JS; npm শুধু development tests-এর জন্য (Node 22+, Python 3):

```sh
npm ci
npm test
npx playwright install --with-deps chromium
npm run test:e2e
```

Unit tests: search normalization, মাস/বছর, partial/overpayment, fee defaults, sorting, persistence/error ও receipt escaping। Browser tests: 320/390/1280px workflow, direct PDF download/validation, refresh persistence, double-submit, no print popup, download failure/retry, long Bengali text, keyboard focus, storage failure, status, ledger shortcut এবং offline PWA। আগে থেকে Chromium থাকলে `CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:e2e` ব্যবহার করা যায়।

## অফলাইন নকশা ও মডিউল কাঠামো

কোনো external font, CDN বা remote API ব্যবহার করা হয়নি। HTML শুধু page structure রাখে; feature logic ও style আলাদা module-এ ভাগ করা হয়েছে।

```text
index.html              page structure and SVG icon sprite
admin.html              dummy Admin Panel — এক ক্লিকে প্রবেশের entry screen + panel
styles.css              CSS entry point (feature imports)
css/
  admin.css             Admin Panel styles (mobile entry screen, summary, navigation, modal)
  tokens.css            design tokens and reset (ShopLedGer palette)
  auth.css              login, registration and recovery
  dashboard.css         student home dashboard (ShopLedGer-style home)
  routine.css           routine timeline
  courses.css           courses and progress
  results.css           results cards
  profile.css           profile and settings
  shell.css             app header (two-row topbar) and shell
  navigation.css        bottom navigation (mint icon chips)
  overlays.css          modals, install and toast
  responsive.css        responsive rules
  glass.css             flat solid-card layer (formerly translucent glass)
  theme.css             time-of-day topbar strip tint
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
  admin.js              Admin Panel UI: views, actions, modals
  payment.js            Standalone Payment Receive desk: search, payment, receipt, WhatsApp
  report-generator.js   Admin report center: offline branded PDF + Excel-ready CSV
  admin-data.js         dummy student/notice/enrollment dataset
```

ভবিষ্যতে Admin Panel-এর **শিক্ষার্থী অ্যাপ ম্যানেজমেন্ট** অংশ থেকে enabled class, routine, course, notice ও result data নিয়ন্ত্রণ করার জন্য config ও storage adapter আলাদা রাখা হয়েছে। API যুক্ত করার সময় মূল UI feature files বদলানোর প্রয়োজন হবে না।

## লোকালি চালানো

Service worker চালানোর জন্য একটি static server ব্যবহার করুন:

```bash
python3 -m http.server 4173
```

তারপর Chrome-এ `http://localhost:4173` খুলুন। PWA install এবং offline cache দেখতে প্রথমে একবার পেজ লোড করে Chrome DevTools-এর Application → Service Workers থেকে পরীক্ষা করা যায়।

ডামি এডমিন প্যানেল দেখতে `http://localhost:4173/admin.html` খুলুন — পাসওয়ার্ড লাগবে না, এক ক্লিকেই প্যানেলে ঢুকে যাওয়া যাবে।

GitHub Pages-এ প্রকাশ করলেও relative asset path ব্যবহার করা হয়েছে, তাই repository subpath থেকেও অ্যাপটি চলবে।

## ব্যবহার

1. Chrome-এ পেজটি খুলুন।
2. Chrome-এর install icon বা অ্যাপের install prompt চাপুন।
3. ইনস্টল হওয়ার পর হোম স্ক্রিন থেকে **Active Plus** খুলুন।
4. প্রোফাইল থেকে নাম, শ্রেণি ও বিভাগ বদলালে তথ্য এই ডিভাইসেই সংরক্ষিত থাকবে।

পরবর্তী ধাপে authenticated API ও অনলাইন ডেটাবেস দিয়ে প্রকৃত শিক্ষক অ্যাকাউন্ট, অনুমোদন ও একাধিক ডিভাইসে সমন্বয় যোগ করতে হবে।


## আলাদা শিক্ষক প্যানেল

`teacher.html` খুলুন অথবা শিক্ষার্থী লগইন পেজ / **Admin → আরও → শিক্ষক প্যানেল** থেকে যান। এক ক্লিকে প্রবেশ করা যায়; পরিচয়টি স্পষ্টভাবে **লোকাল ডেমো**, প্রকৃত নিরাপদ শিক্ষক লগইন নয়।

- পাঁচটি ফুটার: **হোম / পরীক্ষা / বাড়ির কাজ / রুটিন / আরও**। আরও-তে সাজেশন ও অনুমোদিত শিক্ষার্থী খোঁজা যায়। খালি সার্চে শিক্ষার্থী তালিকা আসে না।
- পরীক্ষা: বিষয়, শ্রেণি/বিভাগ, তারিখ, সময়, সময়কাল, পূর্ণমান, স্থান এবং সিলেবাস/প্রশ্নের নির্দেশনা। প্রকাশের পরে প্রত্যেক অনুমোদিত শিক্ষার্থীর নম্বর (শূন্যসহ, ০.৫ ধাপে) দেওয়া যায়। এটি স্বয়ংক্রিয় অনলাইন পরীক্ষা/কুইজ ইঞ্জিন নয়।
- পরীক্ষার PDF বাস্তব প্রশ্নপত্রের মতো: হেডারে লোগো ও 'প্রশ্নপত্র' শিরোনাম, প্রশ্নের নিচে MCQ অপশন **দুই কলামে (ক খ / গ ঘ)**, আর পেজ নম্বর হেডারে না দেখিয়ে **ফুটারে** 'পৃষ্ঠা ১ / ২'। পরীক্ষা শেষ হলে শিক্ষার্থী/শিক্ষক **সঠিক উত্তরপত্র** আলাদা পেজে ডাউনলোড করতে পারেন — উপরে ৬-কলামের উত্তর-গ্রিড, এরপর প্রতিটি প্রশ্নে সঠিক অপশন সবুজ হাইলাইট ও শিক্ষার্থীর উত্তর সঠিক/ভুল মন্তব্য। দুই-পাস রেন্ডারে প্রতিটি অংশের সঠিক মোট পেজ গোনা হয়; সব PDF অফলাইন canvas render, print dialog নেই।
- বাড়ির কাজ: নির্দেশনা, জমার শেষ তারিখ/সময়, সহায়ক লিংক; শিক্ষার্থী **কাজ সম্পন্ন হয়েছে জানাও** দিয়ে নিজের সম্পন্ন হওয়ার খবর দিতে পারে। শিক্ষক বাকি/সম্পন্ন/দেখা হয়েছে অবস্থা রাখেন। এটি খাতা বা ফাইল আপলোড নয়।
- সাজেশন: পাঠ্য নোট ও HTTP(S) উপকরণের লিংক।
- **সহায়ক উপকরণ (শিক্ষার্থী কোর্স কার্ড)** — পপ-আপে **পুরো কাজটি দেখা যায়** (তারিখ/স্থান/পূর্ণমান, নির্দেশনা, শিক্ষক), নিচের **ডাউনলোড করুন** চাপলেই অটো ডাউনলোড: (১) শিক্ষক বাইরের লিংক দিলে **ডাউনলোড করুন** ফাইলটি সরাসরি ডাউনলোড করে (fetch + অ্যাপের নিজস্ব downloadBlob, অফলাইনেও; ব্লক থাকলে নতুন ট্যাবে); (২) লিংক না থাকলে **উপকরণ PDF ডাউনলোড করুন** — কাজের শিরোনাম, তারিখ, নির্দেশনা দিয়ে `js/material-pdf.js` বান্ডেলড বাংলা ফন্ট থেকে ব্র্যান্ডেড PDF **অ্যাপের ভেতরেই অফলাইনে তৈরি** করে (`ActivePlus-material-<ধরন>-<তারিখ>.pdf`)। ইমেজ জেনারেট শুধু পেমেন্ট পোর্টালের রসিদে; আগের ডেমো ডেটার পুরনো ফাইল-লিংক প্রথম লোডেই মুছে ফেলা হয়। ফন্টে না থাকা ↗ তীর-চিহ্নের বদলে ইনলাইন SVG।
- রুটিন: নির্দিষ্ট তারিখের ক্লাস, সময়, রুম ও উপস্থিতি (উপস্থিত/অনুপস্থিত/দেরিতে)। একই শিক্ষকের প্রকাশিত ক্লাস/পরীক্ষার সময় মিলে গেলে সংরক্ষণ বাধা দেয়; এটি পুনরাবৃত্ত সাপ্তাহিক সময়সূচি নয়।
- প্রতিটি কাজ খসড়া বা প্রকাশিত রাখা, সম্পাদনা ও নিশ্চিত করে মুছে ফেলা যায়। অগ্রগতি থাকলে শ্রেণি/বিভাগ পরিবর্তন অথবা সংরক্ষিত নম্বরের নিচে পূর্ণমান নামানো যাবে না। মুছে ফেললে সংশ্লিষ্ট নম্বর/অগ্রগতিও মুছবে।
- শিক্ষার্থীর **কোর্স** অংশে শুধু তার শ্রেণি/বিভাগের প্রকাশিত কাজ; **রুটিন**-এ ক্লাস/উপস্থিতি; **ফলাফল**-এ তার নিজের নম্বর দেখা যায়। পুরোনো স্থির সারাংশ/কোর্সগুলোকে ডেমো তথ্য হিসেবে আলাদা চিহ্নিত করা হয়েছে।
- মোবাইলের fixed header/footer, স্বাধীন মাঝের স্ক্রল, এক-কলামের ফর্ম ও টাচ-উপযোগী মডাল বজায় আছে। প্রথমবার cache পূর্ণ হলে শিক্ষক প্যানেলও অফলাইনে চলে।

### ডেটা ও ভবিষ্যৎ API

`js/teaching-data.js`-এর async `teachingRepository` পদ্ধতি (`list`, `listStudents`, `saveActivity`, `deleteActivity`, `saveProgress`, `markHomeworkDone`) API adapter দিয়ে প্রতিস্থাপনযোগ্য। শিক্ষক UI `js/teacher.js`; শিক্ষার্থী feed `js/student-teaching.js`; shared style `css/teaching.css`।

একাডেমিক ডেটার পৃথক versioned localStorage key **`activePlus.teaching.v1`**; বিদ্যমান Student ও Transaction গঠন বদলানো হয়নি। অনুমোদিত ডামি roster-এর সঙ্গে বর্তমানে সংরক্ষিত active student account ID দিয়ে deduplicate করা হয়। Admin-এর সাময়িক demo approval এখানে স্বয়ংক্রিয় স্থায়ী approval হিসেবে গণ্য হয় না।

লেখার আগে সর্বশেষ snapshot পড়া হয়; সমর্থিত ব্রাউজারে Web Locks ব্যবহার হয়। স্টোরেজ লেখা সফল হওয়ার পরেই UI সফলতা দেখায়। ফর্ম ব্যর্থ হলে ইনপুট থাকে; ক্ষতিগ্রস্ত একাডেমিক ডেটা স্বয়ংক্রিয়ভাবে reset/overwrite হয় না। একই origin/browser-এর অন্য ট্যাব storage event দিয়ে কাজ ও অগ্রগতি পায়।

**সীমা:** এটি local-only demo; যে কেউ শিক্ষক পেজ খুলতে পারে। এটি সার্ভার-ভিত্তিক role authorization, ব্যক্তিগত ফলাফলের নিরাপত্তা, cloud backup বা এক মোবাইল থেকে অন্য মোবাইলে বিতরণ দেয় না। ব্রাউজারের site data মুছলে লোকাল কাজ হারাবে। বাস্তবে চালুর আগে শিক্ষক authentication, assignment-based permissions, server-side student/grade access checks, স্থায়ী database ও backup দরকার।

### যাচাই

```bash
npm install
npm test
npm run test:e2e
```

Browser suite চালাতে Playwright Chromium বা `CHROMIUM_EXECUTABLE` দিয়ে compatible Chromium লাগবে। Teacher tests-এ CRUD, scope/draft isolation, নম্বর, homework self-report/review, উপস্থিতি, সময়ের সংঘর্ষ, সংরক্ষণ ব্যর্থতা, corrupt storage, offline cache, roster search ও mobile fixed-shell layout যাচাই করা হয়। Finance ও আগের navigation/mobile regression tests-ও রাখা হয়েছে।


## স্থায়ী নিবন্ধন নম্বর ও ডিফল্ট PIN

- প্রথম নিবন্ধনের মোবাইলই স্থায়ী login ID। প্রোফাইলের মূল নম্বর readonly; পরিবর্তিত form payload-ও সেটি বদলায় না। অতিরিক্ত নম্বর **প্রোফাইল সম্পাদনা → নতুন মোবাইল নম্বর যোগ করুন** থেকে append করা যায়। আগের নম্বর বাদ দেওয়া/প্রতিস্থাপন করার UI নেই; অতিরিক্ত নম্বর login/recovery ID নয়।
- `js/account-policy.js` শিক্ষার্থী ও ভবিষ্যৎ শিক্ষক অ্যাকাউন্টের একই policy: `registrationMobile`, append-only `additionalMobiles`, বাংলা/ইংরেজি/local/+880 normalization, duplicate validation। এই দুই additive field Account-এ রাখা হয়েছে; Student/Transaction-এর গঠন বদলানো হয়নি।
- `config.js`-এ এক জায়গায় `DEFAULT_PIN = '123123'`। নতুন নিবন্ধন, শিক্ষার্থী demo, Admin entry ও PIN-reset default এই মান ব্যবহার করে। নিবন্ধন/নিরাপত্তা প্রশ্নের recovery-তে নিজের PIN বেছে নেওয়া যায়। পুরোনো custom PIN স্বয়ংক্রিয়ভাবে reset করা হয় না। Admin reset-এর ক্ষেত্রে একই ব্রাউজারের matching account থাকলে নিশ্চিত করার পরেই default PIN সংরক্ষিত হয়; অন্য dummy roster-এর PIN সত্যিই বদলেছে বলা হয় না।
- পুরোনো অ্যাকাউন্টের বর্তমান সংরক্ষিত login mobile স্থায়ী নম্বর হিসেবে নেওয়া হয়। পূর্বে বদলে যাওয়া আসল নম্বরের history এই অ্যাপে নেই; সেটি পুনরুদ্ধার করা যায় না। আলাদা legacy profile contact থাকলে সেটিকে অতিরিক্ত নম্বর হিসেবে রাখা হয়।
- `persistAccount` সর্বশেষ saved account থেকে মূল নম্বর/আগের অতিরিক্ত নম্বর ধরে রাখে এবং লিখে সফল snapshot ফেরত দেয়। ব্যর্থ সংরক্ষণে নতুন contact/PIN সফল হয়েছে দেখায় না।
- **শিক্ষকের প্রকৃত registration/account-management এখনও যুক্ত হয়নি**; শিক্ষক প্যানেল এক-ক্লিক demo-ই আছে। Shared policy শিক্ষক account payload দিয়েও পরীক্ষিত, কিন্তু নতুন শিক্ষক provisioning/login যুক্ত করার সময় সেটি repository ও server-এ প্রয়োগ করতে হবে। এটি কার্যকর online teacher authentication দাবি করে না।
- একই পরিচিত default PIN নিরাপদ production credential নয়। অনলাইন চালুর আগে secure authentication, hashed passwords, প্রথম লগইনে PIN পরিবর্তন এবং server-side immutable-number enforcement প্রয়োজন। Local storage হাতে বদলানো/মুছে ফেলা এই demo দিয়ে আটকানো যায় না।

## “পরীক্ষা নিন” — অনুমোদনসহ পরীক্ষার লোকাল কর্মপ্রবাহ

### কোথায় পাবেন

- **শিক্ষক → আরও → পরীক্ষা নিন:** MCQ / লিখিত / সংক্ষিপ্ত উত্তর আলাদা তৈরি, প্রশ্ন পেস্ট, preview, খসড়া, অনুমোদনের আবেদন, ক্লাস পরীক্ষার নম্বর ও উপস্থিতি। আগের শিক্ষক footer-এর “পরীক্ষা” অংশ শুধু পুরোনো class assessment records; নতুন অনুমোদিত online workflow আলাদা।
- **Admin → আরও → পরীক্ষা নিন:** অপেক্ষমাণ পরীক্ষা দেখুন, প্রশ্ন/সঠিক উত্তর/নম্বর যাচাই করুন, প্রয়োজনে negative marking বদলে অনুমোদন দিন অথবা কারণ লিখে ফেরত দিন। প্রকাশিত প্রশ্ন পরিবর্তন/মুছে ফেলা বন্ধ।
- **শিক্ষার্থী → হোম/কোর্স → পরীক্ষা দাও:** সব শ্রেণির জন্য প্রকাশিত পরীক্ষা, MCQ-তে অংশগ্রহণ, লিখিত/সংক্ষিপ্ত প্রশ্নপত্র ডাউনলোড, নিজের ও সবার ফলাফল। ফলাফল পাতাতেও প্রবেশের বাটন আছে। Footer আগের পাঁচটিই।

প্রতি পরীক্ষায় একটি বিষয়; একই দিনে একাধিক পরীক্ষা তৈরি করা যায়। Draft/pending/rejected পরীক্ষা শিক্ষার্থীর UI-তে আসে না। সব অনুমোদিত শ্রেণি/বর্ষ একসঙ্গে অংশ নিতে পারে।

### প্রশ্নের টেমপ্লেট

সম্পাদক থেকে **টেমপ্লেট কপি করুন**, নিজের প্রশ্ন লিখে **প্রশ্ন পেস্ট করুন** ঘরে বসান। সঙ্গে সঙ্গে প্রশ্ন ও মোট নম্বরের preview তৈরি হবে। Copy permission না পেলে template text নির্বাচন করে মোবাইলের Copy ব্যবহার করুন।

```text
প্রশ্ন: বাংলাদেশের রাজধানী কোনটি?
নম্বর: ২
A: ঢাকা
B: চট্টগ্রাম
C: খুলনা
D: রাজশাহী
উত্তর: A
---
প্রশ্ন: ৫ + ৩ = কত?
নম্বর: ৩
A: ৬
B: ৭
C: ৮
D: ৯
উত্তর: C
```

লিখিত/সংক্ষিপ্ত প্রশ্নে শুধু `প্রশ্ন:` ও `নম্বর:` থাকবে। প্রতিটি field এক লাইনে; প্রশ্নের মাঝে `---`। ১–১০০ প্রশ্ন; প্রশ্নে ০.০১–১০০০ নম্বর, মোট সর্বোচ্চ ১০,০০০। বাংলা/ইংরেজি সংখ্যা গ্রহণ করে। প্রশ্ন/অপশন শুধু লেখা—HTML execute হয় না। অসম্পূর্ণ প্রশ্ন, duplicate field/option, invalid answer key ও invalid marks প্রত্যাখ্যাত হয়; ইনপুট থাকে।

### নির্ধারিত নিয়ম

- MCQ: সবার একই start/end timestamp; প্রথমবার ঢোকার grace window শিক্ষক নির্ধারণ করেন (কমপক্ষে ১ মিনিট)। Question এবং option order প্রতিটি attempt-এ shuffle হয় ও persist হয়; reload-এ বদলায় না। সব প্রশ্ন এক স্ক্রিনে; আগের উত্তর বদলানো যায়।
- প্রতি ভুল উত্তরে নির্ধারিত points কাটা হয়, অনুত্তরিতে ০। মোট নম্বরের সর্বনিম্ন ০। প্রশ্নভেদে আলাদা positive marks। জমা হলেই score, সঠিক/ভুল/অনুত্তরিত সংখ্যা ও grade; সঠিক উত্তর তখন দেখানো হয় না।
- **Running-average retake:** ওই মুহূর্তে জমা হওয়া প্রথম প্রচেষ্টাগুলোর গড়ের নিচে প্রথম score হলে দ্বিতীয়বার শুরু করা যায়। মোট দুইবার; প্রথম entry grace window দ্বিতীয়বারে প্রযোজ্য নয়, কিন্তু একই end time কঠোরভাবে থাকে। গড় পরে কমলেও শুরু করা দ্বিতীয় attempt বাতিল হয় না। দ্বিতীয় score গড় নির্ধারণে ব্যবহার হয় না। Rank/grade-এ দুই প্রচেষ্টার সেরা score; সমান score-এ সমান competition rank।
- Grades: configurable pass percentage (default 33); তার নিচে F। বাকি ক্ষেত্রে 80+ A+, 70+ A, 60+ A−, 50+ B, 40+ C, অন্যথায় D। Retake eligibility এই pass percentage নয়, চলমান গড় দিয়ে ঠিক হয়।
- লিখিত ও সংক্ষিপ্ত: release time থেকে প্রশ্নপত্রের PDF পাওয়া যায়, পরে আবারও ডাউনলোড করা যায়। বাংলাদেশ সময় release date-এর পরের দিন ক্লাসে খাতায় পরীক্ষা। কোনো answer-upload বা automatic written grading নেই। শিক্ষক প্রতিটি প্রশ্নের নম্বর দেন অথবা অনুপস্থিত হিসেবে রাখেন; নম্বর থাকলে সরাসরি absent করা যায় না।
- Public result cards: নাম, শ্রেণি, score, grade, rank এবং MCQ question counts; মোবাইল/অভিভাবকের নম্বর নয়। Teacher/Admin report-এ অংশগ্রহণ, queued/active submission count এবং অনুপস্থিত/নম্বর বাকি তালিকা; CSV সরাসরি ডাউনলোড (spreadsheet formula escaping-সহ)।

### অফলাইন ও PDF

`activePlus.exams.v1`-এ exam ও attempts আলাদা domain হিসেবে থাকে; Student/Transaction schema বদলায়নি। প্রতিটি answer save durable হওয়ার পরেই saved count বদলায়। প্রশ্ন প্রথম load-এ local থাকে। Offline finish/deadline-এ attempt **queued**, উত্তর লক; browser online হলে submission/score sync হয়। App বন্ধ/স্থগিত থাকলে পুনরায় খুললেই expired attempt lock/sync হয়। একই exam/student-এর duplicate start/resubmit নতুন attempt বা duplicate score তৈরি করে না। Web Locks দিয়ে একই browser-এর concurrent writes serialize হয়।

সবার end time-এর আগে answer-key PDF নিষিদ্ধ। End time এলে অংশগ্রহণকারীর খোলা/দৃশ্যমান app স্বয়ংক্রিয় direct download শুরু করার চেষ্টা করে; browser বাধা দিলে বা asset failure হলে manual PDF button থাকে। App বন্ধ অবস্থায় download চলবে না। Browser download initiation মানেই ফাইল সত্যিই ফোনে save হয়েছে—এমন দাবি করা হয় না। পরে আবার download করা যায়।

`js/exam-pdf.js` bundled Bengali font ও logo দিয়ে canvas-rendered, paginated A4 PDF বানায় (প্রশ্ন, আলাদা marks, correct answers এবং নিজের নির্বাচিত উত্তর); external CDN/PDF service, print dialog নেই। PDF-টি image-based; selectable text PDF নয়।

### বাস্তব বহু-মোবাইল পরীক্ষা চালুর আগে

**এটি কার্যকর local workflow demo, production online exam service নয়।** `examRepository` (`js/exam-data.js`) async API seam; authoring `js/exam-manager.js`, student runtime `js/student-exams.js`, shared reports `js/exam-ui.js`। সব পেজ একই origin/browser storage ব্যবহার করে। অন্য ফোন/ব্রাউজারে teacher approval, submissions, running average বা leaderboard এখনও পৌঁছাবে না। এখানে “online sync” মানে এই browser-এর offline queue স্থানীয় জমাকৃত অবস্থায় যায়—কোনো remote server acknowledgement নেই।

বর্তমান demo teacher/admin role client-side, প্রশ্নের answer key local storage-তেই আছে এবং device clock/client data বদলানো যায়। UI-তে answer key withheld থাকলেও এটি পরীক্ষার গোপনীয়তা বা cheating prevention নয়। বাস্তব চালুর জন্য authenticated teacher/student/admin accounts, server-side permissions, server-authoritative clock/eligibility/grading, answer-key isolation until global end, durable exam/attempt database, idempotent sync endpoint, conflict policy এবং offline answer timing গ্রহণের স্পষ্ট server policy আবশ্যক। ছাত্রের ফোনের timestamp একা বিশ্বাস করা যাবে না। Teacher registration/provisioning আগের মতো এখনও পৃথক pending কাজ।

Tests: template parser/validation, approval transitions/ownership, timing/grace, all-class eligibility, shuffle/resume, negative/weighted grading, running-average retry, best-score rank, offline locking/idempotent sync, written marks/absence, failed/corrupt writes, multi-page PDF structure, end-time auto PDF, direct CSV, and mobile 320/390/landscape/wide layout—সঙ্গে আগের সব regression tests।

## পূর্ণ নমুনা ডেটা দিয়ে অ্যাপ যাচাই

ডিফল্টভাবে **ডেমো ডেটা ও ফর্ম অটোফিল চালু**। প্রতিটি প্যানেল খোলার আগে নতুন নমুনা একবার যোগ হয়; আগের অ্যাকাউন্ট, নম্বর, PIN ও নিজে তৈরি রেকর্ড প্রতিস্থাপন হয় না।

- শিক্ষার্থী ডেমো লগইন: **01700000000 / 123123**। ফর্মের Login অথবা এক-ক্লিক ডেমো বাটন দুটোই ব্যবহারযোগ্য, তবে শুধু আগে অ্যাকাউন্ট না থাকলে। প্রোফাইলে পরিচয়, অভিভাবক, জন্মতারিখ, প্রতিষ্ঠান, ঠিকানা, রোল ও রেজিস্ট্রেশন নম্বরের নমুনা আছে। ডেমো recovery: প্রথম নিরাপত্তা প্রশ্ন, উত্তর **রাইসা**। বিদ্যমান অ্যাকাউন্টের নিজস্ব PIN অপরিবর্তিত।
- ৮টি নতুন পরীক্ষার উদাহরণ: এখনই শুরু করা যায় এমন MCQ, আসন্ন MCQ, সম্পন্ন MCQ, লিখিত, সংক্ষিপ্ত, অনুমোদনের অপেক্ষমাণ, খসড়া ও ফেরত দেওয়া পরীক্ষা। ৭টি নমুনা উত্তরপত্র/ফলাফল এবং চলমান গড় দিয়ে retake যাচাই করা যায়। লিখিত/সংক্ষিপ্ত পরীক্ষায় নম্বর ও অনুপস্থিতির উদাহরণও আছে।
- শিক্ষক অংশে ৫টি নমুনা পরীক্ষা/বাড়ির কাজ/সাজেশন/ক্লাস, নম্বর, জমার অবস্থা ও উপস্থিতি। সহায়ক লিংক ছাড়া কাজে **উপকরণ PDF ডাউনলোড করুন** বাটন বান্ডেলড বাংলা ফন্ট থেকে অফলাইনে ব্র্যান্ডেড PDF বানায়; কোনো প্রি-বিল্ট ইমেজ/ফাইল অ্যাসেট নেই।
- নতুন, অসংরক্ষিত finance ledger-এ সাম্প্রতিক তারিখসহ ৭টি নমুনা লেনদেন/রসিদ। **আগে সংরক্ষিত ledger-এ কোনো কৃত্রিম টাকা যোগ হয় না**, এমনকি সেটি খালি হলেও।
- লগইন, নিবন্ধনের পাঁচ ধাপ, প্রোফাইল, শিক্ষক কাজ তৈরি, অনলাইন পরীক্ষার template, grade/review, ফি, নোটিশ ও রুটিনের খালি ঘরে উদাহরণ বসে। readonly পরিচয়, hidden record ID, actual MCQ radio answer, consent checkbox কিংবা আগে লেখা মান বদলায় না। ব্যবহারকারী ঘর মুছে দিলে সেটি সেই form session-এ ফাঁকাই থাকে; ফাঁকা student search আগের মতো তালিকা দেখায় না। নমুনা বসানো নিজে থেকে form submit, approval, grade publication বা payment করে না।

পাতার **ডেমো ডেটা চালু** মেনু থেকে খালি ঘরে আবার উদাহরণ বসানো বা **নতুন সময়ের পরীক্ষার নমুনা** যোগ করা যায়। নতুন batch যোগ করলে পুরোনো পরীক্ষা/উত্তর অপরিবর্তিত থাকে। প্রথম batch reload-এ duplicate হয় না; মুছে দেওয়া নমুনা পুনরায় নিজে থেকে ফিরে আসে না। সময় শেষ হওয়া পুরোনো নমুনা পরীক্ষার কারণে অনাকাঙ্ক্ষিত automatic PDF download হয় না; ফলাফল থেকে manual PDF পাওয়া যায়। বাস্তবে নতুন করে অংশ নেওয়া attempt-এ deadline auto-PDF নিয়ম আগের মতোই কাজ করে।

অটোফিল বন্ধ করার বাটন আছে। আবার চালু করতে Login/Entry পেজের **নমুনা ডেটা ও অটোফিল চালু করুন** চাপুন; ফোন থেকেই করা যায়, site data মুছতে হয় না। mode key `activePlus.demo.autofill.v1`; বন্ধ করলে নমুনা/ব্যবহারকারীর সংরক্ষিত ডেটা মুছে যায় না। ক্ষতিগ্রস্ত ডেটা বা storage failure হলে seed দিয়ে overwrite হয় না।

`js/demo-data.js`-এ additive fixture builder/seed, `js/demo-forms.js`-এ visible-field defaults ও mobile controls। `tests/demo-preview.spec.cjs` default populated experience পরীক্ষা করে। অন্যান্য workflow regression tests `tests/fixtures.cjs` দিয়ে auto-seeding বন্ধ রেখে নির্দিষ্ট data scenario পরীক্ষা করে; domain validation/security guards bypass করে না।

### নোটিশ ও কাজের বোর্ড যাচাই

`tests/notices-learning.spec.cjs` একক নোটিশ প্রবেশপথ, পড়ার অবস্থা, রিলোড/অফলাইন, একই ডিভাইসের ট্যাব, আলাদা শিক্ষার্থী, ঘোষণার পরিবর্তন, corrupt storage এবং ৩২০/৩৯০/৪৮০px কাজের বোর্ড যাচাই করে। নোটিশ ইনবক্সের উৎস বর্তমানে নমুনা নোটিশ ও লোকাল App Settings-এর ঘোষণা; Admin-এর পৃথক নোটিশ CRUD এখনো এই ইনবক্সের সঙ্গে সংযুক্ত নয়। পড়ার রেকর্ড `activePlus.notices.read.v1:<student-id>`-এ থাকে, অন্য ডিভাইসে sync হয় না। স্টোরেজে লেখা না গেলে শুধু চলতি সেশনে পড়া হিসেবে থাকে এবং সতর্কবার্তা দেখায়।
��া/ব্যবহারকারীর সংরক্ষিত ডেটা মুছে যায় না। ক্ষতিগ্রস্ত ডেটা বা storage failure হলে seed দিয়ে overwrite হয় না।

`js/demo-data.js`-এ additive fixture builder/seed, `js/demo-forms.js`-এ visible-field defaults ও mobile controls। `tests/demo-preview.spec.cjs` default populated experience পরীক্ষা করে। অন্যান্য workflow regression tests `tests/fixtures.cjs` দিয়ে auto-seeding বন্ধ রেখে নির্দিষ্ট data scenario পরীক্ষা করে; domain validation/security guards bypass করে না।

### নোটিশ ও কাজের বোর্ড যাচাই

`tests/notices-learning.spec.cjs` একক নোটিশ প্রবেশপথ, পড়ার অবস্থা, রিলোড/অফলাইন, একই ডিভাইসের ট্যাব, আলাদা শিক্ষার্থী, ঘোষণার পরিবর্তন, corrupt storage এবং ৩২০/৩৯০/৪৮০px কাজের বোর্ড যাচাই করে। নোটিশ ইনবক্সের উৎস বর্তমানে নমুনা নোটিশ ও লোকাল App Settings-এর ঘোষণা; Admin-এর পৃথক নোটিশ CRUD এখনো এই ইনবক্সের সঙ্গে সংযুক্ত নয়। পড়ার রেকর্ড `activePlus.notices.read.v1:<student-id>`-এ থাকে, অন্য ডিভাইসে sync হয় না। স্টোরেজে লেখা না গেলে শুধু চলতি সেশনে পড়া হিসেবে থাকে এবং সতর্কবার্তা দেখায়।
