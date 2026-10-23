// Extrait niveau d'objet et stats secondaires par emplacement depuis le JSON de simc (json2).
// Forme vérifiée dans simc (report_json.cpp, gear_to_json) : players[0].gear[slot] = { name, encoded_item, ilevel, <stat>: montant, ... }
// avec des noms de stats du type crit_rating, haste_rating, mastery_rating, versatility_rating.
const SEC = /^(crit|haste|mastery|vers)/i;
function extractGear(player) {
  const out = {}, g = player?.gear;
  if (!g || typeof g !== 'object') return out;
  for (const [slot, v] of Object.entries(g)) {
    if (!v || typeof v !== 'object') continue;
    const o = {};
    if (typeof v.ilevel === 'number') o.ilvl = v.ilevel;
    for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && SEC.test(k)) o[k] = n;
    if (Object.keys(o).length) out[slot] = o;
  }
  return out;
}
module.exports = { extractGear };
