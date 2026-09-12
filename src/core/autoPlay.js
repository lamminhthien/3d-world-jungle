import * as THREE from 'three';
import { riverDist, isOnBridge, isObstacleNear } from '../utils.js';
import { RIVER_HALF, BRIDGES } from '../config.js';
import { riverXAt } from '../world/procedural.js';

/**
 * AutoPlayAgent
 * Drives autonomous exploration through the procedural jungle world.
 * Features:
 * - Wandering with smooth heading changes (organic steering)
 * - Obstacle and winding river avoidance with lookahead probe
 * - Opportunistic bridge crossing to traverse river banks
 * - Smooth camera slow-orbit for cinematic immersion
 * - Calm walking pace with very rare gentle jog spurts
 * - Consolidation / circling detection via sampled position history
 * - Consistent avoidance-turn bias to prevent oscillating circles
 * - Automatic pause / resume on player manual control
 */
export class AutoPlayAgent {
  constructor({ core, player, env }) {
    this.core = core;
    this.player = player;
    this.env = env;

    this.enabled = false;
    this.simulatedInput = { ix: 0, iz: 0, sprint: false };

    // Wander state
    this.targetHeading = Math.random() * Math.PI * 2;
    this.currentHeading = this.targetHeading;
    this.headingChangeTimer = 0;
    this.sprintTimer = 0;
    this.isSprinting = false;

    // Bridge navigation state (to cross the river naturally)
    this.crossingBridge = false;
    this.targetBridgeZ = null;
    this.bridgeCooldown = 12; // seconds between seeking bridges

    // Short-term stuck detection
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector2(0, 0);

    // Camera auto-orbit
    this.camOrbitTimer = 0;
    this.camOrbitDir = 1;

    // Consolidation / circling detection
    // Sample position every SAMPLE_INTERVAL seconds and compare net travel
    // against HISTORY_LEN samples ago. If net travel is too small the agent
    // is circling and gets a bold new random heading.
    this._sampleTimer = 0;
    this._SAMPLE_INTERVAL = 1.0;  // sample every 1 s
    this._HISTORY_LEN = 4;        // look back 4 s
    this._posHistory = [];        // ring-buffer of { x, z }

    // Avoidance turn bias: +1 = turn right, -1 = turn left.
    // Held constant during an avoidance episode so the agent turns consistently
    // and doesn't oscillate back and forth between two mirror angles.
    this._avoidDir = 1;
    this._avoidBiasTimer = 0;
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setEnabled(val) {
    this.enabled = !!val;
    if (!this.enabled) {
      this.simulatedInput.ix = 0;
      this.simulatedInput.iz = 0;
      this.simulatedInput.sprint = false;
      this.crossingBridge = false;
      this.targetBridgeZ = null;
    } else {
      this.currentHeading = this.player ? this.player.rotation.y : 0;
      this.targetHeading = this.currentHeading;
      this.headingChangeTimer = 1.0;
      if (this.player) {
        this.lastPos.set(this.player.position.x, this.player.position.z);
      }
      this._posHistory = [];
      this._sampleTimer = 0;
      this.stuckTimer = 0;
      this._avoidBiasTimer = 0;
    }
  }

  update(dt) {
    if (!this.enabled || !this.player) return;

    this.headingChangeTimer -= dt;
    this.sprintTimer -= dt;
    this.bridgeCooldown -= dt;
    this._avoidBiasTimer -= dt;

    const px = this.player.position.x;
    const pz = this.player.position.z;

    // ── Short-term stuck detection ────────────────────────────────────────
    // movedDist is world-units since the last frame; threshold scaled by dt
    // so it represents a minimum speed (0.5 u/s) rather than a fixed pixel.
    const movedDist = Math.hypot(px - this.lastPos.x, pz - this.lastPos.y);
    if (movedDist < 0.5 * dt) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
    }
    this.lastPos.set(px, pz);

    if (this.stuckTimer > 1.2) {
      // Emergency turn — keep avoidance bias consistent (flip only here)
      this._avoidDir *= -1;
      this.targetHeading += this._avoidDir * (Math.PI * 0.6 + Math.random() * 0.6);
      this.stuckTimer = 0;
      this.headingChangeTimer = 3.0;
      this.crossingBridge = false;
      this.targetBridgeZ = null;
    }

    // ── Consolidation / circling detection (1 Hz samples) ────────────────
    this._sampleTimer += dt;
    if (this._sampleTimer >= this._SAMPLE_INTERVAL) {
      this._sampleTimer -= this._SAMPLE_INTERVAL;
      this._posHistory.push({ x: px, z: pz });
      if (this._posHistory.length > this._HISTORY_LEN) {
        this._posHistory.shift();
      }
      if (this._posHistory.length === this._HISTORY_LEN) {
        const oldest = this._posHistory[0];
        const netDist = Math.hypot(px - oldest.x, pz - oldest.z);
        // At a calm walk (~2.3 u/s) we expect ~9 u over 4 s.
        // If net displacement is less than 20% of that, we are circling.
        const minExpected = 2.3 * (this._SAMPLE_INTERVAL * this._HISTORY_LEN) * 0.20;
        if (netDist < minExpected) {
          // Bold heading change to escape the loop
          this.targetHeading += Math.PI * (0.5 + Math.random() * 0.75);
          this.headingChangeTimer = 4.0;
          this._posHistory = [];
          this.crossingBridge = false;
          this.targetBridgeZ = null;
        }
      }
    }

    // ── Sprint cycle (cinematic pace — very rare gentle jog only) ─────────
    if (this.sprintTimer <= 0) {
      this.isSprinting = Math.random() < 0.15; // 15% chance of a light jog
      this.sprintTimer = this.isSprinting ? 2 + Math.random() * 2 : 6 + Math.random() * 6;
    }

    // ── Bridge crossing decision ──────────────────────────────────────────
    const dRiver = riverDist(px, pz);
    if (!this.crossingBridge && this.bridgeCooldown <= 0 && dRiver < 18) {
      // Pick nearest bridge
      let bestDist = Infinity;
      let chosenBridge = null;
      for (const bz of BRIDGES) {
        const bx = riverXAt(bz);
        const d = Math.hypot(px - bx, pz - bz);
        if (d < bestDist && d < 35) {
          bestDist = d;
          chosenBridge = bz;
        }
      }
      if (chosenBridge !== null) {
        this.crossingBridge = true;
        this.targetBridgeZ = chosenBridge;
      }
    }

    if (this.crossingBridge && this.targetBridgeZ !== null) {
      const bx = riverXAt(this.targetBridgeZ);
      const bz = this.targetBridgeZ;
      const dx = bx - px;
      const dz = bz - pz;
      const distToBridge = Math.hypot(dx, dz);

      if (distToBridge > 1.4) {
        // Steer towards bridge entrance
        this.targetHeading = Math.atan2(dx, dz);
      } else {
        // Cross across bridge towards other bank
        const onBridge = isOnBridge(px, pz);
        if (onBridge) {
          // Walk across x direction
          const sign = px < bx ? 1 : -1;
          this.targetHeading = Math.atan2(sign, 0);
        } else if (distToBridge > 4.5 && dRiver > RIVER_HALF + 2) {
          // Successfully crossed to other side
          this.crossingBridge = false;
          this.targetBridgeZ = null;
          this.bridgeCooldown = 25 + Math.random() * 15;
        }
      }
    } else {
      // ── Normal wander steering ──────────────────────────────────────────
      if (this.headingChangeTimer <= 0) {
        this.headingChangeTimer = 3.0 + Math.random() * 4.0;
        // Gentle drift: at most ±45° per wander step to avoid tight loops
        this.targetHeading += (Math.random() - 0.5) * (Math.PI / 2);
      }

      // River avoidance
      if (dRiver < RIVER_HALF + 3.5 && !isOnBridge(px, pz)) {
        const rx = riverXAt(pz);
        const awayFromRiver = px > rx ? 1 : -1;
        this.targetHeading = Math.atan2(awayFromRiver * 2, Math.cos(this.currentHeading));
        this.headingChangeTimer = 2.0;
      }

      // ── Obstacle lookahead probe (spatial hash: O(nearby)) ─────────────
      const lookDist = 3.0;
      const probeX = px + Math.sin(this.targetHeading) * lookDist;
      const probeZ = pz + Math.cos(this.targetHeading) * lookDist;

      const hit = isObstacleNear(probeX, probeZ, 1.5);
      if (hit) {
        // Choose / maintain avoidance bias direction so we don't oscillate
        if (this._avoidBiasTimer <= 0) {
          // 70% chance to keep current bias, 30% to flip it
          this._avoidDir = Math.random() < 0.7 ? this._avoidDir : -this._avoidDir;
          this._avoidBiasTimer = 3.0;
        }
        const awayAngle = Math.atan2(px - hit.x, pz - hit.z);
        this.targetHeading = awayAngle + this._avoidDir * (0.7 + Math.random() * 0.4);
        this.headingChangeTimer = 1.5;
      }
    }

    // ── Smooth heading interpolation ──────────────────────────────────────
    let diff = this.targetHeading - this.currentHeading;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    // Rate 2.5 (was 4.0) → more organic, gradual turns
    this.currentHeading += diff * Math.min(1, dt * 2.5);

    // ── Camera-relative ix / iz inputs ───────────────────────────────────
    // Speed dial: 0.50 = calm walk (~2.3 u/s), 0.65 = light jog (~3 u/s).
    // sprint flag is never set — we rely solely on the speed dial magnitude
    // so the walk multiplier (0.35 + 0.65 * inputMag) stays in a gentle range.
    const speedFraction = this.isSprinting ? 0.65 : 0.50;

    const az = this.core.state.azimuth;
    const worldMoveX = Math.sin(this.currentHeading);
    const worldMoveZ = Math.cos(this.currentHeading);

    this.simulatedInput.ix = (worldMoveX * Math.sin(az) - worldMoveZ * Math.cos(az)) * speedFraction;
    this.simulatedInput.iz = (worldMoveX * Math.cos(az) + worldMoveZ * Math.sin(az)) * speedFraction;
    this.simulatedInput.sprint = false; // never trigger the 1.6× sprint multiplier

    // ── Cinematic camera: gentle slow orbit ──────────────────────────────
    this.camOrbitTimer += dt;
    if (this.camOrbitTimer > 14) {
      if (Math.random() < 0.3) this.camOrbitDir *= -1;
      this.camOrbitTimer = 0;
    }
    this.core.state.azimuth += dt * 0.03 * this.camOrbitDir;
  }
}
