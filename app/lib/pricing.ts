export const SIZE_OPTIONS = [
  { value: "2x2", label: '2" x 2"', blurb: "Perfect for laptops" },
  { value: "3x3", label: '3" x 3"', blurb: "Most popular" },
  { value: "4x4", label: '4" x 4"', blurb: "Bold statement" },
  { value: "5x5", label: '5" x 5"', blurb: "Window-sized" },
] as const;

export const QUANTITY_OPTIONS = [25, 50, 100, 200, 300, 500] as const;

export const FINISH_OPTIONS = [
  { value: "matte", label: "Matte" },
  { value: "gloss", label: "Gloss" },
  { value: "holographic", label: "Holographic" },
] as const;

type SizeKey = (typeof SIZE_OPTIONS)[number]["value"];
type FinishKey = (typeof FINISH_OPTIONS)[number]["value"];

const BASE_UNIT_BY_SIZE: Record<SizeKey, number> = {
  "2x2": 1.05,
  "3x3": 1.32,
  "4x4": 1.65,
  "5x5": 2.05,
};

const FINISH_MULTIPLIER: Record<FinishKey, number> = {
  matte: 1,
  gloss: 1.07,
  holographic: 1.22,
};

const QUANTITY_DISCOUNTS = [
  { minQty: 500, percentOff: 0.36 },
  { minQty: 300, percentOff: 0.3 },
  { minQty: 200, percentOff: 0.26 },
  { minQty: 100, percentOff: 0.21 },
  { minQty: 50, percentOff: 0.12 },
  { minQty: 25, percentOff: 0.06 },
] as const;

export type StickerSize = SizeKey;
export type StickerFinish = FinishKey;

export interface StickerSelection {
  size: StickerSize;
  quantity: number;
  finish: StickerFinish;
}

export interface PricingBreakdown {
  unitPrice: number;
  subtotal: number;
  discountPercent: number;
  shipping: number;
  total: number;
}

const roundToCents = (value: number) => Math.round(value * 100) / 100;

export function calculatePricing(selection: StickerSelection): PricingBreakdown {
  const baseUnit = BASE_UNIT_BY_SIZE[selection.size];
  const finishMultiplier = FINISH_MULTIPLIER[selection.finish];
  const tier = QUANTITY_DISCOUNTS.find((entry) => selection.quantity >= entry.minQty);
  const discountPercent = tier?.percentOff ?? 0;

  const unitPrice = roundToCents(baseUnit * finishMultiplier * (1 - discountPercent));
  const subtotal = roundToCents(unitPrice * selection.quantity);
  const shipping = subtotal >= 65 ? 0 : 5.95;
  const total = roundToCents(subtotal + shipping);

  return {
    unitPrice,
    subtotal,
    discountPercent,
    shipping,
    total,
  };
}

