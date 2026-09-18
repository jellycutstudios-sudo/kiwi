/**
 * Kiwi POS — Centralized Pre-Tested Data Fixtures
 * Reusable mock datasets pre-validated against all stores, adapters, and print utils.
 * Use these fixtures to write fast, reproducible unit and integration tests.
 */

export const mockRestaurant = {
  id: 'rest_test_001',
  name: 'Kiwi Bistro Demo',
  address: '100 Main Street, Suite 4B',
  phone: '+91 98765 43210',
  currency: 'INR',
  gstin: '29ABCDE1234F1Z5',
  fssai: '12345678901234',
  modes: ['dine-in', 'takeaway', 'delivery', 'online', 'token'],
  taxConfig: {
    type: 'gst',
    rate: 5, // 2.5% CGST + 2.5% SGST
  },
  serviceChargeConfig: {
    enabled: true,
    rate: 5,
  },
  upiConfig: {
    vpa: 'kiwibistro@upi',
    name: 'Kiwi Bistro POS',
  },
  peripheralConfig: {
    printers: [
      {
        id: 'printer_receipt',
        name: 'Counter Receipt Printer',
        type: 'receipt',
        mode: 'browser',
        paperSize: '80mm',
        soundAlerts: true,
        drawerKick: true,
      },
      {
        id: 'printer_kitchen',
        name: 'Kitchen Hot Station',
        type: 'kitchen',
        mode: 'browser',
        paperSize: '80mm',
        categories: ['cat_mains', 'cat_starters'],
      },
    ],
  },
};

export const mockCategories = [
  {
    id: 'cat_starters',
    name: 'Starters & Apps',
    items: [
      {
        id: 'item_nachos',
        name: 'Loaded Nachos',
        price: 250,
        veg: true,
        category: 'cat_starters',
        modifiers: [
          { id: 'mod_cheese', name: 'Extra Cheese', priceAdd: 50 },
          { id: 'mod_jalapenos', name: 'Extra Jalapenos', priceAdd: 30 },
        ],
      },
      {
        id: 'item_wings',
        name: 'BBQ Wings (6pcs)',
        price: 320,
        veg: false,
        category: 'cat_starters',
      },
    ],
  },
  {
    id: 'cat_mains',
    name: 'Main Courses',
    items: [
      {
        id: 'item_burger',
        name: 'Classic Smash Burger',
        price: 350,
        veg: false,
        category: 'cat_mains',
      },
      {
        id: 'item_paneer_tikka',
        name: 'Paneer Tikka Roll',
        price: 220,
        veg: true,
        category: 'cat_mains',
      },
    ],
  },
];

export const mockTables = [
  { id: 'tbl_t1', name: 'T1', capacity: 2, floor: 'Ground Floor', status: 'free', x: 60, y: 50, w: 90, h: 90 },
  { id: 'tbl_t2', name: 'T2', capacity: 4, floor: 'Ground Floor', status: 'occupied', x: 250, y: 50, w: 90, h: 90 },
  { id: 'tbl_t3', name: 'T3', capacity: 6, floor: 'Ground Floor', status: 'reserved', x: 440, y: 50, w: 110, h: 110 },
  { id: 'tbl_t4', name: 'T4', capacity: 4, floor: 'Ground Floor', status: 'free', x: 630, y: 50, w: 90, h: 90 },
];

export const mockOrders = {
  dineInSimple: {
    id: 'ord_test_001',
    type: 'dine-in',
    tableId: 'tbl_t2',
    tableName: 'T2',
    status: 'preparing',
    customerName: 'Aarav Sharma',
    customerPhone: '9876543210',
    items: [
      { id: 'item_burger', menuItemId: 'item_burger', name: 'Classic Smash Burger', qty: 2, price: 350 },
      { id: 'item_nachos', menuItemId: 'item_nachos', name: 'Loaded Nachos', qty: 1, price: 250 },
    ],
    subtotal: 950,
    discount: 0,
    discountAmount: 0,
    taxInfo: {
      mode: 'exclusive',
      rate: 5,
      totalTax: 47.5,
      lines: [
        { label: 'CGST (2.5%)', amount: 23.75 },
        { label: 'SGST (2.5%)', amount: 23.75 },
      ],
    },
    serviceChargeAmount: 47.5,
    tipAmount: 50,
    total: 1095,
    paymentMethod: 'unpaid',
    paid: false,
    currency: 'INR',
  },
  takeawaySplit: {
    id: 'ord_test_002',
    type: 'takeaway',
    token: 42,
    status: 'billed',
    customerName: 'Priya Patel',
    customerPhone: '9876512345',
    items: [
      { id: 'item_paneer_tikka', menuItemId: 'item_paneer_tikka', name: 'Paneer Tikka Roll', qty: 2, price: 220 },
    ],
    subtotal: 440,
    discount: 10,
    discountType: 'percent',
    discountAmount: 44,
    taxInfo: {
      mode: 'exclusive',
      rate: 5,
      totalTax: 19.8,
      lines: [
        { label: 'CGST (2.5%)', amount: 9.9 },
        { label: 'SGST (2.5%)', amount: 9.9 },
      ],
    },
    total: 415.8,
    paymentMethod: 'split',
    splitPayments: [
      { method: 'cash', amount: 200 },
      { method: 'upi', amount: 215.8 },
    ],
    paid: true,
    currency: 'INR',
  },
};

export const mockShift = {
  id: 'shift_test_001',
  cashierId: 'staff_001',
  cashierName: 'Rohan (Cashier)',
  startCash: 5000,
  expectedCash: 6200,
  cashSalesAmount: 1200,
  cashSalesCount: 4,
  cardSalesAmount: 2450,
  cardSalesCount: 3,
  upiSalesAmount: 3800,
  upiSalesCount: 7,
  totalSalesAmount: 7450,
  cashDrops: [{ id: 'drop_1', amount: 2000, note: 'Mid-shift safe drop', timestamp: new Date() }],
  paidOuts: [{ id: 'pout_1', amount: 300, reason: 'Emergency dairy milk supplies', timestamp: new Date() }],
};

export const mockWebhooks = {
  zomato: {
    order_id: 'ZOM-8839210',
    order_status: 'placed',
    customer: { name: 'Vikram Mehta', phone: '+919988776655' },
    order_items: [
      { item_id: 'zm_1', name: 'Classic Smash Burger', quantity: 2, unit_price: 350 },
    ],
    order_total: 700,
    delivery_address: 'Flat 402, Sunshine Towers, Indiranagar, Bengaluru',
  },
  swiggy: {
    order_id: 'SWIG-110294',
    status: 'ORDER_PLACED',
    customer_details: { customer_name: 'Ananya Roy', contact_number: '9123456780' },
    cart: {
      items: [
        { item_id: 'sw_1', item_name: 'Loaded Nachos', quantity: 1, item_price: 250 },
      ],
      total_amount: 250,
    },
    address: 'B-12 Greenwood Apts, Koramangala',
  },
  uberEats: {
    id: 'eats_ord_9901',
    state: 'CREATED',
    eater: { first_name: 'David', phone: '+14155552671' },
    cart: {
      items: [
        { id: 'ub_1', title: 'Smash Burger', quantity: 1, price: { amount: 12.5, currency_code: 'USD' } },
      ],
    },
    payment: { charges: { total: { amount: 12.5 } } },
  },
  deliveroo: {
    id: 'deliv_5521',
    status: 'placed',
    customer: { name: 'Sarah Jenkins', phone_number: '+447911123456' },
    items: [
      { id: 'del_1', name: 'Smash Burger', quantity: 2, price: 1000 }, // in cents
    ],
    total_price: 2000,
  },
};
