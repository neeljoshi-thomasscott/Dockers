import EmblaCarousel from './embla-carousel.js';

const WHEEL_THRESHOLD = 30;
const WHEEL_LOCK_MS = 450;

const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
};

class CollectionCarousel extends HTMLElement {
  connectedCallback() {
    const viewport = this.querySelector('[data-carousel-viewport]');
    const track = this.querySelector('[data-carousel-track]');

    if (!viewport || !track || track.children.length === 0) return;

    const loop = this.dataset.loop === 'true';
    const { activeFrom } = this.dataset;

    this._wheelDelta = 0;
    this._wheelLocked = false;
    this._handleWheel = (event) => {
      if (!this._emblaApi || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      if (this._wheelLocked) return;

      this._wheelDelta += event.deltaX;
      if (Math.abs(this._wheelDelta) < WHEEL_THRESHOLD) return;

      if (this._wheelDelta > 0) {
        this._emblaApi.scrollNext();
      } else {
        this._emblaApi.scrollPrev();
      }
      this._wheelDelta = 0;
      this._wheelLocked = true;
      setTimeout(() => {
        this._wheelLocked = false;
      }, WHEEL_LOCK_MS);
    };
    viewport.addEventListener('wheel', this._handleWheel, { passive: false });

    if (!activeFrom) {
      this._emblaApi = EmblaCarousel(viewport, { loop });
      return;
    }

    const breakpoint = BREAKPOINTS[activeFrom] ?? BREAKPOINTS.lg;
    this._mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    this._mqListener = (event) => {
      if (event.matches) {
        this._emblaApi = EmblaCarousel(viewport, { loop });
      } else {
        this._emblaApi?.destroy();
        this._emblaApi = null;
      }
    };
    this._mq.addEventListener('change', this._mqListener);

    if (this._mq.matches) {
      this._emblaApi = EmblaCarousel(viewport, { loop });
    }
  }

  disconnectedCallback() {
    this._emblaApi?.destroy();
    this._mq?.removeEventListener('change', this._mqListener);
  }
}

if (!customElements.get('collection-carousel')) {
  customElements.define('collection-carousel', CollectionCarousel);
}
