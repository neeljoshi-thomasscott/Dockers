const initAccordions = () => {
  const accordions = document.querySelectorAll('[data-accordion]');

  for (const accordion of accordions) {
    const trigger = accordion.querySelector('[data-accordion-trigger]');
    const content = accordion.querySelector('[data-accordion-content]');
    const iconElement = accordion.querySelector('[data-accordion-icon]');

    if (!trigger || !content) continue;
    if (trigger.dataset.accordionInitialized === 'true') continue;
    trigger.dataset.accordionInitialized = 'true';

    const iconType = iconElement?.dataset.accordionIconType ?? 'plus-minus';
    const iconPlus = accordion.querySelector('[data-accordion-icon-plus]');
    const iconMinus = accordion.querySelector('[data-accordion-icon-minus]');
    const isOpen = trigger.getAttribute('aria-expanded') === 'true';

    if (isOpen) {
      content.style.maxHeight = `${content.scrollHeight}px`;
      updateIcon(iconType, iconElement, iconPlus, iconMinus, true);
    } else {
      content.style.maxHeight = '0px';
      updateIcon(iconType, iconElement, iconPlus, iconMinus, false);
      toggleFocusable(content, false);
    }

    trigger.addEventListener('click', () => {
      const newState = trigger.getAttribute('aria-expanded') !== 'true';

      if (newState) closeGroupSiblings(accordion);
      setAccordionState(accordion, newState);
    });

    initStaticBreakpoint(accordion, trigger, content, { iconType, iconElement, iconPlus, iconMinus });
  }
};

// Accordions rendered with static_from are forced open by CSS at that width;
// this keeps aria-expanded/aria-hidden and link focusability in sync with it
// (open, with the inert trigger out of the tab order, at that width).
const initStaticBreakpoint = (accordion, trigger, content, icons) => {
  const { accordionStaticFrom } = accordion.dataset;
  if (!accordionStaticFrom) return;

  const staticQuery = window.matchMedia(accordionStaticFrom);
  let isStaticOpen = false;

  const applyBreakpoint = () => {
    if (staticQuery.matches === isStaticOpen) return;
    isStaticOpen = staticQuery.matches;

    trigger.setAttribute('aria-expanded', String(isStaticOpen));
    content.setAttribute('aria-hidden', String(!isStaticOpen));
    toggleFocusable(content, isStaticOpen);
    content.style.maxHeight = isStaticOpen ? `${content.scrollHeight}px` : '0px';
    updateIcon(icons.iconType, icons.iconElement, icons.iconPlus, icons.iconMinus, isStaticOpen);

    if (isStaticOpen) {
      trigger.setAttribute('tabindex', '-1');
    } else {
      trigger.removeAttribute('tabindex');
    }
  };

  applyBreakpoint();
  staticQuery.addEventListener('change', applyBreakpoint);
};

const setAccordionState = (accordion, isOpen) => {
  const trigger = accordion.querySelector('[data-accordion-trigger]');
  const content = accordion.querySelector('[data-accordion-content]');
  const iconElement = accordion.querySelector('[data-accordion-icon]');
  if (!trigger || !content) return;

  trigger.setAttribute('aria-expanded', isOpen);
  content.setAttribute('aria-hidden', !isOpen);
  toggleFocusable(content, isOpen);
  content.style.maxHeight = isOpen ? `${content.scrollHeight}px` : '0px';

  updateIcon(
    iconElement?.dataset.accordionIconType ?? 'plus-minus',
    iconElement,
    accordion.querySelector('[data-accordion-icon-plus]'),
    accordion.querySelector('[data-accordion-icon-minus]'),
    isOpen
  );
};

const closeGroupSiblings = (accordion) => {
  const { accordionGroup } = accordion.dataset;
  if (!accordionGroup) return;

  for (const sibling of document.querySelectorAll(`[data-accordion-group="${CSS.escape(accordionGroup)}"]`)) {
    if (sibling === accordion) continue;
    if (sibling.querySelector('[data-accordion-trigger]')?.getAttribute('aria-expanded') !== 'true') continue;

    setAccordionState(sibling, false);
  }
};

const updateIcon = (type, iconElement, iconPlus, iconMinus, isOpen) => {
  if (type === 'chevron' && iconElement) {
    if (isOpen) {
      iconElement.classList.add('rotate-180');
    } else {
      iconElement.classList.remove('rotate-180');
    }
    return;
  }

  if (iconPlus) {
    if (isOpen) {
      iconPlus.classList.add('hidden');
    } else {
      iconPlus.classList.remove('hidden');
    }
  }

  if (iconMinus) {
    if (isOpen) {
      iconMinus.classList.remove('hidden');
    } else {
      iconMinus.classList.add('hidden');
    }
  }
};

const toggleFocusable = (container, isOpen) => {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const elements = container.querySelectorAll(selectors);

  for (const element of elements) {
    if (isOpen) {
      const original = element.dataset.originalTabindex;
      if (original !== undefined) {
        if (original === 'null' || original === '') {
          element.removeAttribute('tabindex');
        } else {
          element.setAttribute('tabindex', original);
        }
        delete element.dataset.originalTabindex;
      }
      continue;
    }

    const currentTabindex = element.getAttribute('tabindex');
    element.dataset.originalTabindex = currentTabindex ?? 'null';
    element.setAttribute('tabindex', '-1');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.fonts?.ready) {
    document.fonts.ready.then(initAccordions);
  } else {
    initAccordions();
  }
});

const accordionObserver = new MutationObserver(() => {
  initAccordions();
});

accordionObserver.observe(document.body, {
  childList: true,
  subtree: true,
});
