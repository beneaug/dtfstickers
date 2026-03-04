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
  mirrorPolygon,
  continuousDragAngle,
  DEFAULT_DRAG_ANGLE,
  vec2,
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
const P = 12; // px — extra bleed for SVG stroke filter

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

/** Convert polygon vertices to CSS polygon() string */
function polyToClipPath(poly: { x: number; y: number }[], w: number, h: number): string {
  if (poly.length === 0) return "polygon(0% 0%, 0% 0%, 0% 0%)";
  const points = poly.map((p) => {
    const px = ((p.x + P) / (w + 2 * P)) * 100;
    const py = ((p.y + P) / (h + 2 * P)) * 100;
    return `${px.toFixed(2)}% ${py.toFixed(2)}%`;
  });
  return `polygon(${points.join(", ")})`;
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

  const stickerW = displaySize;
  const stickerH = displaySize;

  // DOM refs
  const containerRef = useRef<HTMLDivElement>(null);
  const stickerMainRef = useRef<HTMLDivElement>(null);
  const flapRef = useRef<HTMLDivElement>(null);
  const foldShadowRef = useRef<HTMLDivElement>(null);

  // Interaction refs
  const peelRef = useRef(REST_PEEL);
  const angleRef = useRef(DEFAULT_DRAG_ANGLE); // continuously updated
  const activePointerRef = useRef<number | null>(null);
  const velocityTracker = useRef(new VelocityTracker());
  const snappedRef = useRef(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number } | null>(null);

  // Spring state
  const peelSpring = useRef<SpringState>({ value: REST_PEEL, velocity: 0 });
  const animatingRef = useRef(false);
  const springConfigRef = useRef(SPRING_SNAP_BACK);
  const springAngleRef = useRef(DEFAULT_DRAG_ANGLE);

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
      } catch { /* silent */ }
    },
    [isSupported, trigger],
  );

  const getBurstPos = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect)
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height * peelRef.current,
    };
  }, []);

  // --- Apply peel state to DOM ---

  const applyPeelToDOM = useCallback(() => {
    const peel = peelRef.current;
    const angle = angleRef.current;

    const extCorners = [
      vec2(-P, -P),
      vec2(stickerW + P, -P),
      vec2(stickerW + P, stickerH + P),
      vec2(-P, stickerH + P),
    ];

    const fold = computeFoldLine(angle, peel, stickerW, stickerH);
    const { main, flap } = clipPolygon(extCorners, fold);

    if (stickerMainRef.current) {
      stickerMainRef.current.style.clipPath =
        main.length >= 3 ? polyToClipPath(main, stickerW, stickerH) : "none";
    }

    if (flapRef.current) {
      if (flap.length >= 3) {
        const mirrored = mirrorPolygon(flap, fold);
        flapRef.current.style.clipPath = polyToClipPath(mirrored, stickerW, stickerH);
        flapRef.current.style.transform = "none";
        flapRef.current.style.top = "0";
      } else {
        flapRef.current.style.clipPath = "polygon(0% 0%, 0% 0%, 0% 0%)";
      }
    }

    if (foldShadowRef.current) {
      const foldAngleDeg = (Math.atan2(fold.normal.y, fold.normal.x) * 180) / Math.PI + 90;
      const foldPctX = (fold.point.x / stickerW) * 100;
      const foldPctY = (fold.point.y / stickerH) * 100;
      foldShadowRef.current.style.left = `${foldPctX}%`;
      foldShadowRef.current.style.top = `${foldPctY}%`;
      foldShadowRef.current.style.transform = `translate(-50%, -50%) rotate(${foldAngleDeg}deg)`;
      foldShadowRef.current.style.opacity = String(
        peel > 0.02 ? clamp(peel * 2, 0, 0.6) : 0,
      );
    }
  }, [stickerW, stickerH]);

  // Reset on image/size change
  useEffect(() => {
    peelRef.current = REST_PEEL;
    angleRef.current = DEFAULT_DRAG_ANGLE;
    peelSpring.current = { value: REST_PEEL, velocity: 0 };
    snappedRef.current = false;
    firstPeelRef.current = false;
    requestAnimationFrame(() => applyPeelToDOM());
  }, [applyPeelToDOM, imageUrl, size]);

  // --- Spring Animation ---

  const runSpringAnimation = useCallback(
    (targetPeel: number, config: typeof SPRING_SNAP_BACK) => {
      if (animatingRef.current) return;
      animatingRef.current = true;
      springConfigRef.current = config;
      // Freeze angle for spring duration
      springAngleRef.current = angleRef.current;

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
        peelSpring.current = { value: peelResult.value, velocity: peelResult.velocity };
        peelRef.current = clamp(peelResult.value, 0, 1);
        angleRef.current = springAngleRef.current;

        applyPeelToDOM();

        // Bounce haptics
        const bounceSign = Math.sign(peelResult.velocity);
        if (bounceSign !== 0 && bounceSign !== lastBounceSign && Math.abs(peelResult.velocity) > 0.08) {
          const intensity = Math.min(20, Math.round(Math.abs(peelResult.velocity) * 15));
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
          if (targetPeel <= REST_PEEL + 0.01) {
            angleRef.current = DEFAULT_DRAG_ANGLE;
            requestAnimationFrame(() => applyPeelToDOM());
          }
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

      dragStartRef.current = { clientX: event.clientX, clientY: event.clientY };

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
      if (activePointerRef.current !== event.pointerId || !dragStartRef.current) return;

      event.preventDefault();
      velocityTracker.current.push(event.clientX, event.clientY);

      const dx = event.clientX - dragStartRef.current.clientX;
      const dy = event.clientY - dragStartRef.current.clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Continuously update angle — follows the finger in real-time
      angleRef.current = continuousDragAngle(dx, dy, angleRef.current);

      // Peel amount based on total distance from start
      const rawDisplacement = clamp(distance / dragRange, 0, 1);
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

      if (distance > 0 && now - lastMicroRef.current > Math.max(60, 200 - vel.speed * 120)) {
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
      dragStartRef.current = null;
      setIsActive(false);

      const currentPeel = peelRef.current;
      const vel = velocityTracker.current.get();

      // Project velocity onto current drag direction for spring
      const angle = angleRef.current;
      const projectedVel = vel.vx * Math.cos(angle) + vel.vy * Math.sin(angle);
      peelSpring.current.velocity = projectedVel * 0.8;

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
    return () => { animatingRef.current = false; };
  }, []);

  const willChange = isActive ? "clip-path, transform" : "auto";

  // Initial clip-paths (default downward peel at REST_PEEL)
  const initS = `${-P}px`;
  const initE = `calc(100% + ${P}px)`;
  const initFoldPct = `${REST_PEEL * 100}%`;
  const initMainClip = `polygon(${initS} ${initFoldPct}, ${initE} ${initFoldPct}, ${initE} ${initE}, ${initS} ${initE})`;
  const initFlapClip = `polygon(${initS} ${initS}, ${initE} ${initS}, ${initE} ${initFoldPct}, ${initS} ${initFoldPct})`;

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
          <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
            <defs>
              <filter id={`stroke-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
                <feMorphology operator="dilate" radius={strokeW} in="SourceAlpha" result="expanded" />
                <feFlood floodColor="white" result="white" />
                <feComposite operator="in" in="white" in2="expanded" result="whiteStroke" />
                <feComposite operator="over" in="SourceGraphic" in2="whiteStroke" />
              </filter>
              <filter id={`ef-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
                <feMorphology operator="dilate" radius={strokeW} in="SourceAlpha" result="shape" />
                <feFlood floodColor="#e8e4dd" result="flood" />
                <feComposite operator="in" in="flood" in2="shape" />
              </filter>
            </defs>
          </svg>

          {/* Main sticker */}
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
              style={{ ...imgStyle, filter: `url(#stroke-${uid})` }}
              draggable={false}
              onContextMenu={(ev) => ev.preventDefault()}
            />
          </div>

          {/* Fold shadow */}
          <div
            ref={foldShadowRef}
            style={{
              position: "absolute",
              width: displaySize + P * 2 + 40,
              height: 32,
              left: "50%",
              top: `${REST_PEEL * 100}%`,
              transform: "translate(-50%, -50%)",
              background:
                "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.08) 35%, rgba(0,0,0,0.05) 65%, transparent 100%)",
              pointerEvents: "none",
              zIndex: 2,
              opacity: REST_PEEL > 0.02 ? clamp(REST_PEEL * 2, 0, 0.6) : 0,
            }}
          />

          {/* Peeled flap */}
          <div
            ref={flapRef}
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              left: 0,
              top: 0,
              clipPath: initFlapClip,
              transform: "scaleY(-1)",
              filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.1))",
              willChange,
            }}
          >
            <img
              src={imageUrl}
              alt=""
              style={{ ...imgStyle, filter: `url(#ef-${uid})` }}
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
