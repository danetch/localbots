#!/usr/bin/env node
// Fill / refresh the BigWigs-sourced timings of a fight file (lib/bigwigs.js). Mechanics whose times come from real logs are left alone.
//   node tools/bw-update.js data/fights/<fight>.json path/to/BigWigs/<Raid>/<Boss>.lua [--write]
// Without --write it only prints the changes. Lines marked "check" need a human decision (several durations in one condition).
const fs = require('fs'), B = require('../lib/bigwigs');
const [fightFile, modFile] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!fightFile || !modFile) { console.error('usage: bw-update.js <fight.json> <Module.lua> [--write]'); process.exit(1); }
const def = JSON.parse(fs.readFileSync(fightFile, 'utf8')), bw = B.parse(fs.readFileSync(modFile, 'utf8')), ch = B.plan(def, bw);
const unmatched = Object.values(bw.mechanics).filter(b => !Object.values(def.mechanics).some(m => B.match(m, { mechanics: { x: b } })));
for (const c of ch) console.log(`${c.difficulty.padEnd(8)} ${c.label.padEnd(32)} ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}  (bar ${c.bar})${c.check ? '  CHECK: ' + c.check : ''}`);
if (unmatched.length) console.log(`BigWigs bars without a mechanic in the file: ${unmatched.map(b => `${b.fn} ${JSON.stringify(b.stages)}`).join(', ')}`);
if (!ch.length) console.log('Nothing to change.');
if (process.argv.includes('--write') && ch.length) { fs.writeFileSync(fightFile, JSON.stringify(B.apply(def, ch), null, 1) + '\n'); console.log(`written ${fightFile} — run node tools/make-data.js`); }
