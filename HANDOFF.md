POLYGNOME (formerly LOCALBOTS) - PROJECT HANDOFF
================================================

=== START HERE (state on 27 Oct 2026 morning, app v0.10.1, 89 tests; see "27 OCT" at the end for the latest changes) ===
New conversation: attach the GitHub repo danetch/localbots, read this START HERE and README.md, then wait for the user's request.
Everything below START HERE is a chronological log (oldest first, 21 Oct -> 26 Oct); when two notes disagree, the later one wins.
The old "FILE MAP", "FEATURES IMPLEMENTED", "KNOWN LIMITATIONS" and "ENVIRONMENT NOTES" sections (21 Oct) are outdated (zips, wago-only,
etc.): this section and the dated sections replace them.

WORKING WITH THE USER
- Product: Polygnome (formerly LocalBots), an Electron app wrapping the SimulationCraft CLI (simc) for WoW Midnight: Top Gear,
  Droptimizer, Best in Slot, local and unlimited. Windows installer, auto-updates from GitHub releases. Repo danetch/localbots (public).
- The user writes in French or English: answer in their language. UI text is English. Lean, working increments; always say plainly what
  was verified and what was not.
- "Si tu me proposes des choses, ne fais pas tout de suite": when you PROPOSE something, investigate, propose, wait for the go. Bug reports
  and explicit requests: just do them.
- The user prefers automation over manual steps (seasons, data refreshes are automatic on purpose, see AUTOMATION).
- Linked PC (Windows, user "Matthias"): app data %APPDATA%\Polygnome (needs folder access granted from the desktop app; it was refused on
  26 Oct), code C:\Users\Matthias\Code\localbots. The built-in browser on that PC works and was used for wago / Blizzard / Warcraft Logs pages.

HOW TO SHIP
- Code: bump package.json "version", push to main -> .github/workflows/release.yml (tests on Linux, NSIS installer on Windows, GitHub
  release v<version>; installed apps offer the update at start). Beta: x.y.z-beta.N from a season* branch (pre-release). Pushes by
  GITHUB_TOKEN (workflow merges) do NOT trigger release.yml.
- Data only (data/season*.json, progression*.json, crafted*.json, fights/*.json): run `node tools/make-data.js` (manifest +
  shipped-hashes; npm test fails otherwise), push to main: apps >= dataMinApp (0.5.0) download it at their next start, no release.
- Always: `npm test` before pushing (node:test, fake simc test/fakesimc.js, frozen MID2 data in test/fixtures/data so a season switch
  never breaks the tests). Commit messages end with the Co-Authored-By / Claude-Session lines given in the session.
- UI checks: real Electron under Xvfb (xvfb-run -a node_modules/electron/dist/electron . --no-sandbox --disable-gpu
  --remote-debugging-port=9333 --user-data-dir=<tmp>) + Playwright connectOverCDP (playwright from the global @playwright/mcp package;
  `playwright install` is blocked). test/ui/mock.js mocks window.api for renderer-only screenshots.

ENVIRONMENT (Claude sandbox)
- Reachable: github.com via git, raw.githubusercontent.com, GitHub REST API (gh api; NOT GraphQL; the Actions secrets API is refused).
- Blocked: wago.tools, *.version.battle.net (Blizzard versions), warcraftlogs.com, lorrgs.io, Raidbots, Wowhead. Use GitHub Actions (has
  the WCL secrets, reaches wago / Blizzard / WCL) or the user's built-in browser. Never store Warcraft Logs credentials in the repo
  (repo secrets WCL_CLIENT_ID / WCL_CLIENT_SECRET, added 25 Oct, working; locally a git-ignored wcl-credentials.json).
- A real simc can be built in the sandbox (clone simulationcraft/simc, branch midnight, sparse engine + source_files, OPTIMIZE=0; 25-50 min
  on 2 cores) to verify simc behaviour; it cannot write HTML reports.

CODE MAP
- main.js: IPC, simc runs (runSimc / pass / statsPass / reportPass), modes (sim:topgear, sim:drop, sim:bis), loot:update / loot:status /
  loot:info, data:refresh, preview:get, food check (cached), data log (logs/data-updates.log), run logs (logs/run-*.log).
  preload.js: window.api. renderer/index.html: single-file UI (header: mode, Run, game data, Settings, Live/PTR switch; left accordion
  cards; right tabs Results / History / Activity log).
- lib/ (gear logic): topgear, bis, upgrade, tier (Catalyst), crafted, enhance (enchants / gems / sockets), dr (diminishing returns), gear,
  specs, talents, items (simc item_data), loot (wago DB2 -> loot.json, season of a raid), foods, progression, wowhead, progress.
  lib/ (fights): boss (fight files -> simc raid_events, kill length by item level), fight (simc fight args), lust (Bloodlust timing),
  journal (Adventure Guide drafts), bigwigs, wcl (Warcraft Logs API).
  lib/ (data / seasons): datafiles (data updates from GitHub), preview (Live/PTR switch state), season (next-season draft, promotion, track
  item levels from simc), versions (Blizzard game versions per region), engine (simc download), updater (electron-updater).
- tools/: make-data, watch (daily season watch), season-draft, season-promote, journal-draft, bw-update / bw-extract (BigWigs),
  wcl-timeline (boss cast timings), wcl-lust (Bloodlust timing), build-enhance.
- data/: season.json (the only season constants), progression.json, crafted.json, fights/*.json, items.json, enhance.json, manifest.json,
  shipped-hashes.json; season-ptr.json / progression-ptr.json / crafted-ptr.json only while a next season is in testing;
  fights-archive/<season>/ after a season switch.
- .github/workflows/: release.yml, watch.yml (daily 06:17 UTC), fight-data.yml (Wednesdays 05:41 UTC). .github/watch-state.json = watch memory.

AUTOMATION (no manual step needed; details in "25 OCT: SEASON PULL REQUESTS", "26 OCT: v0.8.0", "26 OCT: v0.9.0")
- watch.yml: versions from Blizzard (lib/versions.js, wago fallback), new PTR / beta Adventure Guide instances, instances reaching live,
  BigWigs folders, simc PTR data / profiles, Warcraft Logs zones -> one issue labelled "watch" per change.
  New raid on PTR / beta -> PR "Next season in testing" (branch season-next: season-ptr.json with track item levels read from simc,
  progression-ptr.json, crafted-ptr.json, fight drafts) MERGED by the workflow after npm test -> the Live/PTR switch appears in every app.
  That raid in the live Journal -> PR "Season start" (branch season-start, tools/season-promote.js) created, MERGED when Warcraft Logs has
  kills of the raid since it went live (seasonStart) -> every app switches season at its next start; old fights archived.
- fight-data.yml: Bloodlust timing per boss and difficulty from the fastest Warcraft Logs kills (tools/wcl-lust.js), PR "Fight data"
  merged after the tests; input `force` rewrites every entry, `only` limits to fight ids.
- Apps: automatic "Update loot data" at start when there is no data, a new game patch in the player's region (region= of the export), the
  food list was never checked, or data > 14 days old; data files refreshed from GitHub at start; app update offered at start.
- Claude scheduled task "Polygnome season watch" (Mondays 08:39 Paris, trigger trig_015dzWajYiV1aK6mcJnM6X8p): reads issues, PRs, runs,
  watch state; closes watch issues that need no action (with a comment); reports in French. It never pushes or merges.

STATE / OPEN ITEMS (26 Oct)
- Confirmed by the user on his PC: food check (12 kept), crafted Midnight items (98 found), Wowhead icons + tooltips, simc HTML report,
  simc auto update, talent loadouts ("# Saved Loadout: <name>" + "# talents=" lines), "This season" raid filter.
- Not explained: on the user's PC the automatic startup update did not run the food check once (reproduced fine in Electron). Since v0.7.1
  logs/data-updates.log records every startup decision: ask for its "Check (app start, ...)" lines if it happens again.
- Not yet run for real (no new raid on the PTR as of 26 Oct; live 12.1.5.70575, PTR 12.1.7.70493, beta 12.0.1.66220): the wago downloads
  of tools/season-draft.js, the season-next merge path, the WCL zone match of a brand-new raid, the automatic merges with the real gh.
  Simulated locally end to end. Check the first "Next season in testing" PR closely.
- Live/PTR switch: only for a new SEASON (user: no switch for minor-patch PTRs like 12.1.7). Beta mode: simc may lack beta data (logged).
- Bloodlust (v0.9.1, measured 26 Oct): pull on 8 bosses; Coiled Altar 4-5 s after stage 3; Ula'tek 29 % (Heroic) / 49 % (Mythic) of the
  kill. Only the first lust is modelled.
- Still estimates, by design: boss mechanic effect sizes (`assumed` in fight files; timings are from logs), per-boss loot ranks and crafted
  rules of a generated season, rules listed in "ASSUMED GAME RULES". Normal difficulty has no Warcraft Logs kill lengths (not important).
- Ideas mentioned, not started: measure boss effect sizes from Warcraft Logs (damage taken, debuff durations); a "hats as results chart"
  picture for README / empty results; run history comparison.

GOAL
----
A local, offline, unlimited clone of Raidbots, built as an Electron app around the SimulationCraft CLI (simc).
No queue, no cap, no subscription. WoW Midnight (Season 2 data). UI language: English. The user first wrote in French.
The user prefers lean, working increments, and wants unverified assumptions flagged honestly.

HOW TO RUN (current, dev mode)
------------------------------
  npm install ; npm start     (Electron ^33, Node 18+ fetch is used in the main process)
First launch: Engine card -> "Select simc..." (path to a simc binary). Paste a /simc addon export (bags included).

FILE MAP (21 Oct, OUTDATED: see CODE MAP in START HERE)
--------
main.js            Electron main process. IPC handlers:
                   settings:get, simc:pick, sim:cancel, sim:parse, sim:topgear, sim:drop, sim:bis,
                   loot:info, loot:update, prog:get, prog:edit.
                   Core helpers: runSimc() (spawn simc with json2), pass() (writes input + profilesets, runs simc,
                   returns {base, results, data}), sendProgress(), makeIlvlFor(), mkRules().
preload.js         contextBridge API: settings, pickSimc, parse, run, drop, bis, lootInfo, lootUpdate, prog, editProg,
                   cancel, onLog, onProgress.
renderer/index.html  Single-file UI, 3 columns: Setup | Progress+Log | Results. Mode selector: Top Gear / Droptimizer /
                   Best in Slot. Cards: Export, Mode, Gear flags, Consumables (BiS only), Loot source, Fight settings, Engine.
lib/topgear.js     parse() of the addon export (pools, equipped, labels), combos() with rules (2H, embellishment cap 2,
                   unique pairs), toProfilesets(), baseSlots(), isEmb(), isTwoHand(), describe().
lib/loot.js        CSV scanner/readTable (optional columns supported), build() of loot.json from wago.tools DB2 tables,
                   select() of drops with ilvlFor callback, consumables list builder (slug names), WEAPONS/ARMOR maps.
lib/bis.js         Best-in-Slot engine: buildCandidates(), expand(), pickWinners(), diffOf(), withSet().
lib/progression.js resolve(source, boss, upgrade) -> {ilvl,label} from data/progression.json.
lib/fight.js       fightArgs(): fight_style, desired_targets, max_time, vary_combat_length, raid buffs, consumables, extra.
lib/gear.js        extractGear(): defensive extraction of per-slot secondary stats from simc json2 (shape unverified).
lib/tier.js        Tier sets + Catalyst: parseSets() of simc item_set_bonus.inc, withSlots(), classOf(), pickSet(), twin(), withIlvl().
lib/crafted.js     Crafted gear: parseEmbellishments() (simc table), recipeItemIds()/pickCrafted() (wago recipe tables), variants(), addToPools().
lib/progress.js    makeParser(): turns simc console progress lines into a percentage.
data/crafted.json  Crafted rules (editable copy in userData via "Edit crafted rules"): tested ilvl 331, stat pairs, embellishment -> slots, extraItems.
data/progression.json  Season tracks (Champion/Hero/Myth ilvl per rank) and drop sources (raid difficulty, M+ keys,
                   Great Vault, Voidcore). User-editable copy lives in the app userData folder ("Edit tracks & sources").
User data (userData): settings.json, loot.json, progression.json (optional), last-bis-result.json.

FEATURES IMPLEMENTED (21 Oct, OUTDATED: see START HERE and the dated sections)
--------------------
1. Top Gear: cartesian product of bag items (rings/trinkets in pairs) as profilesets; 2 passes (all at target_error 0.5,
   top N at 0.05). Rules: 2H clears off_hand ("off_hand="), same item can't be in both hands, max 2 embellished items,
   unique pairs. Gear flags card: user ticks 2H and embellished items; embellishment bonus IDs can be entered.
2. Droptimizer: each loot drop replaces one slot (enchant carried over), best slot kept per item, ranked by DPS gain.
   Loot data from wago.tools DB2 (JournalEncounterItem, JournalEncounter, JournalInstance, Item, ItemSparse,
   JournalTier, JournalTierXInstance). Filters: Adventure Guide tier (default "Current Season"), armor type, weapon types.
   Per-instance item level source (custom ilvl or a progression source), optional "Fully upgraded (x/6)".
3. Best in Slot: batched coordinate ascent. Per round: scan every single swap (coarse, 0.4) -> rank -> stack best
   compatible gains -> validate cumulative sets in one fine batch (0.1) -> keep best prefix -> repeat (max rounds
   default 5; stop under 0.15% gain). Pruning of candidates below -1.5% after round 1. Compound moves for the
   embellishment cap and 2H<->1H+OH switches. Final check run (0.05) gives final DPS and item stats.
   Candidates: bag items, optional loot (ticked instances), optional consumables (flask/food/potion/augmentation
   treated as extra "slots"). Results: final set table (slot, item + secondary stats, source, replaces) and round history.
4. Fight settings (all modes): fight style, targets, length, variance, raid buffs (full/none/custom checklist),
   flask/food/potion/rune text fields with suggestions, "No consumables", free "extra simc options" lines.
5. Progress bar with %, elapsed, ETA (BiS uses an asymptotic estimate), activity log, cancel button.
6. Consumable suggestions generated from DB2 (Item subclasses 1 potion, 3 flask, 5 food, 8 other->augment rune),
   slug names, rank suffixes _1.._3 guessed for same-name items.

7. CATALYST (all three modes: Top Gear, Droptimizer, Best in Slot). Checkbox + optional max charges. Tier IDs come from simc's item_set_bonus.inc (downloaded
   during "Update loot data", slots resolved via Item InventoryType). Every head/shoulder/chest/hands/legs candidate gets a
   "twin": `,id=<tier id>,<original options>,redirected_base_stats=<original id>` (simc's own catalyst mechanism; the original
   level is added as ilevel=N from the "# Name (N)" comment when the string has none). Set bonuses: each round, after the single
   scan, the best twin per slot is combined into every subset of 2-5 pieces (tierGroups), scanned as one extra batch, and
   merged into the normal ranking/prefix validation. Max charges caps twins in valid().
   Top Gear: twins are added as extra pool alternatives (combo count grows ~2^pieces; 200k limit applies; cap checked per combo).
   Droptimizer: each tier-slot drop also gets a "-> tier (catalyst)" row (single swap, set bonus counted by simc with equipped pieces).
   Verified: simc source (redirected_base_stats option, report prints "catalysed from"), MID2 sets = 13 classes x 5 IDs,
   json2 gear shape (name, encoded_item, ilevel, <stat>=amount per slot: extractGear() should now work, to confirm).

8. CRAFTED GEAR + EMBELLISHMENTS (all modes), card "Crafted gear". Candidate string:
   `,id=<base>,ilevel=331,crafted_stats=<a>/<b>[,embellishment=<simc tokenized name>][,enchant_id=<equipped one>]`.
   Embellishment list = intersection of simc's embellishment_data.inc (downloaded on Update loot data) and data/crafted.json
   (slot rules from Level Upper's guide; weapon ones allow main_hand/off_hand; rings use "finger"). Base items = recipe tables
   (wago SkillLineAbility.Spell -> SpellEffect.EffectItemType -> Item/ItemSparse, newest ExpansionID, armor type from the class,
   weapon types ticked in the card) + "extraItems" in crafted.json. Embellished items count toward the cap of 2 (isEmb now
   also detects embellishment=... and ALL simc embellishment bonus ids automatically: the manual "bonus IDs" field is optional).
   Verified by reading simc source: embellishment=, crafted_stats= and ilevel= options exist. Tested end to end (all three modes)
   with a fake simc + stubbed Electron on synthetic CSVs: orchestration, caps, enchant carry-over, class armor filter work.

THINGS ASSUMED BUT NOT VERIFIED (check first if something fails)
-----------------------------------------------------------------
- CRAFTED: wago column names (SkillLineAbility: Spell; SpellEffect: EffectItemType, SpellID) and that Midnight gear recipes set
  EffectItemType; whether crafted_stats actually changes stats of the Midnight base items (simc only replaces crafted-stat
  placeholders; check the stats shown in the BiS result); embellishment= name tokenization for every name; slots of entries
  listed under "unverified" in crafted.json; crafted stat ids 32 crit / 36 haste / 40 vers / 49 mastery (from real exports).
- simc accepts per-profileset options flask/food/potion/augmentation (BiS consumables rely on it). Fallback: run each variant as a separate sim.
- "off_hand=" (empty) unequips the off hand in simc.
- json2 per-item stats shape under players[0].gear is unknown; extractGear() guesses. If stats are missing, the UI says so
  and last-bis-result.json holds the raw output to inspect.
- simc progress line format ("Profilesets ... x/y", "Generating Baseline ... x/y") used for the progress bar.
- wago.tools CSV column names: ID, Name_lang, JournalInstanceID, JournalEncounterID, ItemID, ClassID, SubclassID,
  InventoryType, Display_lang, ItemLevel, ExpansionID (optional), JournalTierID. "Current Season" tier exists in
  JournalTier (raids are NOT filtered per season: known gap).
- Consumable item subclass IDs and the _1/_2/_3 rank suffix convention; consumable "disabled" works for flask/food/potion
  (confirmed by a guide) but not confirmed for augmentation.
- Raid buff names (bloodlust, arcane_intellect, battle_shout, power_word_fortitude, mark_of_the_wild, skyfury,
  mystic_touch, chaos_brand, hunters_mark) and fight style names may have changed in Midnight.
- Progression data comes from Method's Midnight Season 2 guides (item levels per rank; M+ chest; Great Vault; mythic raid
  per boss, last two bosses = 344). Those guides contain small internal inconsistencies; ilvl is read from the track table.
  Placeholders: Normal/Heroic raid drops default to rank 1 (per-boss ranks unknown); Voidcore (+10 bonus roll) assumed Myth 1/6.
  Delves and Prey are not modelled.

KNOWN LIMITATIONS (21 Oct, OUTDATED: see START HERE and the dated sections)
-----------------
- Tier set bonuses (2pc/4pc) are not modelled by us; Catalyst (all modes) assumes simc counts set bonuses for redirected
  items (item id = tier id) and that equipped items without ilevel= keep the right level (both unverified).
- Crafted gear (lib/crafted.js, data/crafted.json): base items come from wago recipe tables (column names and whether Midnight
  recipes set EffectItemType are UNVERIFIED; fallback = extraItems in crafted.json). crafted_stats may do nothing on Midnight
  base items (check stats in BiS results). Slots flagged in crafted.json "unverified" come from guides.
- Two-handers/off-hands: automatic from simc item_data.inc (lib/items.js, data/items.json, refreshed by "Update loot data").
  Titan's Grip = warrior + spec=fury. The old Gear flags card is gone.
- Primary stat filter: lib/specs.js maps class+spec -> agi/str/int; items.json (agi/str/int id lists from simc item_data stats table, rare+ weapons/armor) drives loot.select and crafted weapons. Items with no primary or unknown stay. An old userData items.json without these lists = no filtering until 'Update loot data'.
- Season filter: loot:info adds a 'This season' entry = Journal 'Current Season' tier + instances containing bosses named in progression.json bossOverrides (default selection). Unverified against real Journal data.
- Dual-wield = equipped off-hand is a one-hand/off-hand weapon (or Fury Titan's Grip); casters with shield/held off-hands are never treated as dual.
- Top Gear combos can explode with crafted + Catalyst (cap 200000); BiS pruning is permanent per round.
- wago.tools / raidbots are blocked in the dev sandbox: loot update and recipe download never tested on real servers.
- UI strings are English; UI never viewed in a real window.

AUDIT (Oct 21) - what changed
-----------------------------
- main.js: run() wrapper (busy guard, temp cleanup, cancel -> "Cancelled"), runSimc (stale out.json removed, safe parse, error tail),
  atomic writes, download() with timeout, loot cache by mtime.
- Precision: simc target_error only stops EARLY; iterations= is the hard cap (default 20000). pass() now sets iterations=iterCap(err)
  (=1.5*(21/err)^2, 10k..500k), profileset_work_threads=min(2,threads). Precision select Fast/Standard/High in the Engine card.
- fight.js: extra options cannot override engine args (FORBIDDEN regex). Window hardened (no new windows/navigation).
- Dual-wield one-handers tried in off-hand; ranged 2H (bows/guns/crossbows) in loot; tier set follows progression.json "tier".
- Renderer: error prefix stripped, threads default = CPU count and saved, class -> armor type auto-select, ilvl shown in BiS rows.
- Tests: `npm test` (node:test; test/units.test.js, test/e2e.test.js with test/fakesimc.js). Run before every zip.

ENVIRONMENT NOTES FOR THE ASSISTANT (21 Oct, OUTDATED: see ENVIRONMENT in START HERE; no more zips)
-----------------------------------
- Update (Oct 21): raw.githubusercontent.com (simc repo) IS reachable from the sandbox; wago.tools and Raidbots still not tested; all network-dependent code
  (loot update, future engine download) is untested against real servers. Be explicit about that.
- Raidbots publishes static data files, but no consumables list was found; avoid depending on Raidbots (project goal).
- Keep builds lean; test pure logic with small node scripts; always re-zip to /mnt/user-data/outputs/localbots.zip.

BOSS FIGHTS (BigWigs based) - Oct 21-22: Kith'ix + all 8 Venomous Abyss bosses
-----------------------------------------------------------------------------
- Source: BigWigsMods/BigWigs repo (sparse blobless clone works from the sandbox; GitHub API and github.com HTML pages do NOT): TheUnbindingOfKithix/Kithix.lua,
  TheVenomousAbyss/*.lua (CoiledAltar, Explorers, Nekzali, Sentinels, Sszorak, TwinFangs, Ulatek, Vashnik). MidnightLairs/Nymrissa.lua not done.
  The modules have no timer table: they match Blizzard encounter-timeline events by their ROUNDED INITIAL DURATION. Durations of events queued at a stage start
  are treated as seconds after that stage start; later cycles are NOT recoverable (data uses `repeat` periods that are my assumptions).
  tools/bw-extract.js summarises a module's `rounded == N` ladder per mechanic (works for Kithix, Sszorak, Sentinels, Explorers, Nekzali, Vashnik, CoiledAltar;
  Twin Fangs and Ula'tek have other layouts and were read by hand).
- Boss mechanics/effects come from Icy Veins boss guides (WebFetch works for URLs that appeared in search results). Most effect sizes are GUESSES: every mechanic has
  `timesFrom` (bigwigs|guide|assumed) and an `assumed` list; the UI preview shows them.
- Format v2 (documented at the top of lib/boss.js): stages (at seconds / atPct), mechanics (adds|movement|vulnerable|invulnerable|damage_done_buff), per difficulty
  times (array or per-stage object) + repeat periods. data/fights/*.json; copies in userData/fights override by id ("Edit…" opens that folder).
- lib/boss.js build() -> `raid_events+=/type,name=..,timestamps=a:b:c,duration=..` lines. VERIFIED with a real simc 12.1.5.70448 built in the sandbox (engine/Makefile,
  OPTIMIZE=0, ~25 min on 2 cores; sparse dirs engine + source_files): every bundled fight starts all its events. GOTCHA: fight_style=Patchwerk CLEARS raid_events
  (sim.cpp init_fight_style), so boss fights pass NO fight_style.
- Not modelled: tank/healer mechanics, raid damage, Bloodlust timing, boss repositioning, the second boss pool of two/three-boss fights (the sim fights one target),
  whether bosses are targetable in intermissions (invulnerable windows for Sentinels/Nek'zali/Twin Fangs/Ula'tek are guesses).
- Two-boss fights note: Entombed Sentinels, Twin Fangs, Lost Explorers (3), Coiled Altar P3 have several bosses with separate health pools.

UI POLISH (Oct 21, done while the user slept; the UI had never been viewed before)
-------------------------------------------------------------------------------
- Viewed in headless Chromium with a mocked window.api (test/ui/shot.js + mock.js; light/dark, 1440 and 1000 px).
- Changes: field colour tokens (inputs no longer look disabled), card radius/shadow, hover states, idle progress bar no longer animates,
  sticky Run/Cancel bar (Ctrl+Enter runs), Difficulty select hidden unless a boss is chosen, compact "Edit..." button, relative gain bars
  and a Copy button for results (plain text), fight label in the results summary, neutral "Cancelled." state and a styled error state,
  numbered empty state, pasted export kept in localStorage, dark-mode button contrast, narrow layout log height.
- Still not done: results column order on narrow windows (results end up below the log), i18n, accessibility audit beyond focus rings.

NEXT FEATURES (priority order, set by the user on 21 Oct; items 1 and crafted gear/Catalyst/audit are DONE)
-----------------------------------------------------------
1. BIGWIGS BOSS FIGHTS: done for Kith'ix + Venomous Abyss (Nymrissa Wavecaller in MidnightLairs still missing).
2. UI POLISHING: first pass done (see above); remaining: run history/comparison, narrow layout order, more screens (crafted/consumables expanded).
3. AUTO ENGINE DOWNLOAD (simc binary source, checksum/version display, Windows first).
4. PACKAGING (electron-builder, Windows first).
5. AUTO-UPDATE FROM GITHUB (electron-updater; needs packaging and signing).

=== ENGINE DOWNLOAD / UPDATER / PACKAGING (v0.2.0) ===
- lib/engine.js: parses http://downloads.simulationcraft.org/nightly/ index, picks newest simc-<ver>-win64-<hash>.7z (Windows only). main.js engine:info/check/install: download -> sha256 -> extract with 7zip-bin (asar-unpacked) -> userData/engine/<name> -> sets simcPath, writes engine.json, deletes older builds. Tested with a fake server + real 7z (test/engine.test.js). NOT tested against the real server (blocked in sandbox).
- lib/updater.js: electron-updater (GitHub provider), inactive when not packaged, autoDownload=false. IPC update:get/check/install.
- package.json build: NSIS x64; publish.github = danetch/localbots (set 22 Oct; the GitHub repo must exist with that name and be PUBLIC for electron-updater without a token). Installer is unsigned (SmartScreen warning). Release: push tag v* -> .github/workflows/release.yml.
- electron-builder packaging itself has NOT been run.
- Real Electron smoke test works under Xvfb: xvfb-run -a node_modules/electron/dist/electron . --no-sandbox --disable-gpu --remote-debugging-port=9333 --user-data-dir=<dir>, then Playwright chromium.connectOverCDP. App starts, no page errors, Engine card renders.
- Beware: pkill/pgrep/ps|kill patterns in the same command can kill the sandbox shell (exit 144).

=== TALENT PANEL (PROPOSED, NOT BUILT; awaiting user approval) ===
simc trait_data.inc gives node id, row/col, max_ranks, node_type (0 normal,1 tiered,2 choice,3 hero select), id_sub_tree, id_spec. No edges/prereqs. Export string is bit-packed (version, spec, 128-bit tree hash, nodes in id order: selected/purchased/rank/choice) -> decodable/re-encodable; verify roundtrip with simc. Plan: decode current build, test choice-node swaps (always valid) and hero-tree swaps via profileset talents=, rank by DPS, output import string. Risks: node order, prereq validity, string quirks.

=== TALENT PANEL v1 (BUILT, user-approved scope: select among builds already in the export) ===
- lib/talents.js: parse(text) -> builds from `talents=` (active) and `# talents=` lines, named from a preceding `# Saved Loadout: <name>` comment (the addon's comment format is ASSUMED from memory, not verified against a real export). header() decodes version/spec exactly as simc's parse_traits_hash (6 bits/char LSB first; 8 bits version must be 2; 16 bits spec id). Builds whose spec differs from the active one are flagged unusable. apply(text, string) replaces the active talents= line (or appends one).
- main.js `run` wrapper: o.builds=[{string}] -> 1 build: swap talents= and run as before; >=2: run the mode once per build sequentially, return {builds:[{name,string,result}]}; progress is scaled per build with a "[name] " label prefix (progScale). IPC talents:parse.
- Renderer: "Talent builds" checkbox list in card 1 (shown when >=2 builds); showMulti() = comparison table (best DPS: top = best row, drop = current DPS, bis = final) + click a build for its detailed result; history stores multi results.
- topgear.parse ignores `# talents=` / `# Saved Loadout` comments as item labels.
- Tests: test/talents.test.js (19 tests total pass). Not done: editing talents / node swaps (needs prerequisite data, see proposal above).

=== UI FIXES (round after talent panel) ===
- Card numbering is now CSS counters over visible #setup cards (no manual "1 · "); spans .n inside summaries.
- "Update loot data" moved out of the drop/bis-only Loot source card into an always-visible "Game data" card (Top Gear's Catalyst/Crafted need it).
- Crafted gear card shows "What will be tested" (IPC craft:preview -> per slot: base items + variant count). Crafted pool = every craftable base item of the class's armor type/primary stat (+ jewelry, weapons only if weapon types ticked) x ticked stat pairs x embellishments allowed in the slot; not limited to bracers/offhand/cloak.

=== UI REDESIGN (desktop layout) ===
- Header bar: brand, mode segmented control (name=mode radios), Run/Cancel, game-data status + "Update loot data", Settings button (red dot when no simc). Thin progress strip under it (ids ptxt/bar/fill/ptime kept).
- Left column = accordion of <details class="card sec"> with a live one-line summary (span.sm#sm_*, filled by updSum()): Character, Talent builds (hidden unless >=2 builds), Options, Fight, Buffs & consumables, Loot source (drop/bis), Crafted gear, Consumables to compare (bis). Numbering = CSS counters over visible sections. Expand all / Collapse all buttons. All sections collapse when a run starts; pasting a recognisable export folds Character.
- Right column = tabs Results / History (n) / Activity log (showTab()). Copy button only on Results.
- Settings <dialog id="setdlg">: simc path/select, threads, precision, engine version/download, app update check.
- Old three-column layout, runbar and #histcard removed. All element ids used by the JS were kept. Mock-driven screenshot scripts live in the scratchpad only (test/ui/shot.js still works for the basic states but predates the new layout).

=== TASK LIST / NEXT (user-requested order) ===
1. Bug fixing pass (user will report).
2. Show simc's HTML report for the top result (user asked to ADD TO THE LIST, NOT to build yet). Idea: after a run, re-run the best set once with html=<file> (and optionally json2) and show it in a new "Report" tab (iframe srcdoc or file:// via a sandboxed iframe; CSP currently default-src 'self' so allow frame-src/ child blob/data accordingly). For Top Gear: apply the winning diff to the base profile; for BiS: the final set; for Droptimizer: the best drop. Needs a higher-iteration final run for a clean report.
3. Nymrissa Wavecaller fight; multi-boss pool modelling.
4. Talent editing (node swaps) if wanted: see proposal above.

=== SELECT ALL INSTANCES + CLASS WEAPON TABLE ===
- Loot source: "Select all" / "Clear" buttons tick/untick every instance currently listed (the tier selector filters; default "This season (...)" = synthetic tier built in loot:info). Whether the season tier contains BOTH raids and M+ dungeons depends on the loot data/progression.json (not verified with real data).
- Weapon type checkboxes (loot source and crafted card) are gone. lib/specs.js: WEAPONS_BY_CLASS (Item subclass ids), SPEC_WEAPONS (only Assassination = daggers), SHIELD_CLASSES (warrior/paladin/shaman), weaponsOf/canShield/classOf. Table is written from game knowledge, NOT read from game data, unverified for Midnight (e.g. warrior bows/guns omitted, Devourer DH assumed to use the DH list). main.js weaponsFor(text) feeds loot.select (also `shield`); IPC weapons:of shows "<Class> can wield: ..." under the "Include weapons & shields" checkbox.
- Crafted weapons: added automatically when a weapon embellishment (slots main_hand/off_hand in crafted.json) is ticked, restricted to the class's weapon types. Spec primary stat filter and 2H/dual rules still apply.
- Possible follow-up: derive proficiencies from wago SkillRaceClassInfo during "Update loot data" instead of the static table.

=== CONSUMABLE NAME FIX ===
Bug: simc error "Invalid consumable 'potion_of_devoured_dreams_2'". Cause: loot.js GUESSED rank suffixes (_1.._3) whenever several items shared a name. simc (engine/player/consumable.cpp find_consumable) accepts name + optional _<n> only if an item with that tokenized name has crafting_quality n (quality 0/1 = plain name).
Fix: items.parse() now also returns cq {consumable id: crafting_quality} read from simc's item_data.inc (last column of each row; verified on real data: Tempered Potion 1/2/3). "Update loot data" downloads item_data first, passes t.cq to loot.build -> buildConsumables only offers valid names (plain, plus _n for qualities >=2). loot.json gets consVer=2; older loot.json (no consVer) has its "guessed" entries filtered out in loot:info until the next update. cq is not stored in items.json.

=== THEME / THREADS / ITEM STATS ===
- Theme: Settings > Appearance (Follow the system / Light / Dark). CSS vars are under `@media(prefers-color-scheme:dark){:root:not([data-theme=light])...}` plus `:root[data-theme=dark]`; choice kept in localStorage lb_theme.
- Threads: the Threads input is replaced by "Threads left free" (default 6, setting `reserve` saved by the run wrapper). Threads used = navigator.hardwareConcurrency (LOGICAL processors, 24 on a 12-core SMT CPU) - reserve, min 1. Interpretation of the user's "leave out 6 cores" = 6 logical processors; adjustable.
- Item stats in results: main.js statsPass() runs ONE extra simc (iterations=1) with `copy=sN,<charname>` per variant and reads gear stats (extractGear) of the changed slots. Top Gear: finalists (all rows). Droptimizer: top 40 rows. Verified with a real simc build (Top Gear rows carry stats; copy + redirected_base_stats shows the SOURCE piece's secondaries). Skipped (decorative, logs a line) when the character name contains spaces/commas or simc fails. BiS already had stats. Renderer shows them via statTxt in a grey .st span and in the Copy text.

=== STARTUP SIMC UPDATE CHECK (retail only) ===
- 1.5 s after launch the renderer calls engine:check (Windows only; silent on network errors). If a newer build exists a banner under the header proposes it with its version token, build hash and date ("1210-01 · build 7bd7371 · 2026-10-21", plus the installed version/hash/hotfix). [Update now] downloads/installs; [Later] remembers the dismissed hash in localStorage (lb_simc_dismissed). With no simc selected it offers the download.
- Retail vs PTR/beta: archive names do not say. Rule used (main.js pickBuild): only builds of the INSTALLED version family (banner token, e.g. 1210-01) are offered; with nothing installed the family is read from simc master's engine/config.hpp (SC_MAJOR/MINOR_VERSION, raw.githubusercontent), else highest. Higher families are only reported in Settings ("newer version 1220-01 exists ... may be PTR/beta" + "Install ... anyway" button). Observed in simc source: one binary contains live data (12.1.5) AND PTR data (12.1.7, *_ptr.inc); sims use live unless ptr=1 is passed, which LocalBots never does.
- Up-to-date test: installed banner git hash (or engine.json hash) vs archive hash prefix (engineLib.sameBuild). A user-supplied simc whose hash is unknown will be proposed the latest build until dismissed.
- NOT verified against the real download server (blocked in the sandbox); listing date regex assumes Apache's "YYYY-MM-DD HH:MM" after the link. Tests: units (family pinning, dates) + engine.test.js. UI verified with a mock.

=== SIMC HTML REPORT, CONSUMABLE RANKING, WOWHEAD LINKS ===
- simc HTML report of the best result: Options has a checkbox "Create the simc HTML report" (default on, `report` in run options). Top Gear: one extra run of the winning diff (reportPass, finalist precision, html=<tmp>); Droptimizer: best row; BiS: the final check pass writes html directly. Files kept in userData/reports (last 10); result.report = path; "Open simc report" button (Results tab bar) -> IPC report:open (path must be inside the reports dir) -> shell.openPath. Failure only logs ">> simc report unavailable". The sandbox simc build (sparse source) cannot write HTML (empty file, exit 61), so the real report was NOT verified; tested with test/fakesimc.js (writes a fake html) in e2e.
- BiS "Consumables (best first)": after the final check each ticked category (flask/food/potion/augmentation) is simulated on the final set (fine(0.2)); the chosen option is the top line and the runner-ups show delta vs the chosen set. Result field consumablesRank; also in Copy text. Only BiS compares consumables (Top Gear/Droptimizer do not).
- Wowhead: lib/wowhead.js whOf(item) -> "item=ID&bonus=a:b&ilvl=N"; results carry `wh` (Top Gear items, Droptimizer rows, BiS set rows, consumables via the `id` now stored in loot.json consumables). Renderer wl() renders <a class="wh" data-wowhead>. tooltips.js is loaded from wow.zamimg.com (CSP widened for wow.zamimg.com / *.wowhead.com), whTooltips {iconizeLinks:true, renameLinks:false}, links refreshed by a MutationObserver on #res. Settings has a toggle (localStorage lb_wh; turning off needs a restart). Links open in the browser through setWindowOpenHandler (wowhead.com only). NOT verified against the real Wowhead script (sandbox has no access): if icons do not appear, check the console for CSP violations and the refresh call ($WowheadPower.refreshLinks).
- Consumable ids exist only after "Update loot data" with this version (older loot.json has no ids -> no icons for consumables).

=== 22 OCT: GITHUB OWNER, DR-AWARE CONSUMABLES, ENCHANTS & GEMS ===
- GitHub: package.json publish owner = "danetch", repo "localbots". Release = push tag v* (workflow builds + publishes with GITHUB_TOKEN).
- Profession flasks hidden: lib/loot.js NOT_COMBAT (name regex: perception/ingenuity/finesse/deftness/resourcefulness/multicraft/crafting/
  gathering/... + "of honor" PvP flask + cauldrons). Applied when building loot.json AND in loot:info (older loot.json too).
- Diminishing returns (lib/dr.js), VERIFIED in simc source 12.1.5: curve 21024 (item_scaling.inc) on the % FROM RATING:
  0-30 full, 30-40 90%, 40-50 80%, 50-60 70%, 60-80 60%, 80+ 50%. Rating per 1% at level 90 (sc_scale_data __combat_ratings):
  crit 46, haste 44, mastery 46 (per point), vers 54. Other levels: DR steps skipped (logged).
  simc option profileset_output_data=stats -> profilesets.results[i].overrides.stats.{crit,haste,mastery,versatility}_rating (report_json.cpp);
  base profile: players[0].collected_data.buffed_stats.stats (same keys). pass() now returns r.st and baseStats.
- Best in Slot changes (main.js sim:bis):
  * Round 1 = gear only. Consumables, enchants and gems join from round `consFrom` (UI "Consumables, enchants & gems from round", default 2);
    if gear stops improving earlier, they join at the next round instead of stopping.
  * Scans run with profileset_output_data=stats -> each option gets a rating delta vector e.d.
  * DR pairs (bis.drPairs + dr.interacts): a gear/enchant/gem change and a consumable that move the SAME stat with the total inside the DR
    zone (>30% from rating) are simulated together (top 10 gear-side x all stat consumables, max 40 per round). Different stats never
    interact through DR (the curve is per stat), so they are not paired.
  * Two upgrade chains validated in one batch: greedy, and DR-aware (pickWinners drOf: never stacks two separately measured changes on the
    same DR-zone stat). Best prefix of either is kept; the log says when the DR-aware one won.
  * Result: "Secondary stats & diminishing returns" table (rating, % from rating, after DR, value of next point).
- Enchants & gems (lib/enhance.js, data/enhance.json built by tools/build-enhance.js from a simc tree; refreshed into userData by
  "Update loot data" from raw.githubusercontent simc tables: permanent_enchant.inc, spell_item_enchantment.inc, gem_data.inc, item_bonus.inc
  + item_data.inc):
  * Current expansion = enchant/gem families whose best quality rank is exactly 2 (Midnight; TWW/DF had 3). Checked: selects exactly the
    Midnight set. Best rank used. Dominated options pruned (same stats, less of each: e.g. Amani Mastery < Zul'jin's Mastery, plain < Flawless).
  * Enchants tested: slots whose enchants give our primary stat, a secondary stat, or a proc on rings/weapons (chest, legs, rings, weapons;
    off hand only when dual wielding). Utility enchants (speed/leech/avoidance: head, shoulders, feet) are left as exported. Hunter scopes
    only for BM/MM hunters (rule, not data).
  * Gems: 16 Flawless secondary gems + diamonds (Indecipherable, Powerful; Stoic=armor and Telluric=mana skipped). One diamond max (guide:
    unique-equipped; not read from data). Gem plan = pseudo-slot "gems" (diamond first, sorted ids) filling the set's sockets in
    SOCKET_ORDER; moves: other diamond, all secondaries of one kind, one gem replaced.
  * Sockets (simc does NOT check them: enchants.cpp applies every gem_id entry): neck/rings >= 1; head/wrist/waist +1 with Radiant
    Jewelbinder (UI checkboxes, default all three); + item_bonus type-6 sockets from bonus_id; + gems already listed in the export.
  * Logical set S has pseudo-slots "ench:<slot>" and "gems"; enhLib.materialize(S, ctx) builds the simc strings (enchant follows the slot).
  * Gems follow the slot elsewhere: Droptimizer and BiS (gems not optimised) give a new piece the replaced piece's gems when it has/gets
    sockets (head/wrist/waist assumed re-socketed if the old piece had a gem). Top Gear bag items keep their own gems.
  * Results: BiS set rows show "Enchant: ... · Gems: ..." (green dot when changed); round history names "ring 1 enchant", "gems".
- Tests: test/enhance.test.js (parsers on real rows, data choices, sockets, materialize, plan moves, DR, pairs, flask filter), e2e BiS run
  with enchants+gems (fakesimc now scores the FULL profile and emits stats). npm test: 30 pass.
- VERIFIED with a real simc built in the sandbox (master, 12.1.5.70448, OPTIMIZE=0 SC_NO_NETWORKING=1, ~40 min on 2 cores; sparse
  checkout engine + source_files + profiles): profileset_output_data=stats keys, buffed_stats path, enchant_id / gem_id swaps change
  ratings, simc applies a gem to an item WITHOUT a socket (so our socket counting is required), DR model matches simc's haste %.
  Full app BiS run on profiles/MID2/MID2_Rogue_Outlaw.simc (converted to addon format: slot=,id=..., shoulders->shoulder, wrists->wrist),
  enchants+gems+4 flasks, consFrom 2: 21.8 min, 296180 -> 298661 DPS; DR pairs fired on haste (30.7% from rating); final gem plan moved
  haste below 30%. simc's own default profiles use Eyes of the Eagle on rings, which BiS kept.
- Fixed after that run: consumables written in the export are the start value of their category (no fake "Current setup -> same flask").
- UNVERIFIED: Eversong Diamond uniqueness limit (guide), whether simc implements every Midnight weapon/ring proc enchant, the profession
  flask name list (names from guides), Radiant Jewelbinder socket being prismatic (any socket bonus id has the same sim effect).

=== 23 OCT: BiS "never goes back" fixes + full run logs ===
User report: BiS did not pick the Ula'tek head although it is clearly stronger; the Activity log (UI keeps only the end) was too short to tell.
Analysis (code): (1) pruning below -1.5 % was PERMANENT, (2) no move "non-tier piece in a tier slot + tier piece elsewhere", so a strong
non-tier head replacing a set piece looked bad alone (breaks 2/4-piece) and was dropped, (3) boss-name overrides for item levels needed
an exact name match ("ula'tek"), else Myth 1/6 (318) was used.
CORRECTION: with Catalyst ON and no charge limit, every tier-slot candidate already has a twin (bis.addCatalyst; twins are never pruned),
so (2) cannot explain the report in that case. The first regression test "reproduced" it only because test/fakesimc.js ignored
redirected_base_stats (fixed: a twin now scores like its source piece). Real effect of tierSwaps: Catalyst OFF or capped (max charges).
Root cause of the user's case still unknown: needs the new full run log (item level given to the head, Catalyst/charges, filters).
- lib/bis.js tierSwaps(S, entries, rules, tierIds): top 15 "breakers" (non-tier swap of a set piece) x best tier option per other tier slot
  that is not tier yet (bag/loot tier piece or Catalyst twin). tierIds from the tier set even WITHOUT Catalyst (bag/loot tier pieces).
  Simulated each round right after the scan; the pair counts as good for the breaker's candidate (protects it from being set aside).
- Set-aside candidates (was "pruned") go to `dropped` and are re-tested against the current set before stopping (no upgrade / within
  noise / nothing to change / last round). Once per distinct set; at most maxRounds + 3 rounds in total.
- lib/progression.js: names compared without case/punctuation; exact, then Journal name starting with / containing the key (4+ letters).
  resolve() returns override: true/false.
- Full log per run: userData/logs/run-<timestamp>.log (last 20). Header = options + the export; everything shown in the Activity log;
  BiS trace (file only): loot candidates with item level and sources, every option's gain each round, set-aside candidates, validated
  upgrade sets. Activity log tab: "Show full log file" button (IPC log:open -> shell.showItemInFolder). UI log buffer raised to 150-200k chars.
- Tests: 33 pass (head over set piece: twin with Catalyst; pair with 0 charges and with Catalyst off; log file; progression names).

ROOT CAUSE FOUND (user export: Demonology warlock "Lofo", 4-piece tier head/shoulder/chest/legs, Ula'tek cloth head
"Venomkeeper's Horrific Cowl" 271874 from the Loot source, Raid Mythic, Catalyst on, no charge limit, M+ loadout):
reproduced with real simc + real MID2 tier data. ORIGINAL code: boss named exactly "Ula'tek" -> picks "Cowl -> tier" (twin works);
any other Journal spelling -> override missed -> Myth 1/6 = 318 < current 321 head -> nothing picked. = the user's symptom.
New code: tolerant name match + log warning ">> Item level: no per-boss entry for ..." listing bosses that fell back to the default rank.
New code also finds the better move "plain Cowl (344) + hands -> tier (Catalyst)" (+1.77 % vs +0.95 % for the Cowl twin alone).
The real Journal name of Ula'tek is still unknown (wago not reachable); the warning will show it if it still mismatches.

=== 23 OCT (morning): REAL ROOT CAUSE of "Ula'tek head not picked" + fix ===
Read the user's real userData (loot.json, progression.json, last-bis-result.json) through the linked PC (folder access granted).
- The boss-name theory was WRONG: the Journal names the boss exactly "Ula'tek" (encounter 2895) and the user's progression.json has the
  override (it only lacks "tier": "MID2"). Venomous Abyss encounters: Sszorak 2871, Entombed Sentinels 2874, Vashnik the Malignant 2882,
  The Coiled Altar 2883, The Twin Fangs 2887, Nek'zali the Soulcoiler 2888, The Lost Explorers 2894, Ula'tek 2895; Kith'ix 2896 (own raid).
- Real cause: legacy M+ dungeons (Kings' Rest, Temple of Sethraliss, in "Current Season") list each remade item TWICE: the original Battle
  for Azeroth id (Azerite budget: primary 10000 + stamina, NO secondary) and a remade copy with a newer id and normal stats
  (159236 -> 239047 Headdress of the First Empire, 159254 -> 239031, 159257 -> 239032, ...). As `,id=X,ilevel=N` the old ids get ~70 % more
  primary stat (359 int at 334 vs 189 int + crit/vers for the remade one), so BiS put three of them (head/shoulders/chest, via Catalyst).
- Fix (lib/loot.js select): per boss keep only the NEWEST id of each item name; safety net: skip loot whose simc stats are primary-only
  in head/shoulder/chest (items.json "nosec", lib/items.js parse; bundled data/items.json regenerated from simc 12.1.5.70448; an older
  userData items.json has no nosec until "Update loot data" — the newest-id rule alone covers the known cases). Log line + run-log details.
- Loot candidates still use NO bonus ids (`,id=X,ilevel=N`): verified with real simc that this gives the same stats as the real item for
  current items and legacy non-Azerite items. Not modelled: tertiary stats / random sockets that only come from bonus ids.
- Verified on the user's own data with real simc (Kings' Rest + Temple of Sethraliss at M+ +10, Venomous Abyss Mythic, Catalyst on, M+
  talents): BiS takes the Cowl (as tier in round 1, plain in round 3 once Ula'tek hands carry the tier). 10 min on the debug simc build.
- Tests: 34 pass.

=== 23 OCT: GITHUB + RELEASES (repo danetch/localbots, public) ===
- Code lives in https://github.com/danetch/localbots (branch main). This file is HANDOFF.md in the repo: no more zips.
- Release = bump "version" in package.json and push to main. .github/workflows/release.yml: job check (does release v<version> exist?),
  test (ubuntu, npm test), win (windows, electron-builder --win --publish always, releaseType "release"). Pushes without a version
  bump run only the check job. Tag pushes from the Claude sandbox are cut off by its proxy, hence no tag trigger.
- v0.3.0 published 23 Oct: LocalBots-Setup-0.3.0.exe (82 MB, unsigned NSIS) + latest.yml. First packaging run succeeded.
- Startup update check (renderer checkAppAtStart, 4 s after launch): banner "LocalBots x is available" -> Update and restart
  (electron-updater downloadUpdate + quitAndInstall); "Later" remembers the version (localStorage lb_app_dismissed). Installed app only.
- Installed app userData = %APPDATA%\LocalBots = same folder as dev (%APPDATA%\localbots, case-insensitive): data carries over.
- Linked PC (Matthias): code folder C:\Users\Matthias\Code\localbots, data C:\Users\Matthias\AppData\Roaming\localbots (read access granted
  in the 23 Oct session; the device shell did not start, file listing/staging works).

=== 23 OCT: SOCKETS & GEMS IN ALL MODES (v0.3.1) ===
- Socket count (lib/enhance.js socketsOf) = built-in sockets (items.json "sock", from item_data socket colours; e.g. 268265 Aqirbane
  Reliquary = 1) + socket bonus ids (item_bonus type 6, e.g. 13668 on every Midnight neck/ring drop, 13534, 13750) and at least the gems
  already listed. Necks/rings WITHOUT bonus ids (loot/crafted strings we build) = built-in + 1 (the drop socket): Aqirbane from loot = 2.
  Jewelbinder (+1) only on a head/wrist/waist without any socket.
- Gems belong to the SET (materialize): the plan (BiS gem optimisation: S.gems; otherwise keepCtx.keepPlan = equipped gems) is spread over
  the sockets of the set in SOCKET_ORDER, diamond first. Swapping the piece holding the diamond keeps the diamond; more sockets -> extra
  copies of a secondary gem; fewer -> a secondary is dropped, never the diamond. Empty sockets in the equipped gear are filled with the
  most common equipped gem (logged). Top Gear and Droptimizer use keepGems() (main.js): base text = export + materialized base, profileset
  diffs materialized; a Jewelbinder socket is assumed on a new head/wrist/waist only if today's piece in that slot has a socket.
  Replaces the old "copy the replaced piece's gems" carry rule.
- Verified on the user's export: neck swap to Aqirbane (loot) -> gem_id=diamond/secondary; PvP bag neck -> gets the diamond; real
  Droptimizer run (Venomous Abyss Mythic): Aqirbane Reliquary top at +0.59 %. Tests: 35 pass.

=== 23 OCT: v0.3.2 — TOP GEAR UPGRADES + CONSUMABLES, RESULTS LAYOUT ===
- Upgrade tracks from item_bonus type 34 (enhance.json "upgrade": { bonusId: [group, rank] }, ranks = bonus ids of a group in id order).
  Midnight S2 groups: 614 Adventurer?, 615 Veteran?, 616 Champion, 617 Hero, 618 Myth (Myth has 9 levels: 12849..12854 = 1/6..6/6,
  12855/12856/13848 = drop-only levels, 13848 = 344 "9/6"). Checked on the user's export (12843 = 311 Hero 3/6, 12846 = 321 Hero 6/6,
  12849 = 318 Myth 1/6, 12854 = 334 Myth 6/6, 12833 = 292 Champion 1/6). progression.json "upgradeTracks" maps group -> track (an
  older userData copy without it falls back to the bundled mapping). Adventurer/Veteran have no track table: not upgraded.
- Top Gear "Upgrades": As they are / Bag items fully upgraded / All items fully upgraded (lib/upgrade.js upgradePools, before Catalyst
  twins and gems). Current ilvl read from ilevel= or the export comment "(N)". PvP items are upgraded along the track their bonus ids
  show (logged as a caveat).
- Consumables in Top Gear (rankConsumables shared with BiS): ranked on the best combination; if an option beats the current setup by
  > 0.1 %, the finalists are simulated again with it (rows then reflect it; summary "finalists with ...").
- Results: items in game order; Best in Slot set and Top Gear rows as a character sheet (left: head, neck, shoulders, cloak, chest, bracers,
  weapons; right: hands, waist, legs, feet, rings, trinkets; one column under 1250 px). Item cell = Wowhead link block (icon inserted by
  tooltips.js as first child -> left; name + detail lines right). Real Wowhead script not testable in the sandbox (stand-in icon used).
- Tests: 37 pass.

=== 23 OCT: v0.3.3 — TOP GEAR CRAFTED PRE-SCREEN, TOP GEAR GEMS, ICON ===
- Crafted gear in Top Gear used to fail with "Too many combinations" (all embellishments + all stat pairs = 1296 variants on the user's
  warlock; even 3 embellishments x 2 pairs = 18 per slot in 4 slots). Now: if tg.estimate(pools) > 15000, every non-equipped candidate is
  simulated alone (tg.singleSwaps; rings/trinkets in both slots), then tg.prunePools keeps equipped items + candidates best-first across
  ALL slots while the estimate fits a budget; the budget is raised (x4 steps) while the REAL combos count stays < 5000 (the estimate
  ignores the embellishment cap). combos() now cuts branches above the embellishment cap during recursion (was: checked at the leaf
  after millions of visits). User's data: 1296 variants -> 3347 combos; 72 variants -> 9119 combos; set-aside items in the run log.
- Top Gear gems ("Enchants & gems" section now visible in Top Gear, gems only; enchants stay BiS): plan optimised on the best
  combination (planMoves, up to 4 rounds, Jewelbinder sockets as ticked), then the finalists are simulated again with the plan.
  Baseline keeps the current gems. Result summary shows the plan.
- Top Gear results: one column in game order (the character sheet is kept for Best in Slot).
- Icon (v0.3.5): build/icon.svg = simple gold anvil + spark on the navy tile with gold rim (was bars + gem in 0.3.3), build/icon.png (512), build/icon.ico
  (16-256), renderer/icon.png (window + header). package.json win.icon / nsis installer icons.
- Tests: 39 pass.

=== 23 OCT: v0.3.4 — TOP GEAR CRAFTED = SLOT/EMBELLISHMENT THEN STATS; TOP GEAR ENCHANTS ===
User framing: embellishments usually make 2 crafted pieces mandatory; the real question is which stats (with DR). Same embellishment
twice is allowed: no rule in the app, and simc stacks it (unique_gear_midnight.cpp arcanoweave_lining: "double value for double
embellishment").
- Top Gear crafted: famKey = crafted item string without crafted_stats. (1) Probe: the ticked stat pairs on ONE armor piece (wrist,
  back, waist, ... first; never a trinket) swapped into the current gear -> best pair. (2) Combinations use only that pair (6x fewer
  candidates); pre-screen (if needed) keeps the best piece of every crafted slot+embellishment group first (prunePools groupOf).
  (3) For the top 5 finalists: every stat-pair combination of their crafted pieces simulated together (max 216 per finalist; exact for
  DR between pieces); finalists re-simulated if any changed. User's data, everything ticked: 1296 variants -> 216 pieces -> 9539 combos,
  1080 stat-pair tests on 5 finalists.
- Top Gear enchants (with gems): joint coordinate ascent on the best combination (each round: best move per enchant slot and for the gem
  plan; all best moves combined if that beats the best single one), up to 6 rounds; then all finalists simulated again with them.
  Summary shows gems and enchants.
- Tests: 40 pass.
- v0.3.6: same as 0.3.5, re-released because two concurrent pushes both published v0.3.5 (one installer may carry an earlier anvil draft).

=== 23 OCT: RENAMED TO POLYGNOME (v0.4.0) ===
- Name chosen with the user ("poly" = many gnomes testing parallel versions of your gear; sounds like polynomial / French polynome).
  Quick web search found no product using it. Tagline: "A thousand gnomes test your gear so you don't have to."
- Changed: productName "Polygnome", package name "polygnome", window/header/title, update texts, tmp dir prefixes, README.
- KEPT ON PURPOSE: appId "com.localbots.app" (Windows identity: installed 0.3.x copies update in place to Polygnome) and the GitHub repo
  danetch/localbots (updater feed baked into installed copies). Renaming the repo later = first ship a release pointing to the new name.
- Data folder follows the product name: %APPDATA%\Polygnome (dev: %APPDATA%\polygnome). main.js migrateFromLocalBots() runs at
  startup before anything opens the folder: if the new folder has no settings.json/loot.json and %APPDATA%\LocalBots has settings.json,
  copy everything except Chromium caches, rewrite settings.simcPath if it pointed inside the old folder, write migrated-from.txt; the old
  folder is kept. Test: test/migrate.test.js. Tests: 41 pass.
- Not verified on a real Windows install: that the packaged app's data folder is %APPDATA%\Polygnome (Electron uses productName when
  packaged) and that the NSIS update from "LocalBots" to "Polygnome" replaces the old shortcut/uninstall entry rather than adding one.

=== 23 OCT (evening): GNOME ICON, CATALYST DEFAULT, ARMOR FROM CLASS, CONSUMABLES CARD, SEASON FILTER BY UPGRADE TRACK ===
- Icon (v0.4.1): build/icon.svg = a low-poly gnome hat: pink triangle facets lit from the left, floppy tip bent to the right, wide
  base, faceted gold band, on the navy tile with gold rim, no star. Chosen after several rounds (bearded gnome, gnome engineer girl, four
  close-up girls, straight triangle cone, orange hat with fur band and pompom). Reads as a hat down to 16 px. A "hats as a results chart"
  variant (same hat at four heights, blue -> pink) was liked for big placements (README / empty Results screen), not built.
- Options: "Include Catalyst (tier) versions" is ticked by default (not persisted, like before).
- Loot source: armor type comes from the export's class (lib/specs.js armorOf/ARMOR; main.js uses specs.armorOf(text) || o.armor). The
  Armor select is only shown when the export has no class line; otherwise the card says "Armor: Cloth (from your class)."
- Consumables: one "Consumables" card, all modes: current setup (flask/food/potion/rune overrides + "No consumables", were in the buffs
  card) then "Consumables to compare" (Top Gear / BiS). The old card is now "Raid buffs & extra options". "Consumables, enchants & gems
  from round" stays in Options (it also drives enchants/gems); the BiS part of the card points to it.
- Season filter ("This season" in Loot source). Problem: the Journal's "Current Season" tier still lists the S1 raids (The Voidspire,
  March on Quel'Danas, The Dreamrift, Sporefall) and the Midnight world bosses. VERIFIED on real wago data (read through the user's
  built-in browser; wago.tools is blocked in the sandbox): an item's bonus tree (ItemXBonusTree -> ItemBonusTreeNode, recursive) names
  its upgrade-track groups, either as ChildItemBonusListGroupID or as a type-34 bonus inside a ChildItemBonusListID (Sporefall). Same numbers
  as simc item_bonus type 34 / progression.json upgradeTracks: S1 raids 609-612, S2 raids (Venomous Abyss, Kith'ix, Tidebound Grotto)
  615-618, Altar of Fangs 614-618, legacy M+ dungeons 310 only (not a track). BUT Midnight S1 dungeons back in the S2 M+ rotation
  (Murder Row, Blinding Vale, Den of Nalorakk, Voidscar Arena) also list only S1 groups 608-612, so only RAIDS are filtered:
  Map.InstanceType (JournalInstance.MapID -> Map) 2 = raid (world-boss "Midnight" instance is typed raid too), 1 = dungeon.
  * "Update loot data" downloads Map, ItemXBonusTree (3.6 MB), ItemBonusTreeNode, ItemBonus (optional; ~5 MB together). loot.build stores
    per instance `type` (Map.InstanceType) and `groups` (upgrade groups of all its drops; lib/loot.js trackGroups).
  * loot:info: a raid in the season set is dropped when lib/loot.js seasonOf(groups, current groups = progression upgradeTracks keys,
    known = enhance.json upgrade groups) === 'old' (only other seasons' tracks). Unknown/no data -> kept. Tier entry carries `left`
    (names left out) or null when the loot.json predates this (UI: "Run Update loot data to leave last season's raids out").
  * Next season: only progression.json "upgradeTracks" needs the new group ids (they also drive Top Gear upgrades).
  * Test with real rows: units "season of an instance from its drops' upgrade-track groups". The full loot:update path with the new
    tables has NOT run against the real server from the app (needs the user's "Update loot data").
- UI checked in Electron under Xvfb with test/ui/mock.js (screenshot script in the scratchpad: preload evals mock.js, contextIsolation off).
- Tests: 44 pass.

=== 23 OCT (night): NYMRISSA WAVECALLER + COUNCIL FIGHTS ===
- data/fights/nymrissa.json (BigWigs MidnightLairs/Nymrissa.lua b26c019 + Method guide): Shorerunner murloc adds (Mythic: + Frostscale
  shield add, kill first), Swirling Whirlpools, Chilling Frost soaks. Pull timers 25 / 107 / 35, repeat 132 s = 3 x the 44 s rotation (assumed).
- Council fights (lib/boss.js `bosses`, `present`, mechanic `allBosses`): desired_targets = 1 + extra bosses, invulnerable windows for an
  extra boss outside its stages (target=Dummy_Enemy_n) + ignore_invulnerable_targets=1 so cleave/AoE ignore it (simc source: player.cpp).
  Twin Fangs = 2 bosses all fight, both submerge; Lost Explorers = 2 bosses (two kept together, the third out of range: 99 % DR within
  30 yd); Coiled Altar = Malacrass from 20 s into stage 3; Entombed Sentinels stays single target (split raid).
- VERIFIED with a real simc (midnight branch cc01837, OPTIMIZE=0, ~50 min build on 2 cores; profiles/MID2/MID2_Rogue_Outlaw.simc,
  app's own fightArgs, 40 iterations; per-enemy damage = collected_data.resource_lost.health, timing from resource_timelines.health):
  Twin Fangs: main 59.3 M, Ithraz 28.9 M (cleave), both take nothing 132-149 s (submerge 130-150). Coiled Altar 300 s: Malacrass takes
  nothing until 217 s (stage 3 at 198 + 20) then 7.6 M; at 210 s it starts at 158 s (138 + 20). Lost Explorers: 2 targets all fight
  (67.5 M / 31.6 M). Nymrissa (Mythic) and Sentinels run clean. simc accepts timestamps=0 and target=Dummy_Enemy_1 (targets are created
  before raid events are parsed, sim.cpp init).
- Still assumed: Twin Fangs submerge only once at 130 s (guide: 3 submerges before enrage, cycle length unknown); Nymrissa repeat periods,
  add counts/health; the third Lost Explorer is never in cleave range.
- Tests: 45 pass.

=== 24 OCT: BOSS TIMINGS CHECKED AGAINST REAL LOGS (Lorrgs.io) ===
- Source: api2.lorrgs.io (read through the user's built-in browser; lorrgs.io/WCL are blocked in the sandbox). Endpoints: /api/zones,
  /api/bosses/<slug>/spells, /api/spec_ranking/<spec>/<boss>?difficulty=mythic|heroic&metric=dps -> reports[].fights[] with duration,
  phases [{ts, phase_id}] (dynamic bosses) and boss.casts [{id, ts ms, c = cast count}]. Used rogue-outlaw top 50 per boss/difficulty;
  boss casts are present for ~2-6 of the 50 fights, phases and durations for all. Lorrgs only lists "relevant" boss spells, so mechanics it
  does not show (Plague Froth, Adaptive Infection, Gloombomb, Throw Junk, Icebound Flames, Essence Rend, Restless Amani, ...) stay as before.
- Engine: difficulties[d].stages (per-difficulty phase starts) and difficulties[d].duration (median real kill; the Fight card switches the
  length to it when boss/difficulty change, unless the user typed another length). Each difficulty has a `checked` note with the real
  numbers; timesFrom "logs" = checked against real kills. Health-driven phases are stored as % of the median kill (atPct).
- Changes: Nymrissa 110 s cycle (was 132); Twin Fangs split Heroic (169 s cycle, submerge 150) / Mythic (155 s, submerges 136 + 291, ~28 s
  each; was one 20 s submerge at 130); Kith'ix 109 s cycle (was 104), Extinguish per difficulty; Sszorak Dig In every 127 s (M) / 138 s (H)
  (was 120); Vashnik Imbibe every 84 s (was 90) + Mythic entry; Sentinels intermission ~15 s before each phase change at 57/159/260 s (was
  90/180/270); Nek'zali intermission/P3 at 41/64 % (H) and 34/66 % (M) (was 45/55 %); Lost Explorers new phase every 61 s (was 25 %);
  Coiled Altar P2 / intermission (Soulbinding, own stage 4) / P3 at 28/51/64 % (H) and 27/61/68 % (M), Malacrass from P3 start, P1-P3 cast
  timings from logs; Ula'tek hearts 135/284/574 (H), 145/295/584 (M), default length 580 s.
- Thin data: Kith'ix Mythic and Ula'tek Mythic = 2 kills, Coiled Altar Mythic = 19, Twin Fangs Heroic casts from 2 logs.
- Real simc check (cc01837): Twin Fangs Mythic no damage at 138-163 / 292-318 s (logs 136-164 / 291-319); Coiled Altar Heroic Malacrass
  from 211 s (logs 209). Tests: 45 pass.

=== 24 OCT: FIGHT LENGTH FROM AVERAGE RAIDS + ITEM LEVEL (Warcraft Logs) ===
- Problem: Lorrgs = top-50 logs (fast, burst phases a larger share of the kill). Warcraft Logs zone statistics, guild Speed (read through the
  user's built-in browser; the first page load showed a human check that I did NOT pass, later loads went through). Data endpoint:
  /zone/statistics/table/53/speed/<boss 0=all>/<difficulty 4 H|5 M>/<size 10|20 for M>/2/<percentile 50|25|75|99>/1/14/<ilvl bracket 0=all,
  n = 272+3(n-1)..+2>/Any/Any/All/0/normalized/single/0/-1/ -> table Boss | Date range | Parses | Duration | ... Speed counts kills only.
  Snapshot Oct 9-23 2026 stored per fight: difficulties[d].kills = { median, kills, p25, p75, p99, byIlvl: [[bracket mid, seconds, kills]]
  (brackets with >= 250 kills) }; difficulties[d].duration = median guild kill; topDuration = the old Lorrgs top-50 median.
- Findings: Heroic median guild kills are 15-45 % longer than the top 50 (Lost Explorers 260 vs 180 s, Twin Fangs 366 vs 291), Mythic
  about equal. Kill time falls much faster with raid item level than simc's ~1 %/ilvl (Heroic Nek'zali 329 s at 320-322, 252 at 326-328,
  214 at 329-331) because item level and skill go together; timer-bound fights (Ula'tek ~580 s) barely move.
- simc slope (real build cc01837, MID2 Outlaw / Fire / Demonology / BM, all gear 310 -> 320 -> 330): +0.83 to +1.00 % DPS per item level.
- lib/boss.js equippedIlvl(text) (average of equipped slots, ilevel= or "# Name (N)"; main hand without off hand counts twice; null if
  < 8 slots) and killLength(def, difficulty, ilvl): brackets made monotonic (lower ilvl never faster), linear interpolation between
  bracket mid-points, outside them extended at 1.0095^Δilvl. IPC boss:length. Renderer: the Length field is "auto" while it shows 300,
  is empty, or still holds the last automatic value; boss / difficulty / export changes refresh it; the boss preview's first line explains
  it ("Length 318s: median Heroic kill for raids at item level 328 (Warcraft Logs, 326-328, 11,694 kills; all raids: 366s)").
- Burst windows (Dig In, hearts, Soulbinding, Luminous Grace...) keep their real durations, so in a longer kill they are a smaller share,
  as for average raids. Health-driven phases stay at the top-50 % positions (atPct) and stretch with the length.
- User's export (Lofo, Demonology): equipped item level 328. Tests: 46 pass.
- Normal difficulty: no Warcraft Logs data collected (fixed lengths). Refresh the snapshot each season (same endpoint, new zone id).

=== 24 OCT: SEASON 3 PREPARATION (part 1: plumbing) ===
- data/season.json = the only place with season / expansion constants: expansion { name, qualityRanks (crafted enchant/gem quality ranks:
  Midnight 2, TWW/DF 3; lib/enhance.js build(.., ranks)) }, season { id MID2, name, tierSet, upgradeTracks (616-618), craftedIlvl 331,
  journalTier "Current Season", raids, sources { warcraftLogsZone 53, lorrgsZones, bigwigs folders } }. progression.json / crafted.json
  carry "seasonId"; the user's editable copies are used only while seasonId matches (else ignored; "Edit…" sets the old copy aside as
  *-old-<time>.json and starts from the new season's file). Legacy copies without seasonId count as MID2.
- Data updates without a release (lib/datafiles.js): data/manifest.json lists season/progression/crafted/fights with sha256, `generated`,
  minApp (= package.json dataMinApp, raise it when data needs new code). At startup the app downloads the manifest from
  raw.githubusercontent.com/danetch/localbots/main/data/ and, if newer than the copy in use and minApp <= app version, the changed files
  (validated, then swapped in) into userData/data-cache. A newer app's bundled data wins over an older download.
  => PUSHING data/ TO MAIN UPDATES EVERY INSTALLED APP (>= 0.5.0) AT ITS NEXT START. Run `node tools/make-data.js` after editing data/
  (npm test fails otherwise). .gitattributes keeps data/ LF (hashes).
- User fight copies: data/shipped-hashes.json = sha256 of every fight file version in git history (LF + CRLF). A user file identical to
  one of them is an untouched "Edit…" copy and is ignored, so corrected timings reach everyone; real edits still win.
- Startup (renderer updateAtStart, 2.5 s): data refresh, then loot:status -> automatic "Update loot data" when there is no data, the
  game patch changed (wago /api/builds/latest; loot.json gameBuild) or the data is > 14 days old, and no simulation is running. Header
  says "Updating game data (new game patch 12.1.7, started automatically)… see the Activity log"; failures say so and keep the button.
- Season preview (Settings, `ptr` setting, header badge PTR): simc gets ptr=1 BEFORE the profile (verified: "12.1.7.70424 PTR"),
  "Update loot data" reads wago ?build=<latest wowt> and simc *_ptr.inc tables (all 7 exist on master and midnight), separate files
  loot-ptr.json / items-ptr.json / enhance-ptr.json; season-ptr.json / progression-ptr.json / crafted-ptr.json used when present; fights
  with "ptr": true listed only in PTR mode, named "(PTR)".
- Beta versions (Settings "Offer beta versions", `beta` setting): electron-updater allowPrerelease + channel beta.
  Full releases publish only latest.yml (checked on v0.5.0, despite generateUpdatesFilesForAllChannels): lib/updater.js falls back to
  the latest channel when a beta check finds no beta.yml (0.5.1). Workflow: pushes to main or season* branches; a version
  with "-" (0.5.0-beta.1) is published as a GitHub pre-release; season* branches never publish full releases.
- Smoke test (real Electron under Xvfb, fresh profile): startup refresh 404 (manifest not pushed yet) handled silently, automatic loot
  update starts and reports the network failure, PTR toggle saves and shows the badge. Tests: 50 pass.

=== 24 OCT: SEASON 3 PREPARATION (part 2: tools) ===
- lib/journal.js + tools/journal-draft.js: draft fight files from the in-game Adventure Guide (wago DB2 JournalEncounter,
  JournalEncounterSection, JournalEncounterCreature, SpellName, Spell; available from the first PTR build). Section Type 0 stage header
  (a nested header that is not "Stage/Phase/Intermission…" = a group of adds), 1 creature, 2 ability (SpellID; titles are placeholders,
  names/text from the spell, "$@spelldesc<id>" / "$@spellname<id>" references followed), 3 overview. IconFlags (checked on S2): 1 tank,
  2 dps, 4 healer, 8 heroic, 16 deadly, 32 important, 64 interrupt, 128 magic, 512 poison, 4096 mythic. Bosses = journal creatures at the
  top of the guide (single boss when the encounter is named after a creature). Suggested types from text + icons: invulnerable,
  vulnerable (more / LESS damage taken), damage_done_buff, adds, movement; "skip" (tank, healer-only, add's own ability), "unknown".
  Validated on 10 S2 bosses (run in the user's browser on wago): Twin Fangs council Vexhul+Ithraz, Submerge, Venomous Emergence adds;
  Sszorak Dig In vulnerable; Ula'tek Venomous Heart + 4 stages; Sentinels Vitriolic Stasis = less damage taken. Weak: allies listed as
  adds (Lady Liadrin), objects (Vashnik's fountains), ~1/3 "unknown". Drafts: "draft": true, "ptr": true with --ptr, no timings,
  kill length prior (lib/boss.js priorLength: this season's median kill; mean of the two longest for a raid's last two bosses: 480 s H /
  607 s M; others 282 / 375). The tool never overwrites an existing file (lists new abilities instead).
- lib/bigwigs.js + tools/bw-update.js: parse a module's rounded-duration ladders (case-insensitive: Nymrissa uses durationRounded),
  stages (`stage == n`), difficulty (self:Mythic() branches, per-difficulty handlers like Twin Fangs' MythicEvents); match mechanics by
  spell id = BigWigs key, else by name; propose / --write first-cast times for mechanics whose timesFrom is none/bigwigs/assumed
  (logs are never overwritten). "CHECK" when one condition lists several durations (Sszorak: 100 or 111 or 125 = one per difficulty).
- lib/wcl.js + tools/wcl-timeline.js: Warcraft Logs API v2 (client credentials). zones() (find the PTR zone), topKills(encounter,
  difficulty) via speed rankings, zoneFights(zone, encounter, window) = public reports (raid testing), fight(code, id) = enemy casts
  (paginated, nextPageTimestamp until null) + phaseTransitions + length; aggregate() = Lorrgs-style medians of the n-th cast (casts < 4 s
  apart merged); cycle() turns cast times into times + repeat (Nymrissa frost 38/82 + 110, Twin Fangs deluge 9/70 + 155). Schema checked
  on the published docs; NOT yet run (needs the user's API client: https://www.warcraftlogs.com/api/clients). warcraftlogs.com is not
  reachable from the sandbox: run it in the user's browser on a warcraftlogs.com page (same-origin fetch) or on a PC.
- Tests: 54 pass.

=== SEASON 3 RUNBOOK (when the PTR has the new raid) ===
Since 26 Oct steps 1-4 and 6 are AUTOMATIC: the watch workflow creates and merges the pull request "Next season in testing" (branch
season-next) and later "Season start" (branch season-start, merged when Warcraft Logs shows kills of the new raid). The steps below say
what those PRs do and what to check afterwards; they also work by hand (tools/season-draft.js, tools/season-promote.js).
1. Blizzard version service (lib/versions.js; wago fallback) -> wowt build; JournalInstance on that build vs live -> new raid instance id(s).
2. node tools/journal-draft.js --instance <id> --ptr   (or the same code in the user's browser on wago) -> data/fights/<boss>.json drafts.
   Review every mechanic type; councils (cleaved or split?); stage starts are placeholders.
3. data/season-ptr.json (tools/season-draft.js; by hand: copy season.json: id MID3/…, "game": "wowt" (PTR) or "wow_beta" (beta of a new expansion), name, tierSet, upgradeTracks = item_bonus type-34 groups of the new raid's drops
   (lib/loot.js trackGroups on the PTR build), craftedIlvl, raids, sources {warcraftLogsZone, lorrgsZones, bigwigs}); progression-ptr.json
   (tracks / sources / boss overrides); crafted-ptr.json if crafting changes. New expansion: expansion.qualityRanks.
4. node tools/make-data.js; push to main -> every 0.5.0+ app gets the PTR files; on 0.7.0+ the header's Live / PTR switch becomes
   available (it stays greyed out while no season-ptr.json with a non-live season id is published); in PTR mode users see the PTR bosses.
   Optionally a beta app version (x.y.z-beta.N on a season3 branch) for code changes.
5. During raid testing: BigWigs adds the new raid folder -> sparse clone, node tools/bw-update.js <fight> <module> (--write after review);
   Warcraft Logs testing reports -> tools/wcl-timeline.js --zones, then --zone <ptr zone> --encounter <id> -> times + repeat.
6. Season start (tools/season-promote.js): season.json <- season-ptr.json (drop "game" / "todo", drop "ptr" from the fights, old season's
   fights moved to data/fights-archive/<old id>/: out of the app, kept in the repo), DELETE data/season-ptr.json / progression-ptr.json /
   crafted-ptr.json, make-data, push (= the "Season start" PR, merged automatically at the season start; by hand only without WCL). Apps with the switch on go back to Live at the
   next start ("Midnight Season 3 is live now") and delete their loot-ptr / items-ptr / enhance-ptr files. (A season-ptr.json left with the
   live id is treated the same way.) Release if code changed.
   First days: Lorrgs (api2.lorrgs.io) real timings; after ~2 weeks: Warcraft Logs median kills per item level (difficulties[d].kills).
7. Bloodlust timing of the new fights: automatic (fight-data.yml, weekly) once season.json has the raid's Warcraft Logs zone (written by
   the promotion); before that, run the workflow with `only` after setting the zone by hand if needed.
8. Still manual after a season switch: review fight drafts (mechanic types, councils, stage starts), BigWigs timers (step 5), Warcraft Logs
   kill lengths per item level (difficulties[d].kills snapshot), per-boss loot ranks (progression.json bossOverrides).

=== 24 OCT: v0.5.0 / v0.5.1 RELEASED ===
- 0.5.0: season config, data updates from GitHub, automatic loot refresh, season preview, beta channel, Season 3 tools.
- 0.5.1: beta-channel fallback (above). Warcraft Logs API: V2 (GraphQL, client credentials); waiting for the user's API client to run
  tools/wcl-timeline.js once for real.
- Warcraft Logs API VERIFIED (24 Oct, user's API client, run in the user's browser on warcraftlogs.com; credentials are NOT stored in
  the repo: ask the user again or use WCL_CLIENT_ID / WCL_CLIENT_SECRET on a PC). Twin Fangs Mythic top 8: same cycles as Lorrgs
  (deluge 9/70 + 155, emergence 36/97 + 155, submerge 136/291), median 332 s. worldData.zones (44 zones): live raids 53 The Venomous
  Abyss, frozen 46 "VS / DR / MQD" and 50 Sporefall (S1), 55 Mythic+ Season 2; no raid-testing zone yet (12.1.7 PTR has no new raid):
  it will appear in the same list when testing starts.

=== 24 OCT: FLEETING CONSUMABLES HIDDEN ===
- "Fleeting" flasks / potions (cauldron versions of the regular ones, same effect) join lib/loot.js NOT_COMBAT, applied when building
  loot.json and in loot:info (older loot.json too). User's data: flasks 16 -> 8, potions 47 -> 34.

=== 24 OCT: v0.6.0 FOOD LIST CHECKED BY SIMC, CRAFTED CARD REWORKED ===
- Food (lib/foods.js, main.js checkFoods at "Update loot data"): the list was capped to the 150 newest food items (Midnight has more:
  Royal Roast, Blooming Feast, Glitter Skewers... were cut) and simc could load only 8 of the 139 listed. Now: no cap for food, Hearty
  foods dropped by name (same effect, kept through death; simc refuses them), then each food is simulated with the user's simc on a
  gearless frost mage probe (warriors / rogues without a weapon don't start), once more with gear_mastery_rating=2000: primary stat,
  "highest secondary" (the stat follows the extra mastery: feasts, Champion's Bento...) or fixed secondaries. No damage stat or not
  loadable -> dropped; same effect -> merged (`also`); weaker of the same kind -> dropped. VERIFIED with simc 12.1.5.70529 on the user's
  food list: 12 kept (Royal Roast +51 primary, Amani Cornucopia +73 highest secondary, 4 single +59, 5 pairs 22/22, Farstrider 16/16),
  ~5 s. Labels "Name — +59 Mastery". loot.json foodVer = 1; without it (or without simc) the full list minus Hearty is shown and
  loot:status asks for a refresh once simc is set. simc's own food table: engine/player/unique_gear_midnight.cpp (selector_food,
  primary_food, secondary_food). Some foods it registers still fail by name ("Unable to find consumable": Sun-Seared Lumifin,
  Void-Kissed Fish Rolls, Fel-Kissed Filet, Bloodthistle-Wrapped Cutlets, Mana-Infused Stew, Venom-Spiced Cutlets, Sweet-and-Sour Skewers).
- Crafted base items: the recipe scan read SpellEffect only (pre-Dragonflight recipes), so the user's list was all Shadowlands. Now also
  wago CraftingData.CraftedItemID + CraftingDataItemQuality.ItemID (columns from WoWDBDefs; NOT yet run against wago from here: wago is
  blocked in the sandbox and the user's PC was offline -> check the log line "Crafted base items found" after the next update), epic
  quality only (ItemSparse OverallQualityID >= 4), newest expansion. loot.json craftVer = 2 (loot:status refreshes older files).
- crafted_stats: simc only replaces stat types 24/25 (placeholders). VERIFIED: Arcanoweave Bracers 239660 fixed Haste/Vers (crafted_stats
  changes nothing), Murder Row Fleet Feet 244463 has placeholders (no secondaries at all without crafted_stats). lib/items.js now
  stores `cph` (placeholders) and `fixc` (epic id >= 200000 without them); make().craftStats(id) -> true / false / null (unknown:
  pairs kept). Fixed-stat pieces get one variant without crafted_stats; Top Gear's pair probe only looks at pieces with pairs.
  Bundled data/items.json regenerated from simc 12.1.5.70529 (457 cph, 6270 fixc).
- Crafted card: "Embellished crafts" (unchanged) / "Crafts without embellishment" = one checkbox per slot group present in the crafted
  data (trinkets, rings, neck, cloak, bracers, belt, boots, ...; crafted.groupOf) -> getCrafted().plainSlots (old `plain: true` = all) /
  stat pairs hidden when no known piece has placeholders, with "x of y" note. Crafted trinkets = Darkmoon Decks Void 245750, Hunt 245829,
  Rot 245846, Blood 245855 (simc implements them; Outlaw 331 deck vs 344 Zul'jin's Guillotine: ~ -2.4 %).
- Tests: 59 pass.

=== 24 OCT: SEASON WATCH ===
- .github/workflows/watch.yml runs tools/watch.js daily (06:17 UTC) and on demand (workflow_dispatch). It records
  .github/watch-state.json (committed only when a value changes; the first run is the baseline) and opens an issue labelled "watch" per
  change: new PTR / beta build (wago builds), new Adventure Guide instances on the PTR vs live (wago JournalInstance), new BigWigs top-level
  folders, simc PTR client data version / new profiles/MIDx folder, new Warcraft Logs zones (only with repo secrets WCL_CLIENT_ID /
  WCL_CLIENT_SECRET). New PTR instances -> tools/journal-draft.js --ptr drafts committed to the "season-next" branch.
  A failed check keeps its old value (never reported as new). Tests: 61 pass.
- A weekly Claude scheduled task (Monday) reads the open "watch" issues and reports what to do next (runbook steps).

=== 25 OCT: v0.7.0 — LIVE / PTR SWITCH ===
- User request: a slider to run the app on live data or on PTR / beta data, disabled while no next season or expansion is planned, and
  safe when the PTR data becomes live.
- lib/preview.js status(live season.json, season-ptr.json, settings): available = season-ptr.json exists IN THE DATA SET IN USE (bundled
  or downloaded cache, DF().dir: a file removed from the repo is not picked up from an older bundle) with a season id != live. "game":
  "wowt" (PTR, default) | "wow_beta" (beta) -> wago product for "Update loot data" / loot:status (main.js previewBuild). ptrMode() =
  settings.ptr AND available (memoized previewState(), reset on settings:set / data:refresh / preview:get).
- Back to Live: IPC preview:get (renderer at start and after the startup data refresh): switch on but preview gone -> settings ptr false,
  userData loot-ptr / items-ptr / enhance-ptr deleted, note "<season> is live now: back to live data." (settings.ptrSeason = previewed id,
  stored when the switch is turned on) or "No upcoming season in testing any more".
- UI: header switch "Live [o] PTR|Beta" (#pvsw, #ptron, orange when on) replaces the Settings checkbox and the PTR badge; Settings keeps an
  explanation + #pvinfo. Disabled while no preview, during a simulation and during "Update loot data" (main.js also refuses: busy /
  lootBusy). Turning it on or off reloads loot info, bosses, season tracks and starts a loot update when the mode's data is missing/old.
- Beta caveat (logged at "Update loot data" in beta mode): simc keeps a new expansion's beta data in a separate branch; the simc binary may
  only carry the live branch's PTR data (ptr=1). Not handled beyond the log line (no second simc download).
- Older apps (0.5.x-0.6.x) still show their Settings checkbox and ignore "game"; dataMinApp unchanged so they keep getting data.
- Verified: unit tests (test/preview.test.js), header screenshots in real Electron (none / off / on / beta dark), real app smoke test:
  settings { ptr: true } + no season-ptr.json -> ptr false and *-ptr.json deleted; with a temporary season-ptr.json -> kept.
  Tests: 66 pass.

=== 25 OCT: SEASON PULL REQUESTS (next season prepared by the watch) ===
- User decisions: next-season data comes as pull requests (merge stays manual: data on main reaches every installed app); at season start
  the old season's fights leave the app but stay in the repo (data/fights-archive/<season id>/).
- lib/season.js (pure, test/season.test.js): draft(live files, existing preview, new raids with bosses, upgrade groups of their drops, game,
  tierSet) -> season-ptr / progression-ptr / crafted-ptr + `todo` list (kept in season-ptr.json until someone removes it). Generated: id
  and name (MID2 -> MID3; new expansion = placeholder + todo), game, raids, upgradeTracks (top N groups of the new raid's drops mapped to the
  live track names, tracksFrom), tierSet (newest simc profiles/MIDn folder from the watch state, else guessed), bossOverrides for the new
  bosses at the source's default rank (also feeds the "This season" filter). Copied + todo: track item levels, source ranks, crafted rules,
  craftedIlvl, sources (WCL zone, Lorrgs, BigWigs). A second new raid is ADDED to an existing preview. promote() -> live files, fights to
  keep (ptr flag dropped) and to archive; null when nothing to promote.
- tools/season-draft.js --instances a,b --game wowt|wow_beta (wago: JournalInstance, Map (raids only, InstanceType 2), JournalEncounter,
  JournalEncounterItem, ItemXBonusTree, ItemBonusTreeNode, ItemBonus). Not a raid -> nothing written. tools/season-promote.js.
  tools/journal-draft.js: --beta, --instance accepts a comma list.
- tools/watch.js: betaRaids (same as ptrRaids on the beta build), liveRaids (instances seen on PTR/beta that are now in the live Journal;
  collect() gets the old state). Outputs new_instances / new_beta_instances / went_live. A check's first run is a baseline (no issue).
- watch.yml: checkout with full history (make-data); "Next season in testing" step: season-next kept merged with main (generated
  manifest/hash conflicts take main's side, others fail the step), fight drafts + season draft, make-data, npm test, push, PR with the to-do
  list (created once; later pushes update it). "Season start" step: only when a went-live instance is a raid of data/season-ptr.json on
  main; season-promote, make-data, npm test, force-push season-start, PR (body says: merge on the season start day; remaining to-do).
  Pushes to season-* branches also trigger release.yml, which does nothing (full versions are released from main only).
- Tests no longer depend on the live season: test/fixtures/data = frozen MID2 season/progression/crafted/fights; e2e sets POLYGNOME_DATA
  (main.js DF bundled dir) to it; units/season tests read it. test/data.test.js checks the REAL data/fights (non-draft) build valid events.
  Before this, promoting a season broke 9 tests (found by simulating the Season start step with a local origin and a stub gh).
- Verified: unit tests (71 pass); Season start step run locally end to end (promotion, archive, make-data, tests, PR body). NOT run for
  real: the wago downloads of tools/season-draft.js and the season-next merge path (no new raid on the PTR today).

=== 26 OCT: v0.7.1 — GAME DATA LOG, SIMC BUILD MESSAGE, SWITCH ON THE RIGHT ===
- logs/data-updates.log (main.js dataLog; one file, oldest half dropped past 1 MB): every loot:status check with its caller ("app start",
  "Live/PTR switch") and why (or "up to date", with data date / game build / food checked / simc set), data:refresh results and failures,
  every "Update loot data" in full (header: reason, app version, live/PTR, simc path; dropped foods; "=== done" / "=== FAILED: ..."), Live/PTR
  resets. Activity log tab: "Game data log" button (log:open 'data'). Test in e2e.
- Settings engine line: "item data is for an older game build (x): click Update loot data" only when items.json's build is OLDER than
  simc's (part-by-part compare). Before, any difference showed it: simc's repository item_data (70575) is ahead of the nightly binary
  (70391), so "Update loot data" could never clear it (user report).
- loot:info: a Journal tier with exactly the instances of "This season" is no longer listed (user saw two identical entries).
- Live / PTR switch moved to the far right of the header (after Settings).

=== ASSUMED GAME RULES (written from game knowledge or guides, not read from game data) ===
Where each lives, so it can be checked if a result looks wrong:
- Weapons per class / spec, shields: lib/specs.js WEAPONS_BY_CLASS, SPEC_WEAPONS, SHIELD_CLASSES. Primary stat per spec: lib/specs.js.
- Raid buff names: lib/fight.js. Consumable "disabled" for augmentation runes: lib/fight.js.
- Profession / Fleeting flask names hidden: lib/loot.js NOT_COMBAT.
- One diamond max (Eversong): lib/enhance.js. Radiant Jewelbinder socket on head/wrist/waist: lib/enhance.js. Hunter scopes BM/MM only.
- Embellishment slots ("unverified" list) and crafted item level: data/crafted.json. Crafted stat ids 32/36/40/49.
- Item levels per track rank, per source and per boss: data/progression.json (Method guides). Voidcore = Myth 1/6.
- Boss mechanics effect sizes (add counts / health, damage buffs, vulnerable multipliers, durations): data/fights/*.json `assumed` lists.
- Bloodlust: one per fight (the first one of real kills; a second lust is counted in `checked`, not simulated).
  Timings and kill lengths come from real logs (Lorrgs, Warcraft Logs); effect sizes do not.

=== 26 OCT: v0.7.2 — FOOD CHECK REMEMBERED ===
- User: the food check (~5 s of simc runs) ran at every "Update loot data". main.js checkFoods now stores its result in
  userData/food-check.json (food-check-ptr.json in preview mode, deleted with the other PTR files): key = sha256 of the sorted food list
  from the game data (value|label|id) + simc path + size + mtime. Same key -> cached list reused, log "Food: N kept, same foods and same
  simc as the check of <date>: not simulated again". A new simc build or a changed food list -> checked again. Test in e2e (73 pass).

=== 26 OCT: v0.8.0 — AUTOMATIC SEASONS, BLIZZARD VERSIONS, TRACK ITEM LEVELS FROM SIMC ===
User goal: watch the game versions; when a PTR with the next season shows up, publish its data; when the season goes live, switch
everything, without manual steps. Decisions: both PRs merged automatically; the Live/PTR switch stays reserved to a new SEASON (no switch
for minor-patch PTRs like 12.1.7).
- lib/versions.js: Blizzard's version service (TACT v2, https://us.version.battle.net/v2/products/<wow|wowt|wow_beta|wowxptr>/versions,
  pipe table, one row per region us/eu/kr/tw/cn/sg/xx; VERIFIED in the user's browser: wow 12.1.5.70575 everywhere, wowt 12.1.7.70493,
  wow_beta 12.0.1.66220), wago.tools /api/builds/latest as fallback (same version for every region). regionOf(export) (region=),
  exportVersion(export) ("# WoW 12.1.5.70575, TOC 120105", written by the SimC addon: GetBuildInfo), cmp, patch.
- App: liveBuild / previewBuild = version of the player's region (settings.region, sent by the renderer from the export's region= line;
  settings:set accepts us/eu/kr/tw/cn) -> automatic "Update loot data" after a patch follows the player's region. Blizzard is blocked in the
  Claude sandbox (403): not run from the app here, only the parser + fallback are tested.
- Track item levels: simc item_bonus.inc type 49 (Value_0 = item scaling config) + item_scaling.inc __item_scaling_config_data (3rd column =
  item level). lib/season.js groupLevels / trackLevels; VERIFIED on 12.1.5.70575: groups 616/617/618 = Champion/Hero/Myth of progression.json
  exactly; ranks after 6 are drop-only (618: 337 341 344). tools/season-draft.js reads simc master *_ptr.inc first, then the live tables, and
  fills progression-ptr.json tracks (to-do item only for tracks not found). Fixture: test/fixtures/simc (real rows of groups 616-618).
- season-ptr.json now stores season.raidBosses { raid: [Journal boss names] } (season-draft) to find the raid's Warcraft Logs zone.
- tools/watch.js: ptrBuild from Blizzard (+ source, liveRegions per region); liveSince { instance: first day seen live }; seasonStart (WCL
  secrets + previewed raid live): zone = non-frozen WCL zone whose encounters match >= half of the raid's bosses (names compared without case
  / punctuation), kills of its first boss (Journal order) since liveSince -> { started, zone, zoneName, raid, since }. Issue "Season started"
  once; output season_started / season_zone every day while true (idempotent step). collect() takes previewFile (tests).
- watch.yml: "Next season in testing" -> gh pr merge season-next --merge --delete-branch after the tests (later raids start again from main).
  "Season start" runs on went_live OR season_started; promote with --wcl-zone (season.sources.warcraftLogsZone), PR stays open until
  season_started, then comment + merge. Merges made with GITHUB_TOKEN do not trigger release.yml (data only, apps download it).
- Verified: 76 tests; Season start step run locally with season_started (PR created, commented, merged; zone 58 written; tracks from the
  levels). NOT verified: Blizzard / WCL / wago from GitHub Actions for the new checks (first real watch run after this push), the WCL
  zone naming for a brand-new raid, auto-merge with the real gh.

=== 26 OCT: v0.9.0 — BLOODLUST TIMING FROM REAL KILLS ===
- Before: lust always at the pull (simc defaults bloodlust_time=0 / bloodlust_percent=0, engine/sim/sim.cpp bloodlust_check_t; the app only
  set override.bloodlust through the raid buffs).
- lib/lust.js: lustTimes(events) = first application of a Sated-type debuff (57724 Sated, 57723 Exhaustion, 80354 Temporal Displacement,
  264689 Fatigued, 390435 Exhaustion) or lust buff (2825, 32182, 80353, 264667, 390386); applications > 30 s apart = another lust.
  classify(kills, def): stage-anchored { stage, after } when >= 60 % of kills lust <= 20 s after the same stage start (WCL phase id = our
  stage id; stage must exist in the fight file), else { pct } = median share of the kill; >= 5 kills. seconds(entry, bounds, length);
  args({ mode, value, auto }) -> bloodlust_time=N | bloodlust_percent=N + bloodlust_time=9999 (health only) | nothing (pull).
- Fight files: difficulties[d].bloodlust { stage, after } | { pct }, from "logs", checked "<n kills, IQR, second lusts, date>".
  lib/boss.js build() -> lust { at, entry }. main.js resolveFight -> f.lustArgs; lib/fight.js adds them only when lust is on (raid full /
  default, or custom with bloodlust ticked), values validated.
- Fight card: "Bloodlust: As in real kills / At the pull / At a time (s) / At boss health (%)" + note (what "real kills" means for the boss,
  or "no real-kill data yet" = pull); summary shows non-default choices; saved with the fight settings.
- Measurement: lib/wcl.js lustFight(code, fightID) (fights + phaseTransitions, events dataType All with filterExpression on the ids);
  tools/wcl-lust.js (speed rankings top 15 per encounter and difficulty, encounter found by boss name in the zone of season.json /
  season-ptr.json for "ptr" fights; --write only when new or moved >= 3 s / 3 % / other stage). .github/workflows/fight-data.yml:
  weekly (Wed 05:41 UTC) + dispatch (input `only`), PR "Fight data: Bloodlust timing" on branch fight-data, merged after npm test.
  New seasons: once the promoted season.json has its WCL zone (season start), the weekly run measures the new fights.
- Tests: test/lust.test.js + e2e (option reaches simc; off when raid buffs are off). 81 pass. UI checked in Electron.

=== 26 OCT: v0.9.1 — LUST DETECTION FIXED, TWO STRATEGIES ===
- First real run: most top kills showed a "second lust" > 30 s after the first. User: Mages (Temporal Warp) and possibly other lust classes can
  lust again on themselves despite Sated. lib/lust.js detect(): the lust BUFF on players whose class cannot cast lust (not Shaman / Mage /
  Hunter / Evoker; lib/wcl.js lustFight now returns targetClass from masterData actors), fallback Sated-type debuff on those players, then
  on anyone. tools/wcl-lust.js prints the detection used per kill.
- classify(): kills split into "lust at the pull" (<= 10 s) and "later"; the larger group is modelled (pull on a tie), then stage-anchored
  or share of the kill as before. Ula'tek had half/half: the median of both (28 % H, 12 % M) matched neither strategy.
- Tests: 83 pass.
- Result with the new detection (forced refresh, PR #4, 26 Oct): "second lust" down from 5-12 kills per boss to 0-2. Pull lust (1-2 s) on
  8 bosses; Coiled Altar = 4-5 s after stage 3 starts (both difficulties); Ula'tek = 29 % of the kill on Heroic (IQR 28-31 %, ~121 s, before
  the first heart) and 49 % on Mythic (IQR 49-50 %, ~285 s, second heart). The earlier "pull" for those two was Mages' own extra Time Warp.
  tools/wcl-lust.js --force (workflow input `force`) rewrites every entry.

=== 26 OCT (end of day): TESTS AUDIT + HANDOFF REWRITE ===
- Coverage audit (lib modules, IPC handlers, tools vs test/*.js). Added: Droptimizer end to end (custom item level, class armor filter,
  "select an instance" error), loot:info hides the Journal tier identical to "This season", preview:get back-to-Live (settings, PTR files
  deleted, data log, switch refused), wcl.lustFight mapping (target classes, times from the pull, pre-pull clamped), whOf + progress parser,
  tools/season-promote.js run on a temp copy (swap, -ptr removed, archive, WCL zone, idempotent). 89 tests.
- Still without automated tests (network glue or UI only): tools/season-draft.js and tools/wcl-lust.js main loops (their pure parts are
  tested: lib/season.js, lib/lust.js), lib/updater.js, renderer-only logic (bcmp build compare, Bloodlust card, region sent from the export).
- START HERE rewritten as a self-contained briefing; outdated 21 Oct sections flagged; runbook updated for the automatic merges.

=== 27 OCT: v0.9.2 / v0.9.3 FIGHT CARD FIXES + UI HINTS / DECLUTTER (UI part released as v0.10.0) ===
- v0.9.2 (released): choosing "None" after a boss left Style / Targets hidden and disabled (autoLength returned before bossPreview).
  Now refreshed, and an automatic boss length goes back to 300 s (a typed length is kept).
- v0.9.3 (released): the Fight summary line only refreshed on user events, so late values (boss length from IPC, the saved fight
  restored at startup, the None reset) left it stale ("Patchwerk, 1 target" with Kith'ix Heroic selected). bossPreview and the
  settings restore now call sumNow() (updSum that never throws). Saved fights carry durAuto (length was automatic) so an automatic
  boss length still resets to 300 s on None after a restart (fights saved before 0.9.3 have no flag: their length is kept once).
- Help hints (user choice: ⓘ icons everywhere, no off switch): any element with data-tip shares one tooltip (#tip, role=tooltip):
  hover after 350 ms, keyboard focus at once, click on an ⓘ pins it (never toggles the checkbox / section it sits in), Escape closes;
  inside a modal dialog the tooltip moves into the dialog (top layer). .hint elements get tabindex/role/aria-label automatically.
  All former title= help moved to data-tip (pvsw, crafted slot item lists...).
- Decluttered: long explanatory paragraphs of Options, Consumables, Loot source, Crafted gear, Enchants & gems, the DR table and the
  Settings season preview are hints now; #mdesc / #cathint removed (mode text = hint on the mode buttons and Run). Crafted card body
  (#cr_body) only when "Add crafted items" is ticked; Enchants preview (#en_box) only with an option ticked; Max charges only with
  Catalyst; consumables to compare show one line without game data; Fight rows: Style + Targets (hidden as a row for a boss),
  Length + Variance + Bloodlust. BiS setup fully expanded: ~2900 px -> ~1430 px.
- Header: game data status = dot (ok/busy/bad) + short text (#lootbox, setLoot(kind, short, full)), full text in its hint; the
  progress strip is hidden until the first run.
- Empty Results = "Getting started" checklist (renderStart: simc, game data, export, mode) with action buttons; replaced for good by
  the first result shown (#res data-start).
- Verified in real Electron under Xvfb (first launch, all modes expanded, Settings) and with test/ui/mock.js in an Electron harness
  (results, dark mode, 1000 px, crafted/enchant cards, keyboard and click behaviour of hints). npm test 89 pass. Screenshots on Linux
  use a fallback font (no Segoe UI): Windows text is a bit narrower.

=== 27 OCT: v0.10.1 — FIGHT TAB, UPRIGHT INFO ICON ===
- ⓘ icon = inline SVG injected by the hint setup (circle, centred dot, straight stem); markup keeps a plain "i" as fallback text.
- Boss fight details left the Fight card (it grew to 390-570 px): the card shows one line ("615 s · 4 stages · 2 bosses · 7 mechanics ·
  Details"); Details opens a "Fight" tab (#tabf / #p_fight, visible only while a boss is selected; None hides it and goes back to Results).
  renderFight(): time axis, stage bands, one row per boss for council fights (present windows), one row per mechanic (marks at cast times,
  bar width = duration, colour by type: adds / movement / vulnerable / invulnerable / damage buff), Bloodlust line from the card's choice
  (lustAt(): real kills / pull / time / health % shown at that share of the length / off with raid buffs), hover tips (time, duration,
  effect, timing source, guessed parts), notes (length source, cleaved bosses, measured Bloodlust, footnote "*" only when something is
  guessed). lib/boss.js build() summary now also carries duration, multiplier, count.
- Verified in real Electron (Coiled Altar Mythic, Ula'tek Heroic dark, Twin Fangs at 1000 px, None hides the tab, Bloodlust choice redraws).
