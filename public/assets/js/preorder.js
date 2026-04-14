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

  let quantity = 1;
  const MAX_QTY = 10;
  const MIN_QTY = 1;

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
    trackEvent('checkout_started', { quantity });

    // Set loading state
    preorderBtn.disabled = true;
    if (preorderBtnText) preorderBtnText.textContent = 'Processing...';
    if (preorderBtnSpinner) preorderBtnSpinner.classList.remove('hidden');
    if (preorderError) preorderError.classList.add('hidden');

    try {
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
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
