// Funny jungle music box — bouncy, goofy, slapstick jungle vibe
// powered by instructions defined in music-tracks.json.
//
// Sound: bright marimba/xylophone plucks with wobbly tuba bass hops,
// cheeky bongo woodblocks, and silly boing/slide-whistle surprises
// washed through a tight bouncy slap delay.
//
// - Each track defines BPM, chord progressions, scales, timbre, and delay space.
// - Automatically and seamlessly rotates to a new random track after completing chord cycles.
// - Callers can also query current track, list tracks, or trigger nextTrack().
// - All scheduling is lookahead-based inside update(dt) — call every frame.

import musicData from './music-tracks.json';

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const MUSIC_TRACKS = musicData.tracks;

export function createCozyMusic(ctx, outNode) {
  // Tight bouncy slap delay for that cartoon-jungle bounce
  const delay = ctx.createDelay(2.0);
  const fb = ctx.createGain();
  const dampen = ctx.createBiquadFilter();
  dampen.type = 'lowpass';
  const wet = ctx.createGain();

  outNode.connect(delay);
  delay.connect(dampen).connect(fb).connect(delay);
  dampen.connect(wet).connect(outNode);

  // Brighter master filter so marimba cuts through — rain/night still darkens it
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 4200;
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
  let nextPercT = 0;
  let started = false;
  let muted = false;
  const trackListeners = new Set();

  function applyTrackSettings(track, immediate = false) {
    const d = track.delay || {};
    const t = ctx.currentTime;
    const timeVal = d.time ?? 0.24;
    const fbVal = d.feedback ?? 0.18;
    const dampVal = d.dampen ?? 4000;
    const wetVal = d.wet ?? 0.18;

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

  // --- Funny jungle voices ---

  function pluck(freq, t0, dur, vol, bright = 1) {
    const timbre = currentTrack.timbre || {};
    const leadWave = timbre.leadWave || 'square';
    const shimmerWave = timbre.shimmerWave || 'sine';
    const shimmerRatio = timbre.shimmerRatio ?? 2.0;
    const shimmerGain = timbre.shimmerGain ?? 0.2;
    const cutoff = (timbre.leadFilterCutoff ?? 4000) * bright;

    const o = ctx.createOscillator();
    o.type = leadWave;
    // Gentle pitch envelope: subtle xylophone tick
    o.frequency.setValueAtTime(freq * 1.01, t0);
    o.frequency.exponentialRampToValueAtTime(freq, t0 + 0.04);

    const shimmer = ctx.createOscillator();
    shimmer.type = shimmerWave;
    shimmer.frequency.value = freq * shimmerRatio;

    const sg = ctx.createGain();
    sg.gain.value = shimmerGain;

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;

    const g = ctx.createGain();
    // Marimba-like: fast attack, mellow decay — less harsh
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(Math.max(1e-4, vol * 0.22), t0 + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);

    // Subtle vibrato only on long notes, quieter
    if (dur > 0.5) {
      const vib = ctx.createOscillator();
      vib.type = 'sine';
      vib.frequency.value = 4.5 + Math.random() * 1.5;
      const vibGain = ctx.createGain();
      vibGain.gain.value = freq * 0.0035;
      vib.connect(vibGain).connect(o.frequency);
      vib.start(t0);
      vib.stop(t0 + dur + 0.05);
    }

    o.connect(f);
    shimmer.connect(sg).connect(f);
    f.connect(g).connect(tone);

    // Gentle delay send
    const send = ctx.createGain();
    send.gain.value = 0.22;
    g.connect(send).connect(delay);

    o.start(t0);
    shimmer.start(t0);
    o.stop(t0 + dur + 0.05);
    shimmer.stop(t0 + dur + 0.05);
  }

  function padNote(freq, t0, dur, vol) {
    // Jungle pads are lighter — short, airy, not wash-y
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq * 1.004;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 0.996;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol * 0.65, t0 + 0.15);
    g.gain.setValueAtTime(vol * 0.65, t0 + dur * 0.55);
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
    // Wobbly tuba hop: square-ish + pitch slide down for comical bounce
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 1.08, t0);
    o.frequency.exponentialRampToValueAtTime(freq, t0 + 0.09);

    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2;
    const o2Gain = ctx.createGain();
    o2Gain.gain.value = 0.18;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    // Staccato bouncy decay — not long sub, more tuba hop
    g.gain.exponentialRampToValueAtTime(Math.max(1e-4, vol * 0.25), t0 + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);

    o.connect(g).connect(tone);
    o2.connect(o2Gain).connect(g);
    o.start(t0);
    o2.start(t0);
    o.stop(t0 + dur + 0.05);
    o2.stop(t0 + dur + 0.05);
  }

  function bongo(freq, t0, vol) {
    // Jungle percussion: woodblock / bongo hit
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(freq * 0.7, t0 + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + 0.12);
    // Tiny click
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    o.connect(g).connect(hp).connect(tone);
    // Also a bit to delay for bounce
    const send = ctx.createGain();
    send.gain.value = 0.18;
    g.connect(send).connect(delay);
    o.start(t0);
    o.stop(t0 + 0.13);
  }

  function boing(freq, t0, vol) {
    // Slide-whistle / boing: silly cartoon slide up or down
    const o = ctx.createOscillator();
    o.type = 'sine';
    const goUp = Math.random() < 0.55;
    if (goUp) {
      o.frequency.setValueAtTime(freq * 0.6, t0);
      o.frequency.exponentialRampToValueAtTime(freq * 1.8, t0 + 0.22);
    } else {
      o.frequency.setValueAtTime(freq * 1.5, t0);
      o.frequency.exponentialRampToValueAtTime(freq * 0.55, t0 + 0.28);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + 0.32);
    o.connect(g).connect(tone);
    const send = ctx.createGain();
    send.gain.value = 0.25;
    g.connect(send).connect(delay);
    o.start(t0);
    o.stop(t0 + 0.35);
  }

  function scheduleChord(t0, isNight) {
    const prog = isNight ? currentTrack.nightChords : currentTrack.dayChords;
    const chord = prog[chordStep % prog.length];
    chordStep++;

    // Track cycle progress; when completed, transition to a new random track
    if (chordStep % prog.length === 0) {
      cycleCount++;
      const targetCycles = currentTrack.chordCycles || 3;
      if (cycleCount >= targetCycles) {
        nextTrack();
      }
    }

    const dur = beat * 6; // slightly shorter than before — snappier jungle
    // Light pad stab — not too washy
    for (let i = 1; i < chord.length; i++) {
      padNote(midi(chord[i]), t0, dur * 0.7, 0.013);
    }
    // Warm bass: root + gentle fifth, rare octave
    bass(midi(chord[0]), t0, beat * 1.8, 0.085);
    bass(midi(chord[0] + 7), t0 + beat * 2, beat * 1.1, 0.045);
    if (Math.random() < 0.28) {
      bass(midi(chord[0] + 12), t0 + beat * 4, beat * 0.9, 0.03);
    }
    // Sparse bongo for groove
    if (Math.random() < 0.35) bongo(180, t0, 0.11);
    if (Math.random() < 0.22) bongo(220, t0 + beat * 3, 0.08);
  }

  function scheduleMelody(t0, scale, vol, bright) {
    // More playful walk: bigger leaps, repeats, chromatic silliness
    const roll = Math.random();
    if (roll < 0.28) {
      // Step
      degree += Math.random() < 0.5 ? -1 : 1;
    } else if (roll < 0.45) {
      // Leap — funny jump
      degree += Math.random() < 0.5 ? -3 : 3;
    } else if (roll < 0.62) {
      // Repeat — motif
      degree += 0;
    } else if (roll < 0.78) {
      degree += Math.random() < 0.5 ? -2 : 2;
    } else {
      // Chromatic chuckle: half-step nudge (adds goofy tension)
      degree += Math.random() < 0.5 ? 0.5 : -0.5;
      degree = Math.round(degree);
    }

    degree = Math.max(0, Math.min(scale.length - 1, degree));
    let note = scale[degree];

    // Rare octave leap
    if (Math.random() < 0.05) note += 12;

    // Rare chromatic slip (was 8% — too clowny)
    if (Math.random() < 0.03) note += Math.random() < 0.5 ? 1 : -1;

    const dur = beat * (0.75 + Math.random() * 0.8); // rounder, less chipmunk
    const v = vol * (0.88 + Math.random() * 0.32);
    pluck(midi(note), t0, dur, v, bright);

    // Gentle chuckle double — rarer now
    if (Math.random() < 0.10) {
      const chuckleNote = note + (Math.random() < 0.5 ? 3 : 4);
      pluck(midi(chuckleNote), t0 + beat * 0.38, dur * 0.55, v * 0.42, bright);
    }

    // Soft sparkle — less frequent
    if (Math.random() < 0.08) {
      pluck(midi(note + 12), t0 + beat * 0.32, dur * 0.6, v * 0.30, bright);
    }

    // Boing — very rare surprise
    if (Math.random() < 0.025) {
      boing(midi(note + (Math.random() < 0.5 ? 7 : -5)), t0 + beat * 0.50, v * 0.32);
    }
  }

  function schedulePercussion(t0) {
    if (Math.random() < 0.28) bongo(160 + Math.random() * 80, t0, 0.05 + Math.random() * 0.04);
    if (Math.random() < 0.12) bongo(280, t0 + beat * 0.5, 0.045);
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
        nextChordT = now + 0.2;
        nextMelodyT = now + 0.7;
        nextPercT = now + 0.5;
        started = true;
      }
      const AHEAD = 0.6;
      const moody = isNight || rain > 0.5;
      const scale = moody ? currentTrack.pentaMoody : currentTrack.pentaDay;
      const chordLen = beat * 6;

      while (nextChordT < now + AHEAD) {
        if (rain < 0.9 || Math.random() < 0.6) {
          scheduleChord(nextChordT, isNight);
        }
        nextChordT += chordLen;
      }

      const densitySettings = currentTrack.density || { day: 0.60, night: 0.38, rain: 0.34 };
      const density = rain > 0.5 ? densitySettings.rain : isNight ? densitySettings.night : densitySettings.day;
      const slot = beat * (rain > 0.5 ? 0.85 : 0.52);
      const vol = (isNight ? 0.065 : 0.088) * (1 - rain * 0.22);
      const bright = (isNight ? 0.80 : 1.02) * (1 - rain * 0.18);

      const targetCutoff = moody ? 2600 : 3800;
      tone.frequency.value += (targetCutoff - tone.frequency.value) * 0.05;

      while (nextMelodyT < now + AHEAD) {
        if (Math.random() < density) scheduleMelody(nextMelodyT, scale, vol, bright);
        const r = Math.random();
        if (r < 0.10) nextMelodyT += slot * 2; // occasional breath
        else if (r < 0.20) nextMelodyT += slot * 0.5; // rare flam
        else nextMelodyT += slot;
      }

      const percSlot = beat * 1.15;
      while (nextPercT < now + AHEAD) {
        if (Math.random() < 0.32) schedulePercussion(nextPercT);
        nextPercT += percSlot;
      }
    },
  };
}
