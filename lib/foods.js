// Food list for the Consumables card: only foods simc can load AND that give a damage stat, without duplicates.
// Classified by simc itself (the app's simc binary): each candidate is simulated once on a gearless "probe" character and once more on
// the same character with extra mastery, and its well-fed stats are read from the json2 buffed stats.
//   - primary stat (strength / agility / intellect)       -> kind 'primary'
//   - a secondary stat that follows the extra mastery     -> kind 'best' ("your highest secondary stat", feasts and similar)
//   - fixed secondary stats                                -> kind 'fixed' with { crit, haste, mastery, vers }
//   - nothing (stamina, speed, drinks...) or simc can't load it (Hearty foods, some recipes) -> dropped
// Then: foods with the same effect are merged (the first one keeps its name, the others are listed in `also`), and a food is dropped when
// another one of the same kind gives at least as much of each of its stats (e.g. +46 Vers vs +59 Vers, 16/16 vs 22/22 of the same pair).
// VERIFIED with simc 12.1.5.70529 on 24 Oct 2026: a gearless frost mage is the probe (fury warriors and outlaw rogues refuse to start
// without a weapon); Royal Roast +51 int, Amani Cornucopia +73 highest secondary, Glitter Skewers +59 mastery, Wise Tails +22 crit +22 vers.
const PROBE = 'mage=FoodProbe\nlevel=90\nrace=human\nrole=spell\nspec=frost\n';
const EXTRA = 'gear_mastery_rating=2000';
const SEC = { crit_rating: 'crit', haste_rating: 'haste', mastery_rating: 'mastery', versatility_rating: 'vers' };
const PRIM = ['strength', 'agility', 'intellect'];
const NAME = { crit: 'Crit', haste: 'Haste', mastery: 'Mastery', vers: 'Vers' };

// simc json2 -> { strength, agility, intellect, crit, haste, mastery, vers }
function statsOf(j) {
  const b = j?.sim?.players?.[0]?.collected_data?.buffed_stats; if (!b) return null;
  const o = {}; for (const k of PRIM) o[k] = +b.attribute?.[k] || 0; for (const [k, n] of Object.entries(SEC)) o[n] = +b.stats?.[k] || 0;
  return o;
}
const diff = (a, b) => Object.fromEntries(Object.keys(a).map(k => [k, Math.round(a[k] - b[k])]));

// effect of one food from its two probe results (and the two baselines) -> { kind, amount?, stats? } | null (no damage stat)
function effectOf(f1, f2, b1, b2) {
  if (!f1 || !f2 || !b1 || !b2) return null;
  const d1 = diff(f1, b1), d2 = diff(f2, b2);
  const prim = Math.max(...PRIM.map(k => d1[k]));
  if (prim > 0) return { kind: 'primary', amount: prim };
  const s1 = Object.values(SEC).filter(k => d1[k] > 0), s2 = Object.values(SEC).filter(k => d2[k] > 0);
  if (!s1.length) return null;
  if (s1.length === 1 && s2.length === 1 && s1[0] !== s2[0]) return { kind: 'best', amount: d1[s1[0]] };
  return { kind: 'fixed', stats: Object.fromEntries(s1.map(k => [k, d1[k]])) };
}
const keyOf = e => e.kind === 'fixed' ? 'fixed:' + Object.entries(e.stats).sort().map(([k, v]) => k + v).join(',') : `${e.kind}:${e.amount}`;
const covers = (b, a) => a.kind === b.kind && (a.kind !== 'fixed' ? b.amount >= a.amount : Object.entries(a.stats).every(([k, v]) => (b.stats[k] || 0) >= v));
const describe = e => e.kind === 'primary' ? `+${e.amount} primary stat` : e.kind === 'best' ? `+${e.amount} highest secondary stat`
  : Object.entries(e.stats).sort((x, y) => y[1] - x[1]).map(([k, v]) => `+${v} ${NAME[k]}`).join(' ');

// list: [{ value, label, id }] with `effect` set (null = dropped) -> kept list with label "<name> — <effect>" and `also` (same effect)
function reduce(list) {
  const ok = list.filter(o => o.effect), groups = new Map();
  for (const o of ok) { const k = keyOf(o.effect); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); }
  const reps = [...groups.values()].map(g => ({ ...g[0], also: g.slice(1).map(x => x.label) }));
  const kept = reps.filter(a => !reps.some(b => b !== a && covers(b.effect, a.effect) && !covers(a.effect, b.effect)));
  const order = { primary: 0, best: 1, fixed: 2 }, total = e => e.amount || Object.values(e.stats).reduce((s, v) => s + v, 0);
  return kept.sort((a, b) => order[a.effect.kind] - order[b.effect.kind] || total(b.effect) - total(a.effect) || a.label.localeCompare(b.label))
    .map(({ effect, ...o }) => ({ ...o, label: `${o.label} — ${describe(effect)}`, effect }));
}

// run(profileText) -> parsed json2 or null (simc error). Runs the probes (limited concurrency) and returns { list, dropped }.
async function classify(list, run, { concurrency = 4, onProgress = () => {} } = {}) {
  const sim = (food, extra = '') => run(`${PROBE}food=${food}\n${extra}\n`).then(statsOf).catch(() => null);
  const [b1, b2] = await Promise.all([sim('disabled'), sim('disabled', EXTRA)]);
  if (!b1 || !b2) throw new Error('simc could not run the food probe');
  const out = list.map(o => ({ ...o })); let i = 0, done = 0;
  const worker = async () => { while (i < out.length) { const o = out[i++]; const f1 = await sim(o.value); o.effect = f1 ? effectOf(f1, await sim(o.value, EXTRA), b1, b2) : null; onProgress(++done, out.length); } };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  const kept = reduce(out), keptIds = new Set(kept.flatMap(k => [k.value]));
  return { list: kept, dropped: out.filter(o => !keptIds.has(o.value)).map(o => o.label) };
}

// Without simc (or if the probe fails): Hearty foods are the regular ones that survive death (simc can't load them), so they are dropped.
const HEARTY = /^hearty\b/i;
const preFilter = list => (list || []).filter(o => !HEARTY.test(o.label || ''));

module.exports = { PROBE, EXTRA, statsOf, effectOf, reduce, classify, describe, preFilter };
