// Enchants, gems and sockets.
// Data: simc's generated tables (verified on build 12.1.5.70448):
//   permanent_enchant.inc       { enchant_id, rank, item_class, inventory-type mask, subclass mask, "tokenized_name" }
//   spell_item_enchantment.inc  { id, 8 numbers, {types}, {amounts}, {stat ids | spell ids}, {coefficients}, src spell, "name" }
//                               type 5 = stat (item_mod ids: 3 agi, 4 str, 5 int, 71 agi/str/int, 72 agi/str, 73 agi/int, 74 str/int,
//                               32 crit, 36 haste, 40 vers, 49 mastery, 7 sta, 61 speed, 62 leech, 63 avoidance), 3 = equip spell, 4 = armor
//   gem_data.inc                { gem property id, enchant id, socket color mask, gem colour family } // description
//   item_data.inc               gems = item class 3; gem_properties and crafting_quality are the last fields of a row
//   item_bonus.inc              type 6 = add value_1 socket(s) of colour value_2
// "Current expansion" = enchant / gem families whose best quality rank is exactly 2 (Midnight crafting has 2 ranks; The War Within and
// Dragonflight had 3, older content none). Checked on 12.1.5: the rule selects exactly the Midnight enchants and gems.
// simc does NOT check socket counts (enchants.cpp initialize_gem applies every gem_id entry), so socket counts are ours to model:
// neck/rings: at least 1 (Midnight rule), head/wrist/waist: +1 with a Radiant Jewelbinder (option), plus sockets from bonus ids and
// from the gems already in the export.
const RAW = 'https://raw.githubusercontent.com/simulationcraft/simc/master/engine/dbc/generated/';
const URLS = { perm: RAW + 'permanent_enchant.inc', ie: RAW + 'spell_item_enchantment.inc', gemData: RAW + 'gem_data.inc', bonus: RAW + 'item_bonus.inc' };
const PRIM = { 3: ['agi'], 4: ['str'], 5: ['int'], 71: ['agi', 'str', 'int'], 72: ['agi', 'str'], 73: ['agi', 'int'], 74: ['str', 'int'] };
const SEC = { 32: 'crit', 36: 'haste', 40: 'versatility', 49: 'mastery' };
const SLOT_INV = { head: [1], neck: [2], shoulder: [3], shoulders: [3], wrists: [9], chest: [5, 20], waist: [6], legs: [7], feet: [8], wrist: [9], hands: [10], finger1: [11], finger2: [11], back: [16] };
const SOCKET_ORDER = ['neck', 'finger1', 'finger2', 'head', 'wrist', 'wrists', 'waist', 'back', 'shoulder', 'shoulders', 'chest', 'hands', 'legs', 'feet', 'main_hand', 'off_hand', 'trinket1', 'trinket2'];
const JEWELBINDER = ['head', 'wrist', 'wrists', 'waist'];   // 'wrists'/'shoulders': simc profile spelling (the addon writes wrist/shoulder)
const ALWAYS_SOCKETED = ['neck', 'finger1', 'finger2'];

// ---------- parsing (Update loot data / tools/build-enhance.js) ----------
const lines = t => String(t).split(/\r?\n/);
const nums = s => s.split(',').map(x => x.trim()).filter(Boolean).map(x => parseFloat(x));   // C float literals end with 'f'
function parseIE(text) {
  const re = /^\s*\{\s*(\d+),(?:\s*-?\d+,){8}\s*\{([^}]*)\},\s*\{([^}]*)\},\s*\{([^}]*)\},\s*\{([^}]*)\},\s*-?\d+,\s*"((?:[^"\\]|\\.)*)"/, out = new Map();
  for (const l of lines(text)) {
    const m = re.exec(l); if (!m) continue;
    const t = nums(m[2]), st = nums(m[4]), c = nums(m[5]), stats = [];
    for (let i = 0; i < 3; i++) if (t[i]) stats.push({ type: t[i], stat: st[i], coef: c[i] || 0 });
    out.set(+m[1], { stats, name: m[6].replace(/\s*\|A:[^|]*\|a\s*$/, '').trim() });
  }
  return out;
}
function parsePerm(text) {
  const re = /^\s*\{\s*(\d+),\s*(\d+),\s*(-?\d+),\s*(0x[0-9a-f]+),\s*(0x[0-9a-f]+),\s*"([^"]+)"/i, out = [];
  for (const l of lines(text)) { const m = re.exec(l); if (m) out.push({ id: +m[1], rank: +m[2], cls: +m[3], inv: parseInt(m[4], 16), sub: parseInt(m[5], 16), token: m[6] }); }
  return out;
}
function parseGemProps(text) {
  const re = /^\s*\{\s*(\d+),\s*(\d+),\s*(0x[0-9a-f]+),\s*(\d+)\s*\},?\s*(?:\/\/\s*(.*))?$/i, out = new Map();
  for (const l of lines(text)) { const m = re.exec(l); if (m) out.set(+m[1], { enchant: +m[2], color: +m[4], desc: (m[5] || '').trim() }); }
  return out;
}
// Gem items: { id, name, cq, gp }
function parseGemItems(itemText) {
  const re = /^\s*\{ "((?:[^"\\]|\\.)*)",\s*(\d+),(.*)\{\s*-?\d+,\s*-?\d+,\s*-?\d+\s*\},\s*(\d+),\s*-?\d+,\s*-?\d+,\s*-?\d+,\s*-?\d+,\s*(\d+)\s*\},?\s*$/, out = [];
  for (const l of lines(itemText)) {
    if (l.indexOf('"') < 0) continue;
    const m = re.exec(l); if (!m) continue;
    const f = m[3].split(','); if (+f[9] !== 3 || !+m[4]) continue;
    out.push({ id: +m[2], name: m[1], cq: +m[5], gp: +m[4] });
  }
  return out;
}
function parseSocketBonuses(text) {
  const re = /^\s*\{\s*\d+,\s*(\d+),\s*6,\s*(-?\d+),/, out = {};
  for (const l of lines(text)) { const m = re.exec(l); if (m && +m[2] > 0) out[m[1]] = (out[m[1]] || 0) + +m[2]; }
  return out;
}
const SMALL = new Set(['of', 'the', 'and']);
const pretty = token => token.replace(/^enchant_\w+?__/, '').split('_').filter(Boolean).map((w, i) => i && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1)).join(' ');

// -> { build, enchants: [{ id, ids, token, name, cls, inv, sub, stats }], gems: [{ id, ids, name, color, stats, diamond, desc }], socketBonus }
function build({ perm, ie, gemData, itemData, bonus }) {
  const IE = parseIE(ie), P = parsePerm(perm), fam = new Map();
  for (const r of P) { const f = fam.get(r.token) || []; f.push(r); fam.set(r.token, f); }
  const enchants = [];
  for (const [token, rows] of fam) {
    const top = Math.max(...rows.map(r => r.rank)); if (top !== 2) continue;
    const r = rows.find(x => x.rank === 2), e = IE.get(r.id); if (!e) continue;
    const name = /^Enchant /.test(e.name) ? e.name.replace(/^Enchant [^-]+-\s*/, '') : pretty(token);
    enchants.push({ id: r.id, ids: rows.map(x => x.id), token, name, cls: r.cls, inv: r.inv, sub: r.sub, stats: e.stats });
  }
  const GP = parseGemProps(gemData), items = parseGemItems(itemData), gfam = new Map();
  for (const g of items) { const f = gfam.get(g.name) || []; f.push(g); gfam.set(g.name, f); }
  const gems = [];
  for (const [name, rows] of gfam) {
    if (Math.max(...rows.map(r => r.cq)) !== 2) continue;
    const g = rows.find(r => r.cq === 2), p = GP.get(g.gp), e = p && IE.get(p.enchant); if (!e) continue;
    gems.push({ id: g.id, ids: rows.map(r => r.id), name, color: p.color, stats: e.stats, desc: p.desc, diamond: e.stats.some(s => s.type === 5 && PRIM[s.stat]?.length === 3) });
  }
  return { build: (/wow build ([\d.]+)/.exec(String(perm)) || [])[1] || '', enchants, gems, socketBonus: parseSocketBonuses(bonus) };
}

// ---------- choices for a character ----------
const total = e => e.stats.reduce((a, s) => a + (s.coef || 0), 0);
const statMap = e => Object.fromEntries(e.stats.map(s => [`${s.type}:${s.stat}`, s.coef || 0]));
// f dominates e: same kinds of stats, at least as much of each, more of one (e.g. Flawless vs plain gem, stronger ring enchant of the same stat).
function dominates(f, e) {
  const a = statMap(f), b = statMap(e), ka = Object.keys(a).sort().join('|'), kb = Object.keys(b).sort().join('|');
  if (ka !== kb || e.stats.some(s => s.type === 3)) return false;      // procs are never compared
  return Object.keys(b).every(k => a[k] >= b[k]) && Object.keys(b).some(k => a[k] > b[k]);
}
const prune = list => list.filter(e => !list.some(f => f !== e && dominates(f, e)));
// Relevant for DPS: primary stat of the spec, secondary stats, or a proc on rings/weapons. Speed/leech/avoidance/stamina-only: skipped.
function relevant(e, primary, slot) {
  let prim = false, wrong = false, sec = false, proc = false;
  for (const s of e.stats) {
    if (s.type === 5 && PRIM[s.stat]) { if (!primary || PRIM[s.stat].includes(primary)) prim = true; else wrong = true; }
    else if (s.type === 5 && SEC[s.stat]) sec = true;
    else if (s.type === 3) proc = true;
  }
  if (prim || sec) return true;
  if (wrong) return false;
  return proc && /^(finger|main_hand|off_hand)/.test(slot);
}
const RANGED_MASK = (1 << 2) | (1 << 3) | (1 << 18);
// o: { primary, cls ('hunter'...), spec, slots: [slots with an item], offWeapon }  -> { slot: [enchant] }
function enchantsFor(db, o) {
  const out = {};
  const ranged = o.cls === 'hunter' && /^(beast_mastery|beastmastery|marksmanship)$/.test(o.spec || '');
  for (const slot of o.slots || []) {
    let list;
    if (slot === 'main_hand' || (slot === 'off_hand' && o.offWeapon)) {
      list = db.enchants.filter(e => e.cls === 2 && (((e.sub & ~RANGED_MASK) !== 0) || ranged));
      if (!ranged) list = list.filter(e => (e.sub & ~RANGED_MASK) !== 0);
    } else if (SLOT_INV[slot]) list = db.enchants.filter(e => e.cls === 4 && SLOT_INV[slot].some(i => e.inv & (1 << i)));
    else continue;
    list = prune(list.filter(e => relevant(e, o.primary, slot)));
    if (list.length) out[slot] = list;
  }
  return out;
}
// -> { diamonds, gems } (secondary gems, best quality, dominated ones removed). Diamonds with an armor or mana bonus are skipped (tank/healer).
function gemsFor(db) {
  const d = db.gems.filter(g => g.diamond && !g.stats.some(s => s.type === 4) && !/mana/i.test(g.desc || ''));
  const s = prune(db.gems.filter(g => !g.diamond && g.stats.some(x => x.type === 5 && SEC[x.stat])));
  return { diamonds: d, gems: s };
}

// ---------- item strings ----------
const optOf = (item, k) => (new RegExp(`(?:^|,)${k}=([^,]*)`).exec(item || '') || [])[1];
function setOpt(item, k, v) {
  let s = String(item || '').replace(new RegExp(`,${k}=[^,]*`, 'g'), '');
  if (k === 'enchant_id') s = s.replace(/,enchant=[^,]*/g, '');
  return v ? `${s},${k}=${v}` : s;
}
const gemsIn = item => (optOf(item, 'gem_id') || '').split('/').filter(g => g && g !== '0');
// Sockets of an item in a slot = built into the item (opt.base(id), item_data socket colours) + added by its bonus ids (item_bonus type 6),
// at least the number of gems it already lists. Necks and rings we build ourselves (loot / crafted strings, no bonus ids) get the drop
// socket every Midnight neck/ring has (bonus 13668: seen on every neck/ring in real exports), e.g. Aqirbane Reliquary 1 + 1 = 2.
// opt.add: head/wrist/waist slots where a Radiant Jewelbinder socket is assumed (only on a piece without a socket).
function socketsOf(slot, item, db, opt = {}) {
  if (!item || !/(^|,)id=\d+/.test(item)) return 0;
  const id = (/(?:^|,)id=(\d+)/.exec(item) || [])[1], bonus = optOf(item, 'bonus_id');
  const built = opt.base ? opt.base(id) : 0;
  const added = (bonus || '').split(/[\/:]/).reduce((n, x) => n + (+(db?.socketBonus?.[x]) || 0), 0);
  let n = built + added;
  if (ALWAYS_SOCKETED.includes(slot)) n = bonus ? Math.max(n, 1) : built + 1;
  if (!n && (opt.add || []).includes(slot)) n = 1;
  return Math.min(Math.max(n, gemsIn(item).length), 3);
}

// ---------- gem plans (BiS pseudo-slot "gems") ----------
// A plan is "diamond,g1,g2,..." (item ids, diamond first, others sorted) filling the sockets of the set in SOCKET_ORDER.
const canon = (ids, isD) => { const d = ids.filter(isD).slice(0, 1), o = ids.filter(x => !isD(x)).sort(); return [...d, ...o].join(','); };
function fit(plan, n, isD) {
  const p = plan.split(',').filter(Boolean), d = p.filter(isD).slice(0, 1), o = p.filter(x => !isD(x));
  const fill = o.length ? o : [];
  const out = [...d];
  for (let i = 0; out.length < n && fill.length; i++) out.push(fill[Math.min(i, fill.length - 1)]);
  return out.slice(0, n);
}
// Moves from a plan: other diamond, all secondary gems of one kind, one gem replaced by another kind.
function planMoves(plan, n, ch, isD) {
  if (n < 1) return [];
  const cur = fit(plan, n, isD), d = cur.filter(isD), o = cur.filter(x => !isD(x)), out = new Set(), key = canon(cur, isD);
  const add = ids => { const k = canon(ids, isD); if (k !== key) out.add(k); };
  const dia = d[0] || ch.diamonds[0]?.id && String(ch.diamonds[0].id);
  for (const x of ch.diamonds) add([String(x.id), ...o].slice(0, n));
  const slots = dia ? n - 1 : n;
  for (const g of ch.gems) add([...(dia ? [dia] : []), ...Array(slots).fill(String(g.id))]);
  for (const a of new Set(o)) for (const g of ch.gems) if (String(g.id) !== a) { const r = [...o]; r[r.indexOf(a)] = String(g.id); add([...d, ...r]); }
  return [...out];
}
// Initial plan from the equipped gems (diamond first), padded to n sockets with the most common secondary gem (or the first candidate).
function startPlan(base, n, db, ch, isD, opt, invent = true) {
  const ids = []; for (const s of SOCKET_ORDER) ids.push(...gemsIn(base[s]).slice(0, socketsOf(s, base[s], db, opt)));
  const d = ids.filter(isD).slice(0, 1), o = ids.filter(x => !isD(x));
  if (invent && !d.length && ch.diamonds[0]) d.push(String(ch.diamonds[0].id));
  const cnt = {}; for (const g of o) cnt[g] = (cnt[g] || 0) + 1;
  const common = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || (invent && ch.gems[0] && String(ch.gems[0].id));
  while (d.length + o.length < n && common) o.push(common);
  return canon([...d, ...o].slice(0, Math.max(n, 0)), isD);
}

// Logical set S (gear slots, consumables, "ench:<slot>", "gems") -> simc slot map.
// Gems belong to the SET, not to an item: the plan (S.gems when Best in Slot optimises gems, else ctx.keepPlan = the equipped gems) is
// spread over the sockets of the set in SOCKET_ORDER, diamond first (so swapping the piece that holds the diamond never loses it).
// ctx: { db, enchOn, gemsOn, add (jewelbinder slots for gem optimisation), keepPlan, keepAdd (slots socketed today), base(id) sockets,
//        isWeapon(item), isD(id) }
function materialize(S, ctx) {
  const out = {};
  for (const [k, v] of Object.entries(S)) if (!/^ench:/.test(k) && k !== 'gems') out[k] = v;
  if (ctx.enchOn) for (const [k, v] of Object.entries(S)) {
    const m = /^ench:(.+)$/.exec(k); if (!m || v === undefined) continue;
    const slot = m[1], it = out[slot]; if (!it) continue;
    if (slot === 'off_hand' && ctx.isWeapon && !ctx.isWeapon(it)) continue;
    out[slot] = setOpt(it, 'enchant_id', v);
  }
  const own = ctx.gemsOn && S.gems !== undefined, plan = own ? S.gems : ctx.keepPlan;
  if (plan === undefined) return out;
  const add = own ? ctx.add || [] : ctx.keepAdd || [];
  const counts = SOCKET_ORDER.map(s => [s, socketsOf(s, out[s], ctx.db, { add, base: ctx.base })]);
  const n = counts.reduce((a, [, c]) => a + c, 0), gems = fit(plan || '', n, ctx.isD || (() => false)); let i = 0;
  for (const [s, c] of counts) { if (!out[s]) continue; const g = gems.slice(i, i + c); i += c; out[s] = setOpt(out[s], 'gem_id', g.join('/')); }
  return out;
}
// Gems kept as they are (Top Gear, Droptimizer, Best in Slot without gem optimisation): the equipped gems, empty sockets filled with the
// most common equipped gem, a Jewelbinder socket assumed on a new head/wrist/waist only where today's piece has a socket.
function keepCtx(base, db, baseSockets, isD) {
  const keepAdd = JEWELBINDER.filter(s => socketsOf(s, base[s], db, { base: baseSockets }) > 0);
  const n = SOCKET_ORDER.reduce((a, s) => a + socketsOf(s, base[s], db, { add: keepAdd, base: baseSockets }), 0);
  const keepPlan = startPlan(base, n, db, { diamonds: [], gems: [] }, isD, { add: keepAdd, base: baseSockets }, false);
  return { db, keepPlan, keepAdd, base: baseSockets, isD, filled: n - SOCKET_ORDER.reduce((a, s) => a + gemsIn(base[s]).length, 0) };
}
const gemsPlanLabel = (plan, names) => {
  const cnt = new Map(); for (const g of String(plan || '').split(',').filter(Boolean)) cnt.set(g, (cnt.get(g) || 0) + 1);
  return [...cnt].map(([g, n]) => `${n}× ${names[g] || 'gem ' + g}`).join(', ') || '(no gems)';
};

module.exports = { URLS, PRIM, SEC, SLOT_INV, SOCKET_ORDER, JEWELBINDER, ALWAYS_SOCKETED, parseIE, parsePerm, parseGemProps, parseGemItems, parseSocketBonuses, build,
  enchantsFor, gemsFor, relevant, prune, optOf, setOpt, gemsIn, socketsOf, canon, fit, planMoves, startPlan, materialize, keepCtx, gemsPlanLabel };
