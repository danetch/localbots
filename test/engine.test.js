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
