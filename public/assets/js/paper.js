/**
 * Sentimo Thermal Paper (paper-only purchase)
 * Handles the standalone paper section: bundle choice, pack quantity, shipping note, checkout.
 * Prices here are display only; /api/create-checkout sets the real prices.
 */
(function () {
  'use strict';

  const cards = document.querySelectorAll('[data-standalone-card]');
  const totalDisplay = document.getElementById('paper-total');
  const shippingNote = document.getElementById('paper-shipping-note');
  const agree = document.getElementById('paper-agree');
  const buyBtn = document.getElementById('paper-buy-btn');
  const buyText = document.getElementById('paper-buy-text');
  const errorEl = document.getElementById('paper-error');

  if (!cards.length || !buyBtn) return;

  const BUNDLES = {
    classic: { label: 'Classic', price: 799 },
    sweet: { label: 'Sweet', price: 899 },
    bright: { label: 'Bright', price: 899 },
  };
  const MAX_QTY = 10;
  const FREE_SHIPPING_CENTS = 2500;
  const SHIPPING_CENTS = 499;

  const quantities = { classic: 0, sweet: 0, bright: 0 };

  function formatCents(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function totals() {
    const lines = Object.entries(quantities).filter(([, count]) => count > 0);
    return {
      lines,
      packs: lines.reduce((sum, [, count]) => sum + count, 0),
      subtotal: lines.reduce((sum, [key, count]) => sum + BUNDLES[key].price * count, 0),
    };
  }

  function render() {
    cards.forEach((card) => {
      const key = card.dataset.standaloneCard;
      const count = quantities[key];
      card.classList.toggle('border-primary', count > 0);
      card.classList.toggle('bg-primary/5', count > 0);
      card.classList.toggle('border-gray-200', count === 0);
      card.classList.toggle('dark:border-gray-700', count === 0);
      const add = card.querySelector('[data-standalone-add]');
      const stepper = card.querySelector('[data-standalone-stepper]');
      add.classList.toggle('hidden', count > 0);
      stepper.classList.toggle('hidden', count === 0);
      stepper.classList.toggle('flex', count > 0);
      card.querySelector('[data-standalone-qty]').textContent = count;
      card.querySelector('[data-standalone-plus]').disabled = count >= MAX_QTY;
    });

    const { lines, packs, subtotal } = totals();
    const ship = window.SentimoShipping;
    const international = Boolean(ship?.isInternational());
    if (packs > 0) {
      const summary = lines.map(([key, count]) => `${count} × ${BUNDLES[key].label}`).join(', ');
      totalDisplay.textContent = `${summary}: ${formatCents(subtotal)}`;
      const shipping = ship
        ? ship.quote({ subtotalCents: subtotal, hasPrinter: false })
        : { cents: subtotal >= FREE_SHIPPING_CENTS ? 0 : SHIPPING_CENTS, international: false };
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
        ? 'Choose your packs. International shipping is calculated by destination and shown here.'
        : 'Choose your packs. Shipping is $4.99, or free on orders of $25 or more before tax.';
    }

    buyBtn.disabled = !(packs > 0 && agree?.checked);
  }

  function change(key, delta) {
    quantities[key] = Math.max(0, Math.min(MAX_QTY, quantities[key] + delta));
    render();
  }

  cards.forEach((card) => {
    const key = card.dataset.standaloneCard;
    card.querySelector('[data-standalone-add]').addEventListener('click', () => change(key, 1));
    card.querySelector('[data-standalone-plus]').addEventListener('click', () => change(key, 1));
    card.querySelector('[data-standalone-minus]').addEventListener('click', () => change(key, -1));
  });

  agree?.addEventListener('change', render);
  window.SentimoShipping?.onChange(render);

  buyBtn.addEventListener('click', async () => {
    const { lines, packs } = totals();
    if (!packs || !agree?.checked) return;

    buyBtn.disabled = true;
    buyText.textContent = 'Processing...';
    errorEl?.classList.add('hidden');

    if (typeof window.gtag === 'function') {
      window.gtag('event', 'paper_checkout_started', { packs });
    }

    try {
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper: lines.map(([bundle, quantity]) => ({ bundle, quantity })) }),
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
