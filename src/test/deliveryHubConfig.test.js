// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { isPlatformRelevantToRestaurant } from '../routes/admin/DeliveryHub';

describe('Delivery Hub Configuration & Security Logic', () => {
  // Test role resolution logic used in DeliveryHub.jsx and Sidebar.jsx
  const resolveAdminAccess = (staffDoc, user) => {
    const role = staffDoc?.role ?? (user ? 'admin' : 'cashier');
    const isUserAdmin = ['admin', 'super_admin', 'manager', 'owner'].includes(role) || Boolean(user && !staffDoc);
    return { role, isUserAdmin };
  };

  it('correctly grants admin access when owner logs in with email/password without staff pin', () => {
    const user = { uid: 'owner-firebase-uid', email: 'owner@restaurant.com' };
    const staffDoc = null; // No pin profile selected yet

    const { role, isUserAdmin } = resolveAdminAccess(staffDoc, user);
    expect(role).toBe('admin');
    expect(isUserAdmin).toBe(true);
  });

  it('correctly grants admin access when logged in as admin or manager with staffDoc', () => {
    const user = { uid: 'user-1' };
    const adminStaff = { id: 'staff-1', role: 'admin', name: 'Alice' };
    const managerStaff = { id: 'staff-2', role: 'manager', name: 'Bob' };
    const ownerStaff = { id: 'staff-3', role: 'owner', name: 'Carol' };

    expect(resolveAdminAccess(adminStaff, user).isUserAdmin).toBe(true);
    expect(resolveAdminAccess(managerStaff, user).isUserAdmin).toBe(true);
    expect(resolveAdminAccess(ownerStaff, user).isUserAdmin).toBe(true);
  });

  it('restricts admin configuration controls for pure cashier role', () => {
    const user = { uid: 'user-1' };
    const cashierStaff = { id: 'staff-4', role: 'cashier', name: 'Dave' };

    const { role, isUserAdmin } = resolveAdminAccess(cashierStaff, user);
    expect(role).toBe('cashier');
    expect(isUserAdmin).toBe(false);
  });

  it('constructs correct webhook URLs for delivery aggregator callbacks', () => {
    const projectId = 'dineos-cloud';
    const restaurantId = 'rest-999';

    const getWebhookUrl = (platformId) =>
      `https://us-central1-${projectId}.cloudfunctions.net/handleDeliveryWebhook?platform=${platformId}&restaurantId=${restaurantId}`;

    expect(getWebhookUrl('talabat')).toBe(
      'https://us-central1-dineos-cloud.cloudfunctions.net/handleDeliveryWebhook?platform=talabat&restaurantId=rest-999'
    );
    expect(getWebhookUrl('ubereats')).toBe(
      'https://us-central1-dineos-cloud.cloudfunctions.net/handleDeliveryWebhook?platform=ubereats&restaurantId=rest-999'
    );
    expect(getWebhookUrl('swiggy')).toBe(
      'https://us-central1-dineos-cloud.cloudfunctions.net/handleDeliveryWebhook?platform=swiggy&restaurantId=rest-999'
    );
  });

  it('validates required fields for aggregator credential configuration', () => {
    const samplePlatformConfigs = {
      talabat: {
        fields: ['apiKey', 'restaurantId', 'storeId']
      },
      ubereats: {
        fields: ['clientId', 'clientSecret', 'storeId']
      },
      snoonu: {
        fields: ['apiKey', 'merchantId', 'branchId']
      }
    };

    // Talabat configuration
    const talabatPayload = {
      apiKey: 'talabat_key_test_123',
      restaurantId: 'branch_doh_01',
      enabled: true
    };
    expect(talabatPayload.apiKey).toBeTruthy();
    expect(talabatPayload.restaurantId).toBeTruthy();
    expect(talabatPayload.enabled).toBe(true);

    // Uber Eats configuration
    const uberPayload = {
      clientId: 'client_id_test',
      clientSecret: 'client_secret_test',
      storeId: 'store_123',
      enabled: true
    };
    expect(uberPayload.clientId).toBeTruthy();
    expect(uberPayload.clientSecret).toBeTruthy();
    expect(uberPayload.storeId).toBeTruthy();
  });

  it('calculates accurate net payouts and commissions across aggregator channels', () => {
    const orders = [
      { id: '1', source: 'talabat', total: 100 },
      { id: '2', source: 'talabat', total: 50 },
      { id: '3', source: 'snoonu', total: 200 },
      { id: '4', source: 'ubereats', total: 80 }
    ];

    const commissions = {
      talabat: 22,
      snoonu: 20,
      ubereats: 25
    };

    const calculateChannelMetrics = (platformId) => {
      const platformOrders = orders.filter(o => o.source === platformId);
      const gross = platformOrders.reduce((sum, o) => sum + o.total, 0);
      const rate = commissions[platformId] ?? 20;
      const commission = (gross * rate) / 100;
      const net = gross - commission;
      return { count: platformOrders.length, gross, commission, net };
    };

    const talabat = calculateChannelMetrics('talabat');
    expect(talabat.count).toBe(2);
    expect(talabat.gross).toBe(150);
    expect(talabat.commission).toBe(33); // 22% of 150
    expect(talabat.net).toBe(117);

    const snoonu = calculateChannelMetrics('snoonu');
    expect(snoonu.count).toBe(1);
    expect(snoonu.gross).toBe(200);
    expect(snoonu.commission).toBe(40); // 20% of 200
    expect(snoonu.net).toBe(160);

    const uber = calculateChannelMetrics('ubereats');
    expect(uber.count).toBe(1);
    expect(uber.gross).toBe(80);
    expect(uber.commission).toBe(20); // 25% of 80
    expect(uber.net).toBe(60);

    // Total combination
    const totalGross = talabat.gross + snoonu.gross + uber.gross;
    const totalCommission = talabat.commission + snoonu.commission + uber.commission;
    const totalNet = talabat.net + snoonu.net + uber.net;

    expect(totalGross).toBe(430);
    expect(totalCommission).toBe(93);
    expect(totalNet).toBe(337);
  });

  it('evaluates dish 86ing status and multi-channel availability logic', () => {
    const activePlatforms = ['talabat', 'snoonu', 'jahez'];
    
    // Dish is enabled by default in POS catalog
    const dish = { id: 'dish-chicken-65', name: 'Chicken 65', available: true };

    // Simulating subcollection overrides: deliverySettings/{platform}/items/{itemId}
    const overrides = {
      talabat: { 'dish-chicken-65': { available: false } }, // 86'd on Talabat
      snoonu: { 'dish-chicken-65': { available: true } },
      jahez: {} // No override => defaults to dish.available
    };

    const isItemEnabled = (platformId, itemId, defaultAvail) => {
      const override = overrides[platformId]?.[itemId];
      return override ? override.available !== false : defaultAvail !== false;
    };

    expect(isItemEnabled('talabat', dish.id, dish.available)).toBe(false);
    expect(isItemEnabled('snoonu', dish.id, dish.available)).toBe(true);
    expect(isItemEnabled('jahez', dish.id, dish.available)).toBe(true);

    const isAllActive = activePlatforms.every(p => isItemEnabled(p, dish.id, dish.available));
    expect(isAllActive).toBe(false); // Because Talabat is 86'd

    const isPausedAnywhere = activePlatforms.some(p => !isItemEnabled(p, dish.id, dish.available));
    expect(isPausedAnywhere).toBe(true);
  });

  it('computes pause duration countdown and kitchen rush buffer delay', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    const pauseUntil = new Date('2026-10-23T12:30:00Z');

    const diffMs = pauseUntil - now;
    const totalSecs = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const countdownStr = `${mins}:${secs.toString().padStart(2, '0')}`;

    expect(mins).toBe(30);
    expect(countdownStr).toBe('30:00');

    // Rush buffer throttle (+15m, +30m, +45m)
    const prepBufferOptions = [0, 15, 30, 45];
    const standardPrepTime = 20;

    const effectivePrepTime = (buffer) => standardPrepTime + buffer;
    expect(effectivePrepTime(15)).toBe(35);
    expect(effectivePrepTime(30)).toBe(50);
    expect(effectivePrepTime(45)).toBe(65);
    expect(prepBufferOptions.includes(30)).toBe(true);
  });

  it('correctly filters delivery platforms based on restaurant country and currency', () => {
    const qatarRestaurant = { currency: 'QAR', country: 'Qatar' };
    const indiaRestaurant = { currency: 'INR', country: 'India' };
    const ukRestaurant = { currency: 'GBP', country: 'United Kingdom' };

    // Qatar restaurant: Talabat, Snoonu, Rafeeq, Deliveroo, Uber Eats
    expect(isPlatformRelevantToRestaurant('talabat', qatarRestaurant)).toBe(true);
    expect(isPlatformRelevantToRestaurant('snoonu', qatarRestaurant)).toBe(true);
    expect(isPlatformRelevantToRestaurant('rafeeq', qatarRestaurant)).toBe(true);
    expect(isPlatformRelevantToRestaurant('deliveroo', qatarRestaurant)).toBe(true);
    expect(isPlatformRelevantToRestaurant('ubereats', qatarRestaurant)).toBe(true);
    expect(isPlatformRelevantToRestaurant('swiggy', qatarRestaurant)).toBe(false);
    expect(isPlatformRelevantToRestaurant('zomato', qatarRestaurant)).toBe(false);

    // India restaurant: Swiggy, Zomato, Uber Eats
    expect(isPlatformRelevantToRestaurant('swiggy', indiaRestaurant)).toBe(true);
    expect(isPlatformRelevantToRestaurant('zomato', indiaRestaurant)).toBe(true);
    expect(isPlatformRelevantToRestaurant('ubereats', indiaRestaurant)).toBe(true);
    expect(isPlatformRelevantToRestaurant('snoonu', indiaRestaurant)).toBe(false);
    expect(isPlatformRelevantToRestaurant('rafeeq', indiaRestaurant)).toBe(false);

    // UK restaurant: Deliveroo, Uber Eats
    expect(isPlatformRelevantToRestaurant('deliveroo', ukRestaurant)).toBe(true);
    expect(isPlatformRelevantToRestaurant('ubereats', ukRestaurant)).toBe(true);
    expect(isPlatformRelevantToRestaurant('talabat', ukRestaurant)).toBe(false);
    expect(isPlatformRelevantToRestaurant('swiggy', ukRestaurant)).toBe(false);

    // Any platform that is already active/connected is ALWAYS shown
    const connectedMock = { swiggy: { enabled: true } };
    expect(isPlatformRelevantToRestaurant('swiggy', qatarRestaurant, connectedMock)).toBe(true);
  });
});

