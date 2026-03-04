"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useWebHaptics } from "web-haptics/react";
import { clamp } from "../lib/utils";
import {
  stepSpring,
  SPRING_SNAP_BACK,
  SPRING_SNAP_FORWARD,
  type SpringState,
} from "../lib/spring";
import {
  adhesiveCurve,
  VelocityTracker,
  computeFoldLine,
  clipPolygon,
  continuousDragAngle,
  DEFAULT_DRAG_ANGLE,
  vec2,
  type Vec2,
} from "../lib/peel-physics";
import { burst } from "../lib/emoji-burst";
import type { StickerSize } from "../lib/pricing";

interface StickerPeelPreviewProps {
  imageUrl: string;
  size?: StickerSize;
  bgColor?: string;
  onSnap?: () => void;
}

const REST_PEEL = 0.08;
const SNAP_THRESHOLD = 0.56;
const P = 12; // px — clip-path bleed so SVG stroke filter isn't clipped

// Size in inches → display pixels
const SIZE_TO_PX: Record<string, number> = {
  "2x2": 150,
  "3x3": 210,
  "4x4": 270,
  "5x5": 330,
};

function getStickerDisplaySize(size: string): number {
  return SIZE_TO_PX[size] ?? 210;
}

function getStrokeWidth(displaySize: number): number {
  return Math.max(3, Math.round(displaySize * 0.025));
}

function getDragRange(displaySize: number): number {
  return Math.max(180, displaySize * 1.2);
}

/** Convert a polygon (Vec2[]) to a CSS clip-path polygon string using px units */
function polyToClipPath(poly: Vec2[]): string {
  if (poly.length === 0) return "polygon(0 0)";
  return `polygon(${poly.map((p) => `${p.x}px ${p.y}px`).join(", ")})`;
}

/** Build the extended sticker rectangle (with bleed) for polygon clipping */
function stickerRect(w: number, h: number): Vec2[] {
  return [
    vec2(-P, -P),
    vec2(w + P, -P),
    vec2(w + P, h + P),
    vec2(-P, h + P),
  ];
}

export function StickerPeelPreview({
  imageUrl,
  size = "3x3",
  bgColor,
  onSnap,
}: StickerPeelPreviewProps) {
  const uid = useId().replace(/:/g, "");
  const displaySize = getStickerDisplaySize(size);
  const strokeW = getStrokeWidth(displaySize);
  const dragRange = getDragRange(displaySize);

  // DOM refs
  const containerRef = useRef<HTMLDivElement>(null);
  const stickerMainRef = useRef<HTMLDivElement>(null);
  const flapRef = useRef<HTMLDivElement>(null);
  const foldShadowRef = useRef<HTMLDivElement>(null);

  // Interaction refs
  const peelRef = useRef(REST_PEEL);
  const angleRef = useRef(DEFAULT_DRAG_ANGLE);
  const activePointerRef = useRef<number | null>(null);
  const velocityTracker = useRef(new VelocityTracker());
  const snappedRef = useRef(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number } | null>(
    null,
  );

  // Spring state
  const peelSpring = useRef<SpringState>({ value: REST_PEEL, velocity: 0 });
  const animatingRef = useRef(false);
  const springConfigRef = useRef(SPRING_SNAP_BACK);

  const [isActive, setIsActive] = useState(false);

  // Haptic refs
  const firstPeelRef = useRef(false);
  const lastMicroRef = useRef(0);
  const adhesiveBreakRef = useRef(false);

  const debugHaptics = process.env.NEXT_PUBLIC_HAPTICS_DEBUG === "1";
  const { trigger, isSupported } = useWebHaptics({ debug: debugHaptics });

  const safeHaptic = useCallback(
    (pattern: string | number[]) => {
      if (!isSupported) return;
      try {
        trigger(pattern as never);
      } catch {
        /* silent */
      }
    },
    [isSupported, trigger],
  );

  // --- Burst position helper ---
  const getBurstPos = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect)
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height * peelRef.current,
    };
  }, []);

  // --- Apply peel state to DOM (ref-driven, zero rerenders) ---

  const applyPeelToDOM = useCallback(() => {
    const peel = peelRef.current;
    const angle = angleRef.current;
    const w = displaySize;
    const h = displaySize;

    const fold = computeFoldLine(angle, peel, w, h);
    const rect = stickerRect(w, h);
    const { main, flap } = clipPolygon(rect, fold);
    const foldAngleDeg = (fold.angle * 180) / Math.PI;

    // Main sticker: visible un-peeled region
    if (stickerMainRef.current) {
      stickerMainRef.current.style.clipPath = polyToClipPath(main);
    }

    // Flap: peeled region, reflected across fold line via CSS transform
    if (flapRef.current) {
      flapRef.current.style.clipPath = polyToClipPath(flap);
      flapRef.current.style.top = "0";
      flapRef.current.style.transformOrigin = `${fold.point.x}px ${fold.point.y}px`;
      flapRef.current.style.transform = `rotate(${-foldAngleDeg}deg) scaleY(-1) rotate(${foldAngleDeg}deg)`;
    }

    // Fold shadow at fold line, rotated to match
    if (foldShadowRef.current) {
      foldShadowRef.current.style.left = `${fold.point.x}px`;
      foldShadowRef.current.style.top = `${fold.point.y}px`;
      foldShadowRef.current.style.transform = `translate(-50%, -50%) rotate(${foldAngleDeg}deg)`;
      foldShadowRef.current.style.opacity = String(
        peel > 0.02 ? clamp(peel * 2, 0, 0.6) : 0,
      );
    }
  }, [displaySize]);

  // Reset on image/size change
  useEffect(() => {
    peelRef.current = REST_PEEL;
    angleRef.current = DEFAULT_DRAG_ANGLE;
    peelSpring.current = { value: REST_PEEL, velocity: 0 };
    snappedRef.current = false;
    firstPeelRef.current = false;
    requestAnimationFrame(() => applyPeelToDOM());
  }, [applyPeelToDOM, imageUrl, size]);

  // --- Spring Animation Loop ---

  const runSpringAnimation = useCallback(
    (targetPeel: number, config: typeof SPRING_SNAP_BACK) => {
      if (animatingRef.current) return;
      animatingRef.current = true;
      springConfigRef.current = config;

      peelSpring.current = {
        value: peelRef.current,
        velocity: peelSpring.current.velocity,
      };

      let lastTime = performance.now();
      let lastBounceSign = 0;

      const tick = (now: number) => {
        const dt = Math.min((now - lastTime) / 1000, 0.033);
        lastTime = now;

        const peelResult = stepSpring(
          peelSpring.current,
          targetPeel,
          springConfigRef.current,
          dt,
        );
        peelSpring.current = {
          value: peelResult.value,
          velocity: peelResult.velocity,
        };
        peelRef.current = clamp(peelResult.value, 0, 1);

        applyPeelToDOM();

        // Bounce haptics + sparkle
        const bounceSign = Math.sign(peelResult.velocity);
        if (
          bounceSign !== 0 &&
          bounceSign !== lastBounceSign &&
          Math.abs(peelResult.velocity) > 0.08
        ) {
          const intensity = Math.min(
            20,
            Math.round(Math.abs(peelResult.velocity) * 15),
          );
          if (intensity > 3) {
            safeHaptic([intensity]);
            if (intensity > 8) {
              const pos = getBurstPos();
              burst(pos.x, pos.y, ["✨", "💫"], 2);
            }
          }
        }
        lastBounceSign = bounceSign;

        if (peelResult.atRest || !animatingRef.current) {
          animatingRef.current = false;
          // Reset angle to default when spring settles
          angleRef.current = DEFAULT_DRAG_ANGLE;
          applyPeelToDOM();
          return;
        }

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    },
    [safeHaptic, applyPeelToDOM, getBurstPos],
  );

  // --- Pointer Handlers ---

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (activePointerRef.current !== null) return;

      activePointerRef.current = event.pointerId;
      animatingRef.current = false;
      snappedRef.current = false;
      adhesiveBreakRef.current = false;
      velocityTracker.current.reset();

      dragStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };

      event.currentTarget.setPointerCapture(event.pointerId);
      setIsActive(true);

      if (!firstPeelRef.current) {
        firstPeelRef.current = true;
        safeHaptic("nudge");
      }
    },
    [safeHaptic],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        activePointerRef.current !== event.pointerId ||
        !dragStartRef.current
      )
        return;

      event.preventDefault();
      velocityTracker.current.push(event.clientX, event.clientY);

      const dx = event.clientX - dragStartRef.current.clientX;
      const dy = event.clientY - dragStartRef.current.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Update drag angle continuously (with small deadzone)
      angleRef.current = continuousDragAngle(dx, dy, angleRef.current);

      // Peel amount based on distance from start
      const rawDisplacement = clamp(dist / dragRange, 0, 1);
      const peelAmount = clamp(
        REST_PEEL + adhesiveCurve(rawDisplacement) * (1 - REST_PEEL),
        REST_PEEL,
        1,
      );
      peelRef.current = peelAmount;

      applyPeelToDOM();

      // --- Haptics ---
      if (!adhesiveBreakRef.current && peelAmount > 0.18) {
        adhesiveBreakRef.current = true;
        safeHaptic([35, 20, 20]);
        const pos = getBurstPos();
        burst(pos.x, pos.y, ["✨", "⚡️", "💫"], 4);
      }

      const vel = velocityTracker.current.get();
      const now = performance.now();

      if (
        dist > 5 &&
        now - lastMicroRef.current >
          Math.max(60, 200 - vel.speed * 120)
      ) {
        const intensity = Math.round(clamp(4 + vel.speed * 8, 4, 14));
        safeHaptic([intensity, 20, Math.round(intensity * 0.7)]);
        lastMicroRef.current = now;
      }

      if (peelAmount > 0.7 && now - lastMicroRef.current > 40) {
        const buzzIntensity = Math.round(((peelAmount - 0.7) / 0.3) * 8);
        if (buzzIntensity > 1) safeHaptic([buzzIntensity]);
        lastMicroRef.current = now;
      }
    },
    [safeHaptic, applyPeelToDOM, dragRange, getBurstPos],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      activePointerRef.current = null;
      const currentPeel = peelRef.current;
      const vel = velocityTracker.current.get();

      // Radial velocity: positive = peeling more, negative = returning
      let springVel = vel.speed * 0.8;
      if (dragStartRef.current) {
        const dx = event.clientX - dragStartRef.current.clientX;
        const dy = event.clientY - dragStartRef.current.clientY;
        const radialDot = vel.vx * dx + vel.vy * dy;
        if (radialDot < 0) springVel = -springVel;
      }
      peelSpring.current.velocity = springVel;

      dragStartRef.current = null;
      setIsActive(false);

      if (currentPeel > SNAP_THRESHOLD) {
        safeHaptic("success");
        snappedRef.current = true;
        const pos = getBurstPos();
        burst(pos.x, pos.y, ["🎉", "⭐️", "🥳", "✨", "🎊"], 8);
        runSpringAnimation(1.0, SPRING_SNAP_FORWARD);
        setTimeout(() => onSnap?.(), 120);
      } else {
        runSpringAnimation(REST_PEEL, SPRING_SNAP_BACK);
      }

      adhesiveBreakRef.current = false;
    },
    [safeHaptic, runSpringAnimation, onSnap, getBurstPos],
  );

  useEffect(() => {
    return () => {
      animatingRef.current = false;
    };
  }, []);

  const willChange = isActive ? "clip-path, transform" : "auto";

  // Pre-compute initial clip/transform values for first paint
  const initFold = computeFoldLine(
    DEFAULT_DRAG_ANGLE,
    REST_PEEL,
    displaySize,
    displaySize,
  );
  const initRect = stickerRect(displaySize, displaySize);
  const initClips = clipPolygon(initRect, initFold);
  const initMainClip = polyToClipPath(initClips.main);
  const initFlapClip = polyToClipPath(initClips.flap);
  const initFoldAngleDeg = (initFold.angle * 180) / Math.PI;

  // Fold shadow width: covers diagonal + bleed
  const shadowWidth = Math.ceil(displaySize * 1.5) + 2 * P;

  const imgStyle: React.CSSProperties = {
    width: displaySize,
    height: displaySize,
    objectFit: "contain",
    display: "block",
  };

  /* eslint-disable @next/next/no-img-element */
  return (
    <div
      className="panel relative h-[420px] w-full overflow-hidden p-4 sm:h-[480px] sm:p-5"
      style={{
        backgroundColor: bgColor ?? "#ffffff",
        transition: "background-color 0.6s ease",
      }}
    >
      <div
        ref={containerRef}
        className="relative flex h-full w-full items-center justify-center select-none"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div
          className="relative"
          style={{
            userSelect: "none",
            WebkitTouchCallout: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {/* SVG Filters — stroke + paper fill only (no specular, fast) */}
          <svg
            width="0"
            height="0"
            style={{ position: "absolute" }}
            aria-hidden
          >
            <defs>
              {/* White sticker stroke — dilates alpha outward, fills white */}
              <filter
                id={`stroke-${uid}`}
                x="-10%"
                y="-10%"
                width="120%"
                height="120%"
              >
                <feMorphology
                  operator="dilate"
                  radius={strokeW}
                  in="SourceAlpha"
                  result="expanded"
                />
                <feFlood floodColor="white" result="white" />
                <feComposite
                  operator="in"
                  in="white"
                  in2="expanded"
                  result="whiteStroke"
                />
                <feComposite
                  operator="over"
                  in="SourceGraphic"
                  in2="whiteStroke"
                />
              </filter>

              {/* Paper backing fill — matches stroke shape, warm paper color */}
              <filter
                id={`ef-${uid}`}
                x="-10%"
                y="-10%"
                width="120%"
                height="120%"
              >
                <feMorphology
                  operator="dilate"
                  radius={strokeW}
                  in="SourceAlpha"
                  result="shape"
                />
                <feFlood floodColor="#e8e4dd" result="flood" />
                <feComposite operator="in" in="flood" in2="shape" />
              </filter>
            </defs>
          </svg>

          {/* Main sticker (front face, clipped to un-peeled region) */}
          <div
            ref={stickerMainRef}
            style={{
              clipPath: initMainClip,
              filter: "drop-shadow(1px 3px 5px rgba(0,0,0,0.22))",
              willChange,
            }}
          >
            <img
              src={imageUrl}
              alt="Sticker preview"
              style={{
                ...imgStyle,
                filter: `url(#stroke-${uid})`,
              }}
              draggable={false}
              onContextMenu={(ev) => ev.preventDefault()}
            />
          </div>

          {/* Fold shadow — subtle crease at fold line */}
          <div
            ref={foldShadowRef}
            style={{
              position: "absolute",
              width: shadowWidth,
              height: 32,
              left: initFold.point.x,
              top: initFold.point.y,
              transform: `translate(-50%, -50%) rotate(${initFoldAngleDeg}deg)`,
              background:
                "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.08) 35%, rgba(0,0,0,0.05) 65%, transparent 100%)",
              pointerEvents: "none",
              zIndex: 2,
              opacity: REST_PEEL > 0.02 ? clamp(REST_PEEL * 2, 0, 0.6) : 0,
            }}
          />

          {/* Peeled flap (paper backing, reflected across fold line) */}
          <div
            ref={flapRef}
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              left: 0,
              top: 0,
              clipPath: initFlapClip,
              transformOrigin: `${initFold.point.x}px ${initFold.point.y}px`,
              transform: `rotate(${-initFoldAngleDeg}deg) scaleY(-1) rotate(${initFoldAngleDeg}deg)`,
              filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.1))",
              willChange,
            }}
          >
            <img
              src={imageUrl}
              alt=""
              style={{
                ...imgStyle,
                filter: `url(#ef-${uid})`,
              }}
              draggable={false}
            />
          </div>
        </div>
      </div>

      <p className="absolute bottom-3 left-0 w-full text-center text-[11px] uppercase tracking-[0.08em] text-muted">
        Drag to peel
      </p>
    </div>
  );
}
