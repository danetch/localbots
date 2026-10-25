#!/usr/bin/env node
// Draft fight files from the in-game Adventure Guide (lib/journal.js). Needs wago.tools (run on a PC, not in the dev sandbox).
//   node tools/journal-draft.js --instance <JournalInstanceID> [--build 12.2.0.xxxxx | --ptr | --beta] [--out data/fights]
//   node tools/journal-draft.js --encounters 2887,2849 [--csv <folder with JournalEncounter.csv, ...>]
// --ptr = latest PTR build (wago product "wowt"), --beta = latest beta build ("wow_beta"); drafts get "ptr": true (listed only in Season preview mode) and are never written over
// an existing file (prints the diff of mechanics instead).
const fs = require('fs'), path = require('path'), { readTable } = require('../lib/loot'), journal = require('../lib/journal');
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; }, has = k => process.argv.includes('--' + k);
(async () => {
  let build = arg('build');
  if (has('ptr') || has('beta')) build = (await (await fetch('https://wago.tools/api/builds/latest')).json())[has('beta') ? 'wow_beta' : 'wowt'].version;
  const csv = arg('csv'), get = async n => csv ? fs.readFileSync(path.join(csv, n + '.csv'), 'utf8')
    : (await (await fetch(`https://wago.tools/db2/${n}/csv${build ? '?build=' + build : ''}`)).text());
  const t = {}; for (const [k, n] of [['encounter', 'JournalEncounter'], ['section', 'JournalEncounterSection'], ['creature', 'JournalEncounterCreature'], ['spellName', 'SpellName'], ['spell', 'Spell']]) { process.stderr.write(`${n}… `); t[k] = await get(n); }
  let ids = (arg('encounters') || '').split(',').filter(Boolean);
  if (arg('instance')) { const I = new Set(arg('instance').split(',')); ids = readTable(t.encounter, { id: ['ID'], inst: ['JournalInstanceID'] }, o => I.has(o.inst)).map(r => r.id); }
  if (!ids.length) throw new Error('No encounter: pass --instance <id> or --encounters a,b');
  const out = arg('out') || path.join(__dirname, '..', 'data', 'fights');
  // kill length before any logs: this season's median kill of bosses in the same part of a raid (lib/boss.js priorLength)
  const boss = require('../lib/boss'), current = boss.list([path.join(__dirname, '..', 'data', 'fights')]).filter(f => !f.draft);
  const encs = readTable(t.encounter, { id: ['ID'], inst: ['JournalInstanceID'], order: ['OrderIndex'] });
  const lastTwo = id => { const e = encs.find(x => x.id === String(id)), same = encs.filter(x => x.inst === e?.inst).sort((a, b) => a.order - b.order); return same.length > 2 && same.slice(-2).some(x => x.id === String(id)); };
  for (const d of journal.draft(t, readTable, ids, { build, ptr: has('ptr') || has('beta') })) {
    const prior = boss.priorLength(current, lastTwo(d.encounterId));
    for (const [k, v] of Object.entries(prior)) if (d.difficulties[k]) Object.assign(d.difficulties[k], { duration: v, durationFrom: `prior: this season's median kill of ${lastTwo(d.encounterId) ? 'the last two bosses' : 'the other bosses'} of a raid` });
    const f = path.join(out, d.id + '.json'), m = Object.values(d.mechanics), sim = m.filter(x => !['unknown', 'skip'].includes(x.type));
    console.log(`\n${d.name}: ${m.length} abilities/adds, ${sim.length} simulated types, ${m.length - sim.length} to review${d.bosses ? ' · council: ' + [d.mainBoss, ...d.bosses.map(b => b.name)].join(' + ') : ''}`);
    if (fs.existsSync(f)) { const old = JSON.parse(fs.readFileSync(f, 'utf8')), had = new Set(Object.values(old.mechanics).map(x => x.spell).filter(Boolean));
      console.log(`  ${f} exists: not overwritten. New in the guide: ${m.filter(x => x.spell && !had.has(x.spell)).map(x => x.label).join(', ') || 'nothing'}`); continue; }
    fs.writeFileSync(f, JSON.stringify(d, null, 1) + '\n'); console.log('  written ' + f);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
