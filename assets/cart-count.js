class CartCount extends HTMLElement {
  connectedCallback() {
    document.addEventListener('cart:count-change', this.onCountChange);
  }

  disconnectedCallback() {
    document.removeEventListener('cart:count-change', this.onCountChange);
  }

  onCountChange = (event) => {
    const count = Number(event.detail?.itemCount) || 0;
    this.textContent = String(Math.min(count, 99));
    this.classList.toggle('hidden', count === 0);
    this.classList.toggle('flex', count > 0);
  };
}

if (!customElements.get('cart-count')) customElements.define('cart-count', CartCount);
