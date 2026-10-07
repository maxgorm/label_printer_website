import Stripe from 'stripe';
import PREORDER_CONFIG from './_config.js';
import {
  describePaper,
  findPaperStockShortage,
  mergeBundles,
  normalizePaperAddon,
  normalizePaperItems,
  rollCountsFor,
  shippingCentsFor,
} from './_paper.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe secret key is not configured' });
  }

  const { quantity, product: productKey, colors, paper, paper_addon: paperAddon } = req.body || {};

  const paperResult = normalizePaperItems(paper);
  if (paperResult.error) return res.status(400).json({ error: paperResult.error });
  const addonResult = normalizePaperAddon(paperAddon);
  if (addonResult.error) return res.status(400).json({ error: addonResult.error });
  const listedPaper = paperResult.items;
  const addon = addonResult.addon;

  // Paper-only orders name no printer. Anything else is a printer order.
  const paperOnly = productKey === undefined && colors === undefined && Object.keys(listedPaper).length > 0;
  if (paperOnly && addon) {
    return res.status(400).json({ error: 'The paper add-on price requires a printer in your order' });
  }

  const qty = Math.max(1, Math.min(10, parseInt(quantity, 10) || 1));
  const selectedProductKey = productKey || PREORDER_CONFIG.default_product;
  const selectedProduct = paperOnly ? null : PREORDER_CONFIG.products[selectedProductKey];

  if (!paperOnly && !selectedProduct) {
    return res.status(400).json({ error: 'Invalid product selection' });
  }

  let colorSummary = '';
  let colorMetadata = {};
  if (!paperOnly) {
    const requiredColorCount = selectedProduct.printer_count;
    if (!Array.isArray(colors) || colors.length !== requiredColorCount || colors.some((color) => !PREORDER_CONFIG.available_colors.includes(color))) {
      return res.status(400).json({
        error: `Please select ${requiredColorCount} valid printer color${requiredColorCount === 1 ? '' : 's'}`,
      });
    }

    colorSummary = colors.map((color) => PREORDER_CONFIG.color_labels[color]).join(', ');
    colorMetadata = {
      printer_colors: colorSummary,
      printer_color_1: PREORDER_CONFIG.color_labels[colors[0]],
      ...(colors[1] ? { printer_color_2: PREORDER_CONFIG.color_labels[colors[1]] } : {}),
    };
  }

  const bundles = PREORDER_CONFIG.paper_bundles;
  const paperAll = mergeBundles(listedPaper, addon);
  const hasPaper = Object.keys(paperAll).length > 0;
  const paperDescription = hasPaper ? describePaper({ listed: listedPaper, addon }) : '';

  const stockError = hasPaper ? await findPaperStockShortage(rollCountsFor(paperAll)) : null;
  if (stockError) return res.status(409).json({ error: stockError });

  const paperTotalPacks = Object.values(paperAll).reduce((sum, packs) => sum + packs, 0);
  const lineItems = [];
  let subtotalCents = 0;

  if (!paperOnly) {
    subtotalCents += selectedProduct.unit_price_cents * qty;
    lineItems.push({
      price_data: {
        currency: PREORDER_CONFIG.currency,
        // Listed prices are the subtotal; Stripe adds applicable tax.
        tax_behavior: 'exclusive',
        product_data: {
          tax_code: PREORDER_CONFIG.product_tax_code,
          name: selectedProduct.name,
          description: `${selectedProduct.description} Colors: ${colorSummary}.`,
        },
        unit_amount: selectedProduct.unit_price_cents,
      },
      quantity: qty,
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
    subtotalCents += PREORDER_CONFIG.paper_addon_price_cents;
    lineItems.push({
      price_data: {
        currency: PREORDER_CONFIG.currency,
        tax_behavior: 'exclusive',
        product_data: {
          tax_code: PREORDER_CONFIG.paper_tax_code,
          name: `${bundle.name} (printer add-on price)`,
          description: `${bundle.description} Add-on price with your printer; regular price ${formatDollars(bundle.price_cents)}.`,
          metadata: { paper_bundle: addon, paper_addon: 'true' },
        },
        unit_amount: PREORDER_CONFIG.paper_addon_price_cents,
      },
      quantity: PREORDER_CONFIG.paper_addon_max_per_order,
    });
  }

  const shippingCents = shippingCentsFor(subtotalCents);
  const paperMetadata = hasPaper
    ? {
        paper_bundles: JSON.stringify(listedPaper),
        paper_addon: addon || '',
        paper_packs: String(paperTotalPacks),
        paper_summary: paperDescription,
      }
    : {};

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim());

  try {
    const sessionParams = {
      mode: 'payment',
      automatic_tax: { enabled: true },
      payment_method_types: ['card'],
      line_items: lineItems,
      metadata: {
        product_key: paperOnly ? 'paper' : selectedProductKey,
        product_slug: paperOnly ? 'sentimo-paper' : selectedProduct.slug,
        product_name: paperOnly ? 'Sentimo Thermal Paper' : selectedProduct.name,
        unit_price_cents: paperOnly ? '0' : String(selectedProduct.unit_price_cents),
        printer_count: paperOnly ? '0' : String(selectedProduct.printer_count),
        order_type: PREORDER_CONFIG.order_type,
        expected_ship: PREORDER_CONFIG.expected_ship_label,
        quantity: String(paperOnly ? paperTotalPacks : qty),
        shipping_cents: String(shippingCents),
        ...colorMetadata,
        ...paperMetadata,
      },
      payment_intent_data: {
        metadata: { ...colorMetadata, ...(hasPaper ? { paper_summary: paperDescription } : {}) },
      },
      success_url: `${getBaseUrl(req)}${PREORDER_CONFIG.success_url}`,
      cancel_url: `${getBaseUrl(req)}${PREORDER_CONFIG.cancel_url}`,
      allow_promotion_codes: PREORDER_CONFIG.allow_promotion_codes,
      custom_text: {
        submit: {
          message: `This is a pre-order. Shipping is expected to begin in ${PREORDER_CONFIG.expected_ship_label}. ${PREORDER_CONFIG.refund_message}`,
        },
      },
    };

    // Collect shipping address if enabled
    if (PREORDER_CONFIG.collect_shipping) {
      sessionParams.shipping_address_collection = {
        allowed_countries: PREORDER_CONFIG.shipping_countries,
      };
      sessionParams.shipping_options = [{
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: shippingCents === 0 ? 'Free shipping' : 'Standard shipping',
          fixed_amount: { amount: shippingCents, currency: PREORDER_CONFIG.currency },
          tax_behavior: 'exclusive',
          tax_code: PREORDER_CONFIG.shipping_tax_code,
        },
      }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ url: session.url });
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
