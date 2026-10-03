import { describe, it, expect, beforeEach } from 'vitest';
import { useMenuStore, checkHasMenuImages } from '../stores/menuStore';

describe('menuStore auto-density detection (Cards vs Fast Keys)', () => {
  beforeEach(() => {
    // Clear localStorage between test runs
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('checkHasMenuImages helper', () => {
    it('returns false when categories is empty or null', () => {
      expect(checkHasMenuImages([])).toBe(false);
      expect(checkHasMenuImages(null)).toBe(false);
      expect(checkHasMenuImages(undefined)).toBe(false);
    });

    it('returns false when items have no imageUrl or image property', () => {
      const catsNoImages = [
        {
          id: 'cat1',
          name: 'Burgers',
          items: [
            { id: '1', name: 'Cheeseburger', price: 10 },
            { id: '2', name: 'Veggie Burger', price: 9, imageUrl: '', image: '   ' },
          ],
        },
      ];
      expect(checkHasMenuImages(catsNoImages)).toBe(false);
    });

    it('returns true when even a single item in any category has an image', () => {
      const catsWithSingleImage = [
        {
          id: 'cat1',
          name: 'Burgers',
          items: [
            { id: '1', name: 'Cheeseburger', price: 10, imageUrl: 'https://example.com/burger.jpg' },
            { id: '2', name: 'Veggie Burger', price: 9 },
          ],
        },
        {
          id: 'cat2',
          name: 'Drinks',
          items: [{ id: '3', name: 'Cola', price: 2 }],
        },
      ];
      expect(checkHasMenuImages(catsWithSingleImage)).toBe(true);
    });
  });

  describe('dynamic auto-switching behavior', () => {
    it('automatically selects Fast Keys (dense) when restaurant has no images', () => {
      const catsNoImages = [
        {
          id: 'cat1',
          name: 'Pizzas',
          items: [
            { id: 'p1', name: 'Margherita', price: 12 },
            { id: 'p2', name: 'Pepperoni', price: 14 },
          ],
        },
      ];

      useMenuStore.getState().setCategories(catsNoImages);
      expect(useMenuStore.getState().menuDensity).toBe('dense');
      expect(useMenuStore.getState().hasImages).toBe(false);
    });

    it('automatically switches to Cards (visual) when a single image is uploaded', () => {
      // 1. Initial state with zero images -> Fast Keys
      const catsNoImages = [
        {
          id: 'cat1',
          name: 'Pizzas',
          items: [{ id: 'p1', name: 'Margherita', price: 12 }],
        },
      ];
      useMenuStore.getState().setCategories(catsNoImages);
      expect(useMenuStore.getState().menuDensity).toBe('dense');

      // 2. Upload photo for Margherita -> auto-switches to visual Cards view!
      const catsWithImage = [
        {
          id: 'cat1',
          name: 'Pizzas',
          items: [{ id: 'p1', name: 'Margherita', price: 12, imageUrl: 'https://example.com/pizza.jpg' }],
        },
      ];
      useMenuStore.getState().setCategories(catsWithImage);
      expect(useMenuStore.getState().menuDensity).toBe('visual');
      expect(useMenuStore.getState().hasImages).toBe(true);
    });

    it('automatically switches back to Fast Keys (dense) if all images are deleted', () => {
      const catsWithImage = [
        {
          id: 'cat1',
          name: 'Pizzas',
          items: [{ id: 'p1', name: 'Margherita', price: 12, imageUrl: 'https://example.com/pizza.jpg' }],
        },
      ];
      useMenuStore.getState().setCategories(catsWithImage);
      expect(useMenuStore.getState().menuDensity).toBe('visual');

      // Remove the image
      const catsNoImages = [
        {
          id: 'cat1',
          name: 'Pizzas',
          items: [{ id: 'p1', name: 'Margherita', price: 12, imageUrl: '' }],
        },
      ];
      useMenuStore.getState().setCategories(catsNoImages);
      expect(useMenuStore.getState().menuDensity).toBe('dense');
      expect(useMenuStore.getState().hasImages).toBe(false);
    });

    it('allows manual override when cashier explicitly clicks a view button', () => {
      // Manually set to visual
      useMenuStore.getState().setMenuDensity('visual', true);
      expect(useMenuStore.getState().menuDensity).toBe('visual');

      // Manually set to dense
      useMenuStore.getState().setMenuDensity('dense', true);
      expect(useMenuStore.getState().menuDensity).toBe('dense');
    });
  });
});
