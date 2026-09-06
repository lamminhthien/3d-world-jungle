import { CAMERA } from '../config.js';

export const WEATHERS = ['clear', 'overcast', 'rain', 'fog'];
const STORAGE_KEY = 'jungle_3d_benchmark_results';

export const BENCHMARK_PHASES = [
  {
    id: 'day_movement',
    name: '1. Day Stroll & Tracking',
    description: 'Daylight (12:00), Clear weather, straight movement & gentle camera follow',
    duration: 6, // seconds
    setup: ({ env }) => {
      env.setTime(12);
      env.setWeather('clear');
    },
    tick: ({ t, dt, input, cameraState }) => {
      // Walk forward in an oscillating S-curve
      const angle = Math.sin(t * 1.5) * 0.5;
      input.ix = Math.sin(angle);
      input.iz = -Math.cos(angle);
      input.sprint = false;
      // Gentle camera orbit
      cameraState.azimuth += dt * 0.15;
    },
  },
  {
    id: 'sunset_orbit',
    name: '2. Sunset & Camera Orbit',
    description: 'Sunset transition (17.5h to 19h), Fog weather, wide camera orbit',
    duration: 6,
    setup: ({ env }) => {
      env.setTime(17.5);
      env.setWeather('fog');
    },
    tick: ({ t, dt, input, cameraState, env }) => {
      // Progress time across sunset
      env.setTime(17.5 + (t / 6) * 1.5);
      // Continuous camera orbit
      cameraState.azimuth += dt * 0.7;
      // Zigzag player movement
      input.ix = Math.cos(t * 2);
      input.iz = Math.sin(t * 2);
      input.sprint = true;
    },
  },
  {
    id: 'night_rain_fire',
    name: '3. Midnight Rain & Night Stress',
    description: 'Night (23:00 - 01:00), Rain particles & lighting, sprinting across campsites',
    duration: 7,
    setup: ({ env }) => {
      env.setTime(23.5);
      env.setWeather('rain');
    },
    tick: ({ t, dt, input, cameraState, env }) => {
      env.setTime(23.5 + (t / 7) * 1.5);
      // Fast camera rotation + zoom pulsation
      cameraState.azimuth += dt * 0.5;
      const zoomCycle = Math.sin(t * 2) * 0.5 + 0.5;
      cameraState.frustumSize = THREE_clamp(
        CAMERA.frustumSize - 6 + zoomCycle * 14,
        CAMERA.minZoom,
        CAMERA.maxZoom
      );
      // Sprinting in a circle
      input.ix = Math.cos(t * 2.5);
      input.iz = Math.sin(t * 2.5);
      input.sprint = true;
    },
  },
  {
    id: 'dynamic_sweep',
    name: '4. Dynamic Time & Weather Sweep',
    description: 'Fast 24h day-night cycle, rapidly changing weather states, 360° camera sweep',
    duration: 8,
    setup: ({ env }) => {
      env.setTime(6);
      env.setWeather('overcast');
    },
    tick: ({ t, dt, input, cameraState, env }) => {
      // Sweep through hours fast
      env.setTime((6 + (t / 8) * 24) % 24);
      // Cycle weather through 4 states
      const wxIndex = Math.floor((t / 8) * WEATHERS.length) % WEATHERS.length;
      if (env.weather !== WEATHERS[wxIndex]) {
        env.setWeather(WEATHERS[wxIndex]);
      }
      // Camera fast sweep + zoom oscillation
      cameraState.azimuth += dt * 1.2;
      const zoom = CAMERA.frustumSize + Math.sin(t * 3) * 8;
      cameraState.frustumSize = THREE_clamp(zoom, CAMERA.minZoom, CAMERA.maxZoom);
      // Aggressive directional movement
      input.ix = Math.sin(t * 3.5);
      input.iz = Math.cos(t * 3.5);
      input.sprint = true;
    },
  },
];

function THREE_clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export class BenchmarkManager {
  constructor({ core, env, player, rigControls }) {
    this.core = core;
    this.env = env;
    this.player = player;
    this.rigControls = rigControls;

    this.isRunning = false;
    this.currentPhaseIndex = 0;
    this.phaseElapsedTime = 0;
    this.totalElapsedTime = 0;

    this.simulatedInput = { ix: 0, iz: 0, sprint: false };
    this.originalState = null;

    this.frameTimes = []; // for current phase
    this.allFrameTimes = []; // across entire benchmark
    this.phaseResults = [];

    this.onUpdateCallbacks = [];
    this.onCompleteCallbacks = [];
  }

  onUpdate(fn) {
    this.onUpdateCallbacks.push(fn);
  }

  onComplete(fn) {
    this.onCompleteCallbacks.push(fn);
  }

  start() {
    if (this.isRunning) return;

    // Snapshot original state to restore cleanly after test
    this.originalState = {
      playerPos: this.player.position.clone(),
      azimuth: this.core.state.azimuth,
      polarElevation: this.core.state.polarElevation,
      frustumSize: this.core.state.frustumSize,
      timeOfDay: this.env.timeOfDay,
      weather: this.env.weather,
      paused: this.env.state.paused,
    };

    this.isRunning = true;
    this.currentPhaseIndex = 0;
    this.phaseElapsedTime = 0;
    this.totalElapsedTime = 0;
    this.frameTimes = [];
    this.allFrameTimes = [];
    this.phaseResults = [];

    this.preparePhase(0);
  }

  cancel() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.restoreOriginalState();
  }

  preparePhase(index) {
    if (index >= BENCHMARK_PHASES.length) {
      this.finish();
      return;
    }
    this.currentPhaseIndex = index;
    this.phaseElapsedTime = 0;
    this.frameTimes = [];
    const phase = BENCHMARK_PHASES[index];
    if (phase.setup) {
      phase.setup({ env: this.env, core: this.core, player: this.player });
    }
  }

  update(dt) {
    if (!this.isRunning) return;

    // Record frame time (in ms)
    const frameMs = dt * 1000;
    this.frameTimes.push(frameMs);
    this.allFrameTimes.push(frameMs);

    this.phaseElapsedTime += dt;
    this.totalElapsedTime += dt;

    const prevFrustum = this.core.state.frustumSize;
    const phase = BENCHMARK_PHASES[this.currentPhaseIndex];
    if (phase.tick) {
      phase.tick({
        t: this.phaseElapsedTime,
        dt,
        input: this.simulatedInput,
        cameraState: this.core.state,
        env: this.env,
        player: this.player,
      });
    }
    if (this.core.state.frustumSize !== prevFrustum && this.core.onResize) {
      this.core.onResize();
    }

    // Notify listeners for UI progress update
    const totalDuration = BENCHMARK_PHASES.reduce((acc, p) => acc + p.duration, 0);
    const progress = Math.min(1, this.totalElapsedTime / totalDuration);
    const currentFps = dt > 0 ? 1 / dt : 0;

    for (const cb of this.onUpdateCallbacks) {
      cb({
        phaseIndex: this.currentPhaseIndex,
        phaseName: phase.name,
        phaseProgress: Math.min(1, this.phaseElapsedTime / phase.duration),
        totalProgress: progress,
        currentFps,
        elapsedTime: this.totalElapsedTime,
        totalDuration,
      });
    }

    // Phase transition
    if (this.phaseElapsedTime >= phase.duration) {
      const stats = this.computeStats(this.frameTimes);
      this.phaseResults.push({
        id: phase.id,
        name: phase.name,
        stats,
      });
      this.preparePhase(this.currentPhaseIndex + 1);
    }
  }

  computeStats(times) {
    if (!times.length) {
      return { avgFps: 0, minFps: 0, fps1PercentLow: 0, hitches: 0, avgMs: 0 };
    }

    const totalMs = times.reduce((a, b) => a + b, 0);
    const avgMs = totalMs / times.length;
    const avgFps = 1000 / avgMs;

    // Sorted descending by frame duration (longest frame times = worst dips)
    const sorted = [...times].sort((a, b) => b - a);
    const maxMs = sorted[0];
    const minFps = 1000 / Math.max(1, maxMs);

    // 1% low FPS: 99th percentile slowest frame duration
    const index1Percent = Math.max(0, Math.floor(sorted.length * 0.01));
    const p99Ms = sorted[index1Percent];
    const fps1PercentLow = 1000 / Math.max(1, p99Ms);

    // Hitches: frames taking longer than 50ms (dropping below 20fps momentarily)
    const hitches = sorted.filter((ms) => ms > 50).length;

    return {
      avgFps: Math.round(avgFps * 10) / 10,
      minFps: Math.round(minFps * 10) / 10,
      fps1PercentLow: Math.round(fps1PercentLow * 10) / 10,
      hitches,
      avgMs: Math.round(avgMs * 10) / 10,
      samples: times.length,
    };
  }

  finish() {
    this.isRunning = false;
    const overallStats = this.computeStats(this.allFrameTimes);

    // Performance Score Formula:
    // Balances average FPS with stability ratio (1% low / avg)
    // 60 fps stable -> ~6000 points. 120 fps stable -> ~12000 points.
    const stabilityRatio = overallStats.avgFps > 0 ? overallStats.fps1PercentLow / overallStats.avgFps : 0;
    const score = Math.round(overallStats.avgFps * 100 * Math.max(0.2, stabilityRatio));

    let tier = 'Unranked';
    let grade = 'F';
    if (score >= 9000) { tier = 'Ultra Smooth'; grade = 'S'; }
    else if (score >= 5500) { tier = 'Smooth'; grade = 'A'; }
    else if (score >= 3800) { tier = 'Playable'; grade = 'B'; }
    else if (score >= 2500) { tier = 'Chippy'; grade = 'C'; }
    else { tier = 'Stuttery'; grade = 'D'; }

    const result = {
      id: 'bench_' + Date.now(),
      date: new Date().toISOString(),
      score,
      grade,
      tier,
      overall: overallStats,
      phases: this.phaseResults,
      device: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
        screenWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
        screenHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
        hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : null,
      },
    };

    saveBenchmarkResult(result);
    this.restoreOriginalState();

    for (const cb of this.onCompleteCallbacks) {
      cb(result);
    }
  }

  restoreOriginalState() {
    if (!this.originalState) return;
    this.player.position.copy(this.originalState.playerPos);
    this.core.state.azimuth = this.originalState.azimuth;
    this.core.state.polarElevation = this.originalState.polarElevation;
    this.core.state.frustumSize = this.originalState.frustumSize;
    this.core.onResize?.();

    this.env.setTime(this.originalState.timeOfDay);
    this.env.setWeather(this.originalState.weather);
    this.env.state.paused = this.originalState.paused;

    this.simulatedInput.ix = 0;
    this.simulatedInput.iz = 0;
    this.simulatedInput.sprint = false;
  }
}

// ============ Storage Helpers ============
export function getBenchmarkHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveBenchmarkResult(result) {
  try {
    const list = getBenchmarkHistory();
    list.unshift(result);
    // Keep last 25 results
    const trimmed = list.slice(0, 25);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error('Failed to save benchmark result to localStorage:', err);
  }
}

export function clearBenchmarkHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
