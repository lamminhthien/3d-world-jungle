// Cozy generative music box — indie vibe, multi-track random generative music
// powered by instructions defined in music-tracks.json.
//
// Sound: soft plucked leads playing lazy pentatonic melodies over warm pad chords
// and round sub-bass, washed through a dreamy feedback delay.
//
// - Each track defines BPM, chord progressions, pentatonic scales, timbre, and delay space.
// - Automatically and seamlessly rotates to a new random track after completing chord cycles.
// - Callers can also query current track, list tracks, or trigger nextTrack().
// - All scheduling is lookahead-based inside update(dt) — call every frame.

import musicData from './music-tracks.json';

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const MUSIC_TRACKS = musicData.tracks;

export function createCozyMusic(ctx, outNode) {
  // Dreamy slapback: delay with soft feedback & lowpass dampen.
  const delay = ctx.createDelay(2.0);
  const fb = ctx.createGain();
  const dampen = ctx.createBiquadFilter();
  dampen.type = 'lowpass';
  const wet = ctx.createGain();

  outNode.connect(delay);
  delay.connect(dampen).connect(fb).connect(delay);
  dampen.connect(wet).connect(outNode);

  // Mellow master filter bus so rain/night can darken everything with one knob.
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3200;
  tone.connect(outNode);

  // Track selection: start with a random track from music-tracks.json
  let trackIndex = Math.floor(Math.random() * MUSIC_TRACKS.length);
  let currentTrack = MUSIC_TRACKS[trackIndex];
  let beat = 60 / currentTrack.bpm;
  let chordStep = (Math.random() * currentTrack.dayChords.length) | 0;
  let cycleCount = 0;
  let degree = 2 + ((Math.random() * 3) | 0);

  let nextChordT = 0;
  let nextMelodyT = 0;
  let started = false;
  let muted = false;
  const trackListeners = new Set();

  function applyTrackSettings(track, immediate = false) {
    const d = track.delay || {};
    const t = ctx.currentTime;
    const timeVal = d.time ?? 0.42;
    const fbVal = d.feedback ?? 0.32;
    const dampVal = d.dampen ?? 2200;
    const wetVal = d.wet ?? 0.35;

    if (!immediate && delay.delayTime.setTargetAtTime) {
      delay.delayTime.setTargetAtTime(timeVal, t, 0.4);
      fb.gain.setTargetAtTime(fbVal, t, 0.4);
      dampen.frequency.setTargetAtTime(dampVal, t, 0.4);
      wet.gain.setTargetAtTime(wetVal, t, 0.4);
    } else {
      delay.delayTime.value = timeVal;
      fb.gain.value = fbVal;
      dampen.frequency.value = dampVal;
      wet.gain.value = wetVal;
    }
  }

  // Initial delay params
  applyTrackSettings(currentTrack, true);

  function pickRandomTrackIndex() {
    if (MUSIC_TRACKS.length <= 1) return 0;
    let next;
    do {
      next = Math.floor(Math.random() * MUSIC_TRACKS.length);
    } while (next === trackIndex);
    return next;
  }

  function setTrack(idxOrId) {
    let nextIdx = -1;
    if (typeof idxOrId === 'number') {
      nextIdx = ((idxOrId % MUSIC_TRACKS.length) + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
    } else if (typeof idxOrId === 'string') {
      nextIdx = MUSIC_TRACKS.findIndex((t) => t.id === idxOrId);
    }
    if (nextIdx < 0) nextIdx = pickRandomTrackIndex();

    trackIndex = nextIdx;
    currentTrack = MUSIC_TRACKS[trackIndex];
    beat = 60 / currentTrack.bpm;
    chordStep = 0;
    cycleCount = 0;
    applyTrackSettings(currentTrack, false);

    trackListeners.forEach((fn) => {
      try { fn(currentTrack); } catch (err) { console.warn(err); }
    });
    return currentTrack;
  }

  function nextTrack() {
    return setTrack(pickRandomTrackIndex());
  }

  function pluck(freq, t0, dur, vol, bright = 1) {
    const timbre = currentTrack.timbre || {};
    const leadWave = timbre.leadWave || 'triangle';
    const shimmerWave = timbre.shimmerWave || 'sine';
    const shimmerRatio = timbre.shimmerRatio ?? 2.0;
    const shimmerGain = timbre.shimmerGain ?? 0.25;
    const cutoff = (timbre.leadFilterCutoff ?? 2400) * bright;

    const o = ctx.createOscillator();
    o.type = leadWave;
    o.frequency.value = freq;

    const shimmer = ctx.createOscillator();
    shimmer.type = shimmerWave;
    shimmer.frequency.value = freq * shimmerRatio;

    const sg = ctx.createGain();
    sg.gain.value = shimmerGain;

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;

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
    const prog = isNight ? currentTrack.nightChords : currentTrack.dayChords;
    const chord = prog[chordStep % prog.length];
    chordStep++;

    // Track cycle progress; when completed, transition to a new random track
    if (chordStep % prog.length === 0) {
      cycleCount++;
      const targetCycles = currentTrack.chordCycles || 4;
      if (cycleCount >= targetCycles) {
        nextTrack();
      }
    }

    const dur = beat * 8; // one chord per 2 bars
    // Pad: inner voices quiet — bass covers the root.
    for (let i = 1; i < chord.length; i++) {
      padNote(midi(chord[i]), t0, dur, 0.018);
    }
    bass(midi(chord[0]), t0, beat * 3.2, 0.075);
    // Soft fifth pulse halfway through
    bass(midi(chord[0] + 7), t0 + beat * 4, beat * 2.2, 0.04);
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
    const dur = beat * (1.5 + Math.random() * 1.5);
    pluck(midi(note), t0, dur, vol * (0.8 + Math.random() * 0.4), bright);

    // Occasional sparkle an octave up, like a glockenspiel echo.
    if (Math.random() < 0.14) {
      pluck(midi(note + 12), t0 + beat * 0.5, dur * 0.7, vol * 0.45, bright);
    }
  }

  return {
    setMuted(m) { muted = !!m; },
    get muted() { return muted; },
    getCurrentTrack() { return { ...currentTrack }; },
    getTracks() { return MUSIC_TRACKS.map((t) => ({ ...t })); },
    setTrack,
    nextTrack,
    onTrackChange(fn) {
      trackListeners.add(fn);
      return () => trackListeners.delete(fn);
    },
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
      const scale = moody ? currentTrack.pentaMoody : currentTrack.pentaDay;
      const chordLen = beat * 8;

      while (nextChordT < now + AHEAD) {
        // Rain hushes the harmony a touch.
        if (rain < 0.9 || Math.random() < 0.7) {
          scheduleChord(nextChordT, isNight);
        }
        nextChordT += chordLen;
      }

      // Melody density based on track instruction and environment
      const densitySettings = currentTrack.density || { day: 0.55, night: 0.35, rain: 0.28 };
      const density = rain > 0.5 ? densitySettings.rain : isNight ? densitySettings.night : densitySettings.day;
      const slot = beat * (rain > 0.5 ? 1.0 : 0.5);
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
