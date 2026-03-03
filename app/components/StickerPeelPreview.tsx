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

type XY = { x: number; y: number };

const REST_PEEL = 12;
const ACTIVE_PEEL = 24;
const MAX_PEEL = 82;
const SNAP_THRESHOLD = 46;

export function StickerPeelPreview({ imageUrl, onSnap }: StickerPeelPreviewProps) {
  const [peel, setPeel] = useState(REST_PEEL);
  const [dragOffset, setDragOffset] = useState<XY>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<XY>({ x: 0, y: 0 });
  const [light, setLight] = useState({ x: 35, y: 35, z: 78 });
  const [isActive, setIsActive] = useState(false);

  const stickerRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const peelRef = useRef(peel);
  const firstPeelTriggeredRef = useRef(false);
  const lastMicroPatternAtRef = useRef(0);
  const dragStateRef = useRef<{
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

  const runHaptic = useCallback(
    (pattern: string | number[]) => {
      if (!isSupported) return;
      try {
        trigger(pattern as never);
      } catch {
        // No-op when unavailable.
      }
    },
    [isSupported, trigger],
  );

  const updateVisualFromPointer = useCallback((clientX: number, clientY: number) => {
    const rect = stickerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const px = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const py = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);

    const rotationX = (py - 50) / 10;
    const rotationY = (px - 50) / 10;

    setRotation({ x: rotationX, y: rotationY });
    setLight({
      x: clamp(px + 30 * rotationY, -20, 130),
      y: clamp(py + 60 * (rotationX + 1), -20, 140),
      z: 80,
    });
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    activePointerIdRef.current = event.pointerId;
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsActive(true);
    setPeel((current) => Math.max(current, ACTIVE_PEEL));
    updateVisualFromPointer(event.clientX, event.clientY);

    if (!firstPeelTriggeredRef.current) {
      firstPeelTriggeredRef.current = true;
      runHaptic("nudge");
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    updateVisualFromPointer(event.clientX, event.clientY);

    if (activePointerIdRef.current !== event.pointerId || !dragStateRef.current) return;

    event.preventDefault();

    const dx = event.clientX - dragStateRef.current.startX;
    const dy = event.clientY - dragStateRef.current.startY;

    setDragOffset({
      x: dragStateRef.current.originX + dx,
      y: dragStateRef.current.originY + dy,
    });

    const lift = clamp(-dy * 0.26, 0, MAX_PEEL - REST_PEEL);
    const lateralPull = clamp(Math.abs(dx) * 0.045, 0, 6);
    const nextPeel = clamp(REST_PEEL + lift + lateralPull, REST_PEEL, MAX_PEEL);

    setPeel((current) => {
      if (nextPeel > current + 2.1) {
        const now = performance.now();
        if (now - lastMicroPatternAtRef.current > 155) {
          runHaptic([5, 24, 4]);
          lastMicroPatternAtRef.current = now;
        }
      }
      return nextPeel;
    });
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activePointerIdRef.current = null;
    dragStateRef.current = null;
    setIsActive(false);

    if (peelRef.current > SNAP_THRESHOLD) {
      runHaptic("success");
      onSnap?.();
    }

    setPeel(REST_PEEL + 2);
    setRotation({ x: 0, y: 0 });
  };

  const imageStyle = useMemo(
    () =>
      ({
        backgroundImage: `url("${imageUrl}")`,
        backgroundPosition: "center",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
      }) satisfies CSSProperties,
    [imageUrl],
  );

  const stickyHeight = clamp(100 - peel, 15, 94);
  const stickerClipPath = `polygon(0 ${stickyHeight}%, ${stickyHeight}% 100%, 100% 100%, 100% 0, 0 0)`;
  const flapClipPath = `polygon(0 ${stickyHeight}%, ${stickyHeight}% 100%, 100% ${stickyHeight}%)`;
  const flapOpacity = clamp((peel - 10) / 45, 0, 1);

  const rawId = useId().replaceAll(":", "");
  const stickerFilterId = `sticker-light-${rawId}`;
  const flapFilterId = `flap-light-${rawId}`;

  return (
    <div className="surface relative h-[400px] w-full overflow-hidden rounded-3xl p-4 sm:h-[470px] sm:p-5">
      <svg aria-hidden className="absolute h-0 w-0">
        <defs>
          <filter id={stickerFilterId} x="-40%" y="-40%" width="180%" height="180%">
            <feSpecularLighting
              in="SourceGraphic"
              surfaceScale="5"
              specularConstant="1"
              specularExponent="32"
              lightingColor="white"
              result="specular"
            >
              <fePointLight x={light.x} y={light.y} z={light.z} />
            </feSpecularLighting>
            <feComposite in="specular" in2="SourceGraphic" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} />
          </filter>

          <filter id={flapFilterId} x="-40%" y="-40%" width="180%" height="180%">
            <feSpecularLighting
              in="SourceGraphic"
              surfaceScale="5"
              specularConstant="1"
              specularExponent="32"
              lightingColor="white"
              result="specular"
            >
              <fePointLight x={light.x} y={light.y} z={light.z * 1.12} />
            </feSpecularLighting>
            <feComposite in="specular" in2="SourceGraphic" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} />
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
            transform: `translate(calc(-50% + ${dragOffset.x}px), calc(-50% + ${dragOffset.y}px))`,
            perspective: "960px",
          }}
        >
          <div
            className="pointer-events-none absolute left-8 right-8 top-[calc(100%+4px)] h-8 rounded-full bg-black/55 blur-xl transition"
            style={{
              transform: `translateY(${clamp(peel * 0.05, 0, 8)}px) scale(${1 + peel * 0.0025})`,
              opacity: clamp(0.36 + peel / 170, 0.36, 0.86),
            }}
          />

          <div
            ref={stickerRef}
            onPointerDown={handlePointerDown}
            className="relative h-[250px] w-[250px] rounded-[28px] border border-white/55 bg-white/88 shadow-[0_20px_48px_rgba(0,0,0,0.45)] sm:h-[320px] sm:w-[320px]"
            style={{
              transform: `rotateX(${rotation.x}deg) rotateY(${-rotation.y}deg)`,
              transition: isActive ? "none" : "transform 360ms cubic-bezier(0.2,0.75,0.3,1)",
            }}
          >
            <div
              className="absolute inset-0 rounded-[27px]"
              style={{
                ...imageStyle,
                clipPath: stickerClipPath,
                filter: `url(#${stickerFilterId})`,
                transition: isActive
                  ? "none"
                  : "clip-path 360ms cubic-bezier(0.2,0.75,0.3,1), transform 360ms cubic-bezier(0.2,0.75,0.3,1)",
              }}
            />

            <div
              className="absolute inset-0 rounded-[27px]"
              style={{
                ...imageStyle,
                clipPath: flapClipPath,
                transform: `translateY(-${peel * 0.76}%) scaleY(-1)`,
                transformOrigin: "50% 0%",
                opacity: flapOpacity,
                filter: `url(#${flapFilterId})`,
                transition: isActive
                  ? "none"
                  : "clip-path 360ms cubic-bezier(0.2,0.75,0.3,1), transform 360ms cubic-bezier(0.2,0.75,0.3,1), opacity 320ms ease",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/75 to-white/18 mix-blend-screen" />
            </div>

            <div className="pointer-events-none absolute inset-0 rounded-[27px] ring-1 ring-black/8" />
          </div>
        </div>
      </div>

      <p className="absolute bottom-3 left-0 w-full text-center text-[11px] uppercase tracking-[0.08em] text-muted">
        Drag to position. Pull up to peel.
      </p>
    </div>
  );
}

