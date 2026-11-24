document.addEventListener('DOMContentLoaded', () => {
  const pillRow = document.querySelector('[data-legal-nav-pills]');
  const activePill = pillRow?.querySelector('[data-active="true"]');
  if (!pillRow || !activePill) return;

  // Centres the active pill by scrolling only the pill row. scrollIntoView
  // also scrolls every scrollable ancestor, including the window — pulling a
  // visitor who arrived on an #anchor or a restored scroll position back up
  // to the pills.
  const rowRect = pillRow.getBoundingClientRect();
  const pillRect = activePill.getBoundingClientRect();
  const centredLeft = pillRow.scrollLeft + (pillRect.left - rowRect.left) - (rowRect.width - pillRect.width) / 2;

  pillRow.scrollTo({ left: centredLeft, behavior: 'smooth' });
});
