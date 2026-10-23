// Tier sets & Catalyst.
// Source of tier item IDs: simc's generated item_set_bonus.inc (one row per set bonus; same ItemIDs repeated).
// Catalyst in Midnight S2 (Icy Veins / Method / Wowhead): item level, track, secondary stats, sockets and cantrip
// effects are kept; only the item becomes the class's tier piece. In simc this is `redirected_base_stats=<orig id>`
// (the HTML report prints it as "catalysed from").
const CLASS_ID = { warrior: 1, paladin: 2, hunter: 3, rogue: 4, priest: 5, deathknight: 6, shaman: 7, mage: 8,
  warlock: 9, monk: 10, druid: 11, demonhunter: 12, evoker: 13 };
const TIER_SLOTS = ['head', 'shoulder', 'chest', 'hands', 'legs'];
const TIER_INV = { 1: 'head', 3: 'shoulder', 5: 'chest', 20: 'chest', 10: 'hands', 7: 'legs' };
const EXP_RANK = { DF: 1, TWW: 2, MID: 3 };
const SETS_URL = 'https://raw.githubusercontent.com/simulationcraft/simc/master/engine/dbc/generated/item_set_bonus.inc';

const ROW = /^\s*\{\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*-?\d+\s*,\s*(\d+)\s*,\s*\d+\s*,\s*(\d+)\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*\{([^}]*)\}/;

// Returns [{ set, name, tier, cls, ids:[string] }] for the retail tier families we care about (DFn, TWWn, MIDn).
function parseSets(text) {
  const out = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const m = ROW.exec(line); if (!m) continue;
    const [, name, , tier, setId, cls, ids] = m;
    if (!rank(tier) || out.has(setId)) continue;
    const list = ids.split(',').map(s => s.trim()).filter(s => s && s !== '0');
    if (list.length) out.set(setId, { set: setId, name, tier, cls: +cls, ids: list });
  }
  return [...out.values()];
}
function rank(tier) {
  const m = /^(DF|TWW|MID)(\d+)$/.exec(tier || ''); return m ? EXP_RANK[m[1]] * 100 + +m[2] : 0;
}
// Keeps only sets whose five-slot layout could be resolved; invOf: item id -> InventoryType
function withSlots(sets, invOf) {
  return sets.map(s => {
    const slots = {};
    for (const id of s.ids) { const sl = TIER_INV[invOf[id]]; if (sl) slots[sl] = id; }
    return { ...s, slots };
  }).filter(s => Object.keys(s.slots).length >= 4);
}

function classOf(text) {
  const m = new RegExp(`^\\s*(${Object.keys(CLASS_ID).join('|')})\\s*=`, 'm').exec(String(text));
  return m ? CLASS_ID[m[1]] : 0;
}
// Latest tier set of the class (highest expansion/season number).
// `prefer` (ex. "MID2", champ « tier » de progression.json) l'emporte : simc peut déjà contenir les sets de la saison suivante.
function pickSet(tierSets, cls, prefer) {
  const mine = (tierSets || []).filter(s => s.cls === cls);
  return (prefer && mine.find(s => s.tier === prefer)) || mine.sort((a, b) => rank(b.tier) - rank(a.tier))[0] || null;
}

// Catalyst twin of an item string: tier item id + original stats via redirected_base_stats. Null if not applicable.
function twin(item, tierId) {
  const m = /^(,?)id=(\d+)/.exec(item || '');
  if (!m || m[2] === String(tierId) || /redirected_base_stats=/.test(item)) return null;
  return `${m[1]}id=${tierId}${item.slice(m[0].length)},redirected_base_stats=${m[2]}`;
}

// Adds ",ilevel=N" when the string has none but the label ends with "(N)" (addon comment), so the twin keeps the original's level.
function withIlvl(item, label) {
  if (/ilevel=\d+/.test(item)) return item;
  const m = /\((\d{3})\)\s*$/.exec(label || '');
  return m ? `${item},ilevel=${m[1]}` : item;
}
const isTwin = item => /redirected_base_stats=/.test(item || '');

// Top Gear: adds the catalyst twin of every head/shoulder/chest/hands/legs pool item as an extra alternative.
function poolTwins(parsed, tierSet) {
  let n = 0;
  for (const [slot, items] of Object.entries(parsed.pools)) {
    const tid = tierSet.slots[slot]; if (!tid) continue;
    for (const item of [...items]) {
      const lab = parsed.labels[item] || item, tw = twin(withIlvl(item, lab), tid);
      if (!tw || items.includes(tw)) continue;
      items.push(tw); parsed.labels[tw] = `${lab} → tier`; n++;
    }
  }
  return n;
}
// Shared by all modes: resolves the class tier set and applies the charge cap on rules.
function setup(catalyst, text, tierSets, rules, prefer) {
  if (!catalyst?.on) return null;
  const cls = classOf(text); if (!cls) throw new Error('Catalyst: could not detect your class in the export.');
  const set = pickSet(tierSets, cls, prefer);
  if (!set) throw new Error('Catalyst needs tier set data: click “Update loot data”.');
  if (catalyst.max !== null && catalyst.max !== '' && catalyst.max >= 0) rules.maxCat = Math.floor(+catalyst.max);
  return set;
}

module.exports = { poolTwins, setup, withIlvl, isTwin, CLASS_ID, TIER_SLOTS, SETS_URL, parseSets, withSlots, classOf, pickSet, twin, rank };
