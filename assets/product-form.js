class ProductForm extends HTMLElement {
  connectedCallback() {
    this.form = this.querySelector('[data-product-form]');
    if (!this.form) return;

    this.variantSelect = this.form.querySelector('[data-variant-select]');
    this.variantSelect?.classList.add('hidden');

    this.submitButton = this.form.querySelector('[type="submit"]');
    this.errorContainer = this.querySelector('[data-form-error]');

    // Availability of the variant this form currently submits. The buttons'
    // disabled state and label are always derived from it (applyVariantState),
    // never read back from the page, where the server may have rendered
    // "Sold out" for a ?variant= link.
    this.variantState = this.submitButton?.disabled ? 'sold_out' : 'available';
    this.showingConfirmation = false;

    this.form.addEventListener('submit', (event) => this.onSubmit(event));
    this.addEventListener('click', (event) => {
      const buyNow = event.target.closest('[data-buy-now]');
      if (buyNow) this.onBuyNow(buyNow);
    });
    this.initQuantityStepper();
    this.initVariantSubscriber();
  }

  get buyNowButton() {
    return this.querySelector('[data-buy-now]');
  }

  disconnectedCallback() {
    this.unsubscribeVariant?.();
    clearTimeout(this.confirmationTimer);
  }

  initVariantSubscriber() {
    if (typeof subscribe === 'undefined' || typeof PUB_SUB_EVENTS === 'undefined') return;

    this.unsubscribeVariant = subscribe(PUB_SUB_EVENTS.variantChange, (data) => {
      if (data.productId !== this.dataset.productId) return;

      // Only forms in the same product section as the selector that fired
      // follow it (the PDP's main form and sticky bar). A card for the same
      // product elsewhere — the search drawer's fallback grid renders before
      // <main> — keeps its own variant and its icon-only button intact.
      const productSection = this.closest('[data-product-section]');
      if (!productSection || !data.source || !productSection.contains(data.source)) return;

      if (data.variant && this.variantSelect) this.variantSelect.value = data.variant.id;

      if (!data.variant) {
        this.variantState = 'unavailable';
      } else {
        this.variantState = data.variant.available ? 'available' : 'sold_out';
      }
      this.applyVariantState();
    });
  }

  applyVariantState() {
    const labels = {
      sold_out: window.theme?.strings?.soldOut ?? 'Sold out',
      unavailable: window.theme?.strings?.unavailable ?? 'Unavailable',
    };

    for (const button of [this.submitButton, this.buyNowButton]) {
      if (!button) continue;
      button.disabled = this.variantState !== 'available';

      const buttonText = button.querySelector('[data-button-text]');
      // Icon-only (compact) buttons have no text label to swap, and the
      // "Added to cart" confirmation owns the text until its timer ends.
      if (!buttonText || button.querySelector('[data-button-plus-icon]')) continue;
      if (button === this.submitButton && this.showingConfirmation) continue;

      buttonText.textContent =
        this.variantState === 'available' ? buttonText.dataset.availableLabel ?? buttonText.textContent : labels[this.variantState];
    }
  }

  initQuantityStepper() {
    this.addEventListener('click', (event) => {
      const minusBtn = event.target.closest('[data-quantity-minus]');
      const plusBtn = event.target.closest('[data-quantity-plus]');

      if (!minusBtn && !plusBtn) return;

      const input = this.querySelector('input[name="quantity"]');
      if (!input) return;

      const currentQty = parseInt(input.value, 10) || 1;
      const min = parseInt(input.min, 10) || 1;
      const max = parseInt(input.max, 10) || 99;

      if (minusBtn) {
        input.value = Math.max(min, currentQty - 1);
      } else if (plusBtn) {
        input.value = Math.min(max, currentQty + 1);
      }
    });
  }

  onBuyNow(button) {
    if (button.disabled) return;

    const formData = new FormData(this.form);
    const variantId = parseInt(formData.get('id'), 10);
    const quantity = parseInt(formData.get('quantity'), 10) || 1;
    if (!variantId) return;

    window.location.href = `${CartAPI.getRoot()}cart/${variantId}:${quantity}`;
  }

  async onSubmit(event) {
    event.preventDefault();

    if (this.submitButton?.disabled) return;
    this.setLoading(true);
    this.hideError();

    // The TS cart drawer watches /cart/add requests and opens itself with the
    // updated cart, so the form only has to add.
    try {
      await CartAPI.add(new FormData(this.form));
      this.showAddedConfirmation();

      if (this.form.dataset.buyNow === 'true') {
        delete this.form.dataset.buyNow;
        window.location.href = `${CartAPI.getRoot()}checkout`;
      }
    } catch (error) {
      this.showError(error?.description ?? error?.message ?? window.theme?.strings?.cartError ?? 'Something went wrong.');
    } finally {
      this.setLoading(false);
    }
  }

  showAddedConfirmation() {
    if (!this.submitButton) return;

    clearTimeout(this.confirmationTimer);

    const checkmarkIcon = this.submitButton.querySelector('[data-button-checkmark-icon]');
    const plusIcon = this.submitButton.querySelector('[data-button-plus-icon]');
    const buttonText = this.submitButton.querySelector('[data-button-text]');

    // Compact (icon-only) button: swap the icon and solidify the fill so the
    // confirmation reads clearly even where the button's resting state is a
    // translucent outline (touch devices have no hover state to darken it).
    if (checkmarkIcon && plusIcon) {
      plusIcon.classList.add('hidden');
      checkmarkIcon.classList.remove('hidden');
      this.submitButton.classList.add('is-added');
    } else if (this.submitButton.hasAttribute('data-add-to-bag') && document.querySelector('ts-cart-drawer')) {
      // PDP Add to bag with the TS drawer: the drawer opening on add is the
      // confirmation, and the longer "added" text wraps in this half-width
      // button on mobile.
      return;
    } else if (buttonText) {
      // Full-width PDP button already renders solid — text is the only
      // confirmation it needs.
      this.showingConfirmation = true;
      buttonText.textContent = window.theme?.strings?.addedToCart ?? 'Added to cart';
    }

    this.confirmationTimer = setTimeout(() => {
      if (checkmarkIcon && plusIcon) {
        checkmarkIcon.classList.add('hidden');
        plusIcon.classList.remove('hidden');
        this.submitButton.classList.remove('is-added');
      } else {
        // Re-derived rather than restoring the text saved 2s ago — the
        // variant may have changed during the confirmation.
        this.showingConfirmation = false;
        this.applyVariantState();
      }
    }, 2000);
  }

  setLoading(isLoading) {
    if (!this.submitButton) return;
    // Ending a load re-derives the enabled state from the current variant
    // instead of simply re-enabling — it may have become sold out meanwhile.
    if (isLoading) {
      this.submitButton.disabled = true;
    } else {
      this.applyVariantState();
    }

    // Undoes disabled:opacity-50's fade during this transient state — see
    // assets/base.css for why that's otherwise needed.
    this.submitButton.classList.toggle('is-loading', isLoading);

    const buttonText = this.submitButton.querySelector('[data-button-text]');
    const buttonLoader = this.submitButton.querySelector('[data-button-loader]');

    // Must be visibility:hidden (invisible), not display:none (hidden): the
    // loader div is absolutely positioned and contributes nothing to the
    // button's own size, so buttonText is the only thing still in flow that
    // gives the button its dimensions. display:none on it collapses the
    // whole button to a padding-only box mid-load. invisible keeps the
    // layout space reserved while hiding the icon. It's safelisted in
    // tailwind.config.js since this class only ever appears here, never in
    // a .liquid file Tailwind's content scan would pick up.
    if (buttonText) buttonText.classList.toggle('invisible', isLoading);
    if (buttonLoader) {
      buttonLoader.classList.toggle('hidden', !isLoading);
      buttonLoader.classList.toggle('flex', isLoading);
    }
  }

  showError(message) {
    if (!this.errorContainer) return;
    this.errorContainer.textContent = message;
    this.errorContainer.hidden = false;
  }

  hideError() {
    if (!this.errorContainer) return;
    this.errorContainer.textContent = '';
    this.errorContainer.hidden = true;
  }
}

if (!customElements.get('product-form')) {
  customElements.define('product-form', ProductForm);
}
