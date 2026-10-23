POLYGNOME (formerly LOCALBOTS) - PROJECT HANDOFF (as of 22 Oct 2026, after enchants/gems/DR consumables)
================================================
Paste this file at the start of a new conversation and upload localbots.zip (the latest build).
Ask the assistant to read the zip before changing anything.

GOAL
----
A local, offline, unlimited clone of Raidbots, built as an Electron app around the SimulationCraft CLI (simc).
No queue, no cap, no subscription. WoW Midnight (Season 2 data). UI language: English. The user first wrote in French.
The user prefers lean, working increments, and wants unverified assumptions flagged honestly.

HOW TO RUN (current, dev mode)
------------------------------
  npm install ; npm start     (Electron ^33, Node 18+ fetch is used in the main process)
First launch: Engine card -> "Select simc..." (path to a simc binary). Paste a /simc addon export (bags included).

FILE MAP
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

FEATURES IMPLEMENTED
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

KNOWN LIMITATIONS
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

ENVIRONMENT NOTES FOR THE ASSISTANT
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
- Icon: build/icon.svg = an original gnome engineer girl (pink pigtails with gold ties, brass goggles resting on her fringe, pointed ears,
  rosy cheeks) peeking over the gold anvil, spark top-left, same navy tile + gold rim (first draft was a bearded gnome in a red hat;
  user asked for the pink-pigtails engineer-goggles look as inspiration). build/icon.png (512), build/icon.ico (16-256), renderer/icon.png regenerated with cairosvg.
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
