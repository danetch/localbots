// "Fully upgraded" bag items for Top Gear. An item's upgrade track and rank come from its bonus ids (enhance.json "upgrade",
// item_bonus type 34: { bonusId: [track group, rank] }); progression.json "upgradeTracks" maps a track group to one of its tracks
// (Midnight S2, checked on a real export: 616 Champion, 617 Hero, 618 Myth). The item is set to the track's last level (6/6); items
// already at or above it (e.g. Myth 9/6 = 344 drops) and items without a known track (crafted, PvP, older seasons) are left as they are.
const ilvlOf = (item, label) => +((/(?:^|,)ilevel=(\d+)/.exec(item) || [])[1] || (/\((\d{2,3})\)\s*$/.exec(label || '') || [])[1] || 0);
const setIlevel = (item, n) => /(?:^|,)ilevel=\d+/.test(item) ? item.replace(/((?:^|,)ilevel=)\d+/, `$1${n}`) : `${item},ilevel=${n}`;
// -> { item, from, to, label } | null
function upgradeItem(item, label, upgrade, prog) {
  const bonus = (/bonus_id=([\d\/:]+)/.exec(item || '') || [])[1]; if (!bonus) return null;
  for (const b of bonus.split(/[\/:]/)) {
    const u = upgrade?.[b]; if (!u) continue;
    const T = prog?.tracks?.[prog?.upgradeTracks?.[u[0]]]; if (!T) return null;
    const max = T.ilvl[T.ilvl.length - 1], cur = ilvlOf(item, label);
    if (!cur || cur >= max) return null;
    return { item: setIlevel(item, max), from: cur, to: max, label: `${T.name} ${T.ilvl.length}/${T.ilvl.length}` };
  }
  return null;
}
// Top Gear pools: which = 'bags' (bag items only) | 'all' (equipped too). Updates pools, labels and equipped in place. -> [{ from, to, name }]
function upgradePools(parsed, which, upgrade, prog) {
  const eq = new Set(Object.values(parsed.equipped).flat()), done = [];
  for (const [key, items] of Object.entries(parsed.pools)) items.forEach((it, i) => {
    if (which !== 'all' && eq.has(it)) return;
    const lab = parsed.labels[it] || '', u = upgradeItem(it, lab, upgrade, prog); if (!u) return;
    items[i] = u.item;
    parsed.labels[u.item] = `${lab.replace(/\s*\(\d{2,3}\)\s*$/, '') || 'item'} (${u.from} → ${u.to})`;
    if (eq.has(it)) for (const arr of Object.values(parsed.equipped)) { const j = arr.indexOf(it); if (j >= 0) arr[j] = u.item; }
    done.push({ name: lab.replace(/\s*\(\d{2,3}\)\s*$/, ''), from: u.from, to: u.to, track: u.label, key });
  });
  return done;
}
module.exports = { upgradeItem, upgradePools, setIlevel, ilvlOf };
