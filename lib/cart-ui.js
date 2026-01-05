/**
 * Cart UI Components
 *
 * Creates and manages the cart drawer, toggle button, and interactions.
 */

import {
  getCartItems,
  getCartCount,
  getCartTotal,
  removeFromCart,
  clearCart,
  subscribeToCart,
  formatPrice,
} from './order-cart.js';

let drawerEl = null;
let backdropEl = null;
let toggleEl = null;
let isOpen = false;

// Create the cart toggle button (FAB)
function createToggleButton() {
  if (toggleEl) return toggleEl;

  toggleEl = document.createElement('button');
  toggleEl.className = 'order-cart-toggle order-cart-toggle--hidden';
  toggleEl.type = 'button';
  toggleEl.innerHTML = `
    <span>VIEW CART</span>
    <span class="order-cart-toggle__count">0</span>
  `;

  toggleEl.addEventListener('click', openDrawer);
  document.body.appendChild(toggleEl);

  return toggleEl;
}

// Create the cart drawer
function createDrawer() {
  if (drawerEl) return drawerEl;

  // Backdrop
  backdropEl = document.createElement('div');
  backdropEl.className = 'order-cart-backdrop';
  backdropEl.addEventListener('click', closeDrawer);
  document.body.appendChild(backdropEl);

  // Drawer
  drawerEl = document.createElement('div');
  drawerEl.className = 'order-cart-drawer';
  drawerEl.innerHTML = `
    <div class="order-cart-header">
      <h2>Your cart</h2>
      <button class="order-cart-close" type="button" aria-label="Close cart">&times;</button>
    </div>
    <div class="order-cart-items"></div>
    <div class="order-cart-footer">
      <div class="order-cart-total">
        <span class="order-cart-total__label">Total</span>
        <span class="order-cart-total__value">$0.00</span>
      </div>
      <button class="order-cart-checkout" type="button">Checkout</button>
    </div>
  `;

  // Close button
  const closeBtn = drawerEl.querySelector('.order-cart-close');
  closeBtn.addEventListener('click', closeDrawer);

  // Checkout button
  const checkoutBtn = drawerEl.querySelector('.order-cart-checkout');
  checkoutBtn.addEventListener('click', handleCheckout);

  document.body.appendChild(drawerEl);

  return drawerEl;
}

// Open drawer
function openDrawer() {
  if (!drawerEl) createDrawer();
  isOpen = true;
  drawerEl.classList.add('order-cart-drawer--open');
  backdropEl.classList.add('order-cart-backdrop--visible');
  document.body.style.overflow = 'hidden';
  renderCartItems();
}

// Close drawer
export function closeDrawer() {
  if (!drawerEl) return;
  isOpen = false;
  drawerEl.classList.remove('order-cart-drawer--open');
  backdropEl.classList.remove('order-cart-backdrop--visible');
  document.body.style.overflow = '';
}

// Render cart items
function renderCartItems() {
  if (!drawerEl) return;

  const itemsContainer = drawerEl.querySelector('.order-cart-items');
  const totalEl = drawerEl.querySelector('.order-cart-total__value');
  const checkoutBtn = drawerEl.querySelector('.order-cart-checkout');
  const items = getCartItems();

  if (items.length === 0) {
    itemsContainer.innerHTML = `
      <div class="order-cart-empty">
        <div class="order-cart-empty__icon">🛒</div>
        <p class="order-cart-empty__text">Your cart is empty</p>
      </div>
    `;
    checkoutBtn.disabled = true;
  } else {
    itemsContainer.innerHTML = items.map(item => {
      const details = [];
      details.push(`${item.size} · Qty: ${item.quantity}`);
      if (item.material) details.push(item.material);
      if (item.cutting) details.push(item.cutting);

      // Thumbnail placeholder (will show 🎨 for stickers)
      const thumbContent = `<div class="order-cart-item__thumb-placeholder">🎨</div>`;

      return `
        <div class="order-cart-item" data-id="${item.id}">
          <div class="order-cart-item__thumb">
            ${thumbContent}
          </div>
          <div class="order-cart-item__info">
            <h3 class="order-cart-item__title">${item.jobName || 'Sticker Order'}</h3>
            <p class="order-cart-item__details">${details.join(' · ')}</p>
            <span class="order-cart-item__price">${formatPrice(item.totalPriceCents)}</span>
          </div>
          <button class="order-cart-item__remove" type="button" aria-label="Remove item">&times;</button>
        </div>
      `;
    }).join('');

    // Attach remove handlers
    itemsContainer.querySelectorAll('.order-cart-item__remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemEl = e.target.closest('.order-cart-item');
        const itemId = itemEl?.dataset.id;
        if (itemId) {
          removeFromCart(itemId);
        }
      });
    });

    checkoutBtn.disabled = false;
  }

  totalEl.textContent = formatPrice(getCartTotal());
}

// Update toggle button
function updateToggle(items) {
  if (!toggleEl) return;

  const count = items.length;
  const countEl = toggleEl.querySelector('.order-cart-toggle__count');

  if (count === 0) {
    toggleEl.classList.add('order-cart-toggle--hidden');
  } else {
    toggleEl.classList.remove('order-cart-toggle--hidden');
    countEl.textContent = count;

    // Animate on change
    countEl.classList.remove('order-cart-toggle__count--animate');
    void countEl.offsetWidth; // Force reflow
    countEl.classList.add('order-cart-toggle__count--animate');
  }

  // Update drawer if open
  if (isOpen) {
    renderCartItems();
  }
}

// Handle checkout
async function handleCheckout() {
  const items = getCartItems();
  if (items.length === 0) return;

  const checkoutBtn = drawerEl.querySelector('.order-cart-checkout');
  checkoutBtn.disabled = true;
  checkoutBtn.textContent = 'Processing...';

  try {
    // Send cart items to checkout endpoint
    const response = await fetch('/api/cart-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Server responded with ${response.status}`);
    }

    const data = await response.json();

    if (data.checkoutUrl) {
      // Clear cart and redirect
      clearCart();
      window.location.href = data.checkoutUrl;
    } else {
      throw new Error('No checkout URL received');
    }
  } catch (err) {
    console.error('Checkout failed:', err);
    alert('Checkout failed. Please try again.');
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = 'Checkout';
  }
}

// Initialize cart UI
export function initCartUI() {
  createToggleButton();
  createDrawer();

  // Subscribe to cart changes
  subscribeToCart(updateToggle);

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      closeDrawer();
    }
  });
}

// Export for external use
export { openDrawer };
window.openCartDrawer = openDrawer;
