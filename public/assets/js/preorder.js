/**
 * Sentimo Order Form
 * Handles: set (Single or Duo-Pack), colors, quantity, sale pricing (ends 12/1), the shipping
 * line for the chosen country, optional paper refills, and the add-to-cart button with the
 * live total. cart.js handles the cart, checkout, the paper add-on offer, and Stripe.
 */
(function () {
  'use strict';

  const cart = window.SentimoCart;
  if (!cart) return;
  const CATALOG = cart.catalog;
  const fmt = cart.formatCents;

  const $ = (id) => document.getElementById(id);
  const orderTitle = $('order-title');
  const orderSubtitle = $('order-subtitle');
  const priceCurrent = $('price-current');
  const priceOriginal = $('price-original');
  const priceSave = $('price-save');
  const saleBadge = $('sale-badge');
  const shippingNote = $('order-shipping-note');
  const dutiesNote = $('order-duties-note');
  const quantityLabel = $('quantity-label');
  const qtyDisplay = $('quantity-display');
  const preorderBtn = $('preorder-btn');
  const refillsPanel = $('paper');
  const refillsCount = $('refills-count');
  const paperOnlyBtn = $('paper-only-btn');
  const productOptions = document.querySelectorAll('[data-product-option]');
  const productRadios = document.querySelectorAll('input[name="product"]');
  const colorPickers = document.querySelectorAll('.color-picker');
  const colorOptions = document.querySelectorAll('[data-color-option]');
  const colorRadios = document.querySelectorAll('.color-radio');
  const refillOptions = document.querySelectorAll('[data-refill]');
  const refillBoxes = document.querySelectorAll('.refill-checkbox');
  const ctaLabels = document.querySelectorAll('[data-cta-label]');

  const MIN_QTY = 1;
  const MAX_QTY = CATALOG.maxPrinterPackages;
  const COPY = {
    single: {
      title: 'The Sentimo Single',
      subtitle: 'One printer the whole family can send notes to.',
      cta: 'Add Single to Cart',
      quantity: 'Quantity',
      contentName: 'Sentimo Single Printer',
    },
    duo: {
      title: 'The Sentimo Duo Pack',
      subtitle: 'One for you. One for someone you love.',
      cta: 'Add Duo-Pack to Cart',
      quantity: 'Quantity of sets',
      contentName: 'Sentimo 2-Pack',
    },
  };

  // Start from what the markup checks: the Duo-Pack in pink and white.
  let selectedProduct = document.querySelector('input[name="product"]:checked')?.value || 'duo';
  const selectedColors = [0, 1].map((i) => document.querySelector(`input[name="printer-color-${i}"]:checked`)?.value || null);
  let quantity = 1;

  // ===================== ANALYTICS =====================
  function trackEvent(eventName, data) {
    if (typeof window.gtag === 'function') window.gtag('event', eventName, data);
    if (window.location.hostname === 'localhost') console.log('[Analytics]', eventName, data);
  }

  trackEvent('page_view_preorder', { page: 'preorder' });

  // Meta ViewContent: once per page load, when the order section is actually seen.
  // IDs are the same product slugs the server uses for Stripe orders and Purchase events.
  const orderSection = $('reserve');
  if (orderSection && 'IntersectionObserver' in window) {
    const viewObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      viewObserver.disconnect();
      const product = CATALOG.products[selectedProduct];
      window.SentimoTrack?.track('ViewContent', {
        content_ids: [product.slug],
        content_name: COPY[selectedProduct].contentName,
        content_type: 'product',
        contents: [{ id: product.slug, quantity: 1 }],
        value: product.priceCents / 100,
        currency: 'USD',
      });
    }, { threshold: 0.3 });
    viewObserver.observe(orderSection);
  }

  // ===================== SET, PRICE, COLORS =====================
  function requiredColorCount() {
    return CATALOG.products[selectedProduct].printerCount;
  }

  function hasCompleteColorSelection() {
    return selectedColors.slice(0, requiredColorCount()).every(Boolean);
  }

  // Static markup shows sale prices; the catalog switches to regular prices once the sale ends.
  document.querySelectorAll('[data-option-price]').forEach((el) => {
    el.textContent = fmt(CATALOG.products[el.dataset.optionPrice].priceCents);
  });

  function renderProduct() {
    const product = CATALOG.products[selectedProduct];
    const copy = COPY[selectedProduct];
    if (orderTitle) orderTitle.textContent = copy.title;
    if (orderSubtitle) orderSubtitle.textContent = copy.subtitle;
    if (quantityLabel) quantityLabel.textContent = copy.quantity;
    if (priceCurrent) priceCurrent.textContent = fmt(product.priceCents);
    const onSale = Boolean(product.originalCents);
    if (priceOriginal) {
      priceOriginal.textContent = onSale ? fmt(product.originalCents) : '';
      priceOriginal.classList.toggle('hidden', !onSale);
    }
    if (saleBadge) saleBadge.classList.toggle('hidden', !onSale);
    if (priceSave && onSale) {
      const saveCents = product.originalCents - product.priceCents;
      priceSave.textContent = `Save ${saveCents % 100 === 0 ? '$' + saveCents / 100 : fmt(saveCents)}`;
    }
    productOptions.forEach((option) => {
      option.classList.toggle('is-selected', option.dataset.productOption === selectedProduct);
    });
    renderColors();
  }

  function renderColors() {
    const requiredCount = requiredColorCount();
    colorPickers.forEach((picker, index) => {
      const visible = index < requiredCount;
      picker.classList.toggle('hidden', !visible);
      picker.setAttribute('aria-hidden', String(!visible));
    });
    colorOptions.forEach((option) => {
      const index = Number(option.dataset.printerIndex);
      option.classList.toggle('is-selected', selectedColors[index] === option.dataset.colorOption);
    });
    document.querySelectorAll('[data-color-name]').forEach((el) => {
      const color = selectedColors[Number(el.dataset.colorName)];
      el.textContent = color ? `· ${CATALOG.colors[color]}` : '';
    });
    renderCta();
  }

  productRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      selectedProduct = radio.value;
      renderProduct();
    });
  });

  colorRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      selectedColors[Number(radio.dataset.printerIndex)] = radio.value;
      renderColors();
    });
  });

  // Hero, nav, and sticky-bar buttons ("Get the 2-Pack for $49.99"): show the live 2-pack price
  // (it changes when the sale ends) and select that option in the order form when clicked.
  document.querySelectorAll('[data-duo-price]').forEach((el) => {
    el.textContent = fmt(CATALOG.products.duo.priceCents);
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

  // ===================== QUANTITY =====================
  function setQuantity(next) {
    quantity = Math.max(MIN_QTY, Math.min(MAX_QTY, next));
    if (qtyDisplay) qtyDisplay.textContent = String(quantity);
    renderCta();
  }

  $('qty-minus')?.addEventListener('click', () => setQuantity(quantity - 1));
  $('qty-plus')?.addEventListener('click', () => setQuantity(quantity + 1));

  // ===================== SHIPPING LINE =====================
  // Printer orders always clear the US free-shipping threshold.
  function renderShipping() {
    const ship = window.SentimoShipping;
    if (!shippingNote || !ship) return;
    const international = ship.isInternational();
    shippingNote.textContent = international
      ? `${fmt(ship.quote({ subtotalCents: 0 }).cents)} shipping to ${ship.countryName()} · Delivered in ${ship.deliveryLabel()}`
      : `Free U.S. shipping · Delivered in ${ship.deliveryLabel()}`;
    dutiesNote?.classList.toggle('hidden', !international);
  }

  window.SentimoShipping?.onChange(renderShipping);
  renderShipping();

  // ===================== PAPER REFILLS =====================
  function checkedRefills() {
    return Array.from(refillBoxes).filter((box) => box.checked).map((box) => box.value);
  }

  // Each row shows what that pack costs with this printer: one pack gets the bundle price.
  function renderRefills() {
    const checked = checkedRefills();
    const quote = cart.paperQuote(checked, { withPrinter: true });
    refillOptions.forEach((option) => {
      const bundle = option.dataset.refill;
      const isChecked = checked.includes(bundle);
      const price = isChecked ? quote[bundle] : cart.paperQuote([...checked, bundle], { withPrinter: true })[bundle];
      option.classList.toggle('is-selected', isChecked);
      const regular = option.querySelector('[data-refill-regular]');
      const now = option.querySelector('[data-refill-now]');
      if (now) now.textContent = fmt(price.cents);
      if (regular) {
        regular.textContent = fmt(price.regularCents);
        regular.classList.toggle('hidden', !price.deal);
      }
    });
    if (refillsCount) {
      refillsCount.textContent = checked.length ? `· ${checked.length} added` : '';
      refillsCount.classList.toggle('hidden', !checked.length);
    }
    paperOnlyBtn?.classList.toggle('hidden', !checked.length);
    renderCta();
  }

  refillBoxes.forEach((box) => box.addEventListener('change', renderRefills));
  cart.onChange(renderRefills);

  // Desktop shows the refills open; phones get a collapsible panel that starts closed.
  const desktop = window.matchMedia('(min-width: 1024px)');
  function syncRefillsPanel() {
    if (refillsPanel && desktop.matches) refillsPanel.open = true;
  }
  desktop.addEventListener?.('change', syncRefillsPanel);
  syncRefillsPanel();
  refillsPanel?.querySelector('summary')?.addEventListener('click', (event) => {
    if (desktop.matches) event.preventDefault();
  });

  // "Paper Refills" links (nav, cart) open the panel on phones.
  function openRefillsFromHash() {
    if (refillsPanel && window.location.hash === '#paper') refillsPanel.open = true;
  }
  document.querySelectorAll('a[href="#paper"], a[href="/#paper"]').forEach((link) => {
    link.addEventListener('click', () => { if (refillsPanel) refillsPanel.open = true; });
  });
  window.addEventListener('hashchange', openRefillsFromHash);
  openRefillsFromHash();

  // ===================== ADD TO CART =====================
  function orderTotalCents() {
    const printerCents = CATALOG.products[selectedProduct].priceCents * quantity;
    const quote = cart.paperQuote(checkedRefills(), { withPrinter: true });
    return printerCents + Object.values(quote).reduce((sum, line) => sum + line.cents, 0);
  }

  function renderCta() {
    const label = `${COPY[selectedProduct].cta} · ${fmt(orderTotalCents())}`;
    ctaLabels.forEach((el) => { el.textContent = label; });
    if (preorderBtn) preorderBtn.disabled = !hasCompleteColorSelection();
  }

  function resetAfterAdd() {
    setQuantity(1);
    refillBoxes.forEach((box) => { box.checked = false; });
    renderRefills();
  }

  preorderBtn?.addEventListener('click', () => {
    if (!hasCompleteColorSelection()) return;
    const added = cart.addSet({
      printer: {
        type: 'printer',
        product: selectedProduct,
        colors: selectedColors.slice(0, requiredColorCount()),
        quantity,
      },
      paper: checkedRefills(),
    });
    if (added) resetAfterAdd();
  });

  paperOnlyBtn?.addEventListener('click', () => {
    const paper = checkedRefills();
    if (paper.length && cart.addSet({ paper })) resetAfterAdd();
  });

  // ===================== CTA TRACKING =====================
  // data-track names the event; data-track-location (optional) says which button sent it.
  document.querySelectorAll('[data-track]').forEach((el) => {
    el.addEventListener('click', () => {
      trackEvent(el.dataset.track, el.dataset.trackLocation ? { location: el.dataset.trackLocation } : {});
    });
  });

  renderProduct();
  renderRefills();
})();
