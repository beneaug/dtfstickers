"use client";

import { StickerPeelPreview } from "../StickerPeelPreview";
import { OptionsPanel } from "../OptionsPanel";
import { Uploader } from "../Uploader";
import type { StickerSize, StickerFinish, StickerCut, PricingBreakdown } from "../../lib/pricing";

interface PreviewStepProps {
  imageUrl: string;
  fileName: string;
  size: StickerSize;
  quantity: number;
  finish: StickerFinish;
  cut: StickerCut;
  pricing: PricingBreakdown;
  bgColor?: string;
  onSnap: () => void;
  onSizeChange: (size: StickerSize) => void;
  onQuantityChange: (quantity: number) => void;
  onFinishChange: (finish: StickerFinish) => void;
  onCutChange: (cut: StickerCut) => void;
  onAddToCart: () => void;
  onFileSelected: (file: File) => void;
}

export function PreviewStep({
  imageUrl,
  fileName,
  size,
  quantity,
  finish,
  cut,
  pricing,
  bgColor,
  onSnap,
  onSizeChange,
  onQuantityChange,
  onFinishChange,
  onCutChange,
  onAddToCart,
  onFileSelected,
}: PreviewStepProps) {
  return (
    <section className="space-y-3">
      <StickerPeelPreview
        imageUrl={imageUrl}
        size={size}
        finish={finish}
        cut={cut}
        bgColor={bgColor}
        onSnap={onSnap}
      />

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="truncate text-sm text-muted">{fileName}</p>
        <Uploader onFileSelected={onFileSelected} label="Swap" subtle />
      </div>

      <OptionsPanel
        size={size}
        quantity={quantity}
        finish={finish}
        cut={cut}
        pricing={pricing}
        onSizeChange={onSizeChange}
        onQuantityChange={onQuantityChange}
        onFinishChange={onFinishChange}
        onCutChange={onCutChange}
        onAddToCart={onAddToCart}
      />
    </section>
  );
}
