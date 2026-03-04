"use client";

import { Uploader } from "../Uploader";

interface UploadStepProps {
  onFileSelected: (file: File) => void;
}

export function UploadStep({ onFileSelected }: UploadStepProps) {
  return (
    <section className="panel p-6 sm:p-8">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
        Upload your photo → get a sticker preview instantly
      </p>
      <h1 className="mt-4 text-4xl font-semibold leading-[1.08] text-[#171717] sm:text-6xl">
        Turn any photo into a premium sticker.
      </h1>
      <p className="mt-4 max-w-2xl text-base text-muted">
        Upload → peel preview → order in 30 seconds.
      </p>
      <div className="mt-7">
        <Uploader onFileSelected={onFileSelected} label="Upload photo" />
      </div>
    </section>
  );
}
