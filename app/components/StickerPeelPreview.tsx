"use client";

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  useEffect,
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

export function StickerPeelPreview({ imageUrl, onSnap }: StickerPeelPreviewProps) {
  const [peelAmount, setPeelAmount] = useState(0.16);
  const [isActive, setIsActive] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [light, setLight] = useState({ x: 110, y: 100, z: 140 });

  const stickerRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const peelAmountRef = useRef(peelAmount);
  const firstPeelTriggeredRef = useRef(false);
  const lastMicroPatternAtRef = useRef(0);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    peelAmountRef.current = peelAmount;
  }, [peelAmount]);

  const debugHaptics = process.env.NEXT_PUBLIC_HAPTICS_DEBUG === "1";
  const { trigger, isSupported } = useWebHaptics({ debug: debugHaptics });

  const safeTrigger = useCallback(
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

  const updateLight = useCallback((clientX: number, clientY: number) => {
    const rect = stickerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relativeX = ((clientX - rect.left) / rect.width) * 220;
    const relativeY = ((clientY - rect.top) / rect.height) * 220;

    setLight({
      x: clamp(relativeX, -20, 240),
      y: clamp(relativeY, -20, 240),
      z: 130,
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
    setPeelAmount((current) => Math.max(current, 0.36));
    updateLight(event.clientX, event.clientY);

    if (!firstPeelTriggeredRef.current) {
      firstPeelTriggeredRef.current = true;
      safeTrigger("nudge");
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    updateLight(event.clientX, event.clientY);

    if (activePointerIdRef.current !== event.pointerId || !dragRef.current) return;

    event.preventDefault();

    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    setPosition({
      x: dragRef.current.originX + dx,
      y: dragRef.current.originY + dy,
    });

    setPeelAmount((current) => {
      const next = clamp(
        0.18 + Math.max(0, -dy) / 170 + Math.min(Math.abs(dx), 120) / 420,
        0.14,
        0.86,
      );

      if (next > current + 0.03) {
        const now = performance.now();
        if (now - lastMicroPatternAtRef.current > 160) {
          // Custom micro-pattern for tactile peel texture.
          safeTrigger([6, 26, 5]);
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

    if (peelAmountRef.current > 0.56) {
      safeTrigger("success");
      onSnap?.();
    }

    setPeelAmount(0.18);
  };

  const peelCut = clamp(peelAmount * 46, 8, 62);
  const flapLift = peelAmount * 72;
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

  const rawId = useId();
  const filterId = useMemo(() => `sticker-light-${rawId.replaceAll(":", "")}`, [rawId]);

  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      <svg aria-hidden className="absolute h-0 w-0">
        <defs>
          <filter id={filterId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="0.6" result="blur" />
            <feSpecularLighting
              in="blur"
              surfaceScale="5"
              specularConstant="1.05"
              specularExponent="24"
              lightingColor="#ffffff"
              result="specOut"
            >
              <fePointLight x={light.x} y={light.y} z={light.z} />
            </feSpecularLighting>
            <feComposite in="specOut" in2="SourceGraphic" operator="in" result="specMasked" />
            <feBlend in="SourceGraphic" in2="specMasked" mode="screen" />
          </filter>
        </defs>
      </svg>

      <div className="glass-panel relative h-[390px] overflow-hidden rounded-[28px] border-white/20 p-3 sm:h-[460px] sm:p-5">
        <div className="grid-noise absolute inset-0 bg-grain-grid opacity-10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(247,107,42,0.18),transparent_42%)]" />

        <div
          className="relative h-full w-full touch-none select-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={handlePointerEnd}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
            }}
          >
            <div
              className="pointer-events-none absolute -bottom-7 left-7 right-7 h-10 rounded-full bg-black/45 blur-2xl transition-all"
              style={{
                opacity: 0.3 + peelAmount * 0.45,
                transform: `scale(${1 + peelAmount * 0.08})`,
              }}
            />

            <div
              ref={stickerRef}
              className="relative h-[255px] w-[255px] rounded-[32px] border border-white/45 bg-white/80 shadow-sticker sm:h-[320px] sm:w-[320px]"
              onPointerDown={handlePointerDown}
              style={{
                transition: isActive ? "none" : "transform 420ms cubic-bezier(.2,.8,.2,1)",
              }}
            >
              <div
                className="absolute inset-0 rounded-[31px]"
                style={{
                  ...imageStyle,
                  clipPath: `polygon(0 ${peelCut}%, 100% ${peelCut}%, 100% 100%, 0 100%)`,
                  filter: `url(#${filterId})`,
                  transition: isActive
                    ? "none"
                    : "clip-path 420ms cubic-bezier(.2,.8,.2,1), transform 420ms cubic-bezier(.2,.8,.2,1)",
                }}
              />

              <div
                className="absolute inset-0 rounded-[31px] border-b border-white/50"
                style={{
                  ...imageStyle,
                  clipPath: `polygon(0 0, 100% 0, 100% ${peelCut}%, 0 ${peelCut}%)`,
                  transform: `translateY(-${flapLift}px) scaleY(-1)`,
                  transformOrigin: "top center",
                  opacity: clamp(peelAmount * 1.35, 0, 1),
                  filter: `url(#${filterId})`,
                  transition: isActive
                    ? "none"
                    : "clip-path 420ms cubic-bezier(.2,.8,.2,1), transform 420ms cubic-bezier(.2,.8,.2,1), opacity 320ms ease",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/35 to-slate-300/35 mix-blend-screen" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.7),transparent_56%)]" />
              </div>

              <div className="pointer-events-none absolute inset-0 rounded-[31px] ring-1 ring-white/35" />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-sm text-muted">
        Drag to reposition. Pull upward to peel and catch the light.
      </p>
    </div>
  );
}
