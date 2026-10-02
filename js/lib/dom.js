// Small DOM helpers shared by every view.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export function icon(name, cls = '') {
  return `<i data-lucide="${name}" class="${cls}"></i>`;
}

export function refreshIcons(root) {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons(root ? { nameAttr: 'data-lucide', root } : undefined);
  }
}

export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let toastTimer;
export function toast(message, kind = 'info') {
  document.querySelector('.toast')?.remove();
  const node = el(`<div class="toast ${kind === 'error' ? 'error' : ''}" role="status">${esc(message)}</div>`);
  document.body.appendChild(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), 3600);
}

// Opens a modal and returns { root, close }. Click on the backdrop or Escape closes it.
export function openModal(innerHtml, { onClose } = {}) {
  const root = el(`<div class="modal" role="dialog" aria-modal="true">${innerHtml}</div>`);
  const close = () => {
    document.removeEventListener('keydown', onKey);
    root.remove();
    if (onClose) onClose();
  };
  const onKey = (event) => { if (event.key === 'Escape') close(); };
  root.addEventListener('mousedown', (event) => { if (event.target === root) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(root);
  root.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', close));
  refreshIcons(root);
  return { root, close };
}
