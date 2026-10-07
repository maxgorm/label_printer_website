/**
 * Sentimo Pre-Order Checkout Logic
 * Handles: quantity selection, color selection, optional thermal paper, the $4.99 paper add-on pop-up, checkbox gating, Stripe Checkout redirect, analytics events
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
  const colorSelectionHelp = document.getElementById('color-selection-help');
  const colorPickers = document.querySelectorAll('.color-picker');
  const colorOptions = document.querySelectorAll('[data-color-option]');
  const colorRadios = document.querySelectorAll('.color-radio');
  const paperOptions = document.querySelectorAll('[data-paper-option]');
  const paperHelp = document.getElementById('paper-selection-help');
  const paperQtyWrap = document.getElementById('paper-form-qty-wrap');
  const paperQtyDisplay = document.getElementById('paper-form-qty');
  const paperMinus = document.getElementById('paper-form-minus');
  const paperPlus = document.getElementById('paper-form-plus');
  const addonModal = document.getElementById('paper-addon-modal');
  const addonBackdrop = document.getElementById('paper-addon-backdrop');
  const addonClose = document.getElementById('paper-addon-close');
  const addonSkip = document.getElementById('paper-addon-skip');
  const addonApplied = document.getElementById('paper-addon-applied');
  const addonAppliedImg = document.getElementById('paper-addon-applied-img');
  const addonAppliedText = document.getElementById('paper-addon-applied-text');
  const addonRemove = document.getElementById('paper-addon-remove');

  let quantity = 1;
  let selectedProduct = 'duo';
  let selectedColors = [null, null];
  let paperChoice = null;
  let paperQty = 1;
  let addonChoice = null;
  const MAX_QTY = 10;
  const MIN_QTY = 1;
  const MAX_PAPER_QTY = 10;
  const ADDON_PRICE = 499;
  // Display only. The server sets the real prices.
  const PAPER_BUNDLES = {
    classic: { label: 'Classic', price: 799 },
    sweet: { label: 'Sweet', price: 899 },
    bright: { label: 'Bright', price: 899 },
  };
  const PRODUCTS = {
    single: {
      currentPrice: '$29.99',
      originalPrice: '$49.99',
      subtitle: 'for 1 printer',
      quantityHelp: 'Each single-printer option includes 1 printer and starter materials',
      buttonLabel: 'Pre-Order Single Printer',
      printerCount: 1,
    },
    duo: {
      currentPrice: '$49.99',
      originalPrice: '$69.99',
      subtitle: 'for 2 printers',
      quantityHelp: 'Each 2-pack includes 2 printers (choose a color for each; the colors can match)',
      buttonLabel: 'Pre-Order 2-Pack',
      printerCount: 2,
    },
  };

  const COLOR_LABELS = {
    pink: 'Pink',
    white: 'White',
    black: 'Black',
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

    updateColorSelection();
    renderAddonApplied();
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
      option.setAttribute('aria-checked', String(isSelected));
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
      preorderBtn.disabled = !(checkbox?.checked && hasCompleteColorSelection());
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
    updateColorSelection();
  });

  // ===================== OPTIONAL THERMAL PAPER (FULL PRICE) =====================
  function formatCents(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function updatePaperSelection() {
    paperOptions.forEach((option) => {
      const isSelected = option.dataset.paperOption === paperChoice;
      option.classList.toggle('border-primary', isSelected);
      option.classList.toggle('bg-primary/5', isSelected);
      option.classList.toggle('border-gray-200', !isSelected);
      option.classList.toggle('dark:border-gray-700', !isSelected);
      option.setAttribute('aria-pressed', String(isSelected));
    });

    if (paperQtyWrap) {
      paperQtyWrap.classList.toggle('hidden', !paperChoice);
      paperQtyWrap.classList.toggle('flex', Boolean(paperChoice));
    }
    if (paperQtyDisplay) paperQtyDisplay.textContent = paperQty;

    if (paperHelp) {
      if (paperChoice) {
        const bundle = PAPER_BUNDLES[paperChoice];
        paperHelp.textContent = `Added: ${paperQty} × ${bundle.label} (3 rolls each) for ${formatCents(bundle.price * paperQty)}. Tap it again to remove it.`;
      } else {
        paperHelp.textContent = 'Tap a pack to add it, or tap it again to remove it.';
      }
    }
  }

  paperOptions.forEach((option) => {
    option.addEventListener('click', () => {
      paperChoice = paperChoice === option.dataset.paperOption ? null : option.dataset.paperOption;
      if (!paperChoice) paperQty = 1;
      updatePaperSelection();
    });
  });

  paperMinus?.addEventListener('click', () => {
    if (paperQty > 1) {
      paperQty--;
      updatePaperSelection();
    }
  });

  paperPlus?.addEventListener('click', () => {
    if (paperQty < MAX_PAPER_QTY) {
      paperQty++;
      updatePaperSelection();
    }
  });

  updatePaperSelection();

  // The $4.99 add-on stays visible in the form once the shopper accepts it.
  function renderAddonApplied() {
    if (!addonApplied) return;
    addonApplied.classList.toggle('hidden', !addonChoice);
    addonApplied.classList.toggle('flex', Boolean(addonChoice));
    if (!addonChoice) return;
    const bundle = PAPER_BUNDLES[addonChoice];
    if (addonAppliedImg) addonAppliedImg.src = `/assets/cutouts/paper-${addonChoice}.webp`;
    if (addonAppliedText) {
      addonAppliedText.textContent = `1 × ${bundle.label} pack (3 rolls) for ${formatCents(ADDON_PRICE)} (regularly ${formatCents(bundle.price)}). Click ${PRODUCTS[selectedProduct]?.buttonLabel || 'Pre-Order'} to continue.`;
    }
  }

  addonRemove?.addEventListener('click', () => {
    addonChoice = null;
    renderAddonApplied();
    trackEvent('paper_addon_removed', {});
  });

  // ===================== PAPER ADD-ON POP-UP ($4.99, 1 per order) =====================
  function addonFocusable() {
    return Array.from(addonModal.querySelectorAll('button')).filter((el) => !el.disabled);
  }

  function openAddonModal() {
    if (!addonModal) return;
    addonModal.classList.remove('hidden');
    addonModal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
    trackEvent('paper_addon_offer_shown', { product: selectedProduct });
    addonModal.querySelector('[data-addon-choice="sweet"]')?.focus();
  }

  function closeAddonModal() {
    if (!addonModal) return;
    addonModal.classList.add('hidden');
    addonModal.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
    preorderBtn?.focus();
  }

  function isAddonModalOpen() {
    return Boolean(addonModal) && !addonModal.classList.contains('hidden');
  }

  addonModal?.querySelectorAll('[data-addon-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      const bundle = button.dataset.addonChoice;
      trackEvent('paper_addon_accepted', { bundle });
      addonChoice = bundle;
      closeAddonModal();
      renderAddonApplied();
      addonApplied?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });

  addonSkip?.addEventListener('click', () => {
    trackEvent('paper_addon_declined', {});
    closeAddonModal();
    startCheckout();
  });

  addonClose?.addEventListener('click', closeAddonModal);
  addonBackdrop?.addEventListener('click', closeAddonModal);

  document.addEventListener('keydown', (event) => {
    if (!isAddonModalOpen()) return;
    if (event.key === 'Escape') {
      closeAddonModal();
    } else if (event.key === 'Tab') {
      const items = addonFocusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  // ===================== PRE-ORDER BUTTON =====================
  preorderBtn?.addEventListener('click', () => {
    if (!checkbox?.checked || !hasCompleteColorSelection()) {
      updateColorSelection();
      return;
    }

    // Anyone buying a printer without paper gets the $4.99 add-on offer first.
    if (!paperChoice && !addonChoice && addonModal) {
      openAddonModal();
      return;
    }

    startCheckout();
  });

  async function startCheckout() {
    const colors = selectedColors.slice(0, requiredColorCount());
    const payload = { quantity, product: selectedProduct, colors };
    if (paperChoice) payload.paper = [{ bundle: paperChoice, quantity: paperQty }];
    if (addonChoice) payload.paper_addon = addonChoice;

    // Track CTA click
    trackEvent('checkout_started', { quantity, product: selectedProduct, colors, paper: paperChoice, paper_addon: addonChoice });

    // Set loading state
    preorderBtn.disabled = true;
    if (preorderBtnText) preorderBtnText.textContent = 'Processing...';
    if (preorderBtnSpinner) preorderBtnSpinner.classList.remove('hidden');
    if (preorderError) preorderError.classList.add('hidden');

    try {
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      preorderBtn.disabled = !(checkbox.checked && hasCompleteColorSelection());
      if (preorderBtnText) preorderBtnText.textContent = PRODUCTS[selectedProduct]?.buttonLabel || 'Pre-Order Now';
      if (preorderBtnSpinner) preorderBtnSpinner.classList.add('hidden');
    }
  }

  // ===================== CTA TRACKING =====================
  document.querySelectorAll('[data-track="click_preorder_cta"]').forEach((el) => {
    el.addEventListener('click', () => {
      trackEvent('click_preorder_cta', {});
    });
  });
})();
