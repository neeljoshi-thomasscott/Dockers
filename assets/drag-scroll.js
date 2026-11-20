const DRAG_THRESHOLD = 5;
const SETTLE_FALLBACK = 600;

class DragScroll extends HTMLElement {
  connectedCallback() {
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onDragStart = (event) => event.preventDefault();

    this.addEventListener('pointerdown', this._onPointerDown);
    this.addEventListener('pointermove', this._onPointerMove);
    this.addEventListener('pointerup', this._onPointerUp);
    this.addEventListener('pointercancel', this._onPointerUp);
    this.addEventListener('click', this._onClick, true);
    this.addEventListener('dragstart', this._onDragStart);

    this._resizeObserver = new ResizeObserver(() => {
      this.toggleAttribute('data-scrollable', this.scrollWidth > this.clientWidth);
    });
    this._resizeObserver.observe(this);
  }

  disconnectedCallback() {
    this.removeEventListener('pointerdown', this._onPointerDown);
    this.removeEventListener('pointermove', this._onPointerMove);
    this.removeEventListener('pointerup', this._onPointerUp);
    this.removeEventListener('pointercancel', this._onPointerUp);
    this.removeEventListener('click', this._onClick, true);
    this.removeEventListener('dragstart', this._onDragStart);
    this._resizeObserver?.disconnect();
    clearTimeout(this._settleTimer);
  }

  _onPointerDown(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !this.hasAttribute('data-scrollable')) return;

    this._pointerId = event.pointerId;
    this._startX = event.clientX;
    this._startScroll = this.scrollLeft;
    this._isDragging = false;
  }

  _onPointerMove(event) {
    if (event.pointerId !== this._pointerId) return;

    const deltaX = event.clientX - this._startX;

    if (!this._isDragging) {
      if (Math.abs(deltaX) < DRAG_THRESHOLD) return;
      this._isDragging = true;
      clearTimeout(this._settleTimer);
      this.setPointerCapture(event.pointerId);
      this.setAttribute('data-dragging', '');
    }

    this.scrollLeft = this._startScroll - deltaX;
  }

  _onPointerUp(event) {
    if (event.pointerId !== this._pointerId) return;

    this._pointerId = null;
    if (!this._isDragging) return;

    this._isDragging = false;

    this._suppressClick = true;
    setTimeout(() => {
      this._suppressClick = false;
    }, 0);

    this.scrollTo({ left: this._nearestItemPosition(), behavior: 'smooth' });

    const settle = () => {
      clearTimeout(this._settleTimer);
      this.removeEventListener('scrollend', settle);
      this.removeAttribute('data-dragging');
    };
    this.addEventListener('scrollend', settle, { once: true });
    this._settleTimer = setTimeout(settle, SETTLE_FALLBACK);
  }

  _onClick(event) {
    if (!this._suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
  }

  _nearestItemPosition() {
    const { scrollLeft } = this;
    const maxScroll = this.scrollWidth - this.clientWidth;
    const viewportLeft = this.getBoundingClientRect().left;
    const positions = [...this.querySelectorAll('[data-drag-scroll-item]')].map((item) =>
      Math.min(scrollLeft + item.getBoundingClientRect().left - viewportLeft, maxScroll)
    );

    return positions.reduce(
      (closest, position) => (Math.abs(position - scrollLeft) < Math.abs(closest - scrollLeft) ? position : closest),
      positions[0] ?? scrollLeft
    );
  }
}

if (!customElements.get('drag-scroll')) {
  customElements.define('drag-scroll', DragScroll);
}
