/**
 * 12oz Stickers - Main Application JavaScript
 * Handles cart, order form, FAQ, homepage interactions, and UI
 */

(function() {
    'use strict';

    // ============================================
    // Pricing Configuration
    // ============================================
    const PRICING = {
        'die-cut': {
            '2x2': { '1-49': 0.75, '50-99': 0.60, '100-249': 0.45, '250+': 0.35 },
            '3x3': { '1-49': 1.25, '50-99': 1.00, '100-249': 0.80, '250+': 0.65 },
            '4x4': { '1-49': 1.75, '50-99': 1.40, '100-249': 1.15, '250+': 0.95 },
            '5x5': { '1-49': 2.50, '50-99': 2.00, '100-249': 1.65, '250+': 1.35 }
        },
        'kiss-cut': {
            '2x2': { '1-49': 0.60, '50-99': 0.48, '100-249': 0.36, '250+': 0.28 },
            '3x3': { '1-49': 1.00, '50-99': 0.80, '100-249': 0.64, '250+': 0.52 },
            '4x4': { '1-49': 1.40, '50-99': 1.12, '100-249': 0.92, '250+': 0.76 },
            '5x5': { '1-49': 2.00, '50-99': 1.60, '100-249': 1.32, '250+': 1.08 }
        },
        'sheet': {
            '2x2': { '1-49': 2.50, '50-99': 2.00, '100-249': 1.65, '250+': 1.35 },
            '3x3': { '1-49': 3.50, '50-99': 2.80, '100-249': 2.30, '250+': 1.90 },
            '4x4': { '1-49': 4.50, '50-99': 3.60, '100-249': 2.95, '250+': 2.45 },
            '5x5': { '1-49': 5.50, '50-99': 4.40, '100-249': 3.60, '250+': 3.00 }
        }
    };

    // Homepage pricing calculator config
    const CALC_PRICING = {
        sizes: {
            '2': 0.60,
            '3': 0.80,
            '4': 1.10,
            '5': 1.45
        },
        materials: {
            'vinyl': 0,
            'clear': 0.10,
            'holographic': 0.35,
            'glitter': 0.30
        },
        tiers: [
            { min: 50, max: 99, discount: 0.05 },
            { min: 100, max: 249, discount: 0.10 },
            { min: 250, max: 499, discount: 0.18 },
            { min: 500, max: 999, discount: 0.25 },
            { min: 1000, max: Infinity, discount: 0.32 }
        ]
    };

    const FINISH_UPCHARGE = {
        'gloss': 0,
        'matte': 0,
        'holographic': 0.25
    };

    // ============================================
    // Cart State
    // ============================================
    let cart = JSON.parse(localStorage.getItem('sticker-cart') || '[]');

    // ============================================
    // Utility Functions
    // ============================================
    function formatPrice(price) {
        return '$' + price.toFixed(2);
    }

    function getQuantityTier(qty) {
        if (qty >= 250) return '250+';
        if (qty >= 100) return '100-249';
        if (qty >= 50) return '50-99';
        return '1-49';
    }

    function getQuantityTierLabel(qty) {
        if (qty >= 250) return '250+ qty: Best pricing';
        if (qty >= 100) return '100-249 qty: Great savings';
        if (qty >= 50) return '50-99 qty: Good value';
        return '1-49 qty: Standard pricing';
    }

    function calculateUnitPrice(type, size, finish, qty) {
        const tier = getQuantityTier(qty);
        let basePrice = PRICING[type]?.[size]?.[tier] || 1.00;
        basePrice += FINISH_UPCHARGE[finish] || 0;
        return basePrice;
    }

    function generateCartItemId() {
        return 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ============================================
    // Toast Notifications (Global)
    // ============================================
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const icons = {
            success: '✓',
            error: '✕',
            warning: '!',
            info: 'ℹ'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `
            <div class="toast__icon">${icons[type] || icons.info}</div>
            <span class="toast__message">${message}</span>
            <button class="toast__close">&times;</button>
        `;

        container.appendChild(toast);

        // Close button
        toast.querySelector('.toast__close').addEventListener('click', () => {
            toast.classList.remove('toast--visible');
            setTimeout(() => toast.remove(), 400);
        });

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('toast--visible');
        });

        // Auto dismiss
        setTimeout(() => {
            toast.classList.remove('toast--visible');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    // Make showToast globally accessible
    window.showToast = showToast;

    // ============================================
    // Cart Functions
    // ============================================
    function saveCart() {
        localStorage.setItem('sticker-cart', JSON.stringify(cart));
    }

    function updateCartUI() {
        const cartToggle = document.getElementById('cart-toggle');
        const cartCount = document.getElementById('cart-count');
        const cartItems = document.getElementById('cart-items');
        const cartTotal = document.getElementById('cart-total');
        const checkoutBtn = document.getElementById('checkout-btn');

        if (!cartToggle) return;

        const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

        // Show/hide cart toggle
        cartToggle.style.display = itemCount > 0 ? 'flex' : 'none';

        // Update count badge
        if (cartCount) {
            cartCount.textContent = itemCount;
        }

        // Update cart items list
        if (cartItems) {
            if (cart.length === 0) {
                cartItems.innerHTML = `
                    <div class="cart-empty">
                        <div class="cart-empty__icon">🛒</div>
                        <p>Your cart is empty</p>
                    </div>
                `;
            } else {
                cartItems.innerHTML = cart.map(item => `
                    <div class="cart-item" data-id="${item.id}">
                        <div class="cart-item__image" style="display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(255,122,24,0.1) 0%, rgba(255,179,71,0.05) 100%);">
                            ${item.previewUrl
                                ? `<img src="${item.previewUrl}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover;">`
                                : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5;"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`
                            }
                        </div>
                        <div class="cart-item__info">
                            <div class="cart-item__title">${item.typeName} Stickers</div>
                            <div class="cart-item__details">${item.sizeName} • ${item.finishName} • Qty: ${item.quantity}</div>
                            <div class="cart-item__price">${formatPrice(item.total)}</div>
                        </div>
                        <button class="cart-item__remove" data-id="${item.id}">&times;</button>
                    </div>
                `).join('');

                // Add remove handlers
                cartItems.querySelectorAll('.cart-item__remove').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        removeFromCart(btn.dataset.id);
                    });
                });
            }
        }

        // Update total
        if (cartTotal) {
            const total = cart.reduce((sum, item) => sum + item.total, 0);
            cartTotal.textContent = formatPrice(total);
        }

        // Enable/disable checkout
        if (checkoutBtn) {
            checkoutBtn.disabled = cart.length === 0;
        }
    }

    function addToCart(item) {
        cart.push({
            id: item.id || generateCartItemId(),
            ...item
        });
        saveCart();
        updateCartUI();
        showToast('Added to cart!');
    }

    // Make addToCart globally accessible for builder.js
    window.addToCart = addToCart;

    function removeFromCart(itemId) {
        cart = cart.filter(item => item.id !== itemId);
        saveCart();
        updateCartUI();
        showToast('Removed from cart');
    }

    function clearCart() {
        cart = [];
        saveCart();
        updateCartUI();
    }

    // ============================================
    // Cart Drawer
    // ============================================
    function initCartDrawer() {
        const cartToggle = document.getElementById('cart-toggle');
        const cartDrawer = document.getElementById('cart-drawer');
        const cartClose = document.getElementById('cart-close');
        const cartOverlay = document.getElementById('cart-overlay');
        const checkoutBtn = document.getElementById('checkout-btn');

        if (!cartDrawer) return;

        function openCart() {
            cartDrawer.classList.add('cart-drawer--open');
            cartOverlay?.classList.add('cart-overlay--visible');
            document.body.style.overflow = 'hidden';
        }

        function closeCart() {
            cartDrawer.classList.remove('cart-drawer--open');
            cartOverlay?.classList.remove('cart-overlay--visible');
            document.body.style.overflow = '';
        }

        cartToggle?.addEventListener('click', openCart);
        cartClose?.addEventListener('click', closeCart);
        cartOverlay?.addEventListener('click', closeCart);

        // Checkout button
        checkoutBtn?.addEventListener('click', () => {
            if (cart.length > 0) {
                // In a real app, this would redirect to Stripe checkout
                // For now, simulate checkout
                showToast('Redirecting to checkout...');
                setTimeout(() => {
                    clearCart();
                    closeCart();
                    window.location.href = 'thank-you.html';
                }, 1500);
            }
        });

        // Initialize cart UI
        updateCartUI();
    }

    // ============================================
    // Order Form
    // ============================================
    function initOrderForm() {
        const form = document.getElementById('order-form');
        if (!form) return;

        // State
        let currentType = 'die-cut';
        let currentSize = '3x3';
        let currentFinish = 'gloss';
        let currentQuantity = 50;
        let uploadedFile = null;
        let previewUrl = null;

        // Elements
        const typeTabs = document.getElementById('type-tabs');
        const sizeSelector = document.getElementById('size-selector');
        const finishSelector = document.getElementById('finish-selector');
        const quantityInput = document.getElementById('quantity');
        const qtyDecrease = document.getElementById('qty-decrease');
        const qtyIncrease = document.getElementById('qty-increase');
        const customSizeInputs = document.getElementById('custom-size-inputs');
        const fileUpload = document.getElementById('file-upload');
        const fileInput = document.getElementById('file-input');
        const filePreview = document.getElementById('file-preview');
        const previewImage = document.getElementById('preview-image');
        const removeFileBtn = document.getElementById('remove-file');

        // Summary elements
        const summaryType = document.getElementById('summary-type');
        const summarySize = document.getElementById('summary-size');
        const summaryFinish = document.getElementById('summary-finish');
        const summaryQty = document.getElementById('summary-qty');
        const summaryUnitPrice = document.getElementById('summary-unit-price');
        const summaryTotal = document.getElementById('summary-total');
        const quantityTierLabel = document.getElementById('quantity-tier');

        // URL params
        const urlParams = new URLSearchParams(window.location.search);
        const typeParam = urlParams.get('type');
        if (typeParam && ['die-cut', 'kiss-cut', 'sheet'].includes(typeParam)) {
            currentType = typeParam;
        }

        function updateSummary() {
            const unitPrice = calculateUnitPrice(currentType, currentSize, currentFinish, currentQuantity);
            const total = unitPrice * currentQuantity;

            const typeNames = { 'die-cut': 'Die-Cut', 'kiss-cut': 'Kiss-Cut', 'sheet': 'Sheet' };
            const sizeNames = { '2x2': '2" x 2"', '3x3': '3" x 3"', '4x4': '4" x 4"', '5x5': '5" x 5"', 'custom': 'Custom' };
            const finishNames = { 'gloss': 'Gloss', 'matte': 'Matte', 'holographic': 'Holographic' };

            if (summaryType) summaryType.textContent = typeNames[currentType] || currentType;
            if (summarySize) summarySize.textContent = sizeNames[currentSize] || currentSize;
            if (summaryFinish) summaryFinish.textContent = finishNames[currentFinish] || currentFinish;
            if (summaryQty) summaryQty.textContent = currentQuantity;
            if (summaryUnitPrice) summaryUnitPrice.textContent = formatPrice(unitPrice);
            if (summaryTotal) summaryTotal.textContent = formatPrice(total);
            if (quantityTierLabel) quantityTierLabel.textContent = getQuantityTierLabel(currentQuantity);
        }

        // Type tabs
        if (typeTabs) {
            const tabs = typeTabs.querySelectorAll('.tab');
            tabs.forEach(tab => {
                if (tab.dataset.type === currentType) {
                    tab.classList.add('tab--active');
                } else {
                    tab.classList.remove('tab--active');
                }

                tab.addEventListener('click', () => {
                    tabs.forEach(t => t.classList.remove('tab--active'));
                    tab.classList.add('tab--active');
                    currentType = tab.dataset.type;
                    updateSummary();
                });
            });
        }

        // Size selector
        if (sizeSelector) {
            const sizeOptions = sizeSelector.querySelectorAll('.size-option');
            sizeOptions.forEach(option => {
                option.addEventListener('click', () => {
                    sizeOptions.forEach(o => o.classList.remove('size-option--selected'));
                    option.classList.add('size-option--selected');
                    currentSize = option.dataset.size;

                    // Show/hide custom size inputs
                    if (customSizeInputs) {
                        customSizeInputs.style.display = currentSize === 'custom' ? 'block' : 'none';
                    }

                    updateSummary();
                });
            });
        }

        // Finish selector
        if (finishSelector) {
            const finishOptions = finishSelector.querySelectorAll('.finish-option');
            finishOptions.forEach(option => {
                option.addEventListener('click', () => {
                    finishOptions.forEach(o => o.classList.remove('finish-option--selected'));
                    option.classList.add('finish-option--selected');
                    currentFinish = option.dataset.finish;
                    updateSummary();
                });
            });
        }

        // Quantity controls
        if (quantityInput) {
            quantityInput.addEventListener('change', () => {
                currentQuantity = Math.max(1, Math.min(10000, parseInt(quantityInput.value) || 1));
                quantityInput.value = currentQuantity;
                updateSummary();
            });
        }

        if (qtyDecrease) {
            qtyDecrease.addEventListener('click', () => {
                currentQuantity = Math.max(1, currentQuantity - (currentQuantity >= 100 ? 10 : 1));
                if (quantityInput) quantityInput.value = currentQuantity;
                updateSummary();
            });
        }

        if (qtyIncrease) {
            qtyIncrease.addEventListener('click', () => {
                currentQuantity = Math.min(10000, currentQuantity + (currentQuantity >= 100 ? 10 : 1));
                if (quantityInput) quantityInput.value = currentQuantity;
                updateSummary();
            });
        }

        // File upload
        if (fileUpload && fileInput) {
            fileUpload.addEventListener('click', () => fileInput.click());

            fileUpload.addEventListener('dragover', (e) => {
                e.preventDefault();
                fileUpload.classList.add('file-upload--active');
            });

            fileUpload.addEventListener('dragleave', () => {
                fileUpload.classList.remove('file-upload--active');
            });

            fileUpload.addEventListener('drop', (e) => {
                e.preventDefault();
                fileUpload.classList.remove('file-upload--active');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    handleFileUpload(files[0]);
                }
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleFileUpload(e.target.files[0]);
                }
            });
        }

        function handleFileUpload(file) {
            // Validate file type
            const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf', 'image/svg+xml'];
            const validExtensions = ['.png', '.jpg', '.jpeg', '.pdf', '.ai', '.eps', '.svg'];
            const ext = '.' + file.name.split('.').pop().toLowerCase();

            if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
                showToast('Please upload a PNG, JPG, PDF, AI, EPS, or SVG file', 'error');
                return;
            }

            // Validate file size (50MB max)
            if (file.size > 50 * 1024 * 1024) {
                showToast('File size must be under 50MB', 'error');
                return;
            }

            uploadedFile = file;

            // Show preview for images
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewUrl = e.target.result;
                    if (previewImage) {
                        previewImage.src = previewUrl;
                    }
                    if (fileUpload) fileUpload.style.display = 'none';
                    if (filePreview) filePreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            } else {
                // For non-image files, show a placeholder
                previewUrl = null;
                if (previewImage) {
                    previewImage.src = '';
                    previewImage.style.display = 'none';
                }
                if (fileUpload) fileUpload.style.display = 'none';
                if (filePreview) {
                    filePreview.innerHTML = `
                        <div class="sticker-preview" style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5; margin-bottom: 1rem;">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                            </svg>
                            <p style="font-size: 0.9rem;">${file.name}</p>
                        </div>
                        <div class="text-center">
                            <button type="button" class="btn btn--ghost btn--small" id="remove-file">Remove File</button>
                        </div>
                    `;
                    filePreview.style.display = 'block';

                    // Re-bind remove button
                    const newRemoveBtn = filePreview.querySelector('#remove-file');
                    if (newRemoveBtn) {
                        newRemoveBtn.addEventListener('click', removeFile);
                    }
                }
            }

            showToast('File uploaded successfully');
        }

        function removeFile() {
            uploadedFile = null;
            previewUrl = null;
            if (fileInput) fileInput.value = '';
            if (fileUpload) fileUpload.style.display = 'block';
            if (filePreview) filePreview.style.display = 'none';
        }

        if (removeFileBtn) {
            removeFileBtn.addEventListener('click', removeFile);
        }

        // Form submission
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            if (!uploadedFile) {
                showToast('Please upload your artwork', 'error');
                return;
            }

            const typeNames = { 'die-cut': 'Die-Cut', 'kiss-cut': 'Kiss-Cut', 'sheet': 'Sheet' };
            const sizeNames = { '2x2': '2" x 2"', '3x3': '3" x 3"', '4x4': '4" x 4"', '5x5': '5" x 5"', 'custom': 'Custom' };
            const finishNames = { 'gloss': 'Gloss', 'matte': 'Matte', 'holographic': 'Holographic' };

            const unitPrice = calculateUnitPrice(currentType, currentSize, currentFinish, currentQuantity);
            const total = unitPrice * currentQuantity;

            addToCart({
                type: currentType,
                typeName: typeNames[currentType],
                size: currentSize,
                sizeName: sizeNames[currentSize],
                finish: currentFinish,
                finishName: finishNames[currentFinish],
                quantity: currentQuantity,
                unitPrice: unitPrice,
                total: total,
                notes: document.getElementById('notes')?.value || '',
                fileName: uploadedFile.name,
                previewUrl: previewUrl
            });

            // Reset form
            removeFile();
        });

        // Initialize summary
        updateSummary();
    }

    // ============================================
    // FAQ Accordion
    // ============================================
    function initFAQ() {
        const faqItems = document.querySelectorAll('.faq-item');

        faqItems.forEach(item => {
            const question = item.querySelector('.faq-question');

            question?.addEventListener('click', () => {
                const isOpen = item.classList.contains('faq-item--open');

                // Close all items
                faqItems.forEach(i => i.classList.remove('faq-item--open'));

                // Open clicked item if it wasn't open
                if (!isOpen) {
                    item.classList.add('faq-item--open');
                }
            });
        });
    }

    // ============================================
    // Scroll Animations
    // ============================================
    function initScrollAnimations() {
        const animatedElements = document.querySelectorAll('.fade-in-up, .fade-in');

        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.style.animationPlayState = 'running';
                        observer.unobserve(entry.target);
                    }
                });
            }, {
                threshold: 0.1,
                rootMargin: '0px 0px -50px 0px'
            });

            animatedElements.forEach(el => {
                el.style.animationPlayState = 'paused';
                observer.observe(el);
            });
        }
    }

    // ============================================
    // Navigation Scroll
    // ============================================
    function initNavScroll() {
        const nav = document.getElementById('nav');
        if (!nav) return;

        let lastScroll = 0;

        window.addEventListener('scroll', () => {
            const currentScroll = window.pageYOffset;

            if (currentScroll > 100) {
                nav.classList.add('nav--scrolled');
            } else {
                nav.classList.remove('nav--scrolled');
            }

            lastScroll = currentScroll;
        }, { passive: true });
    }

    // ============================================
    // Homepage Pricing Calculator
    // ============================================
    function initPricingCalculator() {
        const calculator = document.getElementById('pricing-calculator');
        if (!calculator) return;

        const sizeSelect = document.getElementById('calc-size');
        const materialSelect = document.getElementById('calc-material');
        const qtyInput = document.getElementById('calc-quantity');
        const unitPriceEl = document.getElementById('calc-unit-price');
        const totalPriceEl = document.getElementById('calc-total-price');
        const savingsEl = document.getElementById('calc-savings');

        if (!sizeSelect || !materialSelect || !qtyInput) return;

        function calculatePrice() {
            const size = sizeSelect.value;
            const material = materialSelect.value;
            const qty = parseInt(qtyInput.value) || 100;

            // Base price
            let basePrice = CALC_PRICING.sizes[size] || 0.80;

            // Material addon
            basePrice += CALC_PRICING.materials[material] || 0;

            // Find discount tier
            let discount = 0;
            for (const tier of CALC_PRICING.tiers) {
                if (qty >= tier.min && qty <= tier.max) {
                    discount = tier.discount;
                    break;
                }
            }

            const unitPrice = basePrice * (1 - discount);
            const totalPrice = unitPrice * qty;
            const savings = discount > 0 ? (basePrice * discount * qty) : 0;

            // Update UI
            if (unitPriceEl) unitPriceEl.textContent = '$' + unitPrice.toFixed(2);
            if (totalPriceEl) totalPriceEl.textContent = '$' + totalPrice.toFixed(2);
            if (savingsEl) {
                if (savings > 0) {
                    savingsEl.textContent = 'You save $' + savings.toFixed(2) + ' (' + Math.round(discount * 100) + '% off)';
                    savingsEl.style.display = 'block';
                } else {
                    savingsEl.style.display = 'none';
                }
            }
        }

        sizeSelect.addEventListener('change', calculatePrice);
        materialSelect.addEventListener('change', calculatePrice);
        qtyInput.addEventListener('input', calculatePrice);

        // Initial calculation
        calculatePrice();
    }

    // ============================================
    // Homepage Material Cards
    // ============================================
    function initMaterialCards() {
        const materialCards = document.querySelectorAll('.material-card');
        if (!materialCards.length) return;

        materialCards.forEach(card => {
            card.addEventListener('mouseenter', () => {
                // Add subtle pulse effect
                card.style.transform = 'translateY(-8px)';
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
            });

            // Click to navigate to builder with material preselected
            card.addEventListener('click', () => {
                const material = card.dataset.material;
                if (material) {
                    window.location.href = `builder.html?material=${material}`;
                }
            });
        });
    }

    // ============================================
    // Homepage Use Case Cards
    // ============================================
    function initUseCaseCards() {
        const useCaseCards = document.querySelectorAll('.use-case-card');
        if (!useCaseCards.length) return;

        useCaseCards.forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't navigate if clicking on an actual link
                if (e.target.tagName === 'A') return;

                const link = card.querySelector('a');
                if (link) {
                    window.location.href = link.href;
                }
            });
        });
    }

    // ============================================
    // Mobile Navigation
    // ============================================
    function initMobileNav() {
        const mobileToggle = document.getElementById('mobile-nav-toggle');
        const navLinks = document.querySelector('.nav__links');

        if (!mobileToggle || !navLinks) return;

        mobileToggle.addEventListener('click', () => {
            navLinks.classList.toggle('nav__links--open');
            mobileToggle.classList.toggle('active');
        });

        // Close on link click
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('nav__links--open');
                mobileToggle.classList.remove('active');
            });
        });
    }

    // ============================================
    // Smooth Scroll for Anchor Links
    // ============================================
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const targetId = this.getAttribute('href');
                if (targetId === '#') return;

                const target = document.querySelector(targetId);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }

    // ============================================
    // Initialize
    // ============================================
    function init() {
        initCartDrawer();
        initOrderForm();
        initFAQ();
        initScrollAnimations();
        initNavScroll();
        initPricingCalculator();
        initMaterialCards();
        initUseCaseCards();
        initMobileNav();
        initSmoothScroll();
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
