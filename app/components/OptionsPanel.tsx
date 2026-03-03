"use client";

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

function OptionGroup<T extends string | number>({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: readonly T[];
  active: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className={[
              "rounded-full border px-3 py-1.5 text-xs font-medium tracking-[0.02em] transition",
              active === option
                ? "border-[#ff935f] bg-ember/16 text-white"
                : "border-white/20 bg-transparent text-white/88 hover:border-white/40 hover:text-white",
            ].join(" ")}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
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
  return (
    <aside className="surface rounded-3xl p-5 sm:p-6">
      <div className="space-y-6">
        <header>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Order</p>
          <h2 className="mt-1 text-2xl font-semibold leading-tight">Customize quickly</h2>
        </header>

        <OptionGroup
          label="Size"
          options={SIZE_OPTIONS.map((option) => option.value)}
          active={size}
          onSelect={onSizeChange}
        />

        <OptionGroup
          label="Quantity"
          options={QUANTITY_OPTIONS}
          active={quantity}
          onSelect={onQuantityChange}
        />

        <OptionGroup
          label="Finish"
          options={FINISH_OPTIONS.map((option) => option.value)}
          active={finish}
          onSelect={onFinishChange}
        />

        <div className="surface-soft space-y-2 rounded-2xl p-4 text-sm">
          <div className="flex items-center justify-between text-muted">
            <span>
              {quantity} × {size}
            </span>
            <span>{formatCurrency(pricing.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-muted">
            <span>Shipping</span>
            <span>{pricing.shipping === 0 ? "Free" : formatCurrency(pricing.shipping)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{formatCurrency(pricing.total)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onAddToCart}
          className="w-full rounded-full border border-[#ff935f] bg-ember px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[#ff7b42]"
        >
          Add to cart
        </button>

        <p className="text-xs uppercase tracking-[0.07em] text-muted">
          Waterproof. UV-safe. Ships in 3-5 business days.
        </p>
      </div>
    </aside>
  );
}

