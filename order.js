/**
 * Sticker Order Form Logic
 * Handles state management, real-time pricing, and order submission
 */

import {
  STICKER_MATERIALS,
  CUTTING_OPTIONS,
  SIZE_RANGE,
  QUANTITY_LIMITS,
  getMaterial,
  getCuttingOption,
  getDefaultMaterial,
  getDefaultCutting
} from './lib/sticker-config.js';

import {
  calculatePrice,
  getNextTierHint,
  formatPrice,
  isValidSize,
  isValidQuantity
} from './lib/sticker-pricing.js';

import {
  addToCart
} from './lib/order-cart.js';

// Application State
const state = {
  uploadedFile: null,
  uploadedFileUrl: null,
  uploadedFileKey: null,
  material: getDefaultMaterial().id,
  size: SIZE_RANGE.default,
  cutting: getDefaultCutting().id,
  quantity: QUANTITY_LIMITS.default,
  jobName: '',
  notes: ''
};

// DOM Elements
let elements = {};

/**
 * Initialize the application
 */
document.addEventListener('DOMContentLoaded', () => {
  initElements();
  renderMaterials();
  renderCuttingOptions();
  initUploadHandlers();
  initSizeSlider();
  initQuantityControls();
  initFormHandlers();
  updatePricing();
});

/**
 * Cache DOM elements
 */
function initElements() {
  elements = {
    // Upload
    uploadDropZone: document.getElementById('upload-drop-zone'),
    artworkInput: document.getElementById('artwork-input'),
    uploadPreview: document.getElementById('upload-preview'),
    previewImage: document.getElementById('preview-image'),
    removeUpload: document.getElementById('remove-upload'),
    uploadFilename: document.getElementById('upload-filename'),
    uploadFilesize: document.getElementById('upload-filesize'),

    // Configuration
    materialsGrid: document.getElementById('materials-grid'),
    sizeSlider: document.getElementById('size-slider'),
    sizeDisplay: document.getElementById('size-display'),
    sizePreviewBox: document.getElementById('size-preview-box'),
    cuttingGrid: document.getElementById('cutting-grid'),
    quantityInput: document.getElementById('quantity-input'),
    qtyDec: document.getElementById('qty-dec'),
    qtyInc: document.getElementById('qty-inc'),
    tierHint: document.getElementById('tier-hint'),
    tierHintText: document.getElementById('tier-hint-text'),

    // Form
    form: document.getElementById('sticker-order-form'),
    jobNameInput: document.getElementById('job-name'),
    notesInput: document.getElementById('notes'),

    // Pricing
    unitPrice: document.getElementById('unit-price'),
    unitPriceOriginal: document.getElementById('unit-price-original'),
    totalPrice: document.getElementById('total-price'),
    pricingQty: document.getElementById('pricing-qty'),
    pricingSavings: document.getElementById('pricing-savings'),
    savingsText: document.getElementById('savings-text'),
    breakdownToggle: document.getElementById('breakdown-toggle'),
    pricingBreakdown: document.getElementById('pricing-breakdown'),
    breakdownBase: document.getElementById('breakdown-base'),
    breakdownMaterial: document.getElementById('breakdown-material'),
    breakdownMaterialRow: document.getElementById('breakdown-material-row'),
    breakdownMaterialLabel: document.getElementById('breakdown-material-label'),
    breakdownCutting: document.getElementById('breakdown-cutting'),
    breakdownCuttingRow: document.getElementById('breakdown-cutting-row'),
    breakdownCuttingLabel: document.getElementById('breakdown-cutting-label'),
    breakdownDiscount: document.getElementById('breakdown-discount'),
    breakdownDiscountRow: document.getElementById('breakdown-discount-row'),
    breakdownDiscountLabel: document.getElementById('breakdown-discount-label'),

    // Actions
    addToCartBtn: document.getElementById('add-to-cart-btn'),
  };
}

/**
 * Render material selection cards
 */
function renderMaterials() {
  const grid = elements.materialsGrid;
  grid.innerHTML = '';

  STICKER_MATERIALS.forEach(material => {
    const card = document.createElement('div');
    card.className = `material-card ${material.id === state.material ? 'material-card--selected' : ''}`;
    card.dataset.materialId = material.id;

    card.innerHTML = `
      ${material.recommended ? '<div class="material-card__badge">Most Popular</div>' : ''}
      <div class="material-card__icon">${material.icon}</div>
      <h3 class="material-card__name">${material.name}</h3>
      <p class="material-card__subtitle">${material.subtitle}</p>
      <p class="material-card__description">${material.description}</p>
      <div class="material-card__price">${material.priceModifier === 1.0 ? 'Base price' : `+${Math.round((material.priceModifier - 1) * 100)}%`}</div>
      ${material.warning ? `<div class="material-card__warning">${material.warning}</div>` : ''}
    `;

    card.addEventListener('click', () => {
      state.material = material.id;
      renderMaterials();
      updatePricing();
    });

    grid.appendChild(card);
  });
}

/**
 * Render cutting option buttons
 */
function renderCuttingOptions() {
  const grid = elements.cuttingGrid;
  grid.innerHTML = '';

  CUTTING_OPTIONS.forEach(option => {
    const card = document.createElement('div');
    card.className = `cutting-option ${option.id === state.cutting ? 'cutting-option--selected' : ''}`;
    card.dataset.cuttingId = option.id;

    card.innerHTML = `
      <div class="cutting-option__icon">${option.icon}</div>
      <h3 class="cutting-option__name">${option.name}</h3>
      <div class="cutting-option__price">${option.priceCents === 0 ? 'Included' : `+${formatPrice(option.priceCents)}`}</div>
    `;

    card.addEventListener('click', () => {
      state.cutting = option.id;
      renderCuttingOptions();
      updatePricing();
    });

    grid.appendChild(card);
  });
}

/**
 * Initialize file upload handlers
 */
function initUploadHandlers() {
  // Click to upload
  elements.artworkInput.addEventListener('change', handleFileSelect);

  // Drag and drop
  elements.uploadDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadDropZone.classList.add('drag-over');
  });

  elements.uploadDropZone.addEventListener('dragleave', () => {
    elements.uploadDropZone.classList.remove('drag-over');
  });

  elements.uploadDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadDropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });

  // Remove upload
  elements.removeUpload.addEventListener('click', (e) => {
    e.stopPropagation();
    clearUpload();
  });
}

/**
 * Handle file input change
 */
function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
}

/**
 * Process uploaded file
 */
function handleFile(file) {
  // Validate file size (50MB)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    showErrorToast('File too large', 'Please upload a file smaller than 50MB');
    return;
  }

  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/svg+xml', 'application/pdf'];
  if (!validTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|gif|bmp|eps|pdf|ai|svg|psd|tif|tiff)$/i)) {
    showErrorToast('Invalid file type', 'Please upload an image file (JPG, PNG, etc.)');
    return;
  }

  state.uploadedFile = file;

  // Show preview
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      elements.previewImage.src = e.target.result;
      elements.uploadDropZone.style.display = 'none';
      elements.uploadPreview.style.display = 'block';
      elements.uploadFilename.textContent = file.name;
      elements.uploadFilesize.textContent = formatFileSize(file.size);
    };
    reader.readAsDataURL(file);
  } else {
    // Non-image file (PDF, AI, etc.)
    elements.previewImage.src = ''; // Could add a generic file icon
    elements.uploadDropZone.style.display = 'none';
    elements.uploadPreview.style.display = 'block';
    elements.uploadFilename.textContent = file.name;
    elements.uploadFilesize.textContent = formatFileSize(file.size);
  }
}

/**
 * Clear uploaded file
 */
function clearUpload() {
  state.uploadedFile = null;
  state.uploadedFileUrl = null;
  state.uploadedFileKey = null;
  elements.artworkInput.value = '';
  elements.uploadDropZone.style.display = 'flex';
  elements.uploadPreview.style.display = 'none';
}

/**
 * Initialize size slider
 */
function initSizeSlider() {
  elements.sizeSlider.addEventListener('input', (e) => {
    state.size = parseFloat(e.target.value);
    updateSizeDisplay();
    updatePricing();
  });

  updateSizeDisplay();
}

/**
 * Update size display
 */
function updateSizeDisplay() {
  elements.sizeDisplay.textContent = state.size.toFixed(1);

  // Update visual preview box size (scale appropriately)
  const scale = (state.size / SIZE_RANGE.max) * 100;
  const minSize = 30; // minimum visual size in pixels
  const maxSize = 100; // maximum visual size in pixels
  const visualSize = minSize + (maxSize - minSize) * (scale / 100);

  elements.sizePreviewBox.style.width = `${visualSize}px`;
  elements.sizePreviewBox.style.height = `${visualSize}px`;
}

/**
 * Initialize quantity controls
 */
function initQuantityControls() {
  elements.qtyDec.addEventListener('click', () => {
    const newQty = Math.max(QUANTITY_LIMITS.min, state.quantity - 1);
    state.quantity = newQty;
    elements.quantityInput.value = newQty;
    updatePricing();
  });

  elements.qtyInc.addEventListener('click', () => {
    const newQty = Math.min(QUANTITY_LIMITS.max, state.quantity + 1);
    state.quantity = newQty;
    elements.quantityInput.value = newQty;
    updatePricing();
  });

  elements.quantityInput.addEventListener('input', (e) => {
    let value = parseInt(e.target.value, 10);
    if (isNaN(value)) value = QUANTITY_LIMITS.min;
    value = Math.max(QUANTITY_LIMITS.min, Math.min(QUANTITY_LIMITS.max, value));
    state.quantity = value;
    updatePricing();
  });

  elements.quantityInput.addEventListener('blur', (e) => {
    // Ensure valid value on blur
    e.target.value = state.quantity;
  });
}

/**
 * Update pricing display
 */
function updatePricing() {
  const material = getMaterial(state.material);
  const cutting = getCuttingOption(state.cutting);

  const pricing = calculatePrice({
    sizeInches: state.size,
    quantity: state.quantity,
    materialModifier: material.priceModifier,
    cuttingPriceCents: cutting.priceCents
  });

  // Unit price
  elements.unitPrice.textContent = formatPrice(pricing.unitPriceCents);

  // Show original price if discounted
  if (pricing.breakdown.discountPercent > 0) {
    elements.unitPriceOriginal.textContent = formatPrice(pricing.breakdown.subtotal);
    elements.unitPriceOriginal.style.display = 'inline';
  } else {
    elements.unitPriceOriginal.style.display = 'none';
  }

  // Total price
  elements.totalPrice.textContent = formatPrice(pricing.totalPriceCents);
  elements.pricingQty.textContent = `(${state.quantity})`;

  // Savings
  if (pricing.breakdown.savings > 0) {
    elements.savingsText.textContent = `You save ${formatPrice(pricing.breakdown.savings)} (${pricing.breakdown.discountPercent}% off)`;
    elements.pricingSavings.style.display = 'flex';
  } else {
    elements.pricingSavings.style.display = 'none';
  }

  // Breakdown
  elements.breakdownBase.textContent = formatPrice(pricing.breakdown.basePrice * state.quantity);

  if (pricing.breakdown.materialAdjustment !== 0) {
    elements.breakdownMaterial.textContent = formatPrice(Math.abs(pricing.breakdown.materialAdjustment * state.quantity));
    elements.breakdownMaterialLabel.textContent = pricing.breakdown.materialAdjustment > 0 ? 'Material premium:' : 'Material discount:';
    elements.breakdownMaterialRow.style.display = 'flex';
  } else {
    elements.breakdownMaterialRow.style.display = 'none';
  }

  if (pricing.breakdown.cuttingAdjustment > 0) {
    elements.breakdownCutting.textContent = `+${formatPrice(pricing.breakdown.cuttingAdjustment * state.quantity)}`;
    elements.breakdownCuttingLabel.textContent = `${cutting.name}:`;
    elements.breakdownCuttingRow.style.display = 'flex';
  } else {
    elements.breakdownCuttingRow.style.display = 'none';
  }

  if (pricing.breakdown.discountPercent > 0) {
    elements.breakdownDiscount.textContent = `-${formatPrice(pricing.breakdown.savings)}`;
    elements.breakdownDiscountLabel.textContent = `Quantity discount (${pricing.breakdown.discountPercent}%):`;
    elements.breakdownDiscountRow.style.display = 'flex';
  } else {
    elements.breakdownDiscountRow.style.display = 'none';
  }

  // Tier hint
  updateTierHint();
}

/**
 * Update quantity tier hint
 */
function updateTierHint() {
  const hint = getNextTierHint(state.quantity);

  if (hint) {
    elements.tierHintText.textContent = hint.message;
    elements.tierHint.style.display = 'flex';
  } else {
    elements.tierHint.style.display = 'none';
  }
}

/**
 * Initialize form handlers
 */
function initFormHandlers() {
  // Breakdown toggle
  elements.breakdownToggle.addEventListener('click', () => {
    const isVisible = elements.pricingBreakdown.style.display === 'block';
    elements.pricingBreakdown.style.display = isVisible ? 'none' : 'block';
    elements.breakdownToggle.querySelector('span').textContent = isVisible ? 'See price breakdown' : 'Hide price breakdown';
  });

  // Add to cart
  elements.addToCartBtn.addEventListener('click', handleAddToCart);

  // Form submission (checkout)
  elements.form.addEventListener('submit', handleCheckout);

  // Job name input
  elements.jobNameInput.addEventListener('input', (e) => {
    state.jobName = e.target.value;
  });

  // Notes input
  elements.notesInput.addEventListener('input', (e) => {
    state.notes = e.target.value;
  });
}

/**
 * Handle add to cart
 */
async function handleAddToCart(e) {
  e.preventDefault();

  // Validate
  if (!validateForm()) {
    return;
  }

  // Upload file if not already uploaded
  if (!state.uploadedFileUrl && state.uploadedFile) {
    const uploadResult = await uploadFile(state.uploadedFile);
    if (!uploadResult) {
      return; // Error already shown
    }
    state.uploadedFileUrl = uploadResult.url;
    state.uploadedFileKey = uploadResult.key;
  }

  // Create cart item
  const material = getMaterial(state.material);
  const cutting = getCuttingOption(state.cutting);

  const pricing = calculatePrice({
    sizeInches: state.size,
    quantity: state.quantity,
    materialModifier: material.priceModifier,
    cuttingPriceCents: cutting.priceCents
  });

  const cartItem = {
    type: 'sticker',
    jobName: state.jobName,
    material: material.name,
    materialId: material.id,
    size: `${state.size}"`,
    cutting: cutting.name,
    cuttingId: cutting.id,
    quantity: state.quantity,
    notes: state.notes,
    unitPriceCents: pricing.unitPriceCents,
    totalPriceCents: pricing.totalPriceCents,
    fileUrl: state.uploadedFileUrl,
    fileKey: state.uploadedFileKey,
    fileName: state.uploadedFile.name
  };

  // Add to cart
  addToCart(cartItem);
  showToast('Added to cart', `${state.quantity} ${material.name} stickers added`);

  // Reset form
  resetForm();
}

/**
 * Handle checkout
 */
async function handleCheckout(e) {
  e.preventDefault();

  // Validate
  if (!validateForm()) {
    return;
  }

  // For now, just show success message
  // Will implement Stripe checkout next
  showToast('Checkout', 'Checkout functionality coming soon!');
}

/**
 * Validate form
 */
function validateForm() {
  if (!state.uploadedFile && !state.uploadedFileUrl) {
    showErrorToast('Missing artwork', 'Please upload your design file');
    return false;
  }

  if (!state.jobName.trim()) {
    showErrorToast('Missing job name', 'Please enter a name for your order');
    elements.jobNameInput.focus();
    return false;
  }

  if (!isValidSize(state.size)) {
    showErrorToast('Invalid size', 'Please select a valid size (1-12 inches)');
    return false;
  }

  if (!isValidQuantity(state.quantity)) {
    showErrorToast('Invalid quantity', 'Please enter a valid quantity (1-9999)');
    return false;
  }

  return true;
}

/**
 * Upload file to server
 */
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/upload-file', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      return {
        url: data.url,
        key: data.key
      };
    } else {
      showErrorToast('Upload failed', data.error || 'Failed to upload file');
      return null;
    }
  } catch (error) {
    console.error('Upload error:', error);
    showErrorToast('Upload failed', 'Network error. Please try again.');
    return null;
  }
}

/**
 * Reset form
 */
function resetForm() {
  clearUpload();
  state.material = getDefaultMaterial().id;
  state.size = SIZE_RANGE.default;
  state.cutting = getDefaultCutting().id;
  state.quantity = QUANTITY_LIMITS.default;
  state.jobName = '';
  state.notes = '';

  elements.jobNameInput.value = '';
  elements.notesInput.value = '';
  elements.sizeSlider.value = SIZE_RANGE.default;
  elements.quantityInput.value = QUANTITY_LIMITS.default;

  renderMaterials();
  renderCuttingOptions();
  updateSizeDisplay();
  updatePricing();
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Show success toast
 */
function showToast(title, message = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';

  toast.innerHTML = `
    <div class="toast__icon">✓</div>
    <div class="toast__content">
      <div class="toast__title">${title}</div>
      ${message ? `<div class="toast__message">${message}</div>` : ''}
    </div>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300);
  }, 3500);
}

/**
 * Show error toast
 */
function showErrorToast(title, message = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast toast--error';

  toast.innerHTML = `
    <div class="toast__icon">!</div>
    <div class="toast__content">
      <div class="toast__title">${title}</div>
      ${message ? `<div class="toast__message">${message}</div>` : ''}
    </div>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300);
  }, 6000);
}
