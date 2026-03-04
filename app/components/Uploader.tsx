"use client";

import { useRef, type ChangeEvent } from "react";

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
    <div className="flex flex-col items-start gap-2">
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
        className={
          subtle
            ? "rounded-full bg-[var(--bg-soft)] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text)] transition hover:opacity-70 active:scale-[0.97]"
            : "btn-primary w-auto"
        }
      >
        {label}
      </button>
      {!subtle ? (
        <p className="text-[11px] tracking-[0.04em] text-muted">
          PNG, JPG, HEIC. Private until checkout.
        </p>
      ) : null}
    </div>
  );
}
