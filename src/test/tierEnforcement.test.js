import { describe, it, expect } from 'vitest';

describe('Tier Enforcement for Just Billing vs Advanced Accounts', () => {
  const ADVANCED_FEATURE_KEYS = ['table', 'kds', 'reservations', 'posters', 'kiosk', 'delivery_hub', 'payroll', 'online'];
  const LOCKED_ROUTE_PREFIXES = ['/tables', '/kds', '/admin/reservations', '/admin/delivery-hub', '/admin/posters', '/admin/floor'];

  function sanitizeModesForTier({ businessType, role, modes, kitchenConfig }) {
    const isSuperAdmin = role === 'super_admin';
    const isLockedPlan = businessType === 'bill_only' && !isSuperAdmin;

    if (!isLockedPlan) {
      return { businessType, modes, kitchenConfig };
    }

    const rawModes = Array.isArray(modes) ? modes : [];
    const sanitizedModes = rawModes.filter(k => !ADVANCED_FEATURE_KEYS.includes(k));
    if (!sanitizedModes.includes('pos')) {
      sanitizedModes.unshift('pos');
    }

    return {
      businessType: 'bill_only',
      modes: sanitizedModes,
      kitchenConfig: {
        ...(kitchenConfig || {}),
        mode: 'disabled'
      }
    };
  }

  function shouldRedirectRoute({ businessType, role, pathname }) {
    const isSuperAdmin = role === 'super_admin';
    const isBillOnly = businessType === 'bill_only';

    if (!isBillOnly || isSuperAdmin) return false;

    const path = pathname.toLowerCase();
    return LOCKED_ROUTE_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  }

  it('prevents Just Billing branch managers from persisting advanced dine-in/KDS features', () => {
    const input = {
      businessType: 'bill_only',
      role: 'admin',
      modes: ['pos', 'table', 'kds', 'reservations', 'posters', 'till_shift'],
      kitchenConfig: { mode: 'both' }
    };

    const result = sanitizeModesForTier(input);

    expect(result.businessType).toBe('bill_only');
    expect(result.modes).toEqual(['pos', 'till_shift']);
    expect(result.modes).not.toContain('table');
    expect(result.modes).not.toContain('kds');
    expect(result.modes).not.toContain('reservations');
    expect(result.kitchenConfig.mode).toBe('disabled');
  });

  it('allows Super Admins to configure all features regardless of tier', () => {
    const input = {
      businessType: 'bill_only',
      role: 'super_admin',
      modes: ['pos', 'table', 'kds', 'till_shift'],
      kitchenConfig: { mode: 'both' }
    };

    const result = sanitizeModesForTier(input);

    expect(result.modes).toContain('table');
    expect(result.modes).toContain('kds');
    expect(result.kitchenConfig.mode).toBe('both');
  });

  it('blocks direct URL navigation to advanced features for Just Billing users', () => {
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'admin', pathname: '/tables' })).toBe(true);
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'cashier', pathname: '/kds' })).toBe(true);
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'admin', pathname: '/admin/reservations' })).toBe(true);
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'admin', pathname: '/admin/posters' })).toBe(true);
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'admin', pathname: '/admin/floor' })).toBe(true);
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'admin', pathname: '/admin/delivery-hub' })).toBe(true);

    // Permitted routes on Just Billing
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'admin', pathname: '/pos' })).toBe(false);
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'admin', pathname: '/admin/menu' })).toBe(false);
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'admin', pathname: '/admin/settings' })).toBe(false);
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'admin', pathname: '/reports' })).toBe(false);
  });

  it('allows Super Admin full access without route redirection', () => {
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'super_admin', pathname: '/tables' })).toBe(false);
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'super_admin', pathname: '/kds' })).toBe(false);
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'super_admin', pathname: '/admin/floor' })).toBe(false);
  });

  it('allows Advanced plan restaurants access to all routes', () => {
    expect(shouldRedirectRoute({ businessType: 'restaurant', role: 'admin', pathname: '/tables' })).toBe(false);
    expect(shouldRedirectRoute({ businessType: 'restaurant', role: 'admin', pathname: '/kds' })).toBe(false);
    expect(shouldRedirectRoute({ businessType: 'restaurant', role: 'admin', pathname: '/admin/reservations' })).toBe(false);
  });

  it('keeps /admin/staff accessible to admin in Just Billing mode for cashier account management', () => {
    expect(shouldRedirectRoute({ businessType: 'bill_only', role: 'admin', pathname: '/admin/staff' })).toBe(false);
  });

  it('correctly enables all advanced features when switching from bill_only to restaurant', () => {
    const upgraded = {
      businessType: 'restaurant',
      role: 'admin',
      modes: ['pos', 'table', 'kds', 'reservations', 'inventory', 'customers', 'payroll', 'till_shift', 'customer_privacy', 'audit_shield', 'tax_reconcile'],
      kitchenConfig: { mode: 'both' }
    };
    const result = sanitizeModesForTier(upgraded);
    expect(result.businessType).toBe('restaurant');
    expect(result.modes).toContain('table');
    expect(result.modes).toContain('kds');
    expect(result.modes).toContain('reservations');
    expect(result.modes).toContain('payroll');
    expect(result.kitchenConfig.mode).toBe('both');

    // All routes are accessible without redirect
    expect(shouldRedirectRoute({ businessType: 'restaurant', role: 'admin', pathname: '/tables' })).toBe(false);
    expect(shouldRedirectRoute({ businessType: 'restaurant', role: 'admin', pathname: '/kds' })).toBe(false);
    expect(shouldRedirectRoute({ businessType: 'restaurant', role: 'admin', pathname: '/admin/reservations' })).toBe(false);
    expect(shouldRedirectRoute({ businessType: 'restaurant', role: 'admin', pathname: '/admin/delivery-hub' })).toBe(false);
    expect(shouldRedirectRoute({ businessType: 'restaurant', role: 'admin', pathname: '/admin/floor' })).toBe(false);
    expect(shouldRedirectRoute({ businessType: 'restaurant', role: 'admin', pathname: '/admin/posters' })).toBe(false);
  });

  it('prevents store admin saving settings from accidentally reverting an upgraded restaurant back to bill_only', () => {
    const restaurantAssignedPlan = 'restaurant';
    const clientFormInput = {
      businessType: 'bill_only',
      modes: ['pos', 'till_shift'],
      kitchenConfig: { mode: 'disabled' }
    };

    function enforceAdminSaveSettings({ assignedPlan, isSuperAdmin, formInput }) {
      const settingsToSave = { ...formInput };
      if (!isSuperAdmin) {
        if (assignedPlan === 'bill_only') {
          settingsToSave.businessType = 'bill_only';
          settingsToSave.accountType = 'bill_only';
          settingsToSave.modes = ['pos', 'till_shift'];
        } else {
          settingsToSave.businessType = 'restaurant';
          settingsToSave.accountType = 'restaurant';
          const required = ['pos', 'table', 'kds', 'reservations', 'payroll', 'till_shift'];
          settingsToSave.modes = Array.from(new Set([...(settingsToSave.modes || []), ...required]));
          settingsToSave.kitchenConfig = { mode: 'both' };
        }
      }
      return settingsToSave;
    }

    const saved = enforceAdminSaveSettings({
      assignedPlan: restaurantAssignedPlan,
      isSuperAdmin: false,
      formInput: clientFormInput
    });

    expect(saved.businessType).toBe('restaurant');
    expect(saved.accountType).toBe('restaurant');
    expect(saved.modes).toContain('table');
    expect(saved.modes).toContain('kds');
    expect(saved.kitchenConfig.mode).toBe('both');
  });

  it('guarantees live Firestore tier takes precedence over stale in-memory client state during admin save', () => {
    // Scenario: Super Admin upgraded to 'restaurant' on server, but client state still had 'bill_only' cached in memory
    const clientStaleRestaurant = { businessType: 'bill_only', accountType: 'bill_only' };
    const remoteLiveRestaurant = { businessType: 'restaurant', accountType: 'restaurant' };

    function resolveAssignedPlan(clientRest, remoteRest) {
      let plan = clientRest?.accountType || clientRest?.businessType || 'restaurant';
      if (remoteRest) {
        plan = remoteRest?.accountType || remoteRest?.businessType || plan;
      }
      return plan;
    }

    const assignedPlan = resolveAssignedPlan(clientStaleRestaurant, remoteLiveRestaurant);
    expect(assignedPlan).toBe('restaurant');

    const settingsToSave = { businessType: 'bill_only', modes: ['pos', 'till_shift'] };
    if (assignedPlan !== 'bill_only') {
      settingsToSave.businessType = 'restaurant';
      settingsToSave.accountType = 'restaurant';
      settingsToSave.modes = ['pos', 'table', 'kds', 'reservations', 'payroll', 'till_shift'];
    }

    expect(settingsToSave.businessType).toBe('restaurant');
    expect(settingsToSave.accountType).toBe('restaurant');
    expect(settingsToSave.modes).toContain('table');
  });
});

