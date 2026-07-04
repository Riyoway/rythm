/**
 * i18n - Locale loader (English only)
 */
const en = require('../locales/en.json');

/**
 * Get the locale object. Always returns English.
 * @returns {object}
 */
function getLocale() {
  return en;
}

module.exports = { getLocale };
