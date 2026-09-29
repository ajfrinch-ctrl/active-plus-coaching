/* Preserve the app's different local schemas. Not every collection is an
   array: teaching is a versioned document and routine is a week/day map. */
const DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'];
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export function collectionPayload(collection, value) {
  if (value === null) return null;
  if (collection === 'settings') return object(value) ? value : null;
  if (collection === 'routine') {
    if (!object(value)) return null;
    const entries = [];
    for (const day of DAYS) {
      const info = value[day];
      if (!info) continue;
      entries.push(['day-' + day, { _syncDay: day, _syncDate: true, date: info.date || '' }]);
      for (const [index, item] of (info.classes || []).entries()) {
        const id = item.id || `legacy-${day}-${index}`;
        entries.push([id, { ...item, id, _syncDay: day }]);
      }
    }
    return Object.fromEntries(entries);
  }
  const items = collection === 'teaching' ? value?.activities : value;
  if (!Array.isArray(items)) return null;
  return Object.fromEntries(items.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));
}

export function remoteToLocal(collection, value) {
  if (collection === 'settings') return value || {};
  const items = Object.values(value || {}).filter(Boolean);
  if (collection === 'routine') {
    const week = Object.fromEntries(DAYS.map(day => [day, { date: '', classes: [] }]));
    for (const record of items) {
      if (!DAYS.includes(record._syncDay)) continue;
      const { _syncDay: day, _syncDate: dateOnly, ...item } = record;
      if (dateOnly) week[day].date = item.date || '';
      else week[day].classes.push(item);
    }
    return week;
  }
  if (collection === 'teaching') return {
    version: 1,
    activities: items.map(item => ({ ...item, progress: item.progress || {} }))
  };
  return items;
}
