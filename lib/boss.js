// Boss fights: a fight JSON (data/fights/*.json, derived from BigWigs timers + boss guides) -> simc `raid_events+=/...` strings.
// simc options used (verified in engine/sim/raid_event.cpp and with a real simc build): timestamps=a:b:c (absolute, increasing; cannot be
// combined with first/last/first_pct), duration, count, health (adds), player_chance, multiplier (vulnerable, damage_done_buff).
// NOTE: never pass fight_style=Patchwerk together with these events: simc clears raid_events for Patchwerk.
//
// Format v2:
//   stages: [{ id, at: seconds } | { id, atPct: % of the fight length }]        (stage 1 defaults to 0)
//   mechanics: { key: { label, type: adds|movement|vulnerable|invulnerable|damage_done_buff, stage (default 1), duration, count, health,
//                       chance, multiplier, untilEnd, timesFrom: bigwigs|guide|assumed, assumed:[sizes that are guesses] } }
//   difficulties: { id: { label, duration (typical kill, s), stages (overrides the fight's stages for this difficulty),
//                         times: { key: [t..] | { "<stage>": [t..] } }, repeat: { key: period }, checked: "real-log comparison note" } }
//   times are seconds after the start of the mechanic's stage (or per stage when an object); `repeat` repeats them every `period` seconds until the stage ends.
//   bosses: [{ name, present: { "<stage>": offset seconds } }]  extra bosses with their OWN health pool, close enough to be cleaved (council
//            fights). simc: desired_targets = 1 + bosses.length (extra enemies are Dummy_Enemy_1..n, full bosses for the whole fight); a boss
//            is made invulnerable outside the stages listed in `present` (all stages when omitted) and ignore_invulnerable_targets=1 removes
//            invulnerable enemies from target lists, so cleave/AoE and active-enemy counts follow (verified in simc source: player.cpp, sim.cpp).
//   mechanic.allBosses: true on an invulnerable mechanic applies it to every boss (e.g. both bosses submerge).
//   Bosses fought by separate groups (split raid, e.g. Entombed Sentinels) are NOT listed: a DPS player only hits one of them.
const fs = require('fs'), path = require('path');
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const TYPES = new Set(['adds', 'movement', 'vulnerable', 'invulnerable', 'damage_done_buff']);

// o.keep(dir, file, text) -> false skips a file (e.g. an untouched user copy).
function list(dirs, o = {}) {
  const out = [];
  for (const d of dirs) {
    let files = []; try { files = fs.readdirSync(d).filter(f => f.endsWith('.json')); } catch { continue; }
    for (const f of files) {
      try { const text = fs.readFileSync(path.join(d, f), 'utf8'); if (o.keep && !o.keep(d, f, text)) continue; const j = JSON.parse(text); if (j.id && j.difficulties && j.mechanics) { const i = out.findIndex(x => x.id === j.id); if (i >= 0) out[i] = j; else out.push(j); } } catch { /* ignore broken file */ }
    }
  }
  return out;
}

// -> [{ id, start, end }] in seconds, sorted; stages starting at or after the fight length are dropped.
function stageBounds(def, length, difficulty) {
  const own = def.difficulties?.[difficulty]?.stages;
  const st = (own?.length ? own : def.stages?.length ? def.stages : [{ id: 1, at: 0 }])
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

// Invulnerable windows [start, end) of extra boss `b` outside the stages where it is present.
function absentWindows(b, bounds) {
  if (!b.present) return [];
  const out = [];
  for (const s of bounds) {
    const off = b.present[s.id];
    if (off == null) out.push([s.start, s.end]);
    else if (off > 0) out.push([s.start, Math.min(s.end, s.start + off)]);
  }
  return out.reduce((a, w) => { const l = a[a.length - 1]; if (l && l[1] >= w[0]) l[1] = Math.max(l[1], w[1]); else a.push([...w]); return a; }, []);
}
const invulEvents = (name, target, wins) => {
  const by = new Map(); for (const [a, b] of wins) if (b > a) by.set(b - a, [...(by.get(b - a) || []), a]);
  return [...by].map(([d, ts], i) => `raid_events+=/invulnerable,name=${name}${by.size > 1 ? '_' + (i + 1) : ''},target=${target},timestamps=${ts.sort((x, y) => x - y).join(':')},duration=${d}`);
};

// -> { length, difficulty, stages:[{id,at}], targets, extraArgs:[...], bosses:[{name,present}], events:[ 'raid_events+=/…' ], summary:[{label,type,stage,times,assumed,timesFrom}] }
function build(def, { difficulty, duration } = {}) {
  if (!def.difficulties[difficulty]) difficulty = Object.keys(def.difficulties)[0];
  const length = Math.max(60, Math.floor(duration || def.difficulties[difficulty].duration || def.defaultDuration || 300)), bounds = stageBounds(def, length, difficulty);
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
  // Council fights: extra bosses (Dummy_Enemy_1..n), absent outside their stages, and sharing "all bosses" invulnerable windows.
  const extra = def.bosses || [], extraArgs = [];
  if (extra.length) {
    extraArgs.push('ignore_invulnerable_targets=1');
    const shared = [];
    for (const [key, m] of Object.entries(def.mechanics)) if (m.type === 'invulnerable' && m.allBosses)
      for (const t of times(def, difficulty, key, bounds)) shared.push([t, Math.min(length, t + (m.duration || 1))]);
    extra.forEach((b, i) => {
      const wins = [...absentWindows(b, bounds), ...shared].sort((x, y) => x[0] - y[0]);
      events.push(...invulEvents(`${slug(b.name)}_away`, `Dummy_Enemy_${i + 1}`, wins));
    });
  }
  return { length, difficulty, stages: bounds.map(b => ({ id: b.id, at: b.start })), targets: 1 + extra.length, extraArgs,
    bosses: [def.mainBoss || def.name.split(' — ')[0], ...extra.map(b => b.name)], present: extra.map(b => ({ name: b.name, absent: absentWindows(b, bounds) })), events, summary };
}

// Equipped item level from a /simc export: average over the equipped slots (shirt/tabard excluded), each item's level from ilevel= or the
// "# Name (N)" comment the addon writes above it; a main hand without an off hand counts twice (two-hander), as in the game.
const GEAR = /^(head|neck|shoulders?|back|chest|wrists?|hands|waist|legs|feet|finger[12]|trinket[12]|main_hand|off_hand)=/;
function equippedIlvl(text) {
  const by = {}; let prev = '';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.trim();
    if (l.startsWith('#')) { prev = l; continue; }
    const m = GEAR.exec(l);
    if (m) { const n = +((/(?:^|,)ilevel=(\d+)/.exec(l) || [])[1] || (/\((\d{3})\)\s*$/.exec(prev) || [])[1] || 0); if (n) by[m[1].replace(/^(shoulder|wrist)s$/, '$1')] = n; }
    prev = '';
  }
  const v = Object.entries(by); if (v.length < 8) return null;          // not a full export
  const sum = v.reduce((a, [, n]) => a + n, 0) + (by.main_hand && !by.off_hand ? by.main_hand : 0);
  return Math.round(sum / (v.length + (by.main_hand && !by.off_hand ? 1 : 0)));
}
// Typical kill length (s) for a raid at item level `ilvl` (Warcraft Logs median guild kill per item level bracket). Brackets are made
// monotonic (a lower item level never kills faster); outside them the nearest bracket is extended at ~1 % DPS per item level (simc, 4 specs).
const PER_ILVL = 1.0095;
function killLength(def, difficulty, ilvl) {
  const d = def.difficulties[difficulty] || {}, k = d.kills;
  if (!k) return { length: d.duration || def.defaultDuration || 300, from: 'default' };
  const B = (k.byIlvl || []).map(([mid, sec, n]) => ({ mid, sec, n })).sort((a, b) => a.mid - b.mid);
  for (let i = B.length - 2; i >= 0; i--) B[i].sec = Math.max(B[i].sec, B[i + 1].sec);
  if (!ilvl || !B.length) return { length: k.median, from: 'median', kills: k.kills };
  let sec, at;
  if (ilvl <= B[0].mid) { sec = B[0].sec * PER_ILVL ** (B[0].mid - ilvl); at = B[0]; }
  else if (ilvl >= B[B.length - 1].mid) { at = B[B.length - 1]; sec = at.sec / PER_ILVL ** (ilvl - at.mid); }
  else { const i = B.findIndex(b => b.mid >= ilvl), a = B[i - 1], b = B[i], t = (ilvl - a.mid) / (b.mid - a.mid); sec = a.sec + t * (b.sec - a.sec); at = t < 0.5 ? a : b; }
  return { length: Math.round(sec), from: 'ilvl', ilvl, bracket: `${at.mid - 1}-${at.mid + 1}`, kills: at.n };
}

module.exports = { list, build, times, stageBounds, killLength, equippedIlvl };
