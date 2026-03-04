"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
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
  continuousDragAngle,
  DEFAULT_DRAG_ANGLE,
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
const SNAP_FORWARD_TARGET = 0.85;
const P = 12;

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

  // Track natural image dimensions for aspect-ratio-aware sizing
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);

  const { displayW, displayH } = useMemo(() => {
    if (!imgDims) return { displayW: displaySize, displayH: displaySize };
    const aspect = imgDims.w / imgDims.h;
    if (aspect >= 1) {
      return { displayW: displaySize, displayH: Math.round(displaySize / aspect) };
    }
    return { displayW: Math.round(displaySize * aspect), displayH: displaySize };
  }, [imgDims, displaySize]);

  // DOM refs
  const containerRef = useRef<HTMLDivElement>(null);
  const stickerWrapperRef = useRef<HTMLDivElement>(null);
  const stickerMainRef = useRef<HTMLDivElement>(null);
  const flapRef = useRef<HTMLDivElement>(null);
  const foldShadowRef = useRef<HTMLDivElement>(null);

  // Interaction refs (zero React state during drag = zero re-renders)
  const peelRef = useRef(REST_PEEL);
  const angleRef = useRef(DEFAULT_DRAG_ANGLE);
  const activePointerRef = useRef<number | null>(null);
  const velocityTracker = useRef(new VelocityTracker());
  const snappedRef = useRef(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number } | null>(
    null,
  );
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafPendingRef = useRef(false);

  // Spring state
  const peelSpring = useRef<SpringState>({ value: REST_PEEL, velocity: 0 });
  const animatingRef = useRef(false);
  const springConfigRef = useRef(SPRING_SNAP_BACK);

  // Haptic + hint refs
  const firstPeelRef = useRef(false);
  const adhesiveBreakRef = useRef(false);
  const hintRef = useRef<HTMLParagraphElement>(null);

  const debugHaptics = process.env.NEXT_PUBLIC_HAPTICS_DEBUG === "1";
  const { trigger } = useWebHaptics({ debug: debugHaptics });

  const safeHaptic = useCallback(
    (pattern: string | number[]) => {
      try {
        trigger(pattern as never);
      } catch {
        /* silent */
      }
    },
    [trigger],
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

  // --- Apply peel to DOM (ref-driven, no React state, no filter recalc) ---
  // Wrapper rotates to follow drag direction (dynamic fold line).
  // Images do NOT counter-rotate — the sticker tilts naturally with the peel.
  // This avoids all non-square image coverage/clipping issues.

  const applyPeelToDOM = useCallback(() => {
    const peel = peelRef.current;
    const angle = angleRef.current;
    const rotation = angle - Math.PI / 2;

    const overflow = Math.abs(Math.sin(rotation)) * displaySize * 0.22;
    const currentP = P + Math.ceil(overflow);

    const foldPct = `${peel * 100}%`;
    const s = `${-currentP}px`;
    const e = `calc(100% + ${currentP}px)`;

    if (stickerMainRef.current) {
      stickerMainRef.current.style.clipPath =
        `polygon(${s} ${foldPct}, ${e} ${foldPct}, ${e} ${e}, ${s} ${e})`;
    }

    if (flapRef.current) {
      flapRef.current.style.clipPath =
        `polygon(${s} ${s}, ${e} ${s}, ${e} ${foldPct}, ${s} ${foldPct})`;
      flapRef.current.style.top = `${(2 * peel - 1) * 100}%`;
    }

    if (foldShadowRef.current) {
      foldShadowRef.current.style.top = `calc(${foldPct} - 16px)`;
      foldShadowRef.current.style.opacity = String(
        peel > 0.02 ? clamp(peel * 2, 0, 0.6) : 0,
      );
    }

    if (stickerWrapperRef.current) {
      stickerWrapperRef.current.style.transform = `rotate(${rotation}rad)`;
    }
  }, [displaySize]);

  // Reset on image/size change
  useEffect(() => {
    setImgDims(null);
    peelRef.current = REST_PEEL;
    angleRef.current = DEFAULT_DRAG_ANGLE;
    peelSpring.current = { value: REST_PEEL, velocity: 0 };
    snappedRef.current = false;
    firstPeelRef.current = false;
    requestAnimationFrame(() => applyPeelToDOM());
  }, [applyPeelToDOM, imageUrl, size]);

  // Re-apply peel when image dimensions are measured (aspect ratio change)
  useEffect(() => {
    if (imgDims) requestAnimationFrame(() => applyPeelToDOM());
  }, [imgDims, applyPeelToDOM]);

  // --- Spring Animation Loop ---

  const runSpringAnimation = useCallback(
    (
      targetPeel: number,
      config: typeof SPRING_SNAP_BACK,
      onSettle?: () => void,
    ) => {
      if (animatingRef.current) return;
      animatingRef.current = true;
      springConfigRef.current = config;

      peelSpring.current = {
        value: peelRef.current,
        velocity: peelSpring.current.velocity,
      };

      let lastTime = performance.now();

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

        if (peelResult.atRest || !animatingRef.current) {
          animatingRef.current = false;
          onSettle?.();
          return;
        }

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    },
    [applyPeelToDOM],
  );

  // --- Pointer Handlers ---

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (activePointerRef.current !== null) return;

      activePointerRef.current = event.pointerId;
      animatingRef.current = false;
      snappedRef.current = false;

      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }
      adhesiveBreakRef.current = false;
      velocityTracker.current.reset();

      dragStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };

      event.currentTarget.setPointerCapture(event.pointerId);

      if (!firstPeelRef.current) {
        firstPeelRef.current = true;
        safeHaptic("light");
        // Fade out the hint on first touch
        if (hintRef.current) {
          hintRef.current.classList.remove("peel-hint");
          hintRef.current.classList.add("peel-hint-hidden");
        }
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

      angleRef.current = continuousDragAngle(dx, dy, angleRef.current);

      const rawDisplacement = clamp(dist / dragRange, 0, 1);
      const peelAmount = clamp(
        REST_PEEL + adhesiveCurve(rawDisplacement) * (1 - REST_PEEL),
        REST_PEEL,
        1,
      );
      peelRef.current = peelAmount;

      // RAF-throttled DOM update — never apply faster than display refresh
      if (!rafPendingRef.current) {
        rafPendingRef.current = true;
        requestAnimationFrame(() => {
          rafPendingRef.current = false;
          applyPeelToDOM();
        });
      }

      // Haptics — only at key moments, not continuous
      if (!adhesiveBreakRef.current && peelAmount > 0.18) {
        adhesiveBreakRef.current = true;
        safeHaptic("medium");
      }
    },
    [safeHaptic, applyPeelToDOM, dragRange],
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

      let springVel = vel.speed * 0.8;
      if (dragStartRef.current) {
        const dx = event.clientX - dragStartRef.current.clientX;
        const dy = event.clientY - dragStartRef.current.clientY;
        const radialDot = vel.vx * dx + vel.vy * dy;
        if (radialDot < 0) springVel = -springVel;
      }
      peelSpring.current.velocity = springVel;

      dragStartRef.current = null;

      if (currentPeel > SNAP_THRESHOLD) {
        safeHaptic("success");
        snappedRef.current = true;
        const pos = getBurstPos();
        burst(pos.x, pos.y, ["🎉", "⭐️", "🥳", "✨", "🎊"], 8);
        runSpringAnimation(SNAP_FORWARD_TARGET, SPRING_SNAP_FORWARD, () => {
          resetTimeoutRef.current = setTimeout(() => {
            resetTimeoutRef.current = null;
            angleRef.current = DEFAULT_DRAG_ANGLE;
            applyPeelToDOM();
            runSpringAnimation(REST_PEEL, SPRING_SNAP_BACK);
          }, 600);
        });
        setTimeout(() => onSnap?.(), 120);
      } else {
        safeHaptic("light");
        runSpringAnimation(REST_PEEL, SPRING_SNAP_BACK, () => {
          angleRef.current = DEFAULT_DRAG_ANGLE;
          applyPeelToDOM();
        });
      }

      adhesiveBreakRef.current = false;
    },
    [safeHaptic, runSpringAnimation, onSnap, getBurstPos, applyPeelToDOM],
  );

  useEffect(() => {
    return () => {
      animatingRef.current = false;
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  // Pre-compute initial clip values for first paint
  const initFoldPct = `${REST_PEEL * 100}%`;
  const s = `${-P}px`;
  const e = `calc(100% + ${P}px)`;
  const initMainClip = `polygon(${s} ${initFoldPct}, ${e} ${initFoldPct}, ${e} ${e}, ${s} ${e})`;
  const initFlapClip = `polygon(${s} ${s}, ${e} ${s}, ${e} ${initFoldPct}, ${s} ${initFoldPct})`;
  const initFlapTop = `${(2 * REST_PEEL - 1) * 100}%`;

  const imgStyle: React.CSSProperties = {
    width: displayW,
    height: displayH,
    display: "block",
  };

  /* eslint-disable @next/next/no-img-element */
  return (
    <div
      className="panel relative h-[420px] w-full overflow-hidden p-4 sm:h-[460px] sm:p-5"
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
          ref={stickerWrapperRef}
          className="relative"
          style={{
            contain: "layout style paint",
            userSelect: "none",
            WebkitTouchCallout: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {/* SVG Filters — stroke + paper fill (rasterized once per layer) */}
          <svg
            width="0"
            height="0"
            style={{ position: "absolute" }}
            aria-hidden
          >
            <defs>
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

          {/* Main sticker — drop-shadow set once, not updated per-frame */}
          <div
            ref={stickerMainRef}
            style={{
              clipPath: initMainClip,
              filter: "drop-shadow(1px 3px 5px rgba(0,0,0,0.18))",
              willChange: "clip-path",
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
              onLoad={(ev) => {
                const img = ev.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
                }
              }}
            />
          </div>

          {/* Fold shadow */}
          <div
            ref={foldShadowRef}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: 32,
              top: `calc(${initFoldPct} - 16px)`,
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
              top: initFlapTop,
              clipPath: initFlapClip,
              transform: "scaleY(-1)",
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.08))",
              willChange: "clip-path",
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

      <p
        ref={hintRef}
        className="peel-hint absolute bottom-3 left-0 w-full text-center text-[11px] tracking-[0.04em] text-muted"
      >
        Go on, peel it
      </p>
    </div>
  );
}
