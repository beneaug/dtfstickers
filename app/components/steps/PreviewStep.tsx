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
        <p className="truncate text-sm text-muted">{fileName}</p>
        <Uploader onFileSelected={onFileSelected} label="Replace" subtle />
      </div>

      <button type="button" onClick={onContinue} className="btn-primary">
        Continue
      </button>
    </section>
  );
}
