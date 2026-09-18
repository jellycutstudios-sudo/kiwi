import { useAuthStore } from '../stores/authStore';

export const BUSINESS_PRESETS = [
  {
    id: 'cafe',
    name: 'Cafe & Bakery',
    emoji: '☕',
    tagline: 'Coffee shops, bakeries, juice bars & dessert parlors',
    desc: 'Counter ordering, coffee customizations, fast takeaway & customer loyalty.',
    recommendedModes: ['pos', 'token', 'customers', 'inventory'],
    recommendedShiftMode: 'global',
    terminology: {
      catalog: 'Menu',
      category: 'Category',
      item: 'Item',
      items: 'Items',
      action: 'Charge',
      staff: 'Barista',
      location: 'Counter',
      kitchen: 'Kitchen / Bar',
    },
    features: {
      enableQuickPay: true,
      enableBarcode: false,
      enableTableMap: false,
      enableKds: false,
      enableSpeedDial: true,
    }
  },
  {
    id: 'qsr',
    name: 'Food Truck & Fast Casual',
    emoji: '🍔',
    tagline: 'Food trucks, pop-up stalls, street food & quick-service',
    desc: 'Ultra-fast counter queues, token display issuance, 1-tap cash & digital receipts.',
    recommendedModes: ['pos', 'token'],
    recommendedShiftMode: 'global',
    terminology: {
      catalog: 'Menu',
      category: 'Category',
      item: 'Dish',
      items: 'Dishes',
      action: 'Quick Pay',
      staff: 'Cashier',
      location: 'Counter / Window',
      kitchen: 'Kitchen',
    },
    features: {
      enableQuickPay: true,
      enableBarcode: false,
      enableTableMap: false,
      enableKds: false,
      enableSpeedDial: true,
    }
  },
  {
    id: 'restaurant',
    name: 'Full-Service Restaurant',
    emoji: '🍽️',
    tagline: 'Dine-in bistros, fine dining, family restaurants & bars',
    desc: 'Floor plan table maps, kitchen display (KDS), service charges & reservations.',
    recommendedModes: ['pos', 'table', 'kds', 'reservations', 'inventory', 'customers'],
    recommendedShiftMode: 'staff',
    terminology: {
      catalog: 'Menu',
      category: 'Category',
      item: 'Dish',
      items: 'Dishes',
      action: 'Settle Bill',
      staff: 'Waiter / Server',
      location: 'Table',
      kitchen: 'Kitchen',
    },
    features: {
      enableQuickPay: false,
      enableBarcode: false,
      enableTableMap: true,
      enableKds: true,
      enableSpeedDial: false,
    }
  },
  {
    id: 'retail',
    name: 'Retail & Grocery Store',
    emoji: '🛍️',
    tagline: 'Boutiques, convenience stores, mini-marts & gift shops',
    desc: 'Barcode scanning, stock level indicators, SKU catalog & unit-based pricing.',
    recommendedModes: ['pos', 'inventory', 'customers'],
    recommendedShiftMode: 'global',
    terminology: {
      catalog: 'Products',
      category: 'Department',
      item: 'Product',
      items: 'Products',
      action: 'Checkout',
      staff: 'Sales Associate',
      location: 'Register / Counter',
      kitchen: 'Fulfillment',
    },
    features: {
      enableQuickPay: true,
      enableBarcode: true,
      enableTableMap: false,
      enableKds: false,
      enableSpeedDial: true,
    }
  },
  {
    id: 'service',
    name: 'Salon, Spa & Services',
    emoji: '💇',
    tagline: 'Hair salons, barbershops, wellness spas & repair studios',
    desc: 'Staff attribution per service, customer treatment notes, tipping & payroll.',
    recommendedModes: ['pos', 'customers', 'payroll'],
    recommendedShiftMode: 'staff',
    terminology: {
      catalog: 'Services',
      category: 'Service Category',
      item: 'Service',
      items: 'Services',
      action: 'Complete',
      staff: 'Stylist / Specialist',
      location: 'Station / Chair',
      kitchen: 'Backroom',
    },
    features: {
      enableQuickPay: true,
      enableBarcode: false,
      enableTableMap: false,
      enableKds: false,
      enableSpeedDial: true,
    }
  }
];

export function useBusinessConfig() {
  const restaurant = useAuthStore(s => s.restaurant);
  const businessType = restaurant?.businessType || 'restaurant';

  const preset = BUSINESS_PRESETS.find(p => p.id === businessType) || BUSINESS_PRESETS[2]; // default to restaurant

  const terms = {
    ...BUSINESS_PRESETS[2].terminology,
    ...(preset?.terminology || {})
  };

  const isRetail = businessType === 'retail';
  const isQSR = businessType === 'qsr';
  const isCafe = businessType === 'cafe';
  const isService = businessType === 'service';
  const isRestaurant = businessType === 'restaurant';

  return {
    businessType,
    preset,
    presets: BUSINESS_PRESETS,
    terms,
    isRetail,
    isQSR,
    isCafe,
    isService,
    isRestaurant,
    enableQuickPay: restaurant?.quickPayEnabled ?? preset.features.enableQuickPay,
    enableBarcode: isRetail || Boolean(restaurant?.barcodeEnabled),
    enableSpeedDial: restaurant?.speedDialEnabled ?? preset.features.enableSpeedDial,
  };
}
