/* Sender rules (functions/notification-payload.js): when a push may be sent at
   all. They are pure functions, so a wrong "send on every write" regression is
   caught here instead of on the phones. */
import test from 'node:test';
import assert from 'node:assert/strict';
import payload from '../functions/notification-payload.js';

const { noticePush, broadcastPush, examPushes, chunkTokens, tokensToPrune, messageFor } = payload;

const published = {
  id: 'N1', title: 'পরীক্ষার সময়সূচি', body: 'আগামী শুক্রবার মডেল টেস্ট।',
  audience: 'সকল শিক্ষার্থী', status: 'published', createdAt: '2026-09-29T04:00:00.000Z'
};

test('only a newly published notice is pushed', () => {
  assert.equal(noticePush(null, { ...published, status: 'draft' }), null, 'a draft stays internal');
  const push = noticePush(null, published);
  assert.equal(push.kind, 'notice');
  assert.match(push.title, /পরীক্ষার সময়সূচি/);
  assert.equal(push.data.collection, 'notices');
  assert.equal(push.data.id, 'N1');
});

test('a background write on an unchanged notice does not push again', () => {
  assert.equal(noticePush(published, { ...published }), null);
  assert.ok(noticePush(published, { ...published, body: 'নতুন সময়' }), 'edited text notifies again');
  assert.equal(noticePush(published, null), null, 'a deletion cannot un-send a notification');
});

test('the urgent announcement pushes once per message', () => {
  assert.equal(broadcastPush(null, { broadcastAlert: false, broadcastMessage: 'x' }), null);
  assert.equal(broadcastPush(null, { broadcastAlert: true, broadcastMessage: '   ' }), null);
  const first = broadcastPush(null, { broadcastAlert: true, broadcastMessage: 'আজ ক্লাস বন্ধ' });
  assert.equal(first.kind, 'broadcast');
  assert.equal(broadcastPush({ broadcastAlert: true, broadcastMessage: 'আজ ক্লাস বন্ধ' }, { broadcastAlert: true, broadcastMessage: 'আজ ক্লাস বন্ধ' }), null);
  assert.ok(broadcastPush({ broadcastAlert: true, broadcastMessage: 'পুরোনো' }, { broadcastAlert: true, broadcastMessage: 'নতুন খবর' }));
});

test('exam news goes only to that paper participants', () => {
  const exam = {
    id: 'E1', title: 'মডেল টেস্ট ৩', subject: 'গণিত', status: 'draft',
    participants: [{ id: 's260929001' }, { id: 's260929002' }]
  };
  assert.deepEqual(examPushes(null, exam), [], 'an unpublished paper is not announced');
  const announced = examPushes(exam, { ...exam, status: 'published', publishedAt: 100 });
  assert.equal(announced.length, 1);
  assert.deepEqual(announced[0].studentIds, ['s260929001', 's260929002']);
  const results = examPushes({ ...exam, status: 'published', resultsPublished: false }, { ...exam, status: 'published', resultsPublished: true, resultsPublishedAt: 200 });
  assert.equal(results.length, 1);
  assert.equal(results[0].kind, 'result');
  assert.deepEqual(examPushes(null, { ...exam, participants: [] }), [], 'nobody to tell');
});

test('recipients are batched at 500 and dead tokens are found', () => {
  assert.deepEqual(chunkTokens(Array.from({ length: 1200 }, (unused, index) => `t${index}`)).map(chunk => chunk.length), [500, 500, 200]);
  const tokens = ['a', 'b', 'c'];
  const results = { responses: [{ success: true }, { success: false, error: { code: 'messaging/registration-token-not-registered' } }, { success: false, error: { code: 'messaging/internal-error' } }] };
  assert.deepEqual(tokensToPrune(results, tokens), ['b'], 'a temporary failure keeps its token');
});

test('a pushed message and an in-app item read the same', () => {
  const message = messageFor('token-1', { title: 'নতুন নোটিশ: ক', body: 'খ', data: { collection: 'notices', id: 'N1', key: 'notice:N1:1', kind: 'notice', url: './index.html' } });
  assert.equal(message.token, 'token-1');
  assert.deepEqual(message.notification, { title: 'নতুন নোটিশ: ক', body: 'খ' });
  assert.equal(message.data.id, 'N1');
  assert.equal(message.webpush.fcmOptions.link, './index.html');
});
