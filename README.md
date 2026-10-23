# LocalBots

Local, offline, unlimited gear simulations for World of Warcraft (Midnight), built on [SimulationCraft](https://github.com/simulationcraft/simc):
Top Gear, Droptimizer and Best in Slot (with Catalyst, crafted gear, enchants, gems and consumables), on your own PC, with no queue.

## Install

Download `LocalBots-Setup-x.y.z.exe` from the latest [release](https://github.com/danetch/localbots/releases) and run it.
The installer is not code-signed yet: Windows SmartScreen shows a warning, click **More info → Run anyway**.
LocalBots checks for new versions at startup and offers to update.

First launch: Settings → **Download / update simc** (or select your own simc), then **Update loot data**, then paste your `/simc` addon export.

## Develop

```
npm install
npm start      # run from source
npm test       # unit + end-to-end tests (fake simc)
```

Releases: bump `version` in `package.json` and push to `main`.
When that version has no release yet, the `release` workflow runs the tests, builds the Windows installer and publishes it as a GitHub release, which installed apps pick up.

Project notes and design decisions: [HANDOFF.md](HANDOFF.md).
