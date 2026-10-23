// Rename LocalBots -> Polygnome: the old data folder is copied on the first launch (caches skipped, simc path moved), only once.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
test('first launch copies the LocalBots data folder into the Polygnome one', () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-appdata-')), old = path.join(appData, 'LocalBots'), dest = path.join(appData, 'Polygnome');
  fs.mkdirSync(path.join(old, 'engine', 'simc-1210'), { recursive: true }); fs.mkdirSync(path.join(old, 'Cache')); fs.mkdirSync(path.join(old, 'logs'));
  fs.writeFileSync(path.join(old, 'settings.json'), JSON.stringify({ simcPath: path.join(old, 'engine', 'simc-1210', 'simc.exe'), reserve: 4 }));
  fs.writeFileSync(path.join(old, 'loot.json'), '{"instances":{}}'); fs.writeFileSync(path.join(old, 'Cache', 'x'), 'x'); fs.writeFileSync(path.join(old, 'logs', 'run-1.log'), 'log');
  const electron = { app: { getPath: k => k === 'appData' ? appData : dest, getVersion: () => '0.4.0', isPackaged: false, whenReady: () => ({ then() {} }), on() {}, quit() {} },
    BrowserWindow: function () {}, ipcMain: { handle() {} }, dialog: {}, shell: {} };
  const orig = Module._load; Module._load = function (r, ...a) { return r === 'electron' ? electron : orig.call(this, r, ...a); };
  try { delete require.cache[require.resolve('../main.js')]; require('../main.js'); } finally { Module._load = orig; }
  assert.ok(fs.existsSync(path.join(dest, 'loot.json')) && fs.existsSync(path.join(dest, 'logs', 'run-1.log')), 'data copied');
  assert.ok(!fs.existsSync(path.join(dest, 'Cache')), 'caches skipped');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dest, 'settings.json'), 'utf8')).simcPath, path.join(dest, 'engine', 'simc-1210', 'simc.exe'));
  assert.ok(fs.existsSync(path.join(old, 'settings.json')), 'old folder kept');
});
