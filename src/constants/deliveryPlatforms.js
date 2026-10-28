export const PLATFORM_META = {
  talabat: {
    name: 'Talabat',
    emoji: '🟧',
    color: '#ff5a00',
    bg: '#fff4ed',
    region: 'Qatar & GCC',
    currencies: ['QAR', 'AED', 'SAR', 'KWD', 'BHD', 'OMR', 'EGP', 'JOD'],
    countries: ['Qatar', 'United Arab Emirates', 'Saudi Arabia', 'Kuwait', 'Bahrain', 'Oman', 'Egypt', 'Jordan', 'QA', 'AE', 'SA', 'KW', 'BH', 'OM', 'EG', 'JO'],
    fields: [
      { key: 'apiKey', label: 'Talabat Partner API Key', placeholder: 'talabat_api_key_...' },
      { key: 'restaurantId', label: 'Talabat Restaurant / Chain ID', placeholder: 'talabat_branch_id_...' },
      { key: 'storeId', label: 'Store Code (Optional)', placeholder: 'e.g. DOH-001' }
    ]
  },
  snoonu: {
    name: 'Snoonu',
    emoji: '🔴',
    color: '#e30613',
    bg: '#fdefef',
    region: 'Qatar',
    currencies: ['QAR'],
    countries: ['Qatar', 'QA'],
    fields: [
      { key: 'apiKey', label: 'Snoonu Merchant API Token', placeholder: 'snoonu_token_...' },
      { key: 'merchantId', label: 'Merchant ID', placeholder: 'snoonu_merchant_id_...' },
      { key: 'branchId', label: 'Branch ID', placeholder: 'snoonu_branch_id_...' }
    ]
  },
  rafeeq: {
    name: 'Rafeeq',
    emoji: '🟣',
    color: '#5c1d8c',
    bg: '#f5effa',
    region: 'Qatar',
    currencies: ['QAR'],
    countries: ['Qatar', 'QA'],
    fields: [
      { key: 'apiKey', label: 'Rafeeq Partner API Token', placeholder: 'rafeeq_api_key_...' },
      { key: 'vendorId', label: 'Vendor / Branch ID', placeholder: 'rafeeq_vendor_id_...' }
    ]
  },
  jahez: {
    name: 'Jahez',
    emoji: '🟨',
    color: '#ffb300',
    bg: '#fffbf0',
    region: 'KSA & GCC',
    currencies: ['SAR', 'BHD', 'KWD', 'QAR', 'AED'],
    countries: ['Saudi Arabia', 'Bahrain', 'Kuwait', 'Qatar', 'United Arab Emirates', 'SA', 'BH', 'KW', 'QA', 'AE'],
    fields: [
      { key: 'apiKey', label: 'Jahez API Key', placeholder: 'jahez_key_...' },
      { key: 'branchId', label: 'Branch Code', placeholder: 'jahez_branch_code_...' }
    ]
  },
  deliveroo: {
    name: 'Deliveroo',
    emoji: '🦘',
    color: '#00cdbc',
    bg: '#eefcfb',
    region: 'UAE, Qatar & Global',
    currencies: ['AED', 'QAR', 'KWD', 'GBP', 'EUR', 'SGD', 'HKD', 'AUD'],
    countries: ['United Kingdom', 'United Arab Emirates', 'Qatar', 'Kuwait', 'France', 'Ireland', 'Singapore', 'Hong Kong', 'Australia', 'GB', 'UK', 'AE', 'QA', 'KW', 'FR', 'IE', 'SG', 'HK', 'AU'],
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'deliveroo_api_key_...' },
      { key: 'restaurantId', label: 'Restaurant ID', placeholder: 'deliveroo_restaurant_id_...' }
    ]
  },
  ubereats: {
    name: 'Uber Eats',
    emoji: '🚗',
    color: '#06c167',
    bg: '#eefaf3',
    region: 'Global',
    isGlobal: true,
    currencies: ['USD', 'CAD', 'GBP', 'EUR', 'INR', 'AED', 'AUD', 'NZD', 'JPY', 'ZAR'],
    countries: ['United States', 'Canada', 'United Kingdom', 'India', 'United Arab Emirates', 'Australia', 'New Zealand', 'France', 'Spain', 'Germany', 'US', 'CA', 'GB', 'UK', 'IN', 'AE', 'AU', 'NZ', 'FR', 'ES', 'DE'],
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'client_id_...' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'client_secret_...', type: 'password' },
      { key: 'storeId', label: 'Store ID', placeholder: 'store_id_...' }
    ]
  },
  zomato: {
    name: 'Zomato',
    emoji: '🍕',
    color: '#e23744',
    bg: '#fdefef',
    region: 'India & UAE',
    currencies: ['INR', 'AED'],
    countries: ['India', 'United Arab Emirates', 'IN', 'AE'],
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'zomato_api_key_...' },
      { key: 'restaurantId', label: 'Restaurant ID', placeholder: 'zomato_restaurant_id_...' }
    ]
  },
  swiggy: {
    name: 'Swiggy',
    emoji: '🟠',
    color: '#fc8019',
    bg: '#fff5ed',
    region: 'India',
    currencies: ['INR'],
    countries: ['India', 'IN'],
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'swiggy_api_key_...' },
      { key: 'restaurantId', label: 'Restaurant ID', placeholder: 'swiggy_restaurant_id_...' }
    ]
  }
};

export const ALL_PLATFORMS = Object.keys(PLATFORM_META);

export function isPlatformRelevantToRestaurant(platformId, restaurant, integrations = {}) {
  // If active or configured, always treat as relevant
  const config = integrations?.[platformId] || {};
  if (config.enabled === true || config.apiKey || config.clientId || config.vendorId || config.merchantId) {
    return true;
  }

  const meta = PLATFORM_META[platformId];
  if (!meta) return false;
  if (meta.isGlobal) return true;

  const restCurrency = (restaurant?.currency || 'INR').toUpperCase().trim();
  const restCountry = (restaurant?.country || '').toLowerCase().trim();

  // Match by currency
  if (meta.currencies && meta.currencies.includes(restCurrency)) return true;

  // Match by country
  if (restCountry && meta.countries && meta.countries.some(c => c.toLowerCase() === restCountry)) return true;

  return false;
}
