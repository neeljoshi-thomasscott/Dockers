const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const DESKTOP_QUERY = '(min-width: 768px)';
const COLLAPSED_STEP = -1;

class AboutEditorialSplit extends HTMLElement {
  connectedCallback() {
    this._list = this.querySelector('[data-editorial-split-list]');
    this._cards = [...this.querySelectorAll('[data-editorial-split-card]')];
    this._sequence = this._cards.filter(({ dataset }) => dataset.editorialSplitIndex !== undefined);
    this._steps = this._sequence.length;
    this._expandable = this._sequence.filter((card) => card.querySelector('[data-editorial-split-body]'));

    if (!this._list || this._steps < 2) return;

    this._fadeMs = Number(this.dataset.fadeMs) || 0;
    this._desktopQuery = window.matchMedia(DESKTOP_QUERY);
    this._reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    this._isDesktop = this._desktopQuery.matches;
    this._current = null;
    this._pending = null;
    this._transition = null;
    this._isFading = false;
    this._frame = null;
    this._timers = [];
    this._position = { step: COLLAPSED_STEP, fraction: 0 };
    this._viewportWidth = window.innerWidth;

    this._onScroll = this._onScroll.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onModeChange = this._onModeChange.bind(this);
    this._onBlockSelect = this._onBlockSelect.bind(this);

    this.setAttribute('data-editorial-split-ready', '');

    window.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onResize);
    this._desktopQuery.addEventListener('change', this._onModeChange);
    this.addEventListener('shopify:block:select', this._onBlockSelect);

    this._measure();
    this._update({ instant: true });
  }

  disconnectedCallback() {
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
    this._desktopQuery?.removeEventListener('change', this._onModeChange);
    this.removeEventListener('shopify:block:select', this._onBlockSelect);
    cancelAnimationFrame(this._frame);
    for (const timer of this._timers ?? []) clearTimeout(timer);
    document.documentElement.removeAttribute('data-editorial-split-direction');
  }

  _onScroll() {
    if (this._frame) return;

    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this._update();
    });
  }

  _onResize() {
    if (this._desktopQuery.matches !== this._isDesktop) {
      this._onModeChange();
      return;
    }

    const { step, fraction } = this._position;
    const widthChanged = window.innerWidth !== this._viewportWidth;
    this._viewportWidth = window.innerWidth;
    this._measure();

    if (this._isDesktop && widthChanged && step >= 0) this._scrollToStep(step + fraction);

    this._update({ instant: true });
  }

  _onModeChange() {
    if (this._desktopQuery.matches === this._isDesktop) return;

    this._isDesktop = this._desktopQuery.matches;
    this._resetState();
    this._measure();
    this._update({ instant: true });
  }

  _onBlockSelect(event) {
    const card = event.target.closest('[data-editorial-split-index]');
    if (!card) return;

    const index = Number(card.dataset.editorialSplitIndex);

    if (this._isDesktop) {
      this._scrollToStep(index + 0.5);
      return;
    }

    this.setAttribute('data-editorial-split-instant', '');
    this._scrollCardToHeader(card);
    this._updateOpenCards();
    this._scrollCardToHeader(card);
    this._updateOpenCards();
    requestAnimationFrame(() => this.removeAttribute('data-editorial-split-instant'));
  }

  _scrollCardToHeader(card) {
    const cardTop = card.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: cardTop - this._stickyTop + 1, behavior: 'instant' });
  }

  _resetState() {
    const transition = this._transition;
    this._transition = null;
    transition?.skipTransition();
    document.documentElement.removeAttribute('data-editorial-split-direction');
    for (const timer of this._timers) clearTimeout(timer);
    this._timers = [];
    this._isFading = false;
    this._pending = null;
    this._current = null;
    this._position = { step: COLLAPSED_STEP, fraction: 0 };

    this.removeAttribute('data-editorial-split-pinned');
    this._list.removeAttribute('data-editorial-split-fading');
    this._clearEntering();

    for (const card of this._cards) {
      card.removeAttribute('data-editorial-split-active');
      card.removeAttribute('data-editorial-split-open');
      card.hidden = false;
    }
  }

  _measure() {
    this._stickyTop = parseFloat(getComputedStyle(this._list).top) || 0;
    this._stepHeight = this.offsetHeight / (this._steps + 1);
  }

  _scrollToStep(position) {
    const absoluteTop = this.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: absoluteTop - this._stickyTop + position * this._stepHeight, behavior: 'instant' });
  }

  _update({ instant = false } = {}) {
    if (!this._isDesktop) {
      this._updateOpenCards();
      return;
    }

    const progress = this._stickyTop - this.getBoundingClientRect().top;

    if (progress < 0) {
      this._position = { step: COLLAPSED_STEP, fraction: 0 };
    } else {
      const step = Math.min(this._steps - 1, Math.floor(progress / this._stepHeight));
      const fraction = Math.min(1, (progress - step * this._stepHeight) / this._stepHeight);
      this._position = { step, fraction };
    }

    this._show(this._position.step, { instant });
  }

  _updateOpenCards() {
    for (const card of this._expandable) {
      card.toggleAttribute('data-editorial-split-open', card.getBoundingClientRect().top <= this._stickyTop);
    }
  }

  _show(step, { instant }) {
    if (step === (this._pending ?? this._current) || this._isFading) return;

    if (instant || this._current === null || this._reducedMotionQuery.matches) {
      const transition = this._transition;
      this._transition = null;
      this._pending = null;
      transition?.skipTransition();
      this._apply(step);
      return;
    }

    if (document.startViewTransition) {
      this._morph(step);
      return;
    }

    if (this._fadeMs === 0) {
      this._apply(step);
      return;
    }

    this._isFading = true;
    this._timers = [];
    this._list.setAttribute('data-editorial-split-fading', '');

    this._timers.push(
      setTimeout(() => {
        this._apply(step);
        this._list.removeAttribute('data-editorial-split-fading');
      }, this._fadeMs),
      setTimeout(() => {
        this._isFading = false;
        this._update();
      }, this._fadeMs * 2),
    );
  }

  _morph(step) {
    const from = this._pending ?? this._current;
    const visibleBefore = this._visibleImages(from);
    document.documentElement.setAttribute('data-editorial-split-direction', step > from ? 'forward' : 'back');
    this._clearEntering();

    this._pending = step;
    const transition = document.startViewTransition(() => {
      if (this._transition !== transition) return;

      this._apply(step);
      this._markEntering(step, visibleBefore);
    });
    this._transition = transition;

    transition.finished.finally(() => {
      if (this._transition !== transition) return;

      this._clearEntering();
      document.documentElement.removeAttribute('data-editorial-split-direction');
      this._transition = null;
      this._pending = null;
    });
  }

  _visibleImages(step) {
    if (step === COLLAPSED_STEP) return new Set(this._sequence.map((_, index) => index));

    return new Set([step, (step + 1) % this._steps]);
  }

  _markEntering(step, visibleBefore) {
    const entering = [];

    if (step === COLLAPSED_STEP) {
      for (const card of this._sequence) {
        entering.push([Number(card.dataset.editorialSplitIndex), card.querySelector('[data-editorial-split-media]')]);
      }
    } else {
      const card = this._sequence.find(({ dataset }) => Number(dataset.editorialSplitIndex) === step);
      entering.push([step, card?.querySelector('[data-editorial-split-media]')]);
      entering.push([(step + 1) % this._steps, card?.querySelector('[data-editorial-split-peek]')]);
    }

    for (const [index, element] of entering) {
      if (element && !visibleBefore.has(index)) element.setAttribute('data-editorial-split-unnamed', '');
    }
  }

  _clearEntering() {
    for (const element of this.querySelectorAll('[data-editorial-split-unnamed]')) {
      element.removeAttribute('data-editorial-split-unnamed');
    }
  }

  _apply(step) {
    const isPinned = step !== COLLAPSED_STEP;
    this.toggleAttribute('data-editorial-split-pinned', isPinned);

    for (const card of this._cards) {
      const { editorialSplitIndex } = card.dataset;
      const isActive = isPinned && editorialSplitIndex !== undefined && Number(editorialSplitIndex) === step;
      card.toggleAttribute('data-editorial-split-active', isActive);
      card.hidden = isPinned && !isActive;
    }

    this._current = step;
  }
}

if (!customElements.get('about-editorial-split')) {
  customElements.define('about-editorial-split', AboutEditorialSplit);
}
