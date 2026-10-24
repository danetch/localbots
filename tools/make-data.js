#!/usr/bin/env node
// Run after changing anything in data/ (npm test fails until you do):
//   node tools/make-data.js
// - data/manifest.json: sha256 of every data file the app can download from GitHub; `generated` changes only when a hash changes;
//   minApp = package.json "dataMinApp" (raise it when a data file needs code that older apps do not have).
// - data/shipped-hashes.json: hashes of every version of data/fights/*.json in git history (LF and CRLF), so the app can tell a user's
//   untouched "Edit…" copy from a real edit.
const fs = require('fs'), path = require('path'), { execSync } = require('child_process'), { sha } = require('../lib/datafiles');
const root = path.join(__dirname, '..'), data = path.join(root, 'data');
const FILES = ['season.json', 'progression.json', 'crafted.json', ...['season-ptr.json', 'progression-ptr.json', 'crafted-ptr.json'].filter(f => fs.existsSync(path.join(data, f))), ...fs.readdirSync(path.join(data, 'fights')).filter(f => f.endsWith('.json')).sort().map(f => 'fights/' + f)];
const files = Object.fromEntries(FILES.map(rel => [rel, sha(fs.readFileSync(path.join(data, rel)))]));
const old = (() => { try { return JSON.parse(fs.readFileSync(path.join(data, 'manifest.json'), 'utf8')); } catch { return {}; } })();
const same = old.files && JSON.stringify(old.files) === JSON.stringify(files);
const minApp = require(path.join(root, 'package.json')).dataMinApp;
const man = { generated: same && old.minApp === minApp ? old.generated : new Date().toISOString(), minApp, files };
fs.writeFileSync(path.join(data, 'manifest.json'), JSON.stringify(man, null, 1) + '\n');
if (process.argv.includes('--check-only')) process.exit(0);
const hashes = new Set();
const add = text => { for (const t of [text.replace(/\r\n/g, '\n'), text.replace(/\r?\n/g, '\r\n')]) hashes.add(sha(Buffer.from(t))); };
try {
  for (const c of execSync('git log --format=%H -- data/fights', { cwd: root }).toString().split('\n').filter(Boolean))
    for (const f of execSync(`git ls-tree --name-only ${c} data/fights/`, { cwd: root }).toString().split('\n').filter(x => x.endsWith('.json')))
      add(execSync(`git show ${c}:${f}`, { cwd: root, maxBuffer: 1 << 24 }).toString());
} catch (e) { console.error('git history not available:', e.message); }
for (const f of FILES.filter(x => x.startsWith('fights/'))) add(fs.readFileSync(path.join(data, f), 'utf8'));
const prev = (() => { try { return JSON.parse(fs.readFileSync(path.join(data, 'shipped-hashes.json'), 'utf8')); } catch { return []; } })();
for (const h of prev) hashes.add(h);
fs.writeFileSync(path.join(data, 'shipped-hashes.json'), JSON.stringify([...hashes].sort()) + '\n');
console.log(`manifest: ${FILES.length} files${same ? ' (unchanged)' : ', new version ' + man.generated}; shipped fight versions: ${hashes.size} hashes`);
