// Game versions from Blizzard's own version service (TACT v2, what the Battle.net launcher reads), per region, with wago.tools as the
// fallback. https://us.version.battle.net/v2/products/<product>/versions answers a pipe table, one row per region:
//   Region!STRING:0|BuildConfig!HEX:16|CDNConfig!HEX:16|KeyRing!HEX:16|BuildId!DEC:4|VersionsName!String:0|ProductConfig!HEX:16
//   us|d718...|c13b...|3ca5...|70575|12.1.5.70575|5302...
// Products: wow (live), wowt (PTR), wow_beta (beta), wowxptr (second PTR). Regions: us eu kr tw cn (+ sg, xx: no players).
// VERIFIED 26 Oct 2026 in the user's browser: wow 12.1.5.70575 in every region, wowt 12.1.7.70493, wow_beta 12.0.1.66220 (= wago).
const REGIONS = ['us', 'eu', 'kr', 'tw', 'cn'];
const URL = p => `https://us.version.battle.net/v2/products/${p}/versions`;
const WAGO = 'https://wago.tools/api/builds/latest';

// pipe table -> { region: version }
function parse(text) {
  const lines = String(text).split(/\r?\n/).filter(l => l && !l.startsWith('##'));
  if (!lines.length) return {};
  const head = lines[0].split('|').map(h => h.split('!')[0].toLowerCase()), ri = head.indexOf('region'), vi = head.indexOf('versionsname');
  if (ri < 0 || vi < 0) return {};
  const out = {};
  for (const l of lines.slice(1)) { const c = l.split('|'); if (c[ri] && /^\d+\.\d+\.\d+\.\d+$/.test(c[vi] || '')) out[c[ri]] = c[vi]; }
  return out;
}

// getText(url) -> string (throws on failure). -> { product, regions: { us: '12.1.5.70575', ... }, source: 'blizzard' | 'wago' }
// wago has no regions: its version is given for every region.
async function product(getText, p) {
  try { const r = parse(await getText(URL(p))); if (Object.keys(r).length) return { product: p, regions: r, source: 'blizzard' }; } catch { /* fallback */ }
  const v = JSON.parse(await getText(WAGO))[p]?.version;
  if (!v) throw new Error(`no ${p} version (Blizzard and wago.tools)`);
  return { product: p, regions: Object.fromEntries(REGIONS.map(r => [r, v])), source: 'wago' };
}
// one region's version (us when the region is unknown or missing)
const of = (res, region) => res.regions[region] || res.regions.us || Object.values(res.regions)[0] || null;
const regionOf = text => { const m = /^\s*region=(\w+)\s*$/mi.exec(text || ''); return m && REGIONS.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : null; };
// "# WoW 12.1.5.70575, TOC 120105" (SimulationCraft addon header) -> version of the player's client
const exportVersion = text => (/^#\s*WoW\s+(\d+\.\d+\.\d+\.\d+)/mi.exec(text || '') || [])[1] || null;
// "12.1.5.70391" vs "12.1.7.100": compare part by part
function cmp(a, b) { const A = String(a || '').split('.').map(Number), B = String(b || '').split('.').map(Number); for (let i = 0; i < 4; i++) if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0); return 0; }
const patch = v => String(v || '').split('.').slice(0, 3).join('.');

module.exports = { REGIONS, URL, WAGO, parse, product, of, regionOf, exportVersion, cmp, patch };
