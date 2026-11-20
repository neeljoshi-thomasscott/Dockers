document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('[data-search-page-header]');
  if (!header) return;

  const { searchTerms } = header.dataset;
  if (!searchTerms) return;

  // Landing on the search results page is the single, authoritative point
  // where a query becomes a "recent search" — assets/search-drawer-content.js
  // exposes trackSearch for exactly this, instead of the drawer eagerly
  // saving every in-progress keystroke as its own entry.
  window.searchRecentSearches?.trackSearch(searchTerms);
});
