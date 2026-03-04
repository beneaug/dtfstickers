"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebHaptics } from "web-haptics/react";
import type { CheckoutFormData } from "../components/CheckoutModal";
import { StickerFinish, StickerSize, calculatePricing } from "./pricing";
import { burst } from "./emoji-burst";
import { formatCurrency } from "./utils";
import { WizardStep, WIZARD_STEPS, stepIndex } from "./wizard";

const PASTELS = [
  "#dbeafe", "#e0e7ff", "#ede9fe", "#fae8ff", "#fce7f3",
  "#d1fae5", "#ccfbf1", "#cffafe", "#e0f2fe", "#dcfce7",
  "#c7d2fe", "#ddd6fe", "#f5d0fe", "#a7f3d0", "#99f6e4",
];

function randomPastel(): string {
  return PASTELS[Math.floor(Math.random() * PASTELS.length)];
}

export function useWizard() {
  const [step, setStep] = useState<WizardStep>("upload");
  const [direction, setDirection] = useState<1 | -1>(1);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("your-image.jpg");
  const [size, setSize] = useState<StickerSize>("3x3");
  const [quantity, setQuantity] = useState(100);
  const [finish, setFinish] = useState<StickerFinish>("matte");
  const [lastCheckout, setLastCheckout] = useState<CheckoutFormData | null>(null);
  const [bgColor, setBgColor] = useState<string | undefined>(undefined);

  const objectUrlRef = useRef<string | null>(null);

  const debugHaptics = process.env.NEXT_PUBLIC_HAPTICS_DEBUG === "1";
  const { trigger, isSupported } = useWebHaptics({ debug: debugHaptics });

  const safeHaptic = useCallback(
    (pattern: string | number[]) => {
      if (!isSupported) return;
      try { trigger(pattern as never); } catch { /* silent */ }
    },
    [isSupported, trigger],
  );

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const goTo = useCallback(
    (target: WizardStep) => {
      setDirection(stepIndex(target) >= stepIndex(step) ? 1 : -1);
      setStep(target);
      safeHaptic("nudge");
    },
    [step, safeHaptic],
  );

  const goNext = useCallback(() => {
    const idx = stepIndex(step);
    if (idx < WIZARD_STEPS.length - 1) goTo(WIZARD_STEPS[idx + 1]);
  }, [step, goTo]);

  const goBack = useCallback(() => {
    const idx = stepIndex(step);
    if (idx > 0) goTo(WIZARD_STEPS[idx - 1]);
  }, [step, goTo]);

  const handleFileSelected = useCallback(
    (file: File) => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const nextUrl = URL.createObjectURL(file);
      objectUrlRef.current = nextUrl;
      setImageUrl(nextUrl);
      setFileName(file.name);
      setLastCheckout(null);
      setBgColor(randomPastel());

      requestAnimationFrame(() => {
        burst(window.innerWidth / 2, window.innerHeight / 3, ["📸", "✨", "🎨", "🌈"], 6);
      });

      setDirection(1);
      setStep("preview");
      safeHaptic("nudge");
    },
    [safeHaptic],
  );

  const pricing = useMemo(
    () => calculatePricing({ size, quantity, finish }),
    [size, quantity, finish],
  );

  const itemSummary = `${quantity} × ${size} ${finish} stickers`;

  const handleAddToCart = useCallback(() => {
    safeHaptic("success");
    burst(window.innerWidth / 2, window.innerHeight / 2, ["🛒", "✨", "🎉"], 5);
    setDirection(1);
    setStep("checkout");
  }, [safeHaptic]);

  const handleCheckoutComplete = useCallback(
    (data: CheckoutFormData) => {
      setLastCheckout(data);
      safeHaptic("success");
    },
    [safeHaptic],
  );

  return {
    step, direction, goTo, goNext, goBack,
    imageUrl, fileName, size, setSize, quantity, setQuantity,
    finish, setFinish, bgColor, pricing, itemSummary, lastCheckout,
    handleFileSelected, handleAddToCart, handleCheckoutComplete, safeHaptic,
    totalFormatted: formatCurrency(pricing.total),
  };
}

export type WizardState = ReturnType<typeof useWizard>;
