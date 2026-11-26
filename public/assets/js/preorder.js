/**
 * Sentimo Order Form
 * Handles: set (Single or Duo-Pack), colors, quantity, sale pricing (ends 12/1), the shipping
 * line for the chosen country, the "Make it yours" accessories (sticker paper and Memory Books),
 * and the add-to-cart button with the live total. cart.js handles the cart, checkout, the paper add-on offer, and Stripe.
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
  const bookOptions = document.querySelectorAll('[data-book]');
  const booksCount = $('books-count');
  const perOrderNote = $('accessories-per-order');

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

  // ===================== STICKER PAPER =====================
  const refillQty = {};
  refillOptions.forEach((option) => { refillQty[option.dataset.refill] = 1; });

  // Checked packs as [{ bundle, quantity }].
  function checkedRefills() {
    return Array.from(refillBoxes).filter((box) => box.checked).map((box) => ({ bundle: box.value, quantity: refillQty[box.value] }));
  }

  function paperCents(lines) {
    return lines.reduce((sum, line) => sum + CATALOG.paper[line.bundle].priceCents * line.quantity, 0);
  }

  // Each row shows the full price of its packs (the discounted pack is only offered at checkout).
  function renderRefills() {
    const checked = checkedRefills();
    refillOptions.forEach((option) => {
      const bundle = option.dataset.refill;
      const isChecked = checked.some((line) => line.bundle === bundle);
      option.classList.toggle('is-selected', isChecked);
      const now = option.querySelector('[data-refill-now]');
      if (now) now.textContent = fmt(paperCents([{ bundle, quantity: isChecked ? refillQty[bundle] : 1 }]));
      const stepper = option.querySelector('[data-refill-stepper]');
      stepper?.classList.toggle('hidden', !isChecked);
      stepper?.classList.toggle('flex', isChecked);
      const qty = option.querySelector('[data-refill-qty]');
      if (qty) qty.textContent = String(refillQty[bundle]);
      const minus = option.querySelector('[data-refill-minus]');
      const plus = option.querySelector('[data-refill-plus]');
      if (minus) minus.disabled = refillQty[bundle] <= 1;
      if (plus) plus.disabled = refillQty[bundle] >= CATALOG.maxPaperPerBundle;
    });
    const packs = checked.reduce((sum, line) => sum + line.quantity, 0);
    if (refillsCount) {
      refillsCount.textContent = packs ? `· ${packs} added` : '';
      refillsCount.classList.toggle('hidden', !packs);
    }
    renderCta();
  }

  refillOptions.forEach((option) => {
    const bundle = option.dataset.refill;
    const step = (delta) => {
      refillQty[bundle] = Math.max(1, Math.min(CATALOG.maxPaperPerBundle, refillQty[bundle] + delta));
      renderRefills();
    };
    option.querySelector('[data-refill-minus]')?.addEventListener('click', () => step(-1));
    option.querySelector('[data-refill-plus]')?.addEventListener('click', () => step(1));
  });

  refillBoxes.forEach((box) => box.addEventListener('change', renderRefills));
  cart.onChange(renderRefills);

  // The paper panel starts open. Desktop keeps it open; phones can collapse it.
  const desktop = window.matchMedia('(min-width: 1024px)');
  function syncRefillsPanel() {
    if (refillsPanel && desktop.matches) refillsPanel.open = true;
  }
  desktop.addEventListener?.('change', syncRefillsPanel);
  syncRefillsPanel();
  refillsPanel?.querySelector('summary')?.addEventListener('click', (event) => {
    if (desktop.matches) event.preventDefault();
  });

  // "Paper Refills" links (nav, cart) open the paper panel on phones.
  function openRefillsFromHash() {
    if (refillsPanel && window.location.hash === '#paper') refillsPanel.open = true;
  }
  document.querySelectorAll('a[href="#paper"], a[href="/#paper"]').forEach((link) => {
    link.addEventListener('click', () => { if (refillsPanel) refillsPanel.open = true; });
  });
  window.addEventListener('hashchange', openRefillsFromHash);
  openRefillsFromHash();

  // ===================== MEMORY BOOKS =====================
  // At most one option (Memory Book or Memory Book Duo), unselected by default. Pressing the
  // selected option again clears it. Like paper, the quantity is per order: it is not multiplied
  // by the number of printer sets. The choice stays when the set, colors, or quantity change.
  let selectedBook = null;
  const bookQty = {};
  bookOptions.forEach((option) => { bookQty[option.dataset.book] = 1; });

  // Chosen books as [{ variant, quantity }].
  function checkedBooks() {
    return selectedBook ? [{ variant: selectedBook, quantity: bookQty[selectedBook] }] : [];
  }

  function bookCents(lines) {
    return lines.reduce((sum, line) => sum + CATALOG.books[line.variant].priceCents * line.quantity, 0);
  }

  function renderBooks() {
    bookOptions.forEach((option) => {
      const variant = option.dataset.book;
      const isSelected = variant === selectedBook;
      option.classList.toggle('is-selected', isSelected);
      option.querySelector('[data-book-toggle]')?.setAttribute('aria-pressed', String(isSelected));
      const now = option.querySelector('[data-book-now]');
      if (now) now.textContent = fmt(bookCents([{ variant, quantity: isSelected ? bookQty[variant] : 1 }]));
      const stepper = option.querySelector('[data-book-stepper]');
      stepper?.classList.toggle('hidden', !isSelected);
      stepper?.classList.toggle('flex', isSelected);
      const qty = option.querySelector('[data-book-qty]');
      if (qty) qty.textContent = String(bookQty[variant]);
      const minus = option.querySelector('[data-book-minus]');
      const plus = option.querySelector('[data-book-plus]');
      if (minus) minus.disabled = bookQty[variant] <= 1;
      if (plus) plus.disabled = bookQty[variant] >= CATALOG.maxBooksPerVariant;
    });
    // Physical notebooks: a Memory Book Duo is two books.
    const books = checkedBooks().reduce((sum, line) => sum + CATALOG.books[line.variant].books * line.quantity, 0);
    if (booksCount) {
      booksCount.textContent = books ? `· ${books} ${books === 1 ? 'book' : 'books'} added` : '';
      booksCount.classList.toggle('hidden', !books);
    }
    renderCta();
  }

  bookOptions.forEach((option) => {
    const variant = option.dataset.book;
    option.querySelector('[data-book-toggle]')?.addEventListener('click', () => {
      const clearing = selectedBook === variant;
      selectedBook = clearing ? null : variant;
      bookQty[variant] = 1;
      trackEvent(clearing ? 'memory_book_cleared' : 'memory_book_selected', { variant, location: 'order_form' });
      renderBooks();
    });
    const step = (delta) => {
      bookQty[variant] = Math.max(1, Math.min(CATALOG.maxBooksPerVariant, bookQty[variant] + delta));
      renderBooks();
    };
    option.querySelector('[data-book-minus]')?.addEventListener('click', () => step(-1));
    option.querySelector('[data-book-plus]')?.addEventListener('click', () => step(1));
  });

  // "Starting at $4.99" in the Memory Book story.
  const lowestBookCents = Math.min(...Object.values(CATALOG.books).map((book) => book.priceCents));
  document.querySelectorAll('[data-book-from]').forEach((el) => { el.textContent = fmt(lowestBookCents); });

  // ===================== ADD TO CART =====================
  // Printer sets × quantity, plus the per-order paper packs and Memory Books.
  function orderTotalCents() {
    return CATALOG.products[selectedProduct].priceCents * quantity + paperCents(checkedRefills()) + bookCents(checkedBooks());
  }

  function renderCta() {
    const label = `${COPY[selectedProduct].cta} · ${fmt(orderTotalCents())}`;
    ctaLabels.forEach((el) => { el.textContent = label; });
    if (preorderBtn) preorderBtn.disabled = !hasCompleteColorSelection();
    const hasAccessories = checkedRefills().length > 0 || checkedBooks().length > 0;
    paperOnlyBtn?.classList.toggle('hidden', !hasAccessories);
    perOrderNote?.classList.toggle('hidden', !(hasAccessories && quantity > 1));
  }

  function resetAfterAdd() {
    setQuantity(1);
    refillBoxes.forEach((box) => { box.checked = false; });
    Object.keys(refillQty).forEach((bundle) => { refillQty[bundle] = 1; });
    selectedBook = null;
    Object.keys(bookQty).forEach((variant) => { bookQty[variant] = 1; });
    renderRefills();
    renderBooks();
  }

  // Repeated clicks while the cart opens add nothing twice.
  let adding = false;
  function addOnce(fn) {
    if (adding) return;
    adding = true;
    try {
      if (fn()) resetAfterAdd();
    } finally {
      setTimeout(() => { adding = false; }, 400);
    }
  }

  preorderBtn?.addEventListener('click', () => {
    if (!hasCompleteColorSelection()) return;
    addOnce(() => cart.addSet({
      printer: {
        type: 'printer',
        product: selectedProduct,
        colors: selectedColors.slice(0, requiredColorCount()),
        quantity,
      },
      paper: checkedRefills(),
      books: checkedBooks(),
    }));
  });

  paperOnlyBtn?.addEventListener('click', () => {
    const paper = checkedRefills();
    const books = checkedBooks();
    if (!paper.length && !books.length) return;
    addOnce(() => cart.addSet({ paper, books }));
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
  renderBooks();
})();
