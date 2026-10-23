const test = require('node:test'), assert = require('node:assert');
const L = p => require('../lib/' + p);

test('fight args: forbidden extra options are dropped', () => {
  const a = L('fight').fightArgs({ fightStyle: 'Patchwerk', extra: 'html=x.html\njson2=a\nthreads=99\niterations=1\nprofileset.x=y\nfoo=bar\nsave=z' });
  assert.ok(a.includes('foo=bar')); assert.ok(a.includes('fight_style=Patchwerk'));
  for (const bad of ['html=x.html', 'json2=a', 'threads=99', 'iterations=1', 'profileset.x=y', 'save=z']) assert.ok(!a.includes(bad), bad);
});

test('tier: twin keeps options, never twins twice, preference wins', () => {
  const t = L('tier');
  assert.strictEqual(t.twin(',id=1,bonus_id=2', 9), ',id=9,bonus_id=2,redirected_base_stats=1');
  assert.strictEqual(t.twin(',id=9,bonus_id=2', 9), null);
  assert.strictEqual(t.twin(',id=1,redirected_base_stats=5', 9), null);
  assert.strictEqual(t.withIlvl(',id=1', 'Helm (289)'), ',id=1,ilevel=289');
  const sets = [{ cls: 1, tier: 'MID2' }, { cls: 1, tier: 'MID3' }, { cls: 2, tier: 'MID2' }];
  assert.strictEqual(t.pickSet(sets, 1).tier, 'MID3');
  assert.strictEqual(t.pickSet(sets, 1, 'MID2').tier, 'MID2');
  assert.strictEqual(t.classOf('warrior="x"'), 1);
});

test('items: parse rows, kinds and Titan detection', () => {
  const I = L('items');
  const row = (id, inv, cls, sub) => `  { "n", ${id}, 0, 0, 0, 100, 1, 0, 0, 4, ${inv}, ${cls}, ${sub} },\n`.replace('{ "n", ', '{ "n", ');
  const p = I.parse('wow build 12.0.1.1\n' + row(1, 17, 2, 1) + row(2, 13, 2, 7) + row(3, 22, 2, 0) + row(4, 14, 4, 6), ['5']);
  assert.ok(p.build === '12.0.1.1');
  const m = I.make(p);
  assert.ok(m.embBonusIds.has('5'));
  assert.ok(I.isTitan('warrior="a"\nspec=fury'));
  assert.ok(!I.isTitan('warrior="a"\nspec=arms'));
  assert.ok(!I.isTitan('paladin="a"\nspec=fury'));
});

test('crafted: slug, embellishment parse, variants respect slots', () => {
  const C = L('crafted');
  assert.strictEqual(C.slug("Hunter's Ritual Stone"), 'hunters_ritual_stone');
  assert.deepStrictEqual(C.parseEmbellishments('  { "Adorned Fang", 1234, 1, 2 },')[0], { name: 'Adorned Fang', key: 'adorned_fang', bonusId: 1234 });
  const INV = { 9: ['wrist'], 11: ['finger1', 'finger2'] };
  const v = C.variants({ rules: { ilvl: 331, embellishments: { a: { slots: ['wrist'] }, r: { slots: ['finger'] } } }, emb: ['a', 'r'], pairs: ['32/36'], plain: false, cls: 1,
    crafted: [{ id: 1, name: 'Bracers', cls: 4, sub: 4, inv: 9 }, { id: 2, name: 'Ring', cls: 4, sub: 0, inv: 11 }, { id: 3, name: 'Cloth', cls: 4, sub: 1, inv: 9 }] }, INV);
  assert.ok(v.every(x => /ilevel=331,crafted_stats=32\/36,embellishment=/.test(x.item)));
  assert.strictEqual(v.filter(x => x.slot === 'wrist').length, 1);            // cloth refused for a warrior, ring embellishment not on wrist
  assert.strictEqual(v.filter(x => /^finger/.test(x.slot)).length, 2);
});

test('gear: extracts ilevel and secondary ratings', () => {
  const g = L('gear').extractGear({ gear: { head: { ilevel: 289, crit_rating: 100, name: 'x', armor: 5 }, bad: null } });
  assert.deepStrictEqual(g, { head: { ilvl: 289, crit_rating: 100 } });
});

test('specs: primary stat per spec, filter keeps unknown items', () => {
  const S = L('specs');
  assert.strictEqual(S.primaryOf('demonhunter="x"\nspec=devourer'), 'int');
  assert.strictEqual(S.primaryOf('demonhunter="x"\nspec=havoc'), 'agi');
  assert.strictEqual(S.primaryOf('warlock="x"\nspec=demonology'), 'int');
  assert.strictEqual(S.primaryOf('rogue="x"'), 'agi');
  assert.strictEqual(S.primaryOf('paladin="x"\nspec=holy'), 'int');
  assert.strictEqual(S.primaryOf('paladin="x"\nspec=retribution'), 'str');
  assert.strictEqual(S.primaryOf('foo'), null);
  assert.ok(S.fits('int', null)); assert.ok(S.fits('int', 'int ')); assert.ok(!S.fits('int', 'agi '));
});

test('items: primary stats come from the stats table', () => {
  const I = L('items');
  const txt = 'static const x __item_stats_data[3] = {\n  {  7,  10, 0.0f },\n  {  5,  20, 0.0f },\n  {  3,  20, 0.0f },\n};\n' +
    '  { "A", 1, 0, 0, 0, 300, 80, 0, 0, 4, 1, 4, 3, 2, 0, 0.0f, 0.0f, &__item_stats_data[0], 2, 0 },\n' +
    '  { "B", 2, 0, 0, 0, 300, 80, 0, 0, 4, 1, 4, 3, 2, 0, 0.0f, 0.0f, &__item_stats_data[2], 1, 0 },\n';
  const m = I.make(I.parse(txt));
  assert.strictEqual(m.prim(1), 'int '); assert.strictEqual(m.prim(2), 'agi '); assert.strictEqual(m.prim(3), null);
});

test('loot.select drops items of another primary stat', () => {
  const lo = L('loot');
  const data = { instances: { 1: { name: 'R', bosses: { 1: { name: 'B', items: [1, 2, 3] } } } }, items: {
    1: { name: 'a', cls: 4, sub: 4, inv: 12 }, 2: { name: 'b', cls: 4, sub: 0, inv: 12 }, 3: { name: 'c', cls: 4, sub: 0, inv: 12 } } };
  const prim = { 1: 'agi ', 2: 'int ' };
  const r = lo.select(data, { instanceIds: ['1'], armor: 'plate', ilvl: 300, primary: 'int', primOf: id => prim[id] || null });
  assert.deepStrictEqual(r.map(x => x.id).sort(), [2, 3]);
});

test('boss: kithix heroic builds well-formed, ordered raid events', () => {
  const B = L('boss'), def = B.list([require('path').join(__dirname, '..', 'data', 'fights')]).find(b => b.id === 'kithix');
  assert.ok(def);
  const r = B.build(def, { difficulty: 'heroic', duration: 300 });
  assert.deepStrictEqual(r.stages, [{ id: 1, at: 0 }, { id: 2, at: 225 }]);
  for (const e of r.events) {
    assert.match(e, /^raid_events\+=\/[a-z_]+,[\w=.:,\-]+$/);
    const t = /timestamps=([\d:]+)/.exec(e)[1].split(':').map(Number);
    assert.deepStrictEqual(t, [...t].sort((a, b) => a - b));
    assert.ok(t.every(x => x < 300));
  }
  assert.ok(r.events.some(e => /^raid_events\+=\/adds,name=voidswarm,timestamps=5:/.test(e)));
  assert.ok(r.events.some(e => /nullgate,timestamps=228:235/.test(e)));          // heroic: stage 2 + 3s / + 10s
  const m = B.build(def, { difficulty: 'mythic', duration: 300 });
  assert.ok(m.events.some(e => /nullgate,timestamps=226:235/.test(e)));          // mythic: stage 2 + 1s
  const a = L('fight').fightArgs({ fightStyle: 'Patchwerk', raidEvents: [...r.events, 'raid_events+=/x; rm -rf /'] });
  assert.strictEqual(a.filter(x => x.startsWith('raid_events+=/')).length, r.events.length);   // malformed lines are refused
});

test('fight: boss fights must not pass fight_style (simc clears raid_events for Patchwerk)', () => {
  const a = L('fight').fightArgs({ fightStyle: '', raidEvents: ['raid_events+=/movement,name=a,timestamps=5,duration=2'] });
  assert.ok(!a.some(x => x.startsWith('fight_style=')));
  assert.ok(a.includes('raid_events+=/movement,name=a,timestamps=5,duration=2'));
});

test('boss: every bundled fight builds valid, increasing, in-range timestamps', () => {
  const B = L('boss'), defs = B.list([require('path').join(__dirname, '..', 'data', 'fights')]);
  assert.ok(defs.length >= 9);
  for (const d of defs) for (const df of Object.keys(d.difficulties)) {
    const r = B.build(d, { difficulty: df, duration: d.defaultDuration });
    assert.ok(r.events.length > 0, d.id + '/' + df);
    for (const e of r.events) {
      assert.match(e, /^raid_events\+=\/(adds|movement|vulnerable|invulnerable|damage_done_buff),[\w=.:,\-]+$/, e);
      const t = /timestamps=([\d:]+)/.exec(e)[1].split(':').map(Number);
      assert.deepStrictEqual(t, [...new Set(t)].sort((a, b) => a - b), e);
      assert.ok(t.every(x => x >= 0 && x < r.length), e);
    }
  }
});

test('engine: picks the newest Windows nightly and reads the simc banner', () => {
  const E = L('engine');
  const html = '<a href="simc-1210-01-win64-aaaaaaa.7z">x</a> <a href="simc-1210-01-win64-aaaaaaa.7z">x</a><a href="simc-1209-02-win64-bbbbbbb.7z">y</a><a href="simc-1210-01-macos-ccccccc.dmg">z</a>';
  assert.deepStrictEqual(E.latest(html, 'win32'), { name: 'simc-1210-01-win64-aaaaaaa.7z', url: E.BASE_URL + 'simc-1210-01-win64-aaaaaaa.7z', version: '1210-01', hash: 'aaaaaaa', date: '' });
  assert.strictEqual(E.latest(html, 'linux'), null);
  assert.strictEqual(E.latest('nothing', 'win32'), null);
  const v = E.versionOf('SimulationCraft 1210-01 for World of Warcraft 12.1.5.70448 Live (hotfix 2026-10-20/70448, git build midnight 7bc1071, no-networking)');
  assert.deepStrictEqual(v, { simc: '1210-01', wow: '12.1.5.70448', branch: 'Live', hotfix: '2026-10-20/70448', git: '7bc1071' });
  assert.strictEqual(E.versionOf('garbage'), null);
});

test('weapons per class and spec, shields', () => {
  const sp = require('../lib/specs'), loot = require('../lib/loot');
  const mage = 'mage="X"\nspec=arcane\n';
  assert.deepStrictEqual(sp.weaponsOf(mage), [7, 10, 15, 19]);
  assert.deepStrictEqual(sp.weaponsOf('rogue="X"\nspec=assassination\n'), [15]);
  assert.ok(sp.weaponsOf('rogue="X"\nspec=outlaw\n').includes(7));
  assert.strictEqual(sp.weaponsOf('nothing'), null);
  assert.ok(sp.canShield('warrior="X"\n') && !sp.canShield(mage) && sp.canShield('unknown'));
  assert.ok(Object.keys(sp.weaponsOf('warrior="X"\n')).length && sp.weaponsOf('warrior="X"\n').every(i => loot.WEAPONS[i]));
  // loot.select: the class weapon list and the shield flag filter weapons and shields
  const L = { instances: { i: { name: 'I', bosses: { b: { name: 'B', items: [1, 2, 3] } } } }, items: {
    1: { name: 'Dagger', cls: 2, sub: 15, inv: 13 }, 2: { name: 'Axe', cls: 2, sub: 0, inv: 13 }, 3: { name: 'Shield', cls: 4, sub: 6, inv: 14 } } };
  const names = f => loot.select(L, { instanceIds: ['i'], ilvl: 300, ilvlFor: () => ({ ilvl: 300 }), armor: 'cloth', includeWeapons: true, ...f }).map(x => x.name).sort();
  assert.deepStrictEqual(names({ weapons: sp.weaponsOf(mage), shield: false }), ['Dagger']);
  assert.deepStrictEqual(names({ weapons: sp.weaponsOf('warrior="X"\n'), shield: true }), ['Axe', 'Dagger', 'Shield']);
});

test('consumable names follow simc quality suffixes', () => {
  const loot = require('../lib/loot'), items = require('../lib/items');
  const row = (name, id, q) => `  { "${name}", ${id}, 0x0, 0x0, 0x00, 80, 71, 0, 0, 1, 0, 0, 1, 0, 0, 0.000000f, 0.000000f, 0, 0, 0xffff, 0xffffffffffffffff, { 0, 0, 0 }, 0, 0, 0, 0, 0, ${q} },`;
  const j = items.parse([row('Tempered Potion', 1, 1), row('Tempered Potion', 2, 2), row('Tempered Potion', 3, 3), row('Vendor Flask', 4, 0), row('Solo Potion', 5, 1)].join('\n'));
  // the row's consumable class/subclass columns: class 0 sub 1 (potion) -> adjust the fixture the parser reads
  assert.ok(j.cq && typeof j.cq === 'object');
  const it = (id, sub) => ({ id: String(id), cls: '0', sub: String(sub) }), sp = (id, name) => ({ id: String(id), name, exp: '10' });
  const cq = { 1: 1, 2: 2, 3: 3, 5: 1 };
  const out = loot.build ? null : null; void out;
  const c = require('../lib/loot');
  const built = c.buildConsumables ? c.buildConsumables([it(1, 1), it(2, 1), it(3, 1), it(4, 3), it(5, 1)], [sp(1, 'Tempered Potion'), sp(2, 'Tempered Potion'), sp(3, 'Tempered Potion'), sp(4, 'Vendor Flask'), sp(5, 'Solo Potion')], cq) : null;
  assert.ok(built, 'buildConsumables exported');
  assert.deepStrictEqual(built.potion.map(o => o.value), ['tempered_potion', 'tempered_potion_2', 'tempered_potion_3', 'solo_potion']);
  assert.deepStrictEqual(built.flask.map(o => o.value), ['vendor_flask']);
  assert.ok(!c.buildConsumables([it(1, 1), it(2, 1)], [sp(1, 'A Potion'), sp(2, 'A Potion')]).potion.some(o => /_2$/.test(o.value)));   // no data -> no guessed ranks
});

test('engine: family pinning (no PTR/beta), build comparison, dates', () => {
  const E = L('engine');
  const row = (n, d) => `<tr><td><a href="${n}">${n}</a></td><td align="right">${d}  </td></tr>`;
  const html = row('simc-1220-01-win64-ddddddd.7z', '2026-10-22 09:00') + row('simc-1210-01-win64-aaaaaaa.7z', '2026-10-21 18:03') + row('simc-1210-01-win64-bbbbbbb.7z', '2026-10-15 10:00');
  assert.strictEqual(E.latest(html, 'win32').version, '1220-01');                      // no family: highest
  const l = E.latest(html, 'win32', '1210-01');                                         // installed family: newest build of it
  assert.deepStrictEqual([l.hash, l.date], ['aaaaaaa', '2026-10-21 18:03']);
  assert.deepStrictEqual(E.families(html, 'win32'), ['1220-01', '1210-01']);
  assert.strictEqual(E.latest(html, 'win32', '1100-01'), null);
  assert.ok(E.sameBuild('7bc1071', '7bc1071abc') && !E.sameBuild('7bc1071', 'aaaaaaa') && !E.sameBuild('', 'aaaaaaa'));
  assert.strictEqual(E.familyOf('#define SC_MAJOR_VERSION "1210"\n#define SC_MINOR_VERSION "01"'), '1210-01');
  assert.strictEqual(E.familyOf('nothing'), null);
});

test('progression: boss overrides match whatever the apostrophes, case or title', () => {
  const P = require('../lib/progression'), prog = { tracks: { myth: { name: 'Myth', ilvl: [318, 321, 324, 328, 331, 334] } },
    sources: { m: { track: 'myth', rank: 1, bossOverrides: { "ula'tek": { ilvl: 344 } } } } };
  for (const b of ['Ula’tek', "Ula'tek, the Devourer", 'ULATEK']) assert.strictEqual(P.resolve(prog, 'm', b).ilvl, 344, b);
  assert.deepStrictEqual(P.resolve(prog, 'm', 'Kith\'ix'), { ilvl: 318, label: 'Myth 1/6', override: false });
});

test('loot: older copy of a remade item and Azerite-style items are left out', () => {
  const loot = require('../lib/loot');
  const L = { instances: { 1: { name: "Kings' Rest", bosses: { 9: { name: 'Dazar', items: ['159236', '239047', '500'] } } } },
    items: { 159236: { name: 'Headdress of the First Empire', cls: 4, sub: 1, inv: 1 }, 239047: { name: 'Headdress of the First Empire', cls: 4, sub: 1, inv: 1 }, 500: { name: 'Old Hood', cls: 4, sub: 1, inv: 1 } } };
  const sk = [], r = loot.select(L, { instanceIds: ['1'], armor: 'cloth', ilvl: 334, noSec: id => ['159236', '500'].includes(String(id)), skipped: sk });
  assert.deepStrictEqual(r.map(x => x.id), ['239047']);
  assert.deepStrictEqual(sk.map(x => x.id).sort(), ['159236', '500']);
  const I = require('../lib/items'), m = I.make(require('../data/items.json'));
  assert.ok(m.noSec(159236) && !m.noSec(239047) && !m.noSec(271874), 'bundled data flags the Azerite budget only');
});

test('upgrade: bag items raised to their track maximum (Hero / Myth 6/6), nothing above it, unknown tracks untouched', () => {
  const U = require('../lib/upgrade'), tg = require('../lib/topgear'), db = require('../data/enhance.json'), P = require('../data/progression.json');
  assert.deepStrictEqual(U.upgradeItem(',id=1,bonus_id=6652/12843', 'Cloak (311)', db.upgrade, P), { item: ',id=1,bonus_id=6652/12843,ilevel=321', from: 311, to: 321, label: 'Hero 6/6' });
  assert.strictEqual(U.upgradeItem(',id=1,bonus_id=12849,ilevel=318', '', db.upgrade, P).item, ',id=1,bonus_id=12849,ilevel=334');
  assert.strictEqual(U.upgradeItem(',id=1,bonus_id=13848,ilevel=344', '', db.upgrade, P), null, 'Myth 9/6 (344) stays');
  assert.strictEqual(U.upgradeItem(',id=1,bonus_id=12846', 'X (321)', db.upgrade, P), null, 'already 6/6');
  assert.strictEqual(U.upgradeItem(',id=1,crafted_stats=32/40', 'Crafted (331)', db.upgrade, P), null);
  const text = 'warlock="a"\nhead=,id=10,bonus_id=12843\n# Hood (311)\n# head=,id=11,bonus_id=12841\n';
  const p1 = tg.parse(text), up = U.upgradePools(p1, 'bags', db.upgrade, P);
  assert.deepStrictEqual(up.map(u => [u.from, u.to]), [[311, 321]]);
  assert.ok(p1.pools.head.includes(',id=11,bonus_id=12841,ilevel=321') && p1.labels[',id=11,bonus_id=12841,ilevel=321'] === 'Hood (311 → 321)');
  assert.ok(p1.pools.head.includes(',id=10,bonus_id=12843'), 'equipped untouched with "bags"');
  const p2 = tg.parse('warlock="a"\n# Helm (311)\nhead=,id=10,bonus_id=12843\n'); U.upgradePools(p2, 'all', db.upgrade, P);
  assert.deepStrictEqual(p2.equipped.head, [',id=10,bonus_id=12843,ilevel=321']);
});

test('top gear pre-screen: estimate, best candidates kept across slots, equipped always kept, emb-cap branches cut', () => {
  const tg = require('../lib/topgear');
  assert.strictEqual(tg.estimate({ head: [1, 2, 3], finger: [1, 2, 3, 4] }), 3 * 6);
  const parsed = { pools: { head: ['h0', 'h1', 'h2', 'h3'], wrist: ['w0', 'w1', 'w2'] }, equipped: { head: ['h0'], wrist: ['w0'] }, labels: {} };
  const gain = { h1: 50, h2: -10, h3: 40, w1: 45, w2: 1 }, pr = tg.prunePools(parsed, i => gain[i], 6);
  assert.deepStrictEqual(parsed.pools, { head: ['h0', 'h1', 'h3'], wrist: ['w0', 'w1'] }, 'h1, w1, h3 kept (best first), then the budget of 6 is full');
  assert.deepStrictEqual(pr.dropped.sort(), ['h2', 'w2']);
  const rules = { tags: { e1: { emb: true }, e2: { emb: true }, e3: { emb: true } }, embBonusIds: new Set(), maxEmb: 2 };
  const c = tg.combos({ pools: { a: ['x', 'e1'], b: ['y', 'e2'], c: ['z', 'e3'] }, equipped: { a: ['x'], b: ['y'], c: ['z'] } }, rules);
  assert.strictEqual(c.length, 6, '8 minus the base and the 3-embellishment combination');
});

// Real wago.tools rows (23 Oct 2026, build of Midnight S2), reduced to each item's path to its upgrade groups.
test('loot: season of an instance from its drops\' upgrade-track groups (bonus trees)', () => {
  const loot = L('loot');
  const xTree = 'ID,ItemBonusTreeID,ItemID\n311523,5953,239047\n319292,5725,249293\n321500,5960,250243\n326959,5996,268206\n327086,5933,268289';
  const H = 'ID,ItemContext,ChildItemBonusTreeID,ChildItemBonusListID,ChildItemLevelSelectorID,ChildItemBonusListGroupID,IblGroupPointsModSetID,MinMythicPlusLevel,MaxMythicPlusLevel,ItemCreationContextGroupID,Flags,ParentItemBonusTreeID';
  const treeNode = [H,
    '27083,0,4733,0,0,0,0,0,0,0,0,5725', '27082,0,5742,0,0,0,0,0,0,0,0,5725', '20315,165,0,11215,0,0,0,0,0,0,0,4733',
    '27221,4,0,0,0,609,4366,0,0,0,0,5742', '27222,3,0,0,0,610,4366,0,0,0,0,5742', '27223,5,0,0,0,611,4366,0,0,0,0,5742', '27224,6,0,0,0,612,4366,0,0,0,0,5742',
    '29556,0,6071,0,0,0,0,0,0,0,0,5933', '29552,6,0,13786,0,0,0,0,0,0,0,6071', '29554,3,0,13788,0,0,0,0,0,0,0,6071', '29555,4,0,13789,0,0,0,0,0,0,0,6071',
    '29194,0,5998,0,0,0,0,0,0,0,0,5996', '29205,4,0,0,0,615,4366,0,0,0,0,5998', '29206,3,0,0,0,616,4366,0,0,0,0,5998', '29207,5,0,0,0,617,4366,0,0,0,0,5998', '29208,6,0,0,0,618,4366,0,0,0,0,5998',
    '29070,0,3752,0,0,0,0,0,0,0,0,5953', '15885,57,4089,0,0,0,0,0,0,0,0,3752', '16395,0,0,0,0,310,2965,0,0,0,0,4089',
    '29097,0,5780,0,0,0,0,0,0,0,0,5960', '27633,0,5770,0,0,0,0,0,0,0,0,5780', '27632,0,5934,0,0,0,0,0,0,0,0,5780',
    '27445,102,0,0,0,609,2965,0,0,0,0,5770', '27444,35,0,0,0,612,4629,10,0,0,0,5770', '28907,2,0,0,0,608,2963,0,0,0,0,5934'].join('\n');
  const bonus = 'ID,Value_0,Value_1,Value_2,Value_3,ParentItemBonusListID,Type,OrderIndex\n31284,610,973,0,0,13788,34,1\n31289,609,972,0,0,13789,34,1\n2,7,15789,0,0,13786,2,0';
  const G = loot.trackGroups({ xTree, treeNode, bonus }, new Set(['239047', '249293', '250243', '268206', '268289']));
  assert.deepStrictEqual(G['249293'], [609, 610, 611, 612]);   // The Voidspire (S1 raid)
  assert.deepStrictEqual(G['268289'], [609, 610]);             // Sporefall (S1 raid): type-34 bonuses inside bonus lists
  assert.deepStrictEqual(G['268206'], [615, 616, 617, 618]);   // The Venomous Abyss (S2 raid)
  assert.deepStrictEqual(G['239047'], [310]);                  // Kings' Rest remade item (legacy M+ dungeon)
  assert.deepStrictEqual(G['250243'], [608, 609, 612]);        // Murder Row (S1 dungeon, back in S2 M+)
  const cur = new Set([616, 617, 618]), known = new Set([608, 609, 610, 611, 612, 614, 615, 616, 617, 618]);
  assert.strictEqual(loot.seasonOf(G['249293'], cur, known), 'old');
  assert.strictEqual(loot.seasonOf(G['268289'], cur, known), 'old');
  assert.strictEqual(loot.seasonOf(G['268206'], cur, known), 'cur');
  assert.strictEqual(loot.seasonOf(G['239047'], cur, known), null);
  assert.strictEqual(loot.seasonOf(undefined, cur, known), null);
});

test('specs: armor type from the class line of the export', () => {
  const s = L('specs');
  assert.strictEqual(s.armorOf('warlock="Lofo"\nspec=demonology'), 'cloth');
  assert.strictEqual(s.armorOf('evoker="x"'), 'mail');
  assert.strictEqual(s.armorOf('demonhunter="x"'), 'leather');
  assert.strictEqual(s.armorOf('head=,id=1'), null);
});
