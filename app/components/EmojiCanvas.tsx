"use client";

import { useEffect, useRef } from "react";
import { registerCanvas, unregisterCanvas } from "../lib/emoji-burst";

export function EmojiCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (ref.current) registerCanvas(ref.current);
    return () => unregisterCanvas();
  }, []);

  return (
    <canvas
      ref={ref}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 99999,
      }}
      aria-hidden
    />
  );
}
