// Cozy generative music box — Stardew-Valley-ish indie vibe, zero assets.
//
// Sound: soft Rhodes-ish lead (triangle + octave shimmer) playing a lazy
// pentatonic melody over warm pad chords (I–V–vi–IV) and a round sub bass,
// washed through a feedback delay for that dreamy pixel-game feel.
//
// - Day: brighter, a little busier. Night: sparser, softer, lower.
// - Rain: slower + mellower (lowpassed, minor-leaning melody).
// - All scheduling is lookahead-based inside update(dt) — call every frame.
// - Owns no AudioContext: attach to the shared ambience ctx/master so the
//   single 🔊 mute button (and autoplay policy) stays in one place.
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Cozy I–V–vi–IV in C, voiced low-mid so it sits under SFX.
const DAY_CHORDS = [
  [48, 55, 60, 64], // C
  [47, 55, 59, 62], // G
  [45, 52, 57, 60], // Am
  [41, 48, 53, 57], // F
];
const NIGHT_CHORDS = [
  [45, 52, 57, 60], // Am
  [41, 48, 53, 57], // F
  [48, 55, 60, 64], // C
  [43, 50, 55, 59], // G (soft)
];
// C major pentatonic up high for the music-box lead.
const PENTA_DAY = [72, 74, 76, 79, 81, 84, 86];
// A minor pentatonic for rainy / night moods.
const PENTA_MOODY = [69, 72, 74, 76, 79, 81, 84];

export function createCozyMusic(ctx, outNode) {
  // Dreamy slapback: dotted-eighth-ish delay with soft feedback.
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.42;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const dampen = ctx.createBiquadFilter();
  dampen.type = 'lowpass';
  dampen.frequency.value = 2200;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  outNode.connect(delay);
  delay.connect(dampen).connect(fb).connect(delay);
  dampen.connect(wet).connect(outNode);

  // Mellow bus so rain/night can darken everything with one knob.
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3200;
  tone.connect(outNode);

  const BEAT = 60 / 72; // ~72bpm, lazy stroll tempo
  let chordStep = (Math.random() * 4) | 0;
  let degree = 2 + ((Math.random() * 3) | 0); // start mid-scale
  let nextChordT = 0;
  let nextMelodyT = 0;
  let started = false;
  let muted = false;

  function pluck(freq, t0, dur, vol, bright = 1) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = freq * 2;
    const sg = ctx.createGain();
    sg.gain.value = 0.25;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400 * bright;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
    o.connect(f);
    shimmer.connect(sg).connect(f);
    f.connect(g).connect(tone);
    // A touch of the delay send for space.
    const send = ctx.createGain();
    send.gain.value = 0.5;
    g.connect(send).connect(delay);
    o.start(t0);
    shimmer.start(t0);
    o.stop(t0 + dur + 0.05);
    shimmer.stop(t0 + dur + 0.05);
  }

  function padNote(freq, t0, dur, vol) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * 1.003; // faint chorus against its partner
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 0.997;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(1.8, dur * 0.4));
    g.gain.setValueAtTime(vol, t0 + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(g);
    o2.connect(g);
    g.connect(tone);
    o.start(t0);
    o2.start(t0);
    o.stop(t0 + dur + 0.05);
    o2.stop(t0 + dur + 0.05);
  }

  function bass(freq, t0, dur, vol) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
    o.connect(g).connect(tone);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function scheduleChord(t0, isNight) {
    const prog = isNight ? NIGHT_CHORDS : DAY_CHORDS;
    const chord = prog[chordStep % prog.length];
    chordStep++;
    const dur = BEAT * 8; // one chord per 2 bars
    // Pad: only inner voices, quiet — the bass covers the root.
    for (let i = 1; i < chord.length; i++) {
      padNote(midi(chord[i]), t0, dur, 0.018);
    }
    bass(midi(chord[0]), t0, BEAT * 3.2, 0.075);
    // Soft fifth pulse halfway through, music-box style.
    bass(midi(chord[0] + 7), t0 + BEAT * 4, BEAT * 2.2, 0.04);
  }

  function scheduleMelody(t0, scale, vol, bright) {
    // Random-walk the pentatonic so phrases feel composed, not dicey.
    const step = (Math.random() * 5) | 0;
    if (step <= 1) degree += Math.random() < 0.5 ? -1 : 1;
    else if (step === 2) degree += Math.random() < 0.5 ? -2 : 2;
    else if (step === 3) degree += 0; // repeat = motif
    else degree += Math.random() < 0.7 ? 1 : -1;
    degree = Math.max(0, Math.min(scale.length - 1, degree));
    const note = scale[degree];
    const dur = BEAT * (1.5 + Math.random() * 1.5);
    pluck(midi(note), t0, dur, vol * (0.8 + Math.random() * 0.4), bright);
    // Occasional sparkle an octave up, like a glockenspiel echo.
    if (Math.random() < 0.14) {
      pluck(midi(note + 12), t0 + BEAT * 0.5, dur * 0.7, vol * 0.45, bright);
    }
  }

  return {
    setMuted(m) { muted = !!m; },
    get muted() { return muted; },
    update(_dt, { isNight = false, rain = 0 } = {}) {
      if (muted || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (!started) {
        // Stagger in gently so music fades up instead of blurting.
        nextChordT = now + 0.3;
        nextMelodyT = now + 1.6;
        started = true;
      }
      const AHEAD = 0.6;
      const moody = isNight || rain > 0.5;
      const scale = moody ? PENTA_MOODY : PENTA_DAY;
      const chordLen = BEAT * 8;
      while (nextChordT < now + AHEAD) {
        // Rain hushes the harmony a touch.
        if (rain < 0.9 || Math.random() < 0.7) {
          // Pad/bass are scheduled inside; scale loudness via tone filter.
          scheduleChord(nextChordT, isNight);
        }
        nextChordT += chordLen;
      }
      // Melody density: day ~55%, night ~35%, rain ~28% per eighth slot.
      const density = rain > 0.5 ? 0.28 : isNight ? 0.35 : 0.55;
      const slot = BEAT * (rain > 0.5 ? 1.0 : 0.5);
      const vol = (isNight ? 0.055 : 0.075) * (1 - rain * 0.3);
      const bright = (isNight ? 0.7 : 1.0) * (1 - rain * 0.35);
      tone.frequency.value += ((moody ? 1800 : 3200) - tone.frequency.value) * 0.05;
      while (nextMelodyT < now + AHEAD) {
        if (Math.random() < density) scheduleMelody(nextMelodyT, scale, vol, bright);
        // Sometimes leave a breath (skip an extra slot).
        nextMelodyT += slot * (Math.random() < 0.18 ? 2 : 1);
      }
    },
  };
}
