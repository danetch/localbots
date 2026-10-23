// Crafted gear with embellishments.
// Sources: simc's embellishment_data.inc (name, bonus id, effect), wago.tools recipe tables (SkillLineAbility -> SpellEffect.EffectItemType
// -> Item) for the craftable base items, and data/crafted.json (slot rules, tested item level, stat pairs, manual extra items).
// A candidate is `,id=<base>,ilevel=<ilvl>,crafted_stats=<a>/<b>[,embellishment=<name>]` (options verified in simc's item.cpp;
// crafted_stats only has an effect if the base item carries crafted-stat placeholders: unverified for every Midnight item).
const specs = require('./specs');
const EMB_URL = 'https://raw.githubusercontent.com/simulationcraft/simc/master/engine/dbc/generated/embellishment_data.inc';
const slug = n => String(n).toLowerCase().replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const STAT = { 32: 'Crit', 36: 'Haste', 40: 'Vers', 49: 'Mastery' };
const ARMOR_OF = { 1: 4, 2: 4, 6: 4, 3: 3, 7: 3, 13: 3, 4: 2, 10: 2, 11: 2, 12: 2, 5: 1, 8: 1, 9: 1 };   // class id -> armor subclass (cloth 1 ... plate 4)

// [{ name, key (simc tokenized), bonusId }]
function parseEmbellishments(text) {
  const out = [], re = /^\s*\{\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\}/;
  for (const l of String(text).split(/\r?\n/)) { const m = re.exec(l); if (m) out.push({ name: m[1], key: slug(m[1]), bonusId: +m[2] }); }
  return out;
}

// Item ids created by any recipe spell. t = { skill, effects } CSV texts. Throws a clear error if columns differ.
function recipeItemIds(readTable, t) {
  const spells = new Set(readTable(t.skill, { spell: ['Spell', 'SpellID'] }).map(r => r.spell));
  const eff = readTable(t.effects, { item: ['EffectItemType', 'ItemType'], spell: ['SpellID', 'Spell'] }, o => o.item && o.item !== '0');
  return new Set(eff.filter(e => spells.has(e.spell)).map(e => e.item));
}

// Keeps equippable recipe results of the newest expansion. items: [{id, cls, sub, inv}], sparse: [{id, name, exp}]
function pickCrafted(items, sparse, ids, INV) {
  const sp = Object.fromEntries(sparse.map(r => [r.id, r]));
  const L = items.filter(r => ids.has(r.id) && INV[r.inv] && (r.cls === '2' || r.cls === '4') && sp[r.id]?.name)
    .map(r => ({ id: +r.id, name: sp[r.id].name, cls: +r.cls, sub: +r.sub, inv: +r.inv, exp: sp[r.id].exp === undefined || sp[r.id].exp === '' ? null : +sp[r.id].exp }));
  const maxExp = Math.max(-1, ...L.map(x => x.exp ?? -1));
  return (maxExp >= 0 ? L.filter(x => x.exp === maxExp) : L).map(({ exp, ...x }) => x);
}

const slotOk = (embSlots, slot) => embSlots.includes(slot) || (/^finger/.test(slot) && embSlots.includes('finger'));

// opts: { crafted: [items], extra: [{id,name,slot}], rules (crafted.json), emb: [selected keys], pairs: [selected 'a/b'],
//   plain: bool, cls: class id, weapons: [subclass ids], includeWeapons: bool }, INV: loot.js map
function variants(o, INV) {
  const R = o.rules, ilvl = R.ilvl || 331, armor = ARMOR_OF[o.cls], out = [], seen = new Set();
  const embs = (o.emb || []).filter(k => R.embellishments?.[k]).map(k => ({ key: k, slots: R.embellishments[k].slots, name: (o.embNames || {})[k] || k }));
  const bases = [];
  for (const it of o.crafted || []) {
    const jewel = it.cls === 4 && it.sub === 0;
    if (it.cls === 4 && !jewel && it.inv !== 16 && armor && it.sub !== armor) continue;
    if (o.primOf && !specs.fits(o.primary, o.primOf(it.id))) continue;
    if (it.cls === 2 && !(o.includeWeapons && (o.weapons || []).includes(it.sub))) continue;
    const two = it.cls === 2 && (it.inv === 17 || it.inv === 15 || (it.inv === 26 && (it.sub === 3 || it.sub === 18)));
    const both = o.titan || o.dual;
    const slots = it.cls !== 2 ? INV[it.inv] : two ? (o.titan ? ['main_hand', 'off_hand'] : INV[it.inv]) : it.inv === 13 ? (both ? ['main_hand', 'off_hand'] : INV[it.inv]) : it.inv === 22 ? (both ? ['off_hand'] : []) : INV[it.inv];
    for (const slot of slots) bases.push({ id: it.id, name: it.name, slot, twoHand: two });
  }
  for (const x of o.extra || []) if (x.id && x.slot) bases.push({ id: +x.id, name: x.name || `item ${x.id}`, slot: x.slot, twoHand: !!x.twoHand });
  const add = (b, pair, e) => {
    const item = `,id=${b.id},ilevel=${ilvl},crafted_stats=${pair}${e ? `,embellishment=${e.key}` : ''}`, k = b.slot + '|' + item;
    if (seen.has(k)) return; seen.add(k);
    const st = pair.split('/').map(s => STAT[s] || s).join('/');
    out.push({ slot: b.slot, item, base: b.name, twoHand: b.twoHand, emb: !!e, label: `Crafted ${b.name} (${ilvl}) · ${st}${e ? ' + ' + e.name : ''}` });
  };
  for (const b of bases) for (const pair of o.pairs || []) {
    if (o.plain) add(b, pair, null);
    for (const e of embs) if (slotOk(e.slots, b.slot)) add(b, pair, e);
  }
  return out;
}

// Top Gear: add variants to the item pools (rings/trinkets pool under the base key).
function addToPools(parsed, vars, rules) {
  for (const v of vars) {
    const key = v.slot.replace(/[12]$/, ''), pool = parsed.pools[key] = parsed.pools[key] || [];
    if (!pool.includes(v.item)) pool.push(v.item);
    parsed.labels[v.item] = v.label;
    if (v.twoHand) rules.tags[v.item] = { ...rules.tags[v.item], twoHand: true };
  }
}

module.exports = { EMB_URL, ARMOR_OF, STAT, slug, parseEmbellishments, recipeItemIds, pickCrafted, variants, addToPools };
