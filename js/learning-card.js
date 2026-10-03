/* The one renderer for a piece of published teacher work, as a student sees it.

   This exists so the teacher's "how will this look to my students" preview and
   the student app cannot drift apart: both call this function, so a change to
   the card is a change to both. Duplicating the markup instead would give two
   UIs for the same job, and the preview would quietly stop being a preview.

   `pending` is the set of homework ids whose "done" request is in flight, so
   the button can be disabled; the teacher preview simply passes nothing. */
import { toBanglaNumber as bn } from './ui.js';
import { ACTIVITY_TYPES, PROGRESS_LABELS, escapeText as esc, displayDate, safeResourceURL } from './teaching-data.js';

export function learningCard(a, student, { pending = new Set() } = {}) {
  const num = value => esc(bn(value));
  const progress = a.progress[student.id];
  const link = safeResourceURL(a.resourceURL);
  const material = !link && Boolean((a.details || '').trim());
  const outcome = a.type === 'exam' && progress ? `প্রাপ্ত নম্বর: ${bn(progress.value)} / ${bn(a.totalMarks)}` : progress ? PROGRESS_LABELS[progress.value] : '';
  const canComplete = a.type === 'homework' && !['done', 'reviewed'].includes(progress?.value);
  const complete = a.type === 'homework' && ['done', 'reviewed'].includes(progress?.value);
  const status = a.type === 'homework' ? (complete ? 'সম্পন্ন' : 'কাজ বাকি') : a.type === 'exam' ? (progress ? 'ফলাফল দেওয়া হয়েছে' : 'মূল্যায়ন') : a.type === 'routine' ? 'ক্লাস রুটিন' : 'পড়ার উপকরণ';
  const when = a.date ? `${a.type === 'homework' ? 'জমার শেষ সময়' : a.type === 'routine' ? 'ক্লাসের সময়' : 'নির্ধারিত তারিখ'}: ${esc(displayDate(a.date))}${a.time ? ` • ${num(a.time)}` : ''}` : a.room ? `স্থান: ${esc(a.room)}` : '';
  const brief = [when, outcome].filter(Boolean).join(' • ') || 'সব তথ্য দেখতে চাপ দিন';
  return `<article class="teaching-card learning-card learning-${esc(a.type)}" data-learning-id="${esc(a.id)}">
    <button class="learning-card-toggle" type="button" aria-expanded="false" aria-controls="learning-details-${esc(a.id)}">
      <span class="teaching-card-head"><span class="teaching-kind">${ACTIVITY_TYPES[a.type].label}</span><span class="learning-state${complete ? ' is-complete' : ''}">${status}</span></span>
      <strong class="learning-card-title">${esc(a.title)}</strong>
      <span class="learning-subject">${esc(a.subject)} <span>• ${esc(a.className)} • ${esc(a.group || 'সব বিভাগ')}</span></span>
      <span class="learning-brief">${brief}</span>
      <span class="learning-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    <div class="learning-card-details" id="learning-details-${esc(a.id)}" hidden>
    ${a.date || a.room || a.totalMarks ? `<div class="learning-meta">
      ${a.date ? `<div><small>${a.type === 'homework' ? 'জমার শেষ সময়' : a.type === 'routine' ? 'ক্লাসের সময়' : 'নির্ধারিত তারিখ'}</small><strong>${esc(displayDate(a.date))}</strong>${a.time ? `<span>${num(a.time)}${a.duration ? ' • ' + num(a.duration) + ' মিনিট' : ''}</span>` : ''}</div>` : ''}
      ${a.room ? `<div><small>স্থান</small><strong>${esc(a.room)}</strong></div>` : ''}
      ${a.totalMarks ? `<div><small>পূর্ণমান</small><strong>${num(a.totalMarks)}</strong></div>` : ''}
    </div>` : ''}
    <p class="teaching-body">${esc(a.details)}</p>
    ${outcome ? `<p class="learning-outcome">${esc(outcome)}</p>` : ''}
    <div class="learning-teacher"><span aria-hidden="true">${esc(Array.from(a.teacherName || 'শ')[0])}</span><small>শিক্ষক • ${esc(a.teacherName)}</small></div>
    ${link || material || canComplete ? `<div class="learning-card-actions">
      ${link ? `<a class="teaching-resource" data-material="${esc(a.id)}" href="${esc(link)}" target="_blank" rel="noopener noreferrer">সহায়ক উপকরণ খুলুন <svg class="resource-arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></a>` : material ? `<a class="teaching-resource" href="#material" data-material="${esc(a.id)}">উপকরণ PDF ডাউনলোড করুন</a>` : ''}
      ${canComplete ? `<div class="teaching-actions"><button class="primary" type="button" data-complete-homework="${esc(a.id)}" ${pending.has(a.id) ? 'disabled' : ''}>${pending.has(a.id) ? 'সংরক্ষণ হচ্ছে…' : 'কাজ সম্পন্ন হয়েছে জানাও'}</button></div><small class="learning-action-note">এটি শুধু সম্পন্ন হওয়ার খবর; খাতা/ফাইল জমা নয়।</small>` : ''}
    </div>` : ''}
    </div>
  </article>`;
}
