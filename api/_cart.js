import PREORDER_CONFIG from './_config.js';
import { normalizePaperAddon, normalizePaperItems } from './_paper.js';

const PRODUCTS = PREORDER_CONFIG.products;
const COLORS = PREORDER_CONFIG.available_colors;

// Cart limits. A cart can hold several printer lines (for example a 2-Pack in pink and
// white plus a black single printer), each with its own quantity.
export const MAX_PRINTER_LINES = 6;
export const MAX_PRINTER_PACKAGES = 10;

/**
 * Validate the cart sent by the browser. Only product keys, colors, bundle keys, and
 * quantities are accepted; prices always come from the server config.
 *
 * New carts send `items`:
 *   [{ type: 'printer', product: 'duo', colors: ['pink', 'white'], quantity: 1 },
 *    { type: 'paper', bundle: 'classic', quantity: 2 }]
 * Older cached pages send `product`, `colors`, `quantity`, and `paper`; those are
 * mapped to the same shape so they keep working.
 *
 * Returns { printers: [{ product, colors, quantity }], paper: { bundle: packs }, addon } or { error }.
 */
export function normalizeCart(body = {}) {
  const addonResult = normalizePaperAddon(body.paper_addon);
  if (addonResult.error) return { error: addonResult.error };

  let printerInput;
  let paperInput;
  if (Array.isArray(body.items)) {
    printerInput = [];
    paperInput = [];
    for (const item of body.items) {
      if (item?.type === 'printer') printerInput.push(item);
      else if (item?.type === 'paper') paperInput.push({ bundle: item.bundle, quantity: item.quantity });
      else return { error: 'Invalid cart item' };
    }
  } else if (body.items !== undefined) {
    return { error: 'Invalid cart' };
  } else {
    // Legacy single-product form. Paper-only orders name no printer.
    const paperOnly = body.product === undefined && body.colors === undefined &&
      Array.isArray(body.paper) && body.paper.length > 0;
    printerInput = paperOnly ? [] : [{
      product: body.product || PREORDER_CONFIG.default_product,
      colors: body.colors,
      // Old pages clamped the quantity rather than rejecting it.
      quantity: Math.max(1, Math.min(MAX_PRINTER_PACKAGES, parseInt(body.quantity, 10) || 1)),
    }];
    paperInput = body.paper;
  }

  const paperResult = normalizePaperItems(paperInput);
  if (paperResult.error) return { error: paperResult.error };

  if (printerInput.length > MAX_PRINTER_LINES) return { error: 'Too many printers in your cart' };
  const merged = new Map();
  for (const line of printerInput) {
    const product = PRODUCTS[line?.product];
    if (!product) return { error: 'Invalid product selection' };
    const { colors } = line;
    if (!Array.isArray(colors) || colors.length !== product.printer_count || colors.some((c) => !COLORS.includes(c))) {
      const n = product.printer_count;
      return { error: `Please select ${n} valid printer color${n === 1 ? '' : 's'}` };
    }
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) return { error: 'Invalid printer quantity' };
    // Identical lines (same product and colors) merge.
    const key = `${line.product}:${colors.join(',')}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += quantity;
    else merged.set(key, { product: line.product, colors: [...colors], quantity });
  }
  const printers = [...merged.values()];
  const packages = printers.reduce((sum, line) => sum + line.quantity, 0);
  if (packages > MAX_PRINTER_PACKAGES) {
    return { error: `You can order up to ${MAX_PRINTER_PACKAGES} printer packages at a time` };
  }

  if (!printers.length && !Object.keys(paperResult.items).length) return { error: 'Your cart is empty' };
  if (addonResult.addon && !printers.length) {
    return { error: 'The paper add-on price requires a printer in your order' };
  }

  return { printers, paper: paperResult.items, addon: addonResult.addon };
}

/** Readable printer line, e.g. "2-Pack × 1 (Pink, White)". */
export function describePrinterLine({ product, colors, quantity }) {
  const label = product === 'duo' ? '2-Pack' : 'Single Printer';
  const colorText = colors.map((c) => PREORDER_CONFIG.color_labels[c] || c).join(', ');
  return `${label} × ${quantity} (${colorText})`;
}

/** Compact Checkout Session metadata for printer lines (Stripe values are limited to 500 chars). */
export function printerItemsMetadata(printers) {
  return JSON.stringify(printers.map(({ product, colors, quantity }) => [product, colors, quantity]));
}

/**
 * Read printer lines back out of Checkout Session metadata. Returns [] when the session
 * has no `printer_items` (paper-only orders and sessions created before carts).
 */
export function parsePrinterItems(metadata = {}) {
  if (!metadata.printer_items) return [];
  let parsed;
  try {
    parsed = JSON.parse(metadata.printer_items);
  } catch {
    throw new Error('Checkout session has invalid printer metadata');
  }
  if (!Array.isArray(parsed)) throw new Error('Checkout session has invalid printer metadata');
  return parsed.map((entry) => {
    const [product, colors, quantity] = Array.isArray(entry) ? entry : [];
    const config = PRODUCTS[product];
    if (!config || !Array.isArray(colors) || colors.length !== config.printer_count ||
        colors.some((c) => !COLORS.includes(c)) || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Checkout session has invalid printer metadata');
    }
    return { product, colors, quantity };
  });
}

/** Physical printers per color across all printer lines, e.g. { pink: 1, white: 1, black: 2 }. */
export function colorCountsForPrinters(printers) {
  const counts = {};
  for (const { colors, quantity } of printers) {
    for (const color of colors) counts[color] = (counts[color] || 0) + quantity;
  }
  return counts;
}
