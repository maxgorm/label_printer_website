/**
 * Sentimo Memory Book product page (/memory-book)
 * Handles: the photo gallery, the Memory Book / Memory Book Duo choice, quantity, the shipping
 * line for the chosen country, and adding to the shared cart (cart.js) without a printer.
 */
(function () {
  'use strict';

  const cart = window.SentimoCart;
  if (!cart) return;
  const BOOKS = cart.catalog.books;
  const fmt = cart.formatCents;
  const $ = (id) => document.getElementById(id);

  function trackEvent(eventName, data) {
    if (typeof window.gtag === 'function') window.gtag('event', eventName, data);
    if (window.location.hostname === 'localhost') console.log('[Analytics]', eventName, data);
  }

  // ===================== GALLERY =====================
  const mainImg = $('book-gallery-img');
  const thumbs = document.querySelectorAll('[data-gallery-src]');
  function showImage(thumb) {
    if (!mainImg) return;
    mainImg.src = thumb.dataset.gallerySrc;
    mainImg.srcset = thumb.dataset.gallerySrcset || '';
    mainImg.alt = thumb.dataset.galleryAlt || '';
    thumbs.forEach((t) => {
      const active = t === thumb;
      t.classList.toggle('border-primary', active);
      t.classList.toggle('border-transparent', !active);
      t.setAttribute('aria-current', active ? 'true' : 'false');
    });
  }
  thumbs.forEach((thumb) => thumb.addEventListener('click', () => showImage(thumb)));

  // ===================== OPTION, QUANTITY, PRICE =====================
  const options = document.querySelectorAll('[data-book-variant]');
  const radios = document.querySelectorAll('input[name="book-variant"]');
  const qtyDisplay = $('book-qty');
  const priceEl = $('book-price');
  const ctaLabel = $('book-cta-label');
  const addBtn = $('book-add-btn');
  const shipNote = $('book-shipping-note');
  const MAX = cart.catalog.maxBooksPerVariant;

  let variant = document.querySelector('input[name="book-variant"]:checked')?.value || 'single';
  let quantity = 1;

  document.querySelectorAll('[data-book-option-price]').forEach((el) => {
    el.textContent = fmt(BOOKS[el.dataset.bookOptionPrice].priceCents);
  });

  function totalCents() {
    return BOOKS[variant].priceCents * quantity;
  }

  function renderShipping() {
    const ship = window.SentimoShipping;
    if (!shipNote || !ship) return;
    const quote = ship.quote({ subtotalCents: totalCents() });
    if (quote.international) {
      shipNote.textContent = `${fmt(quote.cents)} shipping to ${ship.countryName()} · Delivered in ${ship.deliveryLabel()}`;
    } else if (quote.cents === 0) {
      shipNote.textContent = `Free U.S. shipping · Delivered in ${ship.deliveryLabel()}`;
    } else {
      shipNote.textContent = `${fmt(quote.cents)} U.S. shipping, free on orders of $25+ · Delivered in ${ship.deliveryLabel()}`;
    }
  }

  function render() {
    options.forEach((option) => option.classList.toggle('is-selected', option.dataset.bookVariant === variant));
    if (priceEl) priceEl.textContent = fmt(BOOKS[variant].priceCents);
    if (qtyDisplay) qtyDisplay.textContent = String(quantity);
    const minus = $('book-qty-minus');
    const plus = $('book-qty-plus');
    if (minus) minus.disabled = quantity <= 1;
    if (plus) plus.disabled = quantity >= MAX;
    if (ctaLabel) ctaLabel.textContent = `Add ${BOOKS[variant].name} to Cart · ${fmt(totalCents())}`;
    renderShipping();
  }

  radios.forEach((radio) => radio.addEventListener('change', () => {
    if (!radio.checked) return;
    variant = radio.value;
    trackEvent('memory_book_selected', { variant, location: 'product_page' });
    render();
  }));

  $('book-qty-minus')?.addEventListener('click', () => { quantity = Math.max(1, quantity - 1); render(); });
  $('book-qty-plus')?.addEventListener('click', () => { quantity = Math.min(MAX, quantity + 1); render(); });
  window.SentimoShipping?.onChange(renderShipping);

  // ===================== ADD TO CART =====================
  let adding = false;
  addBtn?.addEventListener('click', () => {
    if (adding) return;
    adding = true;
    if (cart.addSet({ books: [{ variant, quantity }] })) {
      quantity = 1;
      render();
    }
    setTimeout(() => { adding = false; }, 400);
  });

  // Meta ViewContent for the product page, with the same slugs the server sends for purchases.
  // tracking.js is deferred, so wait until it has run.
  function reportView() {
    window.SentimoTrack?.track('ViewContent', {
      content_ids: [BOOKS[variant].slug],
      content_name: 'Sentimo Memory Book',
      content_type: 'product',
      contents: [{ id: BOOKS[variant].slug, quantity: 1 }],
      value: BOOKS[variant].priceCents / 100,
      currency: 'USD',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reportView, { once: true });
  else reportView();

  document.querySelectorAll('[data-track]').forEach((el) => {
    el.addEventListener('click', () => {
      trackEvent(el.dataset.track, el.dataset.trackLocation ? { location: el.dataset.trackLocation } : {});
    });
  });

  render();
})();
