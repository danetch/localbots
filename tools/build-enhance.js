// Builds data/enhance.json (enchants, gems, socket bonuses) from a simc source tree: node tools/build-enhance.js <simc dir>
// The app rebuilds the same file in userData during "Update loot data" from the same simc tables on GitHub.
const fs = require('fs'), path = require('path'), enh = require('../lib/enhance');
const g = f => fs.readFileSync(path.join(process.argv[2], 'engine/dbc/generated', f), 'utf8');
const db = enh.build({ perm: g('permanent_enchant.inc'), ie: g('spell_item_enchantment.inc'), gemData: g('gem_data.inc'), itemData: g('item_data.inc'), bonus: g('item_bonus.inc') });
fs.writeFileSync(path.join(__dirname, '..', 'data', 'enhance.json'), JSON.stringify(db));
console.log(`build ${db.build}: ${db.enchants.length} enchants, ${db.gems.length} gems, ${Object.keys(db.socketBonus).length} socket bonuses`);
