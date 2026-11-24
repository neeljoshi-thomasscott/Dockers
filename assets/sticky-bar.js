const STICKY_BAR_TOLERANCE = 1;

class StickyBar extends HTMLElement {
  connectedCallback() {
    this.handleViewportChange = () => {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.update();
      });
    };
    window.addEventListener('scroll', this.handleViewportChange, { passive: true });
    window.addEventListener('resize', this.handleViewportChange, { passive: true });

    this.update();
  }

  disconnectedCallback() {
    window.removeEventListener('scroll', this.handleViewportChange);
    window.removeEventListener('resize', this.handleViewportChange);
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  update() {
    const stickyTop = parseFloat(getComputedStyle(this).top) || 0;
    const { top } = this.getBoundingClientRect();
    const isStuck = window.scrollY > 0 && Math.abs(top - stickyTop) < STICKY_BAR_TOLERANCE;
    this.toggleAttribute('data-stuck', isStuck);
  }
}

if (!customElements.get('sticky-bar')) {
  customElements.define('sticky-bar', StickyBar);
}
