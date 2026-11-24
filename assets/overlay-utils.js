// Shared by every overlay (cart drawer, search drawer, mobile menu, filter
// drawer, sort overlay, quick-add sheet). Loaded from core-assets.liquid ahead
// of them.

const OVERLAY_FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const isOverlayElementVisible = (element) =>
  typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ checkVisibilityCSS: true })
    : element.getClientRects().length > 0;

const getVisibleFocusables = (container) =>
  [...container.querySelectorAll(OVERLAY_FOCUSABLE_SELECTORS)].filter(isOverlayElementVisible);

// The focusable set is recomputed on every Tab rather than captured once at
// open: overlay content changes while open (search results replace the
// fallback grid, the mobile menu drills into hidden panels, cart lines are
// removed), and a first/last element captured earlier can end up hidden —
// the browser then skips it and focus walks out of the dialog.
//
// Listens on document, not the container, so a Tab pressed while focus has
// somehow already left the container still pulls it back in. Traps stack:
// only the most recently opened one acts (e.g. the cart drawer opened from
// inside the search drawer), so two traps never fight over the same Tab.
const focusTrapStack = [];

const trapFocus = (container, { initialFocus } = {}) => {
  const handleKeydown = (event) => {
    if (event.key !== 'Tab') return;
    if (focusTrapStack[focusTrapStack.length - 1] !== handleKeydown) return;

    const focusables = getVisibleFocusables(container);
    if (!focusables.length) {
      event.preventDefault();
      return;
    }

    const firstFocusable = focusables[0];
    const lastFocusable = focusables[focusables.length - 1];
    const { activeElement } = document;
    const focusIsInside = container.contains(activeElement);

    if (event.shiftKey && (activeElement === firstFocusable || !focusIsInside)) {
      event.preventDefault();
      lastFocusable.focus();
    } else if (!event.shiftKey && (activeElement === lastFocusable || !focusIsInside)) {
      event.preventDefault();
      firstFocusable.focus();
    }
  };

  focusTrapStack.push(handleKeydown);
  document.addEventListener('keydown', handleKeydown);
  (initialFocus ?? getVisibleFocusables(container)[0])?.focus();

  return () => {
    document.removeEventListener('keydown', handleKeydown);
    const stackIndex = focusTrapStack.indexOf(handleKeydown);
    if (stackIndex !== -1) focusTrapStack.splice(stackIndex, 1);
  };
};

// Several overlays can be open at once (quick-add inside the search drawer),
// so the body lock is owned: it only lifts once every owner has released it,
// instead of the first overlay to close unlocking the page behind the rest.
const scrollLockOwners = new Set();

const lockScroll = (owner) => {
  scrollLockOwners.add(owner);
  document.body.classList.add('overflow-hidden');
};

const unlockScroll = (owner) => {
  scrollLockOwners.delete(owner);
  if (scrollLockOwners.size === 0) document.body.classList.remove('overflow-hidden');
};

window.OverlayUtils = { trapFocus, lockScroll, unlockScroll };
