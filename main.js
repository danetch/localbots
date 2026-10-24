const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const tg = require('./lib/topgear');
const loot = require('./lib/loot');
const { makeParser } = require('./lib/progress');
const bis = require('./lib/bis');
const tierLib = require('./lib/tier');
const craftedLib = require('./lib/crafted');
const specs = require('./lib/specs');
const talentsLib = require('./lib/talents');
const bossLib = require('./lib/boss');
const itemsLib = require('./lib/items');
const engineLib = require('./lib/engine');
const upgradeLib = require('./lib/upgrade');
const enhLib = require('./lib/enhance');
const drLib = require('./lib/dr');
const crypto = require('crypto');
const { resolve: resolveIlvl } = require('./lib/progression');

// Renamed LocalBots -> Polygnome (v0.4.0): Electron's data folder follows the product name (installed: %APPDATA%\Polygnome, dev: the
// package name). On the first launch the old LocalBots folder is copied over (caches skipped), the old one is kept as a backup, and a
// simc path that pointed inside it is moved to the copy. Runs before anything opens the data folder.
(function migrateFromLocalBots() {
  try {
    const appData = app.getPath('appData'), dest = app.getPath('userData');
    if (fs.existsSync(path.join(dest, 'settings.json')) || fs.existsSync(path.join(dest, 'loot.json'))) return;
    const src = ['LocalBots', 'localbots'].map(n => path.join(appData, n)).find(d => path.resolve(d).toLowerCase() !== path.resolve(dest).toLowerCase() && fs.existsSync(path.join(d, 'settings.json')));
    if (!src) return;
    const SKIP = /^(Cache|Code Cache|GPUCache|DawnGraphiteCache|DawnWebGPUCache|blob_storage|Crashpad|Shared Dictionary|Singleton\w*|lockfile)$/i;
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true, filter: f => !SKIP.test(path.basename(f)) });
    const sf = path.join(dest, 'settings.json'), st = JSON.parse(fs.readFileSync(sf, 'utf8'));
    if (st.simcPath && st.simcPath.toLowerCase().startsWith(src.toLowerCase() + path.sep)) { st.simcPath = path.join(dest, st.simcPath.slice(src.length + 1)); fs.writeFileSync(sf, JSON.stringify(st, null, 2)); }
    fs.writeFileSync(path.join(dest, 'migrated-from.txt'), `Copied from ${src} on ${new Date().toISOString()}. The old folder was kept as a backup and can be deleted.\n`);
  } catch (e) { console.error('Polygnome: could not copy the LocalBots data', e); }
})();
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const loadSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; } };
const saveSettings = s => fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));

let win, child = null, cancelled = false, busy = false;
// Full log of each run in userData/logs (the Activity log tab only keeps the end). trace() writes detail to the file only.
let runLog = null, lastLog = null;
const logsDir = () => path.join(app.getPath('userData'), 'logs');
const toFile = l => { if (runLog) try { fs.appendFileSync(runLog, l + '\n'); } catch {} };
const emitLog = l => { win?.webContents.send('sim:log', l); toFile(l); };
const trace = toFile;

// Lance simc et renvoie le JSON json2. Sortie périmée supprimée avant lancement ; annulation, erreurs et JSON illisible gérés.
function runSimc(simcPath, inputFile, jsonFile, extra, onLine) {
  return new Promise((resolve, reject) => {
    if (cancelled) return reject(new Error('Cancelled'));
    try { fs.rmSync(jsonFile, { force: true }); } catch {}
    const tail = [];
    const keep = l => { if (/error|invalid|unknown|cannot|unable|exception|not found/i.test(l)) { tail.push(l.trim()); if (tail.length > 6) tail.shift(); } };
    let proc;
    try { proc = spawn(simcPath, [inputFile, `json2=${jsonFile}`, ...extra]); } catch (e) { return reject(new Error(`Could not start simc: ${e.message}`)); }
    child = proc;
    const feed = d => d.toString().split(/\r?\n|\r/).filter(Boolean).forEach(l => { keep(l); onLine(l); });
    proc.stdout.on('data', feed); proc.stderr.on('data', feed);
    proc.on('error', e => { child = null; reject(new Error(e.code === 'ENOENT' ? `simc not found at ${simcPath}` : `Could not start simc: ${e.message}`)); });
    proc.on('close', code => {
      child = null;
      if (cancelled) return reject(new Error('Cancelled'));
      if (code !== 0) return reject(new Error(`simc exited with code ${code}${tail.length ? ':\n' + tail.join('\n') : ''}`));
      try { resolve(JSON.parse(fs.readFileSync(jsonFile, 'utf8'))); }
      catch (e) { reject(new Error(`simc finished but its JSON output could not be read (${e.message})`)); }
    });
  });
}

// Une seule simulation à la fois ; dossier temporaire nettoyé à la fin.
async function withRun(fn) {
  if (busy) throw new Error('A simulation is already running.');
  busy = true; cancelled = false;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'polygnome-'));
  try {
    const d = logsDir(); fs.mkdirSync(d, { recursive: true });
    for (const f of fs.readdirSync(d).filter(f => /^run-.*\.log$/.test(f)).sort().slice(0, -19)) try { fs.rmSync(path.join(d, f)); } catch {}
    runLog = path.join(d, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.log`); lastLog = runLog;
  } catch { runLog = null; }
  try { const r = await fn(tmp); toFile('>> Finished.'); return r; }
  catch (e) { toFile(`>> Error: ${e.message}`); throw e; }
  finally { busy = false; cancelled = false; runLog = null; fs.rm(tmp, { recursive: true, force: true }, () => {}); }
}
// Boss fight: turns { boss, difficulty } of the fight settings into Patchwerk + timed raid events.
const bossDirs = () => [path.join(__dirname, 'data', 'fights'), path.join(app.getPath('userData'), 'fights')];
function resolveFight(f) {
  if (!f?.boss) return f;
  const def = bossLib.list(bossDirs()).find(b => b.id === f.boss);
  if (!def) throw new Error(`Boss fight “${f.boss}” not found.`);
  const r = bossLib.build(def, { difficulty: f.difficulty, duration: f.duration });
  return { ...f, fightStyle: '', duration: r.length, targets: r.targets, raidEvents: r.events, bossArgs: r.extraArgs };   // no fight_style: simc clears raid_events when fight_style=Patchwerk is given (sim.cpp init_fight_style)
}
// Talent builds chosen in the panel (o.builds = [{string}]): one build replaces the active talents= line; several are simulated one after
// the other and returned as { builds: [{ name, string, result }] }.
let progScale = { o: 0, s: 1, prefix: '' };
const run = fn => (_e, o) => withRun(async tmp => {
  trace(`Polygnome ${app.getVersion()} · ${new Date().toString()}\nOptions: ${JSON.stringify({ ...o, text: undefined })}\n--- export ---\n${o?.text || ''}\n--- end of export ---`);
  const opts = o && o.fight ? { ...o, fight: resolveFight(o.fight) } : o;
  if (opts?.reserve != null) saveSettings({ ...loadSettings(), reserve: opts.reserve });
  const sel = opts?.builds;
  if (!sel?.length) return fn(opts, tmp);
  const known = talentsLib.parse(opts.text);
  const chosen = sel.map(b => known.find(k => k.string === b.string)).filter(Boolean);
  if (chosen.length !== sel.length) throw new Error('A selected talent build is no longer in the export.');
  const bad = chosen.find(b => !b.usable);
  if (bad) throw new Error(`Talent build “${bad.name}” is for another specialization than the exported character.`);
  if (chosen.length === 1) return fn({ ...opts, text: talentsLib.apply(opts.text, chosen[0].string) }, tmp);
  const out = [];
  try {
    for (const [i, b] of chosen.entries()) {
      progScale = { o: i / chosen.length, s: 1 / chosen.length, prefix: `[${b.name}] ` };
      emitLog(`>> Talent build ${i + 1}/${chosen.length}: ${b.name}`);
      out.push({ name: b.name, string: b.string, result: await fn({ ...opts, text: talentsLib.apply(opts.text, b.string) }, tmp) });
    }
  } finally { progScale = { o: 0, s: 1, prefix: '' }; }
  return { builds: out };
});
ipcMain.handle('talents:parse', (_e, text) => talentsLib.parse(String(text || '')));
ipcMain.handle('boss:list', () => bossLib.list(bossDirs()).map(b => ({ id: b.id, name: b.name, source: b.source, duration: b.defaultDuration, difficulties: Object.entries(b.difficulties).map(([id, d]) => ({ id, label: d.label, duration: d.duration || b.defaultDuration })) })));
ipcMain.handle('boss:length', (_e, f) => { const def = bossLib.list(bossDirs()).find(b => b.id === f.boss); if (!def) return null;
  const diff = def.difficulties[f.difficulty] ? f.difficulty : Object.keys(def.difficulties)[0];
  return { ...bossLib.killLength(def, diff, bossLib.equippedIlvl(f.text)), median: def.difficulties[diff].kills?.median, label: def.difficulties[diff].label }; });
ipcMain.handle('boss:preview', (_e, f) => { const def = bossLib.list(bossDirs()).find(b => b.id === f.boss); return def ? bossLib.build(def, { difficulty: f.difficulty, duration: f.duration }) : null; });
ipcMain.handle('boss:edit', async () => { const d = path.join(app.getPath('userData'), 'fights'); fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(path.join(__dirname, 'data', 'fights'))) { const dst = path.join(d, f); if (!fs.existsSync(dst)) fs.copyFileSync(path.join(__dirname, 'data', 'fights', f), dst); }
  return shell.openPath(d); });

const writeJson = (file, obj) => { const t = file + '.tmp'; fs.writeFileSync(t, JSON.stringify(obj)); fs.renameSync(t, file); };   // écriture atomique
async function download(url, label, ms = 600000) {
  let r;
  try { r = await fetch(url, { signal: AbortSignal.timeout(ms) }); }
  catch (e) { throw new Error(`${label}: ${e.name === 'TimeoutError' ? 'download timed out' : (e.cause?.code || e.message)}`); }
  if (!r.ok) throw new Error(`${label}: server answered ${r.status}`);
  return r.text();
}

const { fightArgs } = require('./lib/fight');
const { extractGear } = require('./lib/gear');
const { whOf } = require('./lib/wowhead');
const sendProgress = p => win?.webContents.send('sim:progress', { ...p, pct: p.pct == null ? p.pct : progScale.o + p.pct * progScale.s, label: progScale.prefix + p.label });

// target_error n'arrête la simulation qu'en avance : `iterations` est un plafond dur (20000 par défaut), donc il faut le relever
// pour que les précisions demandées soient atteignables (erreur ≈ 21 % / √n ; marge de 50 %).
const iterCap = e => Math.round(Math.min(500000, Math.max(10000, 1.5 * (21 / e) ** 2)));
// Précision choisie dans l'interface : multiplie les erreurs cibles des passes fines.
const fineOf = o => e => e * ({ fast: 2, high: 0.5 }[o?.precision] || 1);

// simc's HTML report of the best result: re-simulated once (finalist precision) and kept under userData/reports (last 10).
const reportsDir = () => path.join(app.getPath('userData'), 'reports');
function keepReport(src) {
  if (!fs.existsSync(src)) return null;
  const d = reportsDir(); fs.mkdirSync(d, { recursive: true });
  const dest = path.join(d, `report-${new Date().toISOString().replace(/[:.]/g, '-')}.html`);
  fs.copyFileSync(src, dest);
  for (const f of fs.readdirSync(d).filter(f => /^report-.*\.html$/.test(f)).sort().slice(0, -10)) try { fs.rmSync(path.join(d, f)); } catch {}
  return dest;
}
async function reportPass(simcPath, text, diff, err, threads, tmp, log, fight, range, label) {
  try {
    const out = path.join(tmp, 'report.html'); fs.rmSync(out, { force: true });
    const lines = Object.entries(diff || {}).map(([s, v]) => `${s}=${v}`).join('\n');
    await pass(simcPath, `${text}\n${lines}\n`, [], err, threads, tmp, log, fight, range, label, [`html=${out}`]);
    return keepReport(out);
  } catch (e) { if (/Cancelled/.test(e.message)) throw e; log(`>> simc report unavailable: ${String(e.message).split('\n')[0]}`); return null; }
}
ipcMain.handle('log:open', async () => {
  let f = lastLog && fs.existsSync(lastLog) ? lastLog : null;
  if (!f) try { const d = logsDir(), l = fs.readdirSync(d).filter(x => /^run-.*\.log$/.test(x)).sort().pop(); if (l) f = path.join(d, l); } catch {}
  if (!f) return false; shell.showItemInFolder(f); return true;
});
ipcMain.handle('report:open', async (_e, file) => {
  const f = path.resolve(String(file || '')), d = path.resolve(reportsDir());
  if (!f.startsWith(d + path.sep) || !fs.existsSync(f)) return false;
  return !(await shell.openPath(f));
});

// Item stats of the changed slots, shown in the results. One cheap simc run (1 iteration) with a copy of the character per variant:
// simc reports each item's ilevel and secondary stats (Catalyst items carry the stats of their source piece via redirected_base_stats).
// Decorative: any failure only logs a line and returns nothing. -> [{ slot: { ilvl, crit_rating, ... } }] parallel to diffs
async function statsPass(simcPath, text, diffs, threads, tmp, log) {
  try {
    const name = (/^\s*(?:warrior|paladin|deathknight|hunter|shaman|evoker|rogue|monk|druid|demonhunter|priest|mage|warlock)\s*=\s*"?([^"\r\n]+?)"?\s*$/mi.exec(text) || [])[1];
    if (!name || /[,\s=]/.test(name) || !diffs.length) return [];
    const file = path.join(tmp, 'stats.simc');
    fs.writeFileSync(file, `${text}\n` + diffs.map((d, i) => `copy=s${i},${name}\n` + Object.entries(d).map(([s, v]) => `${s}=${v}`).join('\n')).join('\n') + '\n');
    const data = await runSimc(simcPath, file, path.join(tmp, 'stats.json'), ['iterations=1', `threads=${Math.max(1, Math.floor(+threads) || 1)}`], () => {});
    const by = Object.fromEntries(data.sim.players.map(p => [p.name, extractGear(p)]));
    return diffs.map((d, i) => Object.fromEntries(Object.keys(d).filter(s => d[s] && by['s' + i]?.[s]).map(s => [s, by['s' + i][s]])));
  } catch (e) { if (/Cancelled/.test(e.message)) throw e; log(`>> Item stats unavailable: ${String(e.message).split('\n')[0]}`); return []; }
}

async function pass(simcPath, text, list, err, threads, tmp, log, fight, range, label, extra = []) {
  const file = path.join(tmp, 'run.simc'), thr = Math.max(1, Math.floor(+threads) || 1);
  fs.writeFileSync(file, `${text}\n${tg.toProfilesets(list)}\n`);
  const parse = makeParser(range, label, sendProgress);
  let lastLog = 0;
  const onLine = l => {
    const isProg = parse(l);
    if (isProg && Date.now() - lastLog < 500) return;
    lastLog = Date.now(); log(l);
  };
  sendProgress({ pct: range[0], label });
  const data = await runSimc(simcPath, file, path.join(tmp, 'out.json'),
    [`threads=${thr}`, `target_error=${err}`, `iterations=${iterCap(err)}`, `profileset_work_threads=${Math.min(2, thr)}`, ...fightArgs(fight), ...extra], onLine);
  sendProgress({ pct: range[1], label });
  const base = data.sim.players[0].collected_data.dps.mean;
  // st: buffed stats of each profileset (only with profileset_output_data=stats), baseStats: those of the base profile
  const results = (data.sim.profilesets?.results || []).map(r => ({ idx: +r.name.slice(1), mean: r.mean, err: r.mean_error, st: r.overrides?.stats || null }));
  return { base, results, data, baseStats: data.sim.players[0].collected_data?.buffed_stats?.stats || null };
}

ipcMain.handle('settings:get', () => loadSettings());

// ---------- simc engine (download / version) ----------
const engineDir = () => path.join(app.getPath('userData'), 'engine');
const engineMetaFile = () => path.join(engineDir(), 'engine.json');
const readMeta = () => { try { return JSON.parse(fs.readFileSync(engineMetaFile(), 'utf8')); } catch { return null; } };
function readVersion(simcPath) {            // simc prints its banner and exits when started without arguments
  return new Promise(resolve => {
    let out = '', done = false; const end = v => { if (!done) { done = true; resolve(v); } };
    let p; try { p = spawn(simcPath, []); } catch { return end(null); }
    const add = d => { out += d; }; p.stdout.on('data', add); p.stderr.on('data', add);
    p.on('error', () => end(null)); p.on('close', () => end(engineLib.versionOf(out)));
    setTimeout(() => { try { p.kill(); } catch {} end(engineLib.versionOf(out)); }, 8000);
  });
}
async function downloadFile(url, dest, onPct) {
  let r; try { r = await fetch(url, { signal: AbortSignal.timeout(900000) }); } catch (e) { throw new Error(`Download failed: ${e.name === 'TimeoutError' ? 'timed out' : (e.cause?.code || e.message)}`); }
  if (!r.ok) throw new Error(`Download failed: server answered ${r.status}`);
  const total = +r.headers.get('content-length') || 0, ws = fs.createWriteStream(dest), rd = r.body.getReader(); let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; got += value.length; if (!ws.write(value)) await new Promise(res => ws.once('drain', res)); onPct(total ? got / total : null, got); }
  await new Promise((res, rej) => { ws.on('error', rej); ws.end(res); });
}
const sha256 = f => new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(f).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { const r = findFile(p, name); if (r) return r; } else if (e.name.toLowerCase() === name) return p; }
  return null;
}
function extract7z(archive, outDir) {
  let bin; try { bin = require('7zip-bin').path7za.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`); } catch { throw new Error('The 7-Zip helper is missing: run “npm install”.'); }
  try { fs.chmodSync(bin, 0o755); } catch {}      // the npm package can lose the executable bit (non-Windows)
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['x', '-y', `-o${outDir}`, archive]); let err = '';
    p.stderr.on('data', d => { err += d; }); p.stdout.on('data', d => { err += d; });
    p.on('error', e => reject(new Error(`Could not run 7-Zip: ${e.message}`)));
    p.on('close', c => c === 0 ? resolve() : reject(new Error(`Extraction failed (7-Zip code ${c}): ${err.trim().split('\n').slice(-2).join(' ')}`)));
  });
}
ipcMain.handle('engine:info', async () => {
  const { simcPath } = loadSettings(), meta = readMeta();
  return { platform: process.platform, canInstall: process.platform === 'win32', path: simcPath || '', meta,
    version: simcPath ? await readVersion(simcPath) : null, dataBuild: itemsDb().build };
});
// Which build to offer: the newest of the INSTALLED version family (e.g. 1210-01), or, with nothing installed, of the retail line (simc master's
// version token). Higher families may be PTR/beta builds and are only reported (newerFamilies), never offered automatically.
async function pickBuild(forceFamily) {
  if (process.platform !== 'win32') throw new Error('Automatic download is only available on Windows. Select your own simc build instead.');
  const { simcPath } = loadSettings(), inst = simcPath ? await readVersion(simcPath) : null, meta = readMeta();
  const html = await download(engineLib.INDEX_URL, 'simc download index', 30000);
  let family = forceFamily || inst?.simc || null;
  if (!family) { try { family = engineLib.familyOf(await download(engineLib.CONFIG_URL, 'simc version info', 15000)); } catch { /* fall back to the highest version */ } }
  const l = engineLib.latest(html, process.platform, family);
  const baseFam = inst?.simc || family;
  const newerFamilies = baseFam ? engineLib.families(html).filter(v => engineLib.cmpVersion(v, baseFam) > 0) : [];
  if (!l && !newerFamilies.length) throw new Error('No Windows build found in the simc download index.');
  const git = inst?.git || meta?.hash || '';
  return { latest: l, family, installedVersion: inst ? { simc: inst.simc, git: inst.git, hotfix: inst.hotfix, wow: inst.wow } : null, hasSimc: !!simcPath,
    installed: meta?.name || null, upToDate: !!l && engineLib.sameBuild(git, l.hash), newerFamilies };
}
ipcMain.handle('engine:check', () => pickBuild());
let engineBusy = false;
ipcMain.handle('engine:install', async (_e, opt) => {
  if (engineBusy) throw new Error('An engine download is already running.');
  engineBusy = true; const log = emitLog;
  try {
    const l = (await pickBuild(opt?.family))?.latest;
    if (!l) throw new Error('No Windows build found in the simc download index for this version.');
    const root = engineDir(); fs.mkdirSync(root, { recursive: true });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'polygnome-engine-')), arc = path.join(tmp, l.name);
    try {
      log(`>> Downloading ${l.name}…`); let last = 0;
      await downloadFile(l.url, arc, (p, got) => { if (Date.now() - last > 1500) { last = Date.now(); log(p != null ? `   ${Math.round(p * 100)} %` : `   ${(got / 1048576).toFixed(0)} MB`); } });
      const hash = await sha256(arc), dest = path.join(root, l.name.replace(/\.7z$/i, ''));
      log('>> Extracting…'); fs.rmSync(dest, { recursive: true, force: true }); await extract7z(arc, dest);
      const exe = findFile(dest, 'simc.exe'); if (!exe) throw new Error('simc.exe was not found in the downloaded archive.');
      const v = await readVersion(exe); if (!v) throw new Error('The downloaded simc did not start (no version banner). Antivirus software may have blocked it.');
      saveSettings({ ...loadSettings(), simcPath: exe });
      fs.writeFileSync(engineMetaFile(), JSON.stringify({ name: l.name, version: l.version, hash: l.hash, sha256: hash, installedAt: new Date().toISOString(), exe }, null, 2));
      for (const e of fs.readdirSync(root, { withFileTypes: true })) if (e.isDirectory() && path.join(root, e.name) !== dest) fs.rmSync(path.join(root, e.name), { recursive: true, force: true });   // older builds
      log(`>> simc ${v.simc} (WoW ${v.wow}) installed. SHA-256 ${hash.slice(0, 16)}…`);
      return { exe, version: v, name: l.name, sha256: hash };
    } finally { fs.rm(tmp, { recursive: true, force: true }, () => {}); }
  } finally { engineBusy = false; }
});

// ---------- app updates ----------
const updater = require('./lib/updater').make(app, emitLog);
ipcMain.handle('update:get', () => updater.get());
ipcMain.handle('update:check', () => updater.check());
ipcMain.handle('update:install', () => updater.install());
ipcMain.handle('simc:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], title: 'Select simc' });
  if (r.canceled) return null;
  const s = { ...loadSettings(), simcPath: r.filePaths[0] }; saveSettings(s); return s.simcPath;
});
ipcMain.handle('sim:cancel', () => { cancelled = true; child?.kill(); });
// Base d'objets (armes à deux mains, embellissements) : copie rafraîchie par « Update loot data », sinon le fichier livré avec l'appli.
let itemsCache = { key: '', db: null };
function itemsDb() {
  const u = path.join(app.getPath('userData'), 'items.json'), f = fs.existsSync(u) ? u : path.join(__dirname, 'data', 'items.json'), key = f + fs.statSync(f).mtimeMs;
  if (itemsCache.key !== key) itemsCache = { key, db: itemsLib.make(JSON.parse(fs.readFileSync(f, 'utf8'))) };
  return itemsCache.db;
}
// Enchants / gems / socket bonuses (lib/enhance.js): copy rebuilt by "Update loot data", else the file shipped with the app.
let enhCache = { key: '', db: null };
function enhanceDb() {
  const u = path.join(app.getPath('userData'), 'enhance.json'), f = fs.existsSync(u) ? u : path.join(__dirname, 'data', 'enhance.json');
  try { const key = f + fs.statSync(f).mtimeMs; if (enhCache.key !== key) enhCache = { key, db: JSON.parse(fs.readFileSync(f, 'utf8')) }; return enhCache.db; }
  catch { return { enchants: [], gems: [], socketBonus: {} }; }
}
const specOf = text => (/^\s*spec\s*=\s*(\w+)/mi.exec(String(text)) || [])[1]?.toLowerCase() || '';
const levelOf = text => +((/^\s*level\s*=\s*(\d+)/mi.exec(String(text)) || [])[1] || 0);
const weaponKind = k => ['one', 'main', 'offw', 'two'].includes(k);
// What the Enchants & gems card would test for this export (also used by the BiS run).
function enhChoices(text, base, rules) {
  const db = enhanceDb(), dual = isDual(base, rules);
  const slots = Object.keys(base).filter(s => base[s]);
  const ench = enhLib.enchantsFor(db, { primary: specs.primaryOf(text), cls: specs.classOf(text), spec: specOf(text), slots, offWeapon: dual && !!base.off_hand });
  return { db, ench, gems: enhLib.gemsFor(db) };
}
ipcMain.handle('enh:preview', (_e, { text, add }) => {
  try {
    const parsed = tg.parse(String(text || '')), base = tg.baseSlots(parsed.equipped);
    if (!Object.keys(base).length) return { empty: true };
    const c = enhChoices(text, base, mkRules(text));
    const sockets = enhLib.SOCKET_ORDER.map(s => [s, enhLib.socketsOf(s, base[s], c.db, { add, base: itemsDb().baseSockets })]).filter(([, n]) => n);
    return { build: c.db.build, ench: Object.entries(c.ench).map(([slot, l]) => ({ slot, names: l.map(e => e.name) })),
      diamonds: c.gems.diamonds.map(g => g.name), gems: c.gems.gems.map(g => g.name), sockets };
  } catch (e) { return { error: e.message }; }
});
// Loot left out by loot.select (older copies of remade items, Azerite-style stats): one log line, details in the run log file.
function logSkipped(sk, log) {
  const u = [...new Map(sk.map(x => [x.id, x])).values()]; if (!u.length) return;
  log(`>> Loot: ${u.length} obsolete item(s) left out (older copies of remade items / Azerite-style stats), see the run log file.`);
  for (const x of u) trace(`   left out: ${x.name} (${x.id}) · ${x.why}`);
}
// Gems kept with the set (Top Gear, Droptimizer, Best in Slot without gem optimisation): enhLib.keepCtx + materialize.
// -> { M(S) simc slot map, text: export + materialized base, diffs(list) materialized profileset diffs }
function keepGems(text, base, log) {
  const db = enhanceDb(), dia = new Set(db.gems.filter(g => g.diamond).flatMap(g => g.ids.map(String)));
  const k = enhLib.keepCtx(base, db, itemsDb().baseSockets, id => dia.has(String(id)));
  const M = S => enhLib.materialize(S, k), MB = M(base);
  if (k.filled > 0 && k.keepPlan) log?.(`>> Gems: ${k.filled} empty socket(s) in your gear filled with your most common gem; gems follow the set (a swapped piece's gems move to the new one).`);
  return { k, M, MB, text: bis.withSet(text, MB), diffs: list => list.map(d => bis.diffOf(MB, M({ ...base, ...d }))) };
}
const weaponsFor = text => specs.weaponsOf(text) || Object.keys(loot.WEAPONS).map(Number);
ipcMain.handle('weapons:of', (_e, text) => { const c = specs.classOf(text), w = specs.weaponsOf(text); return c ? { cls: c, names: w.map(i => loot.WEAPONS[i]), shield: specs.canShield(text) } : null; });
// Règles d'équipement : 2M détectées d'après les données du jeu, Titan's Grip pour les guerriers Fury, embellissements détectés d'après la table de simc.
const mkRules = text => {
  const db = itemsDb();
  return { tags: {}, maxEmb: 2, maxCat: Infinity, twoHandIds: db.two, kindOf: db.kind, titan: itemsLib.isTitan(text),
    embBonusIds: new Set([...db.embBonusIds, ...(loadLoot()?.embellishments || []).map(e => String(e.bonusId))]) };
};

// Peut-on jouer deux armes (une dans chaque main) ? Fury (Titan's Grip) ou arme à une main déjà en main gauche.
const isDual = (base, rules) => rules.titan || ['one', 'offw'].includes(rules.kindOf(tg.idOf(base.off_hand || '')));

// ---------- Crafted gear ----------
const craftUser = () => path.join(app.getPath('userData'), 'crafted.json');
const craftDefault = () => path.join(__dirname, 'data', 'crafted.json');
const loadCraftRules = () => JSON.parse(fs.readFileSync(fs.existsSync(craftUser()) ? craftUser() : craftDefault(), 'utf8'));
ipcMain.handle('craft:edit', () => { if (!fs.existsSync(craftUser())) fs.copyFileSync(craftDefault(), craftUser()); return shell.openPath(craftUser()); });
// Returns the crafted candidates [{slot,item,twoHand,emb,label}] for the options of the UI card (or [] when disabled).
function craftedVariants(c, text, { base, dual } = {}) {
  if (!c?.on) return [];
  const R = loadCraftRules(), L = loadLoot(), cls = tierLib.classOf(text);
  if (!cls) throw new Error('Crafted gear: could not detect your class in the export.');
  const crafted = L?.crafted || [];
  if (!crafted.length && !R.extraItems?.length) throw new Error('Crafted gear: no craftable items known. Click “Update loot data” (recipe tables) or add items under "extraItems" in Edit crafted rules.');
  const embNames = Object.fromEntries((L?.embellishments || []).map(e => [e.name.toLowerCase(), e.key]));
  const names = Object.fromEntries((L?.embellishments || []).map(e => [e.name.toLowerCase(), e.name]));
  const keyOf = n => embNames[n] || craftedLib.slug(n);   // simc tokenized name
  const sel = (c.emb || []).map(n => n.toLowerCase());
  const R2 = { ...R, embellishments: Object.fromEntries(Object.entries(R.embellishments || {}).map(([n, v]) => [keyOf(n), v])) };
  // Crafted weapons only matter through weapon embellishments: they are added when one is ticked (types: what the class can wield).
  const wantW = sel.map(keyOf).some(k => (R2.embellishments[k]?.slots || []).some(x => /_hand$/.test(x)));
  const out = craftedLib.variants({ crafted, extra: R.extraItems, rules: R2, emb: sel.map(keyOf), embNames: Object.fromEntries(sel.map(n => [keyOf(n), names[n] || n])),
    pairs: (c.pairs?.length ? c.pairs : R.statPairs), plain: !!c.plain, cls, includeWeapons: wantW, weapons: weaponsFor(text), titan: itemsLib.isTitan(text), dual, primary: specs.primaryOf(text), primOf: itemsDb().prim }, loot.INV);
  if (base) for (const v of out) { const e = (/enchant_id=\d+/.exec(base[v.slot] || '') || [''])[0]; if (e) v.item += ',' + e; }   // l'enchantement équipé suit la pièce
  if (!out.length) throw new Error('Crafted gear: nothing to test with these choices (pick at least one embellishment, or “also test without embellishment”).');
  return out;
}
// What the Crafted gear card will add, for the preview under it: per slot, the base items and the number of variants.
ipcMain.handle('craft:preview', (_e, { text, crafted }) => {
  try {
    if (!crafted?.on) return { off: true };
    const parsed = tg.parse(text), rules = mkRules(text), base = tg.baseSlots(parsed.equipped);
    const cv = craftedVariants(crafted, text, { base, dual: isDual(base, rules) });
    const slots = {};
    for (const v of cv) { const s = slots[v.slot] = slots[v.slot] || { slot: v.slot, items: new Set(), n: 0 }; s.items.add(v.base); s.n++; }
    return { total: cv.length, slots: Object.values(slots).map(s => ({ slot: s.slot, items: [...s.items], n: s.n })) };
  } catch (e) { return { error: e.message }; }
});
// Consumables (Best in Slot final set, Top Gear best combination): every ticked option of each category simulated on setText.
// current(slot) = what the set uses now. -> [{ slot, current, wh, options: [{ value, label, wh, delta, pct }] }] (best first, max 8)
const CONS_KEYS = ['flask', 'food', 'potion', 'augmentation'];
function consInfo() {
  const labels = {}, ids = {};
  for (const arr of Object.values(loadLoot()?.consumables || {})) for (const c of arr) { labels[c.value] = c.label.replace(/ \(rank (\d), guessed\)/, ' (rank $1)'); if (c.id) ids[c.value] = c.id; }
  return { labels, wh: v => (ids[v] ? `item=${ids[v]}` : ''), label: v => !v ? 'Current setup' : v === 'disabled' ? '(none)' : labels[v] || v };
}
async function rankConsumables(simcPath, setText, consumables, current, args, range) {
  const { threads, tmp, log, fight, err } = args, ci = consInfo(), out = [];
  const cats = CONS_KEYS.filter(k => [...new Set(consumables?.[k] || [])].some(v => v !== current(k)));
  for (const [n, slot] of cats.entries()) {
    const opts = [...new Set(consumables[slot])].filter(v => v !== current(slot));
    const r0 = range[0] + (range[1] - range[0]) * n / cats.length, r1 = range[0] + (range[1] - range[0]) * (n + 1) / cats.length;
    const pc = await pass(simcPath, setText, opts.map(v => ({ [slot]: v })), err, threads, tmp, log, fight, [r0, r1], `Consumables — ${slot}`);
    const rows = pc.results.sort((a, b) => b.mean - a.mean).slice(0, 8).map(r => ({ value: opts[r.idx], label: ci.label(opts[r.idx]), wh: ci.wh(opts[r.idx]), delta: r.mean - pc.base, pct: (r.mean / pc.base - 1) * 100 }));
    out.push({ slot, current: ci.label(current(slot)), wh: ci.wh(current(slot)), options: rows });
  }
  return out;
}
const consInExport = (text, k) => (new RegExp(`^\\s*${k}\\s*=\\s*([\\w:.\\-]+)\\s*$`, 'm').exec(text) || [])[1];

ipcMain.handle('sim:topgear', run(async (o, tmp) => {
  const { text, topN, fight, catalyst, crafted } = o, fine = fineOf(o), threads = o.threads;
  const { simcPath } = loadSettings();
  if (!simcPath) throw new Error('Select the simc binary first.');
  const log = emitLog;
  saveSettings({ ...loadSettings(), fight, threads, precision: o.precision });
  const parsed = tg.parse(text), rules = mkRules(text);
  // Upgrades: bag items (or all items) raised to the last level of their upgrade track (lib/upgrade.js) before anything else, so Catalyst
  // twins and gems follow the upgraded level.
  if (o.upgradeBags === 'bags' || o.upgradeBags === 'all') {
    const P = loadProg(), up = upgradeLib.upgradePools(parsed, o.upgradeBags, enhanceDb().upgrade, { ...P, upgradeTracks: P.upgradeTracks || JSON.parse(fs.readFileSync(progDefault(), 'utf8')).upgradeTracks });
    log(`>> Upgrades: ${up.length} ${o.upgradeBags === 'all' ? 'item(s)' : 'bag item(s)'} raised to their track's maximum${up.length ? ': ' + up.map(u => `${u.name} ${u.from} → ${u.to} (${u.track})`).join(', ') : ''}`);
    if (up.some(u => /gladiat|aspirant|combatant|pvp/i.test(u.name))) log('>> Upgrades: PvP items follow the upgrade track their bonus ids show; their real PvP upgrade path may differ.');
  }
  const base = tg.baseSlots(parsed.equipped);
  tg.titanPools(parsed, rules);
  const tierSet = tierLib.setup(catalyst, text, loadLoot()?.tierSets, rules, loadProg().tier);
  if (tierSet) log(`>> Catalyst: ${tierLib.poolTwins(parsed, tierSet)} tier twins of “${tierSet.name}”${rules.maxCat < Infinity ? `, max ${rules.maxCat} charges` : ''}`);
  const KG = keepGems(text, base, log);
  // Crafted gear = which slot, which embellishment, which stats. The stat pair only changes stats (and through diminishing returns its
  // value depends on the rest of the set), so: (1) a probe ranks the ticked stat pairs once on one crafted piece; (2) the combinations
  // search slots/embellishments with the best pair only; (3) the crafted pieces of the top finalists then get every stat-pair combination,
  // simulated together. famItems: crafted item without its stat pair -> the same piece with every ticked pair.
  const cv = craftedVariants(crafted, text, { base, dual: isDual(base, rules) });
  const pairOf = it => (/crafted_stats=([^,]*)/.exec(it || '') || [])[1], famKey = it => String(it).replace(/,crafted_stats=[^,]*/, '');
  const famItems = new Map(), craftSlot = new Map();
  for (const v of cv) { const k = famKey(v.item); if (!famItems.has(k)) famItems.set(k, []); if (!famItems.get(k).includes(v.item)) famItems.get(k).push(v.item); parsed.labels[v.item] = v.label; craftSlot.set(v.item, v.slot.replace(/[12]$/, '')); }
  const pairs = [...new Set(cv.map(v => pairOf(v.item)))];
  let cvUse = cv;
  if (pairs.length > 1) {
    const PROBE = ['wrist', 'wrists', 'back', 'waist', 'feet', 'hands', 'legs', 'chest', 'head', 'shoulder', 'shoulders', 'finger1', 'finger2', 'neck'];   // armor first: crafted stats are a big part of its budget
    const ref = PROBE.map(sl => cv.find(v => v.slot === sl && base[sl])).find(Boolean) || cv[0], refVars = cv.filter(v => v.slot === ref.slot && famKey(v.item) === famKey(ref.item));
    const pp = await pass(simcPath, KG.text, KG.diffs(refVars.map(v => ({ [v.slot]: v.item }))), fine(0.2), threads, tmp, log, fight, [0, 0.05], 'Crafted stats probe');
    const top = pp.results.sort((a, b) => b.mean - a.mean)[0], bestPair = top ? pairOf(refVars[top.idx].item) : pairs[0];
    const SN = { 32: 'Crit', 36: 'Haste', 40: 'Vers', 49: 'Mastery' }, pn = p => p.split('/').map(x => SN[x] || x).join('/');
    log(`>> Crafted stats probe (${ref.base}, ${ref.slot}): ${pp.results.map(r => `${pn(pairOf(refVars[r.idx].item))} ${((r.mean / pp.base - 1) * 100).toFixed(2)} %`).join(' · ')} → combinations use ${pn(bestPair)}, then every pair is tried on the finalists`);
    cvUse = cv.filter(v => pairOf(v.item) === bestPair);
  }
  if (cvUse.length) { craftedLib.addToPools(parsed, cvUse, rules); log(`>> Crafted: ${cvUse.length} crafted pieces added to the pools${cvUse.length < cv.length ? ` (${cv.length} with every stat pair)` : ''}`); }
  // Too many combinations (crafted variants multiply fast): every candidate is first simulated alone in the current gear, and only the
  // best ones of each slot go on to the combinations (equipped items always stay).
  const est = tg.estimate(parsed.pools), LIMIT = 15000;
  if (est > LIMIT) {
    const sw = tg.singleSwaps(parsed, base, rules);
    log(`>> About ${Math.round(est).toLocaleString('en-US')} combinations: pre-screening ${sw.length} candidates one by one first`);
    const ps = await pass(simcPath, KG.text, KG.diffs(sw.map(x => x.diff)), 0.5, threads, tmp, log, fight, [0, 0.25], `Pre-screen — ${sw.length} candidates`);
    const g = new Map(); for (const r of ps.results) { const it = sw[r.idx].item, v = r.mean - ps.base; if (!g.has(it) || v > g.get(it)) g.set(it, v); }
    // The estimate ignores the rules (embellishment cap, unique items...), so the budget is raised while the REAL number of combinations
    // stays well under the limit.
    const orig = Object.fromEntries(Object.entries(parsed.pools).map(([k, v]) => [k, [...v]]));
    // group = crafted slot + embellishment: the best piece of every group survives the pre-screen
    const groupOf = it => craftSlot.has(it) ? craftSlot.get(it) + '|' + ((/embellishment=([^,]*)/.exec(it) || [])[1] || 'plain') : null;
    let budget = LIMIT, pr = tg.prunePools(parsed, it => g.get(it), budget, orig, groupOf), n = tg.combos(parsed, rules).length;
    for (let i = 0; i < 60 && n < LIMIT / 3 && pr.dropped.length; i++) {
      const prev = { pools: Object.fromEntries(Object.entries(parsed.pools).map(([k, v]) => [k, [...v]])), pr, n };
      budget *= 4; pr = tg.prunePools(parsed, it => g.get(it), budget, orig, groupOf);
      try { n = tg.combos(parsed, rules, LIMIT * 2).length; } catch { n = Infinity; }
      if (n > LIMIT) { parsed.pools = prev.pools; pr = prev.pr; n = prev.n; break; }
    }
    log(`>> Pre-screen: kept your equipped items and the ${pr.kept} best other candidate(s) (best alone first, any slot); ${pr.dropped.length} set aside (details in the run log file)`);
    for (const it of pr.dropped) trace(`   set aside: ${parsed.labels[it] || it} (${g.has(it) ? (g.get(it) / ps.base * 100).toFixed(2) + ' %' : 'not simulated'})`);
  }
  const list = tg.combos(parsed, rules);
  if (!list.length) throw new Error('No combination found. Check that the export includes your bag items.');
  log(`>> Pass 1: ${list.length} combinations (low precision)`);
  const mlist = KG.diffs(list);
  const p1 = await pass(simcPath, KG.text, mlist, 0.5, threads, tmp, log, fight, [est > LIMIT ? 0.25 : 0, 0.6], 'Pass 1/2 — all combinations');
  const best = p1.results.sort((a, b) => b.mean - a.mean).slice(0, topN);
  log(`>> Pass 2: ${best.length} best (high precision)`);
  const sub = best.map(b => list[b.idx]), msub = best.map(b => mlist[b.idx]);
  let p2 = await pass(simcPath, KG.text, msub, fine(0.1), threads, tmp, log, fight, [0.6, 0.75], 'Pass 2/2 — finalists');
  p2.results.sort((a, b) => b.mean - a.mean);
  // Crafted stats per finalist: all stat-pair combinations of the crafted pieces of the top 5 finalists, simulated together (exact for
  // diminishing returns between the two pieces), max 216 per finalist.
  if (pairs.length > 1) {
    const tests = [], owner = [];
    for (const r of p2.results.slice(0, 5)) {
      const d = sub[r.idx], cs = Object.entries(d).filter(([, it]) => famItems.has(famKey(it))); if (!cs.length) continue;
      let all = [{}];
      for (const [sl, it] of cs) { const next = []; for (const c of all) for (const a of famItems.get(famKey(it))) next.push({ ...c, [sl]: a }); all = next.slice(0, 216); }
      for (const c of all) { tests.push({ ...d, ...c }); owner.push(r.idx); }
    }
    if (tests.length) {
      log(`>> Crafted stats: ${tests.length} stat-pair combinations of the crafted pieces of the top finalists, simulated together`);
      const pc = await pass(simcPath, KG.text, KG.diffs(tests), fine(0.2), threads, tmp, log, fight, [0.75, 0.8], 'Crafted stats per finalist');
      const bestBy = new Map(); for (const x of pc.results) { const ow = owner[x.idx]; if (!bestBy.has(ow) || x.mean > bestBy.get(ow).mean) bestBy.set(ow, { mean: x.mean, d: tests[x.idx] }); }
      let changed = 0;
      for (const [i, b] of bestBy) if (JSON.stringify(b.d) !== JSON.stringify(sub[i])) { sub[i] = b.d; msub[i] = KG.diffs([b.d])[0]; changed++; }
      if (changed) {
        log(`>> Crafted stats: ${changed} finalist(s) get better stat pairs; finalists simulated again`);
        p2 = await pass(simcPath, KG.text, msub, fine(0.1), threads, tmp, log, fight, [0.8, 0.84], 'Finalists with their best crafted stats');
        p2.results.sort((a, b) => b.mean - a.mean);
      }
    }
  }
  // Consumables: ranked on the best combination; if one beats the current setup, the finalists are simulated again with it (a flask or
  // food can change which gear wins, through diminishing returns).
  let fin = p2, setText = KG.text, consumablesRank = [], consNote = '';
  if (CONS_KEYS.some(k => (o.consumables?.[k] || []).length) && p2.results.length) {
    const bestText = bis.withSet(KG.text, msub[p2.results[0].idx]);
    consumablesRank = await rankConsumables(simcPath, bestText, o.consumables, k => consInExport(text, k), { threads, tmp, log, fight, err: fine(0.2) }, [0.8, 0.88]);
    const pick = Object.fromEntries(consumablesRank.filter(c => c.options[0] && c.options[0].pct > 0.1).map(c => [c.slot, c.options[0].value]));
    if (Object.keys(pick).length) {
      consNote = Object.entries(pick).map(([k, v]) => `${k}: ${consInfo().label(v)}`).join(', ');
      log(`>> Finalists simulated again with ${consNote}`);
      setText = `${KG.text}\n${Object.entries(pick).map(([k, v]) => `${k}=${v}`).join('\n')}\n`;
      fin = await pass(simcPath, setText, msub, fine(0.1), threads, tmp, log, fight, [0.88, 0.94], 'Finalists with the best consumables');
      fin.results.sort((a, b) => b.mean - a.mean);
      for (const c of consumablesRank) if (pick[c.slot]) c.switched = true;
    }
  }
  // Enchants & gems (section "Enchants & gems"): optimised together on the best combination (each round: best move of every enchant slot
  // and of the gem plan, combined if that is better), then every finalist is simulated again with them. The enchant belongs to the slot,
  // the gems to the set. The baseline keeps your current enchants and gems, so the gains include the change.
  let gemsNote = '', enchNote = '', finDiffs = msub;
  const wantG = !!o.enhance?.gems, wantE = !!o.enhance?.ench;
  if ((wantG || wantE) && fin.results.length) {
    const S0 = { ...base, ...sub[fin.results[0].idx] }, ec = enhChoices(text, S0, rules), EDB = enhanceDb();
    const add = (o.enhance.add || []).flatMap(x => x === 'wrist' ? ['wrist', 'wrists'] : [x]).filter(x => enhLib.JEWELBINDER.includes(x));
    const gN = {}, eN = {}; for (const g of EDB.gems) for (const id of g.ids) gN[id] = g.name; for (const e of EDB.enchants) for (const id of e.ids) eN[id] = e.name;
    const octx = { ...KG.k, gemsOn: wantG && ec.gems.gems.length > 0, enchOn: wantE, add, isWeapon: it => weaponKind(rules.kindOf(tg.idOf(it))) };
    const st = {};
    if (wantE) for (const sl of Object.keys(ec.ench)) st['ench:' + sl] = enhLib.optOf(S0[sl], 'enchant_id') || '';
    const Mx = extra => enhLib.materialize({ ...S0, ...st, ...extra }, octx);
    let n = 0;
    if (octx.gemsOn) {
      n = enhLib.SOCKET_ORDER.reduce((a, x) => a + enhLib.socketsOf(x, Mx({ gems: '' })[x], KG.k.db, { add, base: KG.k.base }), 0);
      st.gems = enhLib.startPlan(enhLib.materialize(S0, KG.k), n, KG.k.db, ec.gems, KG.k.isD, { add, base: KG.k.base });
    }
    log(`>> Enchants & gems on the best combination:${wantE ? ` enchants for ${Object.keys(ec.ench).join(', ') || 'no slot'}` : ''}${octx.gemsOn ? ` · ${n} gem socket(s)${add.length ? ` (Radiant Jewelbinder on ${(o.enhance.add || []).join(', ')})` : ''}` : ''}`);
    for (let r = 1; r <= 6; r++) {
      const cur = Mx({}), moves = [];
      if (octx.gemsOn) for (const m of enhLib.planMoves(st.gems, n, ec.gems, KG.k.isD)) moves.push({ dim: 'gems', m: { gems: m } });
      if (wantE) for (const [sl, list] of Object.entries(ec.ench)) for (const e of list) if (String(e.id) !== st['ench:' + sl]) moves.push({ dim: sl, m: { ['ench:' + sl]: String(e.id) } });
      const sims = moves.map(x => ({ ...x, d: bis.diffOf(cur, Mx(x.m)) })).filter(x => Object.keys(x.d).length); if (!sims.length) break;
      const pe = await pass(simcPath, bis.withSet(setText, cur), sims.map(x => x.d), fine(0.2), threads, tmp, log, fight, [0.84 + 0.01 * (r - 1), 0.84 + 0.01 * r], `Enchants & gems — round ${r}`);
      const bestDim = new Map(); for (const x of pe.results) { const sm = sims[x.idx], g = x.mean - pe.base; if (g > 0.0005 * pe.base && (!bestDim.has(sm.dim) || g > bestDim.get(sm.dim).g)) bestDim.set(sm.dim, { g, m: sm.m }); }
      if (!bestDim.size) break;
      const single = [...bestDim.values()].sort((a, b) => b.g - a.g)[0];
      let pickM = single.m;
      if (bestDim.size > 1) {                              // all the best moves together, kept only if better than the best one alone
        const comb = Object.assign({}, ...[...bestDim.values()].map(v => v.m));
        const pcb = await pass(simcPath, bis.withSet(setText, cur), [bis.diffOf(cur, Mx(comb))], fine(0.2), threads, tmp, log, fight, [0.84 + 0.01 * r, 0.84 + 0.01 * r], `Enchants & gems — round ${r} combined`);
        if (pcb.results[0] && pcb.results[0].mean - pcb.base > single.g) pickM = comb;
      }
      Object.assign(st, pickM);
      log(`>> Enchants & gems round ${r}: ${Object.entries(pickM).map(([k, v]) => k === 'gems' ? 'gems ' + enhLib.gemsPlanLabel(v, gN) : `${k.slice(5)} ${eN[v] || v}`).join(', ')}`);
    }
    if (octx.gemsOn) gemsNote = enhLib.gemsPlanLabel(st.gems, gN);
    if (wantE) enchNote = Object.entries(st).filter(([k]) => /^ench:/.test(k)).map(([k, v]) => `${k.slice(5)}: ${v ? eN[v] || 'id ' + v : 'none'}`).join(', ');
    finDiffs = msub.map((d, i) => bis.diffOf(KG.MB, enhLib.materialize({ ...base, ...sub[i], ...st }, octx)));
    log(`>> Finalists simulated again with these enchants & gems`);
    fin = await pass(simcPath, setText, finDiffs, fine(0.1), threads, tmp, log, fight, [0.9, 0.95], 'Finalists with the best enchants & gems');
    fin.results.sort((a, b) => b.mean - a.mean);
  }
  const st = await statsPass(simcPath, setText, finDiffs, threads, tmp, log);
  const rows = fin.results.map(r => ({
    mean: r.mean, err: r.err, delta: r.mean - fin.base,
    items: Object.entries(sub[r.idx]).map(([slot, item]) => ({ slot, label: parsed.labels[item] || item, stats: st[r.idx]?.[slot], wh: whOf(item) }))
  }));
  const report = o.report === false || !rows.length ? null : await reportPass(simcPath, setText, finDiffs[fin.results[0].idx], fine(0.1), threads, tmp, log, fight, [0.95, 1], 'Creating the simc report');
  return { base: fin.base, total: list.length, rows, report, consumablesRank, consNote, gemsNote, enchNote };
}));

// ---------- Progression (tracks & sources) ----------
const progUser = () => path.join(app.getPath('userData'), 'progression.json');
const progDefault = () => path.join(__dirname, 'data', 'progression.json');
const loadProg = () => JSON.parse(fs.readFileSync(fs.existsSync(progUser()) ? progUser() : progDefault(), 'utf8'));
ipcMain.handle('prog:get', () => { const p = loadProg(); return { season: p.season, sources: Object.entries(p.sources).map(([id, s]) => ({ id, label: s.label })) }; });
ipcMain.handle('prog:edit', () => { if (!fs.existsSync(progUser())) fs.copyFileSync(progDefault(), progUser()); return shell.openPath(progUser()); });
function makeIlvlFor({ instanceIds, instanceSources, upgrade, ilvl }) {
  const prog = loadProg(), src = i => instanceSources?.[i] || 'custom';
  if (instanceIds.some(i => src(i) === 'custom') && !ilvl) throw new Error('Enter a custom item level, or pick a source for each instance.');
  const miss = new Set();
  const f = (iid, boss) => {
    if (src(iid) === 'custom') return { ilvl, label: '' };
    const s = prog.sources?.[src(iid)], r = resolveIlvl(prog, src(iid), boss, upgrade);
    if (r && s?.bossOverrides && !r.override) miss.add(`${boss} (${s.label}: ${r.label})`);
    return r || { ilvl, label: '' };
  };
  // Bosses without a per-boss item level in a source that has some: shown so a name mismatch with the game data is visible.
  f.warn = log => { if (miss.size) log(`>> Item level: no per-boss entry for ${[...miss].join(', ')} → the source's default rank is used. Check the names under "bossOverrides" (Edit tracks & sources).`); };
  return f;
}

// ---------- Best in Slot ----------
ipcMain.handle('sim:bis', run(async (o, tmp) => {
  const fine = fineOf(o);
  const { text, threads, fight, instanceIds, ilvl, armor, includeWeapons, instanceSources, upgrade, consumables, catalyst, crafted, maxRounds = 5 } = o;
  const enh = o.enhance || {};                          // { ench: bool, gems: bool, add: [jewelbinder slots] }
  let consFrom = Math.max(1, Math.floor(+o.consFrom) || 2);   // consumables, enchants and gems join the search from this round (gear first)
  const { simcPath } = loadSettings();
  if (!simcPath) throw new Error('Select the simc binary first.');
  saveSettings({ ...loadSettings(), fight, threads, precision: o.precision });
  const log = emitLog;
  const parsed = tg.parse(text), base = tg.baseSlots(parsed.equipped), rules = mkRules(text), dual = isDual(base, rules);
  tg.titanPools(parsed, rules);
  if (!Object.keys(base).length) throw new Error('No equipped gear detected in the export.');
  let lootItems = [];
  if (instanceIds?.length) {
    const L = loadLoot(); if (!L) throw new Error('No loot data: click “Update loot data”.');
    const ilvlFor = makeIlvlFor({ instanceIds, instanceSources, upgrade, ilvl });
    const lootSkipped = [];
    lootItems = loot.select(L, { primary: specs.primaryOf(text), primOf: itemsDb().prim, titan: rules.titan, dual, instanceIds, armor: specs.armorOf(text) || armor, includeWeapons, weapons: weaponsFor(text), shield: specs.canShield(text), ilvlFor, noSec: itemsDb().noSec, skipped: lootSkipped });
    ilvlFor.warn(log); logSkipped(lootSkipped, log);
    trace(`-- Loot candidates (${lootItems.length}): item (item level) · slots · sources`);
    for (const it of lootItems) trace(`   ${it.name} (${it.ilvl}) · ${it.slots.join('/')} · ${it.sources.join('; ')}`);
  }
  const consLabels = {};
  for (const arr of Object.values(loadLoot()?.consumables || {})) for (const o of arr) consLabels[o.value] = o.label.replace(/ \(rank (\d), guessed\)/, ' (rank $1)');
  let cands = bis.buildCandidates(parsed, lootItems, ilvl, rules, base, consumables, consLabels);
  let tierSet = null;
  const cv = craftedVariants(crafted, text, { base, dual });
  if (cv.length) { cands = bis.addCrafted(cands, cv, rules); log(`>> Crafted: ${cv.length} crafted variants added as candidates`); }
  tierSet = tierLib.setup(catalyst, text, loadLoot()?.tierSets, rules, loadProg().tier);
  if (tierSet) {
    const n0 = cands.length; cands = bis.addCatalyst(cands, tierSet, rules);
    log(`>> Catalyst: ${cands.length - n0} tier twins of “${tierSet.name}” (${tierSet.tier})${rules.maxCat < Infinity ? `, max ${rules.maxCat} charges` : ''}`);
  }
  // ---- Enchants & gems: pseudo-slots "ench:<slot>" (enchant id) and "gems" (gem plan) of the logical set S, turned into simc item
  // strings by enhLib.materialize. The enchant belongs to the slot (it follows a new piece); gems fill the sockets of the whole set.
  const EDB = enhanceDb(), CK = ['flask', 'food', 'potion', 'augmentation'];
  const ec = (enh.ench || enh.gems) ? enhChoices(text, base, rules) : null;
  const gemNames = {}, enchNames = {}, diaIds = new Set();
  for (const g of EDB.gems) for (const id of g.ids) { gemNames[id] = g.name; if (g.diamond) diaIds.add(String(id)); }
  for (const e of EDB.enchants) for (const id of e.ids) enchNames[id] = e.name;
  const isD = id => diaIds.has(String(id));
  const gemsOn = !!(enh.gems && ec?.gems.gems.length);
  const ctx = { db: EDB, enchOn: !!enh.ench, gemsOn, add: (enh.add || []).flatMap(s => s === 'wrist' ? ['wrist', 'wrists'] : [s]).filter(s => enhLib.JEWELBINDER.includes(s)), base: itemsDb().baseSockets, isD, isWeapon: it => weaponKind(rules.kindOf(tg.idOf(it))) };
  { const kc = enhLib.keepCtx(base, EDB, itemsDb().baseSockets, isD); ctx.keepPlan = kc.keepPlan; ctx.keepAdd = kc.keepAdd; if (kc.filled > 0 && kc.keepPlan) log(`>> Gems: ${kc.filled} empty socket(s) in your gear filled with your most common gem.`); }
  const M = S => enhLib.materialize(S, ctx);
  let S = { ...base };
  // consumables already in the export are the starting point of their category (not "Current setup" -> the same flask)
  for (const k of CK) { const v = (new RegExp(`^\\s*${k}\\s*=\\s*([\\w:.\\-]+)\\s*$`, 'm').exec(text) || [])[1]; if (v && consumables?.[k]?.length) S[k] = v; }
  if (ctx.enchOn) for (const [slot, list] of Object.entries(ec.ench)) {
    S['ench:' + slot] = enhLib.optOf(base[slot], 'enchant_id') || '';
    for (const e of list) cands.push({ key: `ench:${slot}|${e.id}`, slot: 'ench:' + slot, item: String(e.id), label: e.name, src: 'Enchant' });
  }
  if (ctx.enchOn) log(`>> Enchants: ${Object.entries(ec.ench).map(([s, l]) => `${s} ${l.length}`).join(', ') || 'none for this character'}`);
  if (gemsOn) log(`>> Gems: ${ec.gems.gems.length} gems, ${ec.gems.diamonds.length} diamonds${enh.add?.length ? ` · Radiant Jewelbinder socket on ${enh.add.join(', ')}` : ''}`);
  const isEnh = slot => CK.includes(slot) || /^ench:/.test(slot) || slot === 'gems';
  const labels = {}; for (const c of cands) labels[c.item] = c.label; for (const [i, l] of Object.entries(parsed.labels)) labels[i] ||= l;
  const srcMap = {}; for (const c of cands) srcMap[c.item] ||= c.src;
  const srcAt = (slot, i) => !i ? '' : i === base[slot] ? 'Equipped' : srcMap[i] || '';
  const lab = i => (i ? labels[i] || i.replace(/^,?id=/, 'id ') : '(empty)');
  const labOf = (slot, i) => /^ench:/.test(slot) ? (i ? enchNames[i] || `enchant ${i}` : 'no enchant') : slot === 'gems' ? (i === undefined ? 'current gems' : enhLib.gemsPlanLabel(i, gemNames)) : CK.includes(slot) && !i ? 'Current setup' : lab(i);
  const pct = x => x / (x + 1.5);                       // avancement asymptotique (nombre de tours inconnu)
  const rng = (r, a, b) => [pct(r - 1 + a), pct(r - 1 + b)];
  const conv = drLib.perPct(levelOf(text));
  if (!conv) log(`>> Diminishing returns: rating conversions are only known for level 90 (export says ${levelOf(text) || 'no level'}): DR-aware steps skipped.`);
  const STATS_OUT = ['profileset_output_data=stats'];
  // logical diffs -> simc diffs from the current set; empty ones (e.g. an enchant on an empty slot) are dropped
  const realDiffs = (S, diffs) => { const MS = M(S); return diffs.map(d => bis.diffOf(MS, M(bis.apply(S, d, rules)))); };
  // Tier ids of the class (also without Catalyst: tier pieces from bags/loot) for the tier-aware pairs.
  const tierIds = (tierSet || tierLib.pickSet(loadLoot()?.tierSets, tierLib.classOf(text), loadProg().tier))?.slots || null;
  const pctOf = (g, b) => `${g >= 0 ? '+' : ''}${(g / b * 100).toFixed(2)} %`;
  const descr = d => Object.entries(d).map(([s, v]) => `${s}: ${labOf(s, v)}`).join(' + ');
  // Candidates dropped as clearly worse are re-tested against the final set before stopping (the set may have changed in a way that
  // makes them good, e.g. the tier bonus moved to other slots). A sweep happens at most once per distinct set.
  let dropped = [], sweptAt = null, limit = maxRounds; const hardLimit = maxRounds + 3;
  const sweep = (why, r) => {
    const k = JSON.stringify(S); if (!dropped.length || sweptAt === k || r >= hardLimit) return false;
    sweptAt = k; const have = new Set(cands.map(c => c.key)); cands = cands.concat(dropped.filter(c => !have.has(c.key)));
    log(`>> ${why}: re-testing ${dropped.length} candidate(s) dropped earlier against the current set.`); dropped = [];
    if (r >= limit) limit = r + 1; return true;
  };
  let startDps = null, dps = null; const rounds = [];
  for (let r = 1; r <= limit; r++) {
    const enhNow = r >= consFrom, pending = !enhNow && (cands.some(c => isEnh(c.slot)) || gemsOn);
    const later = why => { log(`>> ${why}: adding consumables, enchants & gems from round ${r + 1}.`); consFrom = r + 1; };
    if (gemsOn && enhNow) {                             // gem plan moves, regenerated from the current plan and socket count
      const n = enhLib.SOCKET_ORDER.reduce((a, s) => a + enhLib.socketsOf(s, M(S)[s], EDB, { add: ctx.add, base: ctx.base }), 0);
      const start = S.gems !== undefined ? S.gems : enhLib.startPlan(M(S), n, EDB, ec.gems, isD, { add: ctx.add, base: ctx.base });
      const plans = [...new Set([...(S.gems === undefined ? [start] : []), ...enhLib.planMoves(start, n, ec.gems, isD)])];
      cands = cands.filter(c => c.slot !== 'gems').concat(plans.map(p => ({ key: 'gems|' + p, slot: 'gems', item: p, label: enhLib.gemsPlanLabel(p, gemNames), src: 'Gems' })));
      for (const c of cands) if (c.slot === 'gems') labels[c.item] = c.label;
    }
    const act = enhNow ? cands : cands.filter(c => !isEnh(c.slot));
    const entries = [], seen = new Set();
    for (const c of act) for (const d of bis.expand(S, c, act, rules)) {
      const k = JSON.stringify(d); if (seen.has(k)) continue; seen.add(k); entries.push({ diff: d, from: c });
    }
    const MS = M(S), text2 = bis.withSet(text, MS);
    realDiffs(S, entries.map(e => e.diff)).forEach((md, i) => { entries[i].md = md; });
    const sim = entries.filter(e => Object.keys(e.md).length);
    if (!sim.length) { if (pending) { later('Nothing left to change in the gear'); continue; } if (sweep('Nothing left to change', r)) continue; break; }
    const grp = tierSet ? 0.5 : 0.7;
    log(`>> Round ${r}: scanning ${sim.length} options (${act.length} candidates)`);
    const p1 = await pass(simcPath, text2, sim.map(e => e.md), 0.4, threads, tmp, log, fight, rng(r, 0, grp), `Round ${r} — scanning ${sim.length} options`, STATS_OUT);
    if (startDps === null) startDps = dps = p1.base;
    const baseR = drLib.ratingsOf(p1.baseStats);
    for (const x of p1.results) { const e = sim[x.idx]; e.gain = x.mean - p1.base; e.d = drLib.delta(drLib.ratingsOf(x.st), baseR); }
    // Tier-aware pairs: a non-tier piece replacing a set piece, together with a tier piece in another tier slot (keeps the set bonus).
    const tsw = bis.tierSwaps(S, sim, rules, tierIds).filter(p => !seen.has(JSON.stringify(p.diff)));
    if (tsw.length) {
      log(`>> Round ${r}: testing ${tsw.length} non-tier piece + tier piece elsewhere pairs (keeps the set bonus)`);
      const pt = await pass(simcPath, text2, realDiffs(S, tsw.map(p => p.diff)), 0.4, threads, tmp, log, fight, rng(r, grp - 0.1, grp), `Round ${r} — tier pairs`, STATS_OUT);
      for (const x of pt.results) { const p = tsw[x.idx]; seen.add(JSON.stringify(p.diff)); sim.push({ diff: p.diff, from: p.from, gain: x.mean - pt.base, d: drLib.delta(drLib.ratingsOf(x.st), baseR) }); }
    }
    if (tierSet) {                                        // bonus de set : conversions groupées de 2 à 5 pièces
      const groups = bis.tierGroups(S, sim, rules).filter(d => !seen.has(JSON.stringify(d)));
      if (groups.length) {
        log(`>> Round ${r}: testing ${groups.length} tier groups`);
        const pg = await pass(simcPath, text2, realDiffs(S, groups), 0.4, threads, tmp, log, fight, rng(r, grp, 0.62), `Round ${r} — tier groups`, STATS_OUT);
        for (const x of pg.results) sim.push({ diff: groups[x.idx], from: { key: 'tier-group' }, gain: x.mean - pg.base, d: drLib.delta(drLib.ratingsOf(x.st), baseR) });
      }
    }
    // Diminishing returns: a consumable and a gear/enchant/gem change that move the same stat inside the DR zone do not add up, so the
    // best such pairs are simulated together (a different flask can make a different piece of gear the better one).
    if (enhNow && conv && baseR) {
      const isCons = e => Object.keys(e.diff).every(k => CK.includes(k)), moved = e => e.d && drLib.STATS.some(s => Math.abs(e.d[s]) >= 1);
      const G = sim.filter(e => e.gain !== undefined && moved(e) && !isCons(e) && e.gain > -0.005 * p1.base).sort((a, b) => b.gain - a.gain).slice(0, 10);
      const C = sim.filter(e => e.gain !== undefined && moved(e) && isCons(e));
      const pairs = bis.drPairs(S, G, C, rules, baseR, conv, drLib.interacts, 40).filter(p => !seen.has(JSON.stringify(p.diff)));
      if (pairs.length) {
        log(`>> Round ${r}: ${pairs.length} gear + consumable pairs move the same stat in diminishing returns (${[...new Set(pairs.flatMap(p => p.shared))].join(', ')}): simulated together`);
        const pp = await pass(simcPath, text2, realDiffs(S, pairs.map(p => p.diff)), 0.4, threads, tmp, log, fight, rng(r, 0.62, 0.7), `Round ${r} — DR pairs`, STATS_OUT);
        for (const x of pp.results) sim.push({ diff: pairs[x.idx].diff, from: { key: 'dr-pair' }, gain: x.mean - pp.base, d: drLib.delta(drLib.ratingsOf(x.st), baseR) });
      }
    }
    if (cands.length > 40) {                              // élagage : on abandonne les candidats clairement mauvais
      const good = new Set(sim.filter(e => e.gain > -0.015 * p1.base).map(e => e.from.key));
      const keep = cands.filter(c => good.has(c.key) || S[c.slot] === c.item || c.twin || c.slot === 'gems' || (isEnh(c.slot) && !enhNow));
      if (keep.length < cands.length) {
        const gone = cands.filter(c => !keep.includes(c)); dropped = dropped.concat(gone);
        log(`>> Set aside ${gone.length} clearly worse candidates (re-tested before the end)`);
        for (const c of gone) trace(`   set aside: ${c.slot}: ${c.label || c.item}`);
        cands = keep;
      }
    }
    trace(`-- Round ${r}: all options, gain vs the current set (${Math.round(p1.base)} DPS, ±0.4 % precision)`);
    for (const e of sim.filter(e => e.gain !== undefined).sort((a, b) => b.gain - a.gain)) trace(`   ${pctOf(e.gain, p1.base).padStart(9)}  ${descr(e.diff)}`);
    // Two upgrade orders validated together: greedy, and DR-aware (never stacks two changes measured separately on the same DR-zone stat).
    const ok = sim.filter(e => e.gain !== undefined), minG = 0.0005 * p1.base;
    const chains = [bis.pickWinners(S, ok, rules, minG, 12)];
    if (conv && baseR) chains.push(bis.pickWinners(S, ok, rules, minG, 12, e => drLib.drStats(baseR, e.d, conv)));
    const pre = [], seenP = new Set();
    chains.forEach((W, ci) => W.forEach((w, i) => { const md = bis.diffOf(MS, M(w.after)), k = JSON.stringify(md); if (Object.keys(md).length && !seenP.has(k)) { seenP.add(k); pre.push({ W, i, ci, md }); } }));
    if (!pre.length) { if (pending) { later('No further gear upgrade'); continue; } if (sweep('No further upgrade', r)) continue; log('>> No further upgrade found.'); break; }
    const p2 = await pass(simcPath, text2, pre.map(x => x.md), fine(0.1), threads, tmp, log, fight, rng(r, 0.7, 1), `Round ${r} — validating ${pre.length} upgrade sets`);
    if (r === 1) startDps = p2.base;
    const top = p2.results.sort((a, b) => b.mean - a.mean)[0];
    trace(`-- Round ${r}: validated upgrade sets (${Math.round(p2.base)} DPS)`);
    for (const x of p2.results) trace(`   ${pctOf(x.mean - p2.base, p2.base).padStart(9)}  ${pre[x.idx].ci ? '[DR-aware] ' : ''}${pre[x.idx].W.slice(0, pre[x.idx].i + 1).map(w => descr(w.entry.diff)).join(' | ')}`);
    if (!top || top.mean - p2.base < 0.0015 * p2.base) { dps = p2.base; if (pending) { later('Gear gains are within noise'); continue; } if (sweep('Gains within noise', r)) continue; log('>> Remaining gains are within noise: stopping.'); break; }
    const pk = pre[top.idx];
    if (pk.ci === 1) log('>> Kept the DR-aware upgrade order (stacking same-stat changes would have overestimated the gain).');
    const changes = pk.W.slice(0, pk.i + 1).map(w => Object.entries(w.entry.diff).map(([slot, to]) => ({ slot, from: labOf(slot, S[slot]), to: labOf(slot, to), src: isEnh(slot) && !CK.includes(slot) ? '' : srcAt(slot, to) }))).flat();
    rounds.push({ round: r, from: p2.base, to: top.mean, changes });
    log(`>> Round ${r}: +${Math.round(top.mean - p2.base)} DPS with ${changes.length} change(s)`);
    S = pk.W[pk.i].after; dps = top.mean;
    if (r === limit) sweep('Last round', r);
  }
  log('>> Final check of the selected set');
  const MF = M(S), setText = bis.withSet(text, MF);
  const repTmp = path.join(tmp, 'report.html'); fs.rmSync(repTmp, { force: true });
  const fin = await pass(simcPath, setText, [], fine(0.05), threads, tmp, log, fight, [0.92, 0.96], 'Final check', o.report === false ? [] : [`html=${repTmp}`]);
  const report = o.report === false ? null : keepReport(repTmp);
  if (startDps === null || !rounds.length) startDps = fin.base;   // sans amélioration : même précision des deux côtés
  dps = fin.base;
  const gear = extractGear(fin.data.sim.players[0]);
  const raw = path.join(app.getPath('userData'), 'last-bis-result.json');
  try { fs.copyFileSync(path.join(tmp, 'out.json'), raw); } catch {}
  const statsNote = Object.keys(gear).length ? '' : `Per-item stats were not found in simc's JSON output (gear keys: ${Object.keys(fin.data.sim.players[0].gear || {}).slice(0, 6).join(', ') || 'none'}). Raw output saved to ${raw}`;
  const dr = drLib.summary(fin.baseStats, levelOf(text));
  // Consumables: every ticked option of each category simulated on the final set, best first (the chosen one is the top line).
  const consWh = consInfo().wh;
  const consumablesRank = await rankConsumables(simcPath, setText, consumables, k => S[k], { threads, tmp, log, fight, err: fine(0.2) }, [0.96, 0.99]);
  sendProgress({ pct: 1, label: 'Done' });
  const enhTxt = it => { const e = enhLib.optOf(it, 'enchant_id'), g = enhLib.gemsIn(it); return [e ? `Enchant: ${enchNames[e] || 'id ' + e}` : '', g.length ? `Gems: ${g.map(x => gemNames[x] || 'id ' + x).join(', ')}` : ''].filter(Boolean).join(' · '); };
  const slots = Object.keys({ ...base, ...MF }).filter(s => !isEnh(s) || CK.includes(s));
  const set = slots.sort((a, b) => (CK.includes(a) - CK.includes(b)) || a.localeCompare(b)).map(slot => ({ slot, label: labOf(slot, S[slot]), changed: (S[slot] || '') !== (base[slot] || ''), from: labOf(slot, base[slot]), src: srcAt(slot, S[slot]), stats: gear[slot] || null, wh: CK.includes(slot) ? consWh(S[slot]) : whOf(MF[slot]),
    enh: CK.includes(slot) ? '' : enhTxt(MF[slot]), enhChanged: !CK.includes(slot) && enhTxt(MF[slot]) !== enhTxt(base[slot]) }));
  return { start: startDps, final: dps, rounds, set, statsNote, consumablesRank, report, dr };
}));

// ---------- Droptimizer ----------
const lootFile = () => path.join(app.getPath('userData'), 'loot.json');
let lootCache = { key: '', data: null };   // loot.json peut peser plusieurs Mo : relu seulement s'il a changé
const loadLoot = () => {
  try { const f = lootFile(), st = fs.statSync(f), k = `${f}|${st.mtimeMs}|${st.size}`; if (lootCache.key !== k) lootCache = { key: k, data: JSON.parse(fs.readFileSync(f, 'utf8')) }; return lootCache.data; }
  catch { return null; }
};
ipcMain.handle('loot:info', () => {
  const l = loadLoot(); if (!l) return null;
  const tiers = Object.entries(l.tiers || {}).map(([id, t]) => ({ id, name: t.name, instances: t.instances }))
    .sort((a, b) => (/season/i.test(b.name) - /season/i.test(a.name)) || (b.id - a.id));
  // "This season": the Journal's Current Season tier plus every instance that has one of the bosses named in progression.json
  const bosses = new Set(Object.values(loadProg().sources).flatMap(s => Object.keys(s.bossOverrides || {})));
  const cur = tiers.find(t => /current season/i.test(t.name)), inSeason = new Set(cur ? cur.instances : []);
  for (const [id, i] of Object.entries(l.instances)) if (Object.values(i.bosses).some(b => bosses.has(b.name.toLowerCase()))) inSeason.add(id);
  // The Journal's Current Season tier still lists last season's raids: drop raids whose drops only use other seasons' upgrade tracks.
  const P = loadProg(), curGroups = new Set(Object.keys(P.upgradeTracks || JSON.parse(fs.readFileSync(progDefault(), 'utf8')).upgradeTracks || {}).map(Number));
  const known = new Set(Object.values(enhanceDb().upgrade || {}).map(v => v[0])), oldSeason = [];
  if (curGroups.size && known.size) for (const id of [...inSeason]) if (l.instances[id]?.type === 2 && loot.seasonOf(l.instances[id].groups, curGroups, known) === 'old') { inSeason.delete(id); oldSeason.push(l.instances[id].name); }
  if (inSeason.size) tiers.unshift({ id: 'season', name: `This season (${P.season})`, instances: [...inSeason], left: Object.values(l.instances).some(i => i.groups) ? oldSeason.sort() : null });
  const R = loadCraftRules(), key = n => (l.embellishments || []).find(e => e.name.toLowerCase() === n)?.name;
  const craftedInfo = { items: (l.crafted || []).length + (R.extraItems || []).length, ilvl: R.ilvl, pairs: R.statPairs,
    emb: Object.entries(R.embellishments || {}).filter(([n]) => !(l.embellishments || []).length || key(n)).map(([n, v]) => ({ name: key(n) || n, slots: v.slots, unverified: (R.unverified || []).includes(n) })) };
  return { crafted: craftedInfo, builtAt: l.builtAt, hasTier: !!l.tierSets?.length, weapons: loot.WEAPONS, tiers, consumables: !l.consumables ? null : Object.fromEntries(Object.entries(l.consumables).map(([k, v]) => [k, loot.combatOnly(l.consVer ? v : v.filter(o => !/guessed/.test(o.label)))])),   // profession phials hidden (also in older loot.json)
    instances: Object.entries(l.instances).map(([id, i]) => ({ id, name: i.name, items: Object.values(i.bosses).reduce((n, b) => n + b.items.length, 0) }))
      .sort((a, b) => b.id - a.id) };
});
ipcMain.handle('loot:update', async () => {
  const log = emitLog;
  const names = { instance: 'JournalInstance', encounter: 'JournalEncounter', encItem: 'JournalEncounterItem', item: 'Item', sparse: 'ItemSparse', tier: 'JournalTier', tierX: 'JournalTierXInstance' };
  const wago = n => `https://wago.tools/db2/${n}/csv`, t = {};
  for (const [k, n] of Object.entries(names)) { log(`>> Downloading ${n}…`); t[k] = await download(wago(n), n); }
  // Données annexes : un échec désactive seulement la fonction concernée (Catalyst, objets artisanaux, règles d'équipement).
  const optional = async (label, url, off) => { try { log(`>> Downloading ${label}…`); return await download(url, label); } catch (e) { log(`>> ${e.message}${off ? ` — ${off}` : ''}`); return null; } };
  t.sets = await optional('tier set data (simc)', tierLib.SETS_URL, 'Catalyst disabled until the next update');
  t.embs = await optional('embellishment table (simc)', craftedLib.EMB_URL, 'embellishments are not detected automatically');
  t.skill = await optional('SkillLineAbility (recipes)', wago('SkillLineAbility'), 'crafted base items come from “extraItems” only');
  t.effects = t.skill && await optional('SpellEffect (recipes, large file)', wago('SpellEffect'), 'crafted base items come from “extraItems” only');
  if (!t.skill || !t.effects) { delete t.skill; delete t.effects; }
  // Bonus trees: tell which season a raid belongs to (its drops' upgrade tracks). Optional: without them "This season" uses the Journal only.
  for (const [k, n] of [['map', 'Map'], ['xTree', 'ItemXBonusTree'], ['treeNode', 'ItemBonusTreeNode'], ['bonus', 'ItemBonus']]) { t[k] = await optional(`${n} (season detection)`, wago(n), '“This season” uses the Adventure Guide only'); if (!t[k]) break; }
  if (!t.map || !t.xTree || !t.treeNode || !t.bonus) { delete t.map; delete t.xTree; delete t.treeNode; delete t.bonus; }
  // simc's item data first: crafting qualities decide the valid consumable names (_2, _3 suffixes), tier/2H/embellishment data come from it too.
  const itemsTxt = await optional('item data (simc, ~26 MB)', itemsLib.ITEMS_URL, 'keeping the bundled copy');
  const itemsJ = itemsTxt && itemsLib.parse(itemsTxt, []);
  if (itemsJ) t.cq = itemsJ.cq;
  log('>> Building loot database…');
  let built;
  try { built = loot.build(t); }
  catch (e) {
    if (!t.skill) throw e;
    log(`>> Recipe tables could not be read (${e.message}): building without crafted base items.`);
    delete t.skill; delete t.effects; built = loot.build(t);
  }
  writeJson(lootFile(), built);
  // Enchants, gems and socket bonuses for "Enchants & gems" (Best in Slot) and for carrying gems onto new pieces.
  const enhT = {}; for (const [k, u] of Object.entries(enhLib.URLS)) { enhT[k] = await optional(`${k === 'perm' ? 'enchant list' : k === 'ie' ? 'enchant effects' : k === 'gemData' ? 'gem data' : 'item bonus data'} (simc)`, u, 'keeping the bundled enchant/gem data'); if (!enhT[k]) break; }
  if (itemsTxt && Object.keys(enhLib.URLS).every(k => enhT[k])) {
    try { const db = enhLib.build({ ...enhT, itemData: itemsTxt }); if (db.enchants.length && db.gems.length) { writeJson(path.join(app.getPath('userData'), 'enhance.json'), db); log(`>> Enchants & gems ready (${db.enchants.length} enchants, ${db.gems.length} gems).`); } else log('>> Enchant/gem data looked incomplete: keeping the bundled copy.'); }
    catch (e) { log(`>> Enchant/gem data could not be read (${e.message}): keeping the bundled copy.`); }
  }
  if (itemsJ) {
    const { cq, ...j } = itemsJ; j.embBonusIds = (built.embellishments || []).map(e => String(e.bonusId));
    if (j.two.length > 1000) { writeJson(path.join(app.getPath('userData'), 'items.json'), j); log(`>> Item data ready (build ${j.build}, ${j.two.length} two-handers).`); }
    else log('>> Item data looked incomplete: keeping the bundled copy.');
  }
  log(`>> Crafted base items found: ${built.crafted.length} · embellishments in simc table: ${built.embellishments.length}`);
  log('>> Loot database ready.');
  return true;
});
ipcMain.handle('sim:drop', run(async (o, tmp) => {
  const { text, threads, instanceIds, ilvl, armor, includeWeapons, weapons, fight, instanceSources, upgrade, catalyst, crafted } = o, fine = fineOf(o);
  saveSettings({ ...loadSettings(), fight, threads, precision: o.precision });
  const { simcPath } = loadSettings();
  if (!simcPath) throw new Error('Select the simc binary first.');
  const L = loadLoot(); if (!L) throw new Error('No loot data: click “Update loot data”.');
  if (!instanceIds?.length) throw new Error('Select at least one instance.');
  const log = emitLog;
  const parsed = tg.parse(text), base = tg.baseSlots(parsed.equipped);
  if (!Object.keys(base).length) throw new Error('No equipped gear detected in the export.');
  const rules = mkRules(text), titan = rules.titan, dual = isDual(base, rules);
  const ilvlFor = makeIlvlFor({ instanceIds, instanceSources, upgrade, ilvl });
  const lootSkipped = [];
  const items = loot.select(L, { primary: specs.primaryOf(text), primOf: itemsDb().prim, titan, dual, instanceIds, armor: specs.armorOf(text) || armor, includeWeapons, weapons: weaponsFor(text), shield: specs.canShield(text), ilvlFor, noSec: itemsDb().noSec, skipped: lootSkipped });
  ilvlFor.warn(log); logSkipped(lootSkipped, log);
  const tierSet = tierLib.setup(catalyst, text, L.tierSets, rules, loadProg().tier);
  // Gems follow the slot like the enchant: the new piece gets the replaced piece's gems if it has (or can get) sockets.
  const KG = keepGems(text, base, log);
  const list = [], meta = [];
  for (const it of items) for (const slot of it.slots) {
    const cur = base[slot]; if (!cur) continue;
    const other = { finger1: 'finger2', finger2: 'finger1', trinket1: 'trinket2', trinket2: 'trinket1' }[slot];
    if (other && base[other] && tg.idOf(base[other]) === String(it.id)) continue; // unique-equipped
    const ench = (/enchant_id=\d+/.exec(cur) || [''])[0];
    const diff = { [slot]: `,id=${it.id},ilevel=${it.ilvl}${ench ? ',' + ench : ''}` };
    if (it.twoHand && !titan && base.off_hand) diff.off_hand = '';
    list.push(diff); meta.push({ it, slot });
    const tw = tierSet && rules.maxCat >= 1 && tierSet.slots[slot] ? tierLib.twin(diff[slot], tierSet.slots[slot]) : null;
    if (tw) { list.push({ ...diff, [slot]: tw }); meta.push({ it, slot, twin: true }); }
  }
  for (const v of craftedVariants(crafted, text, { dual })) {
    const cur = base[v.slot]; if (!cur) continue;
    const other = { finger1: 'finger2', finger2: 'finger1', trinket1: 'trinket2', trinket2: 'trinket1' }[v.slot];
    if (other && base[other] && tg.idOf(base[other]) === tg.idOf(v.item)) continue;
    const ench = (/enchant_id=\d+/.exec(cur) || [''])[0], diff = { [v.slot]: v.item + (ench ? ',' + ench : '') };
    if (v.twoHand && !titan && base.off_hand) diff.off_hand = '';
    list.push(diff); meta.push({ it: { id: 'c' + list.length, name: v.label, ilvl: '', sources: ['Crafted'], fullName: v.label }, slot: v.slot });
  }
  if (!list.length) throw new Error('No eligible item with these filters.');
  log(`>> ${list.length} simulations for ${items.length} items`);
  const mlist = KG.diffs(list);
  const p = await pass(simcPath, KG.text, mlist, fine(0.1), threads, tmp, log, fight, [0, 0.85], 'Simulating drops');
  const best = new Map();
  for (const r of p.results) {
    const { it, slot, twin } = meta[r.idx], bk = it.id + '@' + it.ilvl + (twin ? '#c' : ''), prev = best.get(bk);
    if (!prev || r.mean > prev.mean) best.set(bk, { id: it.id, name: it.fullName || `${it.name} (${it.ilvl})${twin ? ' → tier (catalyst)' : ''}`, slot, sources: [...new Set(it.sources)], mean: r.mean, err: r.err, diff: mlist[r.idx] });
  }
  const rows = [...best.values()].sort((a, b) => b.mean - a.mean)
    .map(r => ({ ...r, delta: r.mean - p.base, pct: (r.mean / p.base - 1) * 100 }));
  const top = rows.slice(0, 40), st = await statsPass(simcPath, KG.text, top.map(r => r.diff), threads, tmp, log);
  top.forEach((r, i) => { if (st[i]?.[r.slot]) r.stats = st[i][r.slot]; });
  rows.forEach(r => { r.wh = whOf(r.diff?.[r.slot]); });
  const report = o.report === false || !rows.length ? null : await reportPass(simcPath, KG.text, rows[0].diff, fine(0.1), threads, tmp, log, fight, [0.85, 1], 'Creating the simc report');
  rows.forEach(r => delete r.diff);
  return { base: p.base, total: list.length, rows, report };
}));

app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1180, height: 820, title: 'Polygnome', icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\/www\.wowhead\.com\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile('renderer/index.html');
});
app.on('window-all-closed', () => { child?.kill(); app.quit(); });
