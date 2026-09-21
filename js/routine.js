/* Routine feature: day tabs and schedule rendering. */
import { $, $$, toBanglaNumber } from './ui.js';
import { schedule, subjectInitials } from './config.js';

export function renderRoutine(day = 'sat') {
  const dayData = schedule[day] || schedule.sat;
  const list = $('#routineList');
  if (!list) return;

  $('#routineDate').textContent = dayData.date;
  $('#classCount').textContent = `${toBanglaNumber(dayData.classes.length)}টি ক্লাস`;
  list.innerHTML = dayData.classes.map(item => `
    <article class="routine-item${item.current && day === 'sat' ? ' current' : ''}">
      <div class="routine-time"><strong>${item.time}</strong><small>${item.period}</small></div>
      <div class="routine-body">
        <span class="subject-block ${item.tone}">${subjectInitials[item.subject] || 'ক'}</span>
        <span><strong>${item.subject}</strong><small>${item.teacher} · ${item.room}</small></span>
        <span class="routine-tag${item.tag === 'টেস্ট' ? ' test' : ''}">${item.tag}</span>
      </div>
    </article>
  `).join('');
  $('#emptyRoutine').hidden = dayData.classes.length !== 0;
  list.hidden = dayData.classes.length === 0;
}

export function initRoutine() {
  $$('.day-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.day-tab').forEach(item => item.classList.remove('active'));
      tab.classList.add('active');
      renderRoutine(tab.dataset.day);
    });
  });
  renderRoutine();
}
