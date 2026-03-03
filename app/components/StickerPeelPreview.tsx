"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useWebHaptics } from "web-haptics/react";
import { clamp } from "../lib/utils";

interface StickerPeelPreviewProps {
  imageUrl: string;
  onSnap?: () => void;
}

type Position = { x: number; y: number };

const REST_PEEL = 0.1;
const ACTIVE_PEEL = 0.2;
const SNAP_THRESHOLD = 0.56;

export function StickerPeelPreview({ imageUrl, onSnap }: StickerPeelPreviewProps) {
  const [peel, setPeel] = useState(REST_PEEL);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [light, setLight] = useState({ x: 40, y: 40, z: 68 });
  const [isActive, setIsActive] = useState(false);

  const stickerRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const peelRef = useRef(peel);
  const firstPeelTriggeredRef = useRef(false);
  const lastMicroPatternAtRef = useRef(0);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const debugHaptics = process.env.NEXT_PUBLIC_HAPTICS_DEBUG === "1";
  const { trigger, isSupported } = useWebHaptics({ debug: debugHaptics });

  useEffect(() => {
    peelRef.current = peel;
  }, [peel]);

  const safeHaptic = useCallback(
    (pattern: string | number[]) => {
      if (!isSupported) return;
      try {
        trigger(pattern as never);
      } catch {
        // Unsupported clients should fail silently.
      }
    },
    [isSupported, trigger],
  );

  const updateLightFromPointer = useCallback((clientX: number, clientY: number) => {
    const rect = stickerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = clamp(((clientX - rect.left) / rect.width) * 100, -10, 110);
    const y = clamp(((clientY - rect.top) / rect.height) * 100, -10, 110);
    setLight({
      x,
      y,
      z: 68,
    });
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    activePointerIdRef.current = event.pointerId;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    setIsActive(true);
    setPeel((current) => Math.max(current, ACTIVE_PEEL));
    updateLightFromPointer(event.clientX, event.clientY);

    if (!firstPeelTriggeredRef.current) {
      firstPeelTriggeredRef.current = true;
      safeHaptic("nudge");
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    updateLightFromPointer(event.clientX, event.clientY);

    if (activePointerIdRef.current !== event.pointerId || !dragRef.current) return;

    event.preventDefault();
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;

    setPosition({
      x: dragRef.current.originX + dx,
      y: dragRef.current.originY + dy,
    });

    setPeel((current) => {
      const lift = clamp(-dy / 180, 0, 1);
      const tension = clamp(Math.abs(dx) / 360, 0, 0.18);
      const next = clamp(REST_PEEL + lift + tension, REST_PEEL, 1);

      if (next > current + 0.018) {
        const now = performance.now();
        if (now - lastMicroPatternAtRef.current > 150) {
          // Custom micro-pattern during peel increase.
          safeHaptic([6, 26, 5]);
          lastMicroPatternAtRef.current = now;
        }
      }
      return next;
    });
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activePointerIdRef.current = null;
    dragRef.current = null;
    setIsActive(false);

    if (peelRef.current > SNAP_THRESHOLD) {
      safeHaptic("success");
      onSnap?.();
    }

    setPeel(REST_PEEL + 0.04);
  };

  const imageStyle = useMemo(
    () =>
      ({
        backgroundImage: `url("${imageUrl}")`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }) satisfies CSSProperties,
    [imageUrl],
  );

  const peelCut = clamp(6 + peel * 34, 6, 42);
  const foldAngle = peel * 108;
  const flapLift = peel * 18;
  const flapShiftX = peel * 4;
  const flapOpacity = clamp(peel * 1.35, 0, 1);

  const stickerClip = `polygon(0 0, ${100 - peelCut}% 0, 100% ${peelCut}%, 100% 100%, 0 100%)`;
  const flapClip = `polygon(${100 - peelCut}% 0, 100% ${peelCut}%, 100% 0)`;

  const rawId = useId().replaceAll(":", "");
  const mainFilterId = `sticker-main-light-${rawId}`;
  const flapFilterId = `sticker-flap-light-${rawId}`;

  return (
    <div className="panel relative h-[420px] w-full overflow-hidden p-4 sm:h-[480px] sm:p-5">
      <svg aria-hidden className="absolute h-0 w-0">
        <defs>
          <filter id={mainFilterId} x="-35%" y="-35%" width="170%" height="170%">
            <feSpecularLighting
              in="SourceGraphic"
              surfaceScale="5"
              specularConstant="1"
              specularExponent="28"
              lightingColor="white"
              result="specOut"
            >
              <fePointLight x={light.x} y={light.y} z={light.z} />
            </feSpecularLighting>
            <feComposite in="specOut" in2="SourceGraphic" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} />
          </filter>

          <filter id={flapFilterId} x="-35%" y="-35%" width="170%" height="170%">
            <feSpecularLighting
              in="SourceGraphic"
              surfaceScale="5"
              specularConstant="1"
              specularExponent="30"
              lightingColor="white"
              result="specOut"
            >
              <fePointLight x={light.x} y={light.y} z={light.z * 1.2} />
            </feSpecularLighting>
            <feComposite in="specOut" in2="SourceGraphic" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} />
          </filter>
        </defs>
      </svg>

      <div
        className="relative h-full w-full touch-none select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          }}
        >
          <div
            className="pointer-events-none absolute left-8 right-8 top-[calc(100%+8px)] h-8 rounded-full bg-black/20 blur-xl transition"
            style={{
              opacity: clamp(0.22 + peel * 0.25, 0.2, 0.55),
              transform: `scale(${1 + peel * 0.035})`,
            }}
          />

          <div
            ref={stickerRef}
            className="relative h-[250px] w-[250px] rounded-[30px] border border-[#d9d9d9] bg-white shadow-[0_24px_55px_rgba(0,0,0,0.16)] sm:h-[320px] sm:w-[320px]"
            style={{
              perspective: "1000px",
              transformStyle: "preserve-3d",
            }}
            onPointerDown={handlePointerDown}
          >
            <div
              className="absolute inset-0 rounded-[29px]"
              style={{
                ...imageStyle,
                clipPath: stickerClip,
                filter: `url(#${mainFilterId})`,
                transition: isActive
                  ? "none"
                  : "clip-path 360ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
            />

            <div
              className="absolute inset-0 rounded-[29px]"
              style={{
                clipPath: flapClip,
                transformOrigin: "100% 0%",
                transform: `translate3d(${flapShiftX}px, -${flapLift}px, ${peel * 22}px) rotate3d(1, -1, 0, ${foldAngle}deg)`,
                opacity: flapOpacity,
                transition: isActive
                  ? "none"
                  : "clip-path 360ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 280ms ease",
              }}
            >
              <div
                className="absolute inset-0 rounded-[29px]"
                style={{
                  ...imageStyle,
                  clipPath: flapClip,
                  transform: "scaleY(-1)",
                  transformOrigin: "50% 50%",
                  filter: `url(#${flapFilterId})`,
                }}
              />
              <div
                className="absolute inset-0 rounded-[29px] bg-gradient-to-br from-[#fff9f0] via-white/40 to-[#efece8]"
                style={{ clipPath: flapClip, mixBlendMode: "screen", opacity: 0.56 }}
              />
            </div>

            <div className="pointer-events-none absolute inset-0 rounded-[29px] ring-1 ring-black/5" />
          </div>
        </div>
      </div>

      <p className="absolute bottom-3 left-0 w-full text-center text-[11px] uppercase tracking-[0.08em] text-muted">
        Drag to position. Pull upward to peel.
      </p>
    </div>
  );
}

