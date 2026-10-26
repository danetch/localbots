#!/usr/bin/env node
// Bloodlust timing per boss and difficulty from real kills (lib/lust.js): the fastest Warcraft Logs kills (speed rankings) of each fight in
// data/fights, first lust of each kill, classified as "N s after stage S" or "P % of the kill".
//   WCL_CLIENT_ID=... WCL_CLIENT_SECRET=... node tools/wcl-lust.js [--zone 53] [--n 15] [--write] [--only kithix,sszorak]
// --write updates difficulties[d].bloodlust in data/fights/*.json when it is new or moved (stage / >= 3 s / >= 3 %), or always with --force
// (refreshes the `checked` notes, e.g. after a detection change); then run tools/make-data.js.
// Zone: data/season.json sources.warcraftLogsZone (or data/season-ptr.json for fights marked "ptr"). Runs where the WCL secrets are
// (GitHub Actions: .github/workflows/fight-data.yml); warcraftlogs.com is blocked in the Claude sandbox.
const fs = require('fs'), path = require('path'), bossLib = require('../lib/boss'), L = require('../lib/lust');
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; }, has = k => process.argv.includes('--' + k);
const data = path.join(__dirname, '..', 'data'), rd = f => { try { return JSON.parse(fs.readFileSync(path.join(data, f), 'utf8')); } catch { return null; } };
const DIFF = { normal: 3, heroic: 4, mythic: 5 };
const key = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const moved = (a, b) => !a || !b || (a.stage ?? null) !== (b.stage ?? null) || Math.abs((a.after ?? 0) - (b.after ?? 0)) >= 3 || Math.abs((a.pct ?? 0) - (b.pct ?? 0)) >= 3;

(async () => {
  const env = process.env;
  if (!env.WCL_CLIENT_ID || !env.WCL_CLIENT_SECRET) throw new Error('WCL_CLIENT_ID / WCL_CLIENT_SECRET are not set');
  const wcl = require('../lib/wcl').client({ id: env.WCL_CLIENT_ID, secret: env.WCL_CLIENT_SECRET });
  const n = +(arg('n') || 15), only = arg('only') ? new Set(arg('only').split(',')) : null;
  const zoneOf = ptr => +(arg('zone') || (ptr ? rd('season-ptr.json') : rd('season.json'))?.season?.sources?.warcraftLogsZone || 0);
  const zones = await wcl.zones(), lines = [], changed = [];
  const fdir = path.join(data, 'fights');
  for (const file of fs.readdirSync(fdir).filter(f => f.endsWith('.json')).sort()) {
    const fp = path.join(fdir, file), def = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (only && !only.has(def.id)) continue;
    const z = zones.find(x => x.id === zoneOf(def.ptr));
    const names = [def.mainBoss, def.name.split(' — ')[0], def.name].filter(Boolean).map(key);
    const enc = z?.encounters?.find(e => names.includes(key(e.name)));
    if (!enc) { lines.push(`${def.id}: no Warcraft Logs encounter${z ? ` in zone ${z.name}` : ' (no zone)'}`); continue; }
    let touched = false;
    for (const [d, D] of Object.entries(def.difficulties)) {
      if (!DIFF[d]) continue;
      try {
        const top = await wcl.topKills(enc.id, DIFF[d], n), kills = [];
        for (const k of top) {
          try { const F = await wcl.lustFight(k.code, k.fightID); if (!F.kill) continue; const r = L.detect(F.events); kills.push({ lust: r.times[0] ?? null, count: r.times.length, how: r.how, duration: F.duration, phases: F.phases }); }
          catch (e) { /* private or deleted report: skip */ }
        }
        const entry = L.classify(kills, def), hows = {}; for (const k of kills) hows[k.how] = (hows[k.how] || 0) + 1;
        const was = D.bloodlust;
        lines.push(`${def.id} ${d}: ${entry ? (entry.stage != null ? `stage ${entry.stage} + ${entry.after} s` : `${entry.pct} %`) + ` — ${entry.checked}` : `not enough kills with a lust (${kills.filter(k => k.lust != null).length}/${kills.length})`}${entry && was && !moved(was, entry) ? ' (unchanged)' : ''} · detection: ${Object.entries(hows).map(([h, c]) => `${c}× ${h}`).join(', ')}`);
        if (entry && (moved(was, entry) || has('force'))) { entry.checked += `, ${new Date().toISOString().slice(0, 10)}`; D.bloodlust = entry; touched = true; }
      } catch (e) { lines.push(`${def.id} ${d}: ${e.message}`); }
    }
    if (touched) { changed.push(def.id); if (has('write')) fs.writeFileSync(fp, JSON.stringify(def, null, 1) + '\n'); }
  }
  console.log(lines.join('\n'));
  console.log(changed.length ? `\nChanged: ${changed.join(', ')}${has('write') ? ' (written)' : ' (dry run: --write to save)'}` : '\nNo change.');
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `## Bloodlust timing (Warcraft Logs)\n\n${lines.map(l => '- ' + l).join('\n')}\n`);
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `changed=${changed.join(',')}\n`);
})().catch(e => { console.error(e.message); process.exit(1); });
