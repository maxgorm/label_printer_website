/**
 * Sentimo Order Form
 * Handles: product, color, and quantity selection, sale pricing (ends 12/1), the shipping
 * destination note, and adding the configured printer to the cart (cart.js handles checkout,
 * the paper add-on offer, and Stripe).
 */
(function () {
  'use strict';

  const qtyMinus = document.getElementById('qty-minus');
  const qtyPlus = document.getElementById('qty-plus');
  const qtyDisplay = document.getElementById('quantity-display');
  const preorderBtn = document.getElementById('preorder-btn');
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
  const colorSelectionHelp = document.getElementById('color-selection-help');
  const colorPickers = document.querySelectorAll('.color-picker');
  const colorOptions = document.querySelectorAll('[data-color-option]');
  const colorRadios = document.querySelectorAll('.color-radio');
  const orderShippingNote = document.getElementById('order-shipping-note');
  const saleBadge = document.getElementById('sale-badge');

  let quantity = 1;
  let selectedProduct = 'duo';
  let selectedColors = [null, null];
  const MAX_QTY = 10;
  const MIN_QTY = 1;
  // Display prices come from the cart catalog (cart.js), which also handles the 12/1 sale end.
  const CATALOG = window.SentimoCart.catalog;
  const saleActive = CATALOG.saleActive;
  const fmt = window.SentimoCart.formatCents;
  const PRODUCTS = {
    single: {
      currentPrice: fmt(CATALOG.products.single.priceCents),
      originalPrice: CATALOG.products.single.originalCents ? fmt(CATALOG.products.single.originalCents) : '',
      subtitle: 'for 1 printer',
      quantityHelp: 'Each single-printer option includes 1 printer and starter materials',
      buttonLabel: 'Add Single Printer to Cart',
      printerCount: 1,
    },
    duo: {
      currentPrice: fmt(CATALOG.products.duo.priceCents),
      originalPrice: CATALOG.products.duo.originalCents ? fmt(CATALOG.products.duo.originalCents) : '',
      subtitle: 'for 2 printers',
      quantityHelp: 'Each 2-pack includes 2 printers (choose a color for each; the colors can match)',
      buttonLabel: 'Add 2-Pack to Cart',
      printerCount: 2,
    },
  };

  const COLOR_LABELS = {
    pink: 'Pink',
    white: 'White',
    black: 'Black',
  };

  // Static markup shows sale prices; switch it to regular prices once the sale ends.
  if (!saleActive) {
    saleBadge?.classList.add('hidden');
    document.querySelectorAll('[data-sale-original]').forEach((el) => el.classList.add('hidden'));
    document.querySelectorAll('[data-regular-text]').forEach((el) => {
      el.textContent = el.dataset.regularText;
    });
  }

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

  // Meta ViewContent: once per page load, when the order section is actually seen.
  // IDs are the same product slugs the server uses for Stripe orders and Purchase events.
  const PRODUCT_SLUGS = { single: 'sentimo-single', duo: 'sentimo-2-pack' };
  const orderSection = document.getElementById('reserve');
  if (orderSection && 'IntersectionObserver' in window) {
    const viewObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      viewObserver.disconnect();
      const product = PRODUCTS[selectedProduct];
      window.SentimoTrack?.track('ViewContent', {
        content_ids: [PRODUCT_SLUGS[selectedProduct]],
        content_name: selectedProduct === 'single' ? 'Sentimo Single Printer' : 'Sentimo 2-Pack',
        content_type: 'product',
        contents: [{ id: PRODUCT_SLUGS[selectedProduct], quantity: 1 }],
        value: parseFloat(product.currentPrice.replace(/[^0-9.]/g, '')),
        currency: 'USD',
      });
    }, { threshold: 0.3 });
    viewObserver.observe(orderSection);
  }

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
    });

    updateColorSelection();
  }

  function requiredColorCount() {
    return PRODUCTS[selectedProduct]?.printerCount || 2;
  }

  function hasCompleteColorSelection() {
    return selectedColors.slice(0, requiredColorCount()).every(Boolean);
  }

  function updateColorSelection() {
    const requiredCount = requiredColorCount();
    const selectedForOrder = selectedColors.slice(0, requiredCount);

    colorPickers.forEach((picker, index) => {
      const isVisible = index < requiredCount;
      picker.classList.toggle('hidden', !isVisible);
      picker.setAttribute('aria-hidden', String(!isVisible));
    });

    colorOptions.forEach((option) => {
      const printerIndex = Number(option.dataset.printerIndex);
      const isSelected = selectedColors[printerIndex] === option.dataset.colorOption;
      option.classList.toggle('border-primary', isSelected);
      option.classList.toggle('bg-primary/5', isSelected);
      option.classList.toggle('border-gray-200', !isSelected);
      option.classList.toggle('dark:border-gray-700', !isSelected);
    });

    if (colorSelectionHelp) {
      if (hasCompleteColorSelection()) {
        const colorSummary = selectedForOrder.map((color) => COLOR_LABELS[color]).join(' + ');
        colorSelectionHelp.textContent = `Selected: ${colorSummary}. This selection applies to each package.`;
      } else if (requiredCount === 1) {
        colorSelectionHelp.textContent = 'Choose one color for your single printer.';
      } else {
        colorSelectionHelp.textContent = 'Choose two colors for your 2-pack. You can choose the same color twice.';
      }
    }

    if (preorderBtn) {
      preorderBtn.disabled = !hasCompleteColorSelection();
    }
  }

  productRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        selectedProduct = radio.value;
        updateProductDisplay();
      }
    });
  });

  colorRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      const printerIndex = Number(radio.dataset.printerIndex);
      selectedColors[printerIndex] = radio.value;
      updateColorSelection();
    });
  });

  updateProductDisplay();

  // Hero, nav, and sticky-bar buttons ("Get the 2-Pack for $49.99"): show the live 2-pack price
  // (it changes when the sale ends) and select that option in the order form when clicked.
  document.querySelectorAll('[data-duo-price]').forEach((el) => {
    el.textContent = PRODUCTS.duo.currentPrice;
  });
  document.querySelectorAll('[data-select-product]').forEach((el) => {
    el.addEventListener('click', () => {
      const radio = document.querySelector(`input[name="product"][value="${el.dataset.selectProduct}"]`);
      if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });

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

  // ===================== SHIPPING DESTINATION =====================
  // Printer orders always clear the US free-shipping threshold.
  function updateShippingNote() {
    const ship = window.SentimoShipping;
    if (!orderShippingNote || !ship) return;
    orderShippingNote.textContent = ship.isInternational()
      ? `Shipping to ${ship.countryName()} is ${fmt(ship.quote({ subtotalCents: 0 }).cents)} per order. Delivery takes 5-14 days. Duties and taxes are the buyer’s responsibility.`
      : 'Free shipping anywhere in the US. Delivery takes 2-5 days.';
  }

  window.SentimoShipping?.onChange(updateShippingNote);
  updateShippingNote();

  // ===================== ADD TO CART =====================
  preorderBtn?.addEventListener('click', () => {
    if (!hasCompleteColorSelection()) {
      updateColorSelection();
      return;
    }
    const added = window.SentimoCart.add({
      type: 'printer',
      product: selectedProduct,
      colors: selectedColors.slice(0, requiredColorCount()),
      quantity,
    });
    if (added) {
      // Ready for another configuration; the cart drawer now shows the checkout prompt.
      quantity = 1;
      updateQtyDisplay();
    }
  });

  // ===================== CTA TRACKING =====================
  // data-track names the event; data-track-location (optional) says which button sent it.
  document.querySelectorAll('[data-track]').forEach((el) => {
    el.addEventListener('click', () => {
      trackEvent(el.dataset.track, el.dataset.trackLocation ? { location: el.dataset.trackLocation } : {});
    });
  });
})();
