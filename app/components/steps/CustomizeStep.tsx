"use client";

import { OptionsPanel } from "../OptionsPanel";
import type { StickerSize, StickerFinish, PricingBreakdown } from "../../lib/pricing";

interface CustomizeStepProps {
  imageUrl: string;
  bgColor?: string;
  size: StickerSize;
  quantity: number;
  finish: StickerFinish;
  pricing: PricingBreakdown;
  onSizeChange: (size: StickerSize) => void;
  onQuantityChange: (quantity: number) => void;
  onFinishChange: (finish: StickerFinish) => void;
  onAddToCart: () => void;
  onBack: () => void;
}

export function CustomizeStep({
  imageUrl,
  bgColor,
  size,
  quantity,
  finish,
  pricing,
  onSizeChange,
  onQuantityChange,
  onFinishChange,
  onAddToCart,
  onBack,
}: CustomizeStepProps) {
  return (
    <section className="space-y-4">
      {/* Mini preview thumbnail */}
      <div
        className="flex items-center justify-center rounded-2xl p-4"
        style={{
          backgroundColor: bgColor ?? "#f6f7f9",
          transition: "background-color 0.6s ease",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Sticker preview"
          className="h-24 w-24 rounded-lg object-contain"
          draggable={false}
        />
      </div>

      <OptionsPanel
        size={size}
        quantity={quantity}
        finish={finish}
        pricing={pricing}
        onSizeChange={onSizeChange}
        onQuantityChange={onQuantityChange}
        onFinishChange={onFinishChange}
        onAddToCart={onAddToCart}
      />

      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-sm text-muted transition hover:text-[#171717]"
      >
        ← Back to preview
      </button>
    </section>
  );
}
