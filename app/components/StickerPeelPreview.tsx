"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
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
  detectCorner,
  cornerToShaderAngle,
  type GestureMode,
} from "../lib/peel-physics";
import vertexShader from "../lib/shaders/peel.vert.glsl";
import fragmentShader from "../lib/shaders/peel.frag.glsl";

interface StickerPeelPreviewProps {
  imageUrl: string;
  onSnap?: () => void;
}

const REST_PEEL = 0.1;
const SNAP_THRESHOLD = 0.56;
const STICKER_SIZE = 2; // world units
const SEGMENTS = 64;

// --- StickerMesh: inner R3F component ---

interface StickerMeshProps {
  imageUrl: string;
  peelRef: React.MutableRefObject<number>;
  peelAngleRef: React.MutableRefObject<number>;
  lightPosRef: React.MutableRefObject<THREE.Vector3>;
}

function StickerMesh({
  imageUrl,
  peelRef,
  peelAngleRef,
  lightPosRef,
}: StickerMeshProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const texture = useTexture(imageUrl);
  const { size } = useThree();

  // Compute scale to fit sticker in view
  const scale = Math.min(size.width, size.height) < 500 ? 1.6 : 2.0;

  useEffect(() => {
    if (texture) {
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
    }
  }, [texture]);

  const uniforms = useRef({
    uMap: { value: texture },
    uPeel: { value: REST_PEEL },
    uPeelAngle: { value: 0.0 },
    uCylinderRadius: { value: 0.12 },
    uLightPos: { value: new THREE.Vector3(2, 2, 3) },
    uTime: { value: 0 },
    uOpacity: { value: 1.0 },
  });

  // Update texture when imageUrl changes
  useEffect(() => {
    if (matRef.current && texture) {
      matRef.current.uniforms.uMap.value = texture;
    }
  }, [texture]);

  useFrame((_, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uPeel.value = peelRef.current;
    u.uPeelAngle.value = peelAngleRef.current;
    u.uLightPos.value.copy(lightPosRef.current);
    u.uTime.value += delta;

    // Tighter curl as peel progresses
    const peel = peelRef.current;
    u.uCylinderRadius.value = THREE.MathUtils.lerp(0.14, 0.06, peel);
  });

  return (
    <mesh scale={[scale, scale, 1]}>
      <planeGeometry args={[STICKER_SIZE, STICKER_SIZE, SEGMENTS, SEGMENTS]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms.current}
        transparent
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// --- Main Component ---

export function StickerPeelPreview({
  imageUrl,
  onSnap,
}: StickerPeelPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // All interaction state lives in refs for zero-rerender gesture handling
  const peelRef = useRef(REST_PEEL);
  const peelAngleRef = useRef(0); // top-right default
  const lightPosRef = useRef(new THREE.Vector3(2, 2, 3));
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

  // Spring states for animation
  const peelSpring = useRef<SpringState>({ value: REST_PEEL, velocity: 0 });
  const posXSpring = useRef<SpringState>({ value: 0, velocity: 0 });
  const posYSpring = useRef<SpringState>({ value: 0, velocity: 0 });
  const animatingRef = useRef(false);
  const springConfigRef = useRef(SPRING_SNAP_BACK);

  // React state only for CSS shadow + instruction text
  const [shadowOpacity, setShadowOpacity] = useState(0.22);
  const [positionState, setPositionState] = useState({ x: 0, y: 0 });
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
        const dt = Math.min((now - lastTime) / 1000, 0.033); // cap at ~30fps dt
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

        // Update CSS state periodically
        setShadowOpacity(clamp(0.22 + peelRef.current * 0.25, 0.2, 0.55));
        setPositionState({ ...positionRef.current });

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
    [safeHaptic],
  );

  // --- Pointer Handlers ---

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (activePointerRef.current !== null) return;

      activePointerRef.current = event.pointerId;
      animatingRef.current = false; // stop any running spring
      snappedRef.current = false;
      gestureRef.current = "pending";
      adhesiveBreakRef.current = false;
      velocityTracker.current.reset();

      // Cache rect
      rectRef.current =
        containerRef.current?.getBoundingClientRect() ?? null;
      const rect = rectRef.current;

      dragStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        posX: positionRef.current.x,
        posY: positionRef.current.y,
      };

      event.currentTarget.setPointerCapture(event.pointerId);
      setIsActive(true);

      // Detect which corner user grabbed
      if (rect) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const { peelAngle } = detectCorner(
          event.clientX,
          event.clientY,
          cx,
          cy,
        );
        const { corner } = detectCorner(
          event.clientX,
          event.clientY,
          cx,
          cy,
        );
        peelAngleRef.current = cornerToShaderAngle(corner);
        // Store peel gesture angle for gesture classification
        (dragStartRef.current as unknown as Record<string, number>).peelGestureAngle = peelAngle;
      }

      // Update light
      if (rect) {
        const nx =
          ((event.clientX - rect.left) / rect.width) * 4 - 2;
        const ny =
          -(((event.clientY - rect.top) / rect.height) * 4 - 2);
        lightPosRef.current.set(nx, ny, 3);
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

      // Always update light position
      if (rect) {
        const nx =
          ((event.clientX - rect.left) / rect.width) * 4 - 2;
        const ny =
          -(((event.clientY - rect.top) / rect.height) * 4 - 2);
        lightPosRef.current.set(nx, ny, 3);
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
        const peelGestureAngle = (dragStartRef.current as unknown as Record<string, number>).peelGestureAngle ?? (3 * Math.PI) / 4;
        gestureRef.current = classifyGesture(dx, dy, peelGestureAngle);
      }

      if (gestureRef.current === "reposition") {
        // Move sticker, don't peel
        positionRef.current = {
          x: dragStartRef.current.posX + dx,
          y: dragStartRef.current.posY + dy,
        };
        setPositionState({ ...positionRef.current });
        return;
      }

      // Peel mode
      // Project drag along peel axis → compute raw displacement
      const rawDisplacement = clamp(-dy / 200, 0, 1);
      const horizontalTension = clamp(Math.abs(dx) / 400, 0, 0.12);
      const totalRaw = clamp(rawDisplacement + horizontalTension, 0, 1);

      // Apply adhesive curve
      const peelAmount = clamp(
        REST_PEEL + adhesiveCurve(totalRaw) * (1 - REST_PEEL),
        REST_PEEL,
        1,
      );
      peelRef.current = peelAmount;

      // Shadow tracks peel
      setShadowOpacity(clamp(0.22 + peelAmount * 0.25, 0.2, 0.55));

      // Also allow some repositioning during peel (reduced)
      positionRef.current = {
        x: dragStartRef.current.posX + dx * 0.3,
        y: dragStartRef.current.posY + dy * 0.3,
      };
      setPositionState({ ...positionRef.current });

      // --- Haptics ---

      // Adhesive break haptic
      if (!adhesiveBreakRef.current && peelAmount > 0.18) {
        adhesiveBreakRef.current = true;
        safeHaptic([35, 20, 20]);
      }

      // Continuous peel texture — speed-based intervals
      const vel = velocityTracker.current.get();
      if (peelAmount > peelRef.current - 0.001) {
        // Peeling forward
        const now = performance.now();
        const interval = Math.max(60, 200 - vel.speed * 120);
        if (now - lastMicroRef.current > interval) {
          const intensity = Math.round(
            clamp(4 + vel.speed * 8, 4, 14),
          );
          safeHaptic([intensity, 20, Math.round(intensity * 0.7)]);
          lastMicroRef.current = now;
        }
      }

      // High-peel resistance buzz
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
    [safeHaptic],
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

      // Inject velocity into spring
      peelSpring.current.velocity = -vel.vy * 0.8;

      if (currentPeel > SNAP_THRESHOLD) {
        // Snap forward to full peel
        safeHaptic("success");
        snappedRef.current = true;
        runSpringAnimation(1.0, SPRING_SNAP_FORWARD);

        // Fire onSnap after a brief delay for the animation to start
        setTimeout(() => onSnap?.(), 120);
      } else {
        // Snap back to rest
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

  return (
    <div className="panel relative h-[420px] w-full overflow-hidden p-4 sm:h-[480px] sm:p-5">
      <div
        ref={containerRef}
        className="relative h-full w-full touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{ willChange: isActive ? "transform" : "auto" }}
      >
        {/* Sticker position wrapper */}
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            transform: `translate(calc(-50% + ${positionState.x}px), calc(-50% + ${positionState.y}px))`,
          }}
        >
          {/* Drop shadow (CSS, cheaper than WebGL) */}
          <div
            className="pointer-events-none absolute left-8 right-8 top-[calc(100%+8px)] h-8 rounded-full bg-black/20 blur-xl transition"
            style={{
              opacity: shadowOpacity,
              transform: `scale(${1 + peelRef.current * 0.035})`,
            }}
          />

          {/* R3F Canvas */}
          <div className="h-[250px] w-[250px] sm:h-[320px] sm:w-[320px]">
            <Canvas
              camera={{ position: [0, 0, 5], fov: 35 }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
              style={{
                touchAction: "none",
                background: "transparent",
                borderRadius: "30px",
              }}
            >
              <StickerMesh
                imageUrl={imageUrl}
                peelRef={peelRef}
                peelAngleRef={peelAngleRef}
                lightPosRef={lightPosRef}
              />
            </Canvas>
          </div>
        </div>
      </div>

      <p className="absolute bottom-3 left-0 w-full text-center text-[11px] uppercase tracking-[0.08em] text-muted">
        Drag to position. Pull upward to peel.
      </p>
    </div>
  );
}
