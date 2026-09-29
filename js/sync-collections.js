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
        // `_syncOrder` keeps the period order: Firebase returns object keys in
        // key order, which is not the order the classes were entered in.
        entries.push([id, { ...item, id, _syncDay: day, _syncOrder: index }]);
      }
    }
    return Object.fromEntries(entries);
  }
  // A document from an unknown schema version is never uploaded: treating it as
  // an empty collection would delete the records other devices still rely on.
  if (collection === 'teaching' && value?.version !== 1) return null;
  const items = collection === 'teaching' ? value.activities : value;
  if (!Array.isArray(items)) return null;
  return Object.fromEntries(items.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));
}

export function remoteToLocal(collection, value) {
  if (collection === 'settings') return value || {};
  const items = Object.values(value || {}).filter(Boolean);
  if (collection === 'routine') {
    const week = Object.fromEntries(DAYS.map(day => [day, { date: '', classes: [] }]));
    const classes = Object.fromEntries(DAYS.map(day => [day, []]));
    items.forEach((record, index) => {
      if (!DAYS.includes(record._syncDay)) return;
      const { _syncDay: day, _syncDate: dateOnly, _syncOrder: order, ...item } = record;
      if (dateOnly) { week[day].date = item.date || ''; return; }
      classes[day].push({ item, order: typeof order === 'number' ? order : null, index });
    });
    // Stable sort: records without an order keep their arrival order, last.
    for (const day of DAYS) {
      week[day].classes = classes[day].sort((left, right) => {
        if (left.order === null && right.order === null) return 0;
        if (left.order === null) return 1;
        if (right.order === null) return -1;
        return left.order - right.order;
      }).map(entry => entry.item);
    }
    return week;
  }
  if (collection === 'teaching') return {
    version: 1,
    activities: items.map(item => ({ ...item, progress: item.progress || {} }))
  };
  return items;
}
