// D'Quest sound effects. Every sound is synthesised with WebAudio, so there are no audio files to
// load and nothing to license. Loaded as a plain script: it exposes window.DQSfx.
(function () {
  'use strict';
  var ctx = null, master = null, enabled = true, loops = {}, volume = 0.7;
  try { enabled = localStorage.getItem('dquest_sound') !== 'off'; } catch (e) { /* storage blocked */ }

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // One shaped note. opts: type, gain, attack, slide (end freq), detune, delay (seconds from now)
  function tone(freq, dur, opts) {
    var c = ensure(); if (!c) return;
    opts = opts || {};
    var t0 = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
    if (opts.detune) osc.detune.value = opts.detune;
    var peak = opts.gain == null ? 0.3 : opts.gain, atk = opts.attack == null ? 0.006 : opts.attack;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  // Band-passed noise: whooshes and ticks
  function noise(dur, opts) {
    var c = ensure(); if (!c) return;
    opts = opts || {};
    var t0 = c.currentTime + (opts.delay || 0);
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate), data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(opts.from || 800, t0);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
    f.Q.value = opts.q || 1.2;
    var g = c.createGain(), peak = opts.gain == null ? 0.2 : opts.gain, atk = opts.attack == null ? 0.01 : opts.attack;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  // Frequencies: C major pentatonic across octaves
  var N = { C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G3: 196, C3: 130.81, E3: 164.81 };

  var sounds = {
    tap: function () { tone(760, 0.07, { type: 'triangle', gain: 0.16, slide: 620 }); },
    join: function () { tone(N.G4, 0.14, { type: 'triangle', gain: 0.22 }); tone(N.C5, 0.22, { type: 'triangle', gain: 0.22, delay: 0.09 }); },
    // Bright welcome run for the quiz title
    intro: function () {
      [N.C4, N.E4, N.G4, N.C5, N.E5, N.G5].forEach(function (f, i) { tone(f, 0.5, { type: 'triangle', gain: 0.2, delay: i * 0.11 }); tone(f * 2, 0.35, { type: 'sine', gain: 0.07, delay: i * 0.11 }); });
      tone(N.C5, 1.1, { type: 'sine', gain: 0.16, delay: 0.7 }); tone(N.G5, 1.1, { type: 'sine', gain: 0.12, delay: 0.7 });
      noise(0.5, { from: 3000, to: 9000, gain: 0.05, delay: 0.7, q: 0.8 });
    },
    // A question arrives: soft rising swoosh and two marimba-like notes
    incoming: function () {
      noise(0.45, { from: 400, to: 2400, gain: 0.07, attack: 0.2, q: 0.9 });
      tone(N.E5, 0.28, { type: 'triangle', gain: 0.2, delay: 0.3 }); tone(N.A5, 0.4, { type: 'triangle', gain: 0.2, delay: 0.42 });
    },
    // Options open
    open: function () { tone(N.G5, 0.18, { type: 'sine', gain: 0.22 }); tone(N.C6, 0.32, { type: 'sine', gain: 0.22, delay: 0.1 }); },
    lock: function () { tone(180, 0.16, { type: 'sine', gain: 0.32, slide: 110 }); noise(0.05, { from: 1800, gain: 0.08 }); },
    tick: function () { tone(1250, 0.035, { type: 'square', gain: 0.05 }); noise(0.025, { from: 3200, gain: 0.05 }); },
    tickLow: function () { tone(900, 0.04, { type: 'square', gain: 0.07 }); noise(0.03, { from: 2600, gain: 0.07 }); },
    correct: function () {
      [N.C5, N.E5, N.G5, N.C6].forEach(function (f, i) { tone(f, 0.45, { type: 'triangle', gain: 0.22, delay: i * 0.075 }); });
      tone(N.E6, 0.7, { type: 'sine', gain: 0.09, delay: 0.28 });
    },
    wrong: function () {
      tone(311, 0.28, { type: 'triangle', gain: 0.24, slide: 277 }); tone(233, 0.45, { type: 'triangle', gain: 0.24, delay: 0.2, slide: 196 });
    },
    timeup: function () { tone(520, 0.2, { type: 'triangle', gain: 0.2, slide: 400 }); tone(340, 0.34, { type: 'triangle', gain: 0.2, delay: 0.16, slide: 260 }); },
    whoosh: function () { noise(0.4, { from: 500, to: 3500, gain: 0.09, attack: 0.15 }); },
    rank: function () { tone(N.C5, 0.12, { type: 'triangle', gain: 0.18 }); tone(N.E5, 0.12, { type: 'triangle', gain: 0.18, delay: 0.09 }); tone(N.G5, 0.2, { type: 'triangle', gain: 0.18, delay: 0.18 }); },
    fanfare: function () {
      var seq = [[N.C5, 0], [N.C5, 0.16], [N.C5, 0.32], [N.E5, 0.5], [N.G5, 0.82], [N.E5, 1.0], [N.G5, 1.22]];
      seq.forEach(function (n) { tone(n[0], 0.34, { type: 'triangle', gain: 0.22, delay: n[1] }); tone(n[0] / 2, 0.34, { type: 'sine', gain: 0.12, delay: n[1] }); });
      [N.C5, N.E5, N.G5, N.C6].forEach(function (f) { tone(f, 1.4, { type: 'sine', gain: 0.1, delay: 1.5 }); });
      noise(0.9, { from: 4000, to: 10000, gain: 0.05, delay: 1.5, q: 0.7 });
    }
  };

  // Countdown: one tick a second, then two a second for the last five. Loops until stopped.
  function startCountdown(seconds) {
    stop('countdown');
    var times = [];
    for (var t = 0; t < seconds; t += (seconds - t > 5 ? 1 : 0.5)) times.push(t);
    var start = Date.now(), i = 0, handle = { id: null };
    function step() {
      if (i >= times.length) { stop('countdown'); return; }
      (seconds - times[i] <= 5 ? sounds.tickLow : sounds.tick)();
      i += 1;
      if (i < times.length) handle.id = setTimeout(step, Math.max(0, times[i] * 1000 - (Date.now() - start)));
    }
    loops.countdown = handle;
    if (enabled) step();
  }
  function stop(name) { var h = loops[name]; if (h) { clearTimeout(h.id); delete loops[name]; } }

  var api = {
    get enabled() { return enabled; },
    unlock: function () { if (enabled) ensure(); },
    play: function (name) {
      if (!enabled) return;
      try { if (sounds[name]) sounds[name](); } catch (e) { /* never let sound break play */ }
    },
    countdown: function (seconds) { try { startCountdown(seconds || 30); } catch (e) { /* ignore */ } },
    stop: stop,
    stopAll: function () { Object.keys(loops).forEach(stop); },
    setEnabled: function (on) {
      enabled = !!on;
      try { localStorage.setItem('dquest_sound', enabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
      if (!enabled) api.stopAll(); else ensure();
      return enabled;
    },
    toggle: function () { return api.setEnabled(!enabled); },
    names: Object.keys(sounds)
  };
  // Browsers only allow sound after a gesture; unlock on the first one.
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, function () { if (enabled) ensure(); }, { once: true, passive: true }); });
  window.DQSfx = api;
})();
