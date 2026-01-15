/* ============================================
   STICKER BUILDER - Interactive Functionality
   ============================================ */

(function() {
    'use strict';

    // ========================
    // State Management
    // ========================
    const state = {
        file: null,
        filePreview: null,
        surface: 'blank',
        cut: 'die-cut',
        material: 'vinyl',
        finish: 'gloss',
        size: '3x3',
        customWidth: 3,
        customHeight: 3,
        quantity: 100
    };

    // Pricing configuration
    const pricing = {
        base: {
            '2x2': 0.60,
            '3x3': 0.80,
            '4x4': 1.10,
            '5x5': 1.45,
            'custom': 0.85 // per square inch
        },
        materials: {
            'vinyl': 0,
            'clear': 0.10,
            'holographic': 0.35,
            'glitter': 0.30,
            'mirror': 0.40,
            'kraft': 0.05,
            'glow': 0.50,
            'aluminum': 0.45
        },
        finishes: {
            'gloss': 0,
            'matte': 0.05,
            'satin': 0.03
        },
        cuts: {
            'die-cut': 0,
            'kiss-cut': -0.05,
            'sheet': -0.15
        },
        tiers: [
            { min: 1, max: 24, discount: 0, label: 'Sample quantity' },
            { min: 25, max: 49, discount: 0, label: 'Starter tier' },
            { min: 50, max: 99, discount: 0.05, label: 'Small batch' },
            { min: 100, max: 249, discount: 0.10, label: 'Good value tier' },
            { min: 250, max: 499, discount: 0.18, label: 'Better value' },
            { min: 500, max: 999, discount: 0.25, label: 'Great savings' },
            { min: 1000, max: 4999, discount: 0.32, label: 'Best value' },
            { min: 5000, max: 100000, discount: 0.40, label: 'Wholesale pricing' }
        ]
    };

    // ========================
    // DOM Elements
    // ========================
    const elements = {
        // Upload
        fileInput: document.getElementById('file-input'),
        uploadArea: document.getElementById('upload-area'),
        uploadContent: document.getElementById('upload-content'),
        uploadFile: document.getElementById('upload-file'),
        fileName: document.getElementById('file-name'),
        fileSize: document.getElementById('file-size'),
        removeFile: document.getElementById('remove-file'),
        uploadPlaceholder: document.getElementById('upload-placeholder'),
        previewImage: document.getElementById('preview-image'),

        // Preview
        mockupSurface: document.getElementById('mockup-surface'),
        mockupSticker: document.getElementById('mockup-sticker'),
        materialEffect: document.getElementById('material-effect'),
        sizeIndicator: document.getElementById('size-indicator'),
        sizeDisplay: document.getElementById('size-display'),

        // Selectors
        surfaceButtons: document.querySelectorAll('.surface-btn'),
        cutSelector: document.getElementById('cut-selector'),
        materialSelector: document.getElementById('material-selector'),
        finishSelector: document.getElementById('finish-selector'),
        sizeSelector: document.getElementById('size-selector'),
        customSizeInputs: document.getElementById('custom-size-inputs'),
        customWidth: document.getElementById('custom-width'),
        customHeight: document.getElementById('custom-height'),
        quantityPresets: document.getElementById('quantity-presets'),
        quantityInput: document.getElementById('quantity-input'),
        quantityTier: document.getElementById('quantity-tier'),

        // Notes
        notesToggle: document.getElementById('notes-toggle'),
        notesBody: document.getElementById('notes-body'),

        // Pricing
        unitPrice: document.getElementById('unit-price'),
        totalPrice: document.getElementById('total-price'),
        addToCartBtn: document.getElementById('add-to-cart-btn'),

        // Help
        helpBtn: document.getElementById('help-btn')
    };

    // ========================
    // File Upload Handling
    // ========================
    function initUpload() {
        // Click to upload
        elements.uploadArea.addEventListener('click', (e) => {
            if (!e.target.closest('.upload-file__remove')) {
                elements.fileInput.click();
            }
        });

        // Also allow clicking on preview placeholder
        if (elements.uploadPlaceholder) {
            elements.uploadPlaceholder.addEventListener('click', () => {
                elements.fileInput.click();
            });
        }

        // File input change
        elements.fileInput.addEventListener('change', handleFileSelect);

        // Drag and drop
        elements.uploadArea.addEventListener('dragover', handleDragOver);
        elements.uploadArea.addEventListener('dragleave', handleDragLeave);
        elements.uploadArea.addEventListener('drop', handleDrop);

        // Remove file
        elements.removeFile.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFile();
        });
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        elements.uploadArea.classList.add('upload-area--active');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        elements.uploadArea.classList.remove('upload-area--active');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        elements.uploadArea.classList.remove('upload-area--active');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    }

    function handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    }

    function processFile(file) {
        // Validate file type
        const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf', 'image/svg+xml'];
        const validExtensions = ['.png', '.jpg', '.jpeg', '.pdf', '.ai', '.eps', '.svg'];
        const extension = '.' + file.name.split('.').pop().toLowerCase();

        if (!validTypes.includes(file.type) && !validExtensions.includes(extension)) {
            showToast('Please upload a valid file (PNG, JPG, PDF, AI, EPS, SVG)', 'error');
            return;
        }

        // Validate file size (50MB max)
        if (file.size > 50 * 1024 * 1024) {
            showToast('File size must be under 50MB', 'error');
            return;
        }

        state.file = file;

        // Update UI
        elements.fileName.textContent = file.name;
        elements.fileSize.textContent = formatFileSize(file.size);
        elements.uploadContent.style.display = 'none';
        elements.uploadFile.style.display = 'flex';

        // Show preview if image
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                state.filePreview = e.target.result;
                elements.previewImage.src = e.target.result;
                elements.previewImage.style.display = 'block';
                elements.uploadPlaceholder.style.display = 'none';
            };
            reader.readAsDataURL(file);
        } else {
            // For non-image files, show a placeholder
            elements.previewImage.style.display = 'none';
            elements.uploadPlaceholder.style.display = 'flex';
            elements.uploadPlaceholder.querySelector('.upload-placeholder__text').textContent = file.name;
            elements.uploadPlaceholder.querySelector('.upload-placeholder__hint').textContent = 'File uploaded';
        }

        showToast('File uploaded successfully', 'success');
    }

    function removeFile() {
        state.file = null;
        state.filePreview = null;
        elements.fileInput.value = '';
        elements.uploadContent.style.display = 'flex';
        elements.uploadFile.style.display = 'none';
        elements.previewImage.style.display = 'none';
        elements.previewImage.src = '';
        elements.uploadPlaceholder.style.display = 'flex';
        elements.uploadPlaceholder.querySelector('.upload-placeholder__text').textContent = 'Drop your artwork here';
        elements.uploadPlaceholder.querySelector('.upload-placeholder__hint').textContent = 'or click to browse';
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // ========================
    // Surface Selection
    // ========================
    function initSurfaceSelector() {
        elements.surfaceButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const surface = btn.dataset.surface;
                selectSurface(surface);
            });
        });
    }

    function selectSurface(surface) {
        state.surface = surface;

        // Update button states
        elements.surfaceButtons.forEach(btn => {
            btn.classList.toggle('surface-btn--active', btn.dataset.surface === surface);
        });

        // Update surface visual
        elements.mockupSurface.className = 'sticker-mockup__surface';
        if (surface !== 'blank') {
            elements.mockupSurface.classList.add(`sticker-mockup__surface--${surface}`);
        }
    }

    // ========================
    // Cut Style Selection
    // ========================
    function initCutSelector() {
        const cutOptions = elements.cutSelector.querySelectorAll('.cut-option');
        cutOptions.forEach(option => {
            option.addEventListener('click', () => {
                selectCut(option.dataset.cut);
            });
        });
    }

    function selectCut(cut) {
        state.cut = cut;

        // Update button states
        const cutOptions = elements.cutSelector.querySelectorAll('.cut-option');
        cutOptions.forEach(option => {
            option.classList.toggle('cut-option--active', option.dataset.cut === cut);
        });

        // Update sticker preview shape
        elements.mockupSticker.className = 'sticker-mockup__sticker';
        if (cut !== 'die-cut') {
            elements.mockupSticker.classList.add(`sticker-mockup__sticker--${cut}`);
        }

        updatePricing();
    }

    // ========================
    // Material Selection
    // ========================
    function initMaterialSelector() {
        const materialOptions = elements.materialSelector.querySelectorAll('.material-option');
        materialOptions.forEach(option => {
            option.addEventListener('click', () => {
                selectMaterial(option.dataset.material);
            });
        });
    }

    function selectMaterial(material) {
        state.material = material;

        // Update button states
        const materialOptions = elements.materialSelector.querySelectorAll('.material-option');
        materialOptions.forEach(option => {
            option.classList.toggle('material-option--active', option.dataset.material === material);
        });

        // Update material effect overlay
        updateMaterialEffect(material);
        updatePricing();
    }

    function updateMaterialEffect(material) {
        elements.materialEffect.className = 'material-effect';

        // Add effect class for special materials
        const effectMaterials = ['holographic', 'glitter', 'mirror'];
        if (effectMaterials.includes(material)) {
            elements.materialEffect.classList.add(`material-effect--${material}`);
        }
    }

    // ========================
    // Finish Selection
    // ========================
    function initFinishSelector() {
        const finishOptions = elements.finishSelector.querySelectorAll('.finish-option');
        finishOptions.forEach(option => {
            option.addEventListener('click', () => {
                selectFinish(option.dataset.finish);
            });
        });
    }

    function selectFinish(finish) {
        state.finish = finish;

        // Update button states
        const finishOptions = elements.finishSelector.querySelectorAll('.finish-option');
        finishOptions.forEach(option => {
            option.classList.toggle('finish-option--active', option.dataset.finish === finish);
        });

        updatePricing();
    }

    // ========================
    // Size Selection
    // ========================
    function initSizeSelector() {
        const sizeOptions = elements.sizeSelector.querySelectorAll('.size-option');
        sizeOptions.forEach(option => {
            option.addEventListener('click', () => {
                selectSize(option.dataset.size);
            });
        });

        // Custom size inputs
        elements.customWidth.addEventListener('input', updateCustomSize);
        elements.customHeight.addEventListener('input', updateCustomSize);
    }

    function selectSize(size) {
        state.size = size;

        // Update button states
        const sizeOptions = elements.sizeSelector.querySelectorAll('.size-option');
        sizeOptions.forEach(option => {
            option.classList.toggle('size-option--active', option.dataset.size === size);
        });

        // Show/hide custom size inputs
        elements.customSizeInputs.style.display = size === 'custom' ? 'flex' : 'none';

        // Update size display
        updateSizeDisplay();
        updatePricing();
    }

    function updateCustomSize() {
        state.customWidth = parseFloat(elements.customWidth.value) || 3;
        state.customHeight = parseFloat(elements.customHeight.value) || 3;
        updateSizeDisplay();
        updatePricing();
    }

    function updateSizeDisplay() {
        let displayText;
        if (state.size === 'custom') {
            displayText = `${state.customWidth}" × ${state.customHeight}"`;
        } else {
            const size = state.size.split('x')[0];
            displayText = `${size}" × ${size}"`;
        }
        elements.sizeDisplay.textContent = displayText;
    }

    // ========================
    // Quantity Selection
    // ========================
    function initQuantitySelector() {
        const presets = elements.quantityPresets.querySelectorAll('.qty-preset');
        presets.forEach(preset => {
            preset.addEventListener('click', () => {
                selectQuantityPreset(parseInt(preset.dataset.qty));
            });
        });

        elements.quantityInput.addEventListener('input', handleQuantityInput);
        elements.quantityInput.addEventListener('change', handleQuantityChange);
    }

    function selectQuantityPreset(qty) {
        state.quantity = qty;
        elements.quantityInput.value = qty;

        // Update preset states
        const presets = elements.quantityPresets.querySelectorAll('.qty-preset');
        presets.forEach(preset => {
            preset.classList.toggle('qty-preset--active', parseInt(preset.dataset.qty) === qty);
        });

        updateQuantityTier();
        updatePricing();
    }

    function handleQuantityInput() {
        // Remove preset active states when typing
        const presets = elements.quantityPresets.querySelectorAll('.qty-preset');
        presets.forEach(preset => preset.classList.remove('qty-preset--active'));

        // Check if matches a preset
        const qty = parseInt(elements.quantityInput.value) || 0;
        presets.forEach(preset => {
            if (parseInt(preset.dataset.qty) === qty) {
                preset.classList.add('qty-preset--active');
            }
        });
    }

    function handleQuantityChange() {
        let qty = parseInt(elements.quantityInput.value) || 1;
        qty = Math.max(1, Math.min(100000, qty));
        elements.quantityInput.value = qty;
        state.quantity = qty;
        updateQuantityTier();
        updatePricing();
    }

    function updateQuantityTier() {
        const tier = pricing.tiers.find(t => state.quantity >= t.min && state.quantity <= t.max);
        if (tier) {
            const tierText = elements.quantityTier.querySelector('span');
            tierText.textContent = `${tier.min}-${tier.max}: ${tier.label}`;
        }
    }

    // ========================
    // Pricing Calculation
    // ========================
    function calculateUnitPrice() {
        // Base price
        let basePrice;
        if (state.size === 'custom') {
            const area = state.customWidth * state.customHeight;
            basePrice = pricing.base.custom * area;
        } else {
            basePrice = pricing.base[state.size];
        }

        // Material addon
        const materialAddon = pricing.materials[state.material] || 0;

        // Finish addon
        const finishAddon = pricing.finishes[state.finish] || 0;

        // Cut adjustment
        const cutAddon = pricing.cuts[state.cut] || 0;

        // Subtotal before discount
        let unitPrice = basePrice + materialAddon + finishAddon + cutAddon;

        // Apply quantity discount
        const tier = pricing.tiers.find(t => state.quantity >= t.min && state.quantity <= t.max);
        if (tier) {
            unitPrice = unitPrice * (1 - tier.discount);
        }

        return Math.max(0.10, unitPrice); // Minimum price
    }

    function updatePricing() {
        const unitPrice = calculateUnitPrice();
        const total = unitPrice * state.quantity;

        elements.unitPrice.textContent = '$' + unitPrice.toFixed(2);
        elements.totalPrice.textContent = '$' + total.toFixed(2);
    }

    // ========================
    // Notes Toggle
    // ========================
    function initNotesToggle() {
        elements.notesToggle.addEventListener('click', () => {
            const isExpanded = elements.notesBody.style.display !== 'none';
            elements.notesBody.style.display = isExpanded ? 'none' : 'block';

            const number = elements.notesToggle.querySelector('.control-section__number');
            number.textContent = isExpanded ? '+' : '−';
        });
    }

    // ========================
    // Add to Cart
    // ========================
    function initAddToCart() {
        elements.addToCartBtn.addEventListener('click', addToCart);
    }

    function addToCart() {
        if (!state.file) {
            showToast('Please upload your artwork first', 'warning');
            // Scroll to upload section
            document.getElementById('upload-section').scrollIntoView({ behavior: 'smooth' });
            return;
        }

        // Get size dimensions
        let width, height;
        if (state.size === 'custom') {
            width = state.customWidth;
            height = state.customHeight;
        } else {
            const size = parseInt(state.size.split('x')[0]);
            width = height = size;
        }

        // Build cart item
        const cartItem = {
            id: Date.now().toString(),
            type: 'sticker',
            file: {
                name: state.file.name,
                preview: state.filePreview
            },
            options: {
                cut: state.cut,
                material: state.material,
                finish: state.finish,
                width: width,
                height: height,
                quantity: state.quantity
            },
            unitPrice: calculateUnitPrice(),
            totalPrice: calculateUnitPrice() * state.quantity,
            notes: document.getElementById('notes')?.value || ''
        };

        // Add to cart (use global cart if available)
        if (typeof window.addToCart === 'function') {
            window.addToCart(cartItem);
        } else {
            // Fallback: store in localStorage
            const cart = JSON.parse(localStorage.getItem('stickerCart') || '[]');
            cart.push(cartItem);
            localStorage.setItem('stickerCart', JSON.stringify(cart));
            showToast('Added to cart!', 'success');
            updateCartUI();
        }
    }

    function updateCartUI() {
        const cart = JSON.parse(localStorage.getItem('stickerCart') || '[]');
        const cartToggle = document.getElementById('cart-toggle');
        const cartCount = document.getElementById('cart-count');

        if (cart.length > 0) {
            cartToggle.style.display = 'flex';
            cartCount.textContent = cart.length;
        }
    }

    // ========================
    // Help Modal
    // ========================
    function initHelp() {
        elements.helpBtn.addEventListener('click', showHelpInfo);
    }

    function showHelpInfo() {
        showToast('Need help? Email us at orders@12ozstickers.com', 'info');
    }

    // ========================
    // Toast Notifications
    // ========================
    function showToast(message, type = 'info') {
        // Use global toast if available
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }

        // Fallback toast implementation
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `
            <span class="toast__message">${message}</span>
            <button class="toast__close">&times;</button>
        `;

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('toast--visible');
        });

        // Close button
        toast.querySelector('.toast__close').addEventListener('click', () => {
            closeToast(toast);
        });

        // Auto close
        setTimeout(() => closeToast(toast), 4000);
    }

    function closeToast(toast) {
        toast.classList.remove('toast--visible');
        toast.addEventListener('transitionend', () => toast.remove());
    }

    // ========================
    // Keyboard Shortcuts
    // ========================
    function initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Enter to add to cart
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                addToCart();
            }

            // Escape to go back
            if (e.key === 'Escape') {
                const backLink = document.querySelector('.builder-nav__back');
                if (backLink) {
                    window.location.href = backLink.href;
                }
            }
        });
    }

    // ========================
    // Initialize
    // ========================
    function init() {
        initUpload();
        initSurfaceSelector();
        initCutSelector();
        initMaterialSelector();
        initFinishSelector();
        initSizeSelector();
        initQuantitySelector();
        initNotesToggle();
        initAddToCart();
        initHelp();
        initKeyboardShortcuts();

        // Initial pricing update
        updatePricing();
        updateQuantityTier();
        updateSizeDisplay();

        // Check for existing cart items
        updateCartUI();
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
