const SHARE_STATUS_DURATION = 2000;

document.addEventListener('DOMContentLoaded', () => {
  const stickyBuyBar = document.querySelector('[data-sticky-buy-bar]');
  const footer = document.querySelector('[data-footer]');
  if (stickyBuyBar && footer) {
    const footerObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        stickyBuyBar.classList.remove('translate-y-0');
        stickyBuyBar.classList.add('translate-y-full');
      } else {
        stickyBuyBar.classList.remove('translate-y-full');
        stickyBuyBar.classList.add('translate-y-0');
      }
    });
    footerObserver.observe(footer);
  }

  if (typeof subscribe === 'undefined' || typeof PUB_SUB_EVENTS === 'undefined') return;

  const productSection = document.querySelector('[data-product-section]');
  if (!productSection) return;

  // Gallery and pincode wiring runs before the variant-selector guard below:
  // single-variant products render no selector, but still need the viewer
  // to open from a desktop tile and the pincode form not to reload the page.
  for (const tile of productSection.querySelectorAll('[data-product-gallery-desktop] [data-gallery-media-id]')) {
    tile.addEventListener('click', (event) => {
      const { galleryMediaId } = event.currentTarget.dataset;
      event.currentTarget.dispatchEvent(
        new CustomEvent('gallery:open-viewer', { bubbles: true, detail: { mediaId: galleryMediaId } })
      );
    });
  }

  const pincodeForm = productSection.querySelector('[data-pincode-form]');
  if (pincodeForm) {
    pincodeForm.addEventListener('submit', (event) => {
      event.preventDefault();
      // TODO(D16): pincode -> delivery-date lookup is out of scope; wire up once resolved
    });
  }

  // Native share sheet where the browser has one; otherwise copy the link.
  // window.location.href is read at click time so it carries the currently
  // selected ?variant= (kept in sync by updateURL below).
  const shareButton = productSection.querySelector('[data-share-button]');
  const shareStatus = shareButton?.querySelector('[data-share-status]');
  let shareStatusTimer = null;

  const showShareStatus = () => {
    if (!shareStatus) return;
    shareStatus.hidden = false;
    clearTimeout(shareStatusTimer);
    shareStatusTimer = setTimeout(() => {
      shareStatus.hidden = true;
    }, SHARE_STATUS_DURATION);
  };

  shareButton?.addEventListener('click', async () => {
    const { shareTitle } = shareButton.dataset;
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, url });
        return;
      } catch (error) {
        // The visitor dismissing the sheet is not a failure to fall back from.
        if (error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      showShareStatus();
    } catch {
      // Clipboard unavailable (insecure context or permission denied) — nothing to fall back to.
    }
  });

  const productId = productSection.dataset.productId;
  const variantSelector = productSection.querySelector('variant-selector');
  if (!variantSelector) return;
  // Scoped to the product section: document-wide, these matched whatever
  // came first in the page — the search drawer's product cards render before
  // <main> — so a variant change wrote the price into a drawer card instead
  // of the product's own price row.
  const priceEl = productSection.querySelector('[data-product-price]');
  const comparePriceEl = productSection.querySelector('[data-product-compare-price]');
  const discountEl = productSection.querySelector('[data-product-discount]');
  const mrpEl = productSection.querySelector('[data-product-mrp]');

  const updatePrice = (variant) => {
    if (!priceEl) return;

    priceEl.textContent = variant.display_price;

    if (comparePriceEl) {
      if (variant.display_compare_at_price) {
        comparePriceEl.textContent = variant.display_compare_at_price;
        comparePriceEl.classList.remove('hidden');
      } else {
        comparePriceEl.classList.add('hidden');
      }
    }

    mrpEl?.classList.toggle('hidden', !variant.display_compare_at_price);

    if (discountEl) {
      if (variant.discount_label) {
        discountEl.textContent = variant.discount_label;
        discountEl.classList.remove('hidden');
      } else {
        discountEl.classList.add('hidden');
      }
    }
  };

  const updateURL = (variant) => {
    const url = new URL(window.location);
    url.searchParams.set('variant', variant.id);
    window.history.replaceState({}, '', url);
  };

  // A variant without its own media clears the highlight and returns the
  // mobile carousel to the first photo, rather than leaving the previously
  // picked colour's image on screen.
  const syncDesktopGallery = (variant) => {
    for (const tile of productSection.querySelectorAll('[data-product-gallery-desktop] [data-gallery-media-id]')) {
      tile.removeAttribute('data-active');
    }
    if (!variant?.featured_media_id) return;

    const desktopTile = productSection.querySelector(
      `[data-product-gallery-desktop] [data-gallery-media-id="${variant.featured_media_id}"]`
    );
    if (!desktopTile) return;

    desktopTile.setAttribute('data-active', 'true');
    desktopTile.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  };

  const filterMediaByVariant = (variant) => {
    syncDesktopGallery(variant);

    // Scoped to this section: the search drawer's product cards are also
    // <product-gallery> elements and render earlier in the document.
    const mobileGallery = productSection.querySelector('product-gallery');
    const firstMediaId = mobileGallery?.querySelector('[data-gallery-media-id]')?.dataset.galleryMediaId;
    mobileGallery?.setActiveMedia(variant?.featured_media_id ?? firstMediaId);
  };

  subscribe(PUB_SUB_EVENTS.variantChange, (data) => {
    if (data.productId !== productId) return;
    if (!data.source || !productSection.contains(data.source)) return;

    if (!data.variant) {
      if (discountEl) discountEl.classList.add('hidden');
      return;
    }

    updatePrice(data.variant);
    updateURL(data.variant);
    filterMediaByVariant(data.variant);
  });

  const initialVariant = variantSelector.variants?.find(
    (v) => v.options.every((opt, i) => opt === variantSelector.selectedOptions?.[i])
  );
  if (initialVariant) {
    filterMediaByVariant(initialVariant);
  }
});
