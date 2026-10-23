// Talent builds found in a /simc export: the active `talents=` line plus the saved loadouts the addon lists as comments
// ("# Saved Loadout: name" followed by "# talents=..."). v1 only SELECTS among those strings; it never edits a build.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LINE = /^(#\s*)?talents=([A-Za-z0-9+\/]+)\s*$/;
const NAME = /^#\s*(?:saved\s+loadout|loadout)\s*:\s*(.+)$/i;

// Header layout as simc reads it (engine/player/player.cpp parse_traits_hash): 6 bits per char, least significant bit first;
// 8 bits version (must be 2), then 16 bits specialization id.
function header(str) {
  if (!str || str.length < 4) return null;
  const bits = n => { let v = 0; for (let i = 0; i < n; i++, pos++) v += ((B64.indexOf(str[Math.floor(pos / 6)]) >> (pos % 6)) & 1) * 2 ** i; return v; };
  let pos = 0;
  const version = bits(8), spec = bits(16);
  return { version, spec };
}

function parse(text) {
  const builds = [];
  let name = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(), nm = NAME.exec(line);
    if (nm) { name = nm[1].trim(); continue; }
    const m = LINE.exec(line);
    if (!m) { if (line && !line.startsWith('#')) name = ''; continue; }
    const str = m[2], active = !m[1], h = header(str);
    if (!h || h.version !== 2 || str.length < 24) { name = ''; continue; }
    const dup = builds.find(b => b.string === str);
    if (dup) { dup.active = dup.active || active; if (!dup.name && name) dup.name = name; name = ''; continue; }
    builds.push({ string: str, name, active, spec: h.spec });
    name = '';
  }
  // The active build defines the spec the profile is simulated as: other specs' loadouts cannot be used with this gear.
  const act = builds.find(b => b.active);
  for (const b of builds) b.usable = !act || b.spec === act.spec;
  builds.forEach((b, i) => { b.id = String(i); if (!b.name) b.name = b.active ? 'Current build' : `Build ${i + 1}`; });
  return builds;
}

// Same export text with `string` as the active talents= line.
function apply(text, string) {
  if (!/^[A-Za-z0-9+\/]+$/.test(string || '')) throw new Error('Invalid talent string.');
  let done = false;
  const out = text.split(/\r?\n/).map(l => {
    const m = /^(\s*)talents=[A-Za-z0-9+\/]+\s*$/.exec(l);
    if (!m) return l;
    if (done) return '';
    done = true;
    return `${m[1]}talents=${string}`;
  });
  if (!done) out.push(`talents=${string}`);
  return out.join('\n');
}

module.exports = { parse, apply, header };
