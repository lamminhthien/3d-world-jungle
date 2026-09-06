# Procedural Generative Music Engine

The 3D jungle stroll features a zero-asset, procedural music box system built with the Web Audio API. It continuously synthesizes cozy, indie-game background music driven by declarative JSON instructions without requiring any external audio files.

---

## 1. Architecture Overview

```
src/audio/music-tracks.json  (Declarative track instructions)
            │
            ▼
   src/audio/cozy.js         (Web Audio synthesizer & lookahead scheduler)
            │
            ▼
src/world/environment.js     (Audio bus, HUD sync, day/night & rain modulation)
```

The system operates entirely client-side using native Web Audio synthesis:
- **Lead voice:** Configurable oscillator (`triangle` or `sine`) paired with a detuned harmonic shimmer oscillator through a dynamic lowpass filter.
- **Chord pad:** Twin detuned sine oscillators providing a warm chorus effect.
- **Sub-bass:** Warm sine wave covering chord roots, accompanied by a rhythmic fifth-pulse.
- **Space & Delay:** Feedback delay network with soft dampening filter for a dreamy indie-pixel feel.
- **Environment reactivity:** Automatically adjusts master tone filtering, chord progressions, and melody note density based on in-game time of day (day vs. night) and weather (clear vs. rain).

---

## 2. Music Instructions Format (`music-tracks.json`)

Tracks are defined as declarative JSON instructions in `src/audio/music-tracks.json`.

```json
{
  "tracks": [
    {
      "id": "jungle-sunrise",
      "name": "Jungle Sunrise",
      "description": "Warm, bright Stardew-like music box with a nostalgic morning stroll feel.",
      "bpm": 74,
      "delay": {
        "time": 0.42,
        "feedback": 0.32,
        "dampen": 2200,
        "wet": 0.35
      },
      "timbre": {
        "leadWave": "triangle",
        "shimmerWave": "sine",
        "shimmerRatio": 2.0,
        "shimmerGain": 0.25,
        "leadFilterCutoff": 2400
      },
      "dayChords": [
        [48, 55, 60, 64],
        [47, 55, 59, 62],
        [45, 52, 57, 60],
        [41, 48, 53, 57]
      ],
      "nightChords": [
        [45, 52, 57, 60],
        [41, 48, 53, 57],
        [48, 55, 60, 64],
        [43, 50, 55, 59]
      ],
      "pentaDay": [72, 74, 76, 79, 81, 84, 86],
      "pentaMoody": [69, 72, 74, 76, 79, 81, 84],
      "density": { "day": 0.55, "night": 0.35, "rain": 0.28 },
      "chordCycles": 4
    }
  ]
}
```

### Key Parameters:
- `bpm`: Beat tempo governing stroll pacing and note scheduling.
- `delay`: Spatial ambience parameters (`time`, `feedback`, `dampen`, `wet`).
- `timbre`: Synth voice wave shapes, harmonic multiplier, shimmer volume, and cutoff frequency.
- `dayChords` / `nightChords`: Arrays of MIDI chord voicings (e.g. `[48, 55, 60, 64]` for C Major).
- `pentaDay` / `pentaMoody`: MIDI note arrays for the pentatonic random-walk melody generator.
- `density`: Trigger chance for melody notes across day, night, and rain conditions.
- `chordCycles`: How many full progression loops play before seamlessly rotating to the next random track (~1.5–2 minutes).

---

## 3. The 6 Defined Tracks

| # | Track Name | Key / Scale | BPM | Timbre & Space | Mood |
|---|---|---|---|---|---|
| 1 | **Jungle Sunrise** | C Major / A Minor | 74 | Triangle lead, 2.0x shimmer, 0.42s delay | Nostalgic, sunny Stardew-like stroll |
| 2 | **Deep Emerald Canopy** | F Maj7 / Dm7 | 64 | Triangle lead, 1.5x shimmer, 0.52s deep echo | Lush, verdant, floating deep forest |
| 3 | **Sunlit Ruins** | G Major / Em | 82 | Sine bell, 2.0x overtone, 0.36s delay | Playful, upbeat discovery and adventure |
| 4 | **Whispering River** | D Major / Bm | 70 | Water chime, 3.0x shimmer, 0.44s ripple | Fluid, reflective river flow |
| 5 | **Ancient Totem** | A Dorian / D | 66 | Hollow kalimba/flute tone, 0.48s echo | Sacred, calm mystery under ancient trees |
| 6 | **Moonlit Glade** | E Minor / G | 60 | Velvet sine pad, 0.50s delay | Dreamy, nocturnal star-gazing chill |

---

## 4. Playback & Track Transition Mechanics

- **Random Start:** The engine picks a random track when audio starts.
- **Automatic Progression:** After completing the configured `chordCycles`, `nextTrack()` picks another random track from the instruction set.
- **Glitch-free Transitions:** When transitioning between tracks, delay parameters, tone filters, and tempos interpolate smoothly using Web Audio's `setTargetAtTime`, preventing clicks, pops, or harsh discontinuities.

---

## 5. Controls & API

### In-Game HUD:
- **Click 🎵**: Toggle music mute/unmute.
- **Shift-Click 🎵**: Skip immediately to the next random track.
- **Hover 🎵**: Tooltip displays the currently playing track title.

### Programmatic API (`createCozyMusic`):
```javascript
import { createCozyMusic } from './audio/cozy.js';

const cozy = createCozyMusic(audioCtx, masterNode);

// Information
const current = cozy.getCurrentTrack(); // { id, name, bpm, ... }
const allTracks = cozy.getTracks();     // List of all tracks

// Controls
cozy.nextTrack();                       // Switch to random track
cozy.setTrack('deep-emerald-canopy');  // Switch by ID or index
cozy.setMuted(true);                    // Mute / unmute

// Event listener
const unsubscribe = cozy.onTrackChange((track) => {
  console.log('Now playing:', track.name);
});
```

