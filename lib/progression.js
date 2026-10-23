// Names are compared without case, spaces or punctuation ("Ula'tek", "Ula’tek", "Ula'tek, the Devourer" all match the key "ula'tek"):
// exact match first, then a Journal name that starts with / contains the key (keys of 4+ letters).
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function override(s, boss) {
  const O = s.bossOverrides; if (!O) return null;
  const b = norm(boss), keys = Object.keys(O).map(k => [norm(k), k]);
  const hit = keys.find(([k]) => k === b) || keys.find(([k]) => k.length >= 4 && (b.startsWith(k) || b.includes(k)));
  return hit ? O[hit[1]] : null;
}
// Retourne { ilvl, label, override } pour une source et un boss, ou null.
function resolve(prog, sourceId, boss, upgrade) {
  const s = prog.sources?.[sourceId]; if (!s) return null;
  const ov = override(s, boss), o = ov || s;
  if (o.ilvl) return { ilvl: o.ilvl, label: `ilvl ${o.ilvl}`, override: !!ov };
  const T = prog.tracks?.[o.track]; if (!T) return null;
  const rank = upgrade === 'max' ? T.ilvl.length : o.rank;
  return { ilvl: T.ilvl[rank - 1], label: `${T.name} ${rank}/${T.ilvl.length}`, override: !!ov };
}
module.exports = { resolve, norm };
