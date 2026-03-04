"use client";

import { StickerPeelPreview } from "../StickerPeelPreview";
import { Uploader } from "../Uploader";
import type { StickerSize } from "../../lib/pricing";

interface PreviewStepProps {
  imageUrl: string;
  fileName: string;
  size: StickerSize;
  bgColor?: string;
  onSnap: () => void;
  onContinue: () => void;
  onFileSelected: (file: File) => void;
}

export function PreviewStep({
  imageUrl,
  fileName,
  size,
  bgColor,
  onSnap,
  onContinue,
  onFileSelected,
}: PreviewStepProps) {
  return (
    <section className="space-y-3">
      <StickerPeelPreview
        imageUrl={imageUrl}
        size={size}
        bgColor={bgColor}
        onSnap={onSnap}
      />

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-sm text-muted truncate">
          {fileName}
        </p>
        <Uploader onFileSelected={onFileSelected} label="Replace" subtle />
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="w-full rounded-full border border-[#ff935f] bg-[#ff6a2d] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-[#ff7a42]"
      >
        Continue
      </button>
    </section>
  );
}
