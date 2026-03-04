"use client";

import { useCallback } from "react";
import { useWebHaptics } from "web-haptics/react";
import {
  FINISH_OPTIONS,
  QUANTITY_OPTIONS,
  SIZE_OPTIONS,
  StickerFinish,
  StickerSize,
  PricingBreakdown,
} from "../lib/pricing";
import { formatCurrency } from "../lib/utils";

interface OptionsPanelProps {
  size: StickerSize;
  quantity: number;
  finish: StickerFinish;
  pricing: PricingBreakdown;
  onSizeChange: (size: StickerSize) => void;
  onQuantityChange: (quantity: number) => void;
  onFinishChange: (finish: StickerFinish) => void;
  onAddToCart: () => void;
}

function Chip<T extends string | number>({
  value,
  active,
  onSelect,
}: {
  value: T;
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
      {value}
    </button>
  );
}

export function OptionsPanel({
  size,
  quantity,
  finish,
  pricing,
  onSizeChange,
  onQuantityChange,
  onFinishChange,
  onAddToCart,
}: OptionsPanelProps) {
  const { trigger } = useWebHaptics();

  const hapticSelect = useCallback(
    <T,>(fn: (v: T) => void) =>
      (v: T) => {
        try { trigger("selection" as never); } catch { /* */ }
        fn(v);
      },
    [trigger],
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
        </section>

        <div className="panel-soft p-3 text-sm">
          <div className="mb-1 flex items-center justify-between text-muted">
            <span>{quantity} stickers</span>
            <span>{formatCurrency(pricing.subtotal)}</span>
          </div>
          <div className="mb-1 flex items-center justify-between text-muted">
            <span>Shipping</span>
            <span>
              {pricing.shipping === 0 ? (
                <span className="font-medium text-[var(--text)]">Free</span>
              ) : (
                formatCurrency(pricing.shipping)
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
