// Primary stat per spec (agi / str / int). Fixed game design; key = class + spec as written in the simc export.
const BY_CLASS = { warrior: 'str', deathknight: 'str', hunter: 'agi', rogue: 'agi', priest: 'int', mage: 'int', warlock: 'int' };
const BY_SPEC = {
  paladin: { holy: 'int', protection: 'str', retribution: 'str' },
  shaman: { elemental: 'int', enhancement: 'agi', restoration: 'int' },
  druid: { balance: 'int', feral: 'agi', guardian: 'agi', restoration: 'int' },
  monk: { brewmaster: 'agi', mistweaver: 'int', windwalker: 'agi' },
  demonhunter: { havoc: 'agi', vengeance: 'agi', devourer: 'int' },
  evoker: { devastation: 'int', preservation: 'int', augmentation: 'int' },
};
const CLASSES = new Set([...Object.keys(BY_CLASS), ...Object.keys(BY_SPEC)]);
// -> 'agi' | 'str' | 'int' | null (unknown: no filtering)
function primaryOf(text) {
  const t = String(text), c = new RegExp(`^\\s*(${[...CLASSES].join('|')})\\s*=`, 'mi').exec(t)?.[1]?.toLowerCase();
  if (!c) return null;
  if (BY_CLASS[c]) return BY_CLASS[c];
  const sp = /^\s*spec\s*=\s*(\w+)/mi.exec(t)?.[1]?.toLowerCase();
  return BY_SPEC[c][sp] || null;
}
// Keeps an item unless the game data says it has primary stats and none is ours.
const fits = (primary, itemPrim) => !primary || !itemPrim || itemPrim.includes(primary);

// Weapon types a class can wield (Item subclass ids of class 2: 0/1 axe 1H/2H, 2 bow, 3 gun, 4/5 mace 1H/2H, 6 polearm, 7/8 sword 1H/2H,
// 9 warglaive, 10 staff, 13 fist, 15 dagger, 18 crossbow, 19 wand). Proficiency is per class in the game; written from game knowledge,
// NOT read from game data (unverified for Midnight). Spec-level exceptions are listed in SPEC_WEAPONS (only ones that are hard rules).
const WEAPONS_BY_CLASS = {
  warrior: [0, 1, 4, 5, 6, 7, 8, 10, 13, 15], deathknight: [0, 1, 4, 5, 6, 7, 8], paladin: [0, 1, 4, 5, 6, 7, 8],
  hunter: [0, 1, 2, 3, 6, 7, 8, 10, 13, 15, 18], shaman: [0, 1, 4, 5, 10, 13, 15], evoker: [0, 4, 7, 10, 13, 15],
  rogue: [0, 4, 7, 13, 15], monk: [0, 4, 6, 7, 10, 13], druid: [4, 5, 6, 10, 13, 15], demonhunter: [0, 7, 9, 13],
  priest: [4, 10, 15, 19], mage: [7, 10, 15, 19], warlock: [7, 10, 15, 19],
};
const SPEC_WEAPONS = { rogue: { assassination: [15] } };   // Mutilate requires daggers
const SHIELD_CLASSES = new Set(['warrior', 'paladin', 'shaman']);
const classOf = text => new RegExp(`^\\s*(${[...CLASSES].join('|')})\\s*=`, 'mi').exec(String(text))?.[1]?.toLowerCase() || null;
function weaponsOf(text) {
  const c = classOf(text); if (!c) return null;
  const sp = /^\s*spec\s*=\s*(\w+)/mi.exec(String(text))?.[1]?.toLowerCase();
  return SPEC_WEAPONS[c]?.[sp] || WEAPONS_BY_CLASS[c];
}
// false only when the class is known and cannot use shields
const canShield = text => { const c = classOf(text); return !c || SHIELD_CLASSES.has(c); };
module.exports = { primaryOf, fits, classOf, weaponsOf, canShield };
