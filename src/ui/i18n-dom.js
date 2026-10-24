// Applies static translations to elements marked with data-i18n (text),
// data-i18n-aria (aria-label) and data-i18n-title (title).
import { translate } from '../i18n/strings.js';

export function applyStaticText(lang) {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = translate(lang, el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', translate(lang, el.dataset.i18nAria)));
  document.querySelectorAll('[data-i18n-title]').forEach((el) => el.setAttribute('title', translate(lang, el.dataset.i18nTitle)));
}
