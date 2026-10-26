// Season preview (PTR / beta): the Live <-> PTR switch in the header.
// The switch is available only while the repo publishes the NEXT season: data/season-ptr.json with a season id different from the
// live season.json. That file is pushed at Season 3 runbook step 3 (data update, no release) and removed when the season goes live
// (step 6). Its "game" field picks the wago.tools product the game data comes from: "wowt" (PTR, default) or "wow_beta" (beta of
// a new expansion).
// When the preview season stops being available (removed from the repo, or it IS the live season now) a user who had the switch on
// goes back to Live at the next start, the PTR copies of the game data are deleted, and the app says why.

const GAMES = { wowt: 'PTR', wow_beta: 'Beta' };
// PTR-only game data written to userData by "Update loot data" in preview mode (main.js ud()).
const PTR_FILES = ['loot-ptr.json', 'items-ptr.json', 'enhance-ptr.json', 'food-check-ptr.json'];

// live = season.json, next = season-ptr.json or null, s = settings ({ ptr, ptrSeason })
function status(live, next, s = {}) {
  const liveId = live?.season?.id || null, nextId = next?.season?.id || null;
  const available = !!(nextId && nextId !== liveId);
  const game = available && GAMES[next.game] ? next.game : 'wowt';
  const on = !!s.ptr && available;
  // switch was on but the preview is gone: back to Live. "wentLive" = the season we previewed is the live one now.
  const reset = !!s.ptr && !available;
  const wentLive = reset && !!s.ptrSeason && s.ptrSeason === liveId;
  return {
    available, on, game, label: GAMES[game], reset, wentLive,
    live: liveId ? { id: liveId, name: live.season.name || liveId } : null,
    next: available ? { id: nextId, name: next.season.name || nextId } : null,
    // why the switch is greyed out / what happened, for the UI
    note: available ? null
      : wentLive ? `${live.season.name || liveId} is live now: back to live data.`
      : reset ? 'No upcoming season in testing any more: back to live data.'
      : 'No upcoming season in testing yet.',
  };
}

// New settings after a reset (switch off, previewed season forgotten), or null when nothing changes.
function settingsAfter(st, s) { return st.reset ? { ...s, ptr: false, ptrSeason: undefined } : null; }

// wago.tools /api/builds/latest answer -> build of the preview game ("wowt" or "wow_beta"), or null.
const buildOf = (builds, game) => builds?.[game]?.version || null;

module.exports = { status, settingsAfter, buildOf, PTR_FILES, GAMES };
