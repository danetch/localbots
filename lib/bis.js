// Best-in-Slot : montée itérative par lots (batched coordinate ascent).
// Chaque tour : (1) simulation grossière de TOUS les échanges possibles à partir du set courant,
// (2) classement par gain, (3) construction de sets cumulatifs avec les meilleurs gains compatibles,
// (4) validation fine de ces sets en un seul lot, (5) on garde le meilleur préfixe et on recommence.
const { idOf, isEmb, isTwoHand, clearsOff, badWeapons } = require('./topgear');
const tier = require('./tier');
const SLOTS_OF = { finger: ['finger1', 'finger2'], trinket: ['trinket1', 'trinket2'] };
const UNIQUE_PAIRS = [['finger1', 'finger2'], ['trinket1', 'trinket2']];

const SAFE = /^[\w:.\-]+$/;
function buildCandidates(parsed, lootItems, ilvl, rules, base, consSel = {}, consLabels = {}) {
  const out = [], seen = new Set();
  const add = (slot, item, label, src, twoHand) => {
    const k = slot + '|' + item; if (seen.has(k)) return; seen.add(k);
    if (twoHand) rules.tags[item] = { ...rules.tags[item], twoHand: true };
    out.push({ key: k, slot, item, label, src });
  };
  for (const [key, items] of Object.entries(parsed.pools)) for (const item of items)
    for (const s of SLOTS_OF[key] || [key]) add(s, item, parsed.labels[item] || item, 'Bags', isTwoHand(item, rules));
  for (const it of lootItems) for (const s of it.slots) {
    const ench = /enchant_id=\d+/.exec(base[s] || '');
    const lv = it.ilvl || ilvl;
    add(s, `,id=${it.id},ilevel=${lv}${ench ? ',' + ench[0] : ''}`, `${it.name} (${lv})`, it.sources[0], it.twoHand);
  }
  // Consommables : traités comme des « emplacements » supplémentaires (flask, food, potion, augmentation)
  for (const [cat, vals] of Object.entries(consSel || {})) for (const v of vals || [])
    if (SAFE.test(v)) add(cat, v, consLabels[v] || (v === 'disabled' ? '(none)' : v), 'Consumable', false);
  return out;
}

function apply(S, diff, rules) {
  const N = { ...S, ...diff };
  if (clearsOff(N.main_hand, rules)) N.off_hand = '';
  return N;
}
function valid(N, rules) {
  let e = 0; for (const v of Object.values(N)) if (isEmb(v, rules)) e++;
  if (e > rules.maxEmb) return false;
  for (const [a, b] of UNIQUE_PAIRS) if (N[a] && N[b] && idOf(N[a]) === idOf(N[b])) return false;
  if (rules.maxCat < Infinity && Object.values(N).filter(tier.isTwin).length > rules.maxCat) return false;
  return !badWeapons(N, rules);
}
function diffOf(S, N) {
  const d = {}; for (const k of new Set([...Object.keys(S), ...Object.keys(N)])) if ((S[k] || '') !== (N[k] || '')) d[k] = N[k] || '';
  return d;
}

// Tous les échanges valides (éventuellement composés) déclenchés par le candidat c depuis le set S.
function expand(S, c, cands, rules) {
  const out = [], push = N => { const d = diffOf(S, N); if (Object.keys(d).length && valid(N, rules)) out.push(d); };
  if (S[c.slot] === c.item) return out;
  for (const [a, b] of UNIQUE_PAIRS) if ((c.slot === a && S[b] && idOf(S[b]) === idOf(c.item)) || (c.slot === b && S[a] && idOf(S[a]) === idOf(c.item))) return out;
  const sTwo = clearsOff(S.main_hand, rules);
  // Passage 2 mains -> 1 main : il faut choisir une main gauche en même temps
  if (sTwo && c.slot === 'main_hand' && !clearsOff(c.item, rules)) {
    for (const o of cands) if (o.slot === 'off_hand') push(apply(S, { main_hand: c.item, off_hand: o.item }, rules));
    return out;
  }
  if (sTwo && c.slot === 'off_hand') return out; // couvert ci-dessus
  const N = apply(S, { [c.slot]: c.item }, rules);
  if (valid(N, rules)) { push(N); return out; }
  // Plafond d'embellissements dépassé : remplacer un autre objet embelli par une alternative non embellie
  if (isEmb(c.item, rules)) for (const [t, v] of Object.entries(N))
    if (t !== c.slot && isEmb(v, rules)) for (const a of cands)
      if (a.slot === t && !isEmb(a.item, rules)) push(apply(N, { [t]: a.item }, rules));
  return out;
}

// Choisit les meilleurs gains mutuellement compatibles (slots disjoints, règles respectées).
// drOf (optional): e -> stats it moves inside the diminishing-returns zone. When given, two picks that move the same DR-zone stat are
// not stacked (their gains were measured separately and do not add up under DR): the second one is re-measured next round instead.
function pickWinners(S, entries, rules, minGain, maxK, drOf) {
  const picked = []; let N = S; const used = new Set(), usedDr = new Set();
  for (const e of [...entries].sort((a, b) => b.gain - a.gain)) {
    if (e.gain <= minGain || picked.length >= maxK) break;
    const keys = Object.keys(e.diff);
    if (keys.some(k => used.has(k))) continue;
    const dr = drOf ? drOf(e) : [];
    if (dr.some(s => usedDr.has(s))) continue;
    const M = apply(N, e.diff, rules);
    if (!valid(M, rules)) continue;
    N = M; keys.forEach(k => used.add(k)); dr.forEach(s => usedDr.add(s)); picked.push({ entry: e, after: N });
  }
  return picked;
}

// Joint moves "gear-side change + consumable" that must be simulated together because both move the same stat inside the DR zone
// (lib/dr.js interacts). g = gear/enchant/gem entries, c = consumable entries, both with .d (rating deltas) and .gain.
function drPairs(S, gear, cons, rules, base, conv, interacts, max = 40) {
  const out = [], seen = new Set();
  for (const g of gear) for (const c of cons) {
    if (Object.keys(g.diff).some(k => k in c.diff)) continue;
    const shared = interacts(base, g.d, c.d, conv); if (!shared.length) continue;
    const N = apply(apply(S, g.diff, rules), c.diff, rules); if (!valid(N, rules)) continue;
    const d = diffOf(S, N), k = JSON.stringify(d); if (seen.has(k)) continue; seen.add(k);
    out.push({ diff: d, score: g.gain + c.gain, shared });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

// Candidats « jumeaux Catalyst » : pour chaque candidat de tête/épaules/torse/mains/jambes, la pièce de tier de la classe
// qui garde l'objet d'origine (stats, effets, niveau d'objet) via redirected_base_stats.
function addCatalyst(cands, tierSet, rules) {
  const out = [...cands], seen = new Set(cands.map(c => c.key));
  for (const c of cands) {
    const tid = tierSet.slots[c.slot]; if (!tid || c.src === 'Consumable') continue;
    const tw = tier.twin(tier.withIlvl(c.item, c.label), tid); if (!tw) continue;
    const key = c.slot + '|' + tw; if (seen.has(key)) continue; seen.add(key);
    if (rules.tags[c.item]?.emb !== undefined) rules.tags[tw] = { emb: rules.tags[c.item].emb };
    out.push({ key, slot: c.slot, item: tw, label: `${c.label} → tier`, src: `Catalyst ← ${c.src}`, twin: true });
  }
  return out;
}

// Mouvements groupés pour les bonus de set : à partir des gains unitaires, on garde le meilleur jumeau par emplacement
// puis on teste tous les sous-ensembles de 2 à 5 pièces converties ensemble (les bonus 2P/4P ne se voient qu'ainsi).
function tierGroups(S, entries, rules) {
  const best = {};
  for (const e of entries) {
    if (!e.from?.twin || e.gain === undefined) continue;
    const ks = Object.keys(e.diff); if (ks.length !== 1) continue;
    if (!best[ks[0]] || e.gain > best[ks[0]].gain) best[ks[0]] = e;
  }
  const slots = Object.keys(best), out = [], seen = new Set();
  for (let m = 1; m < 1 << slots.length; m++) {
    const pick = slots.filter((_, i) => m >> i & 1); if (pick.length < 2) continue;
    let N = S; for (const s of pick) N = apply(N, best[s].diff, rules);
    const d = diffOf(S, N), k = JSON.stringify(d);
    if (valid(N, rules) && !seen.has(k)) { seen.add(k); out.push(d); }
  }
  return out;
}

// Tier-aware pairs: replacing a set piece by a non-tier piece usually loses the 2/4-piece bonus, so on its own it looks bad (and could be
// dropped) even when the piece is much stronger. Paired with a tier piece in another tier slot that is not tier yet (bag/loot tier item or
// a Catalyst conversion), the bonus is kept and the real value shows. tierIds: { slot: tier item id }.
function tierSwaps(S, entries, rules, tierIds, max = 30) {
  if (!tierIds) return [];
  const isTier = (slot, it) => !!it && !!tierIds[slot] && idOf(it) === String(tierIds[slot]);
  const single = entries.filter(e => e.gain !== undefined && Object.keys(e.diff).length === 1);
  const bestTier = {};
  for (const e of single) { const [t] = Object.keys(e.diff); if (isTier(t, e.diff[t]) && !isTier(t, S[t]) && (!bestTier[t] || e.gain > bestTier[t].gain)) bestTier[t] = e; }
  const breakers = single.filter(e => { const [t] = Object.keys(e.diff); return tierIds[t] && isTier(t, S[t]) && e.diff[t] && !isTier(t, e.diff[t]); })
    .sort((a, b) => b.gain - a.gain).slice(0, 15);
  const out = [], seen = new Set();
  for (const e of breakers) for (const [t, b] of Object.entries(bestTier)) {
    if (t in e.diff) continue;
    const N = apply(apply(S, e.diff, rules), b.diff, rules); if (!valid(N, rules)) continue;
    const d = diffOf(S, N), k = JSON.stringify(d); if (seen.has(k)) continue; seen.add(k);
    out.push({ diff: d, from: e.from, score: e.gain + b.gain });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

const withSet = (text, S) => `${text}\n${Object.entries(S).map(([s, v]) => `${s}=${v || ''}`).join('\n')}\n`;
// Objets artisanaux (avec ou sans embellissement) comme candidats supplémentaires.
function addCrafted(cands, vars, rules) {
  const seen = new Set(cands.map(c => c.key)), out = [...cands];
  for (const v of vars) {
    const key = v.slot + '|' + v.item; if (seen.has(key)) continue; seen.add(key);
    if (v.twoHand) rules.tags[v.item] = { ...rules.tags[v.item], twoHand: true };
    out.push({ key, slot: v.slot, item: v.item, label: v.label, src: 'Crafted' });
  }
  return out;
}

module.exports = { apply, valid, drPairs, tierSwaps, addCrafted, addCatalyst, tierGroups, buildCandidates, expand, pickWinners, diffOf, withSet };
