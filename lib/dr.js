// Secondary stat diminishing returns (DR), as simc applies them (player.cpp apply_combat_rating_dr, curve 21024 in item_scaling.inc,
// verified on build 12.1.5.70448). Input of the curve = the % a stat gets FROM RATING (base crit, talents, buffs in % are not affected).
//   0-30 % full value · 30-40 % 90 % · 40-50 % 80 % · 50-60 % 70 % · 60-80 % 60 % · 80-200 % 50 %
// Rating per 1 % at level 90 (sc_scale_data.inc __combat_ratings, row 90): crit 46, haste 44, mastery 46 (per mastery point), versatility 54.
const CURVE = [[0, 0], [30, 30], [40, 39], [50, 47], [60, 54], [80, 66], [100, 76], [200, 126]];
const PER_PCT = { 90: { crit: 46, haste: 44, mastery: 46, versatility: 54 } };
const STATS = ['crit', 'haste', 'mastery', 'versatility'];
const DR_START = 30;

// simc buffed stats (json2 players[].collected_data.buffed_stats.stats, or profileset overrides.stats) -> { crit: rating, ... }
const ratingsOf = st => st ? Object.fromEntries(STATS.map(s => [s, +st[`${s}_rating`] || 0])) : null;
const perPct = level => PER_PCT[level] || null;
// % from rating before and after DR, and how much of the next point counts (1 = full value).
function band(rating, conv) {
  const x = rating / conv; let eff = x, slope = 1;
  for (let i = 1; i < CURVE.length; i++) {
    const [a, fa] = CURVE[i - 1], [b, fb] = CURVE[i];
    if (x <= b || i === CURVE.length - 1) { slope = (fb - fa) / (b - a); eff = fa + (x - a) * slope; break; }
  }
  return { raw: x, eff, slope };
}
// Two moves (rating deltas dA, dB from the same base) interact through DR when they change the same stat and that stat is in the DR zone
// somewhere between the base and the combined total. Different stats never interact through DR (the curve is per stat).
function interacts(base, dA, dB, conv, min = 1) {
  if (!base || !dA || !dB || !conv) return [];
  return STATS.filter(s => Math.abs(dA[s] || 0) >= min && Math.abs(dB[s] || 0) >= min &&
    Math.max(base[s], base[s] + dA[s], base[s] + dB[s], base[s] + dA[s] + dB[s]) / conv[s] > DR_START);
}
// Stats a move changes that end (or start) in the DR zone.
function drStats(base, d, conv, min = 1) {
  if (!base || !d || !conv) return [];
  return STATS.filter(s => Math.abs(d[s] || 0) >= min && Math.max(base[s], base[s] + d[s]) / conv[s] > DR_START);
}
const delta = (a, b) => a && b ? Object.fromEntries(STATS.map(s => [s, (a[s] || 0) - (b[s] || 0)])) : null;
// Final summary rows for the results: [{ stat, rating, raw, eff, slope }]
function summary(st, level) {
  const r = ratingsOf(st), conv = perPct(level); if (!r || !conv) return [];
  return STATS.map(s => ({ stat: s, rating: Math.round(r[s]), ...band(r[s], conv[s]) }));
}
module.exports = { CURVE, PER_PCT, STATS, DR_START, ratingsOf, perPct, band, interacts, drStats, delta, summary };
