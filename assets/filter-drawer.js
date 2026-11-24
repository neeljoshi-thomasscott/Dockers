const FILTER_DRAWER_TRANSITION_DURATION = 300;
const FILTER_DRAWER_INPUT_SELECTORS = '[data-filter-drawer-checkbox], [data-price-range-input]';

class FilterDrawer extends HTMLElement {
  constructor() {
    super();
    this.isOpen = false;
    this.previousActiveElement = null;
    this.releaseFocusTrap = null;
  }

  connectedCallback() {
    this.panel = this.querySelector('[data-filter-drawer-panel]');
    this.scrim = this.querySelector('[data-filter-drawer-scrim]');
    this.form = this.querySelector('[data-filter-drawer-form]');
    this.count = this.querySelector('[data-filter-drawer-count]');
    this.initialCountText = this.count?.textContent;

    this.handleOpenRequest = () => this.open();
    document.addEventListener('toolbar:open-filter', this.handleOpenRequest);

    this.handleKeydown = (event) => {
      if (event.key === 'Escape' && this.isOpen) this.close();
    };
    document.addEventListener('keydown', this.handleKeydown);

    // <filter-drawer> itself is a fixed inset-0 overlay, so any click inside
    // it while open (pointer-events re-enabled by open()) bubbles here —
    // including background clicks on desktop, where the scrim is
    // `md:hidden` and there's otherwise no way to dismiss short of the
    // close button or Escape. Closing on anything outside the panel covers
    // the scrim click too, so that explicit check is no longer needed.
    this.addEventListener('click', (event) => {
      if (event.target.closest('[data-filter-drawer-close]')) {
        this.close();
        return;
      }

      if (this.isOpen && !event.target.closest('[data-filter-drawer-panel]')) {
        this.close();
      }
    });

    this.form?.addEventListener('change', (event) => {
      if (!event.target.matches(FILTER_DRAWER_INPUT_SELECTORS)) return;

      const params = new URLSearchParams(new FormData(this.form));
      this.dispatchEvent(new CustomEvent('filter:change', { bubbles: true, detail: { params } }));
    });

    // Back/forward restores an earlier URL and collection-controller.js
    // re-renders the listing for it, but this form is outside that swap. Its
    // inputs are re-synced from the URL so the next change submits the
    // filters actually in effect, not the ones the visitor just backed out of.
    this.handlePopState = () => this.syncInputsFromUrl();
    window.addEventListener('popstate', this.handlePopState);

    this.form?.addEventListener('reset', () => {
      requestAnimationFrame(() => {
        if (this.count) this.count.textContent = this.initialCountText;
        for (const priceRange of this.querySelectorAll('price-range')) priceRange.clear?.();
        this.dispatchEvent(
          new CustomEvent('filter:change', { bubbles: true, detail: { params: new URLSearchParams() } })
        );
      });
    });
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.handlePopState);
    document.removeEventListener('toolbar:open-filter', this.handleOpenRequest);
    document.removeEventListener('keydown', this.handleKeydown);
    clearTimeout(this.lowerToolbarTimer);
    this.removeTrapFocus();
    if (this.isOpen) OverlayUtils.unlockScroll(this);
  }

  syncInputsFromUrl() {
    if (!this.form) return;

    const params = new URLSearchParams(window.location.search);
    for (const checkbox of this.form.querySelectorAll('[data-filter-drawer-checkbox]')) {
      checkbox.checked = params.getAll(checkbox.name).includes(checkbox.value);
    }
    for (const priceInput of this.form.querySelectorAll('[data-filter-drawer-price]')) {
      priceInput.value = params.get(priceInput.name) ?? '';
    }
    this.syncPriceRanges();
  }

  syncPriceRanges() {
    for (const priceRange of this.querySelectorAll('price-range')) priceRange.syncFromValues?.();
  }

  open() {
    this.previousActiveElement = document.activeElement;
    this.isOpen = true;

    clearTimeout(this.lowerToolbarTimer);
    this.setAttribute('data-overlay-open', '');
    this.classList.remove('pointer-events-none');
    this.panel?.classList.add('pointer-events-auto');
    this.panel?.classList.remove('translate-y-full', 'md:translate-x-full');
    this.panel?.classList.add('translate-y-0', 'md:translate-x-0');
    this.scrim?.classList.remove('opacity-0', 'pointer-events-none');
    this.scrim?.classList.add('opacity-100', 'pointer-events-auto');

    OverlayUtils.lockScroll(this);
    this.trapFocus();
  }

  close() {
    this.isOpen = false;

    this.classList.add('pointer-events-none');
    this.panel?.classList.remove('pointer-events-auto', 'translate-y-0', 'md:translate-x-0');
    this.panel?.classList.add('translate-y-full', 'md:translate-x-full');
    this.scrim?.classList.remove('opacity-100', 'pointer-events-auto');
    this.scrim?.classList.add('opacity-0', 'pointer-events-none');

    OverlayUtils.unlockScroll(this);
    this.removeTrapFocus();
    this.previousActiveElement?.focus();

    clearTimeout(this.lowerToolbarTimer);
    this.lowerToolbarTimer = setTimeout(() => {
      this.removeAttribute('data-overlay-open');
    }, FILTER_DRAWER_TRANSITION_DURATION);
  }

  trapFocus() {
    this.removeTrapFocus();
    if (this.panel) this.releaseFocusTrap = OverlayUtils.trapFocus(this.panel);
  }

  removeTrapFocus() {
    this.releaseFocusTrap?.();
    this.releaseFocusTrap = null;
  }
}

class PriceRange extends HTMLElement {
  connectedCallback() {
    this.max = Number(this.dataset.max);
    this.ranges = {
      min: this.querySelector('[data-price-range-input="min"]'),
      max: this.querySelector('[data-price-range-input="max"]'),
    };
    this.labels = {
      min: this.querySelector('[data-price-range-label="min"]'),
      max: this.querySelector('[data-price-range-label="max"]'),
    };
    this.values = {
      min: this.querySelector('[data-price-range-value="min"]'),
      max: this.querySelector('[data-price-range-value="max"]'),
    };

    this.addEventListener('input', (event) => this.handleInput(event.target));
    this.addEventListener('change', () => this.writeValues());
    this.updateLabels();
  }

  handleInput(input) {
    const { min, max } = this.ranges;
    if (Number(min.value) > Number(max.value)) {
      if (input === min) min.value = max.value;
      else max.value = min.value;
    }
    this.updateLabels();
  }

  // Runs before the drawer's form listener sees the bubbling change event, so
  // the hidden inputs already hold the new range when the filter is submitted.
  writeValues() {
    const from = Number(this.ranges.min.value);
    const to = Number(this.ranges.max.value);
    this.values.min.value = from > 0 ? from : '';
    this.values.max.value = to < this.max ? to : '';
    this.values.min.disabled = this.values.min.value === '';
    this.values.max.disabled = this.values.max.value === '';
  }

  // A native form reset puts the handles back on the range the page loaded
  // with, which is the active filter rather than the full range.
  clear() {
    this.ranges.min.value = 0;
    this.ranges.max.value = this.max;
    this.values.min.value = '';
    this.values.max.value = '';
    this.updateLabels();
  }

  syncFromValues() {
    for (const side of ['min', 'max']) {
      this.values[side].disabled = false;
      const value = this.values[side].value;
      this.ranges[side].value = value === '' ? (side === 'min' ? 0 : this.max) : value;
    }
    this.updateLabels();
  }

  updateLabels() {
    for (const side of ['min', 'max']) {
      this.labels[side].textContent = Number(this.ranges[side].value).toLocaleString('en-IN');
    }
    const from = (Number(this.ranges.min.value) / this.max) * 100;
    const to = (Number(this.ranges.max.value) / this.max) * 100;
    this.style.setProperty('--price-range-from', `${from}%`);
    this.style.setProperty('--price-range-to', `${to}%`);
  }
}

if (!customElements.get('price-range')) {
  customElements.define('price-range', PriceRange);
}

if (!customElements.get('filter-drawer')) {
  customElements.define('filter-drawer', FilterDrawer);
}
