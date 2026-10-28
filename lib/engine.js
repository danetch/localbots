// simc engine management: find the latest Windows nightly on downloads.simulationcraft.org, read the version from simc's banner.
// Source (simulationcraft.org/download.html): only nightly builds exist, "always the latest build for a given version",
// Windows ones are 7-Zip archives in the Apache index http://downloads.simulationcraft.org/nightly/, named (checked on the real index,
// 28 Oct 2026, test/fixtures/simc-nightly-index.html) simc-1210.01.73a372b-win64.7z since late 2022 (simc-920.01-win64.7z once without
// hash) and simc-910-01-win64-5d7ee8d.7z before. winarm64 / win64_qt5 / win32 archives are not for us.
const INDEX_URL = 'http://downloads.simulationcraft.org/nightly/?C=M;O=D';
const BASE_URL = 'http://downloads.simulationcraft.org/nightly/';
const PLATFORMS = { win32: /simc-(\d+)\.(\d+)(?:\.([0-9a-f]+))?-win64\.7z|simc-(\d+)-(\d+)-win64-([0-9a-f]+)\.7z/gi };

// Apache directory listing -> archives of the platform [{ name, url, version:'1210-01', hash, date:'2026-10-21 18:03'|'', major, minor, order }].
function listing(html, platform = process.platform) {
  const re = PLATFORMS[platform]; if (!re) return [];
  const found = [], seen = new Set(), r = new RegExp(re.source, 'gi'); let m, i = 0; const text = String(html);
  while ((m = r.exec(text))) {
    if (seen.has(m[0])) continue; seen.add(m[0]);
    const d = /(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/.exec(text.slice(m.index + m[0].length, m.index + m[0].length + 300));
    const [maj, min, hash] = m[1] != null ? [m[1], m[2], m[3] || ''] : [m[4], m[5], m[6]];
    found.push({ name: m[0], url: BASE_URL + m[0], version: `${maj}-${min}`, hash, date: d ? d[1] + (d[2] ? ' ' + d[2] : '') : '', major: +maj, minor: +min, order: i++ });
  }
  return found;
}
const cmpVersion = (a, b) => { const p = v => String(v).split('-').map(Number); const [a1, a2] = p(a), [b1, b2] = p(b); return a1 - b1 || a2 - b2; };
// Newest archive (listing order = date, newest first). `family` ('1210-01', the version token of the installed build) restricts the choice to that
// version: a higher version may be a PTR/beta build, so it is never picked automatically. Without family: highest version.
function latest(html, platform = process.platform, family = null) {
  let found = listing(html, platform);
  if (family) found = found.filter(x => x.version === family);
  found.sort((a, b) => cmpVersion(b.version, a.version) || a.order - b.order);
  const best = found[0];
  return best ? { name: best.name, url: best.url, version: best.version, hash: best.hash, date: best.date } : null;
}
const families = (html, platform = process.platform) => [...new Set(listing(html, platform).map(x => x.version))].sort((a, b) => cmpVersion(b, a));
// Same build? (banner shows the short git hash, archive names too)
const sameBuild = (a, b) => !!a && !!b && (String(a).startsWith(b) || String(b).startsWith(a));
// Version token of simc's master branch (the retail line): used to choose a family when nothing is installed yet.
const CONFIG_URL = 'https://raw.githubusercontent.com/simulationcraft/simc/master/engine/config.hpp';
function familyOf(configText) {
  const M = /#define\s+SC_MAJOR_VERSION\s+"(\d+)"/.exec(String(configText)), N = /#define\s+SC_MINOR_VERSION\s+"(\d+)"/.exec(String(configText));
  return M && N ? `${M[1]}-${N[1]}` : null;
}

// "SimulationCraft 1210-01 for World of Warcraft 12.1.5.70448 Live (hotfix 2026-10-20/70448, git build midnight 7bc1071)"
function versionOf(text) {
  const m = /SimulationCraft\s+(\S+)\s+for World of Warcraft\s+([\d.]+)\s+(\w+)(?:\s+\(([^)]*)\))?/.exec(String(text));
  if (!m) return null;
  const git = /git build \S+ ([0-9a-f]+)/.exec(m[4] || '');
  return { simc: m[1], wow: m[2], branch: m[3], hotfix: (/hotfix ([^,]+)/.exec(m[4] || '') || [])[1] || '', git: git ? git[1] : '' };
}

module.exports = { INDEX_URL, BASE_URL, CONFIG_URL, listing, latest, families, sameBuild, cmpVersion, familyOf, versionOf };
