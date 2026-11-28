import { describe, it, expect, beforeEach } from 'vitest';
import { computeOrderTaxes, computePackagingCharge, computeRoundOff } from '../utils/taxUtils';
import { parsePosSearchQuery } from '../utils/posSearch';
import { generateTallyXML, generateGstr1CSV } from '../utils/tallyExport';
import { useOrderStore } from '../stores/orderStore';

describe('Indian Market POS Fast-Billing & Compliance', () => {
  beforeEach(() => {
    useOrderStore.getState().clearCart();
  });

  describe('computeRoundOff', () => {
    it('leaves total unchanged when cashRounding is exact', () => {
      expect(computeRoundOff(247.4, 'exact')).toEqual({
        rawTotal: 247.4,
        roundOffAmount: 0,
        roundedTotal: 247.4
      });
    });

    it('rounds to nearest integer rupee with signed diff', () => {
      expect(computeRoundOff(247.4, 'nearest_integer')).toEqual({
        rawTotal: 247.4,
        roundOffAmount: -0.4,
        roundedTotal: 247
      });
      expect(computeRoundOff(247.65, 'nearest_integer')).toEqual({
        rawTotal: 247.65,
        roundOffAmount: 0.35,
        roundedTotal: 248
      });
    });

    it('rounds to nearest 0.50 increment', () => {
      expect(computeRoundOff(14.65, 'nearest_half')).toEqual({
        rawTotal: 14.65,
        roundOffAmount: -0.15,
        roundedTotal: 14.5
      });
    });
  });

  describe('computePackagingCharge & Packaging GST', () => {
    const sampleItems = [
      { id: '1', name: 'Chicken Biryani', price: 250, qty: 2, packagingCharge: 15 },
      { id: '2', name: 'Lime Soda', price: 60, qty: 1 }
    ];

    it('never applies packaging fee on dine-in orders', () => {
      const fee = computePackagingCharge({
        items: sampleItems,
        orderType: 'dine-in',
        baseSubtotal: 560,
        packagingConfig: { mode: 'flat', amount: 25, applyTo: ['takeaway', 'delivery'], taxable: true }
      });
      expect(fee).toBe(0);
    });

    it('applies flat, percent, and per_item fees for takeaway & delivery unless waived', () => {
      expect(computePackagingCharge({
        items: sampleItems,
        orderType: 'takeaway',
        baseSubtotal: 560,
        packagingConfig: { mode: 'flat', amount: 20, applyTo: ['takeaway', 'delivery'] }
      })).toBe(20);

      expect(computePackagingCharge({
        items: sampleItems,
        orderType: 'delivery',
        baseSubtotal: 560,
        packagingConfig: { mode: 'percent', amount: 5, applyTo: ['takeaway', 'delivery'] }
      })).toBe(28);

      // 2 * 15 (item override) + 1 * 10 (default config amount) = 40
      expect(computePackagingCharge({
        items: sampleItems,
        orderType: 'takeaway',
        baseSubtotal: 560,
        packagingConfig: { mode: 'per_item', amount: 10, applyTo: ['takeaway', 'delivery'] }
      })).toBe(40);

      expect(computePackagingCharge({
        items: sampleItems,
        orderType: 'takeaway',
        baseSubtotal: 560,
        packagingConfig: { mode: 'flat', amount: 20, applyTo: ['takeaway', 'delivery'] },
        waived: true
      })).toBe(0);
    });

    it('adds CGST & SGST on taxable packaging charges', () => {
      const taxRes = computeOrderTaxes(
        [{ id: '1', name: 'Dosa', price: 100, qty: 1 }],
        {},
        { type: 'gst', cgst: 2.5, sgst: 2.5, mode: 'exclusive' },
        { packagingAmount: 20, packagingTaxable: true, orderType: 'takeaway' }
      );
      expect(taxRes.taxTotal).toBe(6); // 5% of (100 + 20)
      expect(taxRes.lines).toEqual([
        { label: 'CGST (2.5%)', amount: 3 },
        { label: 'SGST (2.5%)', amount: 3 }
      ]);
    });
  });

  describe('useOrderStore packaging, rounding & GSTIN', () => {
    it('auto-applies takeaway packaging, supports 1-tap waive, and computes round-off', () => {
      const rest = {
        taxConfig: { type: 'gst', cgst: 2.5, sgst: 2.5, mode: 'exclusive' },
        workflowConfig: {
          cashRounding: 'nearest_integer',
          packagingConfig: { mode: 'flat', amount: 15, applyTo: ['takeaway', 'delivery'], taxable: true }
        }
      };

      const store = useOrderStore.getState();
      store.setOrderType('takeaway');
      store.addItem({ id: 'm1', name: 'Masala Dosa', price: 90, qty: 1 });
      store.setCustomerGstin('27AAAAA0000A1Z5');

      // Base 90 (GST 4.50) + Pack 15 (CGST 0.38 + SGST 0.38 = 0.76) -> rawTotal = 110.26 -> rounded 110 (-0.26)
      expect(useOrderStore.getState().getPackagingAmount(rest)).toBe(15);
      expect(useOrderStore.getState().getRawTotal(rest)).toBe(110.26);
      expect(useOrderStore.getState().getRoundOffAmount(rest)).toBe(-0.26);
      expect(useOrderStore.getState().getTotal(rest)).toBe(110);
      expect(useOrderStore.getState().customerGstin).toBe('27AAAAA0000A1Z5');

      // 1-tap Waive packaging -> Base 90 + 5% GST (4.50) = 94.50 -> Math.round(94.50) = 95 (+0.50)
      useOrderStore.getState().togglePackagingWaived();
      expect(useOrderStore.getState().getPackagingAmount(rest)).toBe(0);
      expect(useOrderStore.getState().getRawTotal(rest)).toBe(94.5);
      expect(useOrderStore.getState().getTotal(rest)).toBe(95);
    });
  });

  describe('parsePosSearchQuery (code*qty speed billing)', () => {
    it('parses code*qty, qty*text, qtyx query, and dietary prefixes without mangling normal dish names', () => {
      expect(parsePosSearchQuery('101*3')).toEqual({ effectiveDietary: null, cleanQuery: '101', qty: 3 });
      expect(parsePosSearchQuery('3*ccb')).toEqual({ effectiveDietary: null, cleanQuery: 'ccb', qty: 3 });
      expect(parsePosSearchQuery('3x101')).toEqual({ effectiveDietary: null, cleanQuery: '101', qty: 3 });
      expect(parsePosSearchQuery('ccb * 4')).toEqual({ effectiveDietary: null, cleanQuery: 'ccb', qty: 4 });
      expect(parsePosSearchQuery('2x paneer tikka')).toEqual({ effectiveDietary: null, cleanQuery: 'paneer tikka', qty: 2 });
      expect(parsePosSearchQuery('veg 105*2')).toEqual({ effectiveDietary: 'veg', cleanQuery: '105', qty: 2 });
      expect(parsePosSearchQuery('Deluxe Burger')).toEqual({ effectiveDietary: null, cleanQuery: 'deluxe burger', qty: 1 });
    });
  });

  describe('Tally XML & GSTR-1 CA Exports', () => {
    const restaurant = { name: 'Dakshin Spice', gstin: '29ABCDE1234F1Z5' };
    const orders = [
      {
        id: 'ORD-1001',
        createdAt: '2026-11-28T10:00:00Z',
        subtotal: 1000,
        packagingAmount: 20,
        taxTotal: 51,
        roundOffAmount: -0.25,
        total: 1070.75,
        paymentMethod: 'khata',
        customerName: 'TechCorp India',
        customerGstin: '29XYZAB9876C1Z2',
        taxInfo: { baseSubtotal: 1000, taxTotal: 51 }
      },
      {
        id: 'ORD-1002',
        createdAt: '2026-11-28T10:15:00Z',
        subtotal: 200,
        taxTotal: 10,
        total: 210,
        paymentMethod: 'upi',
        customerName: 'Walk-in',
        taxInfo: { baseSubtotal: 200, taxTotal: 10 }
      },
      {
        id: 'ORD-1003',
        status: 'cancelled',
        createdAt: '2026-11-28T10:20:00Z',
        subtotal: 100,
        total: 105
      }
    ];

    it('generates Tally XML with PARTYGSTIN, Packaging Charges, Round Off, and Sundry Debtors for Khata', () => {
      const xml = generateTallyXML([orders[0]], restaurant);
      expect(xml).toContain('<PARTYGSTIN>29XYZAB9876C1Z2</PARTYGSTIN>');
      expect(xml).toContain('TechCorp India (Sundry Debtors)');
      expect(xml).toContain('<LEDGERNAME>Packaging Charges</LEDGERNAME>');
      expect(xml).toContain('<LEDGERNAME>Round Off</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>-0.25</AMOUNT>');
    });

    it('generates GSTR-1 CSV with slab summary, B2B/B2CS split, and document continuity', () => {
      const csv = generateGstr1CSV(orders, restaurant);
      expect(csv).toContain('SECTION 1: SLAB-WISE GST SUMMARY (SAC 996331)');
      expect(csv).toContain('5% GST');
      expect(csv).toContain('29XYZAB9876C1Z2');
      expect(csv).toContain('SECTION 3: B2CS (RETAIL WALK-IN CONSOLIDATED)');
      expect(csv).toContain('"3","2","1"');
    });
  });
});
