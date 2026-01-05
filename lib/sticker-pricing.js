/**
 * Sticker Pricing Engine
 * Multi-dimensional pricing: Size × Material × Cutting × Quantity
 */

// Base pricing per sticker at single quantity (in cents)
// Smooth progression from 1" to 12"
const SIZE_BASE_PRICES = {
  1: 45,     // $0.45
  1.5: 55,   // $0.55
  2: 65,     // $0.65
  2.5: 75,   // $0.75
  3: 90,     // $0.90
  3.5: 105,  // $1.05
  4: 120,    // $1.20
  4.5: 137,  // $1.37
  5: 155,    // $1.55
  5.5: 175,  // $1.75
  6: 195,    // $1.95
  6.5: 217,  // $2.17
  7: 240,    // $2.40
  7.5: 265,  // $2.65
  8: 290,    // $2.90
  8.5: 317,  // $3.17
  9: 345,    // $3.45
  9.5: 375,  // $3.75
  10: 405,   // $4.05
  10.5: 437, // $4.37
  11: 470,   // $4.70
  11.5: 505, // $5.05
  12: 540    // $5.40
};

// Quantity tier discounts (percentage off)
const QUANTITY_TIERS = [
  { min: 1, max: 9, discount: 0, name: 'Single' },
  { min: 10, max: 49, discount: 0.10, name: 'Small batch' },
  { min: 50, max: 99, discount: 0.15, name: 'Medium batch' },
  { min: 100, max: 249, discount: 0.20, name: 'Large batch' },
  { min: 250, max: null, discount: 0.25, name: 'Bulk' }
];

/**
 * Get base price for a given size
 * Interpolates for sizes between defined prices
 */
function getBasePrice(sizeInches) {
  // Round to nearest 0.5
  const roundedSize = Math.round(sizeInches * 2) / 2;

  // Clamp to valid range
  const clampedSize = Math.max(1, Math.min(12, roundedSize));

  // Return exact match if exists
  if (SIZE_BASE_PRICES[clampedSize]) {
    return SIZE_BASE_PRICES[clampedSize];
  }

  // Interpolate between two prices
  const lowerSize = Math.floor(clampedSize * 2) / 2;
  const upperSize = Math.ceil(clampedSize * 2) / 2;
  const lowerPrice = SIZE_BASE_PRICES[lowerSize];
  const upperPrice = SIZE_BASE_PRICES[upperSize];

  if (!upperPrice) return lowerPrice;

  const ratio = (clampedSize - lowerSize) / (upperSize - lowerSize);
  return Math.round(lowerPrice + (upperPrice - lowerPrice) * ratio);
}

/**
 * Get quantity tier for given quantity
 */
function getQuantityTier(quantity) {
  return QUANTITY_TIERS.find(tier =>
    quantity >= tier.min && (tier.max === null || quantity <= tier.max)
  ) || QUANTITY_TIERS[0];
}

/**
 * Calculate sticker price
 * @param {Object} config
 * @param {number} config.sizeInches - Size in inches (1-12)
 * @param {number} config.quantity - Quantity (1-9999)
 * @param {number} config.materialModifier - Material price modifier (0.7-1.4)
 * @param {number} config.cuttingPriceCents - Cutting type additional cost in cents
 * @returns {Object} Pricing details
 */
export function calculatePrice(config) {
  const {
    sizeInches,
    quantity,
    materialModifier = 1.0,
    cuttingPriceCents = 0
  } = config;

  // 1. Get base price for size
  const basePrice = getBasePrice(sizeInches);

  // 2. Apply material modifier
  const materialPrice = Math.round(basePrice * materialModifier);

  // 3. Add cutting modifier
  const priceWithCutting = materialPrice + cuttingPriceCents;

  // 4. Apply quantity tier discount
  const tier = getQuantityTier(quantity);
  const discount = tier.discount;
  const unitPrice = Math.round(priceWithCutting * (1 - discount));

  // 5. Calculate total
  const totalPrice = unitPrice * quantity;

  // Calculate savings
  const fullPrice = priceWithCutting * quantity;
  const savings = fullPrice - totalPrice;

  return {
    unitPriceCents: unitPrice,
    totalPriceCents: totalPrice,
    tier: tier.name,
    breakdown: {
      basePrice,
      materialAdjustment: materialPrice - basePrice,
      cuttingAdjustment: cuttingPriceCents,
      subtotal: priceWithCutting,
      discountPercent: Math.round(discount * 100),
      savings
    }
  };
}

/**
 * Get next quantity tier hint
 * Returns information about the next discount tier
 */
export function getNextTierHint(currentQty) {
  const currentTier = getQuantityTier(currentQty);
  const currentIndex = QUANTITY_TIERS.indexOf(currentTier);

  // Check if there's a next tier
  if (currentIndex === -1 || currentIndex >= QUANTITY_TIERS.length - 1) {
    return null;
  }

  const nextTier = QUANTITY_TIERS[currentIndex + 1];
  const addMore = nextTier.min - currentQty;

  return {
    quantity: nextTier.min,
    discount: Math.round(nextTier.discount * 100),
    addMore,
    message: `Add ${addMore} more to save ${Math.round(nextTier.discount * 100)}%`,
    tierName: nextTier.name
  };
}

/**
 * Format price in cents to dollar string
 */
export function formatPrice(cents) {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Get all quantity tiers (for display)
 */
export function getQuantityTiers() {
  return QUANTITY_TIERS.map(tier => ({
    ...tier,
    discountPercent: Math.round(tier.discount * 100)
  }));
}

/**
 * Validate size
 */
export function isValidSize(sizeInches) {
  return sizeInches >= 1 && sizeInches <= 12;
}

/**
 * Validate quantity
 */
export function isValidQuantity(quantity) {
  return quantity >= 1 && quantity <= 9999 && Number.isInteger(quantity);
}
