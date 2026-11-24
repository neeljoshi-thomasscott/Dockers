const VIEW_CYCLE = ['column', 'grid', 'row'];
const VIEW_LABELS = { column: 'Column', grid: 'Grid', row: 'Row' };
const UPDATE_DEBOUNCE = 200;

// Section keys as they appear in every collection/search template's JSON.
const LISTING_SECTION_ID = 'collection-listing';
const TOOLBAR_SECTION_ID = 'collection-toolbar';

// Pre-triggers the next-page fetch before the load-more link is actually
// on screen, so the next batch is ready by the time the user reaches it.
const LOAD_MORE_ROOT_MARGIN = '600px 0px';

// Where the page should sit once a swap has replaced the grid.
//
// Preserving the raw offset is right once the visitor is actually reading
// products, but not while they are still in the band above the first product
// row: the site header is `sticky top-0`, so any partial offset there leaves
// the collection title and the toolbar's tag-pill row half-tucked underneath
// it, and the swap makes that arbitrary position look like a layout bug. In
// that band the page is sent back to the very top instead, so the header,
// description and pill row land exactly where the design puts them.
const resolveTargetScrollY = (savedScrollY, listingSectionEl) => {
  const listingDocumentTop = listingSectionEl.getBoundingClientRect().top + window.scrollY;
  return savedScrollY < listingDocumentTop ? 0 : savedScrollY;
};

// Idiomorph replaces the whole grid in one pass, so for a moment the old cards
// are gone and the new (not yet laid out) ones occupy almost no space. The
// browser clamps the scroll offset to that briefly-collapsed document height,
// so the offset has to be re-applied once now and again on the next two frames,
// after layout has settled at the new view's height.
const restorePageScroll = (targetScrollY) => {
  const applyScroll = () => {
    const maxScrollY = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
    window.scrollTo(0, Math.min(targetScrollY, maxScrollY));
  };

  applyScroll();
  requestAnimationFrame(() => {
    applyScroll();
    requestAnimationFrame(applyScroll);
  });
};

// Always uses the Section Rendering API, same as performSwap (see below) —
// built from the load-more trigger's own href, which carries a different
// query string (page=N) than the current page's params.
const resolveLoadMoreFetchUrl = (href) => {
  const url = new URL(href, window.location.origin);
  url.searchParams.set('section_id', LISTING_SECTION_ID);
  return `${url.pathname}?${url.searchParams.toString()}`;
};

document.addEventListener('DOMContentLoaded', () => {
  const listingEl = document.querySelector('[data-collection-listing-section]');
  if (!listingEl) return;

  const isSearchTemplate = listingEl.dataset.isSearch === 'true';
  const searchTerms = listingEl.dataset.searchTerms ?? '';

  let currentParams = new URLSearchParams(window.location.search);
  // A collection whose own template isn't a listing (e.g. `men` → clp-men
  // landing page) is only reachable as a PLP through `?view=`. Dropping the
  // param there would fetch the landing page, so once a page arrives with an
  // explicit view, column stays explicit too (templates/collection.column.json).
  const keepExplicitView = currentParams.has('view');
  let updateTimer = null;
  let activeAbortController = null;
  let latestRequestId = 0;

  // Independent from activeAbortController/latestRequestId above — a
  // load-more fetch and a sort/filter/view morph are different operations
  // that can legitimately overlap, and each must be cancellable without
  // aborting the other.
  let loadMoreObserver = null;
  let loadMoreAbortController = null;
  let loadMoreRequestId = 0;
  let loadMoreFetchInFlight = false;

  // Bumped at the start of every sort/filter/view swap; a load-more result
  // from an earlier generation is dropped instead of appended.
  let listingGeneration = 0;
  let swapInFlight = false;

  const updateViewToggle = () => {
    const morphedListingEl = document.querySelector('[data-collection-listing-section]');
    const currentView = morphedListingEl?.dataset.currentView;
    if (!currentView) return;

    const viewToggle = document.querySelector('[data-view-toggle]');
    if (!viewToggle) return;

    viewToggle.dataset.currentView = currentView;
    viewToggle.setAttribute('aria-label', `Change view (current: ${VIEW_LABELS[currentView] ?? currentView})`);

    // classList, not the `hidden` property — `.hidden` doesn't reliably
    // reflect onto inline <svg> elements in every browser, silently leaving
    // the icon stuck on whatever the server originally rendered.
    for (const icon of viewToggle.querySelectorAll('[data-view-icon]')) {
      icon.classList.toggle('hidden', icon.dataset.viewIcon !== currentView);
    }
  };

  // The filter drawer's count lives in the toolbar, which is never morphed
  // (only its pill row is), so it's read from the listing's own
  // data-products-count-text, already rendered and pluralized by the server.
  const updateFilterDrawerCount = () => {
    const morphedListingEl = document.querySelector('[data-collection-listing-section]');
    const countText = morphedListingEl?.dataset.productsCountText;
    if (!countText) return;

    const countEl = document.querySelector('[data-filter-drawer-count]');
    if (countEl) countEl.textContent = countText;

    const headerCountEl = document.querySelector('[data-collection-product-count]');
    if (headerCountEl) headerCountEl.textContent = `(${countText})`;
  };

  // Only the pill row is patched, not the whole toolbar: the filter drawer and
  // sort overlay also live in that section, and morphing them would reset an
  // open drawer mid-interaction. A pill row that exists on only one side
  // (it's conditional on a Category filter) is left as it is.
  // Option counts and greyed-out (zero-result) states come from the fresh
  // toolbar render; only those two things are patched so the drawer's open
  // accordions and the shopper's ticked boxes are left alone.
  const updateFilterDrawerOptions = (toolbarDoc) => {
    const nextOptions = new Map();
    for (const input of toolbarDoc.querySelectorAll('[data-filter-drawer-checkbox]')) {
      nextOptions.set(`${input.name}=${input.value}`, input);
    }

    for (const input of document.querySelectorAll('[data-filter-drawer-checkbox]')) {
      const next = nextOptions.get(`${input.name}=${input.value}`);
      if (!next) continue;

      input.disabled = next.disabled;
      const count = input.closest('label')?.querySelector('[data-filter-drawer-option-count]');
      const nextCount = next.closest('label')?.querySelector('[data-filter-drawer-option-count]');
      if (count && nextCount) count.textContent = nextCount.textContent;
    }
  };

  const updateToolbarPills = (toolbarDoc) => {
    const currentPillsEl = document.querySelector('[data-collection-toolbar-pills]');
    const newPillsEl = toolbarDoc.querySelector('[data-collection-toolbar-pills]');
    if (!currentPillsEl || !newPillsEl) return;

    Idiomorph.morph(currentPillsEl, newPillsEl, { morphStyle: 'outerHTML' });
  };

  const setLoadMoreLoadingState = (loading) => {
    const wrapper = document.querySelector('[data-collection-load-more]');
    wrapper?.querySelector('[data-collection-load-more-trigger]')?.classList.toggle('hidden', loading);
    wrapper?.querySelector('[data-collection-load-more-spinner]')?.classList.toggle('hidden', !loading);
  };

  const stopObservingLoadMoreTrigger = () => {
    loadMoreObserver?.disconnect();
    loadMoreObserver = null;
  };

  // Re-acquires whatever load-more trigger currently exists in the DOM and
  // observes it. Idiomorph can mutate the trigger in place (attribute
  // patching) rather than replace it on a morph, without firing any
  // lifecycle callback we could hook — so this is called fresh after every
  // performSwap and every fetchNextPage, instead of assuming a previously
  // observed node reference is still the right one to watch.
  const observeLoadMoreTrigger = () => {
    stopObservingLoadMoreTrigger();
    const trigger = document.querySelector('[data-collection-load-more-trigger]');
    if (!trigger) return;

    loadMoreObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) fetchNextPage(trigger);
    }, { rootMargin: LOAD_MORE_ROOT_MARGIN });

    loadMoreObserver.observe(trigger);
  };

  const fetchNextPage = async (trigger) => {
    if (loadMoreFetchInFlight || swapInFlight) return;
    loadMoreFetchInFlight = true;

    stopObservingLoadMoreTrigger();
    loadMoreAbortController?.abort();
    const abortController = new AbortController();
    loadMoreAbortController = abortController;
    const requestId = ++loadMoreRequestId;
    const generation = listingGeneration;
    const isStale = () => requestId !== loadMoreRequestId || generation !== listingGeneration;

    setLoadMoreLoadingState(true);

    // The body read is inside the try so an abort mid-download still resets
    // loadMoreFetchInFlight (in finally).
    let html;
    try {
      const response = await fetch(resolveLoadMoreFetchUrl(trigger.href), { signal: abortController.signal });
      if (!response.ok) throw new Error(`Load more failed: ${response.status}`);
      html = await response.text();
    } catch (error) {
      if (error.name !== 'AbortError' && !isStale()) {
        setLoadMoreLoadingState(false);
        observeLoadMoreTrigger();
      }
      return;
    } finally {
      loadMoreFetchInFlight = false;
    }

    if (isStale()) return;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newGrid = doc.querySelector('[data-collection-listing-grid]');
    const currentGrid = document.querySelector('[data-collection-listing-grid]');

    if (!newGrid || !currentGrid) {
      setLoadMoreLoadingState(false);
      return;
    }

    currentGrid.append(...newGrid.children);

    const newTriggerWrapper = doc.querySelector('[data-collection-load-more]');
    const currentTriggerWrapper = document.querySelector('[data-collection-load-more]');

    if (newTriggerWrapper && currentTriggerWrapper) {
      currentTriggerWrapper.replaceWith(newTriggerWrapper);
    } else {
      currentTriggerWrapper?.remove();
    }

    observeLoadMoreTrigger();
  };

  const performSwap = async ({ pushState, preserveScroll }) => {
    const listingSectionEl = document.querySelector('[data-collection-listing-section]');
    if (!listingSectionEl) return;

    // A sort/filter/view change is about to discard all appended pages and
    // reset to a fresh page 1 — any in-flight load-more fetch must not be
    // allowed to land afterward and re-append stale-state cards.
    stopObservingLoadMoreTrigger();
    loadMoreAbortController?.abort();
    listingGeneration++;
    swapInFlight = true;

    // The listing section is not itself a scroll container, so its own
    // scrollTop is always 0 — the position that actually has to survive the
    // swap is the window's, resolved against the outgoing layout while it is
    // still on screen.
    //
    // View changes re-render the same products in place — there is no new
    // result set to "start reading from the top" of, so the visitor's exact
    // scroll position is always preserved (preserveScroll: true), skipping
    // the near-top-band reset below. Sort/filter changes genuinely produce a
    // new result set, so they keep resetting to the top when the visitor was
    // still up near the toolbar/header band.
    const targetScrollY = preserveScroll
      ? window.scrollY
      : resolveTargetScrollY(window.scrollY, listingSectionEl);

    const fetchParams = new URLSearchParams(currentParams);

    // View rides on Shopify's native `view` param (see collection-toolbar.liquid
    // for why not a custom one). The toolbar comes back in the same request
    // because its category pills are plain links built from the current
    // view/sort/filters and must follow every change.
    fetchParams.set('sections', `${LISTING_SECTION_ID},${TOOLBAR_SECTION_ID}`);

    // A newer change (another click before this fetch settles) must always
    // win — abort whatever's in flight and tag this request so a late-
    // arriving, superseded response can never overwrite a newer one.
    activeAbortController?.abort();
    const abortController = new AbortController();
    activeAbortController = abortController;
    const requestId = ++latestRequestId;

    // Only the latest request clears swapInFlight — a superseded one
    // returning early must not unblock load-more while a newer swap runs.
    const settleSwap = () => {
      if (requestId === latestRequestId) swapInFlight = false;
    };

    // A non-JSON body (an HTML rate-limit or error page) makes json() throw,
    // so the whole read is guarded; on failure the current listing stays as
    // it is and load-more is re-armed.
    let sectionsHtml;
    try {
      const response = await fetch(`${window.location.pathname}?${fetchParams.toString()}`, {
        signal: abortController.signal,
      });
      if (!response.ok) throw new Error(`Listing update failed: ${response.status}`);
      sectionsHtml = await response.json();
    } catch (error) {
      if (requestId === latestRequestId) {
        settleSwap();
        if (error.name !== 'AbortError') observeLoadMoreTrigger();
      }
      return;
    }

    if (requestId !== latestRequestId) return;
    settleSwap();

    const parser = new DOMParser();
    const listingDoc = parser.parseFromString(sectionsHtml[LISTING_SECTION_ID] ?? '', 'text/html');
    const newListingEl = listingDoc.querySelector('[data-collection-listing-section]');
    if (!newListingEl) {
      observeLoadMoreTrigger();
      return;
    }

    Idiomorph.morph(listingSectionEl, newListingEl, { morphStyle: 'outerHTML' });
    const toolbarDoc = parser.parseFromString(sectionsHtml[TOOLBAR_SECTION_ID] ?? '', 'text/html');
    updateToolbarPills(toolbarDoc);
    updateFilterDrawerOptions(toolbarDoc);

    restorePageScroll(targetScrollY);

    updateViewToggle();
    observeLoadMoreTrigger();
    updateFilterDrawerCount();

    if (pushState) {
      const queryString = currentParams.toString();
      const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
      history.pushState({}, '', newUrl);
    }
  };

  const scheduleUpdate = ({ preserveScroll } = {}) => {
    currentParams.delete('page');

    // /search has no `collection` object of its own — `q` and `type=product`
    // scope every request to it, but they're not guaranteed to already be in
    // `currentParams` (the address bar on first load doesn't always carry
    // `type=product`), so every client-side update re-seeds them rather than
    // relying on whatever happened to already be in the URL.
    if (isSearchTemplate) {
      currentParams.set('q', searchTerms);
      currentParams.set('type', 'product');
    }

    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => performSwap({ pushState: true, preserveScroll }), UPDATE_DEBOUNCE);
  };

  document.addEventListener('toolbar:view-change', () => {
    const currentView = currentParams.get('view') || 'column';
    const cycleIndex = VIEW_CYCLE.indexOf(currentView);
    const nextView = VIEW_CYCLE[(cycleIndex + 1) % VIEW_CYCLE.length] ?? 'column';

    // 'column' has no alternate template of its own — it IS
    // templates/collection.json, the default — so it's represented by the
    // absence of `view` rather than an explicit `view=column` — unless the
    // page arrived with an explicit view (see keepExplicitView).
    if (nextView === 'column' && !keepExplicitView) {
      currentParams.delete('view');
    } else {
      currentParams.set('view', nextView);
    }

    scheduleUpdate({ preserveScroll: true });
  });

  document.addEventListener('sort:change', (event) => {
    currentParams.set('sort_by', event.detail.value);
    scheduleUpdate();
  });

  document.addEventListener('filter:change', (event) => {
    for (const key of [...currentParams.keys()]) {
      if (key.startsWith('filter.')) currentParams.delete(key);
    }

    // The drawer's form also carries hidden view/sort_by/q/type inputs for the
    // no-JS submit, frozen at page load. Those are owned by currentParams, so
    // only the drawer's own filter.* values are taken — appending the rest
    // would duplicate them, or reinstate a stale sort/view.
    for (const [key, value] of event.detail.params) {
      if (key.startsWith('filter.')) currentParams.append(key, value);
    }

    scheduleUpdate();
  });

  window.addEventListener('popstate', () => {
    currentParams = new URLSearchParams(window.location.search);
    performSwap({ pushState: false });
  });

  document.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-filter-drawer-form]')) return;

    event.preventDefault();
    event.target.closest('filter-drawer')?.querySelector('[data-filter-drawer-close]')?.click();
  });

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-collection-load-more-trigger]');
    if (!trigger) return;

    event.preventDefault();
    fetchNextPage(trigger);
  });

  // No initial catch-up swap needed: `view` is a native alternate-template
  // param, so Shopify already resolves and server-renders the right
  // template (and therefore the right view) on the very first load.
  observeLoadMoreTrigger();
});
