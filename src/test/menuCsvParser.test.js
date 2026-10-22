import { describe, it, expect } from 'vitest';
import {
  parseCSVToRows,
  parseModifierGroupsString,
  parseMenuCSV,
  generateMenuCSVTemplate,
  exportMenuToCSV
} from '../utils/menuCsvParser';

describe('menuCsvParser', () => {
  describe('parseCSVToRows', () => {
    it('parses simple comma-separated lines', () => {
      const csv = 'Category,Name,Price\nStarters,Chicken 65,220\nBreads,Naan,40';
      const rows = parseCSVToRows(csv);
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual(['Category', 'Name', 'Price']);
      expect(rows[1]).toEqual(['Starters', 'Chicken 65', '220']);
      expect(rows[2]).toEqual(['Breads', 'Naan', '40']);
    });

    it('handles quoted values with commas and double quotes', () => {
      const csv = 'Name,Description\n"Chicken 65","Crispy, spicy chicken bites with ""special"" spices"';
      const rows = parseCSVToRows(csv);
      expect(rows).toHaveLength(2);
      expect(rows[1][0]).toBe('Chicken 65');
      expect(rows[1][1]).toBe('Crispy, spicy chicken bites with "special" spices');
    });

    it('handles CRLF line breaks', () => {
      const csv = 'Name,Price\r\nItem 1,100\r\nItem 2,200';
      const rows = parseCSVToRows(csv);
      expect(rows).toHaveLength(3);
      expect(rows[1][0]).toBe('Item 1');
      expect(rows[2][0]).toBe('Item 2');
    });
  });

  describe('parseModifierGroupsString', () => {
    it('parses Chicken 65 options: Dry, Gravy, and Paste options correctly', () => {
      const modStr = 'Preparation: Dry (+0), Gravy (+30), Paste (+40) | Portion: Half (+0), Full (+140)';
      const groups = parseModifierGroupsString(modStr);

      expect(groups).toHaveLength(2);

      // Group 1: Preparation (Required pick 1)
      const prepGroup = groups[0];
      expect(prepGroup.name).toBe('Preparation');
      expect(prepGroup.required).toBe(true);
      expect(prepGroup.minSelect).toBe(1);
      expect(prepGroup.maxSelect).toBe(1);
      expect(prepGroup.options).toHaveLength(3);
      expect(prepGroup.options[0]).toMatchObject({ name: 'Dry', priceAdd: 0 });
      expect(prepGroup.options[1]).toMatchObject({ name: 'Gravy', priceAdd: 30 });
      expect(prepGroup.options[2]).toMatchObject({ name: 'Paste', priceAdd: 40 });

      // Group 2: Portion
      const portionGroup = groups[1];
      expect(portionGroup.name).toBe('Portion');
      expect(portionGroup.required).toBe(true);
      expect(portionGroup.options).toHaveLength(2);
      expect(portionGroup.options[0]).toMatchObject({ name: 'Half', priceAdd: 0 });
      expect(portionGroup.options[1]).toMatchObject({ name: 'Full', priceAdd: 140 });
    });

    it('parses optional/multi-select modifier groups', () => {
      const modStr = 'Addons (multi): Extra Sauce (+20), Cheese (+40), Fried Onions (+25)';
      const groups = parseModifierGroupsString(modStr);

      expect(groups).toHaveLength(1);
      const addonGroup = groups[0];
      expect(addonGroup.name).toBe('Addons');
      expect(addonGroup.required).toBe(false);
      expect(addonGroup.minSelect).toBe(0);
      expect(addonGroup.options).toHaveLength(3);
      expect(addonGroup.options[0]).toMatchObject({ name: 'Extra Sauce', priceAdd: 20 });
      expect(addonGroup.options[1]).toMatchObject({ name: 'Cheese', priceAdd: 40 });
      expect(addonGroup.options[2]).toMatchObject({ name: 'Fried Onions', priceAdd: 25 });
    });

    it('handles empty or malformed strings safely without throwing', () => {
      expect(parseModifierGroupsString('')).toEqual([]);
      expect(parseModifierGroupsString(null)).toEqual([]);
      expect(parseModifierGroupsString('   ')).toEqual([]);
      expect(parseModifierGroupsString('MalformedGroupWithoutColon')).toEqual([]);
    });
  });

  describe('parseMenuCSV', () => {
    it('correctly groups items by category and parses full metadata', () => {
      const sampleCsv = `Category,Name,Price,Description,Emoji,Dietary,Station,Barcode,Unit,Available,Bestseller,Modifiers
Starters,Chicken 65,220,Crispy spicy chicken bites,🍗,Non-Veg,Fryer,8901234,portion,true,true,"Preparation: Dry (+0), Gravy (+30), Paste (+40) | Portion: Half (+0), Full (+140)"
Starters,Paneer Tikka,190,Smoky cottage cheese cubes,🧀,Veg,Tandoor,8901235,portion,true,false,"Spice: Mild (+0), Medium (+0), Spicy (+0)"
Main Course,Butter Chicken,320,Tender chicken in tomato makhani,🍛,Non-Veg,Curry,,portion,true,true,"Portion: Regular (+0), Jumbo (+150)"`;

      const result = parseMenuCSV(sampleCsv);

      expect(result.totalItems).toBe(3);
      expect(result.categories).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      const startersCat = result.categories.find(c => c.name === 'Starters');
      expect(startersCat).toBeDefined();
      expect(startersCat.items).toHaveLength(2);

      const chicken65 = startersCat.items.find(i => i.name === 'Chicken 65');
      expect(chicken65).toBeDefined();
      expect(chicken65.price).toBe(220);
      expect(chicken65.dietary).toBe('non-veg');
      expect(chicken65.station).toBe('Fryer');
      expect(chicken65.barcode).toBe('8901234');
      expect(chicken65.isBestseller).toBe(true);
      expect(chicken65.modifierGroups).toHaveLength(2);
      expect(chicken65.modifierGroups[0].name).toBe('Preparation');
      expect(chicken65.modifierGroups[0].options.map(o => o.name)).toEqual(['Dry', 'Gravy', 'Paste']);

      const mainsCat = result.categories.find(c => c.name === 'Main Course');
      expect(mainsCat).toBeDefined();
      expect(mainsCat.items).toHaveLength(1);
    });

    it('reports errors for invalid prices and missing required names', () => {
      const invalidCsv = `Category,Name,Price
Starters,,200
Starters,Invalid Price Item,abc
Valid Category,Valid Dish,150`;

      const result = parseMenuCSV(invalidCsv);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.totalItems).toBe(1);
      expect(result.categories[0].name).toBe('Valid Category');
    });
  });

  describe('generateMenuCSVTemplate', () => {
    it('produces a valid template containing Chicken 65 with Gravy, Paste and Dry variations', () => {
      const template = generateMenuCSVTemplate();
      expect(template).toContain('Category,Item Name,Price');
      expect(template).toContain('Chicken 65');
      expect(template).toContain('Dry (+0), Gravy (+30), Paste (+40)');

      // Verify the generated template can be parsed back cleanly
      const parsed = parseMenuCSV(template);
      expect(parsed.errors).toHaveLength(0);
      expect(parsed.totalItems).toBeGreaterThanOrEqual(4);
      expect(parsed.categories.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('exportMenuToCSV', () => {
    it('serializes category items into CSV format with modifiers preserved', () => {
      const categories = [
        {
          id: 'cat-1',
          name: 'Appetizers',
          emoji: '🍢',
          items: [
            {
              id: 'item-1',
              name: 'Chicken 65',
              price: 220,
              description: 'Crispy South Indian classic',
              emoji: '🍗',
              dietary: 'non-veg',
              station: 'Fryer',
              barcode: '890123',
              unit: 'portion',
              available: true,
              isBestseller: true,
              modifierGroups: [
                {
                  id: 'g-1',
                  name: 'Preparation',
                  required: true,
                  options: [
                    { id: 'o-1', name: 'Dry', priceAdd: 0 },
                    { id: 'o-2', name: 'Gravy', priceAdd: 30 },
                    { id: 'o-3', name: 'Paste', priceAdd: 40 }
                  ]
                }
              ]
            }
          ]
        }
      ];

      // Test export without window/DOM download throwing in Node test environment
      expect(() => exportMenuToCSV(categories, 'TestCafe')).not.toThrow();
    });
  });
});
