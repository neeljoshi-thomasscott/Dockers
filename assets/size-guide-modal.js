class SizeGuideModal extends HTMLElement {
  connectedCallback() {
    this._dialog = this.querySelector('[data-size-guide-modal-dialog]');
    if (!this._dialog) return;

    this._chartSlot = this.querySelector('[data-size-guide-chart]');
    this._imagesSlot = this.querySelector('[data-size-guide-images]');

    this._triggerElement = null;

    this._handleDocumentClick = (event) => {
      const trigger = event.target.closest('[data-size-guide-trigger]');
      if (!trigger) return;

      event.preventDefault();
      this._triggerElement = trigger;
      const { sizeChartId, sizeGuideDesktop, sizeGuideMobile } = trigger.dataset;
      const chartTemplate = sizeChartId ? document.getElementById(sizeChartId) : null;

      if (chartTemplate) {
        this._showChart(chartTemplate);
      } else {
        this._hideChart();
        this._setImage('desktop', sizeGuideDesktop);
        this._setImage('mobile', sizeGuideMobile);
      }
      this._dialog.showModal();
    };
    document.addEventListener('click', this._handleDocumentClick);

    for (const closeButton of this.querySelectorAll('[data-size-guide-modal-close]')) {
      closeButton.addEventListener('click', () => this._dialog.close());
    }

    this._handleDialogClick = (event) => {
      if (event.target === this._dialog) this._dialog.close();
    };
    this._dialog.addEventListener('click', this._handleDialogClick);

    this._handleDialogClose = () => {
      if (typeof this._triggerElement?.focus === 'function') {
        this._triggerElement.focus();
      }
    };
    this._dialog.addEventListener('close', this._handleDialogClose);
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._handleDocumentClick);
  }

  _showChart(template) {
    if (!this._chartSlot) return;
    this._chartSlot.replaceChildren(template.content.cloneNode(true));
    this._chartSlot.hidden = false;
    if (this._imagesSlot) this._imagesSlot.hidden = true;
  }

  _hideChart() {
    if (!this._chartSlot) return;
    this._chartSlot.replaceChildren();
    this._chartSlot.hidden = true;
    if (this._imagesSlot) this._imagesSlot.hidden = false;
  }

  _setImage(variant, url) {
    const img = this.querySelector(`[data-size-guide-${variant}-img]`);
    const placeholder = this.querySelector(`[data-size-guide-${variant}-placeholder]`);
    if (!img || !placeholder) return;

    if (url) {
      img.src = url;
      img.hidden = false;
      placeholder.hidden = true;
    } else {
      img.hidden = true;
      img.removeAttribute('src');
      placeholder.hidden = false;
    }
  }
}

if (!customElements.get('size-guide-modal')) {
  customElements.define('size-guide-modal', SizeGuideModal);
}
