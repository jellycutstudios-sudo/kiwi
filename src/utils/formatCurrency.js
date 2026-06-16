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

export function formatCurrency(amount, currency = 'INR') {
  const cfg = CURRENCIES[currency] ?? CURRENCIES['INR'];
  return new Intl.NumberFormat(cfg.locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getCurrencySymbol(currency = 'INR') {
  return CURRENCIES[currency]?.symbol ?? currency;
}

export const CURRENCY_OPTIONS = Object.entries(CURRENCIES).map(([code, cfg]) => ({
  code,
  label: `${cfg.symbol} — ${cfg.name}`,
}));
