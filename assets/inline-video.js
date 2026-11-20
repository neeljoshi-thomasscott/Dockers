class InlineVideo extends HTMLElement {
  connectedCallback() {
    this.video = this.querySelector('video');
    if (!this.video) return;

    this.observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          this.video.play().catch(() => {});
        } else {
          this.video.pause();
        }
      },
      { threshold: 0.25 }
    );
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
  }
}

if (!customElements.get('inline-video')) {
  customElements.define('inline-video', InlineVideo);
}
