import { describe, it, expect } from 'vitest';
import { BUSINESS_PRESETS } from '../hooks/useBusinessConfig';

describe('Business Configuration & Profiles Suite', () => {
  it('defines all six core business presets with required fields', () => {
    const expectedIds = ['bill_only', 'cafe', 'qsr', 'restaurant', 'retail', 'service'];
    const presetIds = BUSINESS_PRESETS.map(p => p.id);

    expectedIds.forEach(id => {
      expect(presetIds).toContain(id);
    });

    BUSINESS_PRESETS.forEach(preset => {
      expect(preset.name).toBeDefined();
      expect(preset.emoji).toBeDefined();
      expect(Array.isArray(preset.recommendedModes)).toBe(true);
      expect(preset.recommendedModes).toContain('pos');
      expect(preset.terminology).toBeDefined();
      expect(preset.terminology.catalog).toBeDefined();
      expect(preset.terminology.item).toBeDefined();
      expect(preset.features).toBeDefined();
      expect(typeof preset.features.enableQuickPay).toBe('boolean');
    });
  });

  it('provides tailored terminology per business type', () => {
    const cafe = BUSINESS_PRESETS.find(p => p.id === 'cafe');
    const retail = BUSINESS_PRESETS.find(p => p.id === 'retail');
    const service = BUSINESS_PRESETS.find(p => p.id === 'service');
    const restaurant = BUSINESS_PRESETS.find(p => p.id === 'restaurant');

    expect(cafe.terminology.catalog).toBe('Menu');
    expect(cafe.terminology.staff).toBe('Barista');

    expect(retail.terminology.catalog).toBe('Products');
    expect(retail.terminology.item).toBe('Product');
    expect(retail.terminology.staff).toBe('Sales Associate');

    expect(service.terminology.catalog).toBe('Services');
    expect(service.terminology.item).toBe('Service');
    expect(service.terminology.staff).toBe('Stylist / Specialist');

    expect(restaurant.terminology.location).toBe('Table');
    expect(restaurant.features.enableTableMap).toBe(true);
  });

  it('correctly configures feature flags for fast-service and retail', () => {
    const qsr = BUSINESS_PRESETS.find(p => p.id === 'qsr');
    const retail = BUSINESS_PRESETS.find(p => p.id === 'retail');

    expect(qsr.features.enableQuickPay).toBe(true);
    expect(qsr.features.enableSpeedDial).toBe(true);

    expect(retail.features.enableBarcode).toBe(true);
    expect(retail.features.enableQuickPay).toBe(true);
    expect(retail.features.enableTableMap).toBe(false);
  });

  it('calculates tax exclusive vs inclusive amounts accurately', () => {
    const samplePrice = 100;
    const taxRate = 5; // 5%

    // Exclusive calculation
    const exclBase = samplePrice;
    const exclTax = (samplePrice * taxRate) / 100;
    const exclTotal = exclBase + exclTax;

    expect(exclTax).toBe(5);
    expect(exclTotal).toBe(105);

    // Inclusive calculation
    const inclTotal = samplePrice;
    const inclBase = samplePrice / (1 + taxRate / 100);
    const inclTax = inclTotal - inclBase;

    expect(Math.round(inclBase * 100) / 100).toBe(95.24);
    expect(Math.round(inclTax * 100) / 100).toBe(4.76);
    expect(Math.round((inclBase + inclTax) * 100) / 100).toBe(100);
  });

  it('computes rounded cash options for quick-pay cashier queue busting', () => {
    const total = 340;
    const step = 50;
    const nextRound = Math.ceil(total / step) * step;
    expect(nextRound).toBe(350);
    expect(nextRound - total).toBe(10); // 10 change

    const step100 = 100;
    const next100 = Math.ceil(total / step100) * step100;
    expect(next100).toBe(400);
    expect(next100 - total).toBe(60); // 60 change
  });

  it('correctly configures Bill Only / Express Counter with zero kitchen & zero tables', () => {
    const billOnly = BUSINESS_PRESETS.find(p => p.id === 'bill_only');
    expect(billOnly).toBeDefined();
    expect(billOnly.recommendedModes).toEqual(['pos', 'till_shift']);
    expect(billOnly.features.enableKds).toBe(false);
    expect(billOnly.features.enableTableMap).toBe(false);
    expect(billOnly.features.enableQuickPay).toBe(true);

    // Verify kitchen is strictly inactive in bill_only even if legacy kitchenConfig has mode: 'both'
    const mockRestaurant = {
      businessType: 'bill_only',
      modes: ['pos', 'till_shift'],
      kitchenConfig: { mode: 'both' }
    };

    const isBillOnly = mockRestaurant.businessType === 'bill_only';
    const hasKdsMode = mockRestaurant.modes.includes('kds');
    const isKitchenActive = !isBillOnly && (
      mockRestaurant.kitchenConfig?.mode === 'disabled'
        ? false
        : (hasKdsMode || (mockRestaurant.peripheralConfig?.printers?.some(p => p.type === 'kitchen') && mockRestaurant.kitchenConfig?.mode === 'printer_only'))
    );

    expect(isKitchenActive).toBe(false);
  });
});

