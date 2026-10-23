// Enchants, gems, sockets, diminishing returns, profession flask filter.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const E = require('../lib/enhance'), DR = require('../lib/dr'), bis = require('../lib/bis'), loot = require('../lib/loot');
const db = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/enhance.json'), 'utf8'));

test('enhance parsers: real simc row formats', () => {
  const ie = E.parseIE('  { 7969,      0, -7,   0,  80, 120, 0,   0,   0, {   5,   0,   0 }, {    0,    0,    0 }, {     49,      0,      0 }, {  0.8623f,  0.0000f,  0.0000f },       0, "Enchant Ring - Zul\'jin\'s Mastery |A:Professions-ChatIcon-Quality-12-Tier2:20:20|a" },');
  assert.deepStrictEqual(ie.get(7969), { stats: [{ type: 5, stat: 49, coef: 0.8623 }], name: "Enchant Ring - Zul'jin's Mastery" });
  assert.deepStrictEqual(E.parsePerm('  { 7969,  2,  4, 0x00000800, 0x0000001f, "enchant_ring__zuljins_mastery"     },')[0], { id: 7969, rank: 2, cls: 4, inv: 0x800, sub: 0x1f, token: 'enchant_ring__zuljins_mastery' });
  assert.deepStrictEqual(E.parseGemProps('  { 4388,  8145, 0x0000000e, 14276 }, // +$k1 Critical Strike').get(4388), { enchant: 8145, color: 14276, desc: '+$k1 Critical Strike' });
  const gi = E.parseGemItems('  { "Flawless Deadly Garnet", 240904, 0x00000000, 0x00006000, 0x00, 278, 1, 0, 0, 3, 0, 3, 5, 0, 0, 0.000000f, 0.000000f, 0, 0, 0xffff, 0xffffffffffffffff, { 0, 0, 0 }, 4388, 0, 0, 0, 0, 2 },');
  assert.deepStrictEqual(gi, [{ id: 240904, name: 'Flawless Deadly Garnet', cq: 2, gp: 4388 }]);
  assert.deepStrictEqual(E.parseSocketBonuses('  { 31197, 13750,  6,       1,       7,       0,       0,  0 },\n  { 31198, 13750, 26, 5, 0, 0, 0, 1 },'), { 13750: 1 });
});

test('bundled data: Midnight enchants and gems only (best rank), sensible choices per spec', () => {
  assert.ok(db.enchants.length > 30 && db.gems.length >= 32 && Object.keys(db.socketBonus).length > 50);
  const names = db.enchants.map(e => e.name);
  assert.ok(names.includes("Zul'jin's Mastery") && !names.some(n => /algari|radiant|stormrider/i.test(n)), 'no older expansion enchants');
  const mage = E.enchantsFor(db, { primary: 'int', cls: 'mage', spec: 'fire', slots: ['chest', 'legs', 'finger1', 'main_hand', 'feet', 'shoulder', 'head'], offWeapon: false });
  assert.deepStrictEqual(Object.keys(mage).sort(), ['chest', 'finger1', 'legs', 'main_hand'], 'utility slots skipped');
  assert.ok(mage.chest.every(e => e.name !== 'Mark of Nalorakk') && mage.legs.every(e => /Spellthread/.test(e.name)));
  assert.ok(!mage.finger1.some(e => e.name === 'Amani Mastery'), 'weaker same-stat ring enchant pruned');
  assert.ok(!mage.main_hand.some(e => /Hawkeye|Lynxeye/.test(e.name)), 'scopes only for ranged hunters');
  const hunter = E.enchantsFor(db, { primary: 'agi', cls: 'hunter', spec: 'marksmanship', slots: ['main_hand'] });
  assert.ok(hunter.main_hand.some(e => /Hawkeye/.test(e.name)));
  const g = E.gemsFor(db);
  assert.strictEqual(g.gems.length, 16); assert.ok(g.gems.every(x => /^Flawless/.test(x.name)));
  assert.deepStrictEqual(g.diamonds.map(d => d.name).sort(), ['Indecipherable Eversong Diamond', 'Powerful Eversong Diamond']);
});

test('sockets: built-in + bonus ids + listed gems; loot neck/ring get the drop socket; jewelbinder only on socketless pieces', () => {
  const built = id => ({ 268265: 1 })[id] || 0;
  assert.strictEqual(E.socketsOf('finger1', ',id=1', db), 1, 'loot ring: drop socket');
  assert.strictEqual(E.socketsOf('neck', ',id=268265,ilevel=344', db, { base: built }), 2, 'Aqirbane Reliquary from loot: 1 built-in + drop socket');
  assert.strictEqual(E.socketsOf('neck', ',id=268265,bonus_id=13662/13668', db, { base: built }), 2, 'from the export: built-in + bonus 13668');
  assert.strictEqual(E.socketsOf('neck', ',id=273781,bonus_id=6652/13668/12854', db, { base: built }), 1);
  assert.strictEqual(E.socketsOf('head', ',id=1', db), 0);
  assert.strictEqual(E.socketsOf('head', ',id=1', db, { add: ['head'] }), 1);
  assert.strictEqual(E.socketsOf('wrist', ',id=1,bonus_id=13750', db, { add: ['wrist'] }), 1, 'jewelbinder never adds a second socket');
  assert.strictEqual(E.socketsOf('neck', ',id=1,bonus_id=5,gem_id=1/2', db), 2, 'listed gems');
  assert.strictEqual(E.socketsOf('neck', '', db), 0);
});

test('materialize: enchant follows the slot, gem plan fills sockets, diamond never repeated', () => {
  const isD = id => id === '240983';
  const base = { neck: ',id=1,gem_id=240904', finger1: ',id=2,enchant_id=7965', finger2: ',id=3', head: ',id=4', off_hand: ',id=9' };
  const S = { ...base, 'ench:finger1': '7969', 'ench:off_hand': '8041', gems: '240983,240904' };
  const m = E.materialize(S, { db, enchOn: true, gemsOn: true, add: ['head'], isD, isWeapon: () => false });
  assert.strictEqual(m.finger1, ',id=2,enchant_id=7969,gem_id=240904');
  assert.strictEqual(m.neck, ',id=1,gem_id=240983');
  assert.strictEqual(m.head, ',id=4,gem_id=240904');
  assert.strictEqual(m.off_hand, ',id=9', 'no weapon enchant on a non-weapon off hand');
  assert.ok(!('gems' in m) && !Object.keys(m).some(k => k.startsWith('ench:')));
  assert.deepStrictEqual(E.fit('240983', 3, isD), ['240983'], 'diamond is unique');
});

test('gems follow the set (Top Gear / Droptimizer): swapping the piece holding the diamond keeps the diamond', () => {
  const isD = id => id === '240983', built = id => ({ 268265: 1 })[id] || 0;
  const base = { neck: ',id=273781,bonus_id=13668,gem_id=240983', finger1: ',id=2,bonus_id=13668,gem_id=240904', finger2: ',id=3,bonus_id=13668', head: ',id=4,bonus_id=13750,gem_id=240910', wrist: ',id=5' };
  const k = E.keepCtx(base, db, built, isD);
  assert.deepStrictEqual(k.keepAdd, ['head'], 'only the socketed head keeps a jewelbinder socket');
  assert.strictEqual(k.filled, 1, 'empty ring socket filled');
  const M = S => E.materialize(S, k), MB = M(base);
  assert.strictEqual(MB.neck, ',id=273781,bonus_id=13668,gem_id=240983');
  // a loot neck with 2 sockets (Aqirbane Reliquary) replaces the diamond neck: diamond + one more gem, rings keep theirs
  const n2 = M({ ...base, neck: ',id=268265,ilevel=344' });
  assert.strictEqual(n2.neck, ',id=268265,ilevel=344,gem_id=240983/240904');
  assert.strictEqual(E.gemsIn(n2.head).length, 1);
  // a new head without bonus ids still gets a socket (today's head is socketed); a new wrist does not (today's wrist is not)
  assert.strictEqual(E.gemsIn(M({ ...base, head: ',id=40,ilevel=344' }).head).length, 1);
  assert.strictEqual(E.gemsIn(M({ ...base, wrist: ',id=50,ilevel=344' }).wrist).length, 0);
  // the gem total never changes except when the socket count does
  const all = S => Object.values(M(S)).flatMap(E.gemsIn);
  assert.strictEqual(all({ ...base, finger1: ',id=60,ilevel=344' }).length, all(base).length);
  assert.strictEqual(all({ ...base, finger1: ',id=60,ilevel=344' }).filter(isD).length, 1);
});

test('gem plan moves: canonical, distinct, include diamond swaps and single replacements', () => {
  const ch = E.gemsFor(db), isD = id => ch.diamonds.some(d => String(d.id) === String(id));
  const d0 = String(ch.diamonds[0].id), a = String(ch.gems[0].id), b = String(ch.gems[1].id);
  const mv = E.planMoves(`${d0},${a},${a}`, 3, ch, isD);
  assert.ok(mv.includes(E.canon([String(ch.diamonds[1].id), a, a], isD)));
  assert.ok(mv.includes(E.canon([d0, a, b], isD)));
  assert.ok(mv.includes(E.canon([d0, b, b], isD)));
  assert.ok(!mv.includes(`${d0},${a},${a}`) && new Set(mv).size === mv.length);
});

test('diminishing returns: curve, interaction only on the same stat in the DR zone', () => {
  const conv = DR.perPct(90);
  assert.deepStrictEqual([46, 44, 46, 54], [conv.crit, conv.haste, conv.mastery, conv.versatility]);
  const b = DR.band(46 * 35, 46); assert.ok(Math.abs(b.eff - 34.5) < 1e-9 && b.slope === 0.9);
  assert.strictEqual(DR.band(46 * 10, 46).slope, 1);
  const base = { crit: 46 * 29, haste: 44 * 10, mastery: 0, versatility: 0 };
  assert.deepStrictEqual(DR.interacts(base, { crit: 100 }, { crit: 50 }, conv), ['crit'], 'crosses 30 %');
  assert.deepStrictEqual(DR.interacts(base, { haste: 100 }, { haste: 50 }, conv), [], 'haste stays below 30 %');
  assert.deepStrictEqual(DR.interacts(base, { crit: 100 }, { haste: 500 }, conv), [], 'different stats never interact');
});

test('bis: DR pairs and DR-aware winner picking', () => {
  const rules = { tags: {}, embBonusIds: new Set(), maxEmb: 2, maxCat: Infinity };
  const S = { head: ',id=1', flask: 'a' }, base = { crit: 46 * 32, haste: 0, mastery: 0, versatility: 0 }, conv = DR.perPct(90);
  const g = [{ diff: { head: ',id=2' }, gain: 50, d: { crit: 200 } }, { diff: { head: ',id=3' }, gain: 40, d: { haste: 200 } }];
  const c = [{ diff: { flask: 'crit_flask' }, gain: 30, d: { crit: 300 } }];
  const p = bis.drPairs(S, g, c, rules, base, conv, DR.interacts);
  assert.deepStrictEqual(p.map(x => x.diff), [{ head: ',id=2', flask: 'crit_flask' }]);
  const S2 = { head: ',id=1', neck: ',id=5', flask: 'a' };
  const e = [{ diff: { head: ',id=2' }, gain: 50, d: { crit: 200 } }, { diff: { neck: ',id=6' }, gain: 40, d: { crit: 150 } }, { diff: { flask: 'x' }, gain: 30, d: { haste: 100 } }];
  assert.strictEqual(bis.pickWinners(S2, e, rules, 0, 12).length, 3);
  const w = bis.pickWinners(S2, e, rules, 0, 12, x => DR.drStats(base, x.d, conv));
  assert.deepStrictEqual(w.map(x => Object.keys(x.entry.diff)[0]), ['head', 'flask'], 'second crit change waits for the next round');
});

test('consumables: profession phials, honor flask and cauldrons are hidden', () => {
  for (const n of ['Haranir Phial of Perception', 'Haranir Phial of Ingenuity', 'Haranir Phial of Finesse', 'Vicious Thalassian Flask of Honor', 'Cauldron of Sin\'dorei Flasks']) assert.ok(loot.NOT_COMBAT.test(n), n);
  for (const n of ['Flask of the Magisters', 'Flask of the Shattered Sun', 'Flask of Thalassian Resistance', 'Flask of the Blood Knights', 'Twilight Angler\'s Medley']) assert.ok(!loot.NOT_COMBAT.test(n), n);
});
