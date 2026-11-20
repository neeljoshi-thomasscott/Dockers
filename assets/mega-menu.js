const MEGA_MENU_TRANSITION_DURATION = 300;
const MEGA_MENU_HOVER_CLOSE_DELAY = 150;
const MEGA_MENU_DESKTOP_QUERY = '(min-width: 1024px)';

class MegaMenu extends HTMLElement {
  constructor() {
    super();
    this.activeTabIndex = null;
    this.closeTimer = null;
    this.isDrawerOpen = false;
    this.previousActiveElement = null;
    this.releaseFocusTrap = null;
    this.panelHideTimer = null;
    this.drawerHideTimer = null;
    this.suppressFocusOpen = false;
  }

  connectedCallback() {
    this.scrim = this.querySelector('[data-mega-menu-scrim]');
    this.drawer = this.querySelector('[data-mega-menu-drawer]');
    this.desktopRoot = this.querySelector('[data-mega-menu-desktop]');
    this.header = document.getElementById('main-header');

    this.handleKeydown = (event) => this._onKeydown(event);
    document.addEventListener('keydown', this.handleKeydown);

    this._wireTabTriggers();
    this._wireGroup2Triggers();
    this._wireLeafTriggers();
    this._wireContentWrapper();
    this._wireDesktopPanels();
    this._wireScrim();

    this.addEventListener('click', (event) => {
      if (event.target.closest('[data-mega-menu-back]')) this._closeDrill();
    });

    this.handleHamburgerClick = (event) => {
      if (event.target.closest('[data-mega-menu-open]')) {
        event.preventDefault();
        if (this.isDrawerOpen) {
          this._closeDrawerMobile();
        } else {
          this._openDrawerMobile();
        }
      }
    };
    document.addEventListener('click', this.handleHamburgerClick);

    // Menu promo images are lazy, so they only start loading once the drawer
    // opens. Kick them off on the first touch of the hamburger instead.
    this.handleHamburgerIntent = (event) => {
      if (!event.target.closest('[data-mega-menu-open]')) return;
      document.removeEventListener('pointerdown', this.handleHamburgerIntent, true);
      this._preloadDrawerImages();
    };
    document.addEventListener('pointerdown', this.handleHamburgerIntent, true);

    this.handleResize = () => {
      if (this.activeTabIndex !== null || this.isDrawerOpen) this._measureHeaderOffset();
    };
    window.addEventListener('resize', this.handleResize);

    // The drawer is lg:hidden, so widening past the breakpoint while it's
    // open would hide it but leave its scroll lock and open state behind.
    this.desktopQuery = window.matchMedia(MEGA_MENU_DESKTOP_QUERY);
    this.handleBreakpointChange = (event) => {
      if (event.matches && this.isDrawerOpen) this._closeDrawerMobile();
    };
    this.desktopQuery.addEventListener('change', this.handleBreakpointChange);
  }

  _preloadDrawerImages() {
    for (const image of this.querySelectorAll('[data-mega-menu-drawer] img[loading="lazy"]')) {
      image.loading = 'eager';
    }
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('click', this.handleHamburgerClick);
    document.removeEventListener('pointerdown', this.handleHamburgerIntent, true);
    window.removeEventListener('resize', this.handleResize);
    this.desktopQuery?.removeEventListener('change', this.handleBreakpointChange);
    clearTimeout(this.panelHideTimer);
    clearTimeout(this.drawerHideTimer);
    this._removeTrapFocus();
    if (this.isDrawerOpen) OverlayUtils.unlockScroll(this);
  }

  _measureHeaderOffset() {
    if (!this.header) return;
    const bottom = this.header.getBoundingClientRect().bottom;
    this.style.setProperty('--mega-menu-header-bottom', `${bottom}px`);
  }

  _wireDesktopPanels() {
    if (!this.desktopRoot) return;

    for (const panel of this.desktopRoot.querySelectorAll('[data-mega-menu-panel]')) {
      panel.addEventListener('mouseenter', () => this._cancelCloseTimer());
      panel.addEventListener('mouseleave', () => this._scheduleDesktopClose());
      panel.addEventListener('focusin', () => this._cancelCloseTimer());
      panel.addEventListener('focusout', () => this._scheduleDesktopClose());
    }
  }

  _wireScrim() {
    if (!this.scrim) return;

    this.scrim.addEventListener('mouseenter', () => {
      if (this._isDesktop()) this._scheduleDesktopClose();
    });
    this.scrim.addEventListener('click', () => {
      if (this._isDesktop()) this._closeAllDesktop();
    });
  }

  _isDesktop() {
    return window.matchMedia(MEGA_MENU_DESKTOP_QUERY).matches;
  }

  _wireTabTriggers() {
    for (const trigger of document.querySelectorAll('[data-mega-menu-trigger]')) {
      const tabIndex = trigger.dataset.megaMenuTrigger;

      trigger.addEventListener('mouseenter', () => {
        if (this._isDesktop()) this._openTabDesktop(tabIndex);
      });
      trigger.addEventListener('mouseleave', () => {
        if (this._isDesktop()) this._scheduleDesktopClose();
      });
      trigger.addEventListener('focus', () => {
        if (this.suppressFocusOpen) return;
        if (this._isDesktop()) this._openTabDesktop(tabIndex);
      });
      // Mobile has no hover, so the tab row is click-driven there: tapping a tab
      // swaps the drawer panel instead of following the hover flyout path.
      trigger.addEventListener('click', (event) => {
        if (this._isDesktop()) return;
        event.preventDefault();
        this._openTabMobile(tabIndex);
      });
    }
  }

  _wireGroup2Triggers() {
    for (const trigger of this.querySelectorAll('[data-mega-menu-group2-trigger]')) {
      const key = trigger.dataset.megaMenuGroup2Trigger;

      trigger.addEventListener('mouseenter', () => {
        if (this._isDesktop()) this._onGroup2Enter(trigger, key);
      });
      trigger.addEventListener('focus', () => {
        if (this._isDesktop()) this._onGroup2Enter(trigger, key);
      });
      trigger.addEventListener('mouseleave', () => {
        if (this._isDesktop()) this._scheduleTrack2Revert(trigger.closest('[data-mega-menu-panel]'));
      });
    }

    for (const trigger of this.querySelectorAll('[data-mega-menu-cat-trigger]')) {
      const key = trigger.dataset.megaMenuCatTrigger;

      trigger.addEventListener('click', (event) => {
        if (!this._isDesktop()) {
          event.preventDefault();
          this._openDrill(key);
        }
      });
    }
  }

  _wireLeafTriggers() {
    for (const trigger of this.querySelectorAll('[data-mega-menu-leaf-trigger]')) {
      trigger.addEventListener('mouseenter', () => {
        if (this._isDesktop()) this._onLeafEnter(trigger);
      });
      trigger.addEventListener('focus', () => {
        if (this._isDesktop()) this._onLeafEnter(trigger);
      });
      trigger.addEventListener('mouseleave', () => {
        if (this._isDesktop()) this._scheduleTrack2Revert(trigger.closest('[data-mega-menu-panel]'));
      });
    }
  }

  _wireContentWrapper() {
    for (const wrapper of this.querySelectorAll('[data-mega-menu-content-wrapper]')) {
      wrapper.addEventListener('mouseenter', () => {
        if (this._isDesktop()) this._cancelTrack2Timer(wrapper.closest('[data-mega-menu-panel]'));
      });
      wrapper.addEventListener('mouseleave', () => {
        if (this._isDesktop()) this._scheduleTrack2Revert(wrapper.closest('[data-mega-menu-panel]'));
      });
    }
  }

  _onKeydown(event) {
    if (event.key !== 'Escape') return;

    if (this.isDrawerOpen) {
      this._closeDrawerMobile();
      return;
    }

    if (this.activeTabIndex !== null) {
      const trigger = document.querySelector(`[data-mega-menu-trigger="${this.activeTabIndex}"]`);
      this._closeAllDesktop();
      // Focus returns to the tab, but that focus must not reopen the flyout
      // the visitor just dismissed (focus fires synchronously inside focus()).
      this.suppressFocusOpen = true;
      trigger?.focus();
      this.suppressFocusOpen = false;
    }
  }

  _cancelCloseTimer() {
    clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }

  _scheduleDesktopClose() {
    this._cancelCloseTimer();
    this.closeTimer = setTimeout(() => this._closeAllDesktop(), MEGA_MENU_HOVER_CLOSE_DELAY);
  }

  _openTabDesktop(tabIndex) {
    this._cancelCloseTimer();
    if (this.activeTabIndex === tabIndex) return;

    // A close within the last transition still has its panel hide pending —
    // cancel it, or it would hide the panel being opened now and strand the scrim.
    clearTimeout(this.panelHideTimer);

    this._measureHeaderOffset();

    if (this.activeTabIndex !== null) this._setTriggerBold(this.activeTabIndex, false);
    this._setTriggerBold(tabIndex, true);

    for (const panel of this.desktopRoot?.querySelectorAll('[data-mega-menu-panel]') ?? []) {
      const isTarget = panel.dataset.megaMenuPanel === tabIndex;
      panel.hidden = !isTarget;
      if (isTarget) this._resetTrack2(panel);
    }
    this.activeTabIndex = tabIndex;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.scrim?.classList.remove('opacity-0', 'bg-black/0', 'pointer-events-none');
        this.scrim?.classList.add('opacity-100', 'bg-black/40', 'pointer-events-auto');
      });
    });
  }

  // A current-page trigger (data-mega-menu-current) stays bold after the hover ends.
  _setTriggerBold(tabIndex, isActive) {
    const trigger = document.querySelector(`[data-mega-menu-trigger="${tabIndex}"]`);
    if (!trigger) return;

    if (isActive) {
      trigger.classList.add('font-bold');
      trigger.classList.remove('font-medium');
    } else if (trigger.dataset.megaMenuCurrent !== 'true') {
      trigger.classList.add('font-medium');
      trigger.classList.remove('font-bold');
    }
  }

  _closeAllDesktop() {
    if (this.activeTabIndex === null) return;

    this.scrim?.classList.remove('opacity-100', 'bg-black/40', 'pointer-events-auto');
    this.scrim?.classList.add('opacity-0', 'bg-black/0', 'pointer-events-none');

    const closingIndex = this.activeTabIndex;
    this.activeTabIndex = null;
    this._setTriggerBold(closingIndex, false);

    const closingPanel = this.desktopRoot?.querySelector(`[data-mega-menu-panel="${closingIndex}"]`);
    this._cancelTrack2Timer(closingPanel);

    clearTimeout(this.panelHideTimer);
    this.panelHideTimer = setTimeout(() => {
      if (closingPanel) closingPanel.hidden = true;
    }, MEGA_MENU_TRANSITION_DURATION);
  }

  _cancelTrack2Timer(panel) {
    if (!panel) return;
    clearTimeout(panel._megaMenuTrack2Timer);
    panel._megaMenuTrack2Timer = null;
  }

  _scheduleTrack2Revert(panel) {
    if (!panel) return;
    this._cancelTrack2Timer(panel);
    panel._megaMenuTrack2Timer = setTimeout(() => this._resetTrack2(panel), MEGA_MENU_HOVER_CLOSE_DELAY);
  }

  _setTrack2Default(panel) {
    const tabIndex = panel.dataset.megaMenuPanel;
    const wrapper = panel.querySelector(`[data-mega-menu-content-wrapper="${tabIndex}"]`);
    // Tabs with no nav-tab block have nothing of their own to show (no promos, no
    // categories) — keep the content column collapsed instead of un-hiding an empty one.
    if (wrapper) wrapper.hidden = !('megaMenuHasOwnContent' in panel.dataset);
    const defaultDiv = panel.querySelector(`[data-mega-menu-promo-default="${tabIndex}"]`);
    if (defaultDiv) defaultDiv.hidden = false;
    for (const category of panel.querySelectorAll('[data-mega-menu-category]')) {
      category.hidden = true;
    }
  }

  _setTrack2Category(panel, key) {
    const tabIndex = panel.dataset.megaMenuPanel;
    const wrapper = panel.querySelector(`[data-mega-menu-content-wrapper="${tabIndex}"]`);
    if (wrapper) wrapper.hidden = false;
    const defaultDiv = panel.querySelector(`[data-mega-menu-promo-default="${tabIndex}"]`);
    if (defaultDiv) defaultDiv.hidden = true;
    for (const category of panel.querySelectorAll('[data-mega-menu-category]')) {
      category.hidden = category.dataset.megaMenuCategory !== key;
    }
  }

  _setTrack2Closed(panel) {
    const tabIndex = panel.dataset.megaMenuPanel;
    const wrapper = panel.querySelector(`[data-mega-menu-content-wrapper="${tabIndex}"]`);
    if (wrapper) wrapper.hidden = true;
  }

  _resetTrack2(panel) {
    this._cancelTrack2Timer(panel);
    this._setTrack2Default(panel);
    for (const sibling of panel.querySelectorAll('[data-mega-menu-group2-trigger]')) {
      sibling.classList.remove('opacity-60');
    }
  }

  _onGroup2Enter(trigger, key) {
    const panel = trigger.closest('[data-mega-menu-panel]');
    if (!panel) return;
    this._cancelTrack2Timer(panel);

    for (const sibling of panel.querySelectorAll('[data-mega-menu-group2-trigger]')) {
      sibling.classList.toggle('opacity-60', sibling !== trigger);
    }

    if (panel.querySelector(`[data-mega-menu-category="${key}"]`)) {
      this._setTrack2Category(panel, key);
    } else {
      this._setTrack2Closed(panel);
    }
  }

  _onLeafEnter(trigger) {
    const panel = trigger.closest('[data-mega-menu-panel]');
    if (!panel) return;
    this._cancelTrack2Timer(panel);
    this._setTrack2Closed(panel);
  }

  _openDrawerMobile() {
    if (!this.drawer) return;

    this._measureHeaderOffset();
    this.header?.classList.add('is-menu-open');

    clearTimeout(this.drawerHideTimer);
    this.previousActiveElement = document.activeElement;
    this.drawer.hidden = false;
    this.isDrawerOpen = true;
    this._setDrawerToggleExpanded(true);

    if (this.activeTabIndex === null && this.drawer.dataset.megaMenuInitialTab) {
      this._openTabMobile(this.drawer.dataset.megaMenuInitialTab);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this.isDrawerOpen) return;

        this.drawer.classList.remove('-translate-y-full');
        this.drawer.classList.add('translate-y-0');
        OverlayUtils.lockScroll(this);
        this.drawer.setAttribute('aria-hidden', 'false');
        this._trapFocus();
      });
    });
  }

  _closeDrawerMobile() {
    if (!this.drawer) return;

    this.isDrawerOpen = false;
    this._setDrawerToggleExpanded(false);
    this.header?.classList.remove('is-menu-open');
    this._removeTrapFocus();
    this.drawer.classList.remove('translate-y-0');
    this.drawer.classList.add('-translate-y-full');
    OverlayUtils.unlockScroll(this);
    this.drawer.setAttribute('aria-hidden', 'true');

    this._resetMobilePanels();
    this.activeTabIndex = null;

    clearTimeout(this.drawerHideTimer);
    this.drawerHideTimer = setTimeout(() => {
      this.drawer.hidden = true;
      this.previousActiveElement?.focus?.();
    }, MEGA_MENU_TRANSITION_DURATION);
  }

  // The hamburger lives in header-mobile.liquid, outside this element.
  _setDrawerToggleExpanded(isExpanded) {
    for (const toggle of document.querySelectorAll('[data-mega-menu-open]')) {
      toggle.setAttribute('aria-expanded', String(isExpanded));
    }
  }

  _resetMobilePanels() {
    for (const drill of this.querySelectorAll('[data-mega-menu-drill]')) {
      drill.hidden = true;
    }
    for (const toplevel of this.querySelectorAll('[data-mega-menu-toplevel]')) {
      toplevel.hidden = false;
    }
    const tabRow = this.drawer?.querySelector('[data-mega-menu-tab-row]');
    if (tabRow) tabRow.hidden = false;
  }

  _openTabMobile(tabIndex) {
    if (!this.isDrawerOpen) this._openDrawerMobile();

    for (const panel of this.drawer.querySelectorAll('[data-mega-menu-panel]')) {
      panel.hidden = panel.dataset.megaMenuPanel !== tabIndex;
    }
    this._resetMobilePanels();
    this._setActiveMobileTab(tabIndex);
    this.activeTabIndex = tabIndex;
  }

  _setActiveMobileTab(tabIndex) {
    for (const tab of this.drawer?.querySelectorAll('[data-mega-menu-tab]') ?? []) {
      const isActive = tab.dataset.megaMenuTab === tabIndex;
      tab.classList.toggle('font-bold', isActive);
      tab.classList.toggle('font-medium', !isActive);
      tab.classList.toggle('opacity-60', !isActive);
    }
  }

  _openDrill(key) {
    const [tabIndex] = key.split('-');
    const panel = this.drawer?.querySelector(`[data-mega-menu-panel="${tabIndex}"]`);
    if (!panel) return;

    const toplevel = panel.querySelector('[data-mega-menu-toplevel]');
    if (toplevel) toplevel.hidden = true;

    const tabRow = this.drawer?.querySelector('[data-mega-menu-tab-row]');
    if (tabRow) tabRow.hidden = true;

    for (const drill of panel.querySelectorAll('[data-mega-menu-drill]')) {
      drill.hidden = drill.dataset.megaMenuDrill !== key;
    }
  }

  _closeDrill() {
    if (this.activeTabIndex === null) return;

    const panel = this.drawer?.querySelector(`[data-mega-menu-panel="${this.activeTabIndex}"]`);
    if (!panel) return;

    const toplevel = panel.querySelector('[data-mega-menu-toplevel]');
    if (toplevel) toplevel.hidden = false;

    const tabRow = this.drawer?.querySelector('[data-mega-menu-tab-row]');
    if (tabRow) tabRow.hidden = false;

    for (const drill of panel.querySelectorAll('[data-mega-menu-drill]')) {
      drill.hidden = true;
    }
  }

  // Trapped to the whole header, not just the drawer: the hamburger that
  // toggles the drawer closed lives in the header bar, outside the drawer,
  // and must stay reachable by Tab. Hidden desktop-only header parts are
  // skipped because the trap only counts visible elements.
  _trapFocus() {
    this._removeTrapFocus();
    const container = this.header ?? this.drawer;
    this.releaseFocusTrap = OverlayUtils.trapFocus(container, {
      initialFocus: this.drawer.querySelector('a[href], button:not([disabled])'),
    });
  }

  _removeTrapFocus() {
    this.releaseFocusTrap?.();
    this.releaseFocusTrap = null;
  }
}

if (!customElements.get('mega-menu')) {
  customElements.define('mega-menu', MegaMenu);
}
