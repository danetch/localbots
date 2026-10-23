#!/usr/bin/env node
// Dev tool: summarises a BigWigs timeline-style boss module (see data/fights/*.json provenance).
// For every function with a `rounded == N` ladder it prints  Mechanic: [N, ...]  (N = rounded initial timeline duration, ~ seconds after pull
// for events queued at the pull; later repeats are NOT recoverable from BigWigs), plus the mechanic's spell id/name when the module names it.
// Usage: node tools/bw-extract.js path/to/Module.lua
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').split('\n');
const names = {};                                   // spell id -> comment name
for (const l of src) { const m = /^\s*\{?\[?(\d{5,7})\]?[^-\n]*--\s*(.+)$/.exec(l) || /^\s*(\d{5,7}),\s*--\s*(.+)$/.exec(l); if (m && !names[m[1]]) names[m[1]] = m[2].trim(); }
const keyOf = {};                                   // mechanic function -> key id
for (let i = 0; i < src.length; i++) { const f = /^function mod:(\w+)\(/.exec(src[i]); if (!f) continue; for (let j = i; j < Math.min(i + 12, src.length); j++) { const k = /key = (\d+)/.exec(src[j]); if (k) { keyOf[f[1]] = k[1]; break; } if (j > i && /^function /.test(src[j])) break; } }
let fn = null, nums = [], out = {}, mode = '';
for (const l of src) {
  const f = /^function mod:(\w+)\(/.exec(l); if (f) { fn = f[1]; out[fn] = {}; nums = []; continue; }
  if (!fn || !/Timeline|ENCOUNTER_TIMELINE_EVENT_ADDED/.test(fn)) continue;
  const stage = /stage == (\d)/.exec(l); if (stage) mode = 'stage' + stage[1];
  const r = [...l.matchAll(/rounded\s*==\s*(\d+)/g)].map(m => +m[1]); if (r.length && /\b(if|elseif)\b/.test(l)) nums = r;
  const b = /barInfo\s*=\s*(?:trackBar\()?self:(\w+)\(/.exec(l);
  if (b && nums.length) { const k = (mode ? mode + ' ' : '') + b[1]; (out[fn][k] = out[fn][k] || []).push(...nums); }
  if (/self:HandleBar|^end/.test(l)) mode = '';
}
for (const [f, m] of Object.entries(out)) {
  if (!Object.keys(m).length) continue;
  console.log(`== ${f}`);
  for (const [k, v] of Object.entries(m)) { const mech = k.replace(/^stage\d /, ''); const id = keyOf[mech]; console.log(`  ${k.padEnd(34)} [${[...new Set(v)].sort((a, b) => a - b).join(', ')}]${id ? '  ' + id + (names[id] ? ' ' + names[id] : '') : ''}`); }
}
