// End-to-end: loads main.js with a stubbed `electron`, a fake simc (test/fakesimc.js).
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-')), H = {}, logs = [];
process.env.FAKESIMC_LOG = path.join(ud, 'inputs.log');   // own fake-simc log: test files run in parallel
const electron = { app: { getPath: () => ud, getVersion: () => '0.2.0', isPackaged: false, whenReady: () => ({ then: f => f() }), on() {}, quit() {} },
  BrowserWindow: function () { this.webContents = { send: (ch, l) => { if (ch === 'sim:log') logs.push(l); }, setWindowOpenHandler() {}, on() {} }; this.setTitle = this.setMenuBarVisibility = this.loadFile = () => {}; },
  ipcMain: { handle: (n, f) => (H[n] = f) }, dialog: {}, shell: {} };
const orig = Module._load; Module._load = function (r, ...a) { return r === 'electron' ? electron : orig.call(this, r, ...a); };
fs.writeFileSync(ud + '/settings.json', JSON.stringify({ simcPath: path.join(__dirname, 'fakesimc.js') }));
fs.chmodSync(path.join(__dirname, 'fakesimc.js'), 0o755);
require('../main.js');
Module._load = orig;

test('top gear runs end to end with the fake simc', async () => {
  const text = 'warrior="Bob"\nspec=fury\nlevel=90\nhead=,id=10\nfinger1=,id=12\nfinger2=,id=13\n# Helm B (300)\n# head=,id=20\n';
  const r = await H['sim:topgear']({}, { text, threads: 1, topN: 5, fight: { fightStyle: 'Patchwerk' }, precision: 'fast' });
  assert.ok(r.total >= 1); assert.ok(r.rows.length >= 1);
  assert.ok(r.report && fs.readFileSync(r.report, 'utf8').includes('fake report'), 'simc html report kept');
  assert.ok(r.rows[0].items[0].wh.startsWith('item='), 'wowhead params');
  const off = await H['sim:topgear']({}, { text, threads: 1, topN: 5, fight: { fightStyle: 'Patchwerk' }, precision: 'fast', report: false });
  assert.strictEqual(off.report, null);
});

test('best in slot: enchants and gems join at round 2, sockets added, DR table', async () => {
  const text = 'rogue="Ann"\nspec=outlaw\nlevel=90\nhead=,id=10\nneck=,id=11,gem_id=240910\nfinger1=,id=12,enchant_id=7965\nfinger2=,id=13\nchest=,id=14\nmain_hand=,id=15\n# Helm B (300)\n# head=,id=20\n';
  logs.length = 0;
  const r = await H['sim:bis']({}, { text, threads: 1, fight: { fightStyle: 'Patchwerk' }, precision: 'fast', report: false, maxRounds: 4, consFrom: 2,
    consumables: {}, enhance: { ench: true, gems: true, add: ['head'] } });
  const f1 = r.set.find(s => s.slot === 'finger1'), head = r.set.find(s => s.slot === 'head');
  assert.ok(/Zul'jin's Mastery/.test(f1.enh), 'best ring enchant chosen: ' + f1.enh);
  assert.ok(/Flawless Deadly Garnet/.test(head.enh), 'jewelbinder socket on head filled: ' + head.enh);
  assert.ok(r.set.every(s => !/^ench:|^gems$/.test(s.slot)), 'pseudo-slots hidden from the set table');
  assert.strictEqual(r.dr.length, 4); assert.ok(r.dr.find(d => d.stat === 'crit').rating > 1300);
  assert.ok(r.rounds.length >= 1 && r.rounds.every(x => x.round > 1 || x.changes.every(c => !/^ench:|^gems$/.test(c.slot))), 'round 1 is gear only');
  const inputs = fs.readFileSync(process.env.FAKESIMC_LOG, 'utf8');
  assert.ok(/profileset_output_data=stats/.test(inputs));
  assert.ok(!/gem_id=240983\/|240983.*240983/.test(inputs.split('=====').pop()), 'diamond used once');
});

test('best in slot: stronger non-tier head over a set piece - Catalyst twin, capped Catalyst, no Catalyst', async () => {
  fs.writeFileSync(ud + '/loot.json', JSON.stringify({ builtAt: new Date().toISOString(), instances: {}, items: {}, consVer: 2,
    tierSets: [{ set: '1', name: 'Test set', tier: 'MID2', cls: 4, ids: ['900', '901', '902', '903', '904'], slots: { head: '900', shoulder: '901', chest: '902', hands: '903', legs: '904' } }] }));
  const text = 'rogue="Ann"\nspec=outlaw\nlevel=90\nhead=,id=900,ilevel=330\nshoulder=,id=901,ilevel=330\nchest=,id=902,ilevel=330\nhands=,id=903,ilevel=330\nlegs=,id=50,ilevel=330\n# Ula\'tek Helm (344)\n# head=,id=777,ilevel=344\n';
  const go = (catalyst, t = text) => H['sim:bis']({}, { text: t, threads: 1, fight: { fightStyle: 'Patchwerk' }, precision: 'fast', report: false, maxRounds: 3, consumables: {}, catalyst });
  const headOf = r => r.set.find(s => s.slot === 'head').label;
  // 1. Catalyst, no charge limit: the twin "Ula'tek Helm -> tier" wins on its own (tier pairs not needed)
  assert.ok(/Ula'tek Helm.*→ tier/.test(headOf(await go({ on: true, max: null }))));
  // 2. Catalyst limited to 1 charge: the head twin is still possible; with 0 charges only a real tier piece elsewhere keeps the 4-piece
  logs.length = 0;
  const bagLegs = text + '# Tier Legs (330)\n# legs=,id=904,ilevel=330\n';
  const r0 = await go({ on: true, max: 0 }, bagLegs);
  assert.ok(/^Ula'tek Helm \(344\)$/.test(headOf(r0)) && /Tier Legs/.test(r0.set.find(s => s.slot === 'legs').label), 'pair head + bag tier legs');
  assert.ok(logs.some(l => /tier piece elsewhere pairs/.test(l)));
  // 3. Catalyst off: same pair
  assert.ok(/^Ula'tek Helm \(344\)$/.test(headOf(await go({ on: false }, bagLegs))));
  fs.rmSync(ud + '/loot.json');
});

test('every run writes a full log file with the export and the per-round trace', () => {
  const d = path.join(ud, 'logs'), f = fs.readdirSync(d).filter(x => /^run-.*\.log$/.test(x)).sort().pop();
  const t = fs.readFileSync(path.join(d, f), 'utf8');
  assert.ok(/--- export ---/.test(t) && /-- Round 1: all options/.test(t) && /validated upgrade sets/.test(t) && />> Finished\./.test(t));
});

test('top gear: bag items fully upgraded and consumables ranked on the best combination', async () => {
  logs.length = 0;
  const text = 'warrior="Bob"\nspec=fury\nlevel=90\nhead=,id=10\nfinger1=,id=12\nfinger2=,id=13\n# Helm B (311)\n# head=,id=20,bonus_id=12843\n';
  const r = await H['sim:topgear']({}, { text, threads: 1, topN: 5, fight: { fightStyle: 'Patchwerk' }, precision: 'fast', report: false, upgradeBags: 'bags',
    consumables: { flask: ['flask_a', 'flask_b'] } });
  assert.ok(logs.some(l => /Helm B 311 → 321 \(Hero 6\/6\)/.test(l)), 'upgrade logged');
  assert.ok(r.rows.some(x => x.items.some(t => /Helm B \(311 → 321\)/.test(t.label))));
  assert.strictEqual(r.consumablesRank.length, 1); assert.strictEqual(r.consumablesRank[0].options.length, 2);
});
