const test = require('node:test'), assert = require('node:assert'), path = require('path');
const L = require('../lib/lust'), B = require('../lib/boss'), F = require('../lib/fight');
const fights = () => B.list([path.join(__dirname, 'fixtures', 'data', 'fights')]);

test('lust: first lust from Sated-type debuffs / lust buffs, one lust = one burst of applications', () => {
  const ev = [{ t: 0.5, type: 'applybuff', abilityGameID: 1126 }, { t: 82.1, type: 'applydebuff', abilityGameID: 57724 }, { t: 82.3, type: 'applydebuff', abilityGameID: 57724 },
    { t: 82.2, type: 'applybuff', abilityGameID: 2825 }, { t: 300, type: 'applydebuff', abilityGameID: 390435 }];
  assert.deepStrictEqual(L.lustTimes(ev), [82.1, 300]);
  assert.deepStrictEqual(L.lustTimes([{ t: 3, type: 'removedebuff', abilityGameID: 57724 }]), []);
});

test('lust: kills classified as "after stage start" or "share of the kill"', () => {
  const def = { stages: [{ id: 1, at: 0 }, { id: 2, atPct: 75 }], difficulties: {} };
  const staged = [0, 1, 2, 3, 4, 5].map(i => ({ lust: 200 + i + 2, count: 1, duration: 300 + i * 10, phases: [{ id: 2, t: 200 + i }] }));
  const e = L.classify(staged, def);
  assert.deepStrictEqual([e.stage, e.after, e.from], [2, 2, 'logs']); assert.match(e.checked, /6 of the fastest/);
  // no common stage: median share of the kill
  const loose = [10, 40, 90, 150, 60, 120].map((t, i) => ({ lust: t, count: i === 0 ? 2 : 1, duration: 300, phases: [] }));
  const p = L.classify(loose, def);
  assert.ok(p.pct >= 20 && p.pct <= 30 && p.stage == null, JSON.stringify(p)); assert.match(p.checked, /1 with a second lust/);
  // pull lust = stage 1, a few seconds in
  assert.deepStrictEqual(L.classify([1, 2, 1, 3, 2].map(t => ({ lust: t, duration: 300, phases: [] })), def).stage, 1);
  // a stage our fight file does not know: falls back to the share of the kill
  assert.strictEqual(L.classify(staged.map(k => ({ ...k, phases: [{ id: 7, t: 200 }] })), def).stage, undefined);
  assert.strictEqual(L.classify(staged.slice(0, 3), def), null);   // too few kills
});

test('lust: seconds in a given fight length, simc options, only when lust is on', () => {
  const bounds = [{ id: 1, start: 0, end: 225 }, { id: 2, start: 225, end: 300 }];
  assert.strictEqual(L.seconds({ stage: 2, after: 3 }, bounds, 300), 228);
  assert.strictEqual(L.seconds({ pct: 40 }, bounds, 350), 140);
  assert.strictEqual(L.seconds({ stage: 5, after: 3 }, bounds, 300), null);
  assert.deepStrictEqual(L.args({ mode: 'auto', auto: 228 }), ['bloodlust_time=228']);
  assert.deepStrictEqual(L.args({ mode: 'auto', auto: null }), []);
  assert.deepStrictEqual(L.args({ mode: 'pull', auto: 228 }), []);
  assert.deepStrictEqual(L.args({ mode: 'time', value: 95 }), ['bloodlust_time=95']);
  assert.deepStrictEqual(L.args({ mode: 'pct', value: 30 }), ['bloodlust_percent=30', 'bloodlust_time=9999']);
  const a = ['bloodlust_time=228'];
  assert.ok(F.fightArgs({ raid: 'full', lustArgs: a }).includes('bloodlust_time=228'));
  assert.ok(!F.fightArgs({ raid: 'none', lustArgs: a }).includes('bloodlust_time=228'));
  assert.ok(!F.fightArgs({ raid: 'custom', raidOn: ['arcane_intellect'], lustArgs: a }).includes('bloodlust_time=228'));
  assert.ok(F.fightArgs({ raid: 'custom', raidOn: ['bloodlust'], lustArgs: a }).includes('bloodlust_time=228'));
  assert.ok(!F.fightArgs({ raid: 'full', lustArgs: ['bloodlust_time=1;html=x'] }).some(x => /html/.test(x)));
});

test('lust: boss build places the measured lust in the chosen fight length', () => {
  const def = JSON.parse(JSON.stringify(fights().find(d => d.id === 'kithix')));
  def.difficulties.mythic.bloodlust = { stage: 2, after: 4, from: 'logs' };
  assert.strictEqual(B.build(def, { difficulty: 'mythic', duration: 400 }).lust.at, 304);   // stage 2 at 75 % of 400 s + 4
  assert.strictEqual(B.build(def, { difficulty: 'heroic', duration: 400 }).lust.at, null);  // no data: pull
});

test('lust: buff on a non-lust class is the raid lust; a caster\'s extra self lust is not counted', () => {
  const ev = [
    { t: 1, type: 'applybuff', abilityGameID: 2825, targetClass: 'Warrior' }, { t: 1, type: 'applybuff', abilityGameID: 2825, targetClass: 'Shaman' },
    { t: 1, type: 'applydebuff', abilityGameID: 57724, targetClass: 'Warrior' },
    { t: 95, type: 'applybuff', abilityGameID: 80353, targetClass: 'Mage' }, { t: 95, type: 'applydebuff', abilityGameID: 80354, targetClass: 'Mage' }];
  assert.deepStrictEqual(L.detect(ev), { times: [1], how: 'lust buff on a non-lust class' });
  // drums / unknown buff id: Sated on a non-lust class
  assert.deepStrictEqual(L.detect([{ t: 4, type: 'applydebuff', abilityGameID: 57723, targetClass: 'Rogue' }, { t: 90, type: 'applydebuff', abilityGameID: 57723, targetClass: 'Evoker' }]).times, [4]);
});

test('lust: two strategies (pull / later) -> the larger group, not their median', () => {
  const def = { difficulties: {} }, k = (lust, d = 580) => ({ lust, count: 1, duration: d, phases: [] });
  const later = L.classify([k(1), k(2), k(150), k(160), k(155), k(158), k(1)], def);    // 3 pull, 4 later
  assert.ok(later.pct >= 26 && later.pct <= 28, JSON.stringify(later)); assert.match(later.checked, /3 lust at the pull, 4 later: later group used/);
  const pullWins = L.classify([k(1), k(2), k(1), k(150), k(160), k(3)], def);          // 4 pull, 2 later
  assert.deepStrictEqual([pullWins.stage, pullWins.after], [1, 2]);   // median of 1, 2, 1, 3 s assert.match(pullWins.checked, /pull group used/);
});
