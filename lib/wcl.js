// Warcraft Logs API v2 (GraphQL, https://www.warcraftlogs.com/v2-api-docs/warcraft/): boss cast timelines from real reports, including
// raid-testing logs on the PTR / beta, aggregated like Lorrgs (median time of the n-th cast of each ability). Needs an API client
// (free, https://www.warcraftlogs.com/api/clients): client credentials flow. Works in Node 18+ and in a browser page on warcraftlogs.com
// (same-origin fetch), so it can be driven from the dev sandbox through the user's browser.
// VERIFIED against the real API on 24 Oct 2026 (user's client, run in the browser on warcraftlogs.com): login, fightRankings speed JSON
// ({ page, hasMorePages, count, rankings: [{ duration, report: { code, fightID } }] }), fights + phaseTransitions, paginated enemy Casts.
// 8 fastest Mythic Twin Fangs kills: Caustic Deluge 9/70 repeat 155, Venomous Emergence 36/97 repeat 155, Sanguine Storm 136/291 = Lorrgs.
// Abilities can share a name across ids (two "Caustic Deluge"): keep the id. Player abilities can show up (Anti-Magic Zone): ignore.
const API = 'https://www.warcraftlogs.com/api/v2/client', TOKEN = 'https://www.warcraftlogs.com/oauth/token';

function client({ id, secret, fetch: f = globalThis.fetch, btoa: b64 = s => Buffer.from(s).toString('base64') }) {
  let token = null;
  async function auth() {
    if (token) return token;
    const r = await f(TOKEN, { method: 'POST', headers: { Authorization: 'Basic ' + b64(`${id}:${secret}`), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
    if (!r.ok) throw new Error(`Warcraft Logs login failed (${r.status}): check the client id and secret`);
    return (token = (await r.json()).access_token);
  }
  async function q(query, variables = {}) {
    const r = await f(API, { method: 'POST', headers: { Authorization: 'Bearer ' + await auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
    const j = await r.json(); if (!r.ok || j.errors) throw new Error('Warcraft Logs: ' + (j.errors?.map(e => e.message).join('; ') || r.status));
    return j.data;
  }
  return {
    q,
    // zones of the current expansion (find the PTR / beta raid zone id)
    zones: async () => (await q('{ worldData { zones { id name frozen expansion { id name } encounters { id name } } } }')).worldData.zones,
    // fastest kills (speed rankings) -> [{ code, fightID }]
    topKills: async (encounterID, difficulty, n = 20) => {
      const d = await q('query($e:Int!,$d:Int!){ worldData { encounter(id:$e) { name fightRankings(difficulty:$d, metric:speed) } } }', { e: encounterID, d: difficulty });
      return (d.worldData.encounter.fightRankings?.rankings || []).slice(0, n).map(r => ({ code: r.report.code, fightID: r.report.fightID }));
    },
    // public reports of a zone in a time window (PTR testing) -> [{ code, fightID }] kills and wipes of `encounterID`
    zoneFights: async (zoneID, encounterID, { start = Date.now() - 14 * 864e5, end = Date.now(), kills = false, max = 30 } = {}) => {
      const out = [];
      for (let page = 1; page <= 5 && out.length < max; page++) {
        const d = await q('query($z:Int!,$s:Float!,$e:Float!,$p:Int!){ reportData { reports(zoneID:$z, startTime:$s, endTime:$e, limit:25, page:$p) { has_more_pages data { code fights { id encounterID kill } } } } }', { z: zoneID, s: start, e: end, p: page });
        for (const r of d.reportData.reports.data) for (const fi of r.fights || []) if (fi.encounterID === encounterID && (!kills || fi.kill)) out.push({ code: r.code, fightID: fi.id });
        if (!d.reportData.reports.has_more_pages) break;
      }
      return out.slice(0, max);
    },
    // one kill, light: length, phases and the raid's lust events (lib/lust.js ids) -> { duration, kill, phases: [{ id, t }], events: [{ t, type, abilityGameID }] }
    lustFight: async (code, fightID) => {
      const L = require('./lust'), ids = [...L.SATED, ...L.LUST].join(',');
      const d = await q(`query($c:String!,$f:[Int]!){ reportData { report(code:$c) { fights(fightIDs:$f) { id startTime endTime kill phaseTransitions { id startTime } }
          masterData { actors(type:"Player") { id name subType } } } } }`, { c: code, f: [fightID] });
      const F = d.reportData.report.fights[0], cls = Object.fromEntries((d.reportData.report.masterData?.actors || []).map(a => [a.id, a.subType]));
      const e = await q(`query($c:String!,$f:[Int]!,$s:Float!,$e:Float!,$x:String!){ reportData { report(code:$c) {
          events(fightIDs:$f, startTime:$s, endTime:$e, dataType:All, filterExpression:$x, limit:500) { data } } } }`,
        { c: code, f: [fightID], s: F.startTime - 5000, e: F.endTime, x: `type in ("applybuff","applydebuff") and ability.id in (${ids})` });
      return { duration: (F.endTime - F.startTime) / 1000, kill: F.kill, phases: (F.phaseTransitions || []).map(p => ({ id: p.id, t: (p.startTime - F.startTime) / 1000 })),
        events: (e.reportData.report.events.data || []).map(x => ({ t: Math.max(0, (x.timestamp - F.startTime) / 1000), type: x.type, abilityGameID: x.abilityGameID,
          target: x.targetID, source: x.sourceID, targetClass: cls[x.targetID] || null, sourceClass: cls[x.sourceID] || null })) };
    },
    // one fight: enemy casts relative to the pull, phases, length -> { duration, kill, difficulty, phases: [{ id, t }], casts: [{ t, id, name }] }
    fight: async (code, fightID) => {
      const d = await q(`query($c:String!,$f:[Int]!){ reportData { report(code:$c) {
          fights(fightIDs:$f) { id startTime endTime kill difficulty encounterID phaseTransitions { id startTime } }
          masterData { abilities { gameID name } } } } }`, { c: code, f: [fightID] });
      const R = d.reportData.report, F = R.fights[0], names = Object.fromEntries((R.masterData.abilities || []).map(a => [a.gameID, a.name]));
      const casts = []; let start = F.startTime;
      for (let i = 0; i < 20 && start != null; i++) {
        const e = await q(`query($c:String!,$f:[Int]!,$s:Float!,$e:Float!){ reportData { report(code:$c) {
            events(fightIDs:$f, dataType:Casts, hostilityType:Enemies, startTime:$s, endTime:$e, limit:10000) { data nextPageTimestamp } } } }`, { c: code, f: [fightID], s: start, e: F.endTime });
        const ev = e.reportData.report.events;
        for (const x of ev.data || []) if (x.type === 'cast') casts.push({ t: (x.timestamp - F.startTime) / 1000, id: x.abilityGameID, name: names[x.abilityGameID] || String(x.abilityGameID) });
        start = ev.nextPageTimestamp ?? null;
      }
      return { duration: (F.endTime - F.startTime) / 1000, kill: F.kill, difficulty: F.difficulty, phases: (F.phaseTransitions || []).map(p => ({ id: p.id, t: (p.startTime - F.startTime) / 1000 })), casts };
    },
  };
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
// fights -> { n, duration, phases: { id: [median t, count] }, abilities: { id: { name, casts: [[median t of n-th cast, fights]] } } }
// Casts of the same ability closer than `gap` s are one cast (multi-target / channel ticks).
function aggregate(fights, { gap = 4, minShare = 0.3 } = {}) {
  const per = {}, ph = {};
  for (const [fi, F] of fights.entries()) {
    const last = {}; F.key = F.key ?? fi;
    for (const c of [...F.casts].sort((a, b) => a.t - b.t)) {
      if (last[c.id] != null && c.t - last[c.id] < gap) continue; last[c.id] = c.t;
      const A = per[c.id] = per[c.id] || { name: c.name, byN: [], counts: {} }, n = A.counts[F.key] = (A.counts[F.key] || 0) + 1;
      (A.byN[n - 1] = A.byN[n - 1] || []).push(c.t);
    }
    for (const p of F.phases || []) (ph[p.id] = ph[p.id] || []).push(p.t);
  }
  const N = fights.length, abilities = {};
  for (const [id, A] of Object.entries(per)) {
    const casts = A.byN.map(ts => [Math.round(median(ts)), ts.length]).filter(([, k]) => k >= Math.max(1, Math.ceil(N * minShare)));
    if (casts.length) abilities[id] = { name: A.name, casts };
  }
  return { n: N, duration: Math.round(median(fights.map(f => f.duration))), phases: Object.fromEntries(Object.entries(ph).map(([id, t]) => [id, [Math.round(median(t)), t.length]])), abilities };
}
// Cast times -> fight-file form: { times: [first..], repeat } when the gaps settle into a cycle, else { times: [all] }.
function cycle(ts, tol = 4) {
  if (ts.length < 3) return { times: ts };
  for (let k = 1; k <= Math.floor(ts.length / 2); k++) {             // pattern of k casts repeating every P seconds
    const P = ts[k] - ts[0]; if (P < 15) continue;
    if (ts.every((t, i) => i < k || Math.abs(t - ts[i - k] - P) <= tol)) return { times: ts.slice(0, k), repeat: P };
  }
  return { times: ts };
}
module.exports = { client, aggregate, cycle, median };
