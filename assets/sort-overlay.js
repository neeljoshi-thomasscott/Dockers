const SORT_OVERLAY_TRANSITION_DURATION = 300;

class SortOverlay extends HTMLElement {
  constructor() {
    super();
    this.isOpen = false;
    this.previousActiveElement = null;
    this.releaseFocusTrap = null;
  }

  connectedCallback() {
    this.panel = this.querySelector('[data-sort-overlay-panel]');
    this.scrim = this.querySelector('[data-sort-overlay-scrim]');
    this.toolbar = this.closest('[data-collection-toolbar], [data-blog-toolbar]');

    this.handleOpenRequest = () => (this.isOpen ? this.close() : this.open());
    document.addEventListener('toolbar:open-sort', this.handleOpenRequest);

    this.handleOutsideClick = (event) => {
      if (!this.isOpen) return;
      if (this.contains(event.target) || event.target.closest('[data-sort-trigger]')) return;
      this.close({ restoreFocus: false });
    };
    document.addEventListener('click', this.handleOutsideClick);

    this.handleKeydown = (event) => {
      if (event.key === 'Escape' && this.isOpen) this.close();
    };
    document.addEventListener('keydown', this.handleKeydown);

    // The toolbar section is never re-rendered by collection-controller.js
    // (only the listing is morphed), so the selected radio has to be moved
    // client-side or it stays on whatever the server first painted.
    // A URL with no sort_by (e.g. Back to the unsorted page) means the
    // listing's default sort, so that option is re-selected rather than
    // leaving the previous choice checked.
    this.handlePopState = () =>
      this.setSelected(new URLSearchParams(window.location.search).get('sort_by') ?? this.dataset.defaultSort);
    window.addEventListener('popstate', this.handlePopState);

    this.addEventListener('click', (event) => {
      if (event.target.closest('[data-sort-overlay-close]') || event.target.closest('[data-sort-overlay-scrim]')) {
        this.close();
        return;
      }

      const option = event.target.closest('[data-sort-overlay-option]');
      if (!option) return;

      event.preventDefault();
      const { sortOverlayValue } = option.dataset;
      this.setSelected(sortOverlayValue);
      this.dispatchEvent(new CustomEvent('sort:change', { bubbles: true, detail: { value: sortOverlayValue } }));
      this.close();
    });
  }

  disconnectedCallback() {
    document.removeEventListener('toolbar:open-sort', this.handleOpenRequest);
    document.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('click', this.handleOutsideClick);
    window.removeEventListener('popstate', this.handlePopState);
    clearTimeout(this.lowerToolbarTimer);
    this.removeTrapFocus();
    if (this.isOpen) OverlayUtils.unlockScroll(this);
  }

  setSelected(sortValue) {
    if (!sortValue) return;

    // The radio ring and dot are styled off aria-checked in sort-overlay.liquid
    // (group-aria-checked: variants), so the attribute is the only state to set.
    for (const option of this.querySelectorAll('[data-sort-overlay-option]')) {
      option.setAttribute('aria-checked', String(option.dataset.sortOverlayValue === sortValue));
    }
  }

  open() {
    this.previousActiveElement = document.activeElement;
    this.isOpen = true;

    // The sticky toolbar caps this overlay's stacking; lifting it while open is
    // what lets the mobile scrim cover the sticky header (see collection-toolbar.liquid).
    clearTimeout(this.lowerToolbarTimer);
    this.toolbar?.setAttribute('data-overlay-open', '');
    this.classList.remove('pointer-events-none');
    this.panel?.classList.add('pointer-events-auto');
    this.panel?.classList.remove('translate-y-full', 'md:opacity-0', 'md:pointer-events-none', 'md:scale-95');
    this.panel?.classList.add('translate-y-0', 'md:opacity-100', 'md:scale-100');
    this.scrim?.classList.remove('opacity-0', 'pointer-events-none');
    this.scrim?.classList.add('opacity-100', 'pointer-events-auto');

    // On desktop the sort is a small dropdown, so the page stays scrollable.
    if (!window.matchMedia('(min-width: 768px)').matches) OverlayUtils.lockScroll(this);
    this.trapFocus();
  }

  close({ restoreFocus = true } = {}) {
    this.isOpen = false;

    this.classList.add('pointer-events-none');
    this.panel?.classList.remove('pointer-events-auto', 'translate-y-0', 'md:opacity-100', 'md:scale-100');
    this.panel?.classList.add('translate-y-full', 'md:opacity-0', 'md:pointer-events-none', 'md:scale-95');
    this.scrim?.classList.remove('opacity-100', 'pointer-events-auto');
    this.scrim?.classList.add('opacity-0', 'pointer-events-none');

    OverlayUtils.unlockScroll(this);
    this.removeTrapFocus();
    if (restoreFocus) this.previousActiveElement?.focus();

    // Lowered only once the scrim's fade-out ends — dropping it at once would
    // put the header back above a scrim that is still visibly fading.
    clearTimeout(this.lowerToolbarTimer);
    this.lowerToolbarTimer = setTimeout(() => {
      this.toolbar?.removeAttribute('data-overlay-open');
    }, SORT_OVERLAY_TRANSITION_DURATION);
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

if (!customElements.get('sort-overlay')) {
  customElements.define('sort-overlay', SortOverlay);
}
