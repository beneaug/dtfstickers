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
    <aside className="glass-panel rounded-[28px] p-5 sm:p-6">
      <div className="space-y-5">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.22em] text-orange-200">Quick options</p>
          <h2 className="text-3xl font-semibold leading-tight">Dial in your order</h2>
        </header>

        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-white/80">Size</p>
          <div className="grid grid-cols-2 gap-2">
            {SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onSizeChange(option.value)}
                className={[
                  "rounded-2xl border px-3 py-3 text-left transition",
                  size === option.value
                    ? "border-ember bg-ember/20 text-white"
                    : "border-white/20 bg-white/5 text-white/90 hover:border-white/40 hover:bg-white/10",
                ].join(" ")}
              >
                <p className="text-sm font-semibold">{option.label}</p>
                <p className="text-xs text-muted">{option.blurb}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-white/80">Quantity</p>
          <div className="grid grid-cols-3 gap-2">
            {QUANTITY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onQuantityChange(option)}
                className={[
                  "rounded-xl border px-2 py-2 text-sm font-semibold transition",
                  quantity === option
                    ? "border-ember bg-ember/20 text-white"
                    : "border-white/20 bg-white/5 text-white/90 hover:border-white/40 hover:bg-white/10",
                ].join(" ")}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-white/80">Finish</p>
          <div className="grid grid-cols-3 gap-2">
            {FINISH_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onFinishChange(option.value)}
                className={[
                  "rounded-xl border px-2 py-2 text-sm font-semibold transition",
                  finish === option.value
                    ? "border-ember bg-ember/20 text-white"
                    : "border-white/20 bg-white/5 text-white/90 hover:border-white/40 hover:bg-white/10",
                ].join(" ")}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-black/20 p-4 text-sm">
          <div className="mb-2 flex items-center justify-between text-muted">
            <span>
              {quantity} stickers @ {formatCurrency(pricing.unitPrice)}
            </span>
            <span>{formatCurrency(pricing.subtotal)}</span>
          </div>
          <div className="mb-2 flex items-center justify-between text-muted">
            <span>Shipping</span>
            <span>{pricing.shipping === 0 ? "Free" : formatCurrency(pricing.shipping)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 pt-2 text-lg font-semibold">
            <span>Total</span>
            <span>{formatCurrency(pricing.total)}</span>
          </div>
          {pricing.discountPercent > 0 ? (
            <p className="mt-2 text-xs text-orange-200">
              Volume discount applied: {(pricing.discountPercent * 100).toFixed(0)}% off
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onAddToCart}
          className="w-full rounded-full bg-ember px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow-[0_18px_34px_rgba(247,107,42,0.38)] transition hover:bg-[#ff7b42] active:scale-[0.99]"
        >
          Add to cart · {formatCurrency(pricing.total)}
        </button>

        <ul className="space-y-1 text-sm text-muted">
          <li>Ships in 3-5 business days from Montana</li>
          <li>Waterproof, UV-safe, and dishwasher safe</li>
          <li>Love it or we rerun your order</li>
        </ul>
      </div>
    </aside>
  );
}

