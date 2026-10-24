// Draft boss fights from the in-game Adventure Guide (Encounter Journal), available from the first PTR build on wago.tools, weeks before
// BigWigs timers or logs. Tables (wago DB2 CSV): JournalEncounter, JournalEncounterSection, JournalEncounterCreature, SpellName, Spell.
// Section types (checked on Midnight S2): 0 stage header, 1 creature (boss or add), 2 ability (SpellID), 3 overview. Abilities' own
// titles are placeholders ("Section 12"): the name and text come from the spell. Order: JournalEncounter.FirstSectionID and the
// sections' FirstChildSectionID / NextSiblingSectionID chains. IconFlags = the role icons shown in the guide (checked on S2 bosses).
// A draft lists every ability with a suggested simulation type and its spell id, and NO timings: BigWigs (tools/bw-update.js) and real
// logs fill them later. Types the engine does not simulate ("unknown", "skip") stay in the file for a human to decide.
const ICON = { tank: 1, dps: 2, healer: 4, heroic: 8, deadly: 16, important: 32, interrupt: 64, magic: 128, curse: 256, poison: 512, disease: 1024, enrage: 2048, mythic: 4096 };
const iconNames = f => Object.entries(ICON).filter(([, b]) => f & b).map(([n]) => n);
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
// Spell text without client markup: |cFF..|Hspell:..|h[Name]|h|r -> Name, $s1 / $1234s1 / $bullet; -> neutral tokens
const clean = t => String(t || '').replace(/\|c\w{8}\|H\w+:\d+\|h\[([^\]]*)\]\|h\|r/g, '$1').replace(/\|[cr]\w{0,8}/g, '').replace(/\$bullet;/g, '•')
  .replace(/\$\{[^}]*\}/g, 'N').replace(/\$\d*[a-zA-Z]\d*/g, 'N').replace(/\s+/g, ' ').trim();

// Suggested simulation type for an ability. -> { type, why }
function classify(name, desc, flags, onAdd) {
  const t = (name + ' ' + desc).toLowerCase();
  if (onAdd) return { type: 'skip', why: "an add's own ability" };
  if (/\b(immune to (all )?damage|submerges?|untargetable|cannot be (attacked|damaged|targeted)|invulnerable)\b/.test(t)) return { type: 'invulnerable', why: 'immune / submerged' };
  if (/(reduc\w* (his|her|its|their) damage taken|damage taken (is )?reduced|take[s]? (n% )?less damage)/.test(t) && !(flags & ICON.tank)) return { type: 'vulnerable', multiplier: 0.5, why: 'boss takes LESS damage (multiplier < 1)' };
  if (/(increas\w* (his|her|its|their) damage taken|damage taken\b.{0,50}\bincreas|damage (she|he|it|they) takes?|takes? (n%? )?(increased|additional|more) damage|vulnerab)/.test(t) && !(flags & ICON.tank)) return { type: 'vulnerable', multiplier: 1.5, why: 'boss takes more damage' };
  if (/\b(players|allies|your raid)\b.{0,60}\b(deal|damage done)\b.{0,30}\bincreased\b/.test(t)) return { type: 'damage_done_buff', why: 'players deal more damage' };
  if ((flags & ICON.tank) && !(flags & (ICON.dps | ICON.deadly | ICON.important))) return { type: 'skip', why: 'tank ability' };
  if ((flags & ICON.healer) && !(flags & (ICON.dps | ICON.deadly | ICON.important))) return { type: 'skip', why: 'raid damage (healers)' };
  if (/\b(summons?|calls? (forth|(her|his|its|their) \w+)|spawns?|hatch\w*|emerges?|progeny|brood\w*|reinforcements|minions|creates? (living|several|many|a number of))\b/.test(t)) return { type: 'adds', why: 'summons adds' };
  if (/\b(avoid|dodge|move|run|knocks?( back)?|knockback|puddles?|pools?|swirl\w*|waves?|beams?|charges?|soak\w*|spread|stack|leaps?|jumps?|pulls?|push\w*|step\w*|frontal|cone|line|zone|area|ground|crash\w*|crush\w*|orbs?|impact locations?)\b/.test(t) || (flags & ICON.deadly)) return { type: 'movement', why: 'players move' };
  return { type: 'unknown', why: '' };
}

// t: { encounter, section, creature, spellName, spell } CSV texts; readTable from lib/loot.js; encounterIds: [ids]
function draft(t, readTable, encounterIds, meta = {}) {
  const want = new Set(encounterIds.map(String));
  const enc = readTable(t.encounter, { id: ['ID'], name: ['Name_lang'], first: ['FirstSectionID'], inst: ['JournalInstanceID'] }, o => want.has(o.id));
  const secs = readTable(t.section, { id: ['ID'], title: ['Title_lang'], enc: ['JournalEncounterID'], parent: ['ParentSectionID'], child: ['FirstChildSectionID'], next: ['NextSiblingSectionID'], type: ['Type'], spell: ['SpellID'], icon: ['IconFlags'] }, o => want.has(o.enc));
  const creatures = readTable(t.creature, { name: ['Name_lang'], enc: ['JournalEncounterID'] }, o => want.has(o.enc));
  const spells = new Set(secs.map(s => s.spell).filter(x => +x));
  // descriptions may only point to another spell ("$@spelldesc1283840") and name others ("$@spellname1313402"): read those too
  const raw = Object.fromEntries(readTable(t.spell, { id: ['ID'], desc: ['Description_lang'] }, o => spells.has(o.id)).map(r => [r.id, r.desc || '']));
  const refs = new Set(Object.values(raw).flatMap(d => [...d.matchAll(/\$@spell(?:desc|name)(\d+)/g)].map(m => m[1])));
  for (const r of readTable(t.spell, { id: ['ID'], desc: ['Description_lang'] }, o => refs.has(o.id) && !raw[o.id])) raw[r.id] = r.desc || '';
  const names = Object.fromEntries(readTable(t.spellName, { id: ['ID'], name: ['Name_lang'] }, o => spells.has(o.id) || refs.has(o.id)).map(r => [r.id, r.name]));
  const expand = (d, n = 0) => String(d).replace(/\$@spelldesc(\d+)/g, (_, id) => n < 3 ? expand(raw[id] || '', n + 1) : '').replace(/\$@spellname(\d+)/g, (_, id) => names[id] || 'it');
  const descs = Object.fromEntries([...spells].map(id => [id, clean(expand(raw[id] || ''))]));
  const byId = Object.fromEntries(secs.map(s => [s.id, s]));
  const out = [];
  for (const E of enc) {
    // Bosses: creatures of the encounter that sit at the top of the guide (or right under a stage). When the encounter is named after one
    // of them (Ula'tek) it is the only boss; the creature list also holds adds (Spawn of Vexhul, Blightscale Spawn).
    const bossNames = new Set(creatures.filter(c => c.enc === E.id).map(c => c.name)), single = bossNames.has(E.name) ? E.name : null;
    const STAGE = /^(stage|phase|intermission)\b/i;
    const chain = first => { const r = []; for (let id = first, n = 0; +id && byId[id] && n < 500; id = byId[id].next, n++) r.push(byId[id]); return r; };
    const stages = [], mechanics = {}, bosses = [], seenAdds = new Set();
    const addMech = (key, m) => { let k = key, i = 2; while (mechanics[k] && mechanics[k].spell !== m.spell) k = key + '_' + i++; if (!mechanics[k]) mechanics[k] = m; else if (mechanics[k].stage !== m.stage) mechanics[k].stages = [...new Set([...(mechanics[k].stages || [mechanics[k].stage]), m.stage])]; };
    // walk depth-first in guide order; ctx: { stage, creature (name), isAdd }
    const walk = (list, ctx) => {
      for (const s of list) {
        const flags = +s.icon || 0, kids = chain(s.child);
        if (s.type === '3') continue;
        if (s.type === '0' && (!ctx.parentType || STAGE.test(s.title))) { stages.push({ id: stages.length + 1, title: s.title }); walk(kids, { ...ctx, stage: stages.length, parentType: '0' }); continue; }
        if (s.type === '1' || s.type === '0') {   // a nested header that is not a stage names a group of adds
          const isBoss = s.type === '1' && (single ? s.title === single : bossNames.has(s.title)) && (!ctx.parentType || ctx.parentType === '0');
          if (isBoss && !ctx.stage && !bosses.includes(s.title)) bosses.push(s.title);
          if (!isBoss && !seenAdds.has(s.title + '@' + (ctx.stage || 1))) {
            seenAdds.add(s.title + '@' + (ctx.stage || 1));
            addMech(slug(s.title), { label: `${s.title} (adds)`, type: 'adds', stage: ctx.stage || 1, count: 1, icons: iconNames(flags), why: 'add in the guide',
              ...(flags & ICON.mythic ? { difficulty: 'mythic' } : {}), timesFrom: 'none', assumed: ['times', 'count', 'health', 'duration'] });
          }
          walk(kids, { ...ctx, creature: s.title, isAdd: !isBoss, parentType: '1' }); continue;
        }
        if (s.type === '2' && +s.spell) {
          const name = names[s.spell] || s.title, desc = descs[s.spell] || '', c = classify(name, desc, flags, ctx.isAdd);
          if (!(ctx.isAdd && c.type === 'skip')) addMech(slug(name), { label: name, type: c.type, ...(c.multiplier ? { multiplier: c.multiplier, duration: 15 } : {}), spell: +s.spell, stage: ctx.stage || 1, icons: iconNames(flags), why: c.why,
            ...(ctx.creature && !ctx.isAdd && bosses.length > 1 ? { boss: ctx.creature } : {}), ...(flags & ICON.mythic ? { difficulty: 'mythic' } : flags & ICON.heroic ? { difficulty: 'heroic+' } : {}),
            desc: desc.slice(0, 300), timesFrom: 'none', assumed: ['times', 'duration'] });
        }
        walk(kids, { ...ctx, parentType: s.type });
      }
    };
    walk(chain(E.first), {});
    const n = Math.max(1, stages.length);
    out.push({
      id: slug(E.name), name: E.name, draft: true, ...(meta.ptr ? { ptr: true } : {}),
      source: `Draft from the in-game Adventure Guide (wago.tools${meta.build ? ' build ' + meta.build : ''}): abilities and suggested types only, no timings yet.`,
      notes: 'Draft: check every mechanic type ("unknown" and "skip" are not simulated), then fill times with tools/bw-update.js (BigWigs) or real logs. Stage starts are evenly spaced placeholders.',
      encounterId: +E.id, defaultDuration: meta.duration || 300,
      ...(bosses.length > 1 ? { mainBoss: bosses[0], bosses: bosses.slice(1).map(name => ({ name })), council: 'Council from the guide: check whether the bosses are cleaved together or split.' } : {}),
      ...(stages.length > 1 ? { stages: stages.map((s, i) => ({ id: s.id, atPct: Math.round(i * 100 / n), title: s.title })) } : {}),
      mechanics,
      difficulties: { heroic: { label: 'Normal / Heroic', times: {} }, mythic: { label: 'Mythic', times: {} } },
    });
  }
  return out;
}

module.exports = { draft, classify, clean, ICON, iconNames };
