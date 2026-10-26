// Next-season data, prepared by the season watch (.github/workflows/watch.yml) as pull requests:
//  - draft():   a new raid in the PTR / beta Adventure Guide -> data/season-ptr.json, progression-ptr.json, crafted-ptr.json
//               (what the game data tells; everything else copied from the live season and listed in `todo`).
//  - promote(): the raid is in the live Adventure Guide -> season.json <- season-ptr.json (etc.), preview files removed, fights of the
//               old season moved out of the app's list (data/fights-archive/<season id>/), the "ptr" flag dropped from the new ones.
// Pure functions: the tools (tools/season-draft.js, tools/season-promote.js) do the downloads and the file writes.

const clone = o => JSON.parse(JSON.stringify(o));
const key = s => String(s).toLowerCase();

// MID2 -> MID3; null when the id does not end with a number
function nextId(id) { const m = /^(.*?)(\d+)$/.exec(id || ''); return m ? m[1] + (+m[2] + 1) : null; }
// "Midnight Season 2" -> "Midnight Season 3"
function nextName(name) { const m = /^(.*?)(\d+)$/.exec(name || ''); return m ? m[1] + (+m[2] + 1) : null; }

// Upgrade-track groups of the new raid's drops -> { group: track } for the tracks of the live season (same order, highest last).
// Midnight S2 raids drop with 615-618 (veteran?, champion, hero, myth): the live season keeps the top 3; a new season does the same.
function tracksFrom(groups, liveTracks) {
  const names = Object.entries(liveTracks || {}).sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  const g = [...new Set(groups || [])].map(Number).sort((a, b) => a - b);
  if (!names.length || g.length < names.length) return null;
  const top = g.slice(-names.length);
  return Object.fromEntries(top.map((x, i) => [String(x), names[i]]));
}

// Item levels of each upgrade track rank, from simc's tables (item_bonus.inc + item_scaling.inc, *_ptr.inc for the PTR):
// a rank's bonus has a type-34 row (Value_0 = track group) and a type-49 row (Value_0 = item scaling config id); that config's item level
// is the rank's item level. Ranks = the group's bonus ids in id order; the first 6 are the upgrade ranks (1/6..6/6), later ones are
// drop-only levels (Myth "9/6" = 344 for the last two bosses). VERIFIED 26 Oct on 12.1.5.70575: 616 / 617 / 618 give exactly the
// Champion / Hero / Myth tables of data/progression.json (Method guides).
function parseRows(ib) { return [...ib.matchAll(/\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(-?\d+),\s*(-?\d+),/g)].map(m => ({ bonus: +m[2], type: +m[3], v0: +m[4] })); }
function scalingIlvl(sc) {
  const i = sc.indexOf('__item_scaling_config_data'), j = sc.indexOf('__item_offset_curve_data', i);
  if (i < 0) return {};
  const out = {}; for (const m of sc.slice(i, j < 0 ? undefined : j).matchAll(/\{\s*(\d+),\s*(\d+),\s*(\d+),/g)) out[m[1]] = +m[3];
  return out;
}
// -> { group: [item levels of all its ranks] }
function groupLevels(ibText, scText) {
  const cfg = scalingIlvl(scText), grp = {}, sca = {};
  for (const r of parseRows(ibText)) { if (r.type === 34) (grp[r.v0] ??= new Set()).add(r.bonus); if (r.type === 49) sca[r.bonus] = r.v0; }
  const out = {};
  for (const [g, set] of Object.entries(grp)) { const lv = [...set].sort((a, b) => a - b).map(b => cfg[sca[b]]); if (lv.length && lv.every(Boolean)) out[g] = lv; }
  return out;
}
// upgradeTracks { group: track name } + groupLevels -> { track: [6 item levels] } (tracks without data are left out)
function trackLevels(upgradeTracks, levels) {
  const out = {};
  for (const [g, name] of Object.entries(upgradeTracks || {})) if (levels[g]?.length >= 6) out[name] = levels[g].slice(0, 6);
  return out;
}

// o = { live: { season, progression, crafted } (current files), prev: same for an existing preview (or null), raids: [{ id, name,
//       bosses: [names] }] (new raids only), groups: [upgrade groups of their drops], game: 'wowt'|'wow_beta', build, tierSet: id|null,
//       levels: groupLevels() of the PTR's simc tables or null }
// -> { season, progression, crafted, todo: [strings], added: [raid names] }
function draft(o) {
  const { live, prev } = o, newExp = o.game === 'wow_beta';
  const todo = [];
  let season, progression, crafted;
  const raids = (o.raids || []).filter(r => !prev?.season?.season?.raids?.includes(r.name));
  if (prev?.season) {           // a preview already exists: only add the new raid(s) and their bosses
    season = clone(prev.season); progression = clone(prev.progression || live.progression); crafted = clone(prev.crafted || live.crafted);
  } else {
    season = clone(live.season); progression = clone(live.progression); crafted = clone(live.crafted);
    const id = newExp ? null : nextId(live.season.season.id), name = newExp ? null : nextName(live.season.season.name);
    season.season.id = id || 'NEXT1'; season.season.name = name || 'Next season';
    if (!id) todo.push('season.id / season.name: new expansion, give the season an id (e.g. XXX1) and a name');
    season.game = o.game || 'wowt';
    season.season.raids = [];
    season.season.tierSet = o.tierSet || season.season.id;
    if (!o.tierSet) todo.push(`season.tierSet: guessed "${season.season.tierSet}" (simc profiles folder not found yet)`);
    const tr = tracksFrom(o.groups, live.season.season.upgradeTracks);
    if (tr) { season.season.upgradeTracks = tr; todo.push(`season.upgradeTracks: from the new raid's drops (${Object.entries(tr).map(([g, n]) => `${g} ${n}`).join(', ')}): check`); }
    else todo.push('season.upgradeTracks: could not be read from the new raid\'s drops (copied from the live season)');
    season.season.sources = { warcraftLogsZone: null, lorrgsZones: [], bigwigs: [] };
    todo.push('season.sources: Warcraft Logs zone, Lorrgs zones and BigWigs folders (watch issues tell when they exist)');
    if (newExp) todo.push('expansion: name and qualityRanks of the new expansion (crafted enchant/gem quality ranks)');
    todo.push(`season.craftedIlvl (${season.season.craftedIlvl}) and crafted-ptr.json (embellishments, ilvl): copied from the live season`);
    const lv = tr && o.levels ? trackLevels(tr, o.levels) : {}, names = Object.keys(progression.tracks || {});
    for (const [n, il] of Object.entries(lv)) if (progression.tracks[n]) progression.tracks[n].ilvl = il;
    const miss = names.filter(n => !lv[n]);
    if (miss.length) todo.push(`progression-ptr.json tracks ${miss.join(', ')}: item levels not found in simc's PTR data (copied from the live season)`);
    todo.push('progression-ptr.json: rank of each source (raid difficulty, M+ keys, Great Vault…) copied from the live season');
    for (const s of Object.values(progression.sources || {})) if (s.bossOverrides) s.bossOverrides = {};
    progression.seasonId = crafted.seasonId = season.season.id;
    progression.season = season.season.name;
  }
  for (const r of raids) {
    season.season.raids.push(r.name);
    (season.season.raidBosses ??= {})[r.name] = r.bosses || [];   // used by the watch to find the raid's Warcraft Logs zone (season start)
    // per-boss item levels: every boss of the new raid starts at its source's default (bossOverrides also tells "This season" which raids count)
    for (const s of Object.values(progression.sources || {})) if (s.bossOverrides) for (const b of r.bosses || []) s.bossOverrides[key(b)] ??= s.ilvl ? { ilvl: s.ilvl } : { track: s.track, rank: s.rank };
  }
  if (raids.length) todo.push(`progression-ptr.json bossOverrides: per-boss rank of ${raids.map(r => r.name).join(', ')} (all at the source's default rank)`);
  season.todo = [...new Set([...(prev?.season?.todo || []), ...todo])];
  return { season, progression, crafted, todo: season.todo, added: raids.map(r => r.name) };
}

// Promotion. o = { season, seasonPtr, progressionPtr, craftedPtr, fights: [{ file, json }] }
// -> null when there is nothing to promote, else { season, progression, crafted, keep: [{ file, json }] (ptr flag dropped), archive: [files] }
// o.wclZone: Warcraft Logs zone id of the new raid (season start signal), written to season.sources.warcraftLogsZone
function promote(o) {
  const next = o.seasonPtr;
  if (!next?.season?.id || next.season.id === o.season?.season?.id) return null;
  const season = clone(next); delete season.game; delete season.todo;
  if (o.wclZone) season.season.sources = { ...(season.season.sources || {}), warcraftLogsZone: +o.wclZone };
  const progression = o.progressionPtr ? clone(o.progressionPtr) : null, crafted = o.craftedPtr ? clone(o.craftedPtr) : null;
  const keep = [], archive = [];
  for (const f of o.fights || []) {
    if (f.json.ptr) { const j = clone(f.json); delete j.ptr; keep.push({ file: f.file, json: j }); }
    else archive.push(f.file);
  }
  return { season, progression, crafted, keep, archive, from: o.season?.season?.id, to: season.season.id };
}

module.exports = { nextId, nextName, tracksFrom, groupLevels, trackLevels, draft, promote };
