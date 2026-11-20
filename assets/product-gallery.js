import EmblaCarousel from './embla-carousel.js';

const AUTOPLAY_INTERVAL_FALLBACK = 5;

class ProductGallery extends HTMLElement {
  connectedCallback() {
    const viewport = this.querySelector('[data-product-gallery-viewport]');
    const track = this.querySelector('[data-product-gallery-track]');

    if (!viewport || !track || track.children.length === 0) return;

    this._track = track;
    this._deferredLoaded = false;

    // This gallery can sit nested inside a parent carousel (e.g.
    // clp-product-row's collection-carousel). Embla binds its drag-start
    // listeners directly on each carousel's own viewport element, and
    // touchstart/mousedown bubble — so without stopping them here, swiping
    // a card's own image gallery also bubbles up and drags the parent row.
    const stopNestedCarouselDrag = (event) => event.stopPropagation();
    viewport.addEventListener('touchstart', stopNestedCarouselDrag);
    viewport.addEventListener('mousedown', stopNestedCarouselDrag);

    // Snap per slide in every view (column, grid and row) so the progress bar
    // reads as a tab strip: the track is split into one segment per snap
    // position and the segment advances a whole step per image, never
    // drifting continuously with the drag.
    this._emblaApi = EmblaCarousel(viewport, {
      loop: this.dataset.loop === 'true',
      align: 'start',
      containScroll: 'trimSnaps',
    });

    const progressThumb = this.querySelector('[data-product-gallery-progress-thumb]');
    if (progressThumb) {
      // Custom properties only — base.css derives the thumb's geometry from them.
      const syncProgress = () => {
        progressThumb.style.setProperty('--gallery-progress-steps', this._emblaApi.scrollSnapList().length);
        progressThumb.style.setProperty('--gallery-progress-index', this._emblaApi.selectedScrollSnap());
      };

      this._emblaApi.on('init', syncProgress);
      this._emblaApi.on('reInit', syncProgress);
      this._emblaApi.on('select', syncProgress);
    }

    this._loadDeferredImages = () => {
      if (this._deferredLoaded) return;
      this._deferredLoaded = true;

      for (const image of this._track.querySelectorAll('img[data-src]')) {
        image.src = image.dataset.src;
        if (image.dataset.srcset) image.srcset = image.dataset.srcset;
        delete image.dataset.src;
        delete image.dataset.srcset;
      }
    };

    this._emblaApi.on('pointerDown', this._loadDeferredImages);
    this._emblaApi.on('select', this._loadDeferredImages);
    this._emblaApi.on('pointerDown', () => clearInterval(this._autoplayTimer));

    const autoplay = this.dataset.autoplay === 'true';
    const autoplayInterval = Number(this.dataset.autoplayInterval) || AUTOPLAY_INTERVAL_FALLBACK;

    if (autoplay && this._emblaApi.slideNodes().length > 1) {
      this._autoplayTimer = setInterval(() => this._emblaApi.scrollNext(), autoplayInterval * 1000);
    }

    this._bindHoverSwap(viewport);

    for (const slide of this._track.querySelectorAll('[data-gallery-media-id]')) {
      slide.addEventListener('click', (event) => {
        const { galleryMediaId } = event.currentTarget.dataset;
        event.currentTarget.dispatchEvent(
          new CustomEvent('gallery:open-viewer', { bubbles: true, detail: { mediaId: galleryMediaId } })
        );
      });
    }
  }

  // Desktop product cards: hovering the image shows the second image and
  // leaving restores the first. Only on devices with a real hover pointer, so
  // touch keeps the swipe-only behaviour. Uses Embla's own scrollTo so the
  // progress track stays in sync. If the shopper drags or swipes while
  // hovering, their position is kept on leave.
  //
  // Image 2 is deferred (data-src) like every non-first slide, so it is
  // preloaded once the card nears the viewport, and the swap waits until it
  // has decoded — otherwise the first hover shows an empty slide.
  _bindHoverSwap(viewport) {
    if (!this.hasAttribute('data-hover-swap')) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (this._emblaApi.scrollSnapList().length < 2) return;

    this._hoverSwapped = false;
    this._hovering = false;

    this._preloadObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this._preloadObserver.disconnect();
        this._loadSecondImage();
      },
      { rootMargin: '300px 0px' }
    );
    this._preloadObserver.observe(this);

    viewport.addEventListener('mouseenter', async () => {
      this._hovering = true;
      if (this._emblaApi.selectedScrollSnap() !== 0) return;
      clearInterval(this._autoplayTimer);

      await this._loadSecondImage();
      if (!this._hovering || this._emblaApi.selectedScrollSnap() !== 0) return;

      this._emblaApi.scrollTo(1, true);
      this._hoverSwapped = true;
    });

    viewport.addEventListener('mouseleave', () => {
      this._hovering = false;
      if (!this._hoverSwapped) return;
      this._hoverSwapped = false;
      this._emblaApi.scrollTo(0, true);
    });

    this._emblaApi.on('pointerDown', () => {
      this._hoverSwapped = false;
    });
  }

  // Starts loading slide 2's image (if still deferred) and resolves once it
  // can paint. Resolves on error too, so a broken image never blocks hover.
  _loadSecondImage() {
    if (this._secondImageReady) return this._secondImageReady;

    const image = this._track.children[1]?.querySelector('img');
    if (!image) return (this._secondImageReady = Promise.resolve());

    if (image.dataset.src) {
      if (image.dataset.srcset) image.srcset = image.dataset.srcset;
      image.src = image.dataset.src;
      delete image.dataset.src;
      delete image.dataset.srcset;
    }
    // Lazy images outside the viewport never start loading on their own.
    image.loading = 'eager';

    this._secondImageReady =
      image.complete && image.naturalWidth > 0
        ? Promise.resolve()
        : image.decode().catch(
            () =>
              new Promise((resolve) => {
                if (image.complete) return resolve();
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
              })
          );

    return this._secondImageReady;
  }

  // Matched by media id rather than image URL — slide URLs are rendered at a
  // different width (and protocol form) than any variant image URL, so a URL
  // comparison can never match. Galleries whose slides carry no media id
  // (product cards) are left untouched.
  setActiveMedia(mediaId) {
    if (!this._emblaApi || !mediaId) return;

    const slides = [...this._track.children];
    const matchIndex = slides.findIndex((slide) => slide.dataset.galleryMediaId === String(mediaId));
    if (matchIndex === -1) return;

    this._loadDeferredImages?.();
    this._emblaApi.scrollTo(matchIndex);
  }

  disconnectedCallback() {
    this._emblaApi?.destroy();
    this._preloadObserver?.disconnect();
    clearInterval(this._autoplayTimer);
  }
}

if (!customElements.get('product-gallery')) {
  customElements.define('product-gallery', ProductGallery);
}
