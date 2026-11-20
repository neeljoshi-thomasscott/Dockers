const BLOG_SORT_COMPARATORS = {
  newest: (a, b) => Number(b.dataset.blogSortDate) - Number(a.dataset.blogSortDate),
  oldest: (a, b) => Number(a.dataset.blogSortDate) - Number(b.dataset.blogSortDate),
  'title-ascending': (a, b) => a.dataset.blogSortTitle.localeCompare(b.dataset.blogSortTitle),
  'title-descending': (a, b) => b.dataset.blogSortTitle.localeCompare(a.dataset.blogSortTitle),
};

class BlogSort extends HTMLElement {
  connectedCallback() {
    this.list = this.querySelector('[data-blog-sort-list]');

    this.handleClick = (event) => {
      if (!event.target.closest('[data-sort-trigger]')) return;
      document.dispatchEvent(new CustomEvent('toolbar:open-sort'));
    };
    this.handleSortChange = (event) => this.sort(event.detail?.value);

    this.addEventListener('click', this.handleClick);
    this.addEventListener('sort:change', this.handleSortChange);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.handleClick);
    this.removeEventListener('sort:change', this.handleSortChange);
  }

  sort(value) {
    const compare = BLOG_SORT_COMPARATORS[value];
    if (!compare || !this.list) return;

    const items = [...this.list.querySelectorAll('[data-blog-sort-item]')];
    this.list.append(...items.sort(compare));
  }
}

if (!customElements.get('blog-sort')) {
  customElements.define('blog-sort', BlogSort);
}
