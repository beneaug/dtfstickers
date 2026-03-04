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
import { clamp, lerp } from "../lib/utils";
import {
  stepSpring,
  SPRING_SNAP_BACK,
  SPRING_SNAP_FORWARD,
  SPRING_POSITION,
  type SpringState,
} from "../lib/spring";
import {
  adhesiveCurve,
  VelocityTracker,
  classifyGesture,
  detectCorner,
  cornerToPeelDirection,
  type GestureMode,
  type PeelDirection,
} from "../lib/peel-physics";

interface StickerPeelPreviewProps {
  imageUrl: string;
  onSnap?: () => void;
}

const REST_PEEL = 0.1;
const SNAP_THRESHOLD = 0.56;
const NUM_STRIPS = 16;

export function StickerPeelPreview({
  imageUrl,
  onSnap,
}: StickerPeelPreviewProps) {
  const filterId = useId();
  const sheenId = `vinyl-sheen-${filterId.replace(/:/g, "")}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropShadowRef = useRef<HTMLDivElement>(null);
  const foldShadowRef = useRef<HTMLDivElement>(null);
  const stripAssemblyRef = useRef<HTMLDivElement>(null);
  const sheenLightRef = useRef<SVGFEPointLightElement>(null);
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Interaction state — all refs for zero-rerender updates
  const peelRef = useRef(REST_PEEL);
  const peelDirRef = useRef<PeelDirection>({
    corner: "top-right",
    sweepSign: 1,
    originY: "bottom",
  });
  const positionRef = useRef({ x: 0, y: 0 });
  const activePointerRef = useRef<number | null>(null);
  const gestureRef = useRef<GestureMode>("pending");
  const rectRef = useRef<DOMRect | null>(null);
  const velocityTracker = useRef(new VelocityTracker());
  const snappedRef = useRef(false);

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    posX: number;
    posY: number;
    peelGestureAngle: number;
  } | null>(null);

  // Spring states
  const peelSpring = useRef<SpringState>({ value: REST_PEEL, velocity: 0 });
  const posXSpring = useRef<SpringState>({ value: 0, velocity: 0 });
  const posYSpring = useRef<SpringState>({ value: 0, velocity: 0 });
  const animatingRef = useRef(false);
  const springConfigRef = useRef(SPRING_SNAP_BACK);

  // React state: only for will-change toggle (2 renders per gesture)
  const [isActive, setIsActive] = useState(false);

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

  // --- Apply peel state to DOM (called from rAF or pointer move) ---

  const applyPeelToDOM = useCallback(() => {
    const peel = peelRef.current;
    const { sweepSign } = peelDirRef.current;
    const containerEl = stripAssemblyRef.current;
    if (!containerEl) return;

    const containerHeight = containerEl.offsetHeight;
    const stripH = containerHeight / NUM_STRIPS;
    const cylinderRadius = lerp(50, 28, peel);

    for (let i = 0; i < NUM_STRIPS; i++) {
      const el = stripRefs.current[i];
      if (!el) continue;

      const stripCenter = (i + 0.5) / NUM_STRIPS;

      // d > 0 means this strip is past the fold line (should be curled)
      let d: number;
      if (sweepSign > 0) {
        // Top corners: fold sweeps top→bottom, peel from top
        d = peel - stripCenter;
      } else {
        // Bottom corners: fold sweeps bottom→top, peel from bottom
        d = stripCenter - (1 - peel);
      }

      if (d <= 0) {
        // Flat — on the surface
        el.style.transform = "translateZ(0px)";
        continue;
      }

      // Curled strip
      const distPx = d * containerHeight;
      const arcAngle = Math.min(distPx / cylinderRadius, Math.PI); // cap at 180°
      const dy = -distPx + cylinderRadius * Math.sin(arcAngle);
      const dz = cylinderRadius * (1 - Math.cos(arcAngle));
      const rotDeg = -(arcAngle * 180) / Math.PI * sweepSign;

      el.style.transform = `translateY(${dy}px) translateZ(${dz}px) rotateX(${rotDeg}deg)`;
    }

    // Fold shadow — positioned at the fold line
    if (foldShadowRef.current) {
      let foldFraction: number;
      if (sweepSign > 0) {
        foldFraction = peel;
      } else {
        foldFraction = 1 - peel;
      }
      const foldTop = foldFraction * containerHeight - 20; // center the 40px shadow
      const shadowOpacity = peel > 0.05 ? clamp((peel - 0.05) * 2, 0, 1) : 0;
      foldShadowRef.current.style.top = `${foldTop}px`;
      foldShadowRef.current.style.opacity = String(shadowOpacity);
    }

    // Drop shadow
    if (dropShadowRef.current) {
      const shadowOp = clamp(0.22 + peel * 0.25, 0.2, 0.55);
      dropShadowRef.current.style.opacity = String(shadowOp);
    }

    // Position wrapper
    if (wrapperRef.current) {
      const { x, y } = positionRef.current;
      wrapperRef.current.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }
  }, []);

  // Initial apply on mount + image change
  useEffect(() => {
    // Small delay to ensure refs are attached
    requestAnimationFrame(() => applyPeelToDOM());
  }, [applyPeelToDOM, imageUrl]);

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
      posXSpring.current = {
        value: positionRef.current.x,
        velocity: posXSpring.current.velocity,
      };
      posYSpring.current = {
        value: positionRef.current.y,
        velocity: posYSpring.current.velocity,
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

        const posXResult = stepSpring(
          posXSpring.current,
          0,
          SPRING_POSITION,
          dt,
        );
        posXSpring.current = {
          value: posXResult.value,
          velocity: posXResult.velocity,
        };

        const posYResult = stepSpring(
          posYSpring.current,
          0,
          SPRING_POSITION,
          dt,
        );
        posYSpring.current = {
          value: posYResult.value,
          velocity: posYResult.velocity,
        };

        positionRef.current = {
          x: posXResult.value,
          y: posYResult.value,
        };

        // Apply all transforms via refs (no React state)
        applyPeelToDOM();

        // Spring settle vibrations: tap on each bounce peak
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
          if (intensity > 3) safeHaptic([intensity]);
        }
        lastBounceSign = bounceSign;

        const allRest =
          peelResult.atRest && posXResult.atRest && posYResult.atRest;
        if (allRest || !animatingRef.current) {
          animatingRef.current = false;
          return;
        }

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    },
    [safeHaptic, applyPeelToDOM],
  );

  // --- Pointer Handlers ---

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (activePointerRef.current !== null) return;

      activePointerRef.current = event.pointerId;
      animatingRef.current = false;
      snappedRef.current = false;
      gestureRef.current = "pending";
      adhesiveBreakRef.current = false;
      velocityTracker.current.reset();

      rectRef.current =
        containerRef.current?.getBoundingClientRect() ?? null;
      const rect = rectRef.current;

      dragStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        posX: positionRef.current.x,
        posY: positionRef.current.y,
        peelGestureAngle: (3 * Math.PI) / 4,
      };

      event.currentTarget.setPointerCapture(event.pointerId);
      setIsActive(true);

      // Detect which corner user grabbed
      if (rect) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const { corner, peelAngle } = detectCorner(
          event.clientX,
          event.clientY,
          cx,
          cy,
        );
        peelDirRef.current = cornerToPeelDirection(corner);
        dragStartRef.current.peelGestureAngle = peelAngle;
      }

      // Update SVG light position
      if (rect && sheenLightRef.current) {
        const nx = ((event.clientX - rect.left) / rect.width) * 250;
        const ny = ((event.clientY - rect.top) / rect.height) * 250;
        sheenLightRef.current.setAttribute("x", String(nx));
        sheenLightRef.current.setAttribute("y", String(ny));
      }

      if (!firstPeelRef.current) {
        firstPeelRef.current = true;
        safeHaptic("nudge");
      }
    },
    [safeHaptic],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const rect = rectRef.current;

      // Always update SVG light
      if (rect && sheenLightRef.current) {
        const nx = ((event.clientX - rect.left) / rect.width) * 250;
        const ny = ((event.clientY - rect.top) / rect.height) * 250;
        sheenLightRef.current.setAttribute("x", String(nx));
        sheenLightRef.current.setAttribute("y", String(ny));
      }

      if (
        activePointerRef.current !== event.pointerId ||
        !dragStartRef.current
      )
        return;

      event.preventDefault();
      velocityTracker.current.push(event.clientX, event.clientY);

      const dx = event.clientX - dragStartRef.current.clientX;
      const dy = event.clientY - dragStartRef.current.clientY;

      // Classify gesture if still pending
      if (gestureRef.current === "pending") {
        const peelGestureAngle = dragStartRef.current.peelGestureAngle;
        gestureRef.current = classifyGesture(dx, dy, peelGestureAngle);
      }

      if (gestureRef.current === "reposition") {
        positionRef.current = {
          x: dragStartRef.current.posX + dx,
          y: dragStartRef.current.posY + dy,
        };
        applyPeelToDOM();
        return;
      }

      // Peel mode — project drag along peel direction
      const { sweepSign } = peelDirRef.current;
      // For top corners (sweepSign +1): pulling upward (-dy) peels. For bottom (+dy) peels.
      const rawDisplacement = clamp((-dy * sweepSign) / 200, 0, 1);
      const horizontalTension = clamp(Math.abs(dx) / 400, 0, 0.12);
      const totalRaw = clamp(rawDisplacement + horizontalTension, 0, 1);

      const peelAmount = clamp(
        REST_PEEL + adhesiveCurve(totalRaw) * (1 - REST_PEEL),
        REST_PEEL,
        1,
      );
      peelRef.current = peelAmount;

      // Allow some repositioning during peel (reduced)
      positionRef.current = {
        x: dragStartRef.current.posX + dx * 0.3,
        y: dragStartRef.current.posY + dy * 0.3,
      };

      applyPeelToDOM();

      // --- Haptics ---
      if (!adhesiveBreakRef.current && peelAmount > 0.18) {
        adhesiveBreakRef.current = true;
        safeHaptic([35, 20, 20]);
      }

      const vel = velocityTracker.current.get();
      if (peelAmount > peelRef.current - 0.001) {
        const now = performance.now();
        const interval = Math.max(60, 200 - vel.speed * 120);
        if (now - lastMicroRef.current > interval) {
          const intensity = Math.round(clamp(4 + vel.speed * 8, 4, 14));
          safeHaptic([intensity, 20, Math.round(intensity * 0.7)]);
          lastMicroRef.current = now;
        }
      }

      if (peelAmount > 0.7) {
        const now = performance.now();
        if (now - lastMicroRef.current > 40) {
          const buzzIntensity = Math.round(
            ((peelAmount - 0.7) / 0.3) * 8,
          );
          if (buzzIntensity > 1) safeHaptic([buzzIntensity]);
          lastMicroRef.current = now;
        }
      }
    },
    [safeHaptic, applyPeelToDOM],
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

      peelSpring.current.velocity = -vel.vy * 0.8;

      if (currentPeel > SNAP_THRESHOLD) {
        safeHaptic("success");
        snappedRef.current = true;
        runSpringAnimation(1.0, SPRING_SNAP_FORWARD);
        setTimeout(() => onSnap?.(), 120);
      } else {
        runSpringAnimation(REST_PEEL, SPRING_SNAP_BACK);
      }

      adhesiveBreakRef.current = false;
      gestureRef.current = "pending";
    },
    [safeHaptic, runSpringAnimation, onSnap],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      animatingRef.current = false;
    };
  }, []);

  // Build strip elements
  const strips = [];
  for (let i = 0; i < NUM_STRIPS; i++) {
    strips.push(
      <div
        key={i}
        ref={(el) => { stripRefs.current[i] = el; }}
        style={{
          position: "absolute",
          top: `${(i / NUM_STRIPS) * 100}%`,
          left: 0,
          width: "100%",
          height: `${(1 / NUM_STRIPS) * 100 + 0.5}%`, // +0.5% overlap to prevent seams
          transformStyle: "preserve-3d",
          WebkitTransformStyle: "preserve-3d",
          transformOrigin: "center center",
          willChange: isActive ? "transform" : "auto",
        }}
      >
        {/* Front face — sticker image slice */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: `100% ${NUM_STRIPS * 100}%`,
            backgroundPosition: `0 ${(i * 100) / (NUM_STRIPS - 1)}%`,
            backgroundRepeat: "no-repeat",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            borderRadius:
              i === 0
                ? "12px 12px 0 0"
                : i === NUM_STRIPS - 1
                  ? "0 0 12px 12px"
                  : undefined,
          }}
        />
        {/* Back face — paper backing */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#f5f2eb",
            transform: "rotateX(180deg)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            borderRadius:
              i === 0
                ? "12px 12px 0 0"
                : i === NUM_STRIPS - 1
                  ? "0 0 12px 12px"
                  : undefined,
          }}
        />
      </div>,
    );
  }

  return (
    <div className="panel relative h-[420px] w-full overflow-hidden p-4 sm:h-[480px] sm:p-5">
      <div
        ref={containerRef}
        className="relative h-full w-full select-none"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        {/* Position wrapper */}
        <div
          ref={wrapperRef}
          className="absolute left-1/2 top-1/2"
          style={{
            transform: "translate(-50%, -50%)",
          }}
        >
          {/* Drop shadow */}
          <div
            ref={dropShadowRef}
            className="pointer-events-none absolute left-8 right-8 top-[calc(100%+8px)] h-8 rounded-full bg-black/20 blur-xl"
            style={{ opacity: 0.22 }}
          />

          {/* Perspective container */}
          <div
            className="h-[250px] w-[250px] sm:h-[320px] sm:w-[320px]"
            style={{
              perspective: "800px",
              WebkitPerspective: "800px",
              overflow: "visible",
            }}
          >
            {/* SVG specular filter */}
            <svg
              width="0"
              height="0"
              style={{ position: "absolute" }}
              aria-hidden
            >
              <defs>
                <filter id={sheenId} x="0%" y="0%" width="100%" height="100%">
                  <feSpecularLighting
                    in="SourceAlpha"
                    specularExponent="20"
                    specularConstant="0.35"
                    surfaceScale="3"
                    result="specular"
                  >
                    <fePointLight
                      ref={sheenLightRef}
                      x="125"
                      y="75"
                      z="180"
                    />
                  </feSpecularLighting>
                  <feComposite
                    in="specular"
                    in2="SourceAlpha"
                    operator="in"
                    result="specular-masked"
                  />
                  <feComposite
                    in="SourceGraphic"
                    in2="specular-masked"
                    operator="arithmetic"
                    k1="0"
                    k2="1"
                    k3="0.6"
                    k4="0"
                  />
                </filter>
              </defs>
            </svg>

            {/* Strip assembly */}
            <div
              ref={stripAssemblyRef}
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                transformStyle: "preserve-3d",
                WebkitTransformStyle: "preserve-3d",
                filter: `url(#${sheenId})`,
              }}
            >
              {strips}

              {/* Fold shadow */}
              <div
                ref={foldShadowRef}
                style={{
                  position: "absolute",
                  left: 0,
                  width: "100%",
                  height: "40px",
                  top: "0px",
                  opacity: 0,
                  background:
                    "linear-gradient(to bottom, transparent, rgba(0,0,0,0.12) 35%, rgba(0,0,0,0.06) 65%, transparent)",
                  transform: "translateZ(1px)",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <p className="absolute bottom-3 left-0 w-full text-center text-[11px] uppercase tracking-[0.08em] text-muted">
        Drag to position. Pull upward to peel.
      </p>
    </div>
  );
}
