const SEARCH_DRAWER_TRANSITION_DURATION = 300;

class SearchDrawer extends HTMLElement {
  constructor() {
    super();
    this.previousActiveElement = null;
    this.isOpen = false;
    this.releaseFocusTrap = null;
    this.debounceTimer = null;
    this.hideTimer = null;
  }

  connectedCallback() {
    this.panel = this.querySelector('[data-search-drawer-panel]');
    this.input = this.querySelector('[data-search-drawer-input]');
    this.clearBtn = this.querySelector('[data-search-drawer-clear]');
    this.fieldRow = this.querySelector('[data-search-drawer-field-row]');

    const { minCharacters, debounceDelay } = this.dataset;
    this.minCharacters = parseInt(minCharacters, 10) || 1;
    this.debounceDelay = parseInt(debounceDelay, 10) || 300;

    this.handleSearchTrigger = (event) => {
      if (event.target.closest('[data-search-drawer-trigger]')) {
        event.preventDefault();
        this.open();
      }
    };
    document.addEventListener('click', this.handleSearchTrigger);

    this.handleKeydown = (event) => {
      if (event.key === 'Escape' && this.isOpen) this.close();
    };
    document.addEventListener('keydown', this.handleKeydown);

    this.addEventListener('click', (event) => {
      if (event.target.closest('[data-search-drawer-close]')) {
        this.close();
        return;
      }

      if (this.isOpen && !event.target.closest('[data-search-drawer-panel]')) {
        this.close();
      }
    });

    this.clearBtn?.addEventListener('click', () => this.clearInput());
    this.input?.addEventListener('input', () => this.handleInput());
  }

  disconnectedCallback() {
    document.removeEventListener('click', this.handleSearchTrigger);
    document.removeEventListener('keydown', this.handleKeydown);
    clearTimeout(this.debounceTimer);
    clearTimeout(this.hideTimer);
    this.removeTrapFocus();
    if (this.isOpen) OverlayUtils.unlockScroll(this);
  }

  open() {
    if (this.isOpen) return;

    // A close() within the last transition still has its hide pending —
    // cancel it, or it would hide the drawer that is reopening now.
    clearTimeout(this.hideTimer);

    this.previousActiveElement = document.activeElement;
    this.hidden = false;
    this.isOpen = true;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this.isOpen) return;

        this.panel?.classList.remove('translate-x-full');
        this.panel?.classList.add('translate-x-0');
        OverlayUtils.lockScroll(this);
        this.setAttribute('aria-hidden', 'false');
        this.removeTrapFocus();
        if (this.panel) this.releaseFocusTrap = OverlayUtils.trapFocus(this.panel, { initialFocus: this.input });
        this.dispatchEvent(new CustomEvent('search-drawer:open', { bubbles: true }));
      });
    });
  }

  close() {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.removeTrapFocus();
    clearTimeout(this.debounceTimer);
    this.panel?.classList.remove('translate-x-0');
    this.panel?.classList.add('translate-x-full');
    OverlayUtils.unlockScroll(this);
    this.setAttribute('aria-hidden', 'true');

    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.hidden = true;

      const element = this.previousActiveElement;
      const isFocusable =
        element?.isConnected &&
        (typeof element.checkVisibility !== 'function' ||
          element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));

      if (isFocusable) element.focus();
    }, SEARCH_DRAWER_TRANSITION_DURATION);
  }

  removeTrapFocus() {
    this.releaseFocusTrap?.();
    this.releaseFocusTrap = null;
  }

  handleInput() {
    const query = this.input.value;
    const hasValue = query.length > 0;

    this.updateFieldState(hasValue);

    clearTimeout(this.debounceTimer);

    if (query.length < this.minCharacters) {
      this.dispatchEvent(new CustomEvent('search-drawer:query', { bubbles: true, detail: { query: '' } }));
      return;
    }

    this.debounceTimer = setTimeout(() => {
      this.dispatchEvent(new CustomEvent('search-drawer:query', { bubbles: true, detail: { query } }));
    }, this.debounceDelay);
  }

  updateFieldState(hasValue) {
    this.clearBtn.hidden = !hasValue;
    this.input.classList.toggle('text-search-value', hasValue);
    this.input.classList.toggle('font-medium', hasValue);
    this.input.classList.toggle('text-sm', !hasValue);
    this.input.classList.toggle('font-normal', !hasValue);
    this.fieldRow?.classList.toggle('border-foreground', hasValue);
    this.fieldRow?.classList.toggle('border-foreground/50', !hasValue);
  }

  // Programmatic equivalent of typing a term: mirrors handleInput's visual
  // state but skips the debounce, since a selected suggestion is already a
  // complete, deliberate query rather than an in-progress keystroke.
  selectTerm(term) {
    if (!this.input) return;

    clearTimeout(this.debounceTimer);
    this.input.value = term;
    this.input.focus();

    const hasValue = term.length > 0;
    this.updateFieldState(hasValue);

    this.dispatchEvent(new CustomEvent('search-drawer:query', { bubbles: true, detail: { query: term } }));
  }

  clearInput() {
    clearTimeout(this.debounceTimer);
    this.input.value = '';
    this.updateFieldState(false);
    this.input.focus();
    this.dispatchEvent(new CustomEvent('search-drawer:query', { bubbles: true, detail: { query: '' } }));
  }
}

if (!customElements.get('search-drawer')) {
  customElements.define('search-drawer', SearchDrawer);
}
