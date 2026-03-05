"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface UploadStepProps {
  onFileSelected: (file: File) => void;
}

export function UploadStep({ onFileSelected }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      if (!file.type.startsWith("image/") && !file.name.match(/\.(svg|webp|avif|heic)$/i)) {
        setError("Unsupported file type. Use PNG, JPG, SVG, WEBP, or HEIC.");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`);
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  return (
    <section className="panel p-6 sm:p-8">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
        Your photo, but stickier
      </p>
      <h1 className="mt-4 text-4xl font-bold leading-[1.06] tracking-[-0.02em] text-[var(--text)] sm:text-[3.25rem]">
        Drop an image.{"\u2009"}We&apos;ll handle the rest.
      </h1>
      <p className="mt-4 max-w-2xl text-base text-muted">
        Weatherproof vinyl stickers from your camera roll. Takes about 30 seconds.
      </p>

      <div
        className={`drop-zone mt-7 flex flex-col items-center justify-center gap-3 p-8 text-center${isDragOver ? " is-over" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.svg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
        <p className="text-sm text-muted">
          {isDragOver ? "Drop it like it's hot" : "Drag an image here, or"}
        </p>
        {!isDragOver && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="btn-primary w-auto"
          >
            Choose file
          </button>
        )}
        <p className="text-[11px] tracking-[0.04em] text-muted">
          PNG, JPG, SVG, WEBP, HEIC &mdash; max 10 MB
        </p>
        {error && (
          <p className="mt-1 text-[12px] font-medium text-red-500">{error}</p>
        )}
      </div>
    </section>
  );
}
