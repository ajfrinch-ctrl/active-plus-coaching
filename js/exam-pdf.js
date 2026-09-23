/* Offline, directly downloaded, paginated PDFs. Canvas shapes Bengali text using
   the bundled font. No print dialog or external PDF service.
   MCQ papers look like a real exam paper: a compact OMR-style option grid
   (two columns: A B / C D), page numbers in the footer, and the answer key on
   separate pages after the question pages. */
import { toBanglaNumber as bn } from './ui.js';
import { EXAM_TYPES, totalMarks, classExamDate } from './exam-data.js';
let assets;
async function loadAssets() {
  if (!assets) assets = Promise.all([
    new FontFace('ExamBangla', `url("${new URL('../assets/fonts/NotoSansBengali-Variable.ttf', import.meta.url).href}")`, { weight: '100 900' }).load().then(font => document.fonts.add(font)),
    (async () => { const logo = new Image(); logo.src = new URL('../assets/icons/app-logo.png', import.meta.url).href; await logo.decode(); return logo; })()
  ]).catch(error => { assets = null; throw error; });
  return assets;
}
export function pagesPDF(pages) {
  if (!pages.length) throw new Error('No PDF pages');
  const encoder = new TextEncoder(), chunks = [], offsets = [0]; let length = 0;
  const append = data => { const bytes = typeof data === 'string' ? encoder.encode(data) : data; chunks.push(bytes); length += bytes.length; };
  const object = (id, ...parts) => { offsets[id] = length; append(`${id} 0 obj\n`); parts.forEach(append); append('\nendobj\n'); };
  append('%PDF-1.4\n'); append(new Uint8Array([37, 226, 227, 207, 211, 10]));
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
  pages.forEach((p, i) => {
    const id = 3 + i * 3, stream = `q\n595.28 0 0 841.89 0 0 cm\n/Im${i} Do\nQ`;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im${i} ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
    object(id + 1, `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream');
    object(id + 2, `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
  });
  const xref = length, count = 3 + pages.length * 3;
  append(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) append(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function wrap(ctx, text, width) {
  const lines = [], segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('bn', { granularity: 'grapheme' }) : null;
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (ctx.measureText(`${line} ${word}`).width > width && line) { lines.push(line); line = ''; }
      if (ctx.measureText(word).width > width) {
        for (const segment of segmenter ? [...segmenter.segment(word)].map(item => item.segment) : Array.from(word)) { if (ctx.measureText(line + segment).width > width) { lines.push(line); line = ''; } line += segment; }
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}

/* Shared A4 canvas renderer. Each page: branded header (no page number — it
   lives in the footer), content area, footer with paper label and page number. */
export async function downloadExamPDF(exam, { solutions = false, attempt = null, authorPreview = false } = {}) {
  if (solutions && Date.now() < exam.endAt) throw new Error('সঠিক উত্তরসহ PDF সবার পরীক্ষা শেষ হলে পাওয়া যাবে।');
  if (!authorPreview && (exam.status !== 'published' || Date.now() < exam.startAt)) throw new Error('প্রশ্ন এখনও প্রকাশের সময় হয়নি।');
  const [font, logo] = await loadAssets(), canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1754;
  const ctx = canvas.getContext('2d'), pages = [];
  const W = canvas.width, LEFT = 62, RIGHT = W - 62, CONTENT_W = RIGHT - LEFT;
  const FOOT_Y = 1690, BOTTOM = 1652;

  const beginPage = ({ part = null } = {}) => {
    pageNo++;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, canvas.height);
    ctx.drawImage(logo, 62, 42, 72, 72);
    ctx.fillStyle = '#04795a'; ctx.font = '700 30px ExamBangla'; ctx.fillText('Active Plus Coaching', 150, 80);
    ctx.font = '22px ExamBangla'; ctx.fillText('শিখতে থাকো, এগিয়ে যাও', 150, 113);
    if (part) {
      ctx.font = '700 22px ExamBangla'; ctx.textAlign = 'right';
      ctx.fillText(part, RIGHT, 82);
      ctx.fillText(exam.title, RIGHT, 113);
      ctx.textAlign = 'left';
    }
    ctx.strokeStyle = '#d9e7e0'; ctx.beginPath(); ctx.moveTo(LEFT, 140); ctx.lineTo(RIGHT, 140); ctx.stroke();
    return 190;
  };

  const renderFooter = () => {
    ctx.font = '18px ExamBangla'; ctx.fillStyle = '#596960';
    const label = `${partSolutions ? 'সঠিক উত্তরপত্র' : 'প্রশ্নপত্র'} • Active Plus Coaching`;
    ctx.fillText(label, LEFT, FOOT_Y);
    if (pageNo) {
      ctx.textAlign = 'right';
      ctx.fillText(totalPages ? `পৃষ্ঠা ${bn(pageNo)} / ${bn(totalPages)}` : `পৃষ্ঠা ${bn(pageNo)}`, RIGHT, FOOT_Y);
      ctx.textAlign = 'left';
    }
    ctx.strokeStyle = '#e2ece7'; ctx.beginPath(); ctx.moveTo(LEFT, FOOT_Y - 34); ctx.lineTo(RIGHT, FOOT_Y - 34); ctx.stroke();
  };

  let dryRun = false, dryCount = 0;
  const finishPage = async () => {
    if (dryRun) { dryCount++; return; } // pass 1: only count the pages
    renderFooter();
    const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PDF তৈরি হয়নি')), 'image/jpeg', .9));
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height });
  };

  let y = 0, pageNo = 0, totalPages = 0, partSolutions = false;
  const QUESTION_GAP = 16;

  const drawParagraph = async (content, { bold = false, size = 25, width = CONTENT_W, x = LEFT, color = '#1e2f28' } = {}) => {
    ctx.font = `${bold ? '700 ' : ''}${size}px ExamBangla`;
    const lineHeight = size === 25 ? 39 : 36;
    for (const line of wrap(ctx, content, width)) {
      if (y > BOTTOM) { await finishPage(); y = beginPage({ part: partSolutions ? 'উত্তরপত্র' : 'প্রশ্নপত্র' }); ctx.font = `${bold ? '700 ' : ''}${size}px ExamBangla`; }
      ctx.fillStyle = color; ctx.fillText(line, x, y); y += lineHeight;
    }
    y += 10;
  };

  const drawOptionGrid = async (question, options) => {
    const qid = question.id;
    const columnWidth = (CONTENT_W - 34) / 2;
    for (let row = 0; row < Math.ceil(options.length / 2); row++) {
      if (y + 46 > BOTTOM) { await finishPage(); y = beginPage({ part: partSolutions ? 'উত্তরপত্র' : 'প্রশ্নপত্র' }); }
      const cells = [];
      for (let col = 0; col < 2; col++) {
        const index = row * 2 + col;
        if (index >= options.length) break;
        cells.push({ option: options[index], x: LEFT + col * (columnWidth + 34), width: columnWidth });
      }
      const answer = partSolutions ? options.findIndex(o => o.id === question.answer) : -1;
      const chosen = solutions && attempt ? options.findIndex(o => o.id === attempt?.answers?.[qid]) : -1;
      const heights = cells.map(({ option, width }) => {
        ctx.font = '24px ExamBangla';
        return Math.max(30, wrap(ctx, option.text, width - 44).length * 32);
      });
      const rowHeight = Math.max(40, ...heights);
      cells.forEach(({ option, x, width }, cellIndex) => {
        const letter = 'ABCD'[row * 2 + cellIndex];
        const isAnswer = solutions && answer === row * 2 + cellIndex;
        const isChosen = solutions && chosen === row * 2 + cellIndex;
        ctx.strokeStyle = '#c9d8d0'; ctx.lineWidth = 1.4;
        if (solutions && isAnswer) { ctx.fillStyle = '#e7f4ec'; ctx.fillRect(x - 10, y - 24, width + 6, rowHeight + 8); }
        ctx.fillStyle = '#04795a'; ctx.beginPath();
        ctx.arc(x + 11, y - 8, 11.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 14px ExamBangla'; ctx.textAlign = 'center';
        ctx.fillText(letter, x + 11, y - 3); ctx.textAlign = 'left';
        ctx.font = '24px ExamBangla'; ctx.fillStyle = '#1e2f28';
        if (isChosen) ctx.font = '700 24px ExamBangla';
        wrap(ctx, option.text, width - 44).forEach((line, i) => ctx.fillText(line, x + 32, y + i * 32));
      });
      y += rowHeight + 8;
    }
    y += 10;
  };

  const drawHead = async () => {
    await drawParagraph(exam.title, { bold: true, color: '#143b30' });
    await drawParagraph(`${EXAM_TYPES[exam.type]} • বিষয়: ${exam.subject} • সব শ্রেণি • পূর্ণমান: ${bn(totalMarks(exam))}`);
    await drawParagraph(`শুরু: ${new Date(exam.startAt).toLocaleString('bn-BD')} • শেষ: ${new Date(exam.endAt).toLocaleString('bn-BD')}`);
    await drawParagraph(exam.type !== 'mcq'
      ? `পরের দিন ক্লাসে পরীক্ষা: ${classExamDate(exam.startAt)}। খাতায় উত্তর লিখবে; অনলাইনে লিখিত উত্তর জমা নয়।`
      : `প্রতি ভুল উত্তরে কাটা নম্বর: ${bn(exam.negative)}। সর্বনিম্ন মোট নম্বর ০।`);
    if (attempt) await drawParagraph(`শিক্ষার্থী: ${attempt.name} • চেষ্টা: ${bn(attempt.number)} • প্রাপ্ত নম্বর: ${attempt.score === undefined ? 'জমা অপেক্ষমাণ' : bn(attempt.score)}`);
    if (exam.instructions) await drawParagraph(exam.instructions);
  };

  const questions = attempt?.order?.length ? attempt.order.map(item => exam.questions.find(q => q.id === item.id)) : exam.questions;
  const optionsFor = q => {
    const order = attempt?.order?.find(item => item.id === q.id)?.options;
    return order ? order.map(id => q.options.find(o => o.id === id)) : q.options;
  };

  /* ---------- Page bodies (rendered twice: dry pass counts, real pass draws) ---------- */
  const renderQuestionPart = async () => {
    partSolutions = false;
    y = beginPage({ part: 'প্রশ্নপত্র' });
    await drawHead();
    for (const [i, q] of questions.entries()) {
      if (y + 120 > BOTTOM) { await finishPage(); y = beginPage({ part: 'প্রশ্নপত্র' }); }
      await drawParagraph(`${bn(i + 1)}. ${q.text} [${bn(q.marks)} নম্বর]`, { bold: true, color: '#143b30' });
      if (q.options) await drawOptionGrid(q, optionsFor(q));
      else y += 4;
    }
    await finishPage();
  };

  const renderAnswerPart = async () => {
    // উত্তরপত্র: a compact answer-key grid first, then per-question details.
    partSolutions = true;
    y = beginPage({ part: 'উত্তরপত্র' });
    ctx.font = '700 28px ExamBangla'; ctx.fillStyle = '#143b30';
    ctx.fillText(exam.title, LEFT, y); y += 32;
    ctx.font = '21px ExamBangla'; ctx.fillStyle = '#596960';
    ctx.fillText(`${exam.subject} • ${bn(questions.length)}টি প্রশ্ন • পূর্ণমান: ${bn(totalMarks(exam))}`, LEFT, y); y += 30;
    if (attempt) {
      ctx.font = '700 22px ExamBangla'; ctx.fillStyle = '#143b30';
      ctx.fillText(`শিক্ষার্থী: ${attempt.name} • চেষ্টা: ${bn(attempt.number)} • প্রাপ্ত নম্বর: ${attempt.score === undefined ? 'জমা অপেক্ষমাণ' : bn(attempt.score)}`, LEFT, y); y += 30;
    }
    if (exam.instructions) {
      ctx.font = '19px ExamBangla'; ctx.fillStyle = '#596960';
      wrap(ctx, exam.instructions, CONTENT_W).forEach(line => { ctx.fillText(line, LEFT, y); y += 28; });
    }
    y += 16;
    const cellW = CONTENT_W / 6;
    questions.forEach((q, i) => {
      const col = i % 6, row = Math.floor(i / 6);
      const x = LEFT + col * cellW, yy = y + row * 56;
      ctx.fillStyle = '#f2f7f3'; ctx.fillRect(x, yy - 22, cellW - 12, 42);
      ctx.fillStyle = '#143b30'; ctx.font = '700 20px ExamBangla';
      ctx.fillText(`${bn(i + 1)}.`, x + 10, yy + 5);
      ctx.fillStyle = '#04795a'; ctx.beginPath();
      ctx.arc(x + 52, yy - 2, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 14px ExamBangla'; ctx.textAlign = 'center';
      ctx.fillText(q.answer ?? '—', x + 52, yy + 3); ctx.textAlign = 'left';
    });
    y += Math.ceil(questions.length / 6) * 56 + 20;
    for (const [i, q] of questions.entries()) {
      if (y + 120 > BOTTOM) { await finishPage(); y = beginPage({ part: 'উত্তরপত্র' }); }
      await drawParagraph(`${bn(i + 1)}. ${q.text} [${bn(q.marks)} নম্বর]`, { bold: true, color: '#143b30' });
      if (q.options) {
        const opts = optionsFor(q);
        await drawOptionGrid(q, opts);
        const chosen = opts.findIndex(o => o.id === attempt?.answers?.[q.id]);
        const right = opts.findIndex(o => o.id === q.answer);
        const correct = chosen >= 0 && chosen === right;
        await drawParagraph(
          chosen < 0 ? 'তোমার উত্তর: অনুত্তরিত' : `তুমি ${'ABCD'[chosen]} উত্তরটি দিয়েছ${correct ? ' — সঠিক' : ' — ভুল'}`,
          { size: 19, color: correct ? '#3d8660' : '#a33e30' }
        );
      }
    }
    await finishPage();
  };

  /* Pass 1 (dry): exact page counts per part — no footer, no JPEG. */
  dryRun = true;
  pageNo = 0; await renderQuestionPart();
  const questionTotal = Math.max(1, dryCount);
  let answerTotal = 0;
  if (solutions) { dryCount = 0; pageNo = 0; await renderAnswerPart(); answerTotal = Math.max(1, dryCount); }
  dryRun = false;

  /* Pass 2 (real): draw with true "পৃষ্ঠা n / মোট" footers; answers on their own pages. */
  totalPages = questionTotal; pageNo = 0;
  await renderQuestionPart();
  if (solutions) {
    totalPages = answerTotal; pageNo = 0;
    await renderAnswerPart();
  }

  const blob = pagesPDF(pages);
  downloadBlob(blob, `ActivePlus-${exam.type}-${solutions ? 'solutions' : 'questions'}-${exam.id.slice(-8)}.pdf`);
  return blob;
}
