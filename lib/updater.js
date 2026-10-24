// App auto-update through GitHub Releases (electron-updater). Inactive in development (app not packaged) and when the release
// feed is not configured (package.json build.publish still has the placeholder owner).
// beta(): true when the user opted in to beta versions (Settings): GitHub pre-releases (x.y.z-beta.N, channel file beta.yml) are offered;
// otherwise only full releases (latest.yml). Full releases publish only latest.yml (checked on v0.5.0), so a beta check that finds no
// beta.yml falls back to the normal channel and beta users still get full releases.
function make(app, log, beta = () => false) {
  let au = null, state = { state: app.isPackaged ? 'idle' : 'dev', version: app.getVersion() };
  const load = () => {
    if (au || !app.isPackaged) return au;
    try { au = require('electron-updater').autoUpdater; au.autoDownload = false; au.autoInstallOnAppQuit = true; au.logger = null; } catch (e) { state = { state: 'error', message: 'electron-updater is not installed' }; }
    return au;
  };
  return {
    get: () => ({ ...state, current: app.getVersion() }),
    async check() {
      const u = load(); if (!u) return { ...state, current: app.getVersion() };
      try {
        u.allowPrerelease = !!beta(); u.channel = beta() ? 'beta' : 'latest'; u.allowDowngrade = false;
        let r;
        try { r = await u.checkForUpdates(); }
        catch (e) {   // beta wanted but the newest release has no beta.yml (a full release): use the normal channel
          if (!beta() || !/beta\.yml|cannot find|404/i.test(String(e.message || e))) throw e;
          u.allowPrerelease = false; u.channel = 'latest'; r = await u.checkForUpdates();
        }
        const v = r?.updateInfo?.version;
        state = v && v !== app.getVersion() ? { state: 'available', version: v } : { state: 'current', version: app.getVersion() };
      } catch (e) { state = { state: 'error', message: String(e.message || e).split('\n')[0] }; }
      return { ...state, current: app.getVersion() };
    },
    async install() {
      const u = load(); if (!u) throw new Error('Updates are only available in the installed app.');
      log('>> Downloading the update…'); await u.downloadUpdate(); log('>> Update downloaded: restarting'); u.quitAndInstall();
    },
  };
}
module.exports = { make };
