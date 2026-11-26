document.addEventListener("DOMContentLoaded", () => {
  for (const stories of document.querySelectorAll("[data-blog-stories]")) {
    const button = stories.querySelector("[data-blog-stories-more]");
    const buttonWrap = stories.querySelector("[data-blog-stories-more-wrap]");
    const step = Number(stories.dataset.blogStoriesStep) || 4;

    button?.addEventListener("click", () => {
      const hiddenItems = [
        ...stories.querySelectorAll("[data-blog-story-hidden]"),
      ];

      for (const item of hiddenItems.slice(0, step)) {
        item.classList.remove("hidden");
        item.removeAttribute("data-blog-story-hidden");
      }

      if (hiddenItems.length <= step) {
        buttonWrap?.classList.add("hidden");
      }
    });
  }
});
