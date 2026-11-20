document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'themex-recent-searches';
  const MAX_RECENT = 3;

  const content = document.querySelector('[data-search-drawer-content]');
  if (!content) return;

  const productsShown = parseInt(content.dataset.productsShown, 10) || 4;

  const recentSearchesBlock = content.querySelector('[data-search-drawer-recent-searches]');
  const recentList = content.querySelector('[data-search-drawer-recent-list]');
  const recentRowTemplate = content.querySelector('[data-search-drawer-recent-row-template]');
  const clearRecentBtn = content.querySelector('[data-search-drawer-clear-recent]');
  const suggestionsBlock = content.querySelector('[data-search-drawer-suggestions]');
  const suggestionsHeading = content.querySelector('[data-search-drawer-suggestions-heading]');
  const suggestionList = content.querySelector('[data-search-drawer-suggestion-list]');
  const suggestedList = content.querySelector('[data-search-drawer-suggested-list]');
  const suggestedRowTemplate = content.querySelector('[data-search-drawer-suggested-row-template]');
  const resultsHeading = content.querySelector('[data-search-drawer-results-heading]');
  const resultsQuery = content.querySelector('[data-search-drawer-results-query]');
  const resultsGrid = content.querySelector('[data-search-drawer-results-grid]');
  const noResultsMessage = content.querySelector('[data-search-drawer-no-results-message]');
  const featuredHeading = content.querySelector('[data-search-drawer-featured-heading]');
  const fallbackGrid = content.querySelector('[data-search-drawer-fallback-grid]');
  const searchInput = document.querySelector('[data-search-drawer-input]');

  const suggestionsHeadingDefault = suggestionsHeading?.textContent.trim() ?? '';
  const suggestionsHeadingSuggested = suggestionsHeading?.dataset.label ?? '';

  let currentQuery = '';
  let resultsAbortController = null;
  let suggestedAbortController = null;

  const getRecentSearches = () => {
    try {
      const searches = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      return searches.slice(0, MAX_RECENT);
    } catch {
      return [];
    }
  };

  const saveRecentSearch = (query) => {
    const trimmed = query?.trim();
    if (!trimmed) return;

    const searches = getRecentSearches().filter((search) => search.toLowerCase() !== trimmed.toLowerCase());
    searches.unshift(trimmed);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(searches.slice(0, MAX_RECENT)));
    } catch {
      // Storage full or blocked (e.g. private mode) — skip saving silently.
    }
  };

  const trackSearch = (query) => {
    if (!query?.trim()) return;
    saveRecentSearch(query.trim());
  };

  window.searchRecentSearches = { getRecentSearches, saveRecentSearch, trackSearch };

  const renderRecentSearches = () => {
    if (!recentSearchesBlock || !recentList || !recentRowTemplate) return;

    const searches = getRecentSearches();
    recentList.replaceChildren();

    if (searches.length === 0) {
      recentSearchesBlock.hidden = true;
      return;
    }

    const root = window.Shopify?.routes?.root || '/';

    for (const search of searches) {
      const row = recentRowTemplate.content.firstElementChild.cloneNode(true);
      const link = row.querySelector('[data-search-drawer-row]');
      if (link) {
        link.textContent = search;
        link.href = `${root}search?q=${encodeURIComponent(search)}`;
      }
      recentList.appendChild(row);
    }

    recentSearchesBlock.hidden = false;
  };

  // Suggested rows render Regular with the typed part in Medium, as in
  // Figma's typed state ("All **Men**", "**Men**'s Shirts").
  const fillSuggestedRow = (link, text, query) => {
    const before = link.querySelector('[data-search-drawer-row-before]');
    const match = link.querySelector('[data-search-drawer-row-match]');
    const after = link.querySelector('[data-search-drawer-row-after]');
    if (!before || !match || !after) {
      link.textContent = text;
      return;
    }

    const start = text.toLowerCase().indexOf(query.trim().toLowerCase());
    const end = start + query.trim().length;
    before.textContent = start > -1 ? text.slice(0, start) : text;
    match.textContent = start > -1 ? text.slice(start, end) : '';
    after.textContent = start > -1 ? text.slice(end) : '';
  };

  // Empty-query state: the merchant-curated "Suggestions" list (schema
  // blocks on this section) — a fixed set the merchant chose, unrelated to
  // anything typed.
  const showCuratedSuggestions = () => {
    if (!suggestionsBlock) return;

    // Cancelled first so a late response for a cleared query can't render.
    suggestedAbortController?.abort();
    if (suggestedList) {
      suggestedList.hidden = true;
      suggestedList.innerHTML = '';
    }

    const rows = suggestionList ? [...suggestionList.querySelectorAll('[data-search-drawer-suggestion-row]')] : [];
    if (rows.length === 0) {
      suggestionsBlock.hidden = true;
      return;
    }

    if (suggestionsHeading) suggestionsHeading.textContent = suggestionsHeadingDefault;
    for (const row of rows) row.hidden = false;
    if (suggestionList) suggestionList.hidden = false;
    suggestionsBlock.hidden = false;
  };

  // Typed-query state: real "Suggested" query completions from Shopify's
  // Predictive Search `queries` resource — genuinely different data from
  // the curated list above, generated from what's actually being typed
  // (per https://shopify.dev/docs/storefronts/themes/navigation-search/search/predictive-search-ux),
  // not a substring-filter over the merchant's fixed list.
  const fetchSuggestedQueries = async (query) => {
    if (!suggestionsBlock || !suggestedList || !suggestedRowTemplate) return;

    suggestedAbortController?.abort();
    suggestedAbortController = new AbortController();

    if (suggestionList) suggestionList.hidden = true;

    const root = window.Shopify?.routes?.root || '/';
    const url = `${root}search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=query&resources[limit]=5`;

    try {
      const response = await fetch(url, { signal: suggestedAbortController.signal });
      if (!response.ok) throw new Error('Predictive search suggest failed');

      const data = await response.json();
      const typed = query.trim().toLowerCase();
      const queries = (data?.resources?.results?.queries ?? []).filter(
        (suggestion) => suggestion.text.trim().toLowerCase() !== typed
      );

      if (queries.length === 0) {
        suggestionsBlock.hidden = true;
        suggestedList.hidden = true;
        suggestedList.innerHTML = '';
        return;
      }

      suggestedList.innerHTML = '';
      for (const suggestion of queries) {
        const row = suggestedRowTemplate.content.firstElementChild.cloneNode(true);
        row.dataset.term = suggestion.text;
        const link = row.querySelector('[data-search-drawer-row]');
        if (link) {
          fillSuggestedRow(link, suggestion.text, query);
          link.href = suggestion.url;
        }
        suggestedList.appendChild(row);
      }

      if (suggestionsHeading) suggestionsHeading.textContent = suggestionsHeadingSuggested;
      suggestedList.hidden = false;
      suggestionsBlock.hidden = false;
    } catch (error) {
      if (error.name !== 'AbortError') {
        suggestionsBlock.hidden = true;
        suggestedList.hidden = true;
      }
    }
  };

  const showEmptyState = () => {
    resultsHeading?.setAttribute('hidden', '');
    if (resultsGrid) resultsGrid.innerHTML = '';
    resultsGrid?.setAttribute('hidden', '');
    noResultsMessage?.setAttribute('hidden', '');
    featuredHeading?.setAttribute('hidden', '');
    fallbackGrid?.removeAttribute('hidden');
  };

  const showNoResultsState = () => {
    if (resultsGrid) resultsGrid.innerHTML = '';
    resultsGrid?.setAttribute('hidden', '');
    resultsHeading?.setAttribute('hidden', '');
    noResultsMessage?.removeAttribute('hidden');
    featuredHeading?.removeAttribute('hidden');
    fallbackGrid?.removeAttribute('hidden');
  };

  const fetchResults = async (query) => {
    if (!resultsGrid) return;

    if (resultsAbortController) resultsAbortController.abort();
    resultsAbortController = new AbortController();

    if (resultsGrid.children.length > 0) {
      resultsGrid.classList.add('opacity-50', 'pointer-events-none');
    } else {
      resultsGrid.innerHTML = Array.from(
        { length: productsShown },
        () => '<div class="aspect-[2/3] animate-pulse bg-muted/10"></div>',
      ).join('');
    }

    const root = window.Shopify?.routes?.root || '/';
    const url = `${root}search?q=${encodeURIComponent(query)}&type=product&section_id=search-drawer-results&products_shown=${productsShown}`;

    try {
      const response = await fetch(url, { signal: resultsAbortController.signal });

      if (!response.ok) throw new Error('Search failed');

      const text = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const fragment = doc.getElementById('search-drawer-results');
      const resultsCount = parseInt(fragment?.dataset.searchDrawerResultsCount, 10) || 0;

      if (resultsCount > 0) {
        resultsGrid.innerHTML = fragment.innerHTML;
        resultsGrid.classList.remove('opacity-50', 'pointer-events-none');
        resultsGrid.removeAttribute('hidden');
        resultsHeading?.removeAttribute('hidden');
        noResultsMessage?.setAttribute('hidden', '');
        featuredHeading?.setAttribute('hidden', '');
        fallbackGrid?.setAttribute('hidden', '');
      } else {
        showNoResultsState();
      }
    } catch (error) {
      if (error.name !== 'AbortError') showNoResultsState();
    }
  };

  const handleQuery = (query) => {
    currentQuery = query;

    if (query === '') {
      if (resultsAbortController) resultsAbortController.abort();
      showCuratedSuggestions();
      showEmptyState();
      renderRecentSearches();
      return;
    }

    if (recentSearchesBlock) recentSearchesBlock.hidden = true;
    fetchSuggestedQueries(query);

    if (resultsQuery) resultsQuery.textContent = query;
    resultsHeading?.removeAttribute('hidden');
    fetchResults(query);
  };

  const getVisibleRows = () =>
    [...content.querySelectorAll('[data-search-drawer-row]')].filter((row) => row.offsetParent !== null);

  // Rows are tabindex="-1" (a listbox-style list, not one Tab stop per row),
  // so the arrow keys are the way in: ArrowDown from the search input moves
  // to the first row — the input sits outside `content`, so listening on
  // `content` alone left the rows unreachable by keyboard — and ArrowUp from
  // the first row returns to the input.
  const handleRowNavigation = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    const rows = getVisibleRows();
    if (rows.length === 0) return;

    const currentIndex = rows.indexOf(document.activeElement);
    if (currentIndex === -1 && event.key === 'ArrowUp') return;

    event.preventDefault();

    if (currentIndex === 0 && event.key === 'ArrowUp') {
      searchInput?.focus();
      return;
    }

    const nextIndex = event.key === 'ArrowDown' ? Math.min(currentIndex + 1, rows.length - 1) : currentIndex - 1;
    rows[nextIndex].focus();
  };

  content.addEventListener('keydown', handleRowNavigation);
  searchInput?.addEventListener('keydown', handleRowNavigation);

  // Selecting a suggestion previews it in-drawer instead of navigating —
  // recent-searches tracking happens only once the visitor actually lands
  // on the search results page (assets/search-page-header.js), not here.
  // A click handler (rather than a separate keydown one) also covers Enter
  // on a focused row for free: activating a focused <a> synthesizes a click.
  content.addEventListener('click', (event) => {
    const suggestionRow =
      event.target.closest('[data-search-drawer-suggestion-row]') ||
      event.target.closest('[data-search-drawer-suggested-row]');
    if (!suggestionRow) return;

    const link = event.target.closest('[data-search-drawer-row]');
    if (!link) return;

    const term = suggestionRow.dataset.term;
    if (!term) return;

    event.preventDefault();
    const drawer = content.closest('search-drawer');
    drawer?.selectTerm(term);
  });

  searchInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;

    const query = searchInput.value.trim();
    if (!query) return;

    event.preventDefault();

    const root = window.Shopify?.routes?.root || '/';
    window.location.href = `${root}search?q=${encodeURIComponent(query)}&type=product`;
  });

  clearRecentBtn?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    if (recentSearchesBlock) recentSearchesBlock.hidden = true;
    recentList?.replaceChildren();
  });

  // Re-read storage on every open: rendering is local and cheap, and it
  // picks up searches saved in another tab since this page loaded.
  document.addEventListener('search-drawer:open', () => {
    if (currentQuery === '') renderRecentSearches();
  });

  document.addEventListener('search-drawer:query', (event) => handleQuery(event.detail.query));
});
