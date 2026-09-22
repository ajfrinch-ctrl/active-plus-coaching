/* Report Center PDF/CSV generators — same offline canvas approach as money receipts.
   No CDN, print dialog or runtime library; Bengali text renders through the local font. */
import { toBanglaNumber as bn } from './ui.js';
import { imagePDF, wrapText, loadBrandAssets } from './finance-receipt.js';

const forest = '#04795a', ink = '#20392e', muted = '#586e62', line = '#d5e2d9', mint = '#eaf5ee', zebra = '#f7faf8';
const money = value => `৳${bn(Number(value || 0).toLocaleString('en-US'))}`;

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ---------- CSV (Excel-friendly: UTF-8 BOM keeps Bangla readable) ---------- */

const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

export function buildCSV(columns, rows) {
  const lines = [columns.map(column => csvCell(column.label)).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

export function downloadCSV(filename, columns, rows) {
  saveBlob(buildCSV(columns, rows), filename);
}

/* ---------- PDF ---------- */

/** Render a branded one-page report: brand header, summary tiles, zebra table, footer. */
export async function createReportPDF({ title, subtitle = '', period = '', columns, rows, summary = [], note = '' }) {
  if (!Array.isArray(columns) || !columns.length) throw new Error('Report columns missing');
  const [logo] = await loadBrandAssets();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Report rendering unavailable');
  const width = 760, inset = 44, bodyWidth = width - inset * 2;
  const capped = rows.slice(0, 400);
  const truncated = rows.length - capped.length;

  // Measure first so the canvas is allocated only once, exactly the height needed.
  const fractions = columns.map(column => column.width || 1);
  const fractionSum = fractions.reduce((sum, f) => sum + f, 0);
  const columnWidths = fractions.map(f => Math.floor((bodyWidth - (columns.length - 1) * 12) * f / fractionSum));
  const wrappedRows = capped.map(row => row.map((cell, index) => {
    ctx.font = '400 14px ReceiptBangla';
    return wrapText(ctx, cell ?? '—', columnWidths[index]);
  }));
  const wrappedHeader = columns.map((column, index) => {
    ctx.font = '700 13px ReceiptBangla';
    return wrapText(ctx, column.label, columnWidths[index]);
  });
  const summaryPerRow = Math.max(2, Math.min(4, summary.length || 2));
  const summaryRows = Math.ceil(summary.length / summaryPerRow);
  const summaryBlockHeight = summary.length ? 22 + summaryRows * 74 : 0;
  summary.forEach(item => {
    ctx.font = '800 19px ReceiptBangla';
    item.valueLines = wrapText(ctx, item.value, (bodyWidth - 24) / summaryPerRow - 20);
  });
  const headerLines = wrapText(ctx, subtitle, bodyWidth);
  const noteLines = note ? wrapText(ctx, note, bodyWidth).length : 0;
  const rowHeights = wrappedRows.map(cells => 20 + Math.max(...cells.map(lines => lines.length)) * 21);
  const headerRowHeight = 16 + Math.max(...wrappedHeader.map(lines => lines.length)) * 19;
  const height = 214 + headerLines.length * 24 + 16 + summaryBlockHeight + 18 + headerRowHeight
    + rowHeights.reduce((sum, h) => sum + h, 0) + (truncated ? 30 : 0) + noteLines * 22 + 88;

  const scale = Math.min(2, Math.sqrt(8000000 / (width * height)), 16000 / height);
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = forest;
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, width - 36, height - 36);

  const text = (value, x, y, size = 14, color = ink, weight = 400, align = 'left') => {
    ctx.font = `${weight} ${size}px ReceiptBangla`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };
  const divider = y => {
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(inset, y); ctx.lineTo(width - inset, y); ctx.stroke();
  };

  try {
    let y = 0;
    ctx.drawImage(logo, width / 2 - 34, 34, 68, 68);
    text('Active Plus Coaching', width / 2, 134, 26, forest, 800, 'center');
    text('শিখতে থাকো, এগিয়ে যাও • দিনাজপুর', width / 2, 160, 14, muted, 500, 'center');
    text(title, width / 2, 194, 21, ink, 800, 'center');
    y = 194 + 12;
    for (const lineText of headerLines) { y += 22; text(lineText, width / 2, y, 14, muted, 500, 'center'); }
    if (period) { y += 22; text(period, width / 2, y, 14, forest, 700, 'center'); }
    y += 16;
    divider(y);
    y += 22;
    if (summary.length) {
      const boxWidth = (bodyWidth - (summaryPerRow - 1) * 10) / summaryPerRow;
      for (let index = 0; index < summary.length; index++) {
        const column = index % summaryPerRow, row = Math.floor(index / summaryPerRow);
        const x = inset + column * (boxWidth + 10), boxY = y + row * 74;
        ctx.fillStyle = mint;
        ctx.fillRect(x, boxY, boxWidth, 64);
        text(summary[index].label, x + 12, boxY + 22, 12, muted, 700);
        summary[index].valueLines.forEach((lineText, n) => text(lineText, x + 12, boxY + 48 + n * 21, 18, forest, 800));
      }
      y += summaryRows * 74 + 18;
    }
    // Table header
    ctx.fillStyle = forest;
    ctx.fillRect(inset, y, bodyWidth, headerRowHeight);
    let x = inset;
    wrappedHeader.forEach((lines, index) => {
      lines.forEach((lineText, n) => text(lineText, x, y + 22 + n * 19, 13, '#fff', 700));
      x += columnWidths[index] + 12;
    });
    y += headerRowHeight;
    wrappedRows.forEach((cells, rowIndex) => {
      if (rowIndex % 2) { ctx.fillStyle = zebra; ctx.fillRect(inset, y, bodyWidth, rowHeights[rowIndex]); }
      let cellX = inset;
      cells.forEach((lines, cellIndex) => {
        lines.forEach((lineText, n) => {
          const isLastMoney = cellIndex === cells.length - 1 && /^৳/.test(lineText);
          text(lineText, cellX, y + 26 + n * 21, 14, isLastMoney ? forest : ink, isLastMoney ? 800 : 400);
        });
        cellX += columnWidths[cellIndex] + 12;
      });
      y += rowHeights[rowIndex];
      divider(y);
    });
    if (truncated) { y += 26; text(`মোট ${bn(rows.length)} সারির প্রথম ${bn(capped.length)}টি এই পাতায় আছে; বাকিগুলো CSV ডাউনলোডে পাওয়া যাবে।`, inset, y, 13, '#a35a20', 700); }
    if (noteLines) { y += 28; wrapText(ctx, note, bodyWidth).forEach((lineText, n) => text(lineText, inset, y + n * 22, 13, muted, 400)); }
    y = height - 40;
    text(`তৈরি: ${new Date().toLocaleString('bn-BD')} • Active Plus Coaching এডমিন প্যানেল`, inset, y, 12, muted, 500);
    text('কর্তৃপক্ষের স্বাক্ষর', width - inset, y, 13, muted, 600, 'right');
    const jpeg = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Report image failed')), 'image/jpeg', 0.94));
    return imagePDF(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height);
  } finally {
    canvas.width = canvas.height = 0; // Release the large pixel buffer on mobile.
  }
}

export async function downloadReportPDF(filename, config) {
  const pdf = await createReportPDF(config);
  saveBlob(pdf, filename);
}
