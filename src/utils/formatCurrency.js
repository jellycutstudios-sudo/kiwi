/**
 * Currency formatter — supports INR and Middle East currencies
 */

const CURRENCIES = {
  INR: { locale: 'en-IN', symbol: '₹', name: 'Indian Rupee' },
  AED: { locale: 'ar-AE', symbol: 'AED', name: 'UAE Dirham' },
  SAR: { locale: 'ar-SA', symbol: 'SAR', name: 'Saudi Riyal' },
  QAR: { locale: 'ar-QA', symbol: 'QAR', name: 'Qatari Riyal' },
  BHD: { locale: 'ar-BH', symbol: 'BHD', name: 'Bahraini Dinar' },
  KWD: { locale: 'ar-KW', symbol: 'KWD', name: 'Kuwaiti Dinar' },
  OMR: { locale: 'ar-OM', symbol: 'OMR', name: 'Omani Rial' },
  USD: { locale: 'en-US', symbol: '$', name: 'US Dollar' },
};

const formatterCache = {};

export function formatCurrency(amount, currency = 'INR') {
  const finalCurrency = CURRENCIES[currency] ? currency : 'INR';
  const cfg = CURRENCIES[finalCurrency];
  const cacheKey = `${cfg.locale}_${finalCurrency}`;

  if (!formatterCache[cacheKey]) {
    formatterCache[cacheKey] = new Intl.NumberFormat(cfg.locale, {
      style: 'currency',
      currency: finalCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return formatterCache[cacheKey].format(amount);
}

export function getCurrencySymbol(currency = 'INR') {
  return CURRENCIES[currency]?.symbol ?? currency;
}

export const CURRENCY_OPTIONS = Object.entries(CURRENCIES).map(([code, cfg]) => ({
  code,
  label: `${cfg.symbol} — ${cfg.name}`,
}));
