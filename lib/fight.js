const FIGHTS = ['Patchwerk','LightMovement','HeavyMovement','HecticAddCleave','CleaveAdd','CastingPatchwerk','DungeonSlice','DungeonRoute'];
const RAID_BUFFS = { bloodlust:'Bloodlust', arcane_intellect:'Arcane Intellect', battle_shout:'Battle Shout', power_word_fortitude:'Power Word: Fortitude',
  mark_of_the_wild:'Mark of the Wild', skyfury:'Skyfury', mystic_touch:'Mystic Touch', chaos_brand:'Chaos Brand', hunters_mark:'Hunter’s Mark' };
const FORBIDDEN = /^(html|json\d?|xml|csv|output|log|save|save_\w+|threads|iterations|target_error|profileset\S*|player|armory|copy)\b/i;
const SAFE_VALUE = /^[\w:.\-\/]+$/;

function fightArgs(f = {}) {
  const a = [];
  if (FIGHTS.includes(f.fightStyle)) a.push(`fight_style=${f.fightStyle}`);
  if (f.targets >= 1) a.push(`desired_targets=${Math.floor(f.targets)}`);
  if (f.duration >= 10) a.push(`max_time=${Math.floor(f.duration)}`);
  if (f.vary >= 0 && f.vary <= 1) a.push(`vary_combat_length=${f.vary}`);
  // Raid buffs : "full" = tout actif (défaut simc), "none" = rien, "custom" = uniquement la sélection
  if (f.raid === 'full') a.push('optimal_raid=1');
  if (f.raid === 'none' || f.raid === 'custom') a.push('optimal_raid=0');
  if (f.raid === 'custom') for (const b of f.raidOn || []) if (RAID_BUFFS[b]) a.push(`override.${b}=1`);
  // Buffs personnels / consommables (valeur vide = on garde ce que contient l'export)
  const cons = { flask: f.flask, food: f.food, potion: f.potion, augmentation: f.rune };
  for (const [k, v] of Object.entries(cons)) {
    const val = f.noCons ? 'disabled' : String(v || '').trim();
    if (val && SAFE_VALUE.test(val)) a.push(`${k}=${val}`);
  }
  // Boss fight (lib/boss.js): pre-built raid events, only well-formed raid_events+=/ lines are accepted
  for (const e of f.raidEvents || []) if (/^raid_events\+=\/[a-z_]+,[\w=.:,\-]+$/.test(e)) a.push(e);
  for (const e of f.bossArgs || []) if (e === 'ignore_invulnerable_targets=1') a.push(e);
  // Options libres : une ligne key=value par option
  for (const l of String(f.extra || '').split(/\r?\n/)) { const s = l.trim(); if (/^[\w.\-+]+=\S*$/.test(s) && !FORBIDDEN.test(s)) a.push(s); }   // pas d'options qui écrivent des fichiers ou changent le moteur
  return a;
}
module.exports = { fightArgs, RAID_BUFFS };
