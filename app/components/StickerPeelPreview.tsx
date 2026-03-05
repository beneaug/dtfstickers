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
  return Math.max(280, displaySize * 2.0);
}

// --- Audio feedback for peel drag ---
// Replicates web-haptics' proven audio: bandpass-filtered noise with exponential
// decay envelope. Parameters matched exactly to haptics.lochie.me source.
class PeelAudio {
  private ctx: AudioContext | null = null;
  private filter: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private buf: AudioBuffer | null = null;

  init() {
    if (this.ctx || typeof window === "undefined") return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      // Persistent filter + gain chain (web-haptics reuses these)
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = "bandpass";
      this.filter.frequency.value = 4000;
      this.filter.Q.value = 8; // Sharp resonant click (web-haptics uses 8)
      this.gain = this.ctx.createGain();
      this.filter.connect(this.gain);
      this.gain.connect(this.ctx.destination);
      // Pre-allocate 4ms mono noise buffer
      const sr = this.ctx.sampleRate;
      this.buf = this.ctx.createBuffer(1, Math.ceil(sr * 0.004), sr);
      this.ctx.resume();
    } catch { /* unsupported */ }
  }

  /** Play one click. intensity 0-1 controls volume + pitch (matches web-haptics playClick). */
  tick(intensity = 0.5) {
    if (!this.ctx || !this.filter || !this.gain || !this.buf || this.ctx.state !== "running") return;
    try {
      // Regenerate noise with exponential decay envelope (web-haptics: Math.exp(-i/25))
      const d = this.buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 25);
      // Gain: 0.5 × intensity (web-haptics exact formula)
      this.gain.gain.value = 0.5 * intensity;
      // Frequency: 2000-4000Hz scaled by intensity, ±15% random variation
      const baseFreq = 2000 + intensity * 2000;
      this.filter.frequency.value = baseFreq * (1 + (Math.random() - 0.5) * 0.3);
      // Play
      const s = this.ctx.createBufferSource();
      s.buffer = this.buf;
      s.connect(this.filter);
      s.onended = () => s.disconnect();
      s.start();
    } catch { /* silent */ }
  }
}

const isAndroid =
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

// --- Direct haptic via checkbox-switch trick (ios-haptics pattern) ---
// Bypasses web-haptics library entirely. Zero function call overhead between
// the user gesture event and label.click(). Proven pattern from:
// https://github.com/tijnjh/ios-haptics
//
// The label+checkbox is created once and reused. label.click() toggles the
// checkbox, which triggers WebKit's internal Taptic Engine call via
// CheckboxInputType::willDispatchClick → performSwitchHapticFeedback().
let _hapticLabel: HTMLLabelElement | null = null;

function ensureHapticDOM() {
  if (_hapticLabel) return;
  if (typeof document === "undefined") return;
  _hapticLabel = document.createElement("label");
  _hapticLabel.ariaHidden = "true";
  _hapticLabel.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  _hapticLabel.appendChild(input);
  document.head.appendChild(_hapticLabel);
}

/** Single haptic tick. Must be called synchronously within a user gesture. */
function hapticTick() {
  try {
    ensureHapticDOM();
    _hapticLabel?.click();
  } catch { /* unsupported */ }
}

/** Start a sustained buzz (repeated ticks via rAF). Returns cancel function.
 *  First tick fires synchronously (within user gesture). Subsequent ticks
 *  fire in rAF within WebKit's 1-second transient activation window. */
function hapticBuzz(durationMs = 1000): () => void {
  ensureHapticDOM();
  _hapticLabel?.click(); // First tick — synchronous, within user gesture
  if (isAndroid) { try { navigator.vibrate?.(durationMs); } catch { /* */ } }
  const start = performance.now();
  let lastClick = 0;
  let rafId: number | null = null;
  const tick = (now: number) => {
    if (now - start >= durationMs) { rafId = null; return; }
    if (now - lastClick >= 16) { // ~60 clicks/sec at max intensity
      try { _hapticLabel?.click(); } catch { /* */ }
      lastClick = now;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return () => { if (rafId !== null) cancelAnimationFrame(rafId); };
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

  // Ref to cancel a running haptic buzz
  const buzzCancelRef = useRef<(() => void) | null>(null);

  // Audio buzz feedback for drag (matches web-haptics audio engine)
  const peelAudioRef = useRef<PeelAudio | null>(null);
  const buzzRafRef = useRef<number | null>(null);
  const buzzLastTickRef = useRef(0);

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

  // Tap-to-activate haptic state:
  // Touch pointerDown is NOT activation-triggering, but pointerUp/click IS.
  // On the first tap (quick touch+release), we fire trigger("buzz") which
  // gives 1 second of Taptic Engine buzz. The sticker enters an "activated"
  // state. If the user touches again within the activation window, the peel
  // drag happens WITH the buzz still running — creating the illusion of
  // haptic feedback during drag.
  const activatedRef = useRef(false);
  const activationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Spring state
  const peelSpring = useRef<SpringState>({ value: REST_PEEL, velocity: 0 });
  const animatingRef = useRef(false);
  const springConfigRef = useRef(SPRING_SNAP_BACK);

  // Hint refs
  const firstPeelRef = useRef(false);
  const hintRef = useRef<HTMLParagraphElement>(null);

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

  // Unlock AudioContext on first user interaction so drag audio works immediately
  useEffect(() => {
    if (!peelAudioRef.current) peelAudioRef.current = new PeelAudio();
    const audio = peelAudioRef.current;
    const unlock = () => {
      audio.init();
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
    };
    document.addEventListener("touchstart", unlock, { passive: true });
    document.addEventListener("click", unlock);
    return () => {
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
    };
  }, []);

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
  //
  // Haptic strategy:
  //
  // 1. Direct checkbox-switch trick (ios-haptics pattern) — no library.
  //    hapticTick() / hapticBuzz() call label.click() DIRECTLY, with zero
  //    intermediate layers, in the same synchronous call frame.
  //
  // 2. Haptics fire from onClick (click event), which is the ONLY event
  //    type confirmed to work for the checkbox-switch haptic on iOS Safari.
  //    The click event fires within the UserGestureIndicator scope of the
  //    preceding pointerup.
  //
  // 3. To ensure click fires for taps, setPointerCapture is DEFERRED to
  //    the first significant pointermove (>8px). Pointer capture suppresses
  //    click synthesis, so taps (no significant movement) get a real click.
  //
  // 4. PeelAudio provides audio feedback during drag (Web Audio API).

  const ACTIVATION_WINDOW = 2500;
  const pointerCapturedRef = useRef(false);

  const startBuzzAudio = useCallback(() => {
    if (!peelAudioRef.current) peelAudioRef.current = new PeelAudio();
    peelAudioRef.current.init();
    buzzLastTickRef.current = 0;
    if (buzzRafRef.current) cancelAnimationFrame(buzzRafRef.current);
    const audio = peelAudioRef.current;
    const buzzLoop = (ts: number) => {
      if (activePointerRef.current === null) { buzzRafRef.current = null; return; }
      const peel = peelRef.current;
      const interval = 16 + (1 - peel) * 84;
      if (ts - buzzLastTickRef.current >= interval && peel > REST_PEEL + 0.02) {
        audio.tick(peel);
        if (isAndroid) { try { navigator.vibrate?.(6); } catch { /* */ } }
        buzzLastTickRef.current = ts;
      }
      buzzRafRef.current = requestAnimationFrame(buzzLoop);
    };
    buzzRafRef.current = requestAnimationFrame(buzzLoop);
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (activePointerRef.current !== null) return;

      activePointerRef.current = event.pointerId;
      animatingRef.current = false;
      snappedRef.current = false;
      pointerCapturedRef.current = false;

      // Unlock audio context
      if (!peelAudioRef.current) peelAudioRef.current = new PeelAudio();
      peelAudioRef.current.init();

      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }
      velocityTracker.current.reset();

      dragStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };

      // Do NOT set pointer capture here — defer to first significant
      // pointermove. Capture suppresses click events, and we need click
      // to fire for taps (only confirmed working event for iOS haptic).

      // If activated (from a prior tap), start audio buzz for drag feedback
      if (activatedRef.current) {
        startBuzzAudio();
      }

      if (!firstPeelRef.current) {
        firstPeelRef.current = true;
        if (hintRef.current) {
          hintRef.current.classList.remove("peel-hint");
          hintRef.current.classList.add("peel-hint-hidden");
        }
      }
    },
    [startBuzzAudio],
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

      // Defer pointer capture until real drag movement (>8px).
      // This ensures click fires for taps (required for iOS haptic).
      if (!pointerCapturedRef.current && dist > 8) {
        containerRef.current?.setPointerCapture(event.pointerId);
        pointerCapturedRef.current = true;
      }

      // Start audio buzz once drag movement begins (if not already running)
      if (dist > 15 && buzzRafRef.current === null) {
        startBuzzAudio();
      }

      // Smooth angle blending
      const rawAngle = continuousDragAngle(dx, dy, angleRef.current);
      const blend = clamp((dist - 40) / 250, 0, 0.06);
      angleRef.current = lerpAngle(angleRef.current, rawAngle, blend);

      const rawDisplacement = clamp(dist / dragRange, 0, 1);
      const peelAmount = clamp(
        REST_PEEL + adhesiveCurve(rawDisplacement) * (1 - REST_PEEL),
        REST_PEEL,
        1,
      );
      peelRef.current = peelAmount;

      if (!rafPendingRef.current) {
        rafPendingRef.current = true;
        requestAnimationFrame(() => {
          rafPendingRef.current = false;
          applyPeelToDOM();
        });
      }
    },
    [applyPeelToDOM, dragRange, startBuzzAudio],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== event.pointerId) return;

      if (pointerCapturedRef.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      pointerCapturedRef.current = false;

      activePointerRef.current = null; // Stops buzz audio rAF loop
      if (buzzRafRef.current) { cancelAnimationFrame(buzzRafRef.current); buzzRafRef.current = null; }
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

      // Tap — onClick will handle haptic + activation (click fires after pointerup)
      if (currentPeel <= REST_PEEL + 0.03) {
        return;
      }

      // --- Drag release ---
      // Best-effort haptic from pointerup (may not work on iOS Safari)
      if (currentPeel > SNAP_THRESHOLD && !snappedRef.current) {
        hapticTick();
      }

      if (currentPeel > SNAP_THRESHOLD) {
        peelAudioRef.current?.tick(1.0);
        snappedRef.current = true;
        activatedRef.current = false;
        if (activationTimerRef.current) { clearTimeout(activationTimerRef.current); activationTimerRef.current = null; }
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
        peelAudioRef.current?.tick(0.4);
        activatedRef.current = false;
        if (activationTimerRef.current) { clearTimeout(activationTimerRef.current); activationTimerRef.current = null; }
        runSpringAnimation(REST_PEEL, SPRING_SNAP_BACK, () => {
          angleRef.current = DEFAULT_DRAG_ANGLE;
          applyPeelToDOM();
        });
      }
    },
    [runSpringAnimation, onSnap, getBurstPos, applyPeelToDOM],
  );

  // --- Click handler for tap haptic ---
  // onClick is the ONLY event confirmed to propagate user activation for
  // the checkbox-switch haptic on iOS Safari. By deferring setPointerCapture
  // to first significant pointermove, click fires normally for taps.
  // This uses the exact same mechanism as the working test button.
  const handleClick = useCallback(() => {
    if (snappedRef.current || activatedRef.current) return;
    if (peelRef.current > REST_PEEL + 0.03) return; // Not a tap

    // Fire haptic — same path as test button: click event → label.click()
    buzzCancelRef.current?.();
    buzzCancelRef.current = hapticBuzz(1000);

    // Activate the sticker
    activatedRef.current = true;
    peelRef.current = 0.15;
    applyPeelToDOM();
    if (activationTimerRef.current) clearTimeout(activationTimerRef.current);
    activationTimerRef.current = setTimeout(() => {
      activatedRef.current = false;
      activationTimerRef.current = null;
      if (activePointerRef.current === null && !snappedRef.current) {
        runSpringAnimation(REST_PEEL, SPRING_SNAP_BACK, () => {
          angleRef.current = DEFAULT_DRAG_ANGLE;
          applyPeelToDOM();
        });
      }
    }, ACTIVATION_WINDOW);
  }, [applyPeelToDOM, runSpringAnimation]);

  useEffect(() => {
    return () => {
      animatingRef.current = false;
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      if (buzzRafRef.current) cancelAnimationFrame(buzzRafRef.current);
      if (activationTimerRef.current) clearTimeout(activationTimerRef.current);
      buzzCancelRef.current?.();
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
        style={{
          touchAction: "none",
          WebkitTapHighlightColor: "transparent",
        }}
        onClick={handleClick}
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
                <feFlood floodColor="#e8e5de" result="flood" />
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
              borderRadius: isSquareCut ? 4 : undefined,
            }}
          >
            {/* Solid opaque backing — prevents any bleed-through */}
            {isSquareCut ? (
              <div style={{
                position: "absolute",
                inset: 0,
                background: "#e8e5de",
                borderRadius: 4,
              }} />
            ) : (
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
            {/* Adhesive surface — warm tacky appearance with wet gloss */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                borderRadius: isSquareCut ? 4 : undefined,
                background: [
                  // Broad warm tint — sticky adhesive base tone
                  "linear-gradient(180deg, rgba(245,235,210,0.35) 0%, rgba(235,225,200,0.25) 100%)",
                  // Primary specular highlight — wet surface reflection
                  "linear-gradient(148deg, transparent 22%, rgba(255,255,255,0.06) 34%, rgba(255,255,255,0.22) 43%, rgba(255,255,255,0.38) 48%, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0.38) 52%, rgba(255,255,255,0.22) 57%, rgba(255,255,255,0.06) 66%, transparent 78%)",
                  // Secondary softer reflection — adds depth
                  "linear-gradient(225deg, transparent 40%, rgba(255,255,255,0.08) 52%, rgba(255,255,255,0.14) 58%, rgba(255,255,255,0.08) 64%, transparent 76%)",
                  // Soft radial glow — mimics overhead light on glossy surface
                  "radial-gradient(ellipse at 48% 38%, rgba(255,252,240,0.22) 0%, rgba(255,250,230,0.08) 40%, transparent 65%)",
                ].join(", "),
                ...(isSquareCut ? {} : {
                  WebkitMaskImage: `url(${imageUrl})`,
                  WebkitMaskSize: "100% 100%",
                  WebkitMaskRepeat: "no-repeat",
                  maskImage: `url(${imageUrl})`,
                  maskSize: "100% 100%",
                  maskRepeat: "no-repeat",
                }),
              }}
            />
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-0 w-full text-center">
        <p
          ref={hintRef}
          className="peel-hint text-[11px] tracking-[0.04em] text-muted"
        >
          Tap, then peel
        </p>
        <button
          type="button"
          className="mt-1 text-[10px] tracking-[0.03em] text-muted/50 hover:text-muted/80 transition-colors"
          style={{ appearance: "none", background: "none", border: "none", cursor: "pointer", padding: "2px 8px" }}
          onClick={() => hapticBuzz(1000)}
        >
          tap to test haptics
        </button>
      </div>
    </div>
  );
}
