# SSC Prep — Assessment Module

SSC প্রস্তুতির জন্য একটি স্বয়ংসম্পূর্ণ assessment অ্যাপ: **Tailwind CSS + vanilla JS + JSON**, কোনো ফ্রেমওয়ার্ক, বিল্ড টুল বা ব্যাকএন্ড নেই। এটি repo-র মূল PWA-এর (`/index.html`) পাশে `ssc-prep/` ফোল্ডারে আলাদাভাবে থাকে — দুটি একে অপরের ফাইল স্পর্শ করে না।

চারটি ফিচার:

1. **অধ্যায়ভিত্তিক MCQ প্র্যাকটিস** — অধ্যায়/কঠিনতা/সংখ্যা বেছে নিয়ে সঙ্গে সঙ্গে সঠিক-ভুল + ব্যাখ্যা।
2. **টাইড মডেল টেস্ট ও লাইভ এক্সাম** — কাউন্টডাউন, নেগেটিভ মার্কিং, সময় শেষে auto-submit, জমার পরপরই ফলাফল।
3. **সৃজনশীল প্রশ্ন (CQ)** — উদ্দীপক + ক/খ/গ/ঘ, নম্বরের সিঁড়ি, মডেল উত্তর দেখানোর টগল ও স্ব-মূল্যায়ন।
4. **পারফরম্যান্স ড্যাশবোর্ড** — গড়, GPA, streak, অধ্যায়ভিত্তিক শক্তি/দুর্বলতা, টপিক ও skill টেবিল।

## চালানো

```bash
cd ssc-prep
python3 -m http.server 4173      # অথবা যেকোনো static server
# → http://localhost:4173
```

`file://` দিয়ে খুলো না — ESM import এবং `fetch('data/questions.json')` দুটোরই HTTP origin লাগে (browser CORS)।

## ফাইল বিন্যাস

```
ssc-prep/
├── index.html              # শুধু shell: Tailwind config, #app, টোস্ট + দুটি ডায়ালগ
├── app.css                 # Tailwind যেগুলো পারছে না সেগুলো: active tab, print, .pop
├── data/questions.json     # একমাত্র ডেটা উৎস (questions bank + sets + grading)
├── js/
│   ├── exam-logic.js       # শুদ্ধ তর্ক (pure) — DOM নেই, Node-এ টেস্ট করা যায়
│   ├── storage.js          # localStorage key + লোড/সেভ, প্রতিটি লেখা try/catch
│   ├── ui-kit.js           # esc(), $, delegation, modal, toast
│   └── app.js              # view router + সব টেমপ্লেট + state
└── tests/exam-logic.test.mjs
```

নিয়মটা repo-র বাকি অংশের মতোই: **HTML-এ শুধু গঠন**, প্রতিটি ফিচারের যুক্তি `js/`-এ, স্টাইল আলাদা CSS-এ, আর ডেটা একটা JSON-এ। UI ফাইল না ছুঁয়েই Admin Panel থেকে JSON বসলেই চলবে — সে-সামঞ্জস্যটা `window.SSC_DATA` / `window.SSC_DATA_URL` দিয়ে রাখা হয়েছে:

```js
// সার্ভার-চালিত ডেটা দিতে চাইলে index.html-এর module script-এর আগে:
window.SSC_DATA_URL = 'https://…/ssc/questions.json';
// অথবা পুরো payload inline:
window.SSC_DATA = { subjects: {…}, chapters: {…}, questions: {…}, sets: […], grading: {…} };
```

## JSON চুক্তি

| Key | কী থাকে |
| --- | --- |
| `subjects` | `{ [id]: { name, icon } }` |
| `chapters` | `[{ id, subjectId, number, name }]` — অধ্যায়ভিত্তিক ফিল্টার এখান থেকেই |
| `questions.mcq[]` | `id, chapterId, subjectId, difficulty (easy/medium/hard), topic, marks, stem, options[{id,text}], answer (A–D), explanation` |
| `questions.cq[]` | `id, chapterId, subjectId, difficulty, stimulus, parts[{ label (ক–ঘ), skill, marks, question, modelAnswer, hint }]` |
| `sets[]` | `id, kind (practice/model/live), title, chapterId, durationMin, negativePerWrong, passPercent, shuffle{questions,options}, questionIds, description` — `live`-এ আরও: `window{opensAt,closesAt}`, `proctoring`, `instructions` |
| `grading` | `scale[{min,gpa,grade}]` ও `passPercent` |

গ্রডিং নিয়ম (`js/exam-logic.js`):

- MCQ: সঠিক = `marks`, ভুল = `negativePerWrong` কাটা, খালি = ০। `score` ০-এর নিচে নামে না, তবে `raw` নেগেটিভ থাকতে পারে (রিপোর্টে দেখা যায়)।
- CQ স্ব-মূল্যায়ন: `full` = পূর্ণ নম্বর, `partial` = অর্ধেক, `none` = ০।
- GPA: `grading.scale` থেকে percentage অনুযায়ী; খালি/ভুল scale হলে `grade: '—'`।
- Countdown: `deadline = min(startedAt + durationMin, window.closesAt)`; লাইভ পরীক্ষার উইন্ডো বন্ধ থাকলে কার্ডে *শুরু হতে…* / *সময় শেষ* দেখায়, শুরু বোতাম নিষ্ক্রিয়।

## সংরক্ষণ (localStorage)

| Key | কী |
| --- | --- |
| `ssc-prep-results-v1` | জমা দেওয়া প্রতিটি attempt-ের ফলাফল (স্কোর, প্রতি প্রশ্নের অবস্থা, auto-submit পতাকা) |
| `ssc-prep-draft-v1` | চলমান session-এর খসড়া — `{ [setId]: { answers, flags, deadline, startedAt } }` |
| `ssc-prep-cq-v1` | CQ স্ব-মূল্যায়ন (`{ key, skill, earned, max }` প্রতি অংশে) — ড্যাশবোর্ডের skill বারে বসে |
| `ssc-prep-theme-v1` | light/dark |

ট্যাব বন্ধ করলেও খসড়া থাকে: তালিকার কার্ডে **“চালিয়ে যাও (৩/৮)”** দেখাবে; আবার ঢুকে সময় শেষ থাকলে সঙ্গে সঙ্গে auto-submit হয়। “হিস্ট্রি মুছুন” ফলাফল + CQ + খসড়া সব মুছে দেয় (থিম থাকে)।

## টেস্ট

```bash
node --test ssc-prep/tests/exam-logic.test.mjs   # ১৭টি কেস: ডেটা চুক্তি, গ্রডিং, উইন্ডো, shuffle, summarize
```

গ্রডিং ও অ্যানালিটিক্স বিশুদ্ধ ফাংশন বলে DOM ছাড়াই যাচাই করা যায়; UI স্তর (প্র্যাকটিস ফিডব্যাক, runner, auto-submit, CQ টগল, ড্যাশবোর্ড, modal) jsdom দিয়ে আলাদাভাবে চালানো হয়েছে — বিল্ড-টুল যেন না বাড়ে বলে সেই harness repo-তে দেওয়া হয়নি।

## Production নোট

- এখানে Tailwind **Play CDN** ব্যবহার করা হয়েছে দ্রুত প্রোটোটাইপের জন্য। প্রকাশের আগে static CSS বানাও:
  ```bash
  npx tailwindcss@3 -i app.css -o tailwind.build.css --minify   # তারপর CDN <script> সরাও
  ```
  (তখন `tailwind.config` একটা `tailwind.config.js`-তে নিয়ে যাও।)
- Google Fonts-এর বদলে Noto Sans/Serif Bengali local-এ রাখো (মূল PWA-তে ইতিমধ্যে local ফন্ট আছে) — তাহলে এই মডিউলও পুরোপুরি অফলাইন হবে।
- কোনো সার্ভিস ওয়ার্কার যোগ করলে `ssc-prep/` আলাদা scope-তে রাখেই ভালো, যাতে মূল PWA-এর cache অমিল না হয়।

## সীমাবদ্ধতা (জেনে রাখো)

- উত্তরপত্র ক্লায়েন্টেই grade হয়, তাই JSON-এ `answer` প্লেইন টেক্সটে — DevTools খুললে দেখা যায়। প্রকৃত লাইভ পরীক্ষার জন্য সার্ভার-সাইড গ্রডিং/হ্যাশ করা answer লাগবে (মূল PWA-তে সেই হ্যাশ পদ্ধতি `js/exam-hash.js`-এ আছে)।
- `proctoring` এখন শুধু নির্দেশনা হিসেবে দেখানো হয়; নজরদারি কারিগরি কিছু করা হয় না।
- CQ নম্বর শিক্ষার্থীর স্ব-মূল্যায়ন — শিক্ষকের চূড়ান্ত নম্বর এই ধাপে নেই।
- প্রশ্নব্যাংক নমুনা হিসেবে ছোট (১৪ MCQ, ৩ CQ, ৩ সেট); JSON-এ নতুন এন্ট্রি যোগ করলেই UI নিজে থেকেই ফিল্টার, প্যালেট ও ড্যাশবোর্ড হালনাগাদ করবে।
