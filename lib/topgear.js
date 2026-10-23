// Parse l'export de l'addon SimulationCraft et génère les combinaisons Top Gear.
const SINGLE = ['head','neck','shoulder','back','chest','wrist','hands','waist','legs','feet','main_hand','off_hand'];
const PAIRS = { finger: ['finger1','finger2'], trinket: ['trinket1','trinket2'] };
const LINE = /^(#\s*)?(\w+)=(,?id=.+)$/;

function idOf(item) { const m = /id=(\d+)/.exec(item); return m ? m[1] : item; }

function parse(text) {
  const pools = {}, equipped = {}, labels = {};
  let lastComment = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m = LINE.exec(line);
    if (!m) { if (line.startsWith('#') && !/^#\s*(talents=|saved\s+loadout)/i.test(line)) lastComment = line.replace(/^#\s*/, ''); continue; }
    const isBag = !!m[1], slot = m[2], item = m[3];
    const key = /[12]$/.test(slot) ? slot.slice(0, -1) : slot;
    if (!SINGLE.includes(key) && !PAIRS[key]) continue;
    pools[key] = pools[key] || [];
    if (!pools[key].includes(item)) pools[key].push(item);
    if (lastComment) { labels[item] = lastComment; lastComment = ''; }
    if (!isBag) (equipped[key] = equipped[key] || []).push(item);
  }
  return { pools, equipped, labels };
}

// rules: { tags: {itemString: {twoHand, emb}}, embBonusIds: Set<string>, maxEmb: 2 }
function isEmb(item, rules) {
  if (!item) return false;
  if (rules.tags[item]?.emb !== undefined) return !!rules.tags[item].emb;
  const m = /bonus_id=([\d\/:]+)/.exec(item);
  return (!!m && m[1].split(/[\/:]/).some(b => rules.embBonusIds.has(b))) || /(^|,)embellishment=(?!none\b)\w+/.test(item);
}
// Une arme à deux mains : donnée du jeu (rules.twoHandIds, issue de simc) ou marquage explicite (rules.tags, objets artisanaux).
const isTwoHand = (item, rules) => !!(item && (rules.tags?.[item]?.twoHand || rules.twoHandIds?.has(idOf(item))));
// Une 2M libère la main gauche, sauf Titan's Grip (guerrier Fury : une 2M dans chaque main).
const clearsOff = (item, rules) => !rules.titan && isTwoHand(item, rules);
// Combinaison d'armes impossible : 2M en main gauche hors Titan's Grip, ou même exemplaire dans les deux mains.
const badWeapons = (full, rules) => (!rules.titan && isTwoHand(full.off_hand, rules)) || !!(full.main_hand && full.main_hand === full.off_hand);

function combos({ pools, equipped }, rules, limit = 200000) {
  rules = { tags: {}, embBonusIds: new Set(), maxEmb: 2, maxCat: Infinity, ...rules };
  const options = [];
  for (const [key, items] of Object.entries(pools)) {
    if (PAIRS[key]) {
      const [s1, s2] = PAIRS[key], opts = [];
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++)
          if (idOf(items[i]) !== idOf(items[j])) opts.push({ [s1]: items[i], [s2]: items[j] });
      if (opts.length) options.push(opts);
    } else options.push(items.map(i => ({ [key]: i })));
  }
  const base = {};
  for (const [key, items] of Object.entries(equipped)) {
    if (PAIRS[key]) PAIRS[key].forEach((s, i) => base[s] = items[i]);
    else base[key] = items[0];
  }
  const out = [], seen = new Set();
  let visited = 0;
  const leaf = acc => {
    const full = { ...base, ...acc };
    // Armes : une 2M interdit la main gauche ; même objet impossible dans les deux mains
    if (clearsOff(full.main_hand, rules)) full.off_hand = '';
    else if (badWeapons(full, rules)) return;
    // Embellissements : plafond sur l'ensemble de l'équipement porté
    let emb = 0;
    for (const v of Object.values(full)) if (isEmb(v, rules)) emb++;
    if (emb > rules.maxEmb) return;
    if (rules.maxCat < Infinity && Object.values(full).filter(v => /redirected_base_stats=/.test(v || '')).length > rules.maxCat) return;
    const diff = {};
    for (const [s, v] of Object.entries(full)) if ((base[s] || '') !== (v || '')) diff[s] = v;
    if (!Object.keys(diff).length) return;
    const k = JSON.stringify(diff);
    if (seen.has(k)) return;
    seen.add(k);
    if (out.length >= limit) throw new Error(`More than ${limit} combinations: reduce the number of candidate items.`);
    out.push(diff);
  };
  const rec = (i, acc) => {
    if (++visited > 5e6) throw new Error('Too many combinations to enumerate: reduce the number of candidate items.');
    if (i === options.length) return leaf(acc);
    for (const o of options[i]) rec(i + 1, { ...acc, ...o });
  };
  rec(0, {});
  return out;
}

// Titan's Grip : les armes du sac proposées en main droite le sont aussi en main gauche.
function titanPools(parsed, rules) {
  if (!rules.titan || !parsed.pools.main_hand) return;
  const off = parsed.pools.off_hand = parsed.pools.off_hand || [];
  for (const it of parsed.pools.main_hand) if (!off.includes(it)) off.push(it);
}

function toProfilesets(list) {
  return list.map((c, i) =>
    Object.entries(c).map(([s, v]) => `profileset."c${i}"+=${s}=${v}`).join('\n')).join('\n');
}

function baseSlots(equipped) {
  const base = {};
  for (const [key, items] of Object.entries(equipped)) {
    if (PAIRS[key]) PAIRS[key].forEach((s, i) => base[s] = items[i]);
    else base[key] = items[0];
  }
  return base;
}

module.exports = { baseSlots, idOf, isEmb, isTwoHand, clearsOff, badWeapons, titanPools, parse, combos, toProfilesets };
