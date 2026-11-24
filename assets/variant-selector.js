class VariantSelector extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;

    const dataScript = this.querySelector('[data-variant-data]');
    if (!dataScript) return;

    try {
      this.variantData = JSON.parse(dataScript.textContent);
    } catch {
      return;
    }

    this.variants = this.variantData.variants;
    this.productOptions = this.variantData.options;
    this.productId = this.dataset.productId;
    this.lowStockThreshold = parseInt(this.dataset.lowStockThreshold, 10) || 30;
    this.optionButtons = [...this.querySelectorAll('[data-option-value]')];
    this.selectedOptions = this.getInitialSelectedOptions();

    this.addEventListener('click', (event) => {
      const button = event.target.closest('[data-option-value]');
      if (!button || button.disabled) return;

      const index = parseInt(button.dataset.optionIndex, 10);
      const value = button.dataset.optionValue;

      this.selectedOptions[index] = value;

      const variant = this.findVariant(this.selectedOptions);
      this.fillMissingOptions(variant);

      this.updateButtonStates();
      this.updateAvailability();
      this.updateLowStock(variant);

      // `source` lets subscribers tell which selector fired: the same product
      // can also appear as a card elsewhere on the page (search drawer,
      // recommendations), and those must not follow this selector.
      publish(PUB_SUB_EVENTS.variantChange, {
        productId: this.productId,
        variant,
        source: this,
      });
    });

    this.updateAvailability();

    const initialVariant = this.findVariant(this.selectedOptions);
    this.updateLowStock(initialVariant);
  }

  disconnectedCallback() {
    this.initialized = false;
  }

  getInitialSelectedOptions() {
    const options = [];
    if (!this.productOptions) return options;

    this.productOptions.forEach((option, index) => {
      const activeButton = this.querySelector(
        `[data-option-index="${index}"][aria-pressed="true"]`
      );
      if (activeButton) {
        options[index] = activeButton.dataset.optionValue;
      } else {
        options[index] = option.values?.[0] ?? '';
      }
    });

    return options;
  }

  findVariant(selectedOptions) {
    const exactMatch = this.variants.find((v) =>
      v.options.every((opt, i) => opt === selectedOptions[i])
    );
    if (exactMatch) return exactMatch;

    const displayedIndices = this.getDisplayedIndices();

    const partialMatch = this.variants.find((v) =>
      v.options.every((opt, i) => {
        if (!displayedIndices.has(i)) return true;
        return opt === selectedOptions[i];
      })
    );

    return partialMatch ?? null;
  }

  fillMissingOptions(variant) {
    if (!variant) return;
    const displayedIndices = this.getDisplayedIndices();
    variant.options.forEach((opt, i) => {
      if (!displayedIndices.has(i)) {
        this.selectedOptions[i] = opt;
      }
    });
  }

  getDisplayedIndices() {
    return new Set(
      this.optionButtons.map((btn) => parseInt(btn.dataset.optionIndex, 10))
    );
  }

  updateButtonStates() {
    for (const btn of this.optionButtons) {
      const index = parseInt(btn.dataset.optionIndex, 10);
      const value = btn.dataset.optionValue;
      const isSelected = this.selectedOptions[index] === value;

      // The selected look is styled off aria-pressed in variant-selector.liquid
      // (Tailwind aria-pressed: variants), so this attribute is the only state
      // to set — no parallel class list that can drift from the initial render.
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    }

    for (const label of this.querySelectorAll('[data-selected-option]')) {
      const index = parseInt(label.dataset.selectedOption, 10);
      if (this.selectedOptions[index]) {
        label.textContent = this.selectedOptions[index];
      }
    }
  }

  updateAvailability() {
    const displayedIndices = this.getDisplayedIndices();

    for (const btn of this.optionButtons) {
      const index = parseInt(btn.dataset.optionIndex, 10);
      const value = btn.dataset.optionValue;
      const isColor = btn.dataset.isColor === 'true';

      // A value only depends on the selection of the options BEFORE it (same
      // rule as variant-selector.liquid's first render), so a colour is never
      // greyed out by the chosen size.
      const available = this.variants.some((v) =>
        v.available &&
        v.options[index] === value &&
        v.options.every((opt, i) => i >= index || !displayedIndices.has(i) || opt === this.selectedOptions[i])
      );

      btn.toggleAttribute('disabled', !available);
      btn.classList.toggle('variant-sold-out', !available && isColor);
      btn.classList.toggle('bg-surface-alt', !available && !isColor);
      btn.classList.toggle('border-surface-alt', !available && !isColor);
      btn.classList.toggle('text-ink-20', !available && !isColor);
      btn.classList.toggle('cursor-not-allowed', !available && !isColor);
    }
  }

  updateLowStock(variant) {
    const isLowStock = Boolean(
      variant?.available &&
        variant.inventory_management === 'shopify' &&
        variant.inventory_quantity != null &&
        variant.inventory_quantity <= this.lowStockThreshold
    );

    this.querySelector('[data-low-stock-warning]')?.toggleAttribute('hidden', !isLowStock);

    for (const dot of this.querySelectorAll('[data-low-stock-dot]')) {
      dot.toggleAttribute('hidden', true);
    }

    if (!isLowStock) return;

    const sizeIndex = this.optionButtons.find((btn) => btn.hasAttribute('data-size-tile'))
      ?.dataset.optionIndex;
    if (sizeIndex == null) return;

    const selectedSizeValue = this.selectedOptions[parseInt(sizeIndex, 10)];
    const selectedTile = this.querySelector(
      `[data-size-tile][data-option-value="${CSS.escape(selectedSizeValue)}"]`
    );
    selectedTile?.querySelector('[data-low-stock-dot]')?.toggleAttribute('hidden', false);
  }
}

if (!customElements.get('variant-selector')) {
  customElements.define('variant-selector', VariantSelector);
}
