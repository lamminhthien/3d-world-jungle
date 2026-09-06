import * as THREE from 'three';
import { riverDist, isOnBridge, obstacles } from '../utils.js';
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
 * - Sprinting spurts across open plains
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

    // Obstacle avoidance memory
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector2(0, 0);

    // Camera auto-orbit
    this.camOrbitTimer = 0;
    this.camOrbitDir = 1;
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
    }
  }

  update(dt) {
    if (!this.enabled || !this.player) return;

    this.headingChangeTimer -= dt;
    this.sprintTimer -= dt;
    this.bridgeCooldown -= dt;

    // Check if player is stuck (e.g. wedged against geometry)
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const movedDist = Math.hypot(px - this.lastPos.x, pz - this.lastPos.y);
    if (movedDist < 0.2 * dt) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
    }
    this.lastPos.set(px, pz);

    if (this.stuckTimer > 0.8) {
      // Emergency turn around
      this.targetHeading += Math.PI * 0.75 + (Math.random() - 0.5);
      this.stuckTimer = 0;
      this.headingChangeTimer = 3.0;
      this.crossingBridge = false;
      this.targetBridgeZ = null;
    }

    // Sprint cycle: alternate between relaxed walking (4-8s) and sprint spurts (2-4s)
    if (this.sprintTimer <= 0) {
      this.isSprinting = !this.isSprinting && Math.random() < 0.35;
      this.sprintTimer = this.isSprinting ? 2.5 + Math.random() * 2 : 4 + Math.random() * 4;
    }

    // Bridge crossing decision
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
      // Normal wander steering
      if (this.headingChangeTimer <= 0) {
        this.headingChangeTimer = 2.5 + Math.random() * 3.5;
        // Subtle drift in direction (-60 deg to +60 deg)
        this.targetHeading += (Math.random() - 0.5) * 1.5;
      }

      // Avoid river if we are not on a bridge and not seeking one
      if (dRiver < RIVER_HALF + 3.2 && !isOnBridge(px, pz)) {
        // Turn away from river center
        const rx = riverXAt(pz);
        const awayFromRiver = px > rx ? 1 : -1;
        // Steer away on x, keep some forward z motion
        this.targetHeading = Math.atan2(awayFromRiver * 2, Math.cos(this.currentHeading));
        this.headingChangeTimer = 2.0;
      }

      // Proactive obstacle avoidance (lookahead probe)
      const lookDist = this.isSprinting ? 3.5 : 2.5;
      const probeX = px + Math.sin(this.targetHeading) * lookDist;
      const probeZ = pz + Math.cos(this.targetHeading) * lookDist;

      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        const odx = probeX - o.x;
        const odz = probeZ - o.z;
        const clearance = o.r + 1.2;
        if (odx * odx + odz * odz < clearance * clearance) {
          // Obstacle ahead! Steer away
          const awayAngle = Math.atan2(px - o.x, pz - o.z);
          this.targetHeading = awayAngle + (Math.random() > 0.5 ? 0.8 : -0.8);
          this.headingChangeTimer = 1.5;
          break;
        }
      }
    }

    // Smoothly interpolate current heading towards target heading
    let diff = this.targetHeading - this.currentHeading;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.currentHeading += diff * Math.min(1, dt * 4.0);

    // Convert world-space desired heading into camera-relative ix / iz inputs
    // In update(dt):
    // _move = fwd * (-iz) + right * ix
    // fwd = (-cos az, 0, -sin az)
    // right = (sin az, 0, -cos az)
    // Desired world velocity = [sin(currentHeading), cos(currentHeading)]
    // Solving:
    // ix = sin(currentHeading) * sin(az) - cos(currentHeading) * cos(az)
    // iz = sin(currentHeading) * cos(az) + cos(currentHeading) * sin(az)
    const az = this.core.state.azimuth;
    const worldMoveX = Math.sin(this.currentHeading);
    const worldMoveZ = Math.cos(this.currentHeading);

    this.simulatedInput.ix = worldMoveX * Math.sin(az) - worldMoveZ * Math.cos(az);
    this.simulatedInput.iz = worldMoveX * Math.cos(az) + worldMoveZ * Math.sin(az);
    this.simulatedInput.sprint = this.isSprinting;

    // Cinematic camera behavior: gentle slow orbit
    this.camOrbitTimer += dt;
    if (this.camOrbitTimer > 12) {
      if (Math.random() < 0.3) {
        this.camOrbitDir *= -1;
      }
      this.camOrbitTimer = 0;
    }
    this.core.state.azimuth += dt * 0.045 * this.camOrbitDir;
  }
}
