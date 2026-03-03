"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebHaptics } from "web-haptics/react";
import { CheckoutModal, CheckoutFormData } from "./components/CheckoutModal";
import { OptionsPanel } from "./components/OptionsPanel";
import { StickerPeelPreview } from "./components/StickerPeelPreview";
import { Uploader } from "./components/Uploader";
import { StickerFinish, StickerSize, calculatePricing } from "./lib/pricing";
import { formatCurrency } from "./lib/utils";

const scrollTo = (id: string) => {
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

  const runHaptic = useCallback(
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
    const next = URL.createObjectURL(file);
    objectUrlRef.current = next;
    setImageUrl(next);
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
    runHaptic("success");
    setCheckoutSession((current) => current + 1);
    setCheckoutOpen(true);
  };

  return (
    <main className="px-4 pb-12 pt-6 sm:px-6 sm:pt-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted">12ozsticke.rs</p>
            <p className="mt-1 text-sm text-muted">Premium custom stickers</p>
          </div>
          {imageUrl ? <Uploader onFileSelected={handleFileSelected} label="Replace photo" subtle /> : null}
        </header>

        {!imageUrl ? (
          <section className="surface rounded-3xl p-7 sm:p-10">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
              Upload your photo → get a sticker preview instantly
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] sm:text-6xl">
              Turn any photo into a premium sticker.
            </h1>
            <p className="mt-4 text-base text-muted sm:text-lg">
              Upload → peel preview → order in 30 seconds.
            </p>

            <div className="mt-8">
              <Uploader onFileSelected={handleFileSelected} label="Upload photo" />
            </div>

            <div className="mt-8 flex items-center gap-5 text-sm">
              <button type="button" onClick={() => scrollTo("materials")} className="ghost-link">
                See materials
              </button>
              <button type="button" onClick={() => scrollTo("pricing")} className="ghost-link">
                Pricing
              </button>
            </div>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <div className="surface-soft rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Preview</p>
                <h1 className="mt-1 text-3xl font-semibold leading-tight sm:text-4xl">
                  Peel your sticker before you buy.
                </h1>
                <p className="mt-2 text-sm text-muted">
                  Uploaded file: <span className="text-white/95">{fileName}</span>
                </p>
              </div>

              <StickerPeelPreview imageUrl={imageUrl} onSnap={() => runHaptic("success")} />
            </div>

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

        <section id="materials" className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="surface-soft rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Material</p>
            <p className="mt-1 text-sm font-medium">Weatherproof vinyl</p>
          </div>
          <div className="surface-soft rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Finish options</p>
            <p className="mt-1 text-sm font-medium">Matte, gloss, holographic</p>
          </div>
          <div className="surface-soft rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Guarantee</p>
            <p className="mt-1 text-sm font-medium">Love it or we rerun it</p>
          </div>
        </section>

        <section id="pricing" className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 text-sm">
          <p className="text-muted">Free US shipping over $65</p>
          <p className="font-semibold">{formatCurrency(pricing.total)} current build</p>
        </section>

        {lastCheckout ? (
          <p className="mt-3 text-sm text-green-300">Last order placed for {lastCheckout.email}.</p>
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
          runHaptic("success");
        }}
      />
    </main>
  );
}

