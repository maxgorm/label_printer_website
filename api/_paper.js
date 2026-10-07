import { createClient } from '@supabase/supabase-js';
import PREORDER_CONFIG from './_config.js';

const BUNDLES = PREORDER_CONFIG.paper_bundles;

/**
 * Validate the paper selections sent by the browser. Only bundle keys and
 * quantities are accepted; prices always come from the server config.
 * Returns { items: { bundle: quantity } } or { error }.
 */
export function normalizePaperItems(input) {
  if (input === undefined || input === null) return { items: {} };
  if (!Array.isArray(input)) return { error: 'Invalid thermal paper selection' };

  const items = {};
  for (const entry of input) {
    const bundle = entry?.bundle;
    const quantity = Number(entry?.quantity);
    if (!Object.hasOwn(BUNDLES, bundle) || !Number.isInteger(quantity) || quantity < 1) {
      return { error: 'Invalid thermal paper selection' };
    }
    items[bundle] = (items[bundle] || 0) + quantity;
    if (items[bundle] > PREORDER_CONFIG.paper_max_per_bundle) {
      return { error: `You can order up to ${PREORDER_CONFIG.paper_max_per_bundle} packs of each paper bundle` };
    }
  }
  return { items };
}

export function normalizePaperAddon(input) {
  if (input === undefined || input === null || input === '') return { addon: null };
  if (typeof input !== 'string' || !Object.hasOwn(BUNDLES, input)) {
    return { error: 'Invalid thermal paper add-on' };
  }
  return { addon: input };
}

/** Add the discounted add-on pack to the full-price bundle counts. */
export function mergeBundles(listed, addon) {
  const merged = { ...listed };
  if (addon) merged[addon] = (merged[addon] || 0) + 1;
  return merged;
}

/** Total rolls per color for a { bundle: packs } map. */
export function rollCountsFor(bundles) {
  const rolls = {};
  for (const [bundle, packs] of Object.entries(bundles)) {
    for (const [color, perPack] of Object.entries(BUNDLES[bundle].rolls)) {
      rolls[color] = (rolls[color] || 0) + perPack * packs;
    }
  }
  return rolls;
}

/** Read the paper selections back out of Checkout Session metadata. */
export function parsePaperMetadata(metadata = {}) {
  let listed = {};
  if (metadata.paper_bundles) {
    let parsed;
    try {
      parsed = JSON.parse(metadata.paper_bundles);
    } catch {
      throw new Error('Checkout session has invalid paper metadata');
    }
    for (const [bundle, packs] of Object.entries(parsed)) {
      if (!Object.hasOwn(BUNDLES, bundle) || !Number.isInteger(packs) || packs < 1) {
        throw new Error('Checkout session has invalid paper metadata');
      }
      listed[bundle] = packs;
    }
  }
  const addon = metadata.paper_addon || null;
  if (addon && !Object.hasOwn(BUNDLES, addon)) {
    throw new Error('Checkout session has invalid paper add-on metadata');
  }
  const bundles = mergeBundles(listed, addon);
  return { listed, addon, bundles, rolls: rollCountsFor(bundles) };
}

export function describePaper({ listed, addon }) {
  const parts = Object.entries(listed).map(([bundle, packs]) => `${packs} × ${BUNDLES[bundle].label} (3 rolls)`);
  if (addon) parts.push(`1 × ${BUNDLES[addon].label} (3 rolls, add-on price)`);
  return parts.join(', ');
}

/**
 * Block checkout when a paper color has run out. Skipped when Supabase is not
 * configured, and fails open on database errors so paper never blocks printer sales.
 * Returns an error message or null.
 */
export async function findPaperStockShortage(rolls) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !Object.keys(rolls).length) {
    return null;
  }
  try {
    const supabase = createClient(process.env.SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());
    const { data, error } = await supabase.from('paper_stock').select('color, available_to_sell');
    if (error) throw error;
    const available = Object.fromEntries((data || []).map((row) => [row.color, row.available_to_sell]));
    for (const [color, needed] of Object.entries(rolls)) {
      if ((available[color] ?? 0) < needed) {
        return 'Sorry, there is not enough thermal paper in stock for that selection. Please choose a different bundle or a smaller quantity.';
      }
    }
  } catch (err) {
    console.error('Paper stock check failed; allowing checkout:', err.message || err);
  }
  return null;
}
