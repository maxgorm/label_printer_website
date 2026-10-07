/**
 * Sentimo shipping destination
 * Fills every [data-ship-country] <select> with the countries we ship to, keeps them in
 * sync, and exposes window.SentimoShipping for the checkout scripts.
 * The server decides the real charge; this only mirrors it for display.
 */
(function () {
  'use strict';

  const selects = document.querySelectorAll('[data-ship-country]');
  const printerNotes = document.querySelectorAll('[data-ship-note="printer"]');
  const listeners = [];

  let options = null;
  let country = 'US';

  function formatCents(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function countryName(code) {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
    } catch (err) {
      return code;
    }
  }

  function rateFor(code) {
    return options?.countries.find((entry) => entry.code === code) || null;
  }

  // Shipping the server will charge for this destination, in cents.
  function quote({ subtotalCents, hasPrinter }) {
    if (country === 'US' || !options) {
      const free = options ? options.free_threshold_cents : 2500;
      const flat = options ? options.flat_cents : 499;
      return { cents: subtotalCents >= free ? 0 : flat, international: false };
    }
    const rate = rateFor(country);
    if (!rate) return { cents: null, international: true };
    return { cents: hasPrinter ? rate.standard : rate.light, international: true };
  }

  function renderPrinterNotes() {
    printerNotes.forEach((note) => {
      if (country === 'US') {
        note.textContent = 'Free shipping on printer orders within the United States, including Alaska, Hawaii, and U.S. territories.';
        return;
      }
      const rate = quote({ subtotalCents: 0, hasPrinter: true });
      const amount = rate.cents === null ? 'calculated' : formatCents(rate.cents);
      note.textContent = `International shipping for this order: ${amount} (USPS), added at checkout. Import duties, taxes, and customs fees charged by your country are not included.`;
    });
  }

  function setCountry(code) {
    country = code;
    selects.forEach((select) => {
      if (select.value !== code) select.value = code;
    });
    renderPrinterNotes();
    listeners.forEach((listener) => listener(country));
  }

  function populate() {
    const others = options.countries
      .map((entry) => ({ code: entry.code, name: countryName(entry.code) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    selects.forEach((select) => {
      select.innerHTML = '';
      const home = document.createElement('option');
      home.value = 'US';
      home.textContent = 'United States (incl. Alaska, Hawaii & territories)';
      select.appendChild(home);
      others.forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry.code;
        option.textContent = entry.name;
        select.appendChild(option);
      });
      select.value = country;
    });
  }

  selects.forEach((select) => {
    select.addEventListener('change', () => setCountry(select.value));
  });

  window.SentimoShipping = {
    country: () => country,
    isInternational: () => country !== 'US',
    quote,
    formatCents,
    onChange: (listener) => listeners.push(listener),
  };

  renderPrinterNotes();

  fetch('/api/shipping-options')
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error('bad response'))))
    .then((data) => {
      options = data;
      populate();
      renderPrinterNotes();
      listeners.forEach((listener) => listener(country));
    })
    .catch(() => {
      // Without the list the form stays US-only, which the server always accepts.
    });
})();
