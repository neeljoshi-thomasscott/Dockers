import EmblaCarousel from './embla-carousel.js';

const AUTOPLAY_INTERVAL_FALLBACK = 5;

class HeroBannerCarousel extends HTMLElement {
  connectedCallback() {
    const viewport = this.querySelector('[data-hero-carousel-viewport]');
    const track = this.querySelector('[data-hero-carousel-track]');

    if (!viewport || !track || track.children.length === 0) return;

    this._emblaApi = EmblaCarousel(viewport, { loop: true });

    const autoplay = this.dataset.autoplay === 'true';
    const autoplayInterval = Number(this.dataset.autoplayInterval) || AUTOPLAY_INTERVAL_FALLBACK;
    this._playing = autoplay;

    // css-standards' custom-property exception, not the "no element.style.*"
    // rule it sits next to: these are custom properties, not width/transform
    // literal styling — base.css owns the actual geometry off of them.
    this.style.setProperty('--hero-carousel-interval', `${autoplayInterval}s`);

    const dots = [...this.querySelectorAll('[data-hero-carousel-dot]')];

    const syncIndicator = () => {
      const selectedIndex = this._emblaApi.selectedScrollSnap();

      dots.forEach((dot, index) => {
        dot.classList.toggle('is-active', index === selectedIndex);
        dot.querySelector('[data-hero-carousel-thumb]')?.classList.remove('is-animating');
      });
    };

    const restartThumb = () => {
      if (!this._playing) return;

      const activeThumb = dots[this._emblaApi.selectedScrollSnap()]?.querySelector('[data-hero-carousel-thumb]');
      if (!activeThumb) return;

      activeThumb.classList.remove('is-animating');
      void activeThumb.offsetWidth;
      activeThumb.classList.add('is-animating');
    };

    this._emblaApi.on('init', syncIndicator);
    this._emblaApi.on('init', () => {
      if (autoplay) this._startAutoplay();
    });
    this._emblaApi.on('reInit', syncIndicator);
    this._emblaApi.on('select', () => {
      syncIndicator();
      this._startAutoplay();
    });

    this._startAutoplay = () => {
      clearTimeout(this._autoplayTimer);
      if (!this._playing) return;

      this._autoplayTimer = setTimeout(() => this._emblaApi.scrollNext(), autoplayInterval * 1000);
      restartThumb();
    };

    this._stopAutoplay = () => {
      clearTimeout(this._autoplayTimer);
      dots[this._emblaApi.selectedScrollSnap()]?.querySelector('[data-hero-carousel-thumb]')?.classList.remove('is-animating');
    };

    const toggle = this.querySelector('[data-hero-carousel-toggle]');
    if (toggle) {
      const iconPause = this.querySelector('[data-hero-carousel-icon-pause]');
      const iconPlay = this.querySelector('[data-hero-carousel-icon-play]');

      toggle.addEventListener('click', () => {
        this._playing = !this._playing;
        toggle.setAttribute('aria-pressed', this._playing);
        toggle.setAttribute('aria-label', this._playing ? 'Pause autoplay' : 'Play autoplay');
        iconPause?.classList.toggle('hidden', !this._playing);
        iconPlay?.classList.toggle('hidden', this._playing);

        if (this._playing) {
          this._startAutoplay();
        } else {
          this._stopAutoplay();
        }
      });
    }
  }

  disconnectedCallback() {
    this._emblaApi?.destroy();
    clearTimeout(this._autoplayTimer);
  }
}

if (!customElements.get('hero-banner-carousel')) {
  customElements.define('hero-banner-carousel', HeroBannerCarousel);
}
