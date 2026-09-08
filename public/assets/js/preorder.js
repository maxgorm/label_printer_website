/**
 * Sentimo Pre-Order Checkout Logic
 * Handles: quantity selection, checkbox gating, Stripe Checkout redirect, analytics events
 */
(function () {
  'use strict';

  const qtyMinus = document.getElementById('qty-minus');
  const qtyPlus = document.getElementById('qty-plus');
  const qtyDisplay = document.getElementById('quantity-display');
  const checkbox = document.getElementById('preorder-agree');
  const preorderBtn = document.getElementById('preorder-btn');
  const preorderBtnText = document.getElementById('preorder-btn-text');
  const preorderBtnSpinner = document.getElementById('preorder-btn-spinner');
  const preorderError = document.getElementById('preorder-error');
  const productOptions = document.querySelectorAll('[data-product-option]');
  const productRadios = document.querySelectorAll('input[name="product"]');
  const priceOriginal = document.getElementById('price-original');
  const priceOriginalWrap = document.getElementById('price-original-wrap');
  const priceCurrent = document.getElementById('price-current');
  const priceSubtitle = document.getElementById('price-subtitle');
  const quantityHelp = document.getElementById('quantity-help');
  const preorderBtnLabel = document.getElementById('preorder-btn-text');
  const singleInfoButton = document.getElementById('single-info-button');
  const singleInfoPopover = document.getElementById('single-info-popover');
  const singleInfoClose = document.getElementById('single-info-close');

  let quantity = 1;
  let selectedProduct = 'duo';
  const MAX_QTY = 10;
  const MIN_QTY = 1;
  const PRODUCTS = {
    single: {
      currentPrice: '$29',
      originalPrice: '$49',
      subtitle: 'for 1 printer',
      quantityHelp: 'Each single-printer option includes 1 printer and starter materials',
      buttonLabel: 'Pre-Order Single Printer',
    },
    duo: {
      currentPrice: '$49',
      originalPrice: '$69',
      subtitle: 'for 2 printers',
      quantityHelp: 'Each 2-pack includes 2 printers (one for you, one for them)',
      buttonLabel: 'Pre-Order 2-Pack',
    },
  };

  // ===================== ANALYTICS HELPERS =====================
  function trackEvent(eventName, data) {
    // Extend this with your analytics provider (e.g., Google Analytics, Mixpanel)
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, data);
    }
    // Console log in development
    if (window.location.hostname === 'localhost') {
      console.log('[Analytics]', eventName, data);
    }
  }

  // Track page view
  trackEvent('page_view_preorder', { page: 'preorder' });

  // ===================== QUANTITY CONTROLS =====================
  function updateProductDisplay() {
    const product = PRODUCTS[selectedProduct];
    if (!product) return;

    if (priceOriginal) priceOriginal.textContent = product.originalPrice;
    if (priceOriginalWrap) priceOriginalWrap.classList.toggle('hidden', !product.originalPrice);
    if (priceCurrent) priceCurrent.textContent = product.currentPrice;
    if (priceSubtitle) priceSubtitle.textContent = product.subtitle;
    if (quantityHelp) quantityHelp.textContent = product.quantityHelp;
    if (preorderBtnLabel) preorderBtnLabel.textContent = product.buttonLabel;

    productOptions.forEach((option) => {
      const isSelected = option.dataset.productOption === selectedProduct;
      option.classList.toggle('border-primary', isSelected);
      option.classList.toggle('bg-primary/5', isSelected);
      option.classList.toggle('border-gray-200', !isSelected);
      option.classList.toggle('dark:border-gray-700', !isSelected);
      option.setAttribute('aria-checked', String(isSelected));
    });
  }

  productRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        selectedProduct = radio.value;
        updateProductDisplay();
      }
    });
  });

  updateProductDisplay();

  // ===================== SINGLE-PRINTER INFO =====================
  function setSingleInfoOpen(isOpen) {
    if (!singleInfoPopover || !singleInfoButton) return;

    singleInfoPopover.classList.toggle('hidden', !isOpen);
    singleInfoButton.setAttribute('aria-expanded', String(isOpen));
  }

  singleInfoButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSingleInfoOpen(singleInfoPopover?.classList.contains('hidden'));
  });

  singleInfoClose?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSingleInfoOpen(false);
    singleInfoButton?.focus();
  });

  singleInfoPopover?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.addEventListener('click', (event) => {
    if (singleInfoPopover && !singleInfoPopover.classList.contains('hidden') && !singleInfoPopover.contains(event.target) && event.target !== singleInfoButton) {
      setSingleInfoOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && singleInfoPopover && !singleInfoPopover.classList.contains('hidden')) {
      setSingleInfoOpen(false);
      singleInfoButton?.focus();
    }
  });

  function updateQtyDisplay() {
    if (qtyDisplay) qtyDisplay.textContent = quantity;
  }

  qtyMinus?.addEventListener('click', () => {
    if (quantity > MIN_QTY) {
      quantity--;
      updateQtyDisplay();
    }
  });

  qtyPlus?.addEventListener('click', () => {
    if (quantity < MAX_QTY) {
      quantity++;
      updateQtyDisplay();
    }
  });

  // ===================== CHECKBOX GATING =====================
  checkbox?.addEventListener('change', () => {
    if (preorderBtn) {
      preorderBtn.disabled = !checkbox.checked;
    }
  });

  // ===================== PRE-ORDER BUTTON =====================
  preorderBtn?.addEventListener('click', async () => {
    if (!checkbox?.checked) return;

    // Track CTA click
    trackEvent('checkout_started', { quantity, product: selectedProduct });

    // Set loading state
    preorderBtn.disabled = true;
    if (preorderBtnText) preorderBtnText.textContent = 'Processing...';
    if (preorderBtnSpinner) preorderBtnSpinner.classList.remove('hidden');
    if (preorderError) preorderError.classList.add('hidden');

    try {
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity, product: selectedProduct }),
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server error. Please ensure the Vercel dev server is running (not a static file server).');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      if (preorderError) {
        preorderError.textContent = err.message || 'Unable to start checkout. Please try again.';
        preorderError.classList.remove('hidden');
      }

      // Reset button
      preorderBtn.disabled = !checkbox.checked;
      if (preorderBtnText) preorderBtnText.textContent = 'Pre-Order Now';
      if (preorderBtnSpinner) preorderBtnSpinner.classList.add('hidden');
    }
  });

  // ===================== CTA TRACKING =====================
  document.querySelectorAll('[data-track="click_preorder_cta"]').forEach((el) => {
    el.addEventListener('click', () => {
      trackEvent('click_preorder_cta', {});
    });
  });
})();
