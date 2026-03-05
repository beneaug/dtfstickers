"use client";

import { useCallback } from "react";
import { haptic } from "../lib/haptics";
import {
  CUT_OPTIONS,
  FINISH_OPTIONS,
  QUANTITY_OPTIONS,
  SIZE_OPTIONS,
  StickerCut,
  StickerFinish,
  StickerSize,
  PricingBreakdown,
} from "../lib/pricing";
import { formatCurrency } from "../lib/utils";

interface OptionsPanelProps {
  size: StickerSize;
  quantity: number;
  finish: StickerFinish;
  cut: StickerCut;
  pricing: PricingBreakdown;
  onSizeChange: (size: StickerSize) => void;
  onQuantityChange: (quantity: number) => void;
  onFinishChange: (finish: StickerFinish) => void;
  onCutChange: (cut: StickerCut) => void;
  onAddToCart: () => void;
}

function Chip<T extends string | number>({
  value,
  label,
  active,
  onSelect,
}: {
  value: T;
  label?: string;
  active: T;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={[
        "rounded-full px-3 py-1.5 text-[12px] font-medium transition-all duration-200 active:scale-[0.95]",
        active === value
          ? "bg-[var(--accent)] text-white"
          : "bg-[var(--bg-soft)] text-[var(--text)] hover:opacity-70",
      ].join(" ")}
    >
      {label ?? value}
    </button>
  );
}

export function OptionsPanel({
  size,
  quantity,
  finish,
  cut,
  pricing,
  onSizeChange,
  onQuantityChange,
  onFinishChange,
  onCutChange,
  onAddToCart,
}: OptionsPanelProps) {
  const hapticSelect = useCallback(
    <T,>(fn: (v: T) => void) =>
      (v: T) => {
        try { haptic("selection"); } catch { /* */ }
        fn(v);
      },
    [],
  );

  return (
    <aside className="panel p-4 sm:p-5">
      <div className="space-y-5">
        <header>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Order</p>
          <h2 className="mt-1 text-[1.35rem] font-bold leading-tight tracking-[-0.01em]">
            Make it yours
          </h2>
        </header>

        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Size</p>
          <div className="flex flex-wrap gap-2">
            {SIZE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                value={option.value}
                active={size}
                onSelect={hapticSelect(onSizeChange)}
              />
            ))}
          </div>
          <p className="text-[11px] tracking-[0.02em] text-muted">
            {SIZE_OPTIONS.find((o) => o.value === size)?.blurb}
          </p>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Quantity</p>
          <div className="flex flex-wrap gap-2">
            {QUANTITY_OPTIONS.map((option) => (
              <Chip
                key={option}
                value={option}
                active={quantity}
                onSelect={hapticSelect(onQuantityChange)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Finish</p>
          <div className="flex flex-wrap gap-2">
            {FINISH_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                value={option.value}
                active={finish}
                onSelect={hapticSelect(onFinishChange)}
              />
            ))}
          </div>
          <p className="text-[11px] tracking-[0.02em] text-muted">
            {FINISH_OPTIONS.find((o) => o.value === finish)?.blurb}
          </p>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Cut</p>
          <div className="flex flex-wrap gap-2">
            {CUT_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                value={option.value}
                label={option.label}
                active={cut}
                onSelect={hapticSelect(onCutChange)}
              />
            ))}
          </div>
          <p className="text-[11px] tracking-[0.02em] text-muted">
            {CUT_OPTIONS.find((o) => o.value === cut)?.blurb}
          </p>
        </section>

        <div className="panel-soft p-3 text-sm">
          <div className="mb-1 flex items-center justify-between text-muted">
            <span className="flex items-center gap-1.5">
              {quantity} stickers
              {pricing.discountPercent > 0 && (
                <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {Math.round(pricing.discountPercent * 100)}% off
                </span>
              )}
            </span>
            <span>{formatCurrency(pricing.subtotal)}</span>
          </div>
          <div className="mb-1 flex items-center justify-between text-muted">
            <span>{formatCurrency(pricing.unitPrice)}/ea</span>
            <span>
              {pricing.shipping === 0 ? (
                <span className="font-medium text-[var(--text)]">Free shipping</span>
              ) : (
                <span>+{formatCurrency(pricing.shipping)} shipping</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--line)] pt-2 font-bold text-[var(--text)]">
            <span>Total</span>
            <span>{formatCurrency(pricing.total)}</span>
          </div>
        </div>

        <button type="button" onClick={onAddToCart} className="btn-primary">
          I want these
        </button>

        <p className="text-[11px] tracking-[0.04em] text-muted">
          Built to survive anything. At your door in 3&ndash;5 days.
        </p>
      </div>
    </aside>
  );
}
