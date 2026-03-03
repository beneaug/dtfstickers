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
        className={[
          "rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition active:scale-[0.98]",
          subtle
            ? "border-[#d9d9d9] bg-white text-[#171717] hover:border-[#bcbcbc]"
            : "border-[#ff935f] bg-[#ff6a2d] text-white hover:bg-[#ff7a42]",
        ].join(" ")}
      >
        {label}
      </button>
      {!subtle ? (
        <p className="text-[11px] uppercase tracking-[0.06em] text-muted">
          PNG, JPG, HEIC. Private until checkout.
        </p>
      ) : null}
    </div>
  );
}

