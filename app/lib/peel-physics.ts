import { clamp } from "./utils";

// --- Adhesive Resistance Curve ---

const BREAK_POINT = 0.12;
const STEEPNESS = 8;
const END_RESIST = 0.15;

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Non-linear mapping from finger displacement (0-1) to peel amount (0-1).
 * Phase 1 (0-12%): High resistance — adhesive bond holding
 * Phase 2 (12-75%): Free peeling — near-linear after the "break"
 * Phase 3 (75-100%): Slight re-stiffening — surface tension at separation
 */
export function adhesiveCurve(t: number): number {
  const clamped = clamp(t, 0, 1);
  const normalized =
    (sigmoid((clamped - BREAK_POINT) * STEEPNESS) - sigmoid(-BREAK_POINT * STEEPNESS)) /
    (sigmoid((1 - BREAK_POINT) * STEEPNESS) - sigmoid(-BREAK_POINT * STEEPNESS));
  return normalized * (1 - END_RESIST * clamped * clamped);
}

// --- Velocity Tracker ---

interface PointerSample {
  x: number;
  y: number;
  t: number;
}

const MAX_SAMPLES = 6;
const MAX_AGE_MS = 100;

export interface VelocityResult {
  vx: number;
  vy: number;
  speed: number;
}

export class VelocityTracker {
  private samples: PointerSample[] = [];

  push(x: number, y: number): void {
    const now = performance.now();
    this.samples.push({ x, y, t: now });
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }
  }

  get(): VelocityResult {
    const now = performance.now();
    // Filter to recent samples
    const recent = this.samples.filter((s) => now - s.t < MAX_AGE_MS);
    if (recent.length < 2) return { vx: 0, vy: 0, speed: 0 };

    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = last.t - first.t;
    if (dt < 1) return { vx: 0, vy: 0, speed: 0 };

    const vx = (last.x - first.x) / dt;
    const vy = (last.y - first.y) / dt;
    return { vx, vy, speed: Math.sqrt(vx * vx + vy * vy) };
  }

  reset(): void {
    this.samples = [];
  }
}

// --- Gesture Detection ---

const DEAD_ZONE = 12; // px before classifying gesture
const PEEL_ANGLE_TOLERANCE = Math.PI / 3; // 60 degrees

export type GestureMode = "pending" | "peel" | "reposition";

export function classifyGesture(
  dx: number,
  dy: number,
  peelAngle: number,
): GestureMode {
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < DEAD_ZONE) return "pending";

  const dragAngle = Math.atan2(-dy, dx); // -dy because screen Y is inverted
  let diff = Math.abs(dragAngle - peelAngle);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;

  return diff < PEEL_ANGLE_TOLERANCE ? "peel" : "reposition";
}

// --- Corner Detection ---

export type PeelCorner =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left";

/**
 * Detect which corner the user grabbed based on pointer position
 * relative to sticker center. Returns the corner and the peel direction angle.
 */
export function detectCorner(
  pointerX: number,
  pointerY: number,
  centerX: number,
  centerY: number,
): { corner: PeelCorner; peelAngle: number } {
  const dx = pointerX - centerX;
  const dy = pointerY - centerY;

  if (dx >= 0 && dy <= 0) {
    return { corner: "top-right", peelAngle: (3 * Math.PI) / 4 }; // peel toward bottom-left
  } else if (dx < 0 && dy <= 0) {
    return { corner: "top-left", peelAngle: Math.PI / 4 }; // peel toward bottom-right
  } else if (dx >= 0 && dy > 0) {
    return { corner: "bottom-right", peelAngle: (-3 * Math.PI) / 4 };
  } else {
    return { corner: "bottom-left", peelAngle: -Math.PI / 4 };
  }
}

// --- Peel Direction (CSS 3D strip approach) ---

export interface PeelDirection {
  corner: PeelCorner;
  sweepSign: number; // +1 = fold sweeps top→bottom, -1 = bottom→top
  originY: "top" | "bottom";
}

/**
 * Convert a peel corner to strip peel direction parameters.
 * Top corners: peel folds downward (sweepSign +1, strips anchor at bottom).
 * Bottom corners: peel folds upward (sweepSign -1, strips anchor at top).
 */
export function cornerToPeelDirection(corner: PeelCorner): PeelDirection {
  switch (corner) {
    case "top-right":
    case "top-left":
      return { corner, sweepSign: 1, originY: "bottom" };
    case "bottom-right":
    case "bottom-left":
      return { corner, sweepSign: -1, originY: "top" };
  }
}

// --- Continuous Drag Angle ---

const ANGLE_DEADZONE = 5; // px before reporting an angle
export const DEFAULT_DRAG_ANGLE = Math.PI / 2; // downward

/**
 * Compute drag angle from displacement with a deadzone.
 * Returns the drag angle, or fallback if within deadzone.
 */
export function continuousDragAngle(
  dx: number,
  dy: number,
  fallback: number = DEFAULT_DRAG_ANGLE,
): number {
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < ANGLE_DEADZONE) return fallback;
  return Math.atan2(dy, dx);
}
