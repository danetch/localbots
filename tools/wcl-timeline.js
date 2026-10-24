#!/usr/bin/env node
// Boss cast timelines from Warcraft Logs (lib/wcl.js), e.g. during PTR raid testing, printed as fight-file timings.
//   WCL_CLIENT_ID=.. WCL_CLIENT_SECRET=.. node tools/wcl-timeline.js --encounter 3421 --difficulty 5 [--top 20]
//   ... --zone <PTR zone id> --encounter <id> [--days 14] [--kills]      (public reports of a zone: raid testing)
//   ... --zones                                                            (list zones to find the PTR one)
// Difficulty: 3 normal, 4 heroic, 5 mythic. Prints per ability: median time of each cast and a cycle suggestion (times + repeat).
const W = require('../lib/wcl');
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; }, has = k => process.argv.includes('--' + k);
(async () => {
  const c = W.client({ id: process.env.WCL_CLIENT_ID, secret: process.env.WCL_CLIENT_SECRET });
  if (has('zones')) { for (const z of await c.zones()) console.log(z.id, z.name, z.expansion?.name || '', z.frozen ? '(frozen)' : '', z.encounters.map(e => `${e.id} ${e.name}`).join(' · ')); return; }
  const enc = +arg('encounter'); if (!enc) throw new Error('--encounter <id> needed');
  const list = arg('zone') ? await c.zoneFights(+arg('zone'), enc, { start: Date.now() - (+arg('days') || 14) * 864e5, kills: has('kills') })
    : await c.topKills(enc, +arg('difficulty') || 4, +arg('top') || 20);
  console.error(`${list.length} fights…`);
  const fights = []; for (const x of list) { try { fights.push(await c.fight(x.code, x.fightID)); } catch (e) { console.error(`${x.code}#${x.fightID}: ${e.message}`); } }
  const A = W.aggregate(fights);
  console.log(`${A.n} fights, median length ${A.duration}s` + (Object.keys(A.phases).length ? ', phases ' + Object.entries(A.phases).map(([id, [t, n]]) => `${id}@${t}s(${n})`).join(' ') : ''));
  for (const [id, a] of Object.entries(A.abilities).sort((x, y) => x[1].casts[0][0] - y[1].casts[0][0])) {
    const ts = a.casts.map(([t]) => t), cy = W.cycle(ts);
    console.log(`${String(id).padEnd(9)} ${a.name.slice(0, 30).padEnd(30)} ${a.casts.map(([t, n]) => `${t}(${n})`).join(' ')}  =>  times ${JSON.stringify(cy.times)}${cy.repeat ? ' repeat ' + cy.repeat : ''}`);
  }
  if (arg('json')) require('fs').writeFileSync(arg('json'), JSON.stringify(A, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
