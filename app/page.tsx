"use client";

import { EmojiCanvas } from "./components/EmojiCanvas";
import { WizardShell } from "./components/WizardShell";
import { WizardProgress } from "./components/WizardProgress";
import { UploadStep } from "./components/steps/UploadStep";
import { PreviewStep } from "./components/steps/PreviewStep";
import { CustomizeStep } from "./components/steps/CustomizeStep";
import { CheckoutStep } from "./components/steps/CheckoutStep";
import { useWizard } from "./lib/useWizard";

export default function HomePage() {
  const w = useWizard();

  const renderStep = () => {
    switch (w.step) {
      case "upload":
        return <UploadStep onFileSelected={w.handleFileSelected} />;

      case "preview":
        return w.imageUrl ? (
          <PreviewStep
            imageUrl={w.imageUrl}
            fileName={w.fileName}
            size={w.size}
            bgColor={w.bgColor}
            onSnap={() => w.safeHaptic("success")}
            onContinue={w.goNext}
            onFileSelected={w.handleFileSelected}
          />
        ) : null;

      case "customize":
        return w.imageUrl ? (
          <CustomizeStep
            imageUrl={w.imageUrl}
            bgColor={w.bgColor}
            size={w.size}
            quantity={w.quantity}
            finish={w.finish}
            pricing={w.pricing}
            onSizeChange={w.setSize}
            onQuantityChange={w.setQuantity}
            onFinishChange={w.setFinish}
            onAddToCart={w.handleAddToCart}
            onBack={w.goBack}
          />
        ) : null;

      case "checkout":
        return (
          <CheckoutStep
            total={w.totalFormatted}
            itemSummary={w.itemSummary}
            onComplete={w.handleCheckoutComplete}
            onBack={w.goBack}
            lastCheckout={w.lastCheckout}
          />
        );
    }
  };

  return (
    <>
      <EmojiCanvas />
      <main className="px-4 pb-12 pt-6 sm:px-6 sm:pt-8">
        <div className="mx-auto w-full max-w-[42rem]">
          <header className="mb-6 text-center">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted">12ozsticke.rs</p>
          </header>

          {w.step !== "upload" && (
            <div className="mb-5">
              <WizardProgress current={w.step} onGoTo={w.goTo} />
            </div>
          )}

          <WizardShell step={w.step} direction={w.direction}>
            {renderStep()}
          </WizardShell>

          {w.step === "upload" && (
            <section className="mt-4 grid gap-2 sm:grid-cols-3">
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
          )}
        </div>
      </main>
    </>
  );
}
