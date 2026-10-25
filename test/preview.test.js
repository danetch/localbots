const test = require('node:test'), assert = require('node:assert');
const P = require('../lib/preview');

const live = { season: { id: 'MID2', name: 'Midnight Season 2' } };
const next = { game: 'wowt', season: { id: 'MID3', name: 'Midnight Season 3' } };

test('preview: greyed out without an upcoming season', () => {
  const st = P.status(live, null, {});
  assert.strictEqual(st.available, false); assert.strictEqual(st.on, false); assert.strictEqual(st.reset, false);
  assert.match(st.note, /No upcoming season in testing yet/);
  assert.strictEqual(P.settingsAfter(st, {}), null);
});

test('preview: available for a season that is not live, PTR by default, beta on request', () => {
  let st = P.status(live, next, {});
  assert.deepStrictEqual([st.available, st.on, st.game, st.label, st.next.id], [true, false, 'wowt', 'PTR', 'MID3']);
  st = P.status(live, next, { ptr: true, ptrSeason: 'MID3' });
  assert.strictEqual(st.on, true); assert.strictEqual(st.reset, false);
  st = P.status(live, { ...next, game: 'wow_beta' }, { ptr: true });
  assert.deepStrictEqual([st.game, st.label], ['wow_beta', 'Beta']);
  assert.strictEqual(P.status(live, { ...next, game: 'nonsense' }).game, 'wowt');
});

test('preview: the previewed season went live -> back to Live', () => {
  const nowLive = { season: { id: 'MID3', name: 'Midnight Season 3' } };
  // repo forgot to remove season-ptr.json: same id as live = not a preview any more
  for (const n of [null, { ...next }]) {
    const st = P.status(nowLive, n, { ptr: true, ptrSeason: 'MID3', beta: true });
    assert.deepStrictEqual([st.available, st.on, st.reset, st.wentLive], [false, false, true, true]);
    assert.match(st.note, /Midnight Season 3 is live now/);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(P.settingsAfter(st, { ptr: true, ptrSeason: 'MID3', beta: true }))), { ptr: false, beta: true });
  }
});

test('preview: preview withdrawn before going live -> back to Live, other wording', () => {
  const st = P.status(live, null, { ptr: true, ptrSeason: 'MID3' });
  assert.deepStrictEqual([st.reset, st.wentLive], [true, false]);
  assert.match(st.note, /No upcoming season in testing any more/);
});

test('preview: build of the preview game from wago builds', () => {
  const b = { wow: { version: '12.1.5.1' }, wowt: { version: '12.2.0.5' }, wow_beta: { version: '13.0.0.9' } };
  assert.strictEqual(P.buildOf(b, 'wowt'), '12.2.0.5'); assert.strictEqual(P.buildOf(b, 'wow_beta'), '13.0.0.9');
  assert.strictEqual(P.buildOf({ wow: {} }, 'wow_beta'), null);
});
