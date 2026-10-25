#!/usr/bin/env node
// Next season in testing: writes data/season-ptr.json, progression-ptr.json, crafted-ptr.json from new Adventure Guide instances of the
// PTR or beta (lib/season.js draft). Only RAIDS count (Map.InstanceType 2); other instances (dungeons, delves) are ignored. When a preview
// already exists, the new raid(s) are added to it. Needs wago.tools (GitHub Actions or a PC; blocked in the Claude sandbox).
//   node tools/season-draft.js --instances 1310,1311 [--game wowt|wow_beta] [--build 12.2.0.x]
// Prints the to-do list; exit code 0 also when nothing was written (no raid among the instances).
const fs = require('fs'), path = require('path'), { readTable, trackGroups } = require('../lib/loot'), seasonLib = require('../lib/season');
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const data = path.join(__dirname, '..', 'data'), rd = f => { try { return JSON.parse(fs.readFileSync(path.join(data, f), 'utf8')); } catch { return null; } };
const wr = (f, j) => fs.writeFileSync(path.join(data, f), JSON.stringify(j, null, 1) + '\n');

(async () => {
  const game = arg('game') || 'wowt', ids = new Set((arg('instances') || '').split(',').filter(Boolean));
  if (!ids.size) throw new Error('pass --instances <JournalInstance ids>');
  const build = arg('build') || (await (await fetch('https://wago.tools/api/builds/latest')).json())[game]?.version;
  if (!build) throw new Error(`no ${game} build on wago.tools`);
  const get = async n => { process.stderr.write(`${n}… `); const r = await fetch(`https://wago.tools/db2/${n}/csv?build=${build}`); if (!r.ok) throw new Error(`${n}: ${r.status}`); return r.text(); };
  const inst = readTable(await get('JournalInstance'), { id: ['ID'], name: ['Name_lang'], map: ['MapID'] }, o => ids.has(o.id));
  const maps = new Set(inst.map(i => i.map)), raidMaps = new Set(readTable(await get('Map'), { id: ['ID'], it: ['InstanceType'] }, o => maps.has(o.id) && o.it === '2').map(r => r.id));
  const raids = inst.filter(i => raidMaps.has(i.map));
  if (!raids.length) { console.log(`\nNo raid among instance(s) ${[...ids].join(', ')} (${inst.map(i => i.name).join(', ') || 'not found'}): nothing written.`); return; }
  const rids = new Set(raids.map(r => r.id));
  const encs = readTable(await get('JournalEncounter'), { id: ['ID'], name: ['Name_lang'], inst: ['JournalInstanceID'], order: ['OrderIndex'] }, o => rids.has(o.inst));
  const encIds = new Set(encs.map(e => e.id));
  const items = new Set(readTable(await get('JournalEncounterItem'), { enc: ['JournalEncounterID'], item: ['ItemID'] }, o => encIds.has(o.enc)).map(r => r.item));
  let groups = [];
  try { const G = trackGroups({ xTree: await get('ItemXBonusTree'), treeNode: await get('ItemBonusTreeNode'), bonus: await get('ItemBonus') }, items); groups = [...new Set(Object.values(G).flat())]; }
  catch (e) { console.error(`\nupgrade tracks not read: ${e.message}`); }
  // tier set id: newest simc season profile folder (profiles/MID3) if simc has it already
  let tierSet = null;
  try {
    const st = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.github', 'watch-state.json'), 'utf8')).values?.simc?.profiles || [];
    const live = rd('season.json').season.tierSet, m = /^(.*?)(\d+)$/.exec(live), cand = st.filter(p => m && p.startsWith(m[1]) && +p.slice(m[1].length) > +m[2]).sort();
    tierSet = cand.at(-1) || null;
  } catch {}
  const prevSeason = rd('season-ptr.json');
  const live = { season: rd('season.json'), progression: rd('progression.json'), crafted: rd('crafted.json') };
  const d = seasonLib.draft({ live, prev: prevSeason ? { season: prevSeason, progression: rd('progression-ptr.json'), crafted: rd('crafted-ptr.json') } : null,
    raids: raids.map(r => ({ id: r.id, name: r.name, bosses: encs.filter(e => e.inst === r.id).sort((a, b) => a.order - b.order).map(e => e.name) })), groups, game, build, tierSet });
  if (!d.added.length) { console.log('\nRaid(s) already in data/season-ptr.json: nothing written.'); return; }
  wr('season-ptr.json', d.season); wr('progression-ptr.json', d.progression); wr('crafted-ptr.json', d.crafted);
  console.log(`\n${prevSeason ? 'Updated' : 'Written'} data/season-ptr.json (${d.season.season.id}, ${d.season.game} build ${build}): added ${d.added.join(', ')}.`);
  console.log('To do before merging:\n' + d.todo.map(t => '- [ ] ' + t).join('\n'));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `season=${d.season.season.id}\nadded=${d.added.join(', ')}\n`);
})().catch(e => { console.error(e.message); process.exit(1); });
