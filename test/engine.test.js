// Engine download flow end to end with a fake download server (fetch stub), a real 7-Zip extraction and a fake simc.exe.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module'), { spawnSync } = require('child_process');
let z; try { z = require('7zip-bin').path7za; } catch { /* dependency not installed */ }
test('engine install: download, extract, version check, settings', { skip: !z && 'run npm install (7zip-bin)' }, async () => {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-ud-')), src = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-src-')), H = {};
  fs.mkdirSync(path.join(src, 'simc-1210-01-win64-abc1234'));
  const exe = path.join(src, 'simc-1210-01-win64-abc1234', 'simc.exe');
  fs.writeFileSync(exe, '#!/bin/sh\necho "SimulationCraft 1210-01 for World of Warcraft 12.1.5.70448 Live (hotfix 2026-10-20/70448, git build midnight abc1234)"\n'); fs.chmodSync(exe, 0o755);
  fs.chmodSync(z, 0o755);
  const arc = path.join(src, 'simc-1210-01-win64-abc1234.7z');
  assert.strictEqual(spawnSync(z, ['a', arc, path.join(src, 'simc-1210-01-win64-abc1234')]).status, 0);
  const bytes = fs.readFileSync(arc);
  const realFetch = global.fetch;
  global.fetch = async url => String(url).endsWith('.7z')
    ? new Response(bytes, { headers: { 'content-length': String(bytes.length) } })
    : new Response('<a href="simc-1210-01-win64-abc1234.7z">simc</a>');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  const electron = { app: { getPath: () => ud, getVersion: () => '0.2.0', isPackaged: false, whenReady: () => ({ then() {} }), on() {}, quit() {} }, BrowserWindow: function () {}, ipcMain: { handle: (n, f) => (H[n] = f) }, dialog: {}, shell: {} };
  const orig = Module._load; Module._load = function (r, ...a) { return r === 'electron' ? electron : orig.call(this, r, ...a); };
  try {
    require('../main.js');
    const c = await H['engine:check'](); assert.strictEqual(c.latest.version, '1210-01'); assert.strictEqual(c.upToDate, false);
    const r = await H['engine:install']();
    assert.strictEqual(r.version.wow, '12.1.5.70448'); assert.match(r.sha256, /^[0-9a-f]{64}$/);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(ud, 'settings.json'), 'utf8')).simcPath, r.exe);
    assert.strictEqual((await H['engine:check']()).upToDate, true);
    assert.strictEqual((await H['engine:info']()).version.simc, '1210-01');
  } finally { Module._load = orig; global.fetch = realFetch; }
});

// Real index of downloads.simulationcraft.org (28 Oct 2026): current Windows builds are named simc-1210.01.73a372b-win64.7z. The old pattern
// (simc-1210-01-win64-<hash>.7z) found none of them -> "No Windows build found in the simc download index" on a user's PC.
test('engine listing: real nightly index, both archive name formats', () => {
  const engine = require('../lib/engine');
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'simc-nightly-index.html'), 'utf8');
  const l = engine.latest(html, 'win32', '1210-01');
  assert.deepStrictEqual(l, { name: 'simc-1210.01.73a372b-win64.7z', url: engine.BASE_URL + 'simc-1210.01.73a372b-win64.7z', version: '1210-01', hash: '73a372b', date: '2026-10-23 05:13' });
  assert.strictEqual(engine.latest(html, 'win32').name, 'simc-1210.01.73a372b-win64.7z');               // no family: highest version
  const names = engine.listing(html, 'win32').map(x => x.name);
  assert.ok(names.every(n => /-win64[.-]/.test(n) && !/arm64|_qt5/.test(n)), 'only plain win64 archives');
  assert.ok(names.includes('simc-910-01-win64-5d7ee8d.7z') && names.includes('simc-920.01-win64.7z'), 'old names and hash-less names still read');
  assert.deepStrictEqual(engine.families(html, 'win32').slice(0, 3), ['1210-01', '1205-01', '1201-01']);
  assert.ok(engine.sameBuild('73a372b9f', l.hash), 'banner hash vs archive hash');
});
