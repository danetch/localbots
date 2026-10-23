// Extrait un pourcentage d'avancement depuis les lignes de progression de simc.
// Baseline ≈ 4 % du travail d'une passe, profilesets ≈ 96 %.
function makeParser(range, label, send) {
  let base = 0, prof = 0, seenProf = false, best = 0;
  return function (line) {
    const m = /(\d+)\s*\/\s*(\d+)/.exec(line);
    if (!m || +m[2] === 0) return false;
    const f = Math.min(1, +m[1] / +m[2]);
    if (/profileset/i.test(line)) { prof = Math.max(prof, f); seenProf = true; }
    else if (/baseline|generating/i.test(line) && !seenProf) base = Math.max(base, f);
    else return false;
    best = Math.max(best, 0.04 * base + 0.96 * prof);
    send({ pct: range[0] + (range[1] - range[0]) * best, label });
    return true;
  };
}
module.exports = { makeParser };
