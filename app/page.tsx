"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebHaptics } from "web-haptics/react";
import { CheckoutModal, CheckoutFormData } from "./components/CheckoutModal";
import { OptionsPanel } from "./components/OptionsPanel";
import { StickerPeelPreview } from "./components/StickerPeelPreview";
import { Uploader } from "./components/Uploader";
import { StickerFinish, StickerSize, calculatePricing } from "./lib/pricing";
import { formatCurrency } from "./lib/utils";

const scrollToSection = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

export default function HomePage() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("your-image.jpg");
  const [size, setSize] = useState<StickerSize>("3x3");
  const [quantity, setQuantity] = useState(100);
  const [finish, setFinish] = useState<StickerFinish>("matte");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutSession, setCheckoutSession] = useState(0);
  const [lastCheckout, setLastCheckout] = useState<CheckoutFormData | null>(null);

  const objectUrlRef = useRef<string | null>(null);
  const debugHaptics = process.env.NEXT_PUBLIC_HAPTICS_DEBUG === "1";
  const { trigger, isSupported } = useWebHaptics({ debug: debugHaptics });

  const safeHaptic = useCallback(
    (pattern: string | number[]) => {
      if (!isSupported) return;
      try {
        trigger(pattern as never);
      } catch {
        // Ignore unsupported environments.
      }
    },
    [isSupported, trigger],
  );

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const handleFileSelected = useCallback((file: File) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const nextUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextUrl;
    setImageUrl(nextUrl);
    setFileName(file.name);
    setCheckoutOpen(false);
    setLastCheckout(null);
  }, []);

  const pricing = useMemo(
    () =>
      calculatePricing({
        size,
        quantity,
        finish,
      }),
    [size, quantity, finish],
  );

  const itemSummary = `${quantity} × ${size} ${finish} stickers`;

  const handleAddToCart = () => {
    safeHaptic("success");
    setCheckoutSession((current) => current + 1);
    setCheckoutOpen(true);
  };

  return (
    <main className="px-4 pb-12 pt-6 sm:px-6 sm:pt-8">
      <div className="mx-auto w-full max-w-[42rem]">
        <header className="mb-8 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted">12ozsticke.rs</p>
            <p className="mt-1 text-sm text-muted">Premium custom stickers</p>
          </div>
          {imageUrl ? <Uploader onFileSelected={handleFileSelected} label="Replace photo" subtle /> : null}
        </header>

        {!imageUrl ? (
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
              <Uploader onFileSelected={handleFileSelected} label="Upload photo" />
            </div>

            <div className="mt-7 flex flex-wrap gap-5 text-sm">
              <button
                type="button"
                onClick={() => scrollToSection("materials")}
                className="ghost-link"
              >
                See materials
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("pricing")}
                className="ghost-link"
              >
                Pricing
              </button>
            </div>
          </section>
        ) : (
          <section className="space-y-4">
            <div className="panel-soft p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Preview</p>
              <h1 className="mt-1 text-[1.9rem] font-semibold leading-tight text-[#171717]">
                Peel your sticker before you buy.
              </h1>
              <p className="mt-2 text-sm text-muted">
                File ready: <span className="text-[#171717]">{fileName}</span>
              </p>
            </div>

            <StickerPeelPreview imageUrl={imageUrl} size={size} onSnap={() => safeHaptic("success")} />

            <OptionsPanel
              size={size}
              quantity={quantity}
              finish={finish}
              pricing={pricing}
              onSizeChange={setSize}
              onQuantityChange={setQuantity}
              onFinishChange={setFinish}
              onAddToCart={handleAddToCart}
            />
          </section>
        )}

        <section id="materials" className="mt-4 grid gap-2 sm:grid-cols-3">
          <article className="panel-soft p-3.5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Material</p>
            <p className="mt-1 text-sm font-medium text-[#171717]">Weatherproof vinyl</p>
          </article>
          <article className="panel-soft p-3.5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Finish</p>
            <p className="mt-1 text-sm font-medium text-[#171717]">Matte · Gloss · Holographic</p>
          </article>
          <article className="panel-soft p-3.5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Guarantee</p>
            <p className="mt-1 text-sm font-medium text-[#171717]">Love it or rerun</p>
          </article>
        </section>

        <section
          id="pricing"
          className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#e4e4e4] bg-white px-4 py-3 text-sm"
        >
          <p className="text-muted">Free US shipping over $65</p>
          <p className="font-semibold text-[#171717]">{formatCurrency(pricing.total)} current build</p>
        </section>

        {lastCheckout ? (
          <p className="mt-3 text-sm text-[#2f6f43]">Last mock order placed for {lastCheckout.email}.</p>
        ) : null}
      </div>

      <CheckoutModal
        key={checkoutSession}
        isOpen={checkoutOpen}
        total={formatCurrency(pricing.total)}
        itemSummary={itemSummary}
        onClose={() => setCheckoutOpen(false)}
        onComplete={(data) => {
          setLastCheckout(data);
          safeHaptic("success");
        }}
      />
    </main>
  );
}

