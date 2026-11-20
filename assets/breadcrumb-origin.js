const COLLECTION_PATH = /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/collections\/([^/]+)(?:\/(?!products\/)[^/]*)?\/?$/i;
const PRODUCT_PATH = /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/products\//i;
const STORAGE_PREFIX = 'breadcrumbOrigin:';

const readStoredOrigin = (pathname) => {
  try {
    return sessionStorage.getItem(`${STORAGE_PREFIX}${pathname}`);
  } catch {
    return null;
  }
};

const storeOrigin = (pathname, handle) => {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${pathname}`, handle);
  } catch {}
};

const getOriginHandle = (pathname) => {
  if (!document.referrer) return null;

  let referrer;
  try {
    referrer = new URL(document.referrer);
  } catch {
    return null;
  }
  if (referrer.origin !== window.location.origin) return null;

  const match = referrer.pathname.match(COLLECTION_PATH);
  if (match) return decodeURIComponent(match[1]);

  return PRODUCT_PATH.test(referrer.pathname) ? readStoredOrigin(pathname) : null;
};

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('[data-breadcrumb-origin-nav]');
  if (!nav) return;

  const { pathname } = window.location;
  const handle = getOriginHandle(pathname);
  const template = handle && nav.querySelector(`template[data-breadcrumb-origin="${CSS.escape(handle)}"]`);
  if (!template) return;

  const kept = [...nav.querySelectorAll(':scope > template, :scope > script[type="application/ld+json"]')];
  nav.replaceChildren(template.content.cloneNode(true), ...kept);
  storeOrigin(pathname, handle);

  document.addEventListener('click', (event) => {
    const swatch = event.target.closest('[data-colour-siblings] a[href]');
    if (!swatch) return;
    storeOrigin(new URL(swatch.href, window.location.origin).pathname, handle);
  });
});
