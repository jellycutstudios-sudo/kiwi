import { describe, it, expect } from 'vitest';
import {
  calculateLocalizedPrice,
  prepareMasterMenuPayload,
  applyGlobal86,
  checkEnterprisePermission,
  ENTERPRISE_ROLES
} from '../utils/enterpriseMenuSync';

describe('Pillar 4: Multi-Store Enterprise Franchise Engine', () => {
  describe('calculateLocalizedPrice', () => {
    it('applies percentage markup for premium or airport branches', () => {
      // 10% markup on a $20.00 burger
      const price = calculateLocalizedPrice(20, { type: 'percent', value: 10 });
      expect(price).toBe(22.00);
    });

    it('applies percentage discount for suburban or promotional outlets', () => {
      // 5% discount on a $40.00 steak
      const price = calculateLocalizedPrice(40, { type: 'percent', value: -5 });
      expect(price).toBe(38.00);
    });

    it('applies flat fixed surcharge', () => {
      // +$3.50 flat fee
      const price = calculateLocalizedPrice(15, { type: 'fixed', value: 3.5 });
      expect(price).toBe(18.50);
    });

    it('respects explicit item override over percentage adjustments', () => {
      const explicit = { 'dish_signature_burger': 24.99 };
      const price = calculateLocalizedPrice(
        18,
        { type: 'percent', value: 20 },
        explicit,
        'dish_signature_burger'
      );
      expect(price).toBe(24.99);
    });

    it('supports smart roundTo nearest 0.50 increment', () => {
      // 12 * 1.15 = 13.8 -> nearest 0.50 is 14.00
      const price = calculateLocalizedPrice(12, { type: 'percent', value: 15, roundTo: 0.5 });
      expect(price).toBe(14.00);
    });
  });

  describe('prepareMasterMenuPayload', () => {
    const masterCategories = [
      {
        id: 'cat_pizzas',
        name: 'Artisan Pizzas',
        emoji: '🍕',
        items: [
          { id: 'item_margherita', name: 'Margherita Pizza', price: 14, isVeg: true },
          { id: 'item_diavola', name: 'Diavola Spicy', price: 18, isVeg: false }
        ]
      }
    ];

    it('generates branch-specific menu payload with price adjustments and inheritance tags', () => {
      const payload = prepareMasterMenuPayload(masterCategories, {
        adjustment: { type: 'percent', value: 10 }
      });

      expect(payload.length).toBe(1);
      expect(payload[0].name).toBe('Artisan Pizzas');
      expect(payload[0].items.length).toBe(2);

      const margherita = payload[0].items[0];
      expect(margherita.masterBasePrice).toBe(14);
      expect(margherita.price).toBe(15.4); // 14 + 10%
      expect(margherita.isMasterInherited).toBe(true);
      expect(margherita.lastSyncedAt).toBeDefined();

      const diavola = payload[0].items[1];
      expect(diavola.price).toBe(19.8); // 18 + 10%
    });
  });

  describe('applyGlobal86', () => {
    const branch1Menu = [
      {
        items: [
          { id: 'b1_item1', name: 'Avocado Toast', available: true },
          { id: 'b1_item2', name: 'Latte', available: true }
        ]
      }
    ];

    const branch2Menu = [
      {
        items: [
          { id: 'b2_item1', name: 'Avocado Toast', available: true },
          { id: 'b2_item3', name: 'Cold Brew', available: true }
        ]
      }
    ];

    it('86es an item across multiple branch menus in one action', () => {
      const res = applyGlobal86([branch1Menu, branch2Menu], 'Avocado Toast', false);
      expect(res.affectedBranches).toBe(2);
      expect(res.totalItemsUpdated).toBe(2);

      const b1Updated = res.updatedOutlets[0][0].items.find(i => i.name === 'Avocado Toast');
      expect(b1Updated.available).toBe(false);
      expect(b1Updated.eightySixedAt).toBeDefined();

      const b2Updated = res.updatedOutlets[1][0].items.find(i => i.name === 'Avocado Toast');
      expect(b2Updated.available).toBe(false);
    });

    it('restores an 86ed item back to available across branches', () => {
      const res = applyGlobal86([branch1Menu, branch2Menu], 'Avocado Toast', true);
      const b1 = res.updatedOutlets[0][0].items.find(i => i.name === 'Avocado Toast');
      expect(b1.available).toBe(true);
      expect(b1.eightySixedAt).toBeNull();
    });
  });

  describe('checkEnterprisePermission & Role Hierarchy', () => {
    it('grants franchise_owner global permissions', () => {
      expect(checkEnterprisePermission('franchise_owner', 'view_all_stores')).toBe(true);
      expect(checkEnterprisePermission('franchise_owner', 'manage_all_menus')).toBe(true);
      expect(checkEnterprisePermission('franchise_owner', 'global_86')).toBe(true);
      expect(checkEnterprisePermission('franchise_owner', 'export_financials')).toBe(true);
    });

    it('restricts store_manager from global franchise-level menu pushes and billing', () => {
      expect(checkEnterprisePermission('store_manager', 'view_store')).toBe(true);
      expect(checkEnterprisePermission('store_manager', 'manage_store_staff')).toBe(true);
      expect(checkEnterprisePermission('store_manager', 'manage_billing')).toBe(false);
      expect(checkEnterprisePermission('store_manager', 'push_master_menu')).toBe(false);
    });

    it('restricts cashier to POS and handheld operational permissions', () => {
      expect(checkEnterprisePermission('cashier', 'pos_register')).toBe(true);
      expect(checkEnterprisePermission('cashier', 'handheld_mode')).toBe(true);
      expect(checkEnterprisePermission('cashier', 'manage_all_menus')).toBe(false);
      expect(checkEnterprisePermission('cashier', 'export_financials')).toBe(false);
    });
  });
});
