/**
 * Sentimo Thermal Paper (paper-only purchase)
 * Handles the standalone paper section: bundle choice, pack quantity, shipping note, checkout.
 * Prices here are display only; /api/create-checkout sets the real prices.
 */
(function () {
  'use strict';

  const options = document.querySelectorAll('[data-standalone-paper]');
  const minus = document.getElementById('paper-minus');
  const plus = document.getElementById('paper-plus');
  const qtyDisplay = document.getElementById('paper-qty');
  const totalDisplay = document.getElementById('paper-total');
  const shippingNote = document.getElementById('paper-shipping-note');
  const agree = document.getElementById('paper-agree');
  const buyBtn = document.getElementById('paper-buy-btn');
  const buyText = document.getElementById('paper-buy-text');
  const errorEl = document.getElementById('paper-error');

  if (!options.length || !buyBtn) return;

  const BUNDLES = {
    classic: { label: 'Classic', price: 799 },
    sweet: { label: 'Sweet', price: 899 },
    bright: { label: 'Bright', price: 899 },
  };
  const MAX_QTY = 10;
  const FREE_SHIPPING_CENTS = 2500;
  const SHIPPING_CENTS = 499;

  let selected = null;
  let quantity = 1;

  function formatCents(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function render() {
    options.forEach((option) => {
      const isSelected = option.dataset.standalonePaper === selected;
      option.classList.toggle('border-primary', isSelected);
      option.classList.toggle('bg-primary/5', isSelected);
      option.classList.toggle('border-gray-200', !isSelected);
      option.classList.toggle('dark:border-gray-700', !isSelected);
      option.setAttribute('aria-pressed', String(isSelected));
    });

    qtyDisplay.textContent = quantity;

    const ship = window.SentimoShipping;
    const international = Boolean(ship?.isInternational());
    if (selected) {
      const subtotal = BUNDLES[selected].price * quantity;
      const shipping = ship
        ? ship.quote({ subtotalCents: subtotal, hasPrinter: false })
        : { cents: subtotal >= FREE_SHIPPING_CENTS ? 0 : SHIPPING_CENTS, international: false };
      totalDisplay.textContent = formatCents(subtotal);
      if (international) {
        shippingNote.textContent = `International shipping for this order: ${shipping.cents === null ? 'calculated' : formatCents(shipping.cents)} (USPS), added at checkout. Import duties, taxes, and customs fees charged by your country are not included. Paper-only orders ship when Sentimo printers begin shipping in Fall 2026.`;
      } else {
        shippingNote.textContent = shipping.cents === 0
          ? 'Free shipping on this order (orders of $25 or more before tax). Paper-only orders ship when Sentimo printers begin shipping in Fall 2026.'
          : `Shipping is ${formatCents(shipping.cents)} on this order. It is free on orders of $25 or more before tax, or when you buy a printer. Paper-only orders ship when Sentimo printers begin shipping in Fall 2026.`;
      }
    } else {
      totalDisplay.textContent = '';
      shippingNote.textContent = international
        ? 'Choose a pack. International shipping is calculated by destination and shown here.'
        : 'Choose a pack. Shipping is $4.99, or free on orders of $25 or more before tax.';
    }

    buyBtn.disabled = !(selected && agree?.checked);
  }

  options.forEach((option) => {
    option.addEventListener('click', () => {
      selected = option.dataset.standalonePaper;
      render();
    });
  });

  minus?.addEventListener('click', () => {
    if (quantity > 1) {
      quantity--;
      render();
    }
  });

  plus?.addEventListener('click', () => {
    if (quantity < MAX_QTY) {
      quantity++;
      render();
    }
  });

  agree?.addEventListener('change', render);
  window.SentimoShipping?.onChange(render);

  buyBtn.addEventListener('click', async () => {
    if (!selected || !agree?.checked) return;

    buyBtn.disabled = true;
    buyText.textContent = 'Processing...';
    errorEl?.classList.add('hidden');

    if (typeof window.gtag === 'function') {
      window.gtag('event', 'paper_checkout_started', { bundle: selected, quantity });
    }

    try {
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper: [{ bundle: selected, quantity }], ship_country: window.SentimoShipping ? window.SentimoShipping.country() : 'US' }),
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server error. Please ensure the Vercel dev server is running (not a static file server).');
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Something went wrong');
      if (!data.url) throw new Error('No checkout URL returned');
      window.location.href = data.url;
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Unable to start checkout. Please try again.';
        errorEl.classList.remove('hidden');
      }
      buyText.textContent = 'Buy thermal paper';
      render();
    }
  });

  render();
})();
