import { clamp } from "./utils";

// --- Adhesive Resistance Curve ---

const BREAK_POINT = 0.08;
const STEEPNESS = 10;
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
export const DEFAULT_DRAG_ANGLE = (3 * Math.PI) / 4; // diagonal — peels from top-right corner

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

/**
 * Lerp between two angles along the shortest arc.
 */
export function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return from + diff * t;
}

// --- Dynamic Fold-Line Geometry ---
// Computes clip-path polygons for arbitrary-angle fold lines.
// The sticker image stays perfectly still — only the clip shapes change.

export interface Vec2 {
  x: number;
  y: number;
}

export interface FoldResult {
  mainClip: string;   // CSS polygon() for the un-peeled part
  flapClip: string;   // CSS polygon() for the peeled flap
  flapTransform: string; // CSS transform to reflect flap across fold line
  shadowPos: Vec2;    // center point of fold line on sticker
  shadowAngle: number; // angle of fold line in degrees
  foldLength: number; // actual length of fold line within sticker bounds
}

/**
 * Signed distance from point to fold line.
 * Fold line: nx*(x - px) + ny*(y - py) = 0
 * Positive = drag side (peeled), Negative = stuck side.
 */
function signedDist(pt: Vec2, foldPt: Vec2, nx: number, ny: number): number {
  return nx * (pt.x - foldPt.x) + ny * (pt.y - foldPt.y);
}

/**
 * Intersection of segment (a→b) with fold line.
 * Returns the parameter t where the crossing happens.
 */
function segIntersect(a: Vec2, b: Vec2, foldPt: Vec2, nx: number, ny: number): Vec2 {
  const da = signedDist(a, foldPt, nx, ny);
  const db = signedDist(b, foldPt, nx, ny);
  const t = da / (da - db);
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/**
 * Sutherland–Hodgman clip: keep the side where signedDist <= 0 (stuck side)
 * or >= 0 (peeled side) depending on `keepPositive`.
 */
function clipPolygon(
  verts: Vec2[],
  foldPt: Vec2,
  nx: number,
  ny: number,
  keepPositive: boolean,
): Vec2[] {
  const out: Vec2[] = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const da = signedDist(a, foldPt, nx, ny);
    const db = signedDist(b, foldPt, nx, ny);
    const aInside = keepPositive ? da >= -0.001 : da <= 0.001;
    const bInside = keepPositive ? db >= -0.001 : db <= 0.001;

    if (aInside && bInside) {
      out.push(b);
    } else if (aInside && !bInside) {
      out.push(segIntersect(a, b, foldPt, nx, ny));
    } else if (!aInside && bInside) {
      out.push(segIntersect(a, b, foldPt, nx, ny));
      out.push(b);
    }
  }
  return out;
}

function polyToClipPath(verts: Vec2[], w: number, h: number): string {
  if (verts.length < 3) return "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";
  const pts = verts.map(
    (v) => `${((v.x / w) * 100).toFixed(2)}% ${((v.y / h) * 100).toFixed(2)}%`,
  );
  return `polygon(${pts.join(", ")})`;
}

/**
 * Compute fold line geometry for a given drag angle and peel amount.
 *
 * @param angle - drag angle in radians (from atan2(dy, dx))
 * @param peel - peel amount 0..1
 * @param w - sticker width in px
 * @param h - sticker height in px
 * @returns FoldResult with clip paths and flap transform
 */
export function computeFold(angle: number, peel: number, w: number, h: number): FoldResult {
  // Fold normal points OPPOSITE to drag direction
  const nx = -Math.cos(angle);
  const ny = -Math.sin(angle);

  // Compute how far the fold line sweeps across the sticker.
  // Project all 4 corners onto the fold normal to find min/max.
  const corners: Vec2[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const projections = corners.map((c) => nx * c.x + ny * c.y);
  const dMin = Math.min(...projections);
  const dMax = Math.max(...projections);

  // D sweeps from dMax (fold at drag-origin edge, peel=0) toward dMin (fully peeled)
  const D = dMax - peel * (dMax - dMin);

  // Fold point: closest point on fold line to coordinate origin
  const foldPt: Vec2 = { x: nx * D, y: ny * D };

  // Clip sticker rectangle into two halves
  const mainVerts = clipPolygon(corners, foldPt, nx, ny, false); // stuck side (d <= 0)
  const flapVerts = clipPolygon(corners, foldPt, nx, ny, true);  // peeled side (d > 0)

  const mainClip = polyToClipPath(mainVerts, w, h);
  const flapClip = polyToClipPath(flapVerts, w, h);

  // Reflection transform: reflect across the fold line
  // CSS matrix(a, b, c, d, tx, ty) with transformOrigin "0 0"
  const a = 2 * ny * ny - 1;
  const b = -2 * nx * ny;
  const d2 = 2 * nx * nx - 1;
  // Translation: T = foldPt - M * foldPt
  const tx = foldPt.x - (a * foldPt.x + b * foldPt.y);
  const ty = foldPt.y - (b * foldPt.x + d2 * foldPt.y);

  const flapTransform = `matrix(${a.toFixed(6)}, ${b.toFixed(6)}, ${b.toFixed(6)}, ${d2.toFixed(6)}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`;

  // Shadow position: project sticker center onto the fold line
  const cx = w / 2;
  const cy = h / 2;
  const sd = signedDist({ x: cx, y: cy }, foldPt, nx, ny);
  const shadowPos: Vec2 = { x: cx - sd * nx, y: cy - sd * ny };

  // Shadow angle: perpendicular to fold normal (the fold line direction)
  const shadowAngle = (Math.atan2(nx, -ny) * 180) / Math.PI;

  // Fold line length — find where the fold line crosses the sticker rectangle
  const edges: [Vec2, Vec2][] = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];
  const foldEnds: Vec2[] = [];
  for (const [ea, eb] of edges) {
    const da = signedDist(ea, foldPt, nx, ny);
    const db = signedDist(eb, foldPt, nx, ny);
    if ((da > 0.001 && db < -0.001) || (da < -0.001 && db > 0.001)) {
      foldEnds.push(segIntersect(ea, eb, foldPt, nx, ny));
    }
  }
  const foldLength = foldEnds.length >= 2
    ? Math.sqrt((foldEnds[1].x - foldEnds[0].x) ** 2 + (foldEnds[1].y - foldEnds[0].y) ** 2)
    : 0;

  return { mainClip, flapClip, flapTransform, shadowPos, shadowAngle, foldLength };
}
