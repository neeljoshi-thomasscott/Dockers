/**
 * Stand-in for the two Horizon theme modules that assets/ts-cart-drawer.js imports
 * (`@theme/events` and `@theme/section-renderer`).
 *
 * ONLY needed when the target theme is NOT built on Shopify Horizon. Horizon-based
 * themes already ship these modules in their import map; do not add this file there.
 *
 * Use: upload as assets/ts-theme-compat.js and change the first two lines of
 * assets/ts-cart-drawer.js to:
 *
 *   import { morphSection, CartUpdateEvent, ThemeEvents } from './ts-theme-compat.js';
 */

export const ThemeEvents = {
  /** Fired on document (bubbles) after the drawer changes the cart. detail.resource = cart JSON. */
  cartUpdate: 'cart:update',
};

export class CartUpdateEvent extends Event {
  /**
   * @param {object} resource - cart JSON returned by /cart/change.js or /cart/update.js
   * @param {string} sourceId - id of the component that changed the cart
   * @param {object} [data]
   */
  constructor(resource, sourceId, data = {}) {
    super(ThemeEvents.cartUpdate, { bubbles: true });
    this.detail = { resource, sourceId, data: { ...data } };
  }
}

/**
 * Swaps the drawer's `data-hydration-key` regions with the freshly rendered ones,
 * leaving everything else (the open <dialog>, timers, listeners) untouched.
 * Only top-level keyed regions are swapped; nested ones come along with their parent.
 *
 * @param {string} sectionId
 * @param {string} html - Section Rendering API response
 */
export async function morphSection(sectionId, html) {
  const id = `shopify-section-${sectionId}`;
  const current = document.getElementById(id);
  const next = new DOMParser().parseFromString(html, 'text/html').getElementById(id);
  if (!current) throw new Error(`Section ${sectionId} not found`);
  if (!next) throw new Error(`Section ${sectionId} not found in the section rendering response`);

  const topLevel = (root) =>
    [...root.querySelectorAll('[data-hydration-key]')].filter((el) => !el.parentElement?.closest('[data-hydration-key]'));

  const fresh = new Map(topLevel(next).map((el) => [el.dataset.hydrationKey, el]));
  for (const old of topLevel(current)) {
    const replacement = fresh.get(old.dataset.hydrationKey);
    if (!replacement) continue;
    const scrollTop = old.scrollTop;
    old.replaceWith(replacement);
    replacement.scrollTop = scrollTop;
  }
}
