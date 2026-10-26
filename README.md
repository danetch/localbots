# Polygnome

*A thousand gnomes test your gear so you don't have to.*

Local, offline, unlimited gear simulations for World of Warcraft (Midnight), built on [SimulationCraft](https://github.com/simulationcraft/simc):
Top Gear, Droptimizer and Best in Slot (with Catalyst, crafted gear, enchants, gems and consumables), on your own PC, with no queue.

## Install

Download `Polygnome-Setup-x.y.z.exe` from the latest [release](https://github.com/danetch/localbots/releases) and run it.
The installer is not code-signed yet: Windows SmartScreen shows a warning, click **More info → Run anyway**.
Polygnome checks for new versions at startup and offers to update.

First launch: Settings → **Download / update simc** (or select your own simc), then **Update loot data**, then paste your `/simc` addon export.

## What it does

- **Top Gear / Droptimizer / Best in Slot** with upgrade tracks, Catalyst (tier) versions, crafted gear and embellishments,
  enchants, gems, consumables and diminishing returns; several talent loadouts from the export can be compared.
- **Boss fights** of the current raids: mechanics, stage timings and kill lengths from real kills (BigWigs, Lorrgs, Warcraft Logs),
  kill length adjusted to your item level, and **Bloodlust** when real raids use it (or at the pull / a time / a boss health %).
- **Always up to date**: game data refreshes after each patch in your region, boss and season data come from this repository
  at startup (no reinstall), simc updates are offered.
- **Next season preview**: when the next season's raid is on the PTR or beta, the **Live / PTR** switch in the header lets you
  simulate with that data; when the season starts, Polygnome switches over by itself.

## Develop

```
npm install
npm start      # run from source
npm test       # unit + end-to-end tests (fake simc)
```

Releases: bump `version` in `package.json` and push to `main`.
When that version has no release yet, the `release` workflow runs the tests, builds the Windows installer and publishes it as a GitHub release, which installed apps pick up.
Data-only changes (`data/`): run `node tools/make-data.js` and push; installed apps download them at their next start.

Automation (GitHub Actions):
- `watch` (daily): game versions (Blizzard), new PTR / beta raids, raids going live, BigWigs / simc / Warcraft Logs changes → issues labelled
  `watch`; prepares and merges the next season's data ("Next season in testing"), then switches seasons when the raid is being killed ("Season start").
- `fight-data` (weekly): Bloodlust timing per boss from the fastest Warcraft Logs kills.
- Both need the repository secrets `WCL_CLIENT_ID` / `WCL_CLIENT_SECRET` (a free [Warcraft Logs API client](https://www.warcraftlogs.com/api/clients)).

Project notes and design decisions: [HANDOFF.md](HANDOFF.md) (start with "START HERE").

Polygnome was called LocalBots until v0.4.0; the first launch copies the old LocalBots data folder over (the old one is kept).
