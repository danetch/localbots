#!/usr/bin/env node
// Season start: the previewed season becomes the live one (lib/season.js promote). Run on a branch, review, merge on season start day.
//   node tools/season-promote.js
// - data/season.json, progression.json, crafted.json <- their -ptr versions ("game" and "todo" dropped); -ptr files deleted.
// - fights marked "ptr": true lose the flag; the others (old season) move to data/fights-archive/<old season id>/ (kept in the repo,
//   no longer listed in the app nor downloaded: the manifest only covers data/fights).
// Then run tools/make-data.js. Exit code 0 also when there is nothing to promote.
const fs = require('fs'), path = require('path'), seasonLib = require('../lib/season');
const data = path.join(__dirname, '..', 'data'), rd = f => { try { return JSON.parse(fs.readFileSync(path.join(data, f), 'utf8')); } catch { return null; } };
const wr = (f, j) => fs.writeFileSync(path.join(data, f), JSON.stringify(j, null, 1) + '\n');

const fdir = path.join(data, 'fights');
const fights = fs.readdirSync(fdir).filter(f => f.endsWith('.json')).map(f => ({ file: f, json: JSON.parse(fs.readFileSync(path.join(fdir, f), 'utf8')) }));
const p = seasonLib.promote({ season: rd('season.json'), seasonPtr: rd('season-ptr.json'), progressionPtr: rd('progression-ptr.json'), craftedPtr: rd('crafted-ptr.json'), fights });
if (!p) { console.log('Nothing to promote (no data/season-ptr.json, or it is already the live season).'); process.exit(0); }
if (!p.keep.length) console.warn(`Warning: no fight marked "ptr" for ${p.to}: the boss list will be empty after the switch.`);
wr('season.json', p.season);
if (p.progression) wr('progression.json', p.progression);
if (p.crafted) wr('crafted.json', p.crafted);
for (const f of ['season-ptr.json', 'progression-ptr.json', 'crafted-ptr.json']) fs.rmSync(path.join(data, f), { force: true });
for (const k of p.keep) wr(path.join('fights', k.file), k.json);
const arch = path.join(data, 'fights-archive', p.from || 'old');
if (p.archive.length) fs.mkdirSync(arch, { recursive: true });
for (const f of p.archive) fs.renameSync(path.join(fdir, f), path.join(arch, f));
console.log(`Promoted ${p.from} -> ${p.to}: ${p.keep.length} fight(s) now live (${p.keep.map(k => k.file).join(', ')}), ${p.archive.length} archived to data/fights-archive/${p.from}/.`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `from=${p.from}\nto=${p.to}\nkept=${p.keep.length}\narchived=${p.archive.length}\n`);
