const test = require('node:test'), assert = require('node:assert'), path = require('path');
const S = require('../lib/season');
const rd = f => JSON.parse(require('fs').readFileSync(path.join(__dirname, 'fixtures', 'data', f), 'utf8'));
const live = () => ({ season: rd('season.json'), progression: rd('progression.json'), crafted: rd('crafted.json') });

test('season: next id / name, upgrade tracks from the new raid drops', () => {
  assert.strictEqual(S.nextId('MID2'), 'MID3'); assert.strictEqual(S.nextName('Midnight Season 2'), 'Midnight Season 3'); assert.strictEqual(S.nextId('X'), null);
  assert.deepStrictEqual(S.tracksFrom([619, 620, 621, 622, 619], { 616: 'champion', 617: 'hero', 618: 'myth' }), { 620: 'champion', 621: 'hero', 622: 'myth' });
  assert.strictEqual(S.tracksFrom([620], { 616: 'champion', 617: 'hero', 618: 'myth' }), null);
});

test('season: draft from a new PTR raid, then a second raid added', () => {
  const L = live();
  const d = S.draft({ live: L, prev: null, raids: [{ id: '1310', name: 'The Next Raid', bosses: ['Boss One', 'Boss Two'] }], groups: [619, 620, 621, 622], game: 'wowt', tierSet: 'MID3' });
  assert.strictEqual(d.season.season.id, 'MID3'); assert.strictEqual(d.season.season.name, 'Midnight Season 3'); assert.strictEqual(d.season.game, 'wowt');
  assert.deepStrictEqual(d.season.season.raids, ['The Next Raid']); assert.strictEqual(d.season.season.tierSet, 'MID3');
  assert.deepStrictEqual(d.season.season.upgradeTracks, { 620: 'champion', 621: 'hero', 622: 'myth' });
  assert.strictEqual(d.progression.seasonId, 'MID3'); assert.strictEqual(d.crafted.seasonId, 'MID3');
  assert.deepStrictEqual(Object.keys(d.progression.sources.raid_mythic.bossOverrides), ['boss one', 'boss two']);
  assert.deepStrictEqual(d.progression.sources.raid_mythic.bossOverrides['boss one'], { track: 'myth', rank: 1 });
  assert.ok(d.todo.some(t => /item levels not found/.test(t)) && d.todo.some(t => /rank of each source/.test(t)) && d.todo.some(t => /sources/.test(t)));   // no simc levels given
  assert.ok(require('../lib/datafiles').valid('season-ptr.json', JSON.stringify(d.season)));
  assert.strictEqual(L.season.season.id, 'MID2');   // live objects untouched
  const d2 = S.draft({ live: L, prev: { season: d.season, progression: d.progression, crafted: d.crafted }, raids: [{ id: '1310', name: 'The Next Raid', bosses: [] }, { id: '1311', name: 'Second Raid', bosses: ['Big Boss'] }], groups: [], game: 'wowt' });
  assert.deepStrictEqual(d2.added, ['Second Raid']); assert.deepStrictEqual(d2.season.season.raids, ['The Next Raid', 'Second Raid']);
  assert.deepStrictEqual(d2.season.season.upgradeTracks, d.season.season.upgradeTracks);
  assert.ok('big boss' in d2.progression.sources.raid_mythic.bossOverrides && 'boss one' in d2.progression.sources.raid_mythic.bossOverrides);
  // beta of a new expansion: id and name left to fill
  const b = S.draft({ live: L, prev: null, raids: [{ id: '2000', name: 'X', bosses: [] }], groups: [], game: 'wow_beta' });
  assert.strictEqual(b.season.game, 'wow_beta'); assert.ok(b.todo.some(t => /new expansion/.test(t)) && b.todo.some(t => /qualityRanks/.test(t)));
});

test('season: promotion moves the preview live and archives the old fights', () => {
  const L = live(), d = S.draft({ live: L, prev: null, raids: [{ id: '1310', name: 'The Next Raid', bosses: ['Boss One'] }], groups: [], game: 'wowt' });
  const fights = [{ file: 'kithix.json', json: { id: 'kithix' } }, { file: 'bossone.json', json: { id: 'bossone', ptr: true, draft: true } }];
  const p = S.promote({ season: L.season, seasonPtr: d.season, progressionPtr: d.progression, craftedPtr: d.crafted, fights });
  assert.deepStrictEqual([p.from, p.to], ['MID2', 'MID3']);
  assert.ok(!('game' in p.season) && !('todo' in p.season));
  assert.deepStrictEqual(p.archive, ['kithix.json']); assert.deepStrictEqual(p.keep, [{ file: 'bossone.json', json: { id: 'bossone', draft: true } }]);
  assert.strictEqual(S.promote({ season: L.season, seasonPtr: null, fights }), null);
  assert.strictEqual(S.promote({ season: p.season, seasonPtr: d.season, fights }), null);   // already live
  // the app then sees no preview: back to Live for anyone who had the switch on
  assert.strictEqual(require('../lib/preview').status(p.season, null, { ptr: true, ptrSeason: 'MID3' }).wentLive, true);
});

test('season: upgrade-track item levels from simc item_bonus + item_scaling (real 12.1.5 extract)', () => {
  const fs = require('fs'), dir = path.join(__dirname, 'fixtures', 'simc');
  const L = S.groupLevels(fs.readFileSync(path.join(dir, 'item_bonus.inc'), 'utf8'), fs.readFileSync(path.join(dir, 'item_scaling.inc'), 'utf8'));
  assert.deepStrictEqual(L[618], [318, 321, 324, 328, 331, 334, 337, 341, 344]);        // 7..9 = drop-only levels (344 = last bosses)
  const T = S.trackLevels({ 616: 'champion', 617: 'hero', 618: 'myth' }, L), P = rd('progression.json');
  for (const k of ['champion', 'hero', 'myth']) assert.deepStrictEqual(T[k], P.tracks[k].ilvl, k);
  // a draft with the PTR's levels fills the tracks and drops that to-do item
  const d = S.draft({ live: live(), prev: null, raids: [{ id: '1', name: 'R', bosses: ['B'] }], groups: [615, 616, 617, 618], game: 'wowt', levels: { 616: [1, 2, 3, 4, 5, 6], 617: [11, 12, 13, 14, 15, 16], 618: [21, 22, 23, 24, 25, 26, 27] } });
  assert.deepStrictEqual(d.progression.tracks.myth.ilvl, [21, 22, 23, 24, 25, 26]);
  assert.ok(!d.todo.some(t => /item levels not found/.test(t)));
  assert.deepStrictEqual(d.season.season.raidBosses, { R: ['B'] });
});
