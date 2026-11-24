/**
 * Sentimo Thermal Paper section
 * Each pack card adds one pack to the cart (cart.js handles quantities, shipping, and checkout)
 * and shows how many of that pack are already in the cart.
 */
(function () {
  'use strict';

  const cards = document.querySelectorAll('[data-standalone-card]');
  const cart = window.SentimoCart;
  if (!cards.length || !cart) return;

  cards.forEach((card) => {
    const bundle = card.dataset.standaloneCard;
    card.querySelector('[data-standalone-add]')?.addEventListener('click', () => {
      cart.add({ type: 'paper', bundle, quantity: 1 });
    });
  });

  // "2 in cart" under each pack, kept in sync with the cart.
  function render() {
    const items = cart.items();
    cards.forEach((card) => {
      const bundle = card.dataset.standaloneCard;
      const inCart = items
        .filter((item) => item.type === 'paper' && item.bundle === bundle)
        .reduce((sum, item) => sum + item.quantity, 0);
      const note = card.querySelector('[data-standalone-in-cart]');
      if (note) {
        note.textContent = inCart ? `${inCart} in cart` : '';
        note.classList.toggle('invisible', !inCart);
      }
      card.classList.toggle('border-primary', inCart > 0);
      card.classList.toggle('bg-primary/5', inCart > 0);
      card.classList.toggle('border-gray-200', inCart === 0);
      card.classList.toggle('dark:border-gray-700', inCart === 0);
    });
  }

  cart.onChange(render);
  render();
})();
