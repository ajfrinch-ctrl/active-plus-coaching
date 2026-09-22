import { toBanglaNumber as bn } from './ui.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function receiptFields(tx) {
  return [
    ['রসিদ নং', tx.receiptNo], ['তারিখ', tx.date],
    ['শিক্ষার্থীর নাম', tx.studentName], ['Student ID', tx.studentId],
    ['শ্রেণি', tx.className], ['ফি এর ধরন / মাস', `${tx.feeType} • ${tx.month}`],
    ['পেমেন্ট মাধ্যম', tx.method], ['Trx ID / Reference', tx.trxRef || '—']
  ];
}

export function receiptMarkup(tx, logo = 'assets/icons/app-logo.png') {
  const fields = receiptFields(tx);
  return `<div class="receipt-modal-box" id="receiptPreviewBox">
    <div class="receipt-header">
      <img class="receipt-logo" src="${escape(logo)}" alt="Active Plus Coaching" width="64" height="64">
      <div class="receipt-brand-title">Active Plus Coaching</div>
      <div class="receipt-sub">শিখতে থাকো, এগিয়ে যাও • দিনাজপুর</div>
      <div class="receipt-badge-title">মানি রসিদ (PAID)</div>
    </div>
    <dl class="receipt-meta-grid">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>
    <div class="receipt-amount-block"><div><span>মোট পরিশোধিত টাকা</span><strong>৳${bn(Number(tx.amount).toLocaleString('en-US'))}</strong></div><span class="receipt-paid-seal">✓ পরিশোধিত</span></div>
    <p class="receipt-note">নোট: ${escape(tx.note || 'ফি পরিশোধ সম্পন্ন')}</p>
    <div class="receipt-footer-sign"><div>আদায়কারী: ${escape(tx.collectedBy || 'এডমিন')}</div><div class="receipt-signature-line">কর্তৃপক্ষের স্বাক্ষর</div></div>
  </div>`;
}

let assets;
async function receiptAssets() {
  if (!assets) assets = Promise.all([
    (async () => {
      const logo = new Image();
      logo.src = new URL('../assets/icons/app-logo.png', import.meta.url).href;
      await logo.decode();
      return logo;
    })(),
    (async () => {
      const url = new URL('../assets/fonts/NotoSansBengali-Variable.ttf', import.meta.url).href;
      const font = await new FontFace('ReceiptBangla', `url("${url}")`, { weight: '100 900' }).load();
      document.fonts.add(font);
      return font;
    })()
  ]).catch(error => { assets = null; throw error; });
  return assets;
}

/** Shared logo + Bengali font loader for every offline canvas PDF (receipts and reports). */
export function loadBrandAssets() { return receiptAssets(); }

/** Wrap at words; split long IDs/references at grapheme boundaries, not Bangla vowel marks. */
export function wrapText(ctx, text, width) {
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('bn', { granularity: 'grapheme' }) : null;
  const lines = [];
  for (const paragraph of String(text ?? '—').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && ctx.measureText(`${line} ${word}`).width > width) { lines.push(line); line = ''; }
      if (ctx.measureText(word).width <= width) {
        line = line ? `${line} ${word}` : word;
      } else {
        const characters = segmenter ? [...segmenter.segment(word)].map(item => item.segment) : Array.from(word);
        for (const char of characters) {
          if (line && ctx.measureText(line + char).width > width) { lines.push(line); line = ''; }
          line += char;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Minimal single-image PDF, with byte-accurate stream lengths and xref offsets.
 * Browser canvas shapes Bangla before embedding, avoiding unsupported PDF font shaping.
 * No CDN, print dialog, popup or PDF runtime dependency is needed. */
export function imagePDF(jpeg, width, height) {
  if (!(jpeg instanceof Uint8Array) || !jpeg.length || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid receipt image');
  }
  const pageWidth = 595.28;
  const imageWidth = pageWidth - 48;
  const imageHeight = Number((imageWidth * height / width).toFixed(2));
  const pageHeight = Math.max(841.89, imageHeight + 48);
  const imageBottom = (pageHeight - imageHeight - 24).toFixed(2);
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const append = value => {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (number, ...parts) => {
    offsets[number] = length;
    append(`${number} 0 obj\n`);
    parts.forEach(append);
    append('\nendobj\n');
  };
  append('%PDF-1.4\n');
  append(new Uint8Array([37, 226, 227, 207, 211, 10]));
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Receipt 4 0 R >> >> /Contents 5 0 R >>`);
  object(4, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream');
  const content = `q\n${imageWidth} 0 0 ${imageHeight} 24 ${imageBottom} cm\n/Receipt Do\nQ\n`;
  object(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
  const xref = length;
  append('xref\n0 6\n0000000000 65535 f \n');
  for (const offset of offsets.slice(1)) append(`${String(offset).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

export async function createReceiptPDF(tx) {
  const [logo] = await receiptAssets();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Receipt rendering unavailable');
  const width = 760, inset = 44, columnWidth = 320;
  const forest = '#04795a', ink = '#20392e', muted = '#586e62';
  // Measure first; allocate only as much canvas as the receipt needs (mobile memory).
  const fields = receiptFields(tx).map(([label, value]) => {
    ctx.font = '600 18px ReceiptBangla';
    return { label, lines: wrapText(ctx, value || '—', columnWidth) };
  });
  ctx.font = '400 17px ReceiptBangla';
  const notes = wrapText(ctx, `নোট: ${tx.note || 'ফি পরিশোধ সম্পন্ন'}`, width - inset * 2);
  const collector = wrapText(ctx, `আদায়কারী: ${tx.collectedBy || 'এডমিন'}`, columnWidth);
  const rowHeights = [];
  for (let i = 0; i < fields.length; i += 2) rowHeights.push(34 + Math.max(fields[i].lines.length, fields[i + 1].lines.length) * 27);
  const height = 290 + rowHeights.reduce((sum, h) => sum + h, 0) + 128 + notes.length * 26 + Math.max(68, collector.length * 26 + 24) + 44;
  // Cap pixel count for older mobile browsers while retaining crisp text for normal receipts.
  const scale = Math.min(2, Math.sqrt(8000000 / (width * height)), 16000 / height);
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = forest;
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, width - 36, height - 36);
  const text = (value, x, y, size = 18, color = ink, weight = 600, align = 'left') => {
    ctx.font = `${weight} ${size}px ReceiptBangla`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };
  const divider = y => {
    ctx.strokeStyle = '#d5e2d9';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(inset, y); ctx.lineTo(width - inset, y); ctx.stroke();
  };
  try {
    ctx.drawImage(logo, width / 2 - 42, 38, 84, 84);
    text('Active Plus Coaching', width / 2, 160, 30, forest, 800, 'center');
    text('শিখতে থাকো, এগিয়ে যাও • দিনাজপুর', width / 2, 192, 17, muted, 500, 'center');
    text('মানি রসিদ • পরিশোধিত', width / 2, 230, 20, forest, 700, 'center');
    divider(250);
    let y = 282;
    fields.forEach((field, index) => {
      const x = inset + (index % 2) * (columnWidth + 32);
      text(field.label, x, y, 14, muted, 500);
      field.lines.forEach((line, n) => text(line, x, y + 28 + n * 27));
      if (index % 2) y += rowHeights[Math.floor(index / 2)];
    });
    y += 12;
    ctx.fillStyle = '#eaf5ee';
    ctx.fillRect(inset, y, width - inset * 2, 94);
    text('মোট পরিশোধিত টাকা', inset + 20, y + 32, 17, forest, 500);
    text(`৳${bn(Number(tx.amount).toLocaleString('en-US'))}`, inset + 20, y + 72, 30, forest, 800);
    text('পরিশোধিত', width - inset - 20, y + 56, 19, forest, 700, 'right');
    y += 128;
    notes.forEach((line, n) => text(line, inset, y + n * 26, 17, muted, 400));
    y += notes.length * 26 + 12;
    divider(y);
    collector.forEach((line, n) => text(line, inset, y + 32 + n * 26, 17, muted, 400));
    text('কর্তৃপক্ষের স্বাক্ষর', width - inset, y + 32, 17, muted, 500, 'right');
    const jpeg = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Receipt image failed')), 'image/jpeg', 0.94));
    return imagePDF(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height);
  } finally {
    canvas.width = canvas.height = 0; // Release the large pixel buffer on mobile.
  }
}

export async function downloadReceipt(tx) {
  const pdf = await createReceiptPDF(tx);
  const url = URL.createObjectURL(pdf);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${String(tx.receiptNo || tx.id).replace(/[^\w-]/g, '_')}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
