// Solo player sound. All effects are synthesised in js/lib/sfx.js (window.DQSfx), so a missing
// file or blocked audio never breaks play.
const sfx = () => window.DQSfx;

export function createAudio() {
  return {
    get enabled() { return sfx() ? sfx().enabled : false; },
    get unavailable() { return !sfx(); },
    play(key) {
      const s = sfx(); if (!s) return Promise.resolve(false);
      if (key === 'clock') s.countdown(30); else s.play(key);
      return Promise.resolve(true);
    },
    pause(key) { if (key === 'clock') sfx()?.stop('countdown'); },
    stop(key) { if (key === 'clock') sfx()?.stop('countdown'); },
    stopAll() { sfx()?.stopAll(); },
    toggle() { return sfx() ? sfx().toggle() : false; }
  };
}
