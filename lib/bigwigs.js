// BigWigs boss modules (github.com/BigWigsMods/BigWigs). Since Midnight they have no timer tables: ENCOUNTER_TIMELINE_EVENT_ADDED picks
// the mechanic from the bar's ROUNDED INITIAL DURATION (`rounded == 12`, `durationRounded == 44`), optionally inside `if stage == 2`.
// For bars queued at a stage start that number is the first cast, in seconds after the stage start; later cycles are not in the module.
// parse(src) -> { mechanics: { fn: { fn, key, name, stages: { "<stage>": [s..] }, mythic } } }   (fn = module function, e.g. AlluringBubble;
// key = BigWigs option key = usually a spell id; name = the module's comment for that key)
function parse(src) {
  const L = String(src).split(/\r?\n/), names = {}, keyOf = {}, out = {};
  for (const l of L) { const m = /^\s*\{?\[?(\d{5,8})\]?[^-\n]*--\s*(.+)$/.exec(l) || /^\s*(\d{5,8}),\s*--\s*(.+)$/.exec(l); if (m && !names[m[1]]) names[m[1]] = m[2].trim(); }
  for (let i = 0; i < L.length; i++) {
    const f = /^function mod:(\w+)\(/.exec(L[i]); if (!f) continue;
    for (let j = i + 1; j < Math.min(i + 14, L.length) && !/^function /.test(L[j]); j++) { const k = /key\s*=\s*(\d+)/.exec(L[j]) || /self:(?:Message|Bar|CDBar)\((\d{5,8})/.exec(L[j]); if (k) { keyOf[f[1]] = k[1]; break; } }
  }
  let fn = null, nums = [], stage = null, mythic = null, fnMythic = null;
  for (const l of L) {
    // any handler with a rounded-duration ladder; per-difficulty handlers (Twin Fangs: MythicEvents) set the difficulty
    const f = /^function mod:(\w+)\(/.exec(l); if (f) { fn = f[1]; nums = []; stage = null; mythic = /mythic/i.test(fn) ? true : /heroic|normal|easy|lfr/i.test(fn) ? false : null; fnMythic = mythic; continue; }
    if (!fn) continue;
    const s = /stage\s*==\s*(\d+)/.exec(l); if (s) stage = s[1];
    const r = [...l.matchAll(/rounded\s*==\s*(\d+)/gi)].map(m => +m[1]); if (r.length && /\b(if|elseif)\b/.test(l)) { nums = r; mythic = fnMythic; }
    if (/self:Mythic\(\)/.test(l) && /\bif\b/.test(l)) mythic = /\bnot\b/.test(l) ? false : true; else if (/^\s*else\s*$/.test(l) && mythic !== null) mythic = !mythic;
    const b = /barInfo\s*=\s*(?:trackBar\()?self:(\w+)\(/.exec(l);
    if (b && nums.length) {
      const M = out[b[1]] = out[b[1]] || { fn: b[1], key: keyOf[b[1]] ? +keyOf[b[1]] : null, name: names[keyOf[b[1]]] || null, stages: {}, mythic: null };
      const st = stage || '1'; M.stages[st] = [...new Set([...(M.stages[st] || []), ...nums])].sort((a, c) => a - c);
      if (nums.length > 1) M.several = true;   // one condition with several durations: repeats, or one value per difficulty (Sszorak)
      if (mythic !== null) M.mythic = mythic;
    }
    if (/self:HandleBar|^end/.test(l)) stage = null;
  }
  return { mechanics: out };
}
const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
// Bar for a fight mechanic: same spell id as the BigWigs key, else same name (module function or key comment).
function match(mech, bw) {
  const all = Object.values(bw.mechanics);
  return all.find(b => mech.spell && b.key === mech.spell) || all.find(b => norm(b.fn) === norm(mech.label) || norm(b.name) === norm(mech.label)) || null;
}
// Proposed changes for a fight definition. Only mechanics whose times are not from real logs are touched (timesFrom none / bigwigs /
// assumed). -> [{ key, label, bar, difficulty, from, to }]
function plan(def, bw) {
  const out = [];
  for (const [key, m] of Object.entries(def.mechanics)) {
    if (!['none', 'bigwigs', 'assumed', undefined].includes(m.timesFrom)) continue;
    const b = match(m, bw); if (!b) continue;
    const to = Object.keys(b.stages).length === 1 && b.stages[m.stage || 1] ? b.stages[m.stage || 1] : b.stages;
    for (const [d, D] of Object.entries(def.difficulties)) {
      if (b.mythic === true && !/myth/i.test(d)) continue;
      if (b.mythic === false && /myth/i.test(d)) continue;
      const from = D.times?.[key];
      if (JSON.stringify(from) !== JSON.stringify(to)) out.push({ key, label: m.label, bar: b.fn, difficulty: d, from: from ?? null, to, check: b.several ? 'several durations in one condition: repeats, or one per difficulty?' : null });
    }
  }
  return out;
}
function apply(def, changes) {
  for (const c of changes) { const D = def.difficulties[c.difficulty]; D.times = D.times || {}; D.times[c.key] = c.to; def.mechanics[c.key].timesFrom = 'bigwigs'; }
  return def;
}
module.exports = { parse, match, plan, apply };
