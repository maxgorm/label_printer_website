import Stripe from 'stripe';
import PREORDER_CONFIG, { printerPriceCents } from './_config.js';
import { describePrinterLine, normalizeCart, printerItemsMetadata } from './_cart.js';
import { attributionMetadata, checkoutEventId, commerceData, contentsFromMetadata } from './_meta.js';
import {
  describePaper,
  findPaperStockShortage,
  mergeBundles,
  normalizeShippingCountry,
  rollCountsFor,
  shippingCentsFor,
} from './_paper.js';
import { bookCountFor, describeBooks, findBookStockShortage } from './_books.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe secret key is not configured' });
  }

  const { country: countryInput } = req.body || {};

  // Older cached pages send no country; those orders stay US-only.
  const country = normalizeShippingCountry(countryInput);
  if (!country) return res.status(400).json({ error: 'Sorry, we do not ship to that country yet' });
  const international = country !== 'US';
  const shipLabel = international ? PREORDER_CONFIG.international_ship_label : PREORDER_CONFIG.expected_ship_label;

  // The cart: printer lines, full-price paper packs, Memory Books, and the optional discounted add-on pack.
  const cart = normalizeCart(req.body || {});
  if (cart.error) return res.status(400).json({ error: cart.error });
  const { printers, paper: listedPaper, books, addon } = cart;
  const hasBooks = Object.keys(books).length > 0;
  const bookCount = bookCountFor(books);
  const bookDescription = hasBooks ? describeBooks(books) : '';
  // No printer in the cart: an accessories-only order. "paper" when it is only paper
  // (the shape older sessions use), "accessories" when it includes Memory Books.
  const paperOnly = printers.length === 0;
  const accessoryKey = hasBooks ? 'accessories' : 'paper';

  const printerProductKeys = [...new Set(printers.map((line) => line.product))];
  // One product type keeps the classic metadata shape; a mix of single printers and 2-Packs is "mixed".
  const metaProductKey = paperOnly ? accessoryKey : (printerProductKeys.length === 1 ? printerProductKeys[0] : 'mixed');
  const metaProduct = PREORDER_CONFIG.products[metaProductKey] || null;
  const printerPackages = printers.reduce((sum, line) => sum + line.quantity, 0);
  const printerUnits = printers.reduce((sum, line) => sum + line.quantity * PREORDER_CONFIG.products[line.product].printer_count, 0);

  const colorLabels = (colors) => colors.map((color) => PREORDER_CONFIG.color_labels[color]).join(', ');
  let colorMetadata = {};
  if (printers.length === 1) {
    const [{ colors }] = printers;
    colorMetadata = {
      printer_colors: colorLabels(colors),
      printer_color_1: PREORDER_CONFIG.color_labels[colors[0]],
      ...(colors[1] ? { printer_color_2: PREORDER_CONFIG.color_labels[colors[1]] } : {}),
    };
  } else if (printers.length > 1) {
    colorMetadata = { printer_colors: printers.map(describePrinterLine).join('; ').slice(0, 500) };
  }

  const bundles = PREORDER_CONFIG.paper_bundles;
  const paperAll = mergeBundles(listedPaper, addon);
  const hasPaper = Object.keys(paperAll).length > 0;
  const paperDescription = hasPaper ? describePaper({ listed: listedPaper, addon }) : '';

  const stockError = hasPaper ? await findPaperStockShortage(rollCountsFor(paperAll)) : null;
  if (stockError) return res.status(409).json({ error: stockError });
  const bookStockError = hasBooks ? await findBookStockShortage(bookCount) : null;
  if (bookStockError) return res.status(409).json({ error: bookStockError });

  const paperTotalPacks = Object.values(paperAll).reduce((sum, packs) => sum + packs, 0);
  const lineItems = [];
  let subtotalCents = 0;

  // One Stripe line per printer cart line. Sale price until the sale ends, then the regular price.
  for (const line of printers) {
    const product = PREORDER_CONFIG.products[line.product];
    const unitPriceCents = printerPriceCents(product);
    subtotalCents += unitPriceCents * line.quantity;
    lineItems.push({
      price_data: {
        currency: PREORDER_CONFIG.currency,
        // Listed prices are the subtotal; Stripe adds applicable tax.
        tax_behavior: 'exclusive',
        product_data: {
          tax_code: PREORDER_CONFIG.product_tax_code,
          name: product.name,
          description: `${product.description} Colors: ${colorLabels(line.colors)}.`,
        },
        unit_amount: unitPriceCents,
      },
      quantity: line.quantity,
    });
  }

  for (const [bundleKey, packs] of Object.entries(listedPaper)) {
    const bundle = bundles[bundleKey];
    subtotalCents += bundle.price_cents * packs;
    lineItems.push({
      price_data: {
        currency: PREORDER_CONFIG.currency,
        tax_behavior: 'exclusive',
        product_data: {
          tax_code: PREORDER_CONFIG.paper_tax_code,
          name: bundle.name,
          description: `${bundle.description} Ships with your Sentimo order.`,
          metadata: { paper_bundle: bundleKey },
        },
        unit_amount: bundle.price_cents,
      },
      quantity: packs,
    });
  }

  if (addon) {
    const bundle = bundles[addon];
    subtotalCents += bundle.addon_price_cents;
    lineItems.push({
      price_data: {
        currency: PREORDER_CONFIG.currency,
        tax_behavior: 'exclusive',
        product_data: {
          tax_code: PREORDER_CONFIG.paper_tax_code,
          name: `${bundle.name} (bundle deal with your printer)`,
          description: `${bundle.description} Add-on price with your printer; regular price ${formatDollars(bundle.price_cents)}.`,
          metadata: { paper_bundle: addon, paper_addon: 'true' },
        },
        unit_amount: bundle.addon_price_cents,
      },
      quantity: PREORDER_CONFIG.paper_addon_max_per_order,
    });
  }

  // Memory Books: one Stripe line per variant, at the same price with or without a printer.
  for (const [variant, units] of Object.entries(books)) {
    const book = PREORDER_CONFIG.memory_books[variant];
    subtotalCents += book.price_cents * units;
    lineItems.push({
      price_data: {
        currency: PREORDER_CONFIG.currency,
        tax_behavior: 'exclusive',
        product_data: {
          tax_code: PREORDER_CONFIG.memory_book_tax_code,
          name: book.name,
          description: `${book.description} Ships with your Sentimo order.`,
          metadata: { memory_book: variant, sku: book.sku, books_per_unit: String(book.books) },
        },
        unit_amount: book.price_cents,
      },
      quantity: units,
    });
  }

  const shippingCents = shippingCentsFor(subtotalCents, country);
  const paperMetadata = hasPaper
    ? {
        paper_bundles: JSON.stringify(listedPaper),
        paper_addon: addon || '',
        paper_packs: String(paperTotalPacks),
        paper_summary: paperDescription,
      }
    : {};
  const bookMetadata = hasBooks
    ? {
        memory_books: JSON.stringify(books),
        memory_book_count: String(bookCount),
        memory_book_summary: bookDescription,
      }
    : {};
  const accessoryNames = { paper: 'Sentimo Thermal Paper', accessories: 'Sentimo Accessories' };

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim());

  try {
    const sessionParams = {
      mode: 'payment',
      automatic_tax: { enabled: true },
      payment_method_types: ['card'],
      line_items: lineItems,
      custom_fields: [{
        key: 'discovery',
        label: { type: 'custom', custom: 'How did you hear about us?' },
        type: 'dropdown',
        optional: true,
        dropdown: { options: [
          { label: 'Instagram', value: 'instagram' },
          { label: 'Facebook', value: 'facebook' },
          { label: 'TikTok', value: 'tiktok' },
          { label: 'Google or other search', value: 'search' },
          { label: 'ChatGPT or another AI assistant', value: 'ai' },
          { label: 'Friend or family', value: 'wordofmouth' },
          { label: 'Other', value: 'other' },
        ] },
      }],
      metadata: {
        product_key: metaProductKey,
        product_slug: paperOnly ? `sentimo-${accessoryKey}` : (metaProduct ? metaProduct.slug : 'sentimo-mixed'),
        product_name: paperOnly ? accessoryNames[accessoryKey] : (metaProduct ? metaProduct.name : 'Sentimo Printers'),
        // Per-package price when every printer line is the same product; empty for a mix.
        unit_price_cents: paperOnly ? '0' : (metaProduct ? String(printerPriceCents(metaProduct)) : ''),
        // Printers in one package for a single product type; total printers for a mix.
        printer_count: paperOnly ? '0' : String(metaProduct ? metaProduct.printer_count : printerUnits),
        order_type: PREORDER_CONFIG.order_type,
        expected_ship: shipLabel,
        // Printer packages; for accessories-only orders, paper packs plus Memory Book units.
        quantity: String(paperOnly ? paperTotalPacks + Object.values(books).reduce((sum, n) => sum + n, 0) : printerPackages),
        ...(paperOnly ? {} : { printer_items: printerItemsMetadata(printers) }),
        shipping_cents: String(shippingCents),
        shipping_country: country,
        ...colorMetadata,
        ...paperMetadata,
        ...bookMetadata,
        // Meta/UTM attribution, present only when the visitor consented to advertising measurement.
        ...attributionMetadata(req.body?.attribution, req),
      },
      payment_intent_data: {
        metadata: {
          ...colorMetadata,
          ...(hasPaper ? { paper_summary: paperDescription } : {}),
          ...(hasBooks ? { memory_book_summary: bookDescription } : {}),
        },
      },
      success_url: `${getBaseUrl(req)}${PREORDER_CONFIG.success_url}`,
      cancel_url: `${getBaseUrl(req)}${PREORDER_CONFIG.cancel_url}`,
      allow_promotion_codes: PREORDER_CONFIG.allow_promotion_codes,
      custom_text: {
        submit: {
          message: international
            ? `International shipping takes ${shipLabel}. ${PREORDER_CONFIG.duties_message} ${PREORDER_CONFIG.refund_message}`
            : `Shipping to anywhere in the US takes ${shipLabel}. ${PREORDER_CONFIG.refund_message}`,
        },
        ...(international ? { shipping_address: { message: PREORDER_CONFIG.duties_message } } : {}),
      },
    };

    // Carriers need a phone number for international customs forms.
    if (international) {
      sessionParams.phone_number_collection = { enabled: true };
    }

    // Collect shipping address if enabled. The address must be in the country
    // chosen on the site, since that country set the shipping price.
    if (PREORDER_CONFIG.collect_shipping) {
      sessionParams.shipping_address_collection = {
        allowed_countries: [country],
      };
      sessionParams.shipping_options = [{
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: international ? 'International shipping' : (shippingCents === 0 ? 'Free shipping' : 'Standard shipping'),
          fixed_amount: { amount: shippingCents, currency: PREORDER_CONFIG.currency },
          tax_behavior: 'exclusive',
          tax_code: PREORDER_CONFIG.shipping_tax_code,
          ...(international ? {
            delivery_estimate: {
              minimum: { unit: 'day', value: 5 },
              maximum: { unit: 'day', value: 14 },
            },
          } : {}),
        },
      }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Tracking payload for the browser's InitiateCheckout event, built from the real order.
    let tracking;
    try {
      tracking = {
        event_id: checkoutEventId(session.id),
        ...commerceData({
          contents: contentsFromMetadata(sessionParams.metadata),
          valueCents: subtotalCents,
          currency: PREORDER_CONFIG.currency,
        }),
      };
    } catch (trackingError) {
      console.error('Checkout tracking payload failed:', trackingError.message);
    }

    return res.status(200).json({ url: session.url, ...(tracking ? { tracking } : {}) });
  } catch (error) {
    console.error('Stripe checkout session error:', error.message || error);
    return res.status(500).json({ error: 'Failed to create checkout session', detail: error.message });
  }
}

function formatDollars(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function getBaseUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${protocol}://${host}`;
}
