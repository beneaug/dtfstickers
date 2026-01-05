/**
 * Order Cart System
 *
 * Manages a cart of multiple sticker orders
 * that can be checked out together.
 */

const CART_STORAGE_KEY = 'sticker_order_cart';

// Cart state
let cartItems = [];
let cartListeners = [];

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Load cart from localStorage
function loadCart() {
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (stored) {
      cartItems = JSON.parse(stored);
    }
  } catch (err) {
    console.error('Failed to load cart:', err);
    cartItems = [];
  }
  return cartItems;
}

// Save cart to localStorage
function saveCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  } catch (err) {
    console.error('Failed to save cart:', err);
  }
}

// Notify listeners
function notifyListeners() {
  cartListeners.forEach(fn => fn(cartItems));
}

// Add item to cart
export function addToCart(item) {
  const cartItem = {
    id: generateId(),
    ...item,
    addedAt: Date.now(),
  };
  cartItems.push(cartItem);
  saveCart();
  notifyListeners();
  return cartItem;
}

// Remove item from cart
export function removeFromCart(itemId) {
  cartItems = cartItems.filter(item => item.id !== itemId);
  saveCart();
  notifyListeners();
}

// Clear cart
export function clearCart() {
  cartItems = [];
  saveCart();
  notifyListeners();
}

// Get cart items
export function getCartItems() {
  if (cartItems.length === 0) {
    loadCart();
  }
  return [...cartItems];
}

// Get cart total (in cents)
export function getCartTotal() {
  return cartItems.reduce((sum, item) => sum + (item.totalPriceCents || 0), 0);
}

// Get cart count
export function getCartCount() {
  return cartItems.length;
}

// Subscribe to cart changes
export function subscribeToCart(listener) {
  cartListeners.push(listener);
  // Call immediately with current state
  listener(cartItems);
  // Return unsubscribe function
  return () => {
    cartListeners = cartListeners.filter(fn => fn !== listener);
  };
}

// Format price
export function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Initialize cart on load
loadCart();
