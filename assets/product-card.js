document.addEventListener('DOMContentLoaded', () => {
  if (typeof subscribe === 'undefined' || typeof PUB_SUB_EVENTS === 'undefined') return;

  subscribe(PUB_SUB_EVENTS.variantChange, (data) => {
    const { productId, variant } = data;
    if (!productId || !variant) return;

    const cards = document.querySelectorAll(`[data-product-card][data-product-id="${productId}"]`);
    if (!cards.length) return;

    for (const card of cards) {
      // A card only follows a selector inside itself. The PDP's selector is
      // for the product page, not for a card of the same product elsewhere
      // on the page (search drawer, recommendations).
      if (!data.source || !card.contains(data.source)) continue;

      const gallery = card.querySelector('product-gallery');
      const titleLink = card.querySelector('[data-product-card-title-link]');
      const priceEl = card.querySelector('[data-product-card-price]');
      const comparePriceEl = card.querySelector('[data-product-card-compare-price]');

      gallery?.setActiveMedia?.(variant.featured_media_id);

      if (titleLink) {
        const url = new URL(titleLink.href);
        url.searchParams.set('variant', variant.id);
        titleLink.href = url.toString();
      }

      if (priceEl) {
        priceEl.textContent = variant.display_price;
      }

      if (comparePriceEl) {
        if (variant.display_compare_at_price) {
          comparePriceEl.textContent = variant.display_compare_at_price;
          comparePriceEl.classList.remove('hidden');
        } else {
          comparePriceEl.classList.add('hidden');
        }
      }
    }
  });
});
