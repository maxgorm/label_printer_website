/**
 * Sentimo Shipping Destination
 * Fills every <select data-ship-country>, keeps them in sync, and quotes shipping for the chosen country.
 * Rates here are display only; /api/create-checkout sets the real shipping price (api/_config.js).
 */
(function () {
  'use strict';

  const US_FLAT_CENTS = 499;
  const US_FREE_THRESHOLD_CENTS = 2500;
  const COUNTRIES = {
    US: { name: 'United States', cents: null },
    AU: { name: 'Australia', cents: 2499 },
    BE: { name: 'Belgium', cents: 1999 },
    CA: { name: 'Canada', cents: 1499 },
    DK: { name: 'Denmark', cents: 2499 },
    FR: { name: 'France', cents: 1999 },
    DE: { name: 'Germany', cents: 1999 },
    IE: { name: 'Ireland', cents: 1999 },
    IT: { name: 'Italy', cents: 2499 },
    JP: { name: 'Japan', cents: 2499 },
    MX: { name: 'Mexico', cents: 1999 },
    NL: { name: 'Netherlands', cents: 1999 },
    NZ: { name: 'New Zealand', cents: 2499 },
    SG: { name: 'Singapore', cents: 2499 },
    KR: { name: 'South Korea', cents: 2499 },
    ES: { name: 'Spain', cents: 2499 },
    SE: { name: 'Sweden', cents: 2499 },
    GB: { name: 'United Kingdom', cents: 1999 },
  };
  const STORAGE_KEY = 'sentimo-ship-country';
  const listeners = [];
  const selects = document.querySelectorAll('select[data-ship-country]');

  function formatCents(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function savedCountry() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved && COUNTRIES[saved] ? saved : null;
    } catch (err) {
      return null; // Storage can be blocked.
    }
  }

  // US unless the shopper picked a country before. /api/geo may preselect one below.
  let country = savedCountry() || 'US';
  let chosenByShopper = Boolean(savedCountry());

  function setCountry(code, { remember }) {
    if (!COUNTRIES[code] || code === country) return;
    country = code;
    if (remember) {
      chosenByShopper = true;
      try {
        localStorage.setItem(STORAGE_KEY, code);
      } catch (err) {
        // Not remembered across visits; the choice still applies on this page.
      }
    }
    selects.forEach((select) => { select.value = code; });
    listeners.forEach((fn) => fn(code));
  }

  selects.forEach((select) => {
    Object.entries(COUNTRIES).forEach(([code, { name, cents }]) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = cents === null ? name : `${name} (${formatCents(cents)} shipping)`;
      select.appendChild(option);
    });
    select.value = country;
    select.addEventListener('change', () => setCountry(select.value, { remember: true }));
  });

  // Preselect from the visitor's IP country (no location prompt). Countries we
  // don't ship to, and any failure, leave the US selected.
  if (!chosenByShopper && selects.length) {
    fetch('/api/geo')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!chosenByShopper && data?.country) setCountry(data.country, { remember: false });
      })
      .catch(() => {});
  }

  window.SentimoShipping = {
    country: () => country,
    countryName: () => COUNTRIES[country].name,
    isInternational: () => country !== 'US',
    deliveryLabel: () => (country === 'US' ? '2-5 days' : '5-14 days'),
    // Shipping for an order to the chosen country: { cents, international }.
    quote({ subtotalCents }) {
      if (country !== 'US') return { cents: COUNTRIES[country].cents, international: true };
      return { cents: subtotalCents >= US_FREE_THRESHOLD_CENTS ? 0 : US_FLAT_CENTS, international: false };
    },
    onChange(fn) {
      listeners.push(fn);
    },
    formatCents,
  };
})();
