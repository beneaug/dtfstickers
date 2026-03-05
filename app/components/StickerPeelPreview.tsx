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
import { haptic } from "../lib/haptics";
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
  lerpAngle,
  computeFold,
} from "../lib/peel-physics";
import { burst } from "../lib/emoji-burst";
import type { StickerSize, StickerFinish, StickerCut } from "../lib/pricing";

interface StickerPeelPreviewProps {
  imageUrl: string;
  size?: StickerSize;
  finish?: StickerFinish;
  cut?: StickerCut;
  bgColor?: string;
  onSnap?: () => void;
}

const REST_PEEL = 0.08;
const SNAP_THRESHOLD = 0.56;
const SNAP_FORWARD_TARGET = 0.85;

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
  return Math.max(220, displaySize * 1.6);
}


export function StickerPeelPreview({
  imageUrl,
  size = "3x3",
  finish,
  cut = "die-cut",
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

  // Ref for display dims so applyPeelToDOM can read without dep changes
  const displayDimsRef = useRef({ w: displayW, h: displayH });
  displayDimsRef.current = { w: displayW, h: displayH };

  // DOM refs
  const containerRef = useRef<HTMLDivElement>(null);
  const stickerMainRef = useRef<HTMLDivElement>(null);
  const flapRef = useRef<HTMLDivElement>(null);
  const foldShadowRef = useRef<HTMLDivElement>(null);
  const foldHighlightRef = useRef<HTMLDivElement>(null);

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

  const safeHaptic = useCallback((preset: "light" | "medium" | "success") => {
    try { haptic(preset); } catch { /* silent */ }
  }, []);

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

  // --- Apply peel to DOM via computed fold-line polygons ---
  // The sticker image stays perfectly still. Only clip-path shapes change.
  // The flap is reflected across the fold line using a CSS matrix transform.

  const applyPeelToDOM = useCallback(() => {
    const peel = peelRef.current;
    const angle = angleRef.current;
    const { w, h } = displayDimsRef.current;

    const fold = computeFold(angle, peel, w, h);

    if (stickerMainRef.current) {
      stickerMainRef.current.style.clipPath = fold.mainClip;
    }

    if (flapRef.current) {
      flapRef.current.style.clipPath = fold.flapClip;
      flapRef.current.style.transform = fold.flapTransform;
    }

    // Fold-line shadow — matches actual fold intersection length
    if (foldShadowRef.current) {
      foldShadowRef.current.style.width = `${Math.round(fold.foldLength)}px`;
      foldShadowRef.current.style.left = `${fold.shadowPos.x}px`;
      foldShadowRef.current.style.top = `${fold.shadowPos.y}px`;
      foldShadowRef.current.style.transform = `translate(-50%, -50%) rotate(${fold.shadowAngle}deg)`;
      foldShadowRef.current.style.opacity = String(
        peel > 0.02 ? clamp(peel * 1.2, 0, 0.25) : 0,
      );
    }

    // Fold-line highlight — matches actual fold intersection length
    if (foldHighlightRef.current) {
      foldHighlightRef.current.style.width = `${Math.round(fold.foldLength)}px`;
      foldHighlightRef.current.style.left = `${fold.shadowPos.x}px`;
      foldHighlightRef.current.style.top = `${fold.shadowPos.y}px`;
      foldHighlightRef.current.style.transform = `translate(-50%, -50%) rotate(${fold.shadowAngle}deg)`;
      foldHighlightRef.current.style.opacity = String(
        peel > 0.03 ? clamp(peel * 1.0, 0, 0.35) : 0,
      );
    }

  }, []);

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

      // Smooth angle blending — fluid direction changes, no jitter
      const rawAngle = continuousDragAngle(dx, dy, angleRef.current);
      // Blend more aggressively when further from start (committed movement)
      const blend = clamp((dist - 8) / 80, 0, 0.25);
      angleRef.current = lerpAngle(angleRef.current, rawAngle, blend);

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

  // Pre-compute initial fold for first paint
  const initFold = computeFold(DEFAULT_DRAG_ANGLE, REST_PEEL, displayW, displayH);

  const isSquareCut = cut === "square";
  const isKissCut = cut === "kiss-cut";

  // Square cut: image inset to show white border; others: full size
  const squareInset = isSquareCut ? strokeW : 0;

  const imgStyle: React.CSSProperties = {
    width: displayW - squareInset * 2,
    height: displayH - squareInset * 2,
    margin: squareInset || undefined,
    display: "block",
  };

  // For die-cut and kiss-cut: mask overlays to sticker alpha contour
  // For square: overlays cover the full rectangle
  const finishOverlayBase: React.CSSProperties = isSquareCut
    ? { position: "absolute", inset: 0, pointerEvents: "none" }
    : {
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        WebkitMaskImage: `url(${imageUrl})`,
        WebkitMaskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat",
        maskImage: `url(${imageUrl})`,
        maskSize: "100% 100%",
        maskRepeat: "no-repeat",
      };

  const glossStyle: React.CSSProperties = {
    ...finishOverlayBase,
    background: [
      "linear-gradient(125deg, transparent 18%, rgba(255,255,255,0.03) 32%, rgba(255,255,255,0.20) 42%, rgba(255,255,255,0.42) 48.5%, rgba(255,255,255,0.48) 50.5%, rgba(255,255,255,0.42) 52.5%, rgba(255,255,255,0.20) 58%, rgba(255,255,255,0.03) 68%, transparent 82%)",
      "linear-gradient(235deg, transparent 45%, rgba(255,255,255,0.06) 58%, rgba(255,255,255,0.14) 66%, rgba(255,255,255,0.06) 74%, transparent 88%)",
      "radial-gradient(ellipse at 36% 28%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 45%, transparent 70%)",
    ].join(", "),
  };

  // Initial fold length for first paint
  const initFoldLength = Math.round(initFold.foldLength);

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
          className="relative"
          style={{
            width: displayW,
            height: displayH,
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

          {/* Kiss-cut backing sheet — static rectangle behind everything */}
          {isKissCut && (
            <div
              style={{
                position: "absolute",
                inset: -strokeW * 2,
                background: "white",
                borderRadius: 6,
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                zIndex: -1,
              }}
            />
          )}

          {/* Main sticker — the un-peeled part */}
          <div
            ref={stickerMainRef}
            style={{
              clipPath: initFold.mainClip,
              willChange: "clip-path",
              background: isSquareCut ? "white" : undefined,
              borderRadius: isSquareCut ? 4 : undefined,
            }}
          >
            <img
              src={imageUrl}
              alt="Sticker preview"
              style={{
                ...imgStyle,
                filter: isSquareCut ? undefined : `url(#stroke-${uid})`,
                borderRadius: isSquareCut ? 4 : undefined,
              }}
              draggable={false}
              onContextMenu={(ev) => ev.preventDefault()}
              onLoad={(ev) => {
                const img = ev.currentTarget;
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                if (w && h) setImgDims({ w, h });
              }}
            />
            {finish === "gloss" && <div style={glossStyle} />}
            {finish === "holographic" && (
              <>
                <div className="holo-tint" style={finishOverlayBase} />
                <div className="holo-shine" style={finishOverlayBase} />
              </>
            )}
          </div>

          {/* Fold shadow + highlight — clipped to sticker bounds */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            {/* Fold shadow — tight crease line, length matches fold */}
            <div
              ref={foldShadowRef}
              style={{
                position: "absolute",
                width: initFoldLength,
                height: 8,
                left: initFold.shadowPos.x,
                top: initFold.shadowPos.y,
                transform: `translate(-50%, -50%) rotate(${initFold.shadowAngle}deg)`,
                background:
                  "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.12) 40%, rgba(0,0,0,0.12) 60%, transparent 100%)",
                opacity: REST_PEEL > 0.02 ? clamp(REST_PEEL * 1.2, 0, 0.25) : 0,
              }}
            />
            {/* Fold highlight — thin bright edge, length matches fold */}
            <div
              ref={foldHighlightRef}
              style={{
                position: "absolute",
                width: initFoldLength,
                height: 1,
                left: initFold.shadowPos.x,
                top: initFold.shadowPos.y,
                transform: `translate(-50%, -50%) rotate(${initFold.shadowAngle}deg)`,
                background:
                  "linear-gradient(to right, transparent 10%, rgba(255,255,255,0.5) 30%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0.5) 70%, transparent 90%)",
                opacity: REST_PEEL > 0.03 ? clamp(REST_PEEL * 1.0, 0, 0.35) : 0,
              }}
            />
          </div>

          {/* Peeled flap — reflected across fold line via CSS matrix */}
          <div
            ref={flapRef}
            style={{
              position: "absolute",
              width: displayW,
              height: displayH,
              left: 0,
              top: 0,
              clipPath: initFold.flapClip,
              transform: initFold.flapTransform,
              transformOrigin: "0 0",
              willChange: "clip-path, transform",
              background: isSquareCut ? "#e8e4dd" : undefined,
              borderRadius: isSquareCut ? 4 : undefined,
            }}
          >
            {/* Back face is just backing paper — no finish overlays */}
            {!isSquareCut && (
              <img
                src={imageUrl}
                alt=""
                style={{
                  ...imgStyle,
                  filter: `url(#ef-${uid})`,
                }}
                draggable={false}
              />
            )}
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
