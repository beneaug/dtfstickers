/**
 * Sticker Product Configuration
 * Single source of truth for all product options
 */

export const STICKER_MATERIALS = [
  {
    id: 'premium-vinyl',
    name: 'Premium Vinyl',
    subtitle: 'Most popular',
    description: 'Weather-resistant matte laminate, 3-5 year outdoor life',
    priceModifier: 1.0,
    icon: '⭐',
    recommended: true,
    durability: 'outdoor',
    finish: 'matte-laminate'
  },
  {
    id: 'glossy-vinyl',
    name: 'Glossy Vinyl',
    subtitle: 'Vibrant colors',
    description: 'High-shine finish, UV-protected, 3-5 year outdoor life',
    priceModifier: 1.0,
    icon: '✨',
    recommended: false,
    durability: 'outdoor',
    finish: 'glossy'
  },
  {
    id: 'matte-vinyl',
    name: 'Matte Vinyl',
    subtitle: 'Elegant finish',
    description: 'No-glare premium matte, 3-5 year outdoor life',
    priceModifier: 1.0,
    icon: '🎨',
    recommended: false,
    durability: 'outdoor',
    finish: 'matte'
  },
  {
    id: 'clear-vinyl',
    name: 'Clear Vinyl',
    subtitle: 'Transparent',
    description: 'See-through background, perfect for glass and windows',
    priceModifier: 1.15,
    icon: '💎',
    recommended: false,
    durability: 'outdoor',
    finish: 'transparent'
  },
  {
    id: 'holographic',
    name: 'Holographic',
    subtitle: 'Rainbow effect',
    description: 'Eye-catching rainbow shimmer, premium specialty finish',
    priceModifier: 1.3,
    icon: '🌈',
    recommended: false,
    durability: 'outdoor',
    finish: 'holographic',
    specialty: true
  },
  {
    id: 'glitter',
    name: 'Glitter',
    subtitle: 'Sparkle finish',
    description: 'Bold sparkle effect, polyester blend material',
    priceModifier: 1.4,
    icon: '✨',
    recommended: false,
    durability: 'outdoor',
    finish: 'glitter',
    specialty: true
  },
  {
    id: 'metallic',
    name: 'Metallic',
    subtitle: 'Brushed metal',
    description: 'Premium metallic finish, available in gold and silver',
    priceModifier: 1.35,
    icon: '🥇',
    recommended: false,
    durability: 'outdoor',
    finish: 'metallic',
    specialty: true,
    finishOptions: [
      { id: 'metallic-gold', name: 'Gold', icon: '🥇' },
      { id: 'metallic-silver', name: 'Silver', icon: '🥈' }
    ]
  },
  {
    id: 'economy',
    name: 'Economy',
    subtitle: 'Budget-friendly',
    description: 'Non-laminated vinyl, indoor use only',
    priceModifier: 0.7,
    icon: '💰',
    recommended: false,
    durability: 'indoor',
    finish: 'paper',
    warning: 'Indoor use only - not weather resistant'
  }
];

export const CUTTING_OPTIONS = [
  {
    id: 'die-cut',
    name: 'Die Cut',
    description: 'Cut to exact shape of your design with no border',
    priceCents: 15,
    icon: '✂️',
    recommended: true,
    details: 'Follows the contour of your design precisely'
  },
  {
    id: 'kiss-cut',
    name: 'Kiss Cut',
    description: 'Cut through sticker only, backing stays intact for easy peeling',
    priceCents: 10,
    icon: '📄',
    recommended: false,
    details: 'Perfect for sticker sheets and easy distribution'
  },
  {
    id: 'rectangle',
    name: 'Rectangle',
    description: 'Simple rectangular cut with optional border',
    priceCents: 0,
    icon: '▭',
    recommended: false,
    details: 'Clean and classic shape'
  },
  {
    id: 'circle',
    name: 'Circle',
    description: 'Circular or oval shaped stickers',
    priceCents: 0,
    icon: '⭕',
    recommended: false,
    details: 'Round shape for logos and badges'
  }
];

export const SIZE_RANGE = {
  min: 1,
  max: 12,
  step: 0.5,
  default: 3
};

export const QUANTITY_LIMITS = {
  min: 1,
  max: 9999,
  default: 25
};

/**
 * Get material by ID
 */
export function getMaterial(materialId) {
  return STICKER_MATERIALS.find(m => m.id === materialId) || STICKER_MATERIALS[0];
}

/**
 * Get cutting option by ID
 */
export function getCuttingOption(cuttingId) {
  return CUTTING_OPTIONS.find(c => c.id === cuttingId) || CUTTING_OPTIONS[0];
}

/**
 * Get recommended/default material
 */
export function getDefaultMaterial() {
  return STICKER_MATERIALS.find(m => m.recommended) || STICKER_MATERIALS[0];
}

/**
 * Get recommended/default cutting option
 */
export function getDefaultCutting() {
  return CUTTING_OPTIONS.find(c => c.recommended) || CUTTING_OPTIONS[0];
}
