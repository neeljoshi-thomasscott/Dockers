import EmblaCarousel from './embla-carousel.js';

const MOBILE_QUERY = '(max-width: 767px)';
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const CLICK_SCALE = 2;
const BUTTON_STEP = 1;
const DOUBLE_TAP_MS = 300;

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

    this._initZoom();

    this._handleDialogClose = () => {
      this._resetZoom();
      if (typeof this._triggerElement?.focus === 'function') {
        this._triggerElement.focus();
      }
    };
    this._dialog.addEventListener('close', this._handleDialogClose);

    for (const thumbnail of this._thumbnails) {
      thumbnail.addEventListener('click', () => {
        this._resetZoom();
        this._goTo(thumbnail.dataset.mediaId, true);
      });
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
      watchDrag: () => this._slides.length > 1 && this._zoom.scale === MIN_SCALE && !this._zoom.pinch,
    });

    this._emblaApi.on('select', () => {
      this._resetZoom();
      const slide = this._emblaApi.slideNodes()[this._emblaApi.selectedScrollSnap()];
      this._setActiveThumbnail(slide?.dataset.mediaId);
    });
  }

  _destroyCarousel() {
    this._emblaApi?.destroy();
    this._emblaApi = null;
  }

  _initZoom() {
    this._zoom = { target: null, scale: MIN_SCALE, x: 0, y: 0, pinch: null, pan: null, lastTap: 0, pointer: null };
    this._zoomInButton = this.querySelector('[data-image-viewer-zoom-in]');
    this._zoomOutButton = this.querySelector('[data-image-viewer-zoom-out]');

    this._zoomInButton?.addEventListener('click', () => this._stepZoom(BUTTON_STEP));
    this._zoomOutButton?.addEventListener('click', () => this._stepZoom(-BUTTON_STEP));

    this._stack.addEventListener('click', (event) => {
      const target = event.target.closest('[data-image-viewer-zoom-target]');
      if (!target || this._mobileQuery.matches) return;
      this._zoom.pointer = { x: event.clientX, y: event.clientY };
      this._setZoom(target, this._zoom.scale > MIN_SCALE ? MIN_SCALE : CLICK_SCALE);
    });

    this._stack.addEventListener('mousemove', (event) => {
      this._zoom.pointer = { x: event.clientX, y: event.clientY };
      if (this._zoom.scale > MIN_SCALE && !this._mobileQuery.matches) this._followPointer();
    });

    this._stack.addEventListener(
      'wheel',
      (event) => {
        const target = event.target.closest('[data-image-viewer-slide]')?.querySelector('[data-image-viewer-zoom-target]');
        if (!target) return;
        if (!event.ctrlKey && this._zoom.scale === MIN_SCALE) return;

        event.preventDefault();
        this._zoom.pointer = { x: event.clientX, y: event.clientY };
        const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
        const base = this._zoom.target === target ? this._zoom.scale : MIN_SCALE;
        this._setZoom(target, base * factor, { x: event.clientX, y: event.clientY });
      },
      { passive: false }
    );

    this._stack.addEventListener('touchstart', (event) => this._onTouchStart(event), { passive: false });
    this._stack.addEventListener('touchmove', (event) => this._onTouchMove(event), { passive: false });
    this._stack.addEventListener('touchend', (event) => this._onTouchEnd(event));
    this._stack.addEventListener('touchcancel', (event) => this._onTouchEnd(event));
  }

  _onTouchStart(event) {
    const target = event.target.closest('[data-image-viewer-zoom-target]');
    if (!target) return;

    if (event.touches.length === 2) {
      event.preventDefault();
      const [a, b] = event.touches;
      const base = this._zoom.target === target ? this._zoom.scale : MIN_SCALE;
      this._zoom.pinch = { target, distance: this._distance(a, b), scale: base };
      this._zoom.pan = null;
      return;
    }

    if (event.touches.length === 1 && this._zoom.scale > MIN_SCALE && this._zoom.target === target) {
      const [touch] = event.touches;
      this._zoom.pan = { startX: touch.clientX, startY: touch.clientY, x: this._zoom.x, y: this._zoom.y };
    }
  }

  _onTouchMove(event) {
    const { pinch, pan } = this._zoom;

    if (pinch && event.touches.length === 2) {
      event.preventDefault();
      const [a, b] = event.touches;
      const center = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      this._setZoom(pinch.target, (pinch.scale * this._distance(a, b)) / pinch.distance, center);
      return;
    }

    if (pan && event.touches.length === 1) {
      event.preventDefault();
      const [touch] = event.touches;
      this._zoom.x = pan.x + touch.clientX - pan.startX;
      this._zoom.y = pan.y + touch.clientY - pan.startY;
      this._applyZoom();
    }
  }

  _onTouchEnd(event) {
    if (event.touches.length < 2) this._zoom.pinch = null;
    if (event.touches.length === 0) this._zoom.pan = null;
    if (event.type !== 'touchend' || event.touches.length > 0 || event.changedTouches.length !== 1) return;

    const target = event.target.closest('[data-image-viewer-zoom-target]');
    if (!target) return;

    const now = Date.now();
    if (now - this._zoom.lastTap < DOUBLE_TAP_MS) {
      const [touch] = event.changedTouches;
      this._zoom.lastTap = 0;
      if (this._zoom.scale > MIN_SCALE) {
        this._resetZoom();
      } else {
        this._setZoom(target, CLICK_SCALE, { x: touch.clientX, y: touch.clientY });
      }
      return;
    }
    this._zoom.lastTap = now;
  }

  _distance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
  }

  _activeZoomTarget() {
    if (this._zoom.target) return this._zoom.target;
    const slide = this._slides.find((item) => item.dataset.mediaId === this._activeMediaId) || this._slides[0];
    return slide?.querySelector('[data-image-viewer-zoom-target]') || null;
  }

  _stepZoom(step) {
    const target = this._activeZoomTarget();
    if (!target) return;
    const center = this._zoomOrigin(target);
    this._zoom.pointer = null;
    this._setZoom(target, this._zoom.scale + step, { x: center.x - this._zoom.x, y: center.y - this._zoom.y });
  }

  _zoomOrigin(target) {
    const rect = target.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  // Keeps the image point under `focus` fixed while the scale changes.
  // Desktop mouse zoom instead lets _followPointer place the image.
  _setZoom(target, nextScale, focus) {
    if (this._zoom.target && this._zoom.target !== target) this._resetZoom();

    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    const previous = this._zoom.scale;
    this._zoom.target = target;

    if (focus && (this._mobileQuery.matches || !this._zoom.pointer)) {
      const origin = this._zoomOrigin(target);
      const centerX = origin.x - this._zoom.x;
      const centerY = origin.y - this._zoom.y;
      const offsetX = focus.x - centerX;
      const offsetY = focus.y - centerY;
      this._zoom.x = offsetX - ((offsetX - this._zoom.x) * scale) / previous;
      this._zoom.y = offsetY - ((offsetY - this._zoom.y) * scale) / previous;
    }

    this._zoom.scale = scale;

    if (scale === MIN_SCALE) {
      this._resetZoom();
      return;
    }

    if (!this._mobileQuery.matches && this._zoom.pointer) {
      this._followPointer();
      return;
    }

    this._applyZoom();
  }

  _followPointer() {
    const { target, pointer, scale } = this._zoom;
    if (!target || !pointer) return;
    const origin = this._zoomOrigin(target);
    const width = target.offsetWidth;
    const height = target.offsetHeight;
    const left = origin.x - this._zoom.x - width / 2;
    const top = origin.y - this._zoom.y - height / 2;
    const fractionX = Math.min(1, Math.max(0, (pointer.x - left) / width));
    const fractionY = Math.min(1, Math.max(0, (pointer.y - top) / height));
    this._zoom.x = (0.5 - fractionX) * (scale - 1) * width;
    this._zoom.y = (0.5 - fractionY) * (scale - 1) * height;
    this._applyZoom();
  }

  _applyZoom() {
    const { target, scale } = this._zoom;
    if (!target) return;

    const maxX = ((scale - 1) * target.offsetWidth) / 2;
    const maxY = ((scale - 1) * target.offsetHeight) / 2;
    this._zoom.x = Math.min(maxX, Math.max(-maxX, this._zoom.x));
    this._zoom.y = Math.min(maxY, Math.max(-maxY, this._zoom.y));

    target.style.setProperty('--zoom-scale', scale);
    target.style.setProperty('--zoom-x', `${this._zoom.x}px`);
    target.style.setProperty('--zoom-y', `${this._zoom.y}px`);
    target.dataset.zoomed = 'true';
    this._stack.dataset.zoomed = 'true';
    this._syncZoomButtons();
  }

  _resetZoom() {
    const { target } = this._zoom || {};
    if (target) {
      target.style.removeProperty('--zoom-scale');
      target.style.removeProperty('--zoom-x');
      target.style.removeProperty('--zoom-y');
      delete target.dataset.zoomed;
    }
    if (!this._zoom) return;
    Object.assign(this._zoom, { target: null, scale: MIN_SCALE, x: 0, y: 0, pinch: null, pan: null });
    delete this._stack.dataset.zoomed;
    this._syncZoomButtons();
  }

  _syncZoomButtons() {
    if (this._zoomInButton) this._zoomInButton.disabled = this._zoom.scale >= MAX_SCALE;
    if (this._zoomOutButton) this._zoomOutButton.disabled = this._zoom.scale <= MIN_SCALE;
  }

  _setActiveThumbnail(mediaId) {
    if (!mediaId) return;
    this._activeMediaId = mediaId;
    for (const thumbnail of this._thumbnails) {
      thumbnail.dataset.active = String(thumbnail.dataset.mediaId === mediaId);
    }
  }
}

if (!customElements.get('image-viewer')) {
  customElements.define('image-viewer', ImageViewer);
}
