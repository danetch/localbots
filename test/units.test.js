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
  const U = require('../lib/upgrade'), tg = require('../lib/topgear'), db = require('../data/enhance.json'), P = { ...require('../data/progression.json'), upgradeTracks: require('../data/season.json').season.upgradeTracks };
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

test('boss: council fights add cleaved bosses (desired targets), absent stages and shared submerges become invulnerable windows', () => {
  const b = L('boss'), defs = b.list([require('path').join(__dirname, '..', 'data', 'fights')]), get = id => defs.find(d => d.id === id);
  const tf = b.build(get('twinfangs'), { difficulty: 'mythic', duration: 300 });
  assert.strictEqual(tf.targets, 2); assert.deepStrictEqual(tf.extraArgs, ['ignore_invulnerable_targets=1']);
  assert.ok(tf.events.includes('raid_events+=/invulnerable,name=ithraz_away_1,target=Dummy_Enemy_1,timestamps=136,duration=28'));
  const ca = b.build(get('coiledaltar'), { difficulty: 'mythic', duration: 300 });   // Mythic phase 3 at 68 % (real logs) = 204 s
  assert.ok(ca.events.includes('raid_events+=/invulnerable,name=malacrass_away,target=Dummy_Enemy_1,timestamps=0,duration=204'));
  // per-difficulty stages and kill length (Lorrgs medians): Twin Fangs submerges every 155 s on Mythic, 169 s on Heroic
  assert.deepStrictEqual(b.build(get('twinfangs'), { difficulty: 'mythic' }).summary.find(s => s.type === 'invulnerable').times, [136, 291]);
  assert.strictEqual(b.build(get('twinfangs'), { difficulty: 'heroic' }).length, 366);   // median guild kill (Warcraft Logs)
  assert.deepStrictEqual(b.build(get('nymrissa'), { difficulty: 'mythic' }).summary[0].times, [23, 133, 243, 353]);
  const se = b.build(get('sentinels'), { difficulty: 'all', duration: 300 });         // split raid: single target
  assert.strictEqual(se.targets, 1); assert.deepStrictEqual(se.extraArgs, []);
  const ny = b.build(get('nymrissa'), { difficulty: 'mythic', duration: 300 });
  assert.strictEqual(ny.targets, 1); assert.ok(ny.events.some(e => /^raid_events\+=\/adds,name=frostscale,timestamps=23:133:243/.test(e)));
  const fa = L('fight').fightArgs({ targets: 2, raidEvents: tf.events, bossArgs: [...tf.extraArgs, 'html=x'] });
  assert.ok(fa.includes('desired_targets=2') && fa.includes('ignore_invulnerable_targets=1') && !fa.includes('html=x'));
});

test('boss: kill length from Warcraft Logs median kills at the export item level', () => {
  const b = L('boss'), defs = b.list([require('path').join(__dirname, '..', 'data', 'fights')]), get = id => defs.find(d => d.id === id);
  const items = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2'];
  const exp = n => items.map(s => `# Item (${n})\n${s}=,id=1`).join('\n') + `\n# Staff (${n})\nmain_hand=,id=2`;   // two-hander counts twice
  assert.strictEqual(b.equippedIlvl(exp(328)), 328);
  assert.strictEqual(b.equippedIlvl('head=,id=1,ilevel=300\nneck=,id=2'), null);   // not a full export
  const tf = get('twinfangs');
  assert.deepStrictEqual(b.killLength(tf, 'heroic', null), { length: 366, from: 'median', kills: 34443 });
  assert.strictEqual(b.killLength(tf, 'heroic', 327).length, 340);                 // bracket 326-328
  assert.ok(b.killLength(tf, 'heroic', 316).length >= b.killLength(tf, 'heroic', 321).length);   // monotonic
  assert.ok(b.killLength(tf, 'heroic', 345).length < 275);                          // extended past the last bracket
  assert.strictEqual(b.build(get('nymrissa'), { difficulty: 'heroic' }).length, 282);   // default = median guild kill
});

test('journal: draft fight from Adventure Guide rows (stages, council, adds, spell references, types)', () => {
  const J = L('journal'), { readTable } = L('loot');
  const t = {
    encounter: 'Name_lang,Description_lang,Map_0,Map_1,ID,JournalInstanceID,DungeonEncounterID,OrderIndex,FirstSectionID\nThe Twins,,0,0,9,1,0,0,10',
    creature: 'Name_lang,Description_lang,ID,JournalEncounterID\nAlpha,,1,9\nBeta,,2,9\nWhelp,,3,9',
    section: 'ID,Title_lang,BodyText_lang,JournalEncounterID,OrderIndex,ParentSectionID,FirstChildSectionID,NextSiblingSectionID,Type,IconCreatureDisplayInfoID,UiModelSceneID,SpellID,IconFlags,IconFlags2,DifficultyMask\n' + [
      '10,Overview,,9,0,0,0,11,3,0,0,0,0,0,-1', '11,Alpha,,9,1,0,13,12,1,0,0,0,0,0,-1', '12,Beta,,9,2,0,16,0,1,0,0,0,0,0,-1',
      '13,Section 1,,9,0,11,14,15,2,0,0,501,0,0,-1', '14,Whelp,,9,0,13,17,0,1,0,0,0,2,0,-1', '17,Section 2,,9,0,14,0,0,2,0,0,505,1,0,-1',
      '15,Section 3,,9,1,11,0,0,2,0,0,502,1,0,-1', '16,Section 4,,9,0,12,0,18,2,0,0,503,4096,0,-1', '18,Section 5,,9,1,12,0,0,2,0,0,504,0,0,-1'].join('\n'),
    spellName: 'ID,Name_lang\n501,Call Whelps\n502,Bite\n503,Harden\n504,Gore Rain\n505,Whelp Nip\n506,Puddle',
    spell: 'ID,NameSubtext_lang,Description_lang,AuraDescription_lang\n501,,"Alpha calls her progeny from the deep.",\n502,,"Bites the tank.",\n503,,"Beta hardens, reducing her damage taken by $s1% for $d.",\n504,,"$@spelldesc506",\n505,,"Nips.",\n506,,"Leaves a |cFFFFFFFF|Hspell:506|h[Puddle]|h|r on the ground. Avoid it.",',
  };
  const [d] = J.draft(t, readTable, ['9'], { ptr: true });
  assert.strictEqual(d.id, 'the_twins'); assert.ok(d.ptr && d.draft);
  assert.strictEqual(d.mainBoss, 'Alpha'); assert.deepStrictEqual(d.bosses, [{ name: 'Beta' }]);   // Whelp is under an ability: an add
  const m = d.mechanics;
  assert.strictEqual(m.call_whelps.type, 'adds'); assert.strictEqual(m.whelp.type, 'adds');
  assert.strictEqual(m.bite.type, 'skip');                                   // tank ability
  assert.strictEqual(m.harden.type, 'vulnerable'); assert.ok(m.harden.multiplier < 1); assert.strictEqual(m.harden.difficulty, 'mythic');
  assert.strictEqual(m.gore_rain.type, 'movement');                         // description followed through $@spelldesc506
  assert.ok(!m.whelp_nip);                                                   // an add's own ability is left out
  assert.ok(Object.values(m).every(x => x.timesFrom === 'none'));
});

test('bigwigs: rounded-duration ladders -> first casts per stage and difficulty, matched by spell id or name; logs are never overwritten', () => {
  const B = L('bigwigs');
  const lua = [
    'function mod:GetOptions()', '\treturn {', '\t\t1001, -- Big Wave', '\t\t1002, -- Spawn Eggs', '\t}', 'end',
    'function mod:ENCOUNTER_TIMELINE_EVENT_ADDED(_, eventInfo)', '\tlocal rounded = self:RoundNumber(eventInfo.duration, 0)',
    '\tif rounded == 12 or rounded == 40 then', '\t\tbarInfo = self:BigWave(eventInfo)',
    '\telseif durationRounded == 25 then', '\t\tif self:Mythic() then', '\t\t\tbarInfo = self:Frenzy(eventInfo)', '\t\telse', '\t\t\tbarInfo = self:SpawnEggs(eventInfo)', '\t\tend',
    '\tend', '\tif stage == 2 then', '\t\tif rounded == 7 then', '\t\t\tbarInfo = self:BigWave(eventInfo)', '\t\tend', '\tend', 'end',
    'function mod:BigWave()', '\treturn { msg = "x", key = 1001 }', 'end', 'function mod:SpawnEggs()', '\treturn { msg = "y", key = 1002 }', 'end',
  ].join('\n');
  const bw = B.parse(lua);
  assert.deepStrictEqual(bw.mechanics.BigWave.stages, { 1: [12, 40], 2: [7] }); assert.strictEqual(bw.mechanics.BigWave.key, 1001);
  assert.strictEqual(bw.mechanics.Frenzy.mythic, true); assert.strictEqual(bw.mechanics.SpawnEggs.mythic, false);
  const def = { mechanics: { wave: { label: 'Big Wave', spell: 1001, timesFrom: 'none' }, eggs: { label: 'Spawn Eggs', timesFrom: 'none' }, frenzy: { label: 'Frenzy', timesFrom: 'logs' } },
    difficulties: { heroic: { times: {} }, mythic: { times: {} } } };
  const ch = B.plan(def, bw);
  assert.deepStrictEqual(ch.filter(c => c.key === 'wave').map(c => c.difficulty), ['heroic', 'mythic']);
  assert.deepStrictEqual(ch.find(c => c.key === 'wave').to, { 1: [12, 40], 2: [7] });
  assert.ok(ch.find(c => c.key === 'wave').check);                                // 12 or 40 in one condition
  assert.deepStrictEqual(ch.filter(c => c.key === 'eggs').map(c => c.difficulty), ['heroic']);   // not Mythic (else branch)
  assert.ok(!ch.some(c => c.key === 'frenzy'));                                    // timings from logs stay
  B.apply(def, ch); assert.strictEqual(def.mechanics.wave.timesFrom, 'bigwigs'); assert.deepStrictEqual(def.difficulties.heroic.times.eggs, [25]);
});

test('wcl: client credentials, paginated enemy casts, aggregation like Lorrgs, cycle detection', async () => {
  const W = L('wcl'), calls = [];
  const fakeFetch = async (url, o) => {
    calls.push(url);
    if (url.endsWith('/oauth/token')) { assert.match(o.headers.Authorization, /^Basic /); return { ok: true, json: async () => ({ access_token: 'T' }) }; }
    assert.strictEqual(o.headers.Authorization, 'Bearer T');
    const { query, variables } = JSON.parse(o.body);
    if (/fights\(fightIDs/.test(query)) return { ok: true, json: async () => ({ data: { reportData: { report: { fights: [{ id: 3, startTime: 1000, endTime: 301000, kill: true, difficulty: 5, phaseTransitions: [{ id: 2, startTime: 151000 }] }], masterData: { abilities: [{ gameID: 77, name: 'Bubble' }] } } } } }) };
    if (/events\(/.test(query)) {
      const first = variables.s === 1000;
      return { ok: true, json: async () => ({ data: { reportData: { report: { events: first
        ? { data: [{ type: 'cast', timestamp: 24000, abilityGameID: 77 }, { type: 'cast', timestamp: 25000, abilityGameID: 77 }, { type: 'begincast', timestamp: 26000, abilityGameID: 77 }], nextPageTimestamp: 100000 }
        : { data: [{ type: 'cast', timestamp: 134000, abilityGameID: 77 }], nextPageTimestamp: null } } } } }) };
    }
    throw new Error('unexpected query');
  };
  const c = W.client({ id: 'a', secret: 'b', fetch: fakeFetch });
  const f = await c.fight('ABC', 3);
  assert.strictEqual(f.duration, 300); assert.deepStrictEqual(f.phases, [{ id: 2, t: 150 }]);
  assert.deepStrictEqual(f.casts.map(x => x.t), [23, 24, 133]);                    // begincast ignored, 2 event pages
  assert.strictEqual(calls.filter(u => u.endsWith('/oauth/token')).length, 1);     // token reused
  const A = W.aggregate([f, { ...f, casts: f.casts.map(x => ({ ...x, t: x.t + 2 })) }]);
  assert.deepStrictEqual(A.abilities[77].casts, [[25, 2], [135, 2]]);              // 23/24 merged (gap < 4 s), medians of 2 fights
  assert.deepStrictEqual(W.cycle([38, 82, 148, 192, 258, 302, 368]), { times: [38, 82], repeat: 110 });   // Nymrissa Chilling Frost
  assert.deepStrictEqual(W.cycle([9, 70, 164, 225, 319, 380]), { times: [9, 70], repeat: 155 });         // Twin Fangs deluge
  assert.deepStrictEqual(W.cycle([5, 114, 223]), { times: [5], repeat: 109 });
});

test('boss: kill length prior for a boss without logs (same part of a raid, this season)', () => {
  const b = L('boss'), defs = [280, 300, 260, 400, 560].map((m, i) => ({ difficulties: { heroic: { kills: { median: m } }, mythic: { kills: { median: m + 100 } } } }));
  assert.deepStrictEqual(b.priorLength(defs, false), { heroic: 280, mythic: 380 });   // without the two longest
  assert.deepStrictEqual(b.priorLength(defs, true), { heroic: 480, mythic: 580 });   // mean of the two longest
});

test('foods: effect from the two probes, duplicates merged, weaker foods of the same kind dropped', () => {
  const F = L('foods');
  const s = o => ({ strength: 0, agility: 0, intellect: 664, crit: 168, haste: 0, mastery: 0, vers: 0, ...o });
  const b1 = s({}), b2 = s({ mastery: 2040 });
  assert.deepStrictEqual(F.effectOf(s({ intellect: 715 }), s({ intellect: 715, mastery: 2040 }), b1, b2), { kind: 'primary', amount: 51 });
  assert.deepStrictEqual(F.effectOf(s({ crit: 241 }), s({ mastery: 2112 }), b1, b2), { kind: 'best', amount: 73 }, 'feast follows the highest secondary');
  assert.deepStrictEqual(F.effectOf(s({ mastery: 59 }), s({ mastery: 2099 }), b1, b2), { kind: 'fixed', stats: { mastery: 59 } }, 'fixed mastery stays mastery');
  assert.deepStrictEqual(F.effectOf(s({ crit: 191, vers: 22 }), s({ crit: 191, vers: 22, mastery: 2040 }), b1, b2), { kind: 'fixed', stats: { crit: 23, vers: 22 } });
  assert.strictEqual(F.effectOf(s({}), s({ mastery: 2040 }), b1, b2), null, 'no damage stat');
  const f = (label, effect) => ({ value: label.toLowerCase().replace(/\W+/g, '_'), label, effect });
  const r = F.reduce([f('Royal Roast', { kind: 'primary', amount: 51 }), f('Silvermoon Parade', { kind: 'primary', amount: 51 }), f('Spellfire Filet', { kind: 'primary', amount: 36 }),
    f('Amani Cornucopia', { kind: 'best', amount: 73 }), f('Blooming Feast', { kind: 'best', amount: 67 }),
    f('Braised Blood Hunter', { kind: 'fixed', stats: { vers: 59 } }), f('Felberry Figs', { kind: 'fixed', stats: { vers: 46 } }),
    f('Wise Tails', { kind: 'fixed', stats: { crit: 22, vers: 22 } }), f('Spiced Biscuits', { kind: 'fixed', stats: { crit: 16, vers: 16 } }),
    f('Farstrider Rations', { kind: 'fixed', stats: { haste: 16, mastery: 16 } }), f('Tea', null)]);
  assert.deepStrictEqual(r.map(x => x.value), ['royal_roast', 'amani_cornucopia', 'braised_blood_hunter', 'wise_tails', 'farstrider_rations']);
  assert.strictEqual(r[0].label, 'Royal Roast — +51 primary stat'); assert.deepStrictEqual(r[0].also, ['Silvermoon Parade']);
  assert.strictEqual(r[1].label, 'Amani Cornucopia — +73 highest secondary stat');
  assert.strictEqual(r[3].label, 'Wise Tails — +22 Crit +22 Vers');
  assert.deepStrictEqual(F.preFilter([{ label: 'Hearty Royal Roast' }, { label: 'Royal Roast' }]), [{ label: 'Royal Roast' }]);
});

test('foods: classify drives simc probes (fake runner), unloadable foods dropped', async () => {
  const F = L('foods');
  const json = o => ({ sim: { players: [{ collected_data: { buffed_stats: { attribute: { strength: 0, agility: 0, intellect: o.int || 600 }, stats: { crit_rating: o.crit || 100, haste_rating: 0, mastery_rating: o.mast || 0, versatility_rating: 0 } } } }] } });
  const run = async txt => { const food = /food=(\w+)/.exec(txt)[1], extra = /gear_mastery_rating/.test(txt) ? 2000 : 0;
    if (food === 'hearty_x') return null;
    return json({ int: food === 'roast' ? 650 : 600, crit: food === 'feast' && !extra ? 170 : 100, mast: extra + (food === 'feast' && extra ? 70 : 0) + (food === 'skewers' ? 59 : 0) }); };
  const r = await F.classify([{ value: 'roast', label: 'Roast' }, { value: 'feast', label: 'Feast' }, { value: 'skewers', label: 'Skewers' }, { value: 'hearty_x', label: 'Hearty X' }, { value: 'tea', label: 'Tea' }], run);
  assert.deepStrictEqual(r.list.map(x => x.label), ['Roast — +50 primary stat', 'Feast — +70 highest secondary stat', 'Skewers — +59 Mastery']);
  assert.deepStrictEqual(r.dropped.sort(), ['Hearty X', 'Tea']);
});

test('crafted: stat pairs only on placeholder items, plain crafts per slot group (trinkets), CraftingData ids', () => {
  const C = L('crafted'), INV = { 9: ['wrist'], 12: ['trinket1', 'trinket2'], 8: ['feet'] };
  const crafted = [{ id: 1, name: 'Fixed Bracers', cls: 4, sub: 2, inv: 9 }, { id: 2, name: 'Deck', cls: 4, sub: 0, inv: 12 }, { id: 3, name: 'Choice Boots', cls: 4, sub: 2, inv: 8 }];
  const o = { rules: { ilvl: 331, embellishments: { a: { slots: ['wrist', 'feet'] } } }, emb: ['a'], pairs: ['32/36', '36/49'], cls: 4, crafted, hasPairs: id => id === 3 };
  const v = C.variants({ ...o, plainSlots: ['trinket'] }, INV);
  assert.deepStrictEqual(v.filter(x => x.slot === 'wrist').map(x => x.item), [',id=1,ilevel=331,embellishment=a'], 'fixed stats: one variant, no crafted_stats');
  assert.deepStrictEqual(v.filter(x => x.slot === 'feet').map(x => x.item), [',id=3,ilevel=331,crafted_stats=32/36,embellishment=a', ',id=3,ilevel=331,crafted_stats=36/49,embellishment=a']);
  assert.deepStrictEqual(v.filter(x => /^trinket/.test(x.slot)).map(x => x.slot + x.item), ['trinket1,id=2,ilevel=331', 'trinket2,id=2,ilevel=331']);
  assert.strictEqual(v.find(x => x.slot === 'trinket1').label, 'Crafted Deck (331)');
  assert.ok(!C.variants({ ...o, emb: [], plainSlots: [] }, INV).length, 'nothing ticked');
  assert.strictEqual(C.variants({ ...o, emb: [], plain: true }, INV).length, 5, 'older settings: plain = every slot');
  assert.strictEqual(C.groupOf('finger2'), 'finger'); assert.strictEqual(C.groupOf('wrists'), 'wrist');
  const loot = L('loot');
  const csv = rows => rows.map(r => r.join(',')).join('\n') + '\n';
  const ids = C.craftingDataIds((t, w, f) => { const [h, ...rs] = t.trim().split('\n').map(l => l.split(',')); const out = []; for (const r of rs) { const o = {}; for (const [k, n] of Object.entries(w)) o[k] = r[h.indexOf(n[0])]; if (!f || f(o)) out.push(o); } return out; },
    { cdata: csv([['ID', 'Type', 'CraftedItemID'], [1, 0, 245829], [2, 0, 0]]), cdq: csv([['ID', 'ItemID', 'CraftingDataID'], [5, 239660, 1]]) });
  assert.deepStrictEqual([...ids].sort(), ['239660', '245829']);
  assert.ok(loot.build);
});

test('items: crafted-stat placeholders read from simc item data (bundled copy)', () => {
  const I = L('items'), m = I.make(require('../data/items.json'));
  assert.strictEqual(m.craftStats(244463), true, 'Murder Row Fleet Feet: stats to choose');
  assert.strictEqual(m.craftStats(239660), false, 'Arcanoweave Bracers: fixed Haste/Vers');
  assert.strictEqual(m.craftStats(245829), false, 'Darkmoon Deck: Hunt: no secondary stats');
  assert.strictEqual(m.craftStats(501), null, 'unknown id');
});

test('loot: food list not capped to 150 items, Hearty foods left out', () => {
  const c = L('loot'), it = (id, sub) => ({ id: String(id), cls: '0', sub: String(sub) }), sp = (id, name) => ({ id: String(id), name, exp: '11' });
  const items = [], sparse = [];
  for (let i = 0; i < 200; i++) { items.push(it(1000 + i, 5)); sparse.push(sp(1000 + i, `Food ${i}`)); }
  items.push(it(5000, 5)); sparse.push(sp(5000, 'Hearty Food 1'));
  const b = c.buildConsumables(items, sparse);
  assert.strictEqual(b.food.length, 200); assert.ok(b.food.some(o => o.label === 'Food 0'));
});

test('watch: changes between two states, failed checks never count as new', () => {
  const W = require('../tools/watch');
  const old = { ptrBuild: { live: '12.1.5.1', ptr: '12.1.7.1', beta: null }, ptrRaids: { build: '12.1.7.1', extra: { 900: 'Delve X' } },
    bigwigs: ['MidnightLairs', 'TheVenomousAbyss'], simc: { branch: 'midnight', live: '12.1.5.1', ptr: '12.1.7.1', profiles: ['MID1', 'MID2'] }, wcl: [{ id: 53, name: 'Abyss' }] };
  assert.deepStrictEqual(W.changes(old, old), []);
  const now = { ptrBuild: { live: '12.1.5.1', ptr: '12.2.0.5', beta: null }, ptrRaids: { build: '12.2.0.5', extra: { 900: 'Delve X', 1310: 'The Next Raid' } },
    bigwigs: ['MidnightLairs', 'TheNextRaid', 'TheVenomousAbyss'], simc: { branch: 'midnight', live: '12.1.5.1', ptr: '12.2.0.5', profiles: ['MID1', 'MID2', 'MID3'] }, wcl: [{ id: 53, name: 'Abyss' }, { id: 58, name: 'Raid Testing' }] };
  const ch = W.changes(old, now);
  assert.deepStrictEqual(ch.map(c => c.key), ['ptrBuild', 'ptrRaids', 'bigwigs', 'simcPtr', 'simcProfiles', 'wcl']);
  assert.deepStrictEqual(ch.find(c => c.key === 'ptrRaids').newInstances, ['1310']);
  const { wcl, simc, ...partial } = now;   // checks that failed this run are absent: no change reported for them
  assert.deepStrictEqual(W.changes(old, partial).map(c => c.key), ['ptrBuild', 'ptrRaids', 'bigwigs']);
  assert.deepStrictEqual(W.csvIds('ID,Name_lang\n1301,"The Venomous Abyss"\n'), { 1301: 'The Venomous Abyss' });
});

test('watch: collect reads every source (mocked network)', async () => {
  const W = require('../tools/watch');
  const res = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body, text: async () => body });
  const f = async u => /builds\/latest/.test(u) ? res({ wow: { version: '12.1.5.1' }, wowt: { version: '12.2.0.5' } })
    : /JournalInstance\/csv\?build/.test(u) ? res('ID,Name_lang\n1,A\n2,B\n') : /JournalInstance/.test(u) ? res('ID,Name_lang\n1,A\n')
    : /client_data_version_ptr/.test(u) ? res('// Client data versioning information for 12.2.0.5') : /client_data_version/.test(u) ? res('// Client data versioning information for 12.1.5.1') : res('', false);
  const gh = async p => p === '/repos/simulationcraft/simc' ? { default_branch: 'midnight' } : /profiles/.test(p) ? [{ type: 'dir', name: 'MID2' }, { type: 'file', name: 'x' }]
    : [{ type: 'dir', name: 'Core' }, { type: 'dir', name: 'TheVenomousAbyss' }, { type: 'file', name: 'README.md' }];
  const r = await W.collect({ f, gh, env: {} });
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.values, { ptrBuild: { live: '12.1.5.1', ptr: '12.2.0.5', beta: null }, ptrRaids: { build: '12.2.0.5', extra: { 2: 'B' } },
    bigwigs: ['TheVenomousAbyss'], simc: { branch: 'midnight', live: '12.1.5.1', ptr: '12.2.0.5', profiles: ['MID2'] } });
});
