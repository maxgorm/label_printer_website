import PREORDER_CONFIG from './_config.js';

/**
 * Where Sentimo ships and what it charges.
 *
 * US (50 states, DC, territories and military addresses are all "US" in Stripe):
 *   $4.99 flat, free when the pre-tax subtotal is $25 or more.
 * Everywhere else: a destination-based international rate. International orders never
 * get the US flat or free rate.
 *
 * !! The international amounts are ESTIMATES for USPS international service bought
 * !! through Pirate Ship. Compare them to Pirate Ship's real rates for your package
 * !! weights and edit INTERNATIONAL_RATES_CENTS before relying on them.
 *
 * `light` is for orders with only thermal paper; `standard` is for orders with a printer.
 * Add or remove a country by editing ZONES. Every code must be one Stripe Checkout
 * supports. Not served (for example North Korea, Iran, Cuba, Syria, Russia, Belarus,
 * Ukraine's occupied regions) because USPS or sanctions rules rule them out.
 */
export const ZONES = {
  canada: ['CA'],
  europe: [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
    'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH', 'NO', 'IS',
  ],
  asia_pacific: ['AU', 'NZ', 'JP', 'KR', 'SG', 'HK', 'TW', 'TH', 'MY', 'PH', 'ID', 'VN', 'IN'],
  rest_of_world: [
    'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'UY', 'CR', 'PA', 'IL', 'AE', 'SA', 'QA', 'KW', 'TR',
    'ZA', 'MA', 'EG', 'KE',
  ],
};

export const INTERNATIONAL_RATES_CENTS = {
  canada: { light: 1499, standard: 2199 },
  europe: { light: 1999, standard: 3499 },
  asia_pacific: { light: 2199, standard: 3799 },
  rest_of_world: { light: 2499, standard: 4299 },
};

export const HOME_COUNTRY = 'US';

const ZONE_BY_COUNTRY = Object.fromEntries(
  Object.entries(ZONES).flatMap(([zone, codes]) => codes.map((code) => [code, zone])),
);

export function isShippableCountry(code) {
  return code === HOME_COUNTRY || Object.hasOwn(ZONE_BY_COUNTRY, code);
}

export function shippingCountryCodes() {
  return [HOME_COUNTRY, ...Object.keys(ZONE_BY_COUNTRY)];
}

/**
 * The shipping charge in cents for one destination.
 * `subtotalCents` is the pre-tax subtotal of the line items.
 */
export function shippingCentsFor({ country = HOME_COUNTRY, subtotalCents, hasPrinter }) {
  if (country === HOME_COUNTRY) {
    return subtotalCents >= PREORDER_CONFIG.free_shipping_threshold_cents
      ? 0
      : PREORDER_CONFIG.shipping_flat_cents;
  }
  const zone = ZONE_BY_COUNTRY[country];
  if (!zone) throw new Error(`Not a shippable country: ${country}`);
  return INTERNATIONAL_RATES_CENTS[zone][hasPrinter ? 'standard' : 'light'];
}

export function shippingLabelFor(country, shippingCents) {
  if (country !== HOME_COUNTRY) return 'International shipping (USPS)';
  return shippingCents === 0 ? 'Free shipping' : 'Standard shipping';
}

/** What the order form shows: every country with its estimated rates. */
export function shippingOptionsForClient() {
  return {
    home: HOME_COUNTRY,
    flat_cents: PREORDER_CONFIG.shipping_flat_cents,
    free_threshold_cents: PREORDER_CONFIG.free_shipping_threshold_cents,
    countries: Object.entries(ZONE_BY_COUNTRY).map(([code, zone]) => ({
      code,
      ...INTERNATIONAL_RATES_CENTS[zone],
    })),
  };
}
