#!/usr/bin/env node
// Season watch (run daily by .github/workflows/watch.yml): looks for the signs of the next patch / season and opens a GitHub issue
// (label "watch") when one changes. State: .github/watch-state.json (committed by the workflow). The first run only records a baseline.
//   node tools/watch.js [--dry]     env: GITHUB_TOKEN, GITHUB_REPOSITORY (issues), WCL_CLIENT_ID / WCL_CLIENT_SECRET (optional)
// Signals:
//   ptrBuild    live / PTR (wowt) / beta (wow_beta) versions from Blizzard's version service (lib/versions.js; wago.tools as fallback),
//               liveRegions = live version per region
//   seasonStart the previewed raid (data/season-ptr.json) is live AND Warcraft Logs has kills of it since it went live (liveSince):
//               the season has started -> the workflow merges the "Season start" pull request
//   ptrRaids    JournalInstance on the PTR build vs live: new Adventure Guide instances (a new raid = next season in testing)
//   betaRaids   the same on the beta build (a new expansion)
//   liveRaids   instances seen on the PTR / beta that are now in the LIVE Adventure Guide (the patch is out: season start ahead)
//   bigwigs     top-level folders of BigWigsMods/BigWigs (one per raid / zone: boss timers for a new raid)
//   simc        simc's PTR client data version (client_data_version_ptr.inc) and season profile folders (profiles/MID3...)
//   wcl         Warcraft Logs zones (a raid-testing zone appears there), only with the API client in the repo secrets
// Outputs (GITHUB_OUTPUT): changed=true|false, new_instances / new_beta_instances = <ids for tools/journal-draft.js and season-draft.js>,
// went_live = <ids now live> (season-promote pull request), season_started=true|false + season_zone (Warcraft Logs zone id).
const fs = require('fs'), path = require('path');
const STATE = path.join(__dirname, '..', '.github', 'watch-state.json');
const BW_SKIP = new Set(['.github', 'Core', 'Libs', 'Locales', 'Media', 'Options', 'Plugins', 'Tools']);

function csvIds(text) {              // JournalInstance CSV -> { id: name }
  const { readTable } = require('../lib/loot');
  return Object.fromEntries(readTable(text, { id: ['ID'], name: ['Name_lang'] }).map(r => [r.id, r.name]));
}

// Each check -> value stored in the state (plain JSON). f = fetch, gh = GitHub API GET (json), env.
async function collect({ f = fetch, gh, env = process.env, log = () => {}, old = null, previewFile = path.join(__dirname, '..', 'data', 'season-ptr.json') } = {}) {
  const out = {}, errors = [];
  const tryDo = async (k, fn) => { try { out[k] = await fn(); } catch (e) { errors.push(`${k}: ${e.message}`); log(`!! ${k}: ${e.message}`); } };
  const json = async u => { const r = await f(u); if (!r.ok) throw new Error(`${u} -> ${r.status}`); return r.json(); };
  const text = async u => { const r = await f(u); if (!r.ok) throw new Error(`${u} -> ${r.status}`); return r.text(); };
  const V = require('../lib/versions');
  await tryDo('ptrBuild', async () => {
    const one = async p => { try { return await V.product(text, p); } catch { return null; } };
    const [w, t, b] = [await one('wow'), await one('wowt'), await one('wow_beta')];
    if (!w) throw new Error('no live version (Blizzard and wago.tools)');
    out.liveRegions = Object.fromEntries(V.REGIONS.filter(r => w.regions[r]).map(r => [r, w.regions[r]]));
    return { live: V.of(w, 'us'), ptr: t ? V.of(t, 'us') : null, beta: b ? V.of(b, 'us') : null, source: w.source };
  });
  let live = null;
  const liveIds = async () => live || (live = csvIds(await text('https://wago.tools/db2/JournalInstance/csv')));
  for (const [k, prod] of [['ptrRaids', 'ptr'], ['betaRaids', 'beta']]) await tryDo(k, async () => {
    const b = out.ptrBuild?.[prod]; if (!b) return null;
    const L = await liveIds(), p = csvIds(await text(`https://wago.tools/db2/JournalInstance/csv?build=${b}`));
    return { build: b, extra: Object.fromEntries(Object.entries(p).filter(([id]) => !L[id])) };
  });
  // previewed instances (seen in an earlier run) that the live Adventure Guide has now; once there, they stay in the list
  await tryDo('liveRaids', async () => {
    const was = { ...(old?.ptrRaids?.extra || {}), ...(old?.betaRaids?.extra || {}) }, L = await liveIds();
    return Object.fromEntries([...Object.entries(old?.liveRaids || {}), ...Object.entries(was).filter(([id]) => L[id])]);
  });
  // first day each previewed instance was seen live (start of the window for the Warcraft Logs kills)
  if (out.liveRaids) out.liveSince = Object.fromEntries(Object.keys(out.liveRaids).map(id => [id, old?.liveSince?.[id] || new Date().toISOString().slice(0, 10)]));
  // season start: the raid of data/season-ptr.json is live and Warcraft Logs shows kills of its first boss since then
  const pv = (() => { try { return JSON.parse(fs.readFileSync(previewFile, 'utf8')); } catch { return null; } })();
  const previewLive = Object.entries(out.liveRaids || {}).filter(([, n]) => pv?.season?.raids?.includes(n));
  if (pv && previewLive.length && env.WCL_CLIENT_ID && env.WCL_CLIENT_SECRET) await tryDo('seasonStart', async () => {
    const wcl = require('../lib/wcl').client({ id: env.WCL_CLIENT_ID, secret: env.WCL_CLIENT_SECRET, fetch: f });
    const zones = await wcl.zones(), key = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [id, raid] of previewLive) {
      const bosses = (pv.season.raidBosses?.[raid] || []).map(key); if (!bosses.length) continue;
      const z = zones.filter(z => !z.frozen).map(z => ({ z, n: (z.encounters || []).filter(e => bosses.includes(key(e.name))).length })).sort((a, b) => b.n - a.n)[0];
      if (!z || z.n < Math.ceil(bosses.length / 2)) return { raid, started: false, why: 'no Warcraft Logs zone with its bosses yet' };
      const first = z.z.encounters.find(e => key(e.name) === bosses[0]) || z.z.encounters.find(e => bosses.includes(key(e.name)));
      const since = Date.parse(out.liveSince[id]);
      const kills = await wcl.zoneFights(z.z.id, first.id, { start: since, end: Date.now(), kills: true, max: 3 });
      return { raid, zone: z.z.id, zoneName: z.z.name, since: out.liveSince[id], started: kills.length > 0, kills: kills.length };
    }
    return null;
  });
  await tryDo('bigwigs', async () => (await gh('/repos/BigWigsMods/BigWigs/contents')).filter(x => x.type === 'dir' && !BW_SKIP.has(x.name)).map(x => x.name).sort());
  await tryDo('simc', async () => {
    const br = (await gh('/repos/simulationcraft/simc')).default_branch;
    const ver = async n => (/versioning information for ([\d.]+)/.exec(await text(`https://raw.githubusercontent.com/simulationcraft/simc/${br}/engine/dbc/generated/${n}`)) || [])[1] || null;
    const profiles = (await gh(`/repos/simulationcraft/simc/contents/profiles?ref=${br}`)).filter(x => x.type === 'dir').map(x => x.name).sort();
    return { branch: br, live: await ver('client_data_version.inc'), ptr: await ver('client_data_version_ptr.inc'), profiles };
  });
  if (env.WCL_CLIENT_ID && env.WCL_CLIENT_SECRET) await tryDo('wcl', async () => {
    const wcl = require('../lib/wcl').client({ id: env.WCL_CLIENT_ID, secret: env.WCL_CLIENT_SECRET, fetch: f });
    return (await wcl.zones()).map(z => ({ id: z.id, name: z.name, frozen: !!z.frozen })).sort((a, b) => a.id - b.id);
  });
  return { values: out, errors };
}

// old state values + new values -> [{ key, title, body, newInstances? }] (nothing for a check that failed this time)
function changes(old, now) {
  const ch = [], had = k => old && old[k] !== undefined && now[k] !== undefined;
  if (had('ptrBuild')) {
    const o = old.ptrBuild || {}, n = now.ptrBuild || {};
    if (n.ptr && n.ptr !== o.ptr) ch.push({ key: 'ptrBuild', title: `New PTR build ${n.ptr}`, body: `PTR (wowt) ${o.ptr || 'none'} → **${n.ptr}** (live ${n.live}).\n\nPolygnome: the "Season preview" setting reads this build; nothing to do unless a new raid shows up.` });
    if (n.beta && n.beta !== o.beta) ch.push({ key: 'betaBuild', title: `New beta build ${n.beta}`, body: `Beta (wow_beta) ${o.beta || 'none'} → **${n.beta}**: a new expansion is in testing (expansion.qualityRanks, crafted rules...).` });
  }
  for (const [k, label, field] of [['ptrRaids', 'PTR', 'newInstances'], ['betaRaids', 'beta', 'newBetaInstances']]) {
    if (!now[k] || !(old && k in old)) continue;    // first run of this check: baseline
    const seen = new Set(Object.keys(old[k]?.extra || {})), fresh = Object.entries(now[k].extra || {}).filter(([id]) => !seen.has(id));
    if (fresh.length) ch.push({ key: k, [field]: fresh.map(([id]) => id), title: `New Adventure Guide instance(s) on the ${label}: ${fresh.map(([, n]) => n).join(', ')}`,
      body: `${label} build ${now[k].build}: ${fresh.map(([id, n]) => `**${n}** (JournalInstance ${id})`).join(', ')} not on live.\n\nIf it is a raid, the next season is in testing: the workflow opens / updates the pull request "Next season in testing" (branch \`season-next\`: season-ptr.json drafted by tools/season-draft.js, fight drafts by tools/journal-draft.js). Review its to-do list, then merge: the Live / PTR switch becomes available in the app. HANDOFF.md, SEASON 3 RUNBOOK.` });
  }
  if (now.seasonStart?.started && !old?.seasonStart?.started) ch.push({ key: 'seasonStart', seasonStarted: true, title: `Season started: first ${now.seasonStart.raid} kills on Warcraft Logs`,
    body: `Warcraft Logs zone **${now.seasonStart.zoneName}** (${now.seasonStart.zone}) has kills of ${now.seasonStart.raid} since it went live (${now.seasonStart.since}): the season has started.\n\nThe workflow merges the "Season start" pull request (tools/season-promote.js): every installed Polygnome switches to the new season at its next start.` });
  if (had('liveRaids')) {
    const fresh = Object.entries(now.liveRaids || {}).filter(([id]) => !(old.liveRaids || {})[id]);
    if (fresh.length) ch.push({ key: 'liveRaids', wentLive: fresh.map(([id]) => id), title: `Now in the live Adventure Guide: ${fresh.map(([, n]) => n).join(', ')}`,
      body: `${fresh.map(([id, n]) => `**${n}** (JournalInstance ${id})`).join(', ')}: previewed on the PTR / beta, now live (the patch is out).\n\nIf the next season is prepared (data/season-ptr.json), the workflow opens the pull request "Season start" (branch \`season-start\`, tools/season-promote.js). Merge it on the day the season starts, not before: upgrade tracks change at the season start. HANDOFF.md, SEASON 3 RUNBOOK step 6.` });
  }
  if (had('bigwigs')) {
    const fresh = now.bigwigs.filter(x => !old.bigwigs.includes(x));
    if (fresh.length) ch.push({ key: 'bigwigs', title: `New BigWigs module folder: ${fresh.join(', ')}`, body: `BigWigsMods/BigWigs has new folder(s): ${fresh.map(x => `\`${x}\``).join(', ')}.\n\nBoss timers for new content: runbook step 5 (sparse clone, tools/bw-update.js <fight> <module>, --write after review), then add the folder to season(-ptr).json sources.bigwigs.` });
  }
  if (had('simc')) {
    const o = old.simc, n = now.simc, fresh = n.profiles.filter(x => !o.profiles.includes(x));
    if (n.ptr && n.ptr !== o.ptr) ch.push({ key: 'simcPtr', title: `simc PTR data ${n.ptr}`, body: `simc (${n.branch}) PTR client data ${o.ptr || 'none'} → **${n.ptr}** (live ${n.live}). Polygnome's PTR mode (ptr=1) uses it after a simc update.` });
    if (fresh.length) ch.push({ key: 'simcProfiles', title: `New simc profile folder(s): ${fresh.join(', ')}`, body: `simc profiles/${fresh.join(', profiles/')}: new season profiles (tier set, season id for data/season-ptr.json).` });
  }
  if (had('wcl')) {
    const ids = new Set(old.wcl.map(z => z.id)), fresh = now.wcl.filter(z => !ids.has(z.id));
    if (fresh.length) ch.push({ key: 'wcl', title: `New Warcraft Logs zone(s): ${fresh.map(z => z.name).join(', ')}`, body: `Warcraft Logs zones ${fresh.map(z => `**${z.name}** (${z.id})`).join(', ')}.\n\nRaid testing logs: tools/wcl-timeline.js --zone <id> --encounter <id> (runbook step 5).` });
  }
  return ch;
}

async function main() {
  const dry = process.argv.includes('--dry'), env = process.env, repo = env.GITHUB_REPOSITORY, token = env.GITHUB_TOKEN;
  const gh = async (p, opt = {}) => {
    const r = await fetch('https://api.github.com' + p, { ...opt, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'polygnome-watch', ...(token && { Authorization: `Bearer ${token}` }), ...opt.headers } });
    if (!r.ok) throw new Error(`GitHub ${p} -> ${r.status}`); return r.json();
  };
  const old = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null;
  const { values, errors } = await collect({ gh, log: console.log, old: old?.values });
  // a failed check keeps its previous value (no false "new" next time)
  const merged = { ...(old?.values || {}), ...values };
  const ch = old ? changes(old.values, values) : [];
  console.log(old ? `${ch.length} change(s)` : 'first run: baseline recorded, no issue');
  for (const c of ch) {
    console.log(`- ${c.title}`);
    if (!dry && repo && token) await gh(`/repos/${repo}/issues`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `[watch] ${c.title}`, body: `${c.body}\n\n_Opened by the daily season watch (tools/watch.js)._`, labels: ['watch'] }) });
  }
  if (errors.length) console.log(`Checks that failed (kept their previous value): ${errors.join(' · ')}`);
  // written only when a value changed (the workflow commits it): no daily commit when nothing moves
  if (!dry && (!old || JSON.stringify(old.values) !== JSON.stringify(merged))) fs.writeFileSync(STATE, JSON.stringify({ values: merged }, null, 1) + '\n');
  const ids = f => ch.flatMap(c => c[f] || []).join(',');
  const st = merged.seasonStart;   // reported every day while true: the merge step is idempotent (nothing to do once promoted)
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `changed=${ch.length > 0}\nnew_instances=${ids('newInstances')}\nnew_beta_instances=${ids('newBetaInstances')}\nwent_live=${ids('wentLive')}\nseason_started=${!!st?.started}\nseason_zone=${st?.started ? st.zone : ''}\n`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `## Season watch\n\n${old ? ch.map(c => `- ${c.title}`).join('\n') || 'No change.' : 'Baseline recorded.'}\n\n` +
    '```json\n' + JSON.stringify(merged, null, 1) + '\n```\n' + (errors.length ? `\nFailed checks: ${errors.join(' · ')}\n` : ''));
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { collect, changes, csvIds, BW_SKIP };
