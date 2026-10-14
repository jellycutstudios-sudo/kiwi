/**
 * Currency formatter — supports INR and Middle East currencies
 */

const CURRENCIES = {
  INR: { locale: 'en-IN', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  AED: { locale: 'ar-AE-u-nu-latn', symbol: 'AED', name: 'UAE Dirham', decimals: 2 },
  SAR: { locale: 'ar-SA-u-nu-latn', symbol: 'SAR', name: 'Saudi Riyal', decimals: 2 },
  QAR: { locale: 'ar-QA-u-nu-latn', symbol: 'QAR', name: 'Qatari Riyal', decimals: 2 },
  BHD: { locale: 'ar-BH-u-nu-latn', symbol: 'BHD', name: 'Bahraini Dinar', decimals: 3 },
  KWD: { locale: 'ar-KW-u-nu-latn', symbol: 'KWD', name: 'Kuwaiti Dinar', decimals: 3 },
  OMR: { locale: 'ar-OM-u-nu-latn', symbol: 'OMR', name: 'Omani Rial', decimals: 3 },
  USD: { locale: 'en-US', symbol: '$', name: 'US Dollar', decimals: 2 },
};

const formatterCache = {};

export function formatCurrency(amount, currency = 'INR') {
  const finalCurrency = CURRENCIES[currency] ? currency : 'INR';
  const cfg = CURRENCIES[finalCurrency];
  const decimals = cfg.decimals ?? 2;
  const cacheKey = `${cfg.locale}_${finalCurrency}_${decimals}`;

  if (!formatterCache[cacheKey]) {
    formatterCache[cacheKey] = new Intl.NumberFormat(cfg.locale, {
      style: 'currency',
      currency: finalCurrency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
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
