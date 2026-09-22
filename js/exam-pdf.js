/* Offline, directly downloaded, paginated PDFs. Canvas shapes Bengali text using
   the bundled font. No print dialog or external PDF service. */
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
export async function downloadExamPDF(exam, { solutions = false, attempt = null, authorPreview = false } = {}) {
  if (solutions && Date.now() < exam.endAt) throw new Error('সঠিক উত্তরসহ PDF সবার পরীক্ষা শেষ হলে পাওয়া যাবে।');
  if (!authorPreview && (exam.status !== 'published' || Date.now() < exam.startAt)) throw new Error('প্রশ্ন এখনও প্রকাশের সময় হয়নি।');
  const [, logo] = await loadAssets(), canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1754;
  const ctx = canvas.getContext('2d'), pages = []; let y, page = 0;
  const start = () => {
    page++; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(logo, 62, 42, 72, 72); ctx.fillStyle = '#04795a'; ctx.font = '700 30px ExamBangla'; ctx.fillText('Active Plus Coaching', 150, 80);
    ctx.font = '22px ExamBangla'; ctx.fillText('শিখতে থাকো, এগিয়ে যাও', 150, 113); ctx.fillStyle = '#596960'; ctx.fillText(`পৃষ্ঠা ${bn(page)}`, 1050, 80);
    ctx.strokeStyle = '#d9e7e0'; ctx.beginPath(); ctx.moveTo(62, 140); ctx.lineTo(1178, 140); ctx.stroke(); y = 187;
  };
  const finish = async () => {
    ctx.font = '18px ExamBangla'; ctx.fillStyle = '#596960'; ctx.fillText(`${solutions ? 'অনুশীলন কপি • সঠিক উত্তরসহ' : 'প্রশ্নপত্র'} • Active Plus Coaching`, 62, 1708);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PDF তৈরি হয়নি')), 'image/jpeg', .9));
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height });
  };
  start();
  const text = async (content, bold = false) => {
    ctx.font = `${bold ? '700 ' : ''}25px ExamBangla`;
    const lines = wrap(ctx, content, 1108);
    for (const line of lines) {
      if (y > 1640) { await finish(); start(); ctx.font = `${bold ? '700 ' : ''}25px ExamBangla`; }
      ctx.fillStyle = bold ? '#143b30' : '#1e2f28'; ctx.fillText(line, 64, y); y += 39;
    }
    y += 10;
  };
  await text(exam.title, true); await text(`${EXAM_TYPES[exam.type]} • বিষয়: ${exam.subject} • সব শ্রেণি • পূর্ণমান: ${bn(totalMarks(exam))}`);
  await text(`শুরু: ${new Date(exam.startAt).toLocaleString('bn-BD')} • শেষ: ${new Date(exam.endAt).toLocaleString('bn-BD')}`);
  if (exam.type !== 'mcq') await text(`পরের দিন ক্লাসে পরীক্ষা: ${classExamDate(exam.startAt)}। খাতায় উত্তর লিখবে; অনলাইনে লিখিত উত্তর জমা নয়।`);
  else await text(`প্রতি ভুল উত্তরে কাটা নম্বর: ${bn(exam.negative)}। সর্বনিম্ন মোট নম্বর ০।`);
  if (attempt) await text(`শিক্ষার্থী: ${attempt.name} • চেষ্টা: ${bn(attempt.number)} • প্রাপ্ত নম্বর: ${attempt.score === undefined ? 'জমা অপেক্ষমাণ' : bn(attempt.score)}`);
  if (exam.instructions) await text(exam.instructions);
  const questions = attempt?.order?.length ? attempt.order.map(item => exam.questions.find(q => q.id === item.id)) : exam.questions;
  for (const [i, q] of questions.entries()) {
    await text(`${bn(i + 1)}. ${q.text} [${bn(q.marks)} নম্বর]`, true);
    if (q.options) {
      const order = attempt?.order?.find(item => item.id === q.id)?.options || q.options.map(o => o.id);
      const options = order.map(id => q.options.find(o => o.id === id));
      for (let j = 0; j < options.length; j++) await text(`${'ABCD'[j]}. ${options[j].text}`);
      if (solutions) {
        const answer = options.findIndex(o => o.id === q.answer), chosen = options.findIndex(o => o.id === attempt?.answers[q.id]);
        await text(`সঠিক উত্তর: ${'ABCD'[answer]} — ${options[answer].text}${attempt ? ` • তোমার উত্তর: ${chosen < 0 ? 'অনুত্তরিত' : 'ABCD'[chosen]}` : ''}`, true);
      }
    }
  }
  await finish(); const blob = pagesPDF(pages);
  downloadBlob(blob, `ActivePlus-${exam.type}-${solutions ? 'solutions' : 'questions'}-${exam.id.slice(-8)}.pdf`);
  return blob;
}
