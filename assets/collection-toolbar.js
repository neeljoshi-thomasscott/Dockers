document.addEventListener('DOMContentLoaded', () => {
  const filterTriggers = document.querySelectorAll('[data-filter-trigger]');

  for (const trigger of filterTriggers) {
    trigger.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('toolbar:open-filter'));
    });
  }

  const sortTriggers = document.querySelectorAll('[data-sort-trigger]');

  for (const trigger of sortTriggers) {
    trigger.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('toolbar:open-sort'));
    });
  }

  const viewToggles = document.querySelectorAll('[data-view-toggle]');

  for (const toggle of viewToggles) {
    toggle.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('toolbar:view-change'));
    });
  }
});
