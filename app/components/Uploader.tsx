"use client";

import { useRef } from "react";
import type { ChangeEvent } from "react";

interface UploaderProps {
  onFileSelected: (file: File) => void;
  label?: string;
  subtle?: boolean;
}

export function Uploader({
  onFileSelected,
  label = "Upload photo",
  subtle = false,
}: UploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    onFileSelected(file);
    event.target.value = "";
  };

  return (
    <div className="flex flex-col items-start gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={[
          "rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] transition active:scale-[0.98]",
          subtle
            ? "border border-white/30 bg-white/8 text-white hover:bg-white/14"
            : "bg-ember text-white shadow-[0_14px_30px_rgba(247,107,42,0.35)] hover:bg-[#ff7b42]",
        ].join(" ")}
      >
        {label}
      </button>
      {!subtle ? (
        <p className="text-sm text-muted">
          PNG, JPG, HEIC. Your image stays private until checkout.
        </p>
      ) : null}
    </div>
  );
}
