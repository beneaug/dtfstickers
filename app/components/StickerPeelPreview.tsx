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
  SPRING_POSITION,
  type SpringState,
} from "../lib/spring";
import {
  adhesiveCurve,
  VelocityTracker,
  classifyGesture,
  type GestureMode,
} from "../lib/peel-physics";

interface StickerPeelPreviewProps {
  imageUrl: string;
  onSnap?: () => void;
}

const REST_PEEL = 0.1;
const SNAP_THRESHOLD = 0.56;
const PEEL_ANGLE = Math.PI / 2; // upward peel
const P = 10; // px — clip-path bleed for filter overflow

// Pre-compute initial clip-path values for REST_PEEL to avoid flash
const INIT_PEEL_PCT = `${REST_PEEL * 100}%`;
const S = `${-P}px`;
const E = `calc(100% + ${P}px)`;
const INIT_MAIN_CLIP = `polygon(${S} ${INIT_PEEL_PCT}, ${E} ${INIT_PEEL_PCT}, ${E} ${E}, ${S} ${E})`;
const INIT_FLAP_CLIP = `polygon(${S} ${S}, ${E} ${S}, ${E} ${INIT_PEEL_PCT}, ${S} ${INIT_PEEL_PCT})`;
const INIT_FLAP_TOP = `calc(-100% + ${REST_PEEL * 200}% - 1px)`;

export function StickerPeelPreview({
  imageUrl,
  onSnap,
}: StickerPeelPreviewProps) {
  const uid = useId().replace(/:/g, "");

  // DOM refs
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stickerMainRef = useRef<HTMLDivElement>(null);
  const flapRef = useRef<HTMLDivElement>(null);
  const shadowFlapRef = useRef<HTMLDivElement>(null);
  const pointLightRef = useRef<SVGFEPointLightElement>(null);
  const pointLightFlippedRef = useRef<SVGFEPointLightElement>(null);
  const stickerContainerRef = useRef<HTMLDivElement>(null);

  // Interaction refs
  const peelRef = useRef(REST_PEEL);
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
  } | null>(null);

  // Spring states
  const peelSpring = useRef<SpringState>({ value: REST_PEEL, velocity: 0 });
  const posXSpring = useRef<SpringState>({ value: 0, velocity: 0 });
  const posYSpring = useRef<SpringState>({ value: 0, velocity: 0 });
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

  // --- Apply peel state to DOM (ref-driven, zero rerenders) ---

  const applyPeelToDOM = useCallback(() => {
    const peel = peelRef.current;
    const peelPct = `${peel * 100}%`;
    const s = `${-P}px`;
    const e = `calc(100% + ${P}px)`;

    // Main sticker: visible from peelPct to bottom
    if (stickerMainRef.current) {
      stickerMainRef.current.style.clipPath =
        `polygon(${s} ${peelPct}, ${e} ${peelPct}, ${e} ${e}, ${s} ${e})`;
    }

    // Flap + shadow flap: visible from top to peelPct, positioned at fold
    const flapClip = `polygon(${s} ${s}, ${e} ${s}, ${e} ${peelPct}, ${s} ${peelPct})`;
    const flapTop = `calc(-100% + ${peel * 200}% - 1px)`;

    if (flapRef.current) {
      flapRef.current.style.clipPath = flapClip;
      flapRef.current.style.top = flapTop;
    }
    if (shadowFlapRef.current) {
      shadowFlapRef.current.style.clipPath = flapClip;
      shadowFlapRef.current.style.top = flapTop;
    }

    // Position wrapper
    if (wrapperRef.current) {
      const { x, y } = positionRef.current;
      wrapperRef.current.style.transform =
        `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }
  }, []);

  // --- Light position (tracks pointer for specular) ---

  const updateLightPosition = useCallback(
    (clientX: number, clientY: number) => {
      const rect = stickerContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const rx = clientX - rect.left;
      const ry = clientY - rect.top;
      pointLightRef.current?.setAttribute("x", String(rx));
      pointLightRef.current?.setAttribute("y", String(ry));
      pointLightFlippedRef.current?.setAttribute("x", String(rx));
      pointLightFlippedRef.current?.setAttribute(
        "y",
        String(rect.height - ry),
      );
    },
    [],
  );

  // Initial apply
  useEffect(() => {
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

        applyPeelToDOM();

        // Bounce haptics
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

      dragStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        posX: positionRef.current.x,
        posY: positionRef.current.y,
      };

      event.currentTarget.setPointerCapture(event.pointerId);
      setIsActive(true);

      updateLightPosition(event.clientX, event.clientY);

      if (!firstPeelRef.current) {
        firstPeelRef.current = true;
        safeHaptic("nudge");
      }
    },
    [safeHaptic, updateLightPosition],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      updateLightPosition(event.clientX, event.clientY);

      if (
        activePointerRef.current !== event.pointerId ||
        !dragStartRef.current
      )
        return;

      event.preventDefault();
      velocityTracker.current.push(event.clientX, event.clientY);

      const dx = event.clientX - dragStartRef.current.clientX;
      const dy = event.clientY - dragStartRef.current.clientY;

      if (gestureRef.current === "pending") {
        gestureRef.current = classifyGesture(dx, dy, PEEL_ANGLE);
      }

      if (gestureRef.current === "reposition") {
        positionRef.current = {
          x: dragStartRef.current.posX + dx,
          y: dragStartRef.current.posY + dy,
        };
        applyPeelToDOM();
        return;
      }

      // Peel: upward drag (-dy) increases peel
      const rawDisplacement = clamp(-dy / 200, 0, 1);
      const horizontalTension = clamp(Math.abs(dx) / 400, 0, 0.12);
      const totalRaw = clamp(rawDisplacement + horizontalTension, 0, 1);

      const peelAmount = clamp(
        REST_PEEL + adhesiveCurve(totalRaw) * (1 - REST_PEEL),
        REST_PEEL,
        1,
      );
      peelRef.current = peelAmount;

      // Slight reposition during peel
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
    [safeHaptic, applyPeelToDOM, updateLightPosition],
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

  useEffect(() => {
    return () => {
      animatingRef.current = false;
    };
  }, []);

  const willChange = isActive ? "clip-path, transform" : "auto";

  /* eslint-disable @next/next/no-img-element */
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
          style={{ transform: "translate(-50%, -50%)" }}
        >
          <div
            ref={stickerContainerRef}
            className="relative"
            style={{
              userSelect: "none",
              WebkitTouchCallout: "none",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {/* SVG Filters */}
            <svg
              width="0"
              height="0"
              style={{ position: "absolute" }}
              aria-hidden
            >
              <defs>
                {/* Front face — subtle vinyl sheen */}
                <filter id={`pl-${uid}`}>
                  <feGaussianBlur stdDeviation="1" result="blur" />
                  <feSpecularLighting
                    result="spec"
                    in="blur"
                    specularExponent={100}
                    specularConstant={0.1}
                    lightingColor="white"
                  >
                    <fePointLight
                      ref={pointLightRef}
                      x={100}
                      y={100}
                      z={300}
                    />
                  </feSpecularLighting>
                  <feComposite
                    in="spec"
                    in2="SourceGraphic"
                    operator="screen"
                    result="lit"
                  />
                  <feComposite
                    in="lit"
                    in2="SourceAlpha"
                    operator="in"
                  />
                </filter>

                {/* Back face — broad paper sheen */}
                <filter id={`plf-${uid}`}>
                  <feGaussianBlur stdDeviation="10" result="blur" />
                  <feSpecularLighting
                    result="spec"
                    in="blur"
                    specularExponent={100}
                    specularConstant={0.7}
                    lightingColor="white"
                  >
                    <fePointLight
                      ref={pointLightFlippedRef}
                      x={100}
                      y={100}
                      z={300}
                    />
                  </feSpecularLighting>
                  <feComposite
                    in="spec"
                    in2="SourceGraphic"
                    operator="screen"
                    result="lit"
                  />
                  <feComposite
                    in="lit"
                    in2="SourceAlpha"
                    operator="in"
                  />
                </filter>

                {/* Drop shadow */}
                <filter id={`ds-${uid}`}>
                  <feDropShadow
                    dx={2}
                    dy={4}
                    stdDeviation={3}
                    floodColor="black"
                    floodOpacity={0.6}
                  />
                </filter>

                {/* Paper backing fill */}
                <filter id={`ef-${uid}`}>
                  <feOffset dx={0} dy={0} in="SourceAlpha" result="shape" />
                  <feFlood floodColor="rgb(179, 179, 179)" result="flood" />
                  <feComposite operator="in" in="flood" in2="shape" />
                </filter>
              </defs>
            </svg>

            {/* Main sticker (front face, clipped to un-peeled portion) */}
            <div
              ref={stickerMainRef}
              style={{
                clipPath: INIT_MAIN_CLIP,
                filter: `url(#ds-${uid})`,
                willChange,
              }}
            >
              <div style={{ filter: `url(#pl-${uid})` }}>
                <img
                  src={imageUrl}
                  alt="Sticker preview"
                  className="block h-[250px] w-[250px] object-cover sm:h-[320px] sm:w-[320px]"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                />
              </div>
            </div>

            {/* Shadow of peeled flap */}
            <div
              style={{
                position: "absolute",
                top: "1rem",
                left: "0.5rem",
                width: "100%",
                height: "100%",
                filter: "brightness(0) blur(8px)",
                opacity: 0.4,
                pointerEvents: "none",
              }}
            >
              <div
                ref={shadowFlapRef}
                style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                  left: 0,
                  top: INIT_FLAP_TOP,
                  clipPath: INIT_FLAP_CLIP,
                  transform: "scaleY(-1)",
                  willChange,
                }}
              >
                <img
                  src={imageUrl}
                  alt=""
                  className="block h-[250px] w-[250px] object-cover sm:h-[320px] sm:w-[320px]"
                  style={{ filter: `url(#ef-${uid})` }}
                  draggable={false}
                />
              </div>
            </div>

            {/* Peeled flap (paper backing, mirrored) */}
            <div
              ref={flapRef}
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                left: 0,
                top: INIT_FLAP_TOP,
                clipPath: INIT_FLAP_CLIP,
                transform: "scaleY(-1)",
                willChange,
              }}
            >
              <div style={{ filter: `url(#plf-${uid})` }}>
                <img
                  src={imageUrl}
                  alt=""
                  className="block h-[250px] w-[250px] object-cover sm:h-[320px] sm:w-[320px]"
                  style={{ filter: `url(#ef-${uid})` }}
                  draggable={false}
                />
              </div>
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
