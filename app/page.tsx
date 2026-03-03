"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebHaptics } from "web-haptics/react";
import { CheckoutModal, CheckoutFormData } from "./components/CheckoutModal";
import { OptionsPanel } from "./components/OptionsPanel";
import { StickerPeelPreview } from "./components/StickerPeelPreview";
import { Uploader } from "./components/Uploader";
import {
  StickerFinish,
  StickerSize,
  calculatePricing,
} from "./lib/pricing";
import { formatCurrency } from "./lib/utils";

const scrollToSection = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

export default function HomePage() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("your-photo.jpg");
  const [size, setSize] = useState<StickerSize>("3x3");
  const [quantity, setQuantity] = useState(100);
  const [finish, setFinish] = useState<StickerFinish>("matte");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutSession, setCheckoutSession] = useState(0);
  const [lastCheckout, setLastCheckout] = useState<CheckoutFormData | null>(null);

  const currentObjectUrlRef = useRef<string | null>(null);
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
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
      }
    };
  }, []);

  const handleFileSelected = useCallback((file: File) => {
    if (currentObjectUrlRef.current) {
      URL.revokeObjectURL(currentObjectUrlRef.current);
    }
    const nextUrl = URL.createObjectURL(file);
    currentObjectUrlRef.current = nextUrl;
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

  const handleCheckoutComplete = (payload: CheckoutFormData) => {
    setLastCheckout(payload);
    safeHaptic("success");
  };

  return (
    <main className="px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-orange-200">12ozsticke.rs</p>
            <p className="text-xs text-muted">Premium custom stickers, done fast.</p>
          </div>
          {imageUrl ? <Uploader onFileSelected={handleFileSelected} label="Replace photo" subtle /> : null}
        </header>

        {!imageUrl ? (
          <section className="glass-panel relative overflow-hidden rounded-[32px] p-6 sm:p-10">
            <div className="absolute -right-16 top-[-70px] h-52 w-52 rounded-full bg-orange-500/25 blur-3xl" />
            <div className="absolute -left-8 bottom-[-110px] h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />

            <div className="relative z-10 max-w-2xl space-y-6">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-orange-200">
                Upload your photo → get a sticker preview instantly
              </p>

              <h1 className="text-4xl font-semibold leading-tight sm:text-6xl">
                Turn any photo into a premium sticker.
              </h1>

              <p className="max-w-lg text-lg text-muted">
                Upload → peel preview → order in 30 seconds.
              </p>

              <Uploader onFileSelected={handleFileSelected} label="Upload photo" />

              <div className="flex flex-wrap gap-5 text-sm">
                <button
                  type="button"
                  onClick={() => scrollToSection("materials")}
                  className="text-muted underline-offset-4 transition hover:text-white hover:underline"
                >
                  See materials
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection("pricing")}
                  className="text-muted underline-offset-4 transition hover:text-white hover:underline"
                >
                  Pricing
                </button>
              </div>

              <div className="grid gap-2 text-sm text-muted sm:grid-cols-3">
                <p>Weatherproof laminate</p>
                <p>2.8 day average production</p>
                <p>10k+ happy repeat buyers</p>
              </div>
            </div>
          </section>
        ) : (
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
            <div className="space-y-4">
              <div className="glass-panel rounded-[28px] p-5 sm:p-6">
                <p className="text-xs uppercase tracking-[0.22em] text-orange-200">Preview mode</p>
                <h1 className="mt-1 text-3xl font-semibold sm:text-5xl">
                  Peel your sticker before you buy.
                </h1>
                <p className="mt-2 max-w-xl text-sm text-muted sm:text-base">
                  Your uploaded art is now the sticker graphic. Move it, peel it, and catch the
                  specular highlight to preview print quality.
                </p>
              </div>

              <StickerPeelPreview imageUrl={imageUrl} onSnap={() => safeHaptic("success")} />

              <p className="text-sm text-muted">
                File ready: <span className="text-white">{fileName}</span>
              </p>
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

        <section id="materials" className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Gloss Vinyl",
              detail: "Mirror-like finish for bright artwork and logo marks.",
            },
            {
              title: "Soft Matte",
              detail: "Low-glare premium look for illustrations and labels.",
            },
            {
              title: "Holographic",
              detail: "Iridescent film with UV laminate for high-impact drops.",
            },
          ].map((material) => (
            <article key={material.title} className="glass-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-orange-200">Material</p>
              <h2 className="mt-1 text-2xl">{material.title}</h2>
              <p className="mt-2 text-sm text-muted">{material.detail}</p>
            </article>
          ))}
        </section>

        <section id="pricing" className="mt-6 rounded-[24px] border border-white/15 bg-black/20 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-orange-200">Pricing snapshot</p>
              <h2 className="text-2xl font-semibold">Clear pricing, no surprises.</h2>
            </div>
            <p className="text-sm text-muted">Free US shipping over $65</p>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-3">
            <p>25 qty starts at {formatCurrency(calculatePricing({ size: "3x3", quantity: 25, finish: "matte" }).total)}</p>
            <p>
              100 qty starts at{" "}
              {formatCurrency(calculatePricing({ size: "3x3", quantity: 100, finish: "matte" }).total)}
            </p>
            <p>
              300 qty starts at{" "}
              {formatCurrency(calculatePricing({ size: "3x3", quantity: 300, finish: "matte" }).total)}
            </p>
          </div>
          {lastCheckout ? (
            <p className="mt-3 text-sm text-green-300">
              Last mock order placed for {lastCheckout.email}.
            </p>
          ) : null}
        </section>
      </div>

      <CheckoutModal
        key={checkoutSession}
        isOpen={checkoutOpen}
        total={formatCurrency(pricing.total)}
        itemSummary={itemSummary}
        onClose={() => setCheckoutOpen(false)}
        onComplete={handleCheckoutComplete}
      />
    </main>
  );
}
