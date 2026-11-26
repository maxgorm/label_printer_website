/**
 * Sentimo Cart
 * One cart for printers, thermal paper, and Memory Books: saved in localStorage, shown in a slide-out
 * drawer, and sent to /api/create-checkout as a list of items. Prices here are display
 * only; the server sets the real prices (api/_config.js).
 *
 * window.SentimoCart: add(item), addSet({ printer, paper, books }), open(), close(),
 *   count(), items(), onChange(fn), catalog, formatCents
 */
(function () {
  'use strict';

  // ===================== CATALOG (display only) =====================
  // The sale ends at midnight US Eastern on Dec 1 (keep in sync with api/_config.js).
  const SALE_ENDS_AT = new Date('2026-12-01T00:00:00-05:00');
  const saleActive = Date.now() < SALE_ENDS_AT.getTime();
  const CATALOG = {
    saleActive,
    products: {
      single: {
        name: 'Single Printer', slug: 'sentimo-single', printerCount: 1,
        priceCents: saleActive ? 2999 : 4999, originalCents: saleActive ? 4999 : null,
      },
      duo: {
        name: 'Duo-Pack', slug: 'sentimo-2-pack', printerCount: 2,
        priceCents: saleActive ? 4999 : 6999, originalCents: saleActive ? 6999 : null,
      },
    },
    paper: {
      classic: {
        name: 'Classic Paper', slug: 'paper-classic', detail: '3 white rolls', rolls: 3,
        priceCents: 699, addonCents: 499, image: '/assets/cutouts/paper-classic.webp',
      },
      dreamy: {
        name: 'Dreamy Paper', slug: 'paper-dreamy', detail: '5 rolls: White, Lavender, Yellow, Pink, Blue', rolls: 5,
        priceCents: 999, addonCents: 699, image: '/assets/cutouts/paper-dreamy-row.webp',
      },
    },
    // Memory Books: both variants share one notebook stock (a Duo is two books).
    // Keep prices in sync with api/_config.js.
    books: {
      single: {
        name: 'Memory Book', slug: 'memory-book-single', detail: '1 A6 kraft notebook · 48 pages', books: 1,
        priceCents: 499, image: '/assets/opt/books/memory-book-single-160.webp',
      },
      duo: {
        name: 'Memory Book Duo', slug: 'memory-book-duo', detail: '2 A6 kraft notebooks · 48 pages each', books: 2,
        priceCents: 799, image: '/assets/opt/books/memory-book-duo-160.webp',
      },
    },
    colors: { pink: 'Pink', white: 'White', black: 'Black' },
    maxPrinterPackages: 10,
    maxPaperPerBundle: 10,
    maxBooksPerVariant: 10,
  };

  const STORAGE_KEY = 'sentimo_cart_v1';

  function formatCents(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  // ===================== STATE =====================
  // items: [{ type: 'printer', product, colors, quantity } | { type: 'paper', bundle, quantity }
  //         | { type: 'book', variant, quantity }]
  // addon: one discounted paper pack ('classic' | 'dreamy'), only with a printer in the cart.
  let state = { items: [], addon: null };

  function validItem(item) {
    if (item?.type === 'printer') {
      const product = CATALOG.products[item.product];
      return Boolean(product) && Array.isArray(item.colors) && item.colors.length === product.printerCount &&
        item.colors.every((c) => CATALOG.colors[c]) && Number.isInteger(item.quantity) && item.quantity > 0;
    }
    if (item?.type === 'paper') {
      return Boolean(CATALOG.paper[item.bundle]) && Number.isInteger(item.quantity) && item.quantity > 0;
    }
    if (item?.type === 'book') {
      return Object.hasOwn(CATALOG.books, item.variant) && Number.isInteger(item.quantity) && item.quantity > 0;
    }
    return false;
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && Array.isArray(saved.items)) {
        state.items = saved.items.filter(validItem);
        state.addon = CATALOG.paper[saved.addon] ? saved.addon : null;
      }
    } catch (err) {
      // Storage blocked or corrupt: start with an empty cart.
    }
    enforceRules();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // The cart still works for this page view.
    }
  }

  function itemKey(item) {
    if (item.type === 'printer') return `printer:${item.product}:${item.colors.join(',')}`;
    return item.type === 'book' ? `book:${item.variant}` : `paper:${item.bundle}`;
  }

  // Catalog entry for a paper or Memory Book item.
  function accessory(item) {
    return item.type === 'book' ? CATALOG.books[item.variant] : CATALOG.paper[item.bundle];
  }

  // Most of an item the cart can hold; for printers, counting what is already in the cart.
  function maxFor(item, existingQuantity = 0) {
    if (item.type === 'printer') return CATALOG.maxPrinterPackages - printerPackages() + existingQuantity;
    return item.type === 'book' ? CATALOG.maxBooksPerVariant : CATALOG.maxPaperPerBundle;
  }

  function printerPackages() {
    return state.items.filter((i) => i.type === 'printer').reduce((sum, i) => sum + i.quantity, 0);
  }

  function hasPrinter() {
    return printerPackages() > 0;
  }

  function hasPaper() {
    return state.items.some((i) => i.type === 'paper');
  }

  // The add-on price needs a printer in the cart.
  function enforceRules() {
    if (state.addon && !hasPrinter()) state.addon = null;
  }

  function count() {
    return state.items.reduce((sum, i) => sum + i.quantity, 0) + (state.addon ? 1 : 0);
  }

  function lineCents(item) {
    return item.type === 'printer'
      ? CATALOG.products[item.product].priceCents * item.quantity
      : accessory(item).priceCents * item.quantity;
  }

  function subtotalCents() {
    return state.items.reduce((sum, i) => sum + lineCents(i), 0) +
      (state.addon ? CATALOG.paper[state.addon].addonCents : 0);
  }

  // ===================== DOM =====================
  const drawer = document.getElementById('cart-drawer');
  const panel = document.getElementById('cart-panel');
  const backdrop = document.getElementById('cart-backdrop');
  const closeBtn = document.getElementById('cart-close');
  const listEl = document.getElementById('cart-items');
  const emptyEl = document.getElementById('cart-empty');
  const addedEl = document.getElementById('cart-added');
  const addedText = document.getElementById('cart-added-text');
  const summaryEl = document.getElementById('cart-summary');
  const subtotalEl = document.getElementById('cart-subtotal');
  const shippingEl = document.getElementById('cart-shipping');
  const shippingNoteEl = document.getElementById('cart-shipping-note');
  const totalEl = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('cart-checkout');
  const checkoutText = document.getElementById('cart-checkout-text');
  const errorEl = document.getElementById('cart-error');
  const keepShoppingBtn = document.getElementById('cart-keep-shopping');
  const countBadges = document.querySelectorAll('[data-cart-count]');
  const openButtons = document.querySelectorAll('[data-cart-open]');
  const addonModal = document.getElementById('paper-addon-modal');
  const addonBackdrop = document.getElementById('paper-addon-backdrop');
  const addonClose = document.getElementById('paper-addon-close');
  const addonSkip = document.getElementById('paper-addon-skip');

  const listeners = [];
  let lastFocus = null;

  function track(name, data) {
    if (typeof window.gtag === 'function') window.gtag('event', name, data);
    if (window.location.hostname === 'localhost') console.log('[Analytics]', name, data);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function stepper(label, quantity, max, onChange) {
    const wrap = el('div', 'flex items-center overflow-hidden rounded-full border border-gray-200 dark:border-gray-700');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', `${label} quantity`);
    const minus = el('button', 'px-2.5 py-1 text-base font-bold leading-none hover:bg-primary/10 disabled:opacity-40', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', `Remove one ${label}`);
    const qty = el('span', 'min-w-[1.75rem] text-center text-sm font-bold', String(quantity));
    qty.setAttribute('aria-live', 'polite');
    const plus = el('button', 'px-2.5 py-1 text-base font-bold leading-none hover:bg-primary/10 disabled:opacity-40', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', `Add one more ${label}`);
    plus.disabled = quantity >= max;
    minus.addEventListener('click', () => onChange(quantity - 1));
    plus.addEventListener('click', () => onChange(quantity + 1));
    wrap.append(minus, qty, plus);
    return wrap;
  }

  function removeButton(label, onClick) {
    const btn = el('button', 'text-xs font-medium text-text-muted-light dark:text-text-muted-dark underline underline-offset-2 hover:text-primary', 'Remove');
    btn.type = 'button';
    btn.setAttribute('aria-label', `Remove ${label} from cart`);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function thumb(images) {
    const box = el('div', 'relative h-16 w-16 flex-shrink-0 rounded-xl bg-accent-pink/60 dark:bg-primary/10');
    images.slice(0, 2).forEach((src, i) => {
      const img = el('img', images.length > 1
        ? `absolute h-11 w-11 object-contain ${i === 0 ? 'left-0.5 top-1' : 'right-0.5 bottom-1'}`
        : 'absolute inset-1 h-14 w-14 object-contain');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      box.appendChild(img);
    });
    return box;
  }

  function renderLine(item, index) {
    const li = el('li', 'flex gap-3 py-4');
    let label;
    let images;
    let detail;
    let max;
    if (item.type === 'printer') {
      const product = CATALOG.products[item.product];
      label = product.name;
      detail = item.colors.map((c) => CATALOG.colors[c]).join(' + ');
      images = item.colors.map((c) => `/assets/cutouts/printer-${c}.webp`);
    } else {
      const entry = accessory(item);
      label = entry.name;
      detail = entry.detail;
      images = [entry.image];
    }
    max = maxFor(item, item.quantity);
    li.appendChild(thumb(images));
    const body = el('div', 'min-w-0 flex-1');
    const top = el('div', 'flex items-start justify-between gap-2');
    top.append(el('p', 'font-bold text-sm leading-snug', label), el('p', 'text-sm font-bold whitespace-nowrap', formatCents(lineCents(item))));
    body.append(top, el('p', 'text-xs text-text-muted-light dark:text-text-muted-dark', detail));
    const controls = el('div', 'mt-2 flex items-center justify-between gap-2');
    controls.append(
      stepper(label, item.quantity, max, (q) => setQuantity(index, q)),
      removeButton(label, () => setQuantity(index, 0)),
    );
    body.appendChild(controls);
    li.appendChild(body);
    return li;
  }

  function renderAddonLine() {
    const bundle = CATALOG.paper[state.addon];
    const li = el('li', 'flex gap-3 py-4');
    li.appendChild(thumb([bundle.image]));
    const body = el('div', 'min-w-0 flex-1');
    const top = el('div', 'flex items-start justify-between gap-2');
    const price = el('p', 'text-sm font-bold whitespace-nowrap text-right');
    price.append(
      el('span', 'block text-xs font-medium text-text-muted-light dark:text-text-muted-dark line-through', formatCents(bundle.priceCents)),
      document.createTextNode(formatCents(bundle.addonCents)),
    );
    top.append(el('p', 'font-bold text-sm leading-snug', bundle.name), price);
    const badge = el('span', 'inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700', `Bundle deal · save ${formatCents(bundle.priceCents - bundle.addonCents)}`);
    body.append(top, el('p', 'text-xs text-text-muted-light dark:text-text-muted-dark', bundle.detail));
    const controls = el('div', 'mt-2 flex items-center justify-between gap-2');
    controls.append(badge, removeButton(`${bundle.name} add-on`, () => setAddon(null)));
    body.appendChild(controls);
    li.appendChild(body);
    return li;
  }

  function render() {
    enforceRules();
    const n = count();
    countBadges.forEach((badge) => {
      badge.textContent = String(n);
      badge.classList.toggle('hidden', n === 0);
    });
    openButtons.forEach((btn) => btn.setAttribute('aria-label', n ? `Open cart, ${n} ${n === 1 ? 'item' : 'items'}` : 'Open cart'));

    if (!drawer) return;
    listEl.replaceChildren(...state.items.map(renderLine), ...(state.addon ? [renderAddonLine()] : []));
    const empty = state.items.length === 0;
    emptyEl.classList.toggle('hidden', !empty);
    listEl.classList.toggle('hidden', empty);
    summaryEl.classList.toggle('hidden', empty);

    if (!empty) {
      const subtotal = subtotalCents();
      const ship = window.SentimoShipping;
      const quote = ship ? ship.quote({ subtotalCents: subtotal }) : { cents: subtotal >= 2500 ? 0 : 499, international: false };
      subtotalEl.textContent = formatCents(subtotal);
      shippingEl.textContent = quote.cents === 0 ? 'Free' : formatCents(quote.cents);
      totalEl.textContent = formatCents(subtotal + quote.cents);
      if (quote.international) {
        shippingNoteEl.textContent = `Delivery to ${ship.countryName()} takes 5-14 days. Duties and taxes are the buyer’s responsibility.`;
      } else if (quote.cents > 0) {
        shippingNoteEl.textContent = `Add ${formatCents(2500 - subtotal)} more for free US shipping. US delivery takes 2-5 days.`;
      } else {
        shippingNoteEl.textContent = 'Free US shipping. Delivery takes 2-5 days.';
      }
    }
    checkoutBtn.disabled = empty;
    listeners.forEach((fn) => fn());
  }

  function commit() {
    enforceRules();
    save();
    render();
  }

  // ===================== MUTATIONS =====================
  function setQuantity(index, quantity) {
    const item = state.items[index];
    if (!item) return;
    if (quantity <= 0) {
      state.items.splice(index, 1);
      track('remove_from_cart', { item: itemKey(item) });
    } else {
      item.quantity = Math.min(quantity, maxFor(item, item.quantity));
    }
    commit();
    // Keep keyboard focus inside the drawer after a line disappears.
    if (quantity <= 0 && drawer && !drawer.classList.contains('hidden')) closeBtn?.focus();
  }

  function setAddon(bundle) {
    state.addon = bundle && CATALOG.paper[bundle] && hasPrinter() ? bundle : null;
    commit();
  }

  // Put an item in the cart without saving or opening it. Returns { added, message }.
  function addItem(item) {
    if (!validItem(item)) return { added: 0, message: '' };
    const key = itemKey(item);
    const existing = state.items.find((i) => itemKey(i) === key);
    const current = existing?.quantity || 0;
    const allowed = Math.min(item.quantity, maxFor(item, current) - current);
    if (allowed <= 0) {
      const limits = {
        printer: `Your cart already has the maximum of ${CATALOG.maxPrinterPackages} printer packages.`,
        paper: `Your cart already has the maximum of ${CATALOG.maxPaperPerBundle} packs of this paper.`,
        book: `Your cart already has the maximum of ${CATALOG.maxBooksPerVariant} of this Memory Book option.`,
      };
      return { added: 0, message: limits[item.type] };
    }
    if (existing) existing.quantity += allowed;
    else state.items.push({ ...item, colors: item.colors ? [...item.colors] : undefined, quantity: allowed });
    reportAddToCart(item, allowed);
    return { added: allowed, message: describeAdded(item, allowed) };
  }

  /**
   * Add an item and open the cart with a confirmation, the way most shops prompt checkout.
   * Returns false (and shows why) when the item would break a cart limit.
   */
  function add(item, { open: shouldOpen = true } = {}) {
    if (!validItem(item)) return false;
    const { added, message } = addItem(item);
    commit();
    if (added > 0) bumpBadges();
    if (shouldOpen) open({ message: added > 0 ? `${message} added to your cart.` : message });
    return added > 0;
  }

  // Paper lines as [{ bundle, quantity }], merged per bundle. Plain bundle names count as 1 pack.
  function paperLines(paper) {
    const totals = new Map();
    (paper || []).forEach((line) => {
      const bundle = typeof line === 'string' ? line : line?.bundle;
      const quantity = typeof line === 'string' ? 1 : Math.floor(Number(line?.quantity) || 0);
      if (!CATALOG.paper[bundle] || quantity <= 0) return;
      totals.set(bundle, Math.min(CATALOG.maxPaperPerBundle, (totals.get(bundle) || 0) + quantity));
    });
    return [...totals].map(([bundle, quantity]) => ({ bundle, quantity }));
  }

  // Memory Book lines as [{ variant, quantity }], merged per variant.
  function bookLines(books) {
    const totals = new Map();
    (books || []).forEach((line) => {
      const quantity = Math.floor(Number(line?.quantity) || 0);
      if (!Object.hasOwn(CATALOG.books, line?.variant) || quantity <= 0) return;
      totals.set(line.variant, Math.min(CATALOG.maxBooksPerVariant, (totals.get(line.variant) || 0) + quantity));
    });
    return [...totals].map(([variant, quantity]) => ({ variant, quantity }));
  }

  /**
   * Add a printer and the paper and Memory Books chosen with it in one step, then open the cart
   * once. Paper here is full price; the discounted pack is only offered by the pop-up at checkout.
   * Every part is optional (accessories alone make an accessories-only order). Returns true when
   * anything was added.
   */
  function addSet({ printer = null, paper = [], books = [] } = {}, { open: shouldOpen = true } = {}) {
    const names = [];
    const problems = [];
    [
      ...(printer ? [printer] : []),
      ...paperLines(paper).map(({ bundle, quantity }) => ({ type: 'paper', bundle, quantity })),
      ...bookLines(books).map(({ variant, quantity }) => ({ type: 'book', variant, quantity })),
    ].forEach((item) => {
      const { added, message } = addItem(item);
      if (added > 0) names.push(message);
      else if (message) problems.push(message);
    });
    commit();
    if (names.length) bumpBadges();
    const addedText = names.length ? `${joinNames(names)} added to your cart.` : '';
    if (shouldOpen) open({ message: [addedText, ...problems].filter(Boolean).join(' ') });
    return names.length > 0;
  }

  function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }

  function bumpBadges() {
    countBadges.forEach((badge) => {
      badge.classList.remove('cart-bump');
      void badge.offsetWidth; // restart the animation
      badge.classList.add('cart-bump');
    });
  }

  function describeAdded(item, quantity) {
    if (item.type === 'printer') {
      const name = CATALOG.products[item.product].name;
      const colors = item.colors.map((c) => CATALOG.colors[c]).join(' + ');
      return `${quantity > 1 ? `${quantity} × ` : ''}${name} (${colors})`;
    }
    return `${quantity > 1 ? `${quantity} × ` : ''}${accessory(item).name}`;
  }

  function reportAddToCart(item, quantity, unitCents) {
    const isPrinter = item.type === 'printer';
    const entry = isPrinter ? CATALOG.products[item.product] : accessory(item);
    const valueCents = (unitCents ?? entry.priceCents) * quantity;
    track('add_to_cart', { item: entry.slug, item_type: item.type, quantity, value: valueCents / 100 });
    // Meta AddToCart only fires with advertising consent (tracking.js decides).
    window.SentimoTrack?.track('AddToCart', {
      content_ids: [entry.slug],
      content_type: 'product',
      contents: [{ id: entry.slug, quantity }],
      value: valueCents / 100,
      currency: 'USD',
    });
  }

  // ===================== DRAWER =====================
  function focusable() {
    return Array.from(panel.querySelectorAll('button, a[href], select, [tabindex]:not([tabindex="-1"])'))
      .filter((node) => !node.disabled && node.offsetParent !== null);
  }

  function open({ message } = {}) {
    if (!drawer) return;
    if (drawer.classList.contains('hidden')) lastFocus = document.activeElement;
    addedEl.classList.toggle('hidden', !message);
    addedEl.classList.toggle('flex', Boolean(message));
    if (message) addedText.textContent = message;
    errorEl.classList.add('hidden');
    render();
    drawer.classList.remove('hidden');
    document.documentElement.classList.add('cart-open');
    // Next frame so the slide-in transition runs.
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    (message && !checkoutBtn.disabled ? checkoutBtn : closeBtn)?.focus({ preventScroll: true });
    track('view_cart', { items: count() });
  }

  function close() {
    if (!drawer || drawer.classList.contains('hidden')) return;
    drawer.classList.remove('is-open');
    document.documentElement.classList.remove('cart-open');
    const finish = () => {
      drawer.classList.add('hidden');
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else setTimeout(finish, 250);
  }

  function isOpen() {
    return Boolean(drawer) && !drawer.classList.contains('hidden');
  }

  openButtons.forEach((btn) => btn.addEventListener('click', (event) => {
    event.preventDefault();
    open();
  }));
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  keepShoppingBtn?.addEventListener('click', close);
  document.querySelectorAll('[data-cart-close]').forEach((link) => link.addEventListener('click', close));

  document.addEventListener('keydown', (event) => {
    if (!isOpen() || isAddonModalOpen()) return;
    if (event.key === 'Escape') {
      close();
    } else if (event.key === 'Tab') {
      const items = focusable();
      if (!items.length) return;
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

  // ===================== PAPER ADD-ON POP-UP AT CHECKOUT =====================
  // A printer order with no paper gets the discounted add-on offer once, before Stripe.
  function isAddonModalOpen() {
    return Boolean(addonModal) && !addonModal.classList.contains('hidden');
  }

  function openAddonModal() {
    addonModal.classList.remove('hidden');
    addonModal.classList.add('flex');
    track('paper_addon_offer_shown', { where: 'checkout' });
    addonModal.querySelector('[data-addon-choice="dreamy"]')?.focus();
  }

  function closeAddonModal() {
    addonModal.classList.add('hidden');
    addonModal.classList.remove('flex');
    checkoutBtn?.focus();
  }

  addonModal?.querySelectorAll('[data-addon-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      track('paper_addon_accepted', { bundle: button.dataset.addonChoice, where: 'checkout' });
      setAddon(button.dataset.addonChoice);
      closeAddonModal();
      startCheckout();
    });
  });
  addonSkip?.addEventListener('click', () => {
    track('paper_addon_declined', {});
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
      const items = Array.from(addonModal.querySelectorAll('button')).filter((b) => !b.disabled);
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

  // ===================== CHECKOUT =====================
  checkoutBtn?.addEventListener('click', () => {
    if (!state.items.length) return;
    if (hasPrinter() && !hasPaper() && !state.addon && addonModal) {
      openAddonModal();
      return;
    }
    startCheckout();
  });

  async function startCheckout() {
    enforceRules();
    if (!state.items.length) return;
    const payload = {
      items: state.items.map((item) => {
        if (item.type === 'printer') return { type: 'printer', product: item.product, colors: item.colors, quantity: item.quantity };
        if (item.type === 'book') return { type: 'book', variant: item.variant, quantity: item.quantity };
        return { type: 'paper', bundle: item.bundle, quantity: item.quantity };
      }),
      country: window.SentimoShipping?.country() || 'US',
    };
    if (state.addon) payload.paper_addon = state.addon;
    if (window.SentimoTrack) payload.attribution = window.SentimoTrack.attribution();

    // Physical notebooks in the order, for the Memory Book attachment rate.
    const memoryBooks = state.items.filter((i) => i.type === 'book')
      .reduce((sum, i) => sum + CATALOG.books[i.variant].books * i.quantity, 0);
    track('checkout_started', { items: count(), country: payload.country, paper_addon: state.addon, memory_books: memoryBooks });
    checkoutBtn.disabled = true;
    checkoutText.textContent = 'Processing...';
    errorEl.classList.add('hidden');

    try {
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server error. Please try again in a moment.');
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Something went wrong');
      if (!data.url) throw new Error('No checkout URL returned');
      if (window.SentimoTrack) {
        if (data.tracking) {
          const { event_id: eventId, ...custom } = data.tracking;
          window.SentimoTrack.track('InitiateCheckout', custom, eventId);
        }
        window.SentimoTrack.navigate(data.url);
      } else {
        window.location.href = data.url;
      }
    } catch (err) {
      errorEl.textContent = err.message || 'Unable to start checkout. Please try again.';
      errorEl.classList.remove('hidden');
      checkoutText.textContent = 'Checkout';
      checkoutBtn.disabled = !state.items.length;
    }
  }

  // ===================== INIT =====================
  load();
  window.SentimoShipping?.onChange(render);
  // Another tab changed the cart.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    state = { items: [], addon: null };
    load();
    render();
  });
  // Returning from Stripe without paying (cancel_url is /#cart) reopens the cart.
  window.addEventListener('pageshow', () => {
    if (checkoutText) checkoutText.textContent = 'Checkout';
    render();
  });
  render();
  if (window.location.hash === '#cart') {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    open();
  }

  window.SentimoCart = {
    catalog: CATALOG,
    formatCents,
    add,
    addSet,
    open,
    close,
    count,
    items: () => state.items.map((item) => ({ ...item })),
    onChange(fn) {
      listeners.push(fn);
    },
  };
})();
