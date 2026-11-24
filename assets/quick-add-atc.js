class QuickAddAtc extends HTMLElement {
  connectedCallback() {
    this.form = this.querySelector('[data-product-form]');
    this.trigger = this.querySelector('[data-add-to-cart]');
    this.panel = this.querySelector('[data-quick-add-panel]');
    this.scrim = this.querySelector('[data-quick-add-scrim]');
    this.currentSizeEl = this.querySelector('[data-quick-add-current-size]');
    this.stockFlagEl = this.querySelector('[data-quick-add-stock-flag]');
    this.variantInput = this.querySelector('[data-quick-add-variant-input]');

    if (!this.form || !this.trigger || !this.panel) return;

    this.isOpen = false;
    this.pendingSubmit = false;
    // The server-rendered pre-selection (first available size), restored on
    // every close so a reopened panel starts from it, not the last pick.
    this.defaultOption = this.querySelector('[data-quick-add-option][aria-checked="true"]');
    if (this.defaultOption) this.selectSize(this.defaultOption);

    // Capture phase doesn't itself guarantee this runs before product-form.js's
    // own submit listener — at the same target, listener order is registration
    // order, not capture-vs-bubble. This works because product-form.js's
    // listener is added in ITS connectedCallback, which only runs once the
    // <product-form> custom element upgrades — after this element (its parent)
    // has already finished its own connectedCallback and registered this one.
    // If that upgrade ordering ever changes, `capture: true` alone won't save it.
    this.form.addEventListener('submit', (event) => this.onFormSubmit(event), { capture: true });

    this.scrim?.addEventListener('click', () => this.close());

    this.handleKeydown = (event) => {
      if (event.key === 'Escape' && this.isOpen) this.close();
    };
    document.addEventListener('keydown', this.handleKeydown);

    // Desktop has no scrim to tap (mobile-only backdrop), so without this the
    // panel has no way to dismiss short of picking a size or pressing Escape.
    this.handleOutsideClick = (event) => {
      if (this.isOpen && !this.contains(event.target) && !this.panel.contains(event.target)) this.close();
    };
    document.addEventListener('click', this.handleOutsideClick);

    // On the panel, not the host: the mobile sheet may be moved out of the
    // host while open (see liftOutOfCarousel), and its clicks must still land.
    this.panel.addEventListener('click', (event) => this.handleClick(event));
    this.panel.addEventListener('transitionend', () => this.returnToHost());
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('click', this.handleOutsideClick);
    if (this.isOpen) OverlayUtils.unlockScroll(this);
    this.returnToHost({ force: true });
  }

  isDesktop() {
    return window.matchMedia('(hover: hover)').matches;
  }

  handleClick(event) {
    const option = event.target.closest('[data-quick-add-option]');
    if (option && !option.disabled) {
      this.selectSize(option);
      if (this.isDesktop()) {
        this.submitVariant(option.dataset.variantId, { buyNow: false });
        this.close();
      }
      return;
    }

    // Defensive: both buttons are server-disabled when no size is in stock.
    if (event.target.closest('[data-quick-add-add-to-bag]')) {
      const selected = this.panel.querySelector('[data-quick-add-option][aria-checked="true"]');
      if (selected && !selected.disabled) this.submitVariant(selected.dataset.variantId, { buyNow: false });
      this.close();
      return;
    }

    if (event.target.closest('[data-quick-add-buy-now]')) {
      const selected = this.panel.querySelector('[data-quick-add-option][aria-checked="true"]');
      if (selected && !selected.disabled) this.submitVariant(selected.dataset.variantId, { buyNow: true });
      this.close();
    }
  }

  selectSize(option) {
    for (const other of this.panel.querySelectorAll('[data-quick-add-option]')) {
      const isSelected = other === option;
      // Styled off aria-checked in quick-add-atc.liquid (aria-checked: variant).
      other.setAttribute('aria-checked', String(isSelected));
    }

    if (this.currentSizeEl) this.currentSizeEl.textContent = option.dataset.sizeValue;
    if (this.variantInput && option.dataset.variantId) this.variantInput.value = option.dataset.variantId;
    if (this.stockFlagEl) this.stockFlagEl.hidden = option.dataset.lowStock !== 'true';
  }

  submitVariant(variantId, { buyNow }) {
    if (!variantId) return;

    const input = this.form.querySelector('input[name="id"]');
    if (input) input.value = variantId;
    if (buyNow) this.form.dataset.buyNow = 'true';

    this.pendingSubmit = true;
    this.form.requestSubmit();
  }

  onFormSubmit(event) {
    if (this.pendingSubmit) {
      this.pendingSubmit = false;
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.open();
  }

  // Fades as well as slides: translate-y-full alone doesn't move the panel
  // far enough to clear the card on desktop.
  open() {
    this.isOpen = true;
    this.liftOutOfCarousel();
    this.panel.classList.remove('translate-y-full', 'opacity-0', 'pointer-events-none');
    this.panel.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
    this.scrim?.classList.remove('opacity-0', 'pointer-events-none');
    this.scrim?.classList.add('opacity-100', 'pointer-events-auto');

    // Mobile only — the desktop panel is a small in-card popup, not a
    // full-viewport takeover like the mobile sheet, so the rest of the page
    // should stay scrollable while it's open.
    if (!this.isDesktop()) OverlayUtils.lockScroll(this);
  }

  close() {
    this.isOpen = false;
    this.panel.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
    this.panel.classList.add('translate-y-full', 'opacity-0', 'pointer-events-none');
    this.scrim?.classList.remove('opacity-100', 'pointer-events-auto');
    this.scrim?.classList.add('opacity-0', 'pointer-events-none');

    // Released unconditionally (a no-op when not held), so a lock taken on
    // mobile can't be stranded if the viewport changed while open. Only this
    // panel's own claim is dropped — an enclosing search drawer keeps its lock.
    OverlayUtils.unlockScroll(this);

    // This element is reused (not re-rendered) across opens, so the selection
    // is put back to the server default — otherwise the last pick stays
    // checked (and styled, via aria-checked) on every future open.
    if (this.defaultOption) this.selectSize(this.defaultOption);
  }

  // A carousel moves its track with a CSS transform, and a transformed
  // ancestor becomes the containing block for `position: fixed` — the mobile
  // sheet and scrim would pin to the track (mid-page, cut off once swiped)
  // instead of the viewport. Moving them just outside the track for the open
  // keeps them in the same stacking context (e.g. inside the search drawer).
  liftOutOfCarousel() {
    const track = this.closest('[data-carousel-track]');
    if (!track || getComputedStyle(this.panel).position !== 'fixed') return;

    // Children of the host are reused by reference; the scrim first so the
    // panel still paints above it.
    if (this.scrim) track.after(this.scrim);
    (this.scrim ?? track).after(this.panel);
  }

  // Runs once the close slide finishes, so the sheet animates out in place.
  returnToHost({ force = false } = {}) {
    if (this.panel.parentElement === this || (this.isOpen && !force)) return;

    if (this.scrim) this.append(this.scrim);
    this.append(this.panel);
  }
}

if (!customElements.get('quick-add-atc')) {
  customElements.define('quick-add-atc', QuickAddAtc);
}
