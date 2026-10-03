// Sound effects for the player. Files are local and optional: a missing file never breaks play.
const FILES = {
  intro: 'assets/audio/Kaun Banega Crorepati Intro 2019.wav',
  incoming: 'assets/audio/KBC Question incoming.wav',
  clock: 'assets/audio/30 second tic tic kbc clock.mp3',
  correct: 'assets/audio/Correct answer.mp3',
  wrong: 'assets/audio/Wrong Ans.mp3'
};

export function createAudio() {
  const refs = {};
  let enabled = true;
  let failed = 0;

  Object.entries(FILES).forEach(([key, src]) => {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.volume = 0.7;
    audio.addEventListener('error', () => { failed += 1; });
    refs[key] = audio;
  });
  refs.clock.loop = true;

  const stop = (key) => {
    const audio = refs[key];
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  };

  return {
    get enabled() { return enabled; },
    get unavailable() { return failed >= Object.keys(FILES).length; },
    play(key, loop = false) {
      const audio = refs[key];
      if (!enabled || !audio) return Promise.resolve(false);
      audio.loop = loop;
      audio.currentTime = 0;
      return audio.play().then(() => true).catch(() => false);
    },
    pause(key) { refs[key]?.pause(); },
    stop,
    stopAll() { Object.keys(refs).forEach(stop); },
    toggle() {
      enabled = !enabled;
      if (!enabled) Object.keys(refs).forEach(stop);
      return enabled;
    }
  };
}
