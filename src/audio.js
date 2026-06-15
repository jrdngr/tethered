// Procedural WebAudio SFX — tiny oscillator + envelope voices, no asset
// files. The context unlocks lazily on the first input (browser autoplay
// policy); until then every play() is a silent no-op, so call sites never
// have to care. Voicing (waveforms, frequency ramps) lives here like colors
// live in render.js; the master volume is TUNING.AUDIO_VOLUME.
window.Tethered = window.Tethered || {};

(function (S) {
  let actx = null;
  const lastPlay = {}; // per-voice throttle — pop chains fire dozens per frame

  // One synth voice: an oscillator sweeping f0 → f1 over dur seconds under
  // an exponential-decay gain envelope. Every sound is a few of these.
  function tone(type, f0, f1, dur, vol, delay = 0) {
    const t0 = actx.currentTime + delay;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    gain.gain.setValueAtTime(vol * S.TUNING.AUDIO_VOLUME, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.01);
  }

  const VOICES = {
    // Kill smash: a punchy square thud with a sawtooth crack on top.
    smash: () => {
      tone('square', 200, 50, 0.1, 0.5);
      tone('sawtooth', 320, 60, 0.08, 0.25);
    },
    // Bash: the smash, but deeper, louder, longer — the power moment.
    bash: () => {
      tone('square', 130, 30, 0.22, 0.8);
      tone('sawtooth', 500, 50, 0.15, 0.4);
    },
    // Arena-border bounce: a soft low boing.
    bounce: () => tone('sine', 240, 120, 0.07, 0.3),
    // Health pickup: a warm upward swell.
    heal: () => tone('sine', 400, 800, 0.18, 0.3),
    // Player hit: a harsh falling buzz.
    hurt: () => tone('sawtooth', 180, 60, 0.25, 0.6),
    // Player death: a long descending groan under the pop visuals.
    death: () => {
      tone('sawtooth', 300, 30, 0.9, 0.8);
      tone('square', 150, 25, 0.9, 0.5);
    },
  };

  S.audio = {
    // Called from the first input handlers (a user gesture, which autoplay
    // policy requires); also resumes a context the browser suspended.
    unlock() {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) actx = new AC();
      }
      if (actx && actx.state === 'suspended') actx.resume();
    },

    play(name) {
      if (!actx || actx.state !== 'running' || S.TUNING.AUDIO_VOLUME <= 0) return;
      // Same-voice calls inside ~a frame collapse into one — pop chains would
      // otherwise stack into a blast.
      const now = actx.currentTime;
      if (now - (lastPlay[name] || -1) < 0.03) return;
      lastPlay[name] = now;
      VOICES[name]();
    },
  };
})(Tethered);
