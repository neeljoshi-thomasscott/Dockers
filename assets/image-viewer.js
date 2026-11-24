import EmblaCarousel from './embla-carousel.js';

const MOBILE_QUERY = '(max-width: 767px)';

class ImageViewer extends HTMLElement {
  connectedCallback() {
    this._dialog = this.querySelector('[data-image-viewer-dialog]');
    this._stack = this.querySelector('[data-image-viewer-stack]');
    if (!this._dialog || !this._stack) return;

    this._slides = [...this.querySelectorAll('[data-image-viewer-slide]')];
    this._thumbnails = [...this.querySelectorAll('[data-image-viewer-thumbnail]')];
    this._triggerElement = null;
    this._mobileQuery = window.matchMedia(MOBILE_QUERY);

    this._handleOpenViewer = (event) => {
      const { mediaId } = event.detail;

      this._triggerElement = event.target;

      if (!this._dialog.open) {
        this._dialog.showModal();
      }

      this._goTo(mediaId, false);
    };

    document.addEventListener('gallery:open-viewer', this._handleOpenViewer);

    for (const closeButton of this.querySelectorAll('[data-image-viewer-close]')) {
      closeButton.addEventListener('click', () => this._dialog.close());
    }

    this._handleDialogClose = () => {
      if (typeof this._triggerElement?.focus === 'function') {
        this._triggerElement.focus();
      }
    };
    this._dialog.addEventListener('close', this._handleDialogClose);

    for (const thumbnail of this._thumbnails) {
      thumbnail.addEventListener('click', () => this._goTo(thumbnail.dataset.mediaId, true));
    }

    this._handleQueryChange = () => {
      if (!this._mobileQuery.matches) this._destroyCarousel();
    };
    this._mobileQuery.addEventListener('change', this._handleQueryChange);

    this._intersectionRatios = new Map();

    this._observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          this._intersectionRatios.set(entry.target, entry.intersectionRatio);
        }
        if (this._emblaApi) return;

        let mostVisibleSlide = null;
        let highestRatio = 0;
        for (const [slide, ratio] of this._intersectionRatios) {
          if (ratio > highestRatio) {
            highestRatio = ratio;
            mostVisibleSlide = slide;
          }
        }

        if (mostVisibleSlide) this._setActiveThumbnail(mostVisibleSlide.dataset.mediaId);
      },
      { root: this._stack, threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] }
    );

    for (const slide of this._slides) {
      this._observer.observe(slide);
    }
  }

  disconnectedCallback() {
    this._observer?.disconnect();
    this._mobileQuery?.removeEventListener('change', this._handleQueryChange);
    document.removeEventListener('gallery:open-viewer', this._handleOpenViewer);
    this._destroyCarousel();
  }

  // Mobile swipes the images sideways in a loop; desktop keeps the vertical
  // stack. The carousel is built on first open because the closed dialog has
  // no width to measure.
  _goTo(mediaId, animate) {
    const index = Math.max(
      0,
      this._slides.findIndex((slide) => slide.dataset.mediaId === mediaId)
    );

    if (this._mobileQuery.matches) {
      this._ensureCarousel();
      this._emblaApi.scrollTo(index, !animate);
      this._setActiveThumbnail(this._slides[index]?.dataset.mediaId);
      return;
    }

    this._slides[index]?.scrollIntoView({ block: 'start', behavior: animate ? 'smooth' : 'auto' });
  }

  _ensureCarousel() {
    if (this._emblaApi) {
      this._emblaApi.reInit();
      return;
    }

    this._emblaApi = EmblaCarousel(this._stack, {
      loop: this._slides.length > 1,
      align: 'start',
      watchDrag: this._slides.length > 1,
    });

    this._emblaApi.on('select', () => {
      const slide = this._emblaApi.slideNodes()[this._emblaApi.selectedScrollSnap()];
      this._setActiveThumbnail(slide?.dataset.mediaId);
    });
  }

  _destroyCarousel() {
    this._emblaApi?.destroy();
    this._emblaApi = null;
  }

  _setActiveThumbnail(mediaId) {
    if (!mediaId) return;
    for (const thumbnail of this._thumbnails) {
      thumbnail.dataset.active = String(thumbnail.dataset.mediaId === mediaId);
    }
  }
}

if (!customElements.get('image-viewer')) {
  customElements.define('image-viewer', ImageViewer);
}
