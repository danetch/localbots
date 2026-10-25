const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const D = require('../lib/datafiles');

test('data manifest matches the files in data/ (run: node tools/make-data.js)', () => {
  const man = require('../data/manifest.json'), data = path.join(__dirname, '..', 'data');
  for (const [rel, h] of Object.entries(man.files)) assert.strictEqual(D.sha(fs.readFileSync(path.join(data, rel))), h, rel + ' changed: run node tools/make-data.js');
  const fights = fs.readdirSync(path.join(data, 'fights')).filter(f => f.endsWith('.json'));
  for (const f of fights) assert.ok(man.files['fights/' + f], 'fights/' + f + ' missing from the manifest');
  assert.strictEqual(man.minApp, require('../package.json').dataMinApp);
  const hashes = new Set(require('../data/shipped-hashes.json'));
  for (const f of fights) assert.ok(D.shippedCopy(fs.readFileSync(path.join(data, 'fights', f), 'utf8'), hashes), f + ' not in shipped-hashes.json');
});

test('versions compare numerically, pre-releases before releases', () => {
  assert.ok(D.cmpVer('0.10.0', '0.9.9') > 0); assert.ok(D.cmpVer('0.5.0-beta.2', '0.5.0') < 0);
  assert.ok(D.cmpVer('0.5.0-beta.10', '0.5.0-beta.2') > 0); assert.strictEqual(D.cmpVer('0.5.0', '0.5.0'), 0);
});

test('downloaded data: newer manifest replaces changed files only, invalid or too-new data is refused, cache older than the app is ignored', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-data-')), bundled = path.join(tmp, 'app'), cache = path.join(tmp, 'cache');
  const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  const season = JSON.stringify({ season: { id: 'MID2' }, expansion: { qualityRanks: 2 } }), fight = n => JSON.stringify({ id: 'x', name: 'X' + n, mechanics: {}, difficulties: { h: {} } });
  write(bundled, 'season.json', season); write(bundled, 'fights/x.json', fight(1));
  write(bundled, 'manifest.json', JSON.stringify({ generated: '2026-10-01', minApp: '0.5.0', files: { 'season.json': D.sha(Buffer.from(season)), 'fights/x.json': D.sha(Buffer.from(fight(1))) } }));
  const remote = {}, man = (gen, minApp, files) => { remote['manifest.json'] = JSON.stringify({ generated: gen, minApp, files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, D.sha(Buffer.from(v))])) }); Object.assign(remote, files); };
  const fetchText = async url => { const rel = url.replace('https://x/', ''); if (!(rel in remote)) throw new Error('404 ' + rel); return remote[rel]; };
  const df = D.create({ bundled, cache, appVersion: '0.5.0' });
  assert.strictEqual(df.file('fights/x.json'), path.join(bundled, 'fights/x.json'));
  man('2026-10-01', '0.5.0', { 'season.json': season, 'fights/x.json': fight(1) });
  assert.strictEqual((await df.refresh('https://x/', fetchText)).skipped, 'up to date');
  man('2026-10-20', '0.5.0', { 'season.json': season, 'fights/x.json': fight(2) });
  const r = await df.refresh('https://x/', fetchText);
  assert.deepStrictEqual(r.updated, ['fights/x.json']);                                   // season.json unchanged: not downloaded
  assert.strictEqual(JSON.parse(fs.readFileSync(df.file('fights/x.json'), 'utf8')).name, 'X2');
  assert.strictEqual(df.info().from, 'download');
  man('2026-10-21', '0.6.0', { 'season.json': season, 'fights/x.json': fight(3) });
  assert.match((await df.refresh('https://x/', fetchText)).skipped, /needs Polygnome 0\.6\.0/);
  man('2026-10-22', '0.5.0', { 'season.json': season, 'fights/x.json': '{"id": "broken"}' });
  await assert.rejects(df.refresh('https://x/', fetchText), /invalid file/);
  assert.strictEqual(JSON.parse(fs.readFileSync(df.file('fights/x.json'), 'utf8')).name, 'X2');  // the working copy stays
  // a newer app with newer bundled data: the older download is not used any more
  write(bundled, 'manifest.json', JSON.stringify({ generated: '2026-11-01', minApp: '0.5.0', files: {} }));
  assert.strictEqual(df.file('fights/x.json'), path.join(bundled, 'fights/x.json'));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('an untouched "Edit…" copy (LF or CRLF) is recognised, a real edit is not', () => {
  const text = '{\n "id": "a"\n}\n', hashes = new Set([D.sha(Buffer.from(text))]);
  assert.ok(D.shippedCopy(text, hashes)); assert.ok(D.shippedCopy(text.replace(/\n/g, '\r\n'), hashes));
  assert.ok(!D.shippedCopy(text.replace('"a"', '"b"'), hashes));
});

test('data: the published fights (data/fights, drafts aside) build valid raid events', () => {
  const B = require('../lib/boss'), defs = B.list([path.join(__dirname, '..', 'data', 'fights')]).filter(d => !d.draft);
  for (const d of defs) for (const df of Object.keys(d.difficulties)) {
    const r = B.build(d, { difficulty: df, duration: d.defaultDuration });
    for (const e of r.events) assert.match(e, /^raid_events\+=\/(adds|movement|vulnerable|invulnerable|damage_done_buff),[\w=.:,\-]+$/, `${d.id}/${df}: ${e}`);
  }
});
