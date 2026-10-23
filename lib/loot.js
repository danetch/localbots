// Données de loot construites depuis les tables DB2 (exports CSV de wago.tools).
const tierLib = require('./tier');
const craftedLib = require('./crafted');
const specs = require('./specs');
const INV = { 1:['head'],2:['neck'],3:['shoulder'],5:['chest'],20:['chest'],6:['waist'],7:['legs'],8:['feet'],
  9:['wrist'],10:['hands'],11:['finger1','finger2'],12:['trinket1','trinket2'],16:['back'],
  13:['main_hand'],21:['main_hand'],17:['main_hand'],15:['main_hand'],26:['main_hand'],14:['off_hand'],22:['off_hand'],23:['off_hand'] };
// Deux mains : 17 (épées/haches/masses 2M, armes d'hast, bâtons), 15 (arcs), 26 armes à feu/arbalètes (les baguettes, sous-classe 19, sont à une main)
const isTwoHandItem = it => it.cls === 2 && (it.inv === 17 || it.inv === 15 || (it.inv === 26 && (it.sub === 3 || it.sub === 18)));
const WEAPONS = { 0:'One-hand axe',1:'Two-hand axe',4:'One-hand mace',5:'Two-hand mace',6:'Polearm',7:'One-hand sword',8:'Two-hand sword',
  9:'Warglaives',10:'Staff',13:'Fist weapon',15:'Dagger',19:'Wand',2:'Bow',3:'Gun',18:'Crossbow' };
const ARMOR = { cloth:'1', leather:'2', mail:'3', plate:'4' };

// Consommables : sous-classes Item 1 potion, 3 flacon/phiole, 5 nourriture, 8 divers (runes d'augmentation)
const CONS = { '1': 'potion', '3': 'flask', '5': 'food', '8': 'rune' };
// Not combat consumables: profession / gathering phials (Midnight: Haranir Phial of Perception / Ingenuity / Finesse), PvP honor flasks,
// cauldrons. Matched by name (no game-data flag tells them apart; names from the Midnight consumables guides).
const NOT_COMBAT = /perception|ingenuity|finesse|deftness|resourcefulness|multicraft|crafting|gathering|skinning|mining|herbalism|fishing|of honor|cauldron/i;
const combatOnly = list => (list || []).filter(o => !NOT_COMBAT.test(o.label || o.name || ''));
const slug = n => n.toLowerCase().replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// cq (optional): { itemId: crafting quality } from simc's item data. simc finds a consumable by its tokenized name plus an optional rank
// suffix: quality 0 or 1 -> plain name, quality n>=2 -> name_n (consumable.cpp find_consumable). Without cq only plain names are offered.
function buildConsumables(items, sparse, cq) {
  const sp = Object.fromEntries(sparse.map(r => [r.id, r])), by = { potion: [], flask: [], food: [], rune: [] };
  for (const r of items) {
    if (r.cls !== '0' || !CONS[r.sub]) continue;
    const s = sp[r.id], cat = CONS[r.sub];
    if (!s || !s.name || NOT_COMBAT.test(s.name) || (cat === 'rune' && !/augment rune/i.test(s.name))) continue;
    by[cat].push({ id: +r.id, name: s.name, exp: s.exp === undefined || s.exp === '' ? null : +s.exp });
  }
  const out = {};
  for (const [cat, list] of Object.entries(by)) {
    const maxExp = Math.max(-1, ...list.map(x => x.exp ?? -1));
    let L = maxExp >= 0 ? list.filter(x => x.exp === maxExp) : list;
    L = L.sort((a, b) => b.id - a.id).slice(0, 150).sort((a, b) => a.id - b.id);   // les plus récents
    const groups = new Map();
    for (const x of L) groups.set(x.name, [...(groups.get(x.name) || []), x]);
    out[cat] = [];
    for (const [name, g] of groups) {
      const qs = cq ? [...new Set(g.map(x => cq[x.id] || 0))].sort((a, b) => a - b) : [0];
      const ranks = qs.filter(q => q >= 2);
      const idAt = f => (g.find(x => f(cq?.[x.id] || 0)) || g[0]).id;
      if (!ranks.length || qs.some(q => q < 2)) out[cat].push({ value: slug(name), label: ranks.length ? `${name} (rank 1)` : name, id: idAt(q => q < 2) });
      for (const q of ranks) out[cat].push({ value: `${slug(name)}_${q}`, label: `${name} (rank ${q})`, id: idAt(x => x === q) });
    }
  }
  return out;
}

function scan(t, cb) {
  let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i+1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i+1] === '\n') i++; row.push(f); if (row.length > 1 || row[0]) cb(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); cb(row); }
}

function readTable(text, want, filter) {
  const out = []; let idx = null;
  scan(text, row => {
    if (!idx) {
      idx = {};
      for (const [k, names] of Object.entries(want)) {
        let i = names.filter(Boolean).map(n => row.indexOf(n)).find(i => i >= 0);
        if (i === undefined) { if (names.includes(null)) i = -1; else throw new Error(`Column not found in CSV: ${names[0]}`); }
        idx[k] = i;
      }
    } else {
      const o = {}; for (const k in idx) o[k] = idx[k] >= 0 ? row[idx[k]] : undefined;
      if (!filter || filter(o)) out.push(o);
    }
  });
  return out;
}

// t = { instance, encounter, encItem, sparse, item } : textes CSV
function build(t) {
  const encItems = readTable(t.encItem, { enc: ['JournalEncounterID'], item: ['ItemID'] });
  const ids = new Set(encItems.map(r => r.item));
  const sets = t.sets ? tierLib.parseSets(t.sets) : [], tierIds = new Set(sets.flatMap(x => x.ids));
  const craftedIds = t.skill && t.effects ? craftedLib.recipeItemIds(readTable, t) : new Set();
  const items = readTable(t.item, { id: ['ID'], cls: ['ClassID'], sub: ['SubclassID'], inv: ['InventoryType'] }, o => ids.has(o.id) || tierIds.has(o.id) || craftedIds.has(o.id) || (o.cls === '0' && CONS[o.sub]));
  const consIds = new Set(items.filter(o => o.cls === '0' && CONS[o.sub]).map(o => o.id));
  const sparse = readTable(t.sparse, { id: ['ID'], name: ['Display_lang'], ilvl: ['ItemLevel'], exp: ['ExpansionID', null] }, o => ids.has(o.id) || consIds.has(o.id) || craftedIds.has(o.id));
  const out = { builtAt: new Date().toISOString(), instances: {}, items: {} };
  for (const r of sparse) if (ids.has(r.id)) out.items[r.id] = { name: r.name, ilvl: +r.ilvl };
  for (const r of items) if (out.items[r.id]) Object.assign(out.items[r.id], { cls: +r.cls, sub: +r.sub, inv: +r.inv });
  out.consumables = buildConsumables(items, sparse, t.cq);
  out.consVer = 2;
  out.crafted = craftedIds.size ? craftedLib.pickCrafted(items, sparse, craftedIds, INV) : [];
  out.embellishments = t.embs ? craftedLib.parseEmbellishments(t.embs) : [];
  // Pièces de tier (source : simc item_set_bonus.inc) avec leur emplacement d'après InventoryType
  out.tierSets = tierLib.withSlots(sets, Object.fromEntries(items.map(r => [r.id, +r.inv])));
  const inst = Object.fromEntries(readTable(t.instance, { id: ['ID'], name: ['Name_lang'] }).map(r => [r.id, r.name]));
  const encs = readTable(t.encounter, { id: ['ID'], name: ['Name_lang'], inst: ['JournalInstanceID'] });
  const encMap = Object.fromEntries(encs.map(e => [e.id, e]));
  for (const r of encItems) {
    const e = encMap[r.enc]; if (!e || !inst[e.inst]) continue;
    const I = out.instances[e.inst] = out.instances[e.inst] || { name: inst[e.inst], bosses: {} };
    const B = I.bosses[e.id] = I.bosses[e.id] || { name: e.name, items: [] };
    if (!B.items.includes(r.item)) B.items.push(r.item);
  }
  // Tiers du Guide de l'aventurier (dont « Current Season » qui regroupe les donjons/raids de la saison)
  out.tiers = {};
  if (t.tier && t.tierX) {
    for (const r of readTable(t.tier, { id: ['ID'], name: ['Name_lang'] })) out.tiers[r.id] = { name: r.name, instances: [] };
    for (const r of readTable(t.tierX, { tier: ['JournalTierID'], inst: ['JournalInstanceID'] }))
      if (out.tiers[r.tier] && out.instances[r.inst]) out.tiers[r.tier].instances.push(r.inst);
    for (const id of Object.keys(out.tiers)) if (!out.tiers[id].instances.length) delete out.tiers[id];
  }
  return out;
}

// Emplacements possibles d'un objet : une 2M ne va qu'en main droite (sauf Titan's Grip), une arme à une main peut aller en main gauche
// pour qui manie deux armes (f.dual), une arme « main gauche » (inv 22) n'a de sens que dans ce cas.
function slotsFor(it, f) {
  if (it.cls !== 2) return INV[it.inv];
  const both = f.titan || f.dual;
  if (isTwoHandItem(it)) return f.titan ? ['main_hand', 'off_hand'] : INV[it.inv];
  if (it.inv === 13) return both ? ['main_hand', 'off_hand'] : INV[it.inv];
  if (it.inv === 22) return both ? ['off_hand'] : [];
  return INV[it.inv];
}

// filtres : { instanceIds, armor:'plate', includeWeapons, weapons:[sub ids] }
// filtres : { instanceIds, armor:'plate', includeWeapons, weapons:[sub ids], noSec(id) } -> items; f.skipped receives what was left out.
// Old dungeons brought back in a season are listed TWICE by the Adventure Guide: the original item and a remade copy under a newer id
// (e.g. Battle for Azeroth Azerite armor 159236 "Headdress of the First Empire" -> 239047 with normal secondary stats). Only the newest id
// of each name per boss is kept. Safety net: head/shoulder/chest armor with a primary stat but no secondary stat in simc's data
// (Azerite-style budget, f.noSec) is skipped: simc would give it ~70 % more primary stat than the game does.
function select(loot, f) {
  const res = new Map(), skipped = f.skipped || [];
  for (const iid of f.instanceIds) {
    const I = loot.instances[iid]; if (!I) continue;
    for (const B of Object.values(I.bosses)) {
      const r = f.ilvlFor ? f.ilvlFor(iid, B.name) : { ilvl: f.ilvl };
      if (!r?.ilvl) continue;
      const newest = new Map();
      for (const id of B.items) { const n = loot.items[id]?.name; if (n && (!newest.has(n) || +id > +newest.get(n))) newest.set(n, id); }
      for (const id of B.items) {
        const it = loot.items[id]; if (!it || !INV[it.inv]) continue;
        if (newest.get(it.name) !== id) { skipped.push({ id, name: it.name, why: `older copy of ${newest.get(it.name)}` }); continue; }
        let ok = false;
        if (it.cls === 4) ok = it.sub === 0 || it.inv === 16 || it.sub === +ARMOR[f.armor] || (it.sub === 6 && f.includeWeapons && f.shield !== false);
        else if (it.cls === 2) ok = f.includeWeapons && (f.weapons || []).includes(it.sub);
        if (!ok || (f.primOf && !specs.fits(f.primary, f.primOf(id)))) continue;
        if (f.noSec && f.noSec(id)) { skipped.push({ id, name: it.name, why: 'Azerite-style stats (no secondary stat)' }); continue; }
        const key = id + '@' + r.ilvl;
        const slots = slotsFor(it, f); if (!slots.length) continue;
        if (!res.has(key)) res.set(key, { id, name: it.name, ilvl: r.ilvl, slots, twoHand: isTwoHandItem(it), sources: [] });
        res.get(key).sources.push(`${I.name} — ${B.name}${r.label ? ' (' + r.label + ')' : ''}`);
      }
    }
  }
  return [...res.values()];
}

module.exports = { NOT_COMBAT, combatOnly, buildConsumables, slotsFor, build, select, WEAPONS, ARMOR, INV, isTwoHandItem, readTable };
