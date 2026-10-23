// Boss fights: a fight JSON (data/fights/*.json, derived from BigWigs timers + boss guides) -> simc `raid_events+=/...` strings.
// simc options used (verified in engine/sim/raid_event.cpp and with a real simc build): timestamps=a:b:c (absolute, increasing; cannot be
// combined with first/last/first_pct), duration, count, health (adds), player_chance, multiplier (vulnerable, damage_done_buff).
// NOTE: never pass fight_style=Patchwerk together with these events: simc clears raid_events for Patchwerk.
//
// Format v2:
//   stages: [{ id, at: seconds } | { id, atPct: % of the fight length }]        (stage 1 defaults to 0)
//   mechanics: { key: { label, type: adds|movement|vulnerable|invulnerable|damage_done_buff, stage (default 1), duration, count, health,
//                       chance, multiplier, untilEnd, timesFrom: bigwigs|guide|assumed, assumed:[sizes that are guesses] } }
//   difficulties: { id: { label, times: { key: [t..] | { "<stage>": [t..] } }, repeat: { key: period } } }
//   times are seconds after the start of the mechanic's stage (or per stage when an object); `repeat` repeats them every `period` seconds until the stage ends.
const fs = require('fs'), path = require('path');
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const TYPES = new Set(['adds', 'movement', 'vulnerable', 'invulnerable', 'damage_done_buff']);

function list(dirs) {
  const out = [];
  for (const d of dirs) {
    let files = []; try { files = fs.readdirSync(d).filter(f => f.endsWith('.json')); } catch { continue; }
    for (const f of files) {
      try { const j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); if (j.id && j.difficulties && j.mechanics) { const i = out.findIndex(x => x.id === j.id); if (i >= 0) out[i] = j; else out.push(j); } } catch { /* ignore broken file */ }
    }
  }
  return out;
}

// -> [{ id, start, end }] in seconds, sorted; stages starting at or after the fight length are dropped.
function stageBounds(def, length) {
  const st = (def.stages?.length ? def.stages : [{ id: 1, at: 0 }])
    .map(s => ({ id: +s.id, start: s.atPct != null ? Math.round(length * s.atPct / 100) : (s.at || 0) }))
    .filter(s => s.start < length).sort((a, b) => a.start - b.start);
  return st.map((s, i) => ({ ...s, end: i + 1 < st.length ? st[i + 1].start : length }));
}

// Absolute times (s) of one mechanic.
function times(def, diff, key, bounds) {
  const m = def.mechanics[key], d = def.difficulties[diff]; if (!m || !d) return [];
  const raw = d.times?.[key]; if (!raw) return [];
  const per = Array.isArray(raw) ? { [m.stage || 1]: raw } : raw, rep = d.repeat?.[key], out = [];
  for (const [sid, list] of Object.entries(per)) {
    const b = bounds.find(x => x.id === +sid); if (!b) continue;
    for (const t of list) {
      for (let k = 0; k < 60; k++) { const a = b.start + t + (rep > 0 ? k * rep : 0); if (a >= b.end) break; out.push(a); if (!(rep > 0)) break; }
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

// -> { length, difficulty, stages:[{id,at}], events:[ 'raid_events+=/…' ], summary:[{label,type,stage,times,assumed,timesFrom}] }
function build(def, { difficulty, duration } = {}) {
  if (!def.difficulties[difficulty]) difficulty = Object.keys(def.difficulties)[0];
  const length = Math.max(60, Math.floor(duration || def.defaultDuration || 300)), bounds = stageBounds(def, length);
  const events = [], summary = [];
  for (const [key, m] of Object.entries(def.mechanics)) {
    if (!TYPES.has(m.type)) continue;
    const ts = times(def, difficulty, key, bounds); if (!ts.length) continue;
    const o = [`name=${slug(key)}`];
    if (m.type === 'damage_done_buff') {
      o.push(`multiplier=${m.multiplier}`, `duration=${Math.max(1, length - ts[0])}`, `timestamps=${ts[0]}`);
    } else {
      o.push(`timestamps=${ts.join(':')}`);
      if (m.duration) o.push(`duration=${m.duration}`);
      if (m.type === 'adds') o.push(`count=${m.count || 1}`, ...(m.health ? [`health=${m.health}`] : []));
      if (m.type === 'vulnerable') o.push(`multiplier=${m.multiplier}`);
      if (m.chance) o.push(`player_chance=${m.chance}`);
    }
    events.push(`raid_events+=/${m.type},${o.join(',')}`);
    summary.push({ label: m.label, type: m.type, stage: m.stage || 1, times: ts, assumed: m.assumed || [], timesFrom: m.timesFrom || 'assumed' });
  }
  return { length, difficulty, stages: bounds.map(b => ({ id: b.id, at: b.start })), events, summary };
}

module.exports = { list, build, times, stageBounds };
