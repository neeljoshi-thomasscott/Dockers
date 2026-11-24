document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('main-header');
  if (!header) return;

  const SCROLL_THRESHOLD = 4;

  const updateScrolledState = () => {
    header.classList.toggle('is-scrolled', window.scrollY > SCROLL_THRESHOLD);
  };

  updateScrolledState();
  window.addEventListener('scroll', updateScrolledState, { passive: true });
});
