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

// ============================================================
// Multi-Angle Peel — Vec2 math, fold line, polygon clipping
// ============================================================

export interface Vec2 {
  x: number;
  y: number;
}

export interface FoldLine {
  point: Vec2;   // a point on the fold line
  normal: Vec2;  // unit normal — points toward the "peeled" side
}

// --- Vec2 helpers ---

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

function len(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

function normalize(v: Vec2): Vec2 {
  const l = len(v);
  if (l < 1e-9) return { x: 0, y: -1 };
  return { x: v.x / l, y: v.y / l };
}

// --- Fold line computation ---

/**
 * Signed distance of point Q from fold line.
 * > 0 = on the "peeled" (flap) side
 * ≤ 0 = on the "main" sticker side
 */
export function signedDistance(q: Vec2, fold: FoldLine): number {
  return dot(sub(q, fold.point), fold.normal);
}

/**
 * Mirror a point across the fold line.
 */
export function mirrorPoint(q: Vec2, fold: FoldLine): Vec2 {
  const d = signedDistance(q, fold);
  return sub(q, scale(fold.normal, 2 * d));
}

/**
 * Compute the fold line for a given drag angle and peel amount.
 *
 * dragAngle: angle in radians the user is dragging (atan2(dy, dx))
 * peel: 0→1, how far the peel has progressed
 * w, h: sticker dimensions in pixels
 *
 * The fold line sweeps from the edge the user is dragging from
 * toward the opposite edge as peel increases.
 */
export function computeFoldLine(
  dragAngle: number,
  peel: number,
  w: number,
  h: number,
): FoldLine {
  // Fold normal opposes the drag direction
  const nx = -Math.cos(dragAngle);
  const ny = -Math.sin(dragAngle);
  const normal = normalize(vec2(nx, ny));

  // Compute how far the fold point should be along the drag axis.
  // At peel=0 the fold is at the edge; at peel=1 it's at the opposite edge.
  // The center of the sticker is (w/2, h/2).
  const cx = w / 2;
  const cy = h / 2;

  // Half-diagonal projected onto the drag direction gives max sweep distance
  // We compute it by finding the farthest corner in the drag direction
  const corners = [vec2(0, 0), vec2(w, 0), vec2(w, h), vec2(0, h)];
  const dragDir = vec2(Math.cos(dragAngle), Math.sin(dragAngle));

  let minProj = Infinity;
  let maxProj = -Infinity;
  for (const c of corners) {
    const proj = dot(sub(c, vec2(cx, cy)), dragDir);
    if (proj < minProj) minProj = proj;
    if (proj > maxProj) maxProj = proj;
  }

  // Fold point sweeps from the drag-origin edge (minProj) to opposite edge (maxProj)
  const sweepDist = minProj + peel * (maxProj - minProj);
  const point = add(vec2(cx, cy), scale(dragDir, sweepDist));

  return { point, normal };
}

// --- Polygon clipping against fold line ---

export interface ClipResult {
  main: Vec2[];  // un-peeled side (signedDistance ≤ 0)
  flap: Vec2[];  // peeled side (signedDistance > 0)
}

/**
 * Clip a convex polygon (the sticker rectangle) against the fold line.
 * Uses Sutherland-Hodgman on each side.
 *
 * Returns main (sticker face) and flap (peeled backing).
 * The flap vertices are NOT mirrored — caller mirrors them.
 */
export function clipPolygon(vertices: Vec2[], fold: FoldLine): ClipResult {
  const main: Vec2[] = [];
  const flap: Vec2[] = [];

  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];
    const dCurr = signedDistance(curr, fold);
    const dNext = signedDistance(next, fold);

    if (dCurr <= 0) {
      main.push(curr);
    } else {
      flap.push(curr);
    }

    // If the edge crosses the fold line, compute intersection
    if ((dCurr > 0) !== (dNext > 0)) {
      const t = dCurr / (dCurr - dNext);
      const ix = curr.x + t * (next.x - curr.x);
      const iy = curr.y + t * (next.y - curr.y);
      const intersection = vec2(ix, iy);
      main.push(intersection);
      flap.push(intersection);
    }
  }

  return { main, flap };
}

/**
 * Mirror an array of points across the fold line.
 */
export function mirrorPolygon(poly: Vec2[], fold: FoldLine): Vec2[] {
  return poly.map((p) => mirrorPoint(p, fold));
}

// --- Continuous angle tracking ---

const ANGLE_DEADZONE = 5; // px — ignore tiny jitter near zero displacement

/**
 * Compute continuous drag angle from displacement.
 * Below the deadzone, returns the fallback angle (avoids jitter at rest).
 */
export function continuousDragAngle(
  dx: number,
  dy: number,
  fallback: number,
): number {
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < ANGLE_DEADZONE) return fallback;
  return Math.atan2(dy, dx);
}

// Default drag angle: π/2 = downward (matching original top-down peel)
export const DEFAULT_DRAG_ANGLE = Math.PI / 2;
