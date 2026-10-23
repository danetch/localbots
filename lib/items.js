// Item database for the equipment rules, built from simc's generated item_data.inc (every item of the game, so bag items
// and equipped items are covered, not only loot). Replaces the old manual "Gear flags" card.
// Row layout after the id (verified on known items): flags, flags2, flags3, ilevel, reqlevel, ?, ?, quality, inventory_type, item_class, item_subclass.
const ITEMS_URL = 'https://raw.githubusercontent.com/simulationcraft/simc/master/engine/dbc/generated/item_data.inc';
const KINDS = ['two', 'one', 'main', 'offw', 'shield', 'held'];
const ROW = /^\s*\{ "(?:[^"\\]|\\.)*",\s*(\d+),([^\n]*)$/;

// -> { build, two, one, main, offw, shield, held, embBonusIds }  (arrays of item ids; plain JSON)
//   two    two-handed weapons: inventory 17 (2H sword/axe/mace, polearm, staff), 15 (bow), 26 guns/crossbows (wands are one-handed)
//   one    one-handed weapons usable in either hand (13)       main   main-hand only (21)
//   cq     { consumable item id: crafting quality } (only for loot-data building, not stored in items.json)
//   offw   off-hand weapons (22)       shield (14)       held   held in off-hand (23)
function parse(text, embBonusIds = []) {
  const out = { build: (/wow build ([\d.]+)/.exec(String(text)) || [])[1] || '', two: [], one: [], main: [], offw: [], shield: [], held: [], agi: [], str: [], int: [], nosec: [], sock: {}, cq: {} };
  // Primary stats: each item row points into __item_stats_data (type 3 agility, 4 strength, 5 intellect; 7 stamina ...).
  const stats = []; let inStats = false;
  for (const l of String(text).split('\n')) {
    if (!inStats && /__item_stats_data\[\d+\]\s*=\s*\{/.test(l)) { inStats = true; continue; }
    if (inStats) { const s = /^\s*\{\s*(-?\d+)\s*,/.exec(l); if (s) { stats.push(+s[1]); continue; } if (/^\s*\};/.test(l)) inStats = false; continue; }
    const m = ROW.exec(l); if (!m) continue;
    const f = m[2].split(','), inv = +f[8], cls = +f[9], sub = +f[10], id = +m[1];
    if ((cls === 2 || cls === 4) && +f[7] >= 3) {            // rare+ weapons/armor only (keeps the file small)
      const p = /&__item_stats_data\[(\d+)\],\s*(\d+)/.exec(m[2]);
      if (p) for (let i = +p[1]; i < +p[1] + +p[2]; i++) { const k = { 3: 'agi', 4: 'str', 5: 'int' }[stats[i]]; if (k && !out[k].includes(id)) out[k].push(id); }
      // nosec: head/shoulder/chest armor with a primary stat and no secondary stat (Battle for Azeroth Azerite budget)
      if (p && cls === 4 && [1, 3, 5, 20].includes(inv)) { const t = []; for (let i = +p[1]; i < +p[1] + +p[2]; i++) t.push(stats[i]);
        if (t.some(x => [3, 4, 5, 71, 72, 73, 74].includes(x)) && !t.some(x => [32, 36, 40, 49].includes(x))) out.nosec.push(id); }
    }
    // sock: sockets built into the item (item_data socket colours), e.g. 268265 Aqirbane Reliquary has 1 (+1 from the drop bonus 13668)
    if ((cls === 2 || cls === 4) && +f[7] >= 3) { const sc = /\{\s*(\d+),\s*(\d+),\s*(\d+)\s*\}/.exec(m[2]); const n = sc ? [sc[1], sc[2], sc[3]].filter(x => +x).length : 0; if (n) out.sock[id] = n; }
    if (cls === 0 && [1, 3, 5, 8].includes(sub)) { const q = /(\d+)\s*\},?\s*$/.exec(m[2]); if (q && +q[1] > 0) out.cq[id] = +q[1]; }
    if (cls === 2) {
      if (inv === 17 || inv === 15 || (inv === 26 && (sub === 3 || sub === 18))) out.two.push(id);
      else if (inv === 13) out.one.push(id);
      else if (inv === 21) out.main.push(id);
      else if (inv === 22) out.offw.push(id);
      else if (inv === 26) out.one.push(id);            // wands
    } else if (cls === 4) { if (inv === 14) out.shield.push(id); else if (inv === 23) out.held.push(id); }
  }
  out.embBonusIds = embBonusIds.map(String);
  return out;
}

// Wraps the JSON for fast lookups.
function make(j) {
  const kind = new Map();
  for (const k of KINDS) for (const id of j[k] || []) kind.set(String(id), k);
  const two = new Set([...kind].filter(([, k]) => k === 'two').map(([id]) => id));
  const prim = new Map();
  for (const k of ['agi', 'str', 'int']) for (const id of j[k] || []) prim.set(String(id), (prim.get(String(id)) || '') + k + ' ');
  const nosec = new Set((j.nosec || []).map(String)), sock = j.sock || {};
  return { build: j.build, two, baseSockets: id => +sock[String(id)] || 0, noSec: id => nosec.has(String(id)), prim: id => prim.get(String(id)) || null, kind: id => kind.get(String(id)) || null, embBonusIds: new Set((j.embBonusIds || []).map(String)), size: kind.size };
}

// Titan's Grip: Fury warriors (and only them) can wield a two-hander in each hand.
const isTitan = text => /^\s*warrior\s*=/mi.test(String(text)) && /^\s*spec\s*=\s*fury\b/mi.test(String(text));

module.exports = { ITEMS_URL, KINDS, parse, make, isTitan };
