// Data files (season, progression, crafted rules, boss fights) can be newer than the installed app: at startup the app downloads
// data/manifest.json from the GitHub repo and, when it was generated after the copy in use and the app is recent enough (minApp), the
// files whose hash changed. Downloads live in userData/data-cache; the bundled copy (resources) is the fallback.
// Order for boss fights (later wins, by fight id): bundled or cache (whichever manifest is newer), then the user's own edited files.
// A user file that is byte-identical to a version we shipped (data/shipped-hashes.json, LF or CRLF) is a copy made by "Edit…" and is
// ignored, so corrected timings reach users who once clicked "Edit…" without changing anything.
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
// '0.10.1' > '0.9.3'; pre-release suffixes ('-beta.2') sort before the release
function cmpVer(a, b) {
  const p = v => String(v || '0').split('-'), [x, xs] = p(a), [y, ys] = p(b), A = x.split('.').map(Number), B = y.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0);
  if (!xs !== !ys) return xs ? -1 : 1;
  return String(xs || '').localeCompare(String(ys || ''), 'en', { numeric: true });
}
// Basic shape checks so a broken file in the repo never replaces a working one.
function valid(rel, text) {
  let j; try { j = JSON.parse(text); } catch { return false; }
  if (rel.startsWith('fights/')) return !!(j.id && j.name && j.mechanics && j.difficulties && Object.keys(j.difficulties).length);
  if (/^season(-ptr)?\.json$/.test(rel)) return !!(j.season?.id && j.expansion?.qualityRanks);
  if (/^progression(-ptr)?\.json$/.test(rel)) return !!(j.tracks && j.sources);
  if (/^crafted(-ptr)?\.json$/.test(rel)) return !!(j.embellishments && j.statPairs);
  return true;
}

// o: { bundled: dir with manifest.json, cache: dir, appVersion }
function create(o) {
  const bundledMan = () => readJson(path.join(o.bundled, 'manifest.json')) || { generated: '', files: {} };
  const cacheMan = () => readJson(path.join(o.cache, 'manifest.json'));
  // the cache is used only when it is newer than the bundled data and meant for this app version
  const useCache = () => { const c = cacheMan(), b = bundledMan(); return !!(c && c.generated > (b.generated || '') && cmpVer(o.appVersion, c.minApp) >= 0); };
  const root = () => useCache() ? o.cache : o.bundled;
  const file = rel => { const r = path.join(root(), rel); return fs.existsSync(r) ? r : path.join(o.bundled, rel); };
  const info = () => { const m = useCache() ? cacheMan() : bundledMan(); return { generated: m.generated, from: useCache() ? 'download' : 'app' }; };

  // fetchText(url) -> string. Returns { updated: [rel], generated, skipped?: reason }
  async function refresh(baseUrl, fetchText) {
    const remote = JSON.parse(await fetchText(baseUrl + 'manifest.json'));
    const cur = useCache() ? cacheMan() : bundledMan();
    if (!remote.generated || remote.generated <= (cur.generated || '')) return { updated: [], generated: cur.generated, skipped: 'up to date' };
    if (cmpVer(o.appVersion, remote.minApp) < 0) return { updated: [], generated: cur.generated, skipped: `needs Polygnome ${remote.minApp}` };
    const tmp = o.cache + '.new'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(path.join(tmp, 'fights'), { recursive: true });
    const updated = [];
    for (const [rel, h] of Object.entries(remote.files || {})) {
      if (rel.includes('..') || path.isAbsolute(rel)) continue;
      const have = path.join(root(), rel);
      let text = fs.existsSync(have) && sha(fs.readFileSync(have)) === h ? fs.readFileSync(have, 'utf8') : null;
      if (text == null) { text = await fetchText(baseUrl + rel); if (sha(Buffer.from(text)) !== h) throw new Error(`${rel}: download does not match the manifest`); updated.push(rel); }
      if (!valid(rel, text)) throw new Error(`${rel}: invalid file in the repository`);
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), text);
    }
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(remote, null, 1));
    fs.rmSync(o.cache, { recursive: true, force: true }); fs.renameSync(tmp, o.cache);
    return { updated, generated: remote.generated };
  }
  return { file, dir: rel => path.join(root(), rel), refresh, info, useCache };
}

// User fight files that are untouched copies of something we shipped.
function shippedCopy(text, hashes) {
  const buf = Buffer.from(text), lf = Buffer.from(String(text).replace(/\r\n/g, '\n')), crlf = Buffer.from(String(text).replace(/\r?\n/g, '\r\n'));
  return [buf, lf, crlf].some(b => hashes.has(sha(b)));
}

module.exports = { create, cmpVer, valid, sha, shippedCopy };
