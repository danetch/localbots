const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const tal = require('../lib/talents');
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
// Encoder mirroring Blizzard's export layout: version 8 bits, spec 16 bits, 128-bit tree hash, then `tail` payload bits; LSB first, 6 bits per char.
function enc(spec, tail = 0) {
  const bits = []; const put = (v, n) => { for (let i = 0; i < n; i++) bits.push((v / 2 ** i) & 1 ? 1 : 0); };
  put(2, 8); put(spec, 16); put(0, 128); put(tail, 24);
  let s = ''; for (let i = 0; i < bits.length; i += 6) s += B64[bits.slice(i, i + 6).reduce((a, b, k) => a + (b << k), 0)];
  return s;
}
const A = enc(62, 5), B = enc(62, 9), C = enc(63, 1);
const EXPORT = `mage="Bob"\nspec=arcane\nlevel=90\n# Saved Loadout: Raid\ntalents=${A}\nhead=,id=10\nfinger1=,id=12\nfinger2=,id=13\n# Saved Loadout: M+\n# talents=${B}\n# Saved Loadout: Frost build\n# talents=${C}\n# Helm B (300)\n# head=,id=20\n`;

test('header decodes version and spec like simc', () => {
  assert.deepStrictEqual(tal.header(A), { version: 2, spec: 62 });
  assert.strictEqual(tal.header(C).spec, 63);
});
test('parse finds the active build and saved loadouts, flags other specs', () => {
  const b = tal.parse(EXPORT);
  assert.deepStrictEqual(b.map(x => [x.name, x.active, x.usable]), [['Raid', true, true], ['M+', false, true], ['Frost build', false, false]]);
  assert.strictEqual(tal.parse('mage="x"\ntalents=zzz\n').length, 0);
  assert.strictEqual(tal.parse(`talents=${A}\ntalents=${A}\n`).length, 1);
});
test('apply swaps the active line only', () => {
  const t = tal.apply(EXPORT, B);
  assert.ok(t.includes(`\ntalents=${B}\n`)); assert.ok(!t.includes(`\ntalents=${A}\n`));
  assert.ok(tal.apply('mage="x"\nspec=arcane\n', B).endsWith(`talents=${B}`));
  assert.throws(() => tal.apply(EXPORT, 'bad string'));
});
test('item labels ignore talent comment lines', () => {
  const p = require('../lib/topgear').parse(EXPORT);
  assert.ok(!Object.values(p.labels).some(l => /talents=|Saved Loadout/i.test(l)));
});
test('several builds run one after the other end to end', async () => {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-'));
  const H = {}, sent = [], electron = { app: { getPath: () => ud, getVersion: () => '0.2.0', isPackaged: false, whenReady: () => ({ then: f => f() }), on() {}, quit() {} },
    BrowserWindow: function () { this.webContents = { send: (c, p) => sent.push([c, p]), setWindowOpenHandler() {}, on() {} }; this.setTitle = this.setMenuBarVisibility = this.loadFile = () => {}; },
    ipcMain: { handle: (n, f) => (H[n] = f) }, dialog: {}, shell: {} };
  const orig = Module._load; Module._load = function (r, ...a) { return r === 'electron' ? electron : orig.call(this, r, ...a); };
  fs.writeFileSync(ud + '/settings.json', JSON.stringify({ simcPath: path.join(__dirname, 'fakesimc.js') }));
  fs.chmodSync(path.join(__dirname, 'fakesimc.js'), 0o755);
  require('../main.js');
  const log = path.join(__dirname, 'inputs.log'); fs.rmSync(log, { force: true });
  const o = { text: EXPORT, threads: 1, topN: 5, fight: { fightStyle: 'Patchwerk' }, precision: 'fast' };
  const r = await H['sim:topgear']({}, { ...o, builds: [{ string: A }, { string: B }] });
  assert.deepStrictEqual(r.builds.map(b => b.name), ['Raid', 'M+']); assert.ok(r.builds.every(b => b.result.rows.length >= 1));
  const inputs = fs.readFileSync(log, 'utf8');
  assert.ok(inputs.includes(`talents=${A}`) && inputs.includes(`talents=${B}`));
  const one = await H['sim:topgear']({}, { ...o, builds: [{ string: B }] });
  assert.ok(one.rows && !one.builds);
  await assert.rejects(H['sim:topgear']({}, { ...o, builds: [{ string: C }] }), /other specialization/);
  await assert.rejects(H['sim:topgear']({}, { ...o, builds: [{ string: enc(62, 77) }] }), /no longer in the export/);
  const prog = sent.filter(s => s[0] === 'sim:progress').map(s => s[1]);
  assert.ok(prog.some(p => p.label.startsWith('[Raid]')) && prog.some(p => p.label.startsWith('[M+]')));
  Module._load = orig; fs.rmSync(log, { force: true });
});
