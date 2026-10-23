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
  // Branches that already hold more embellished items than allowed are cut at once (crafted variants are mostly embellished).
  const embOf = o => Object.values(o).reduce((n, v) => n + (isEmb(v, rules) ? 1 : 0), 0);
  const embOpts = options.map(opts => opts.map(embOf));
  const rec = (i, acc, e) => {
    if (++visited > 5e6) throw new Error('Too many combinations to enumerate: reduce the number of candidate items.');
    if (i === options.length) return leaf(acc);
    options[i].forEach((o, j) => { const e2 = e + embOpts[i][j]; if (e2 <= rules.maxEmb) rec(i + 1, { ...acc, ...o }, e2); });
  };
  rec(0, {}, 0);
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

// Upper bound of the number of combinations of the pools (rules may remove some): product of pool sizes, pairs for rings/trinkets.
function estimate(pools) {
  let n = 1;
  for (const [key, items] of Object.entries(pools)) n *= PAIRS[key] ? Math.max(1, items.length * (items.length - 1) / 2) : Math.max(1, items.length);
  return n;
}
// Pre-screen for big pools: one single-swap diff per candidate (rings/trinkets tried in both slots). -> [{ key, item, diff }]
function singleSwaps(parsed, base, rules) {
  const out = [], eq = new Set(Object.values(parsed.equipped).flat());
  for (const [key, items] of Object.entries(parsed.pools)) for (const item of items) {
    if (eq.has(item)) continue;
    for (const slot of PAIRS[key] || [key]) {
      const other = PAIRS[key] && PAIRS[key].find(x => x !== slot);
      if (other && base[other] && idOf(base[other]) === idOf(item)) continue;
      const diff = { [slot]: item };
      if (slot === 'main_hand' && clearsOff(item, rules)) diff.off_hand = '';
      if (slot === 'off_hand' && (clearsOff(base.main_hand, rules) || badWeapons({ ...base, ...diff }, rules))) continue;
      out.push({ key, item, diff });
    }
  }
  return out;
}
// Keeps the equipped items, then adds the other candidates best single-swap gain first, wherever they are, as long as the estimate stays
// under `limit` (a slot with several strong candidates keeps more of them). gain: item -> best single-swap gain. -> { kept, dropped }
// groupOf (optional): item -> group key (e.g. crafted slot + embellishment). The best item of every group is added first, so no group
// disappears entirely, then the rest best-first.
function prunePools(parsed, gain, limit, origPools, groupOf) {
  const eq = new Set(Object.values(parsed.equipped).flat()), orig = Object.entries(origPools || parsed.pools).map(([k, v]) => [k, [...v]]);
  for (const [key, items] of orig) parsed.pools[key] = items.filter(i => eq.has(i));
  const rest = orig.flatMap(([key, items]) => items.filter(i => !eq.has(i)).map(item => ({ key, item, g: gain(item) ?? -Infinity })))
    .sort((a, b) => b.g - a.g);
  const dropped = [], firsts = new Set(), seenG = new Set();
  if (groupOf) for (const c of rest) { const g = groupOf(c.item); if (g && !seenG.has(g)) { seenG.add(g); firsts.add(c); } }
  for (const c of [...firsts, ...rest.filter(c => !firsts.has(c))]) {
    const pool = parsed.pools[c.key]; pool.push(c.item);
    if (estimate(parsed.pools) > limit) { pool.pop(); dropped.push(c.item); }
  }
  for (const [key, items] of orig) parsed.pools[key] = items.filter(i => parsed.pools[key].includes(i));   // original order
  return { kept: rest.length - dropped.length, dropped };
}

function baseSlots(equipped) {
  const base = {};
  for (const [key, items] of Object.entries(equipped)) {
    if (PAIRS[key]) PAIRS[key].forEach((s, i) => base[s] = items[i]);
    else base[key] = items[0];
  }
  return base;
}

module.exports = { estimate, singleSwaps, prunePools, baseSlots, idOf, isEmb, isTwoHand, clearsOff, badWeapons, titanPools, parse, combos, toProfilesets };
