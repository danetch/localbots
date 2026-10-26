// Bloodlust timing of boss fights, measured on real kills (Warcraft Logs) and turned into simc's bloodlust_time.
// simc (engine/sim/sim.cpp bloodlust_check_t, checked 26 Oct 2026): with override.bloodlust (optimal_raid=1 or the raid-buff checkbox) lust is
// cast once, when sim time >= bloodlust_time (default 0 = at the pull), or when the target's health < bloodlust_percent (> 0), or, with a
// negative bloodlust_time, when the target is that many seconds from dying.
//
// Fight file (per difficulty):  "bloodlust": { "stage": 2, "after": 3 }   N seconds after that stage starts (stretches with the fight length)
//                               "bloodlust": { "pct": 42 }                at 42 % of the kill
//   plus "from": "logs", "checked": "<kills, spread, date>".
// Detection: the first Sated-type debuff on the raid (Sated, Exhaustion, Temporal Displacement, Fatigued: every lust and drums apply one) or
// the first lust buff, whichever comes first.
const SATED = [57724, 57723, 80354, 264689, 390435];
const LUST = [2825, 32182, 80353, 264667, 390386];
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const quart = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };

// events [{ timestamp, type, abilityGameID }] (fight time base already removed, seconds) -> first lust time and how many separate lusts
function lustTimes(events) {
  const ts = events.filter(e => (e.type === 'applydebuff' && SATED.includes(e.abilityGameID)) || (e.type === 'applybuff' && LUST.includes(e.abilityGameID)))
    .map(e => e.t).sort((a, b) => a - b);
  const out = []; for (const t of ts) if (!out.length || t - out[out.length - 1] > 30) out.push(t);   // one lust = many players within seconds
  return out;
}

// kills [{ lust: seconds | null, duration, phases: [{ id, t }] }], def = fight file (stage ids) -> bloodlust entry or null
// Stage-anchored when >= 60 % of the kills lust within 20 s after the start of the same stage (and our fight file knows that stage),
// else a share of the kill length. Stage 1 near 0 = at the pull.
function classify(kills, def, { minKills = 5 } = {}) {
  const K = kills.filter(k => k.lust != null && k.duration > 0);
  if (K.length < minKills) return null;
  const at = K.map(k => {
    const ph = [{ id: 1, t: 0 }, ...(k.phases || [])].filter(p => p.t <= k.lust + 3).sort((a, b) => a.t - b.t).pop();
    return { stage: +ph.id, after: Math.max(0, k.lust - ph.t), pct: k.lust / k.duration * 100 };
  });
  const by = {}; for (const a of at) (by[a.stage] ??= []).push(a);
  const [st, list] = Object.entries(by).sort((a, b) => b[1].length - a[1].length)[0];
  const ok = list.filter(a => a.after <= 20), known = +st === 1 || (def?.stages || []).some(s => +s.id === +st) || Object.values(def?.difficulties || {}).some(d => (d.stages || []).some(s => +s.id === +st));
  const second = kills.filter(k => k.count > 1).length, spread = v => `${Math.round(quart(v, 0.25))}-${Math.round(quart(v, 0.75))}`;
  const note = s => `${s} (${K.length} of the fastest Warcraft Logs kills; ${second ? second + ' with a second lust, not modelled' : 'one lust each'})`;
  if (known && ok.length >= 0.6 * K.length) {
    const after = Math.round(median(ok.map(a => a.after)));
    return { stage: +st, after, from: 'logs', checked: note(`first lust ${after} s after the start of stage ${st} in ${ok.length} kills (IQR ${spread(ok.map(a => a.after))} s)`) };
  }
  const pct = Math.round(median(at.map(a => a.pct)));
  return { pct, from: 'logs', checked: note(`first lust at ${pct} % of the kill (IQR ${spread(at.map(a => a.pct))} %, ${Math.round(median(K.map(k => k.lust)))} s median)`) };
}

// bloodlust entry + stage bounds (lib/boss.js stageBounds) + fight length -> seconds after the pull, or null (pull)
function seconds(entry, bounds, length) {
  if (!entry) return null;
  if (entry.stage != null) { const b = bounds.find(x => x.id === +entry.stage); if (!b) return null; return Math.min(length - 1, Math.round(b.start + (entry.after || 0))); }
  if (entry.pct != null) return Math.min(length - 1, Math.round(length * entry.pct / 100));
  if (entry.time != null) return Math.min(length - 1, Math.round(entry.time));
  return null;
}

// Fight-card choice -> simc options. o = { mode: 'auto'|'pull'|'time'|'pct', value, auto: seconds|null }
function args(o = {}) {
  if (o.mode === 'pct' && o.value > 0 && o.value < 100) return [`bloodlust_percent=${Math.round(o.value)}`, 'bloodlust_time=9999'];   // health only
  const t = o.mode === 'time' ? o.value : o.mode === 'pull' ? 0 : o.auto;
  return t > 0 ? [`bloodlust_time=${Math.round(t)}`] : [];
}

module.exports = { SATED, LUST, lustTimes, classify, seconds, args, median };
