// Sampled jungle soundtrack — plays real mp3/ogg files via WebAudio
// Falls back gracefully if files missing (checked via fetch manifest).

import manifest from '../../public/generated/music/manifest.json' with { type: 'json' };

export const SAMPLED_TRACKS = manifest.tracks || [];

// Provide same interface as createCozyMusic so environment.js can swap
export function createSampledMusic(ctx, outNode) {
  if (!SAMPLED_TRACKS.length) {
    console.warn('[sampledMusic] no tracks in manifest');
    return createNoopMusic();
  }

  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 1.0;

  // Route through WebAudio so musicBus gain / master still controls volume
  let source = null;
  let connected = false;
  function ensureConnected() {
    if (connected || !ctx) return;
    try {
      source = ctx.createMediaElementSource(audio);
      source.connect(outNode);
      connected = true;
    } catch (e) {
      // May fail if ctx not running or already connected; fallback to audio.volume
      console.warn('[sampledMusic] MediaElementSource failed, using audio.volume', e);
    }
  }

  let trackIndex = Math.floor(Math.random() * SAMPLED_TRACKS.length);
  let currentTrack = SAMPLED_TRACKS[trackIndex];
  let muted = false;
  let started = false;
  const listeners = new Set();

  function loadTrack(idx) {
    const t = SAMPLED_TRACKS[idx];
    if (!t) return;
    trackIndex = idx;
    currentTrack = t;
    const wasPlaying = !audio.paused;
    audio.src = t.file;
    // Use ogg fallback if browser prefers? Audio will handle mp3/ogg via src
    audio.load();
    if ((wasPlaying || started) && !muted && ctx?.state === 'running') {
      audio.play().catch(() => {});
    }
    listeners.forEach((fn) => { try { fn(currentTrack); } catch (e) { console.warn(e); } });
  }

  // Preload first track metadata
  if (currentTrack) audio.src = currentTrack.file;

  function pickRandom() {
    if (SAMPLED_TRACKS.length <= 1) return 0;
    let n;
    do { n = Math.floor(Math.random() * SAMPLED_TRACKS.length); } while (n === trackIndex);
    return n;
  }

  function setTrack(idxOrId) {
    let idx = -1;
    if (typeof idxOrId === 'number') idx = ((idxOrId % SAMPLED_TRACKS.length) + SAMPLED_TRACKS.length) % SAMPLED_TRACKS.length;
    else if (typeof idxOrId === 'string') idx = SAMPLED_TRACKS.findIndex((t) => t.id === idxOrId);
    if (idx < 0) idx = pickRandom();
    loadTrack(idx);
    return currentTrack;
  }

  function nextTrack() { return setTrack(pickRandom()); }

  // Auto-advance when track ends (if loop disabled) — keep loop true for now,
  // but also advance on ended for non-looping future
  audio.addEventListener('ended', () => {
    if (!audio.loop) nextTrack();
  });

  // Handle autoplay policy: if ctx resumes, try play
  function tryPlay() {
    if (muted) return;
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    ensureConnected();
    if (audio.src && audio.paused) audio.play().catch(() => {});
    started = true;
  }

  return {
    setMuted(m) {
      muted = !!m;
      audio.muted = muted;
      if (muted) audio.pause();
      else tryPlay();
    },
    get muted() { return muted; },
    getCurrentTrack() { return { ...currentTrack }; },
    getTracks() { return SAMPLED_TRACKS.map((t) => ({ ...t })); },
    setTrack,
    nextTrack,
    onTrackChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    tryPlay,
    // Keep same update signature as cozy — no generative work needed
    update() {},
    // Volume via musicBus (outNode gain) so environment.js controls it
    _audio: audio,
  };
}

function createNoopMusic() {
  return {
    setMuted() {}, get muted() { return true; },
    getCurrentTrack() { return null; },
    getTracks() { return []; },
    setTrack() { return null; },
    nextTrack() { return null; },
    onTrackChange() { return () => {}; },
    tryPlay() {},
    update() {},
  };
}
