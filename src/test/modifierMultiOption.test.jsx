// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ModifierModal from '../components/pos/ModifierModal';

vi.mock('../utils/soundNotifications', () => ({
  hapticTap: vi.fn(),
}));

const saladItem = {
  id: 'item_salad',
  name: 'Salad',
  price: 0,
  isVeg: true,
  modifierGroups: [
    {
      id: 'grp_size',
      name: 'Size',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: 'opt_small', name: 'Small', priceAdd: 30 },
        { id: 'opt_large', name: 'Large', priceAdd: 60 },
      ],
    },
  ],
};

describe('ModifierModal — Single-group multi-size selection (e.g. Small & Large)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('starts with no size pre-selected and disables confirm until a size is tapped', () => {
    const onConfirm = vi.fn();
    render(
      <ModifierModal
        item={saladItem}
        currency="INR"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    const confirmBtn = screen.getByRole('button', { name: /Select Size/i });
    expect(confirmBtn.disabled).toBe(true);
  });

  it('allows ordering both Small and Large with independent quantities in a single modal trip', () => {
    const onConfirm = vi.fn();
    render(
      <ModifierModal
        item={saladItem}
        currency="INR"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    // Tap Small -> activates Small at qty 1
    fireEvent.click(screen.getByRole('button', { name: /Small/i }));
    expect(screen.getByRole('button', { name: /Add to Cart · ₹30\.00/i })).toBeTruthy();

    // Increment Small to 2
    fireEvent.click(screen.getByRole('button', { name: /Increase Small quantity/i }));
    expect(screen.getByRole('button', { name: /Add 2 to Cart · ₹60\.00/i })).toBeTruthy();

    // Tap Large -> activates Large at qty 1 WITHOUT deselecting Small
    fireEvent.click(screen.getByRole('button', { name: /Large/i }));

    // Increment Large to 3
    const incLarge = screen.getByRole('button', { name: /Increase Large quantity/i });
    fireEvent.click(incLarge);
    fireEvent.click(incLarge);

    // Total: 2 Small (₹60) + 3 Large (₹180) = 5 items @ ₹240.00
    const confirmBtn = screen.getByRole('button', { name: /Add 5 to Cart · ₹240\.00/i });
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [bulkItems] = onConfirm.mock.calls[0];
    expect(Array.isArray(bulkItems)).toBe(true);
    expect(bulkItems).toHaveLength(2);

    expect(bulkItems[0]).toMatchObject({
      flatPrice: 30,
      qty: 2,
    });
    expect(bulkItems[0].selectedModifiers[0].name).toBe('Small');

    expect(bulkItems[1]).toMatchObject({
      flatPrice: 60,
      qty: 3,
    });
    expect(bulkItems[1].selectedModifiers[0].name).toBe('Large');
  });

  it('opens touch keypad for custom bulk quantity per size (e.g. 20 Small + 10 Large)', () => {
    const onConfirm = vi.fn();
    render(
      <ModifierModal
        item={saladItem}
        currency="INR"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    // Select both sizes
    fireEvent.click(screen.getByRole('button', { name: /Small/i }));
    fireEvent.click(screen.getByRole('button', { name: /Large/i }));

    // Tap Small's quantity badge to open TouchQuantityPadModal
    fireEvent.click(screen.getByRole('button', { name: /Small quantity 1/i }));
    fireEvent.click(screen.getByRole('button', { name: '20' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm: 20/i }));

    // Tap Large's quantity badge to open TouchQuantityPadModal
    fireEvent.click(screen.getByRole('button', { name: /Large quantity 1/i }));
    fireEvent.click(screen.getByRole('button', { name: '10' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm: 10/i }));

    // Total: 20 * 30 (₹600) + 10 * 60 (₹600) = 30 items @ ₹1,200.00
    const confirmBtn = screen.getByRole('button', { name: /Add 30 to Cart · ₹1,200\.00/i });
    fireEvent.click(confirmBtn);

    const [bulkItems] = onConfirm.mock.calls[0];
    expect(bulkItems[0].qty).toBe(20);
    expect(bulkItems[1].qty).toBe(10);
  });

  it('keeps single-item callback signature when only one size is chosen', () => {
    const onConfirm = vi.fn();
    render(
      <ModifierModal
        item={saladItem}
        currency="INR"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Large/i }));
    // Use Quick Preset chip '5' in QuantityBar
    fireEvent.click(screen.getByRole('button', { name: '5' }));

    const confirmBtn = screen.getByRole('button', { name: /Add 5 to Cart · ₹300\.00/i });
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [mods, flatPrice, qty] = onConfirm.mock.calls[0];
    expect(mods).toHaveLength(1);
    expect(mods[0].name).toBe('Large');
    expect(flatPrice).toBeNull();
    expect(qty).toBe(5);
  });

  it('combines multi-size quantities with optional extra modifier groups accurately', () => {
    const pizzaItem = {
      id: 'item_pizza',
      name: 'Margherita',
      price: 100,
      modifierGroups: [
        {
          id: 'grp_size',
          name: 'Size',
          required: true,
          maxSelect: 1,
          options: [
            { id: 'opt_reg', name: 'Regular', priceAdd: 0 },
            { id: 'opt_lg', name: 'Large', priceAdd: 80 },
          ],
        },
        {
          id: 'grp_extras',
          name: 'Add-ons',
          required: false,
          maxSelect: 3,
          options: [
            { id: 'opt_cheese', name: 'Extra Cheese', priceAdd: 30 },
          ],
        },
      ],
    };

    const onConfirm = vi.fn();
    render(
      <ModifierModal
        item={pizzaItem}
        currency="INR"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Regular/i }));
    fireEvent.click(screen.getByRole('button', { name: /Large/i }));
    fireEvent.click(screen.getByRole('button', { name: /Extra Cheese/i }));

    // Regular + Cheese = 100 + 0 + 30 = 130; Large + Cheese = 100 + 80 + 30 = 210; Total = 340
    const confirmBtn = screen.getByRole('button', { name: /Add 2 to Cart · ₹340\.00/i });
    fireEvent.click(confirmBtn);

    const [bulkItems] = onConfirm.mock.calls[0];
    expect(bulkItems).toHaveLength(2);
    expect(bulkItems[0].flatPrice).toBe(130);
    expect(bulkItems[0].selectedModifiers.map(m => m.name)).toEqual(['Regular', 'Extra Cheese']);
    expect(bulkItems[1].flatPrice).toBe(210);
    expect(bulkItems[1].selectedModifiers.map(m => m.name)).toEqual(['Large', 'Extra Cheese']);
  });
});

describe('ModifierModal — Variant Matrix multi-style tabbed selection (e.g. Gravy & Paste)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const garlicChicken = {
    id: 'item_garlic_chicken',
    name: 'Garlic chicken',
    price: 0,
    modifierGroups: [
      {
        id: 'grp_gravy',
        name: 'Gravy',
        required: true,
        maxSelect: 1,
        options: [
          { id: 'opt_g_qtr', name: 'Quarter', priceAdd: 250 },
          { id: 'opt_g_half', name: 'Half', priceAdd: 350 },
          { id: 'opt_g_full', name: 'Full', priceAdd: 750 },
        ],
      },
      {
        id: 'grp_paste',
        name: 'Paste',
        required: true,
        maxSelect: 1,
        options: [
          { id: 'opt_p_qtr', name: 'Quarter', priceAdd: 270 },
          { id: 'opt_p_half', name: 'Half', priceAdd: 340 },
          { id: 'opt_p_full', name: 'Full', priceAdd: 780 },
        ],
      },
    ],
  };

  it('preserves Gravy quantities when switching to Paste and submits both styles together', () => {
    const onConfirm = vi.fn();
    render(
      <ModifierModal
        item={garlicChicken}
        currency="INR"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    // Pick 2 Gravy Quarter (2 * 250 = 500)
    fireEvent.click(screen.getByRole('button', { name: /Quarter/i }));
    fireEvent.click(screen.getByRole('button', { name: /Increase Quarter quantity/i }));
    expect(screen.getByRole('button', { name: /Add 2 to Cart · ₹500\.00/i })).toBeTruthy();

    // Switch to Paste tab — Quarter should NOT carry over to Paste, while Gravy keeps its 2 badge
    fireEvent.click(screen.getByRole('button', { name: /Paste/i }));
    expect(screen.getByRole('button', { name: /^Gravy\s*2$/i })).toBeTruthy();

    // Pick 1 Paste Full (780)
    fireEvent.click(screen.getByRole('button', { name: /Full/i }));
    expect(screen.getByRole('button', { name: /^Paste\s*1$/i })).toBeTruthy();
    expect(screen.getByText('✓ 2 styles')).toBeTruthy();

    // Combined total: 2 Gravy Quarter (₹500) + 1 Paste Full (₹780) = 3 items @ ₹1,280.00
    const confirmBtn = screen.getByRole('button', { name: /Add 3 to Cart · ₹1,280\.00/i });
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [bulkItems] = onConfirm.mock.calls[0];
    expect(bulkItems).toHaveLength(2);

    expect(bulkItems[0]).toMatchObject({ flatPrice: 250, qty: 2 });
    expect(bulkItems[0].selectedModifiers.map(m => m.name)).toEqual(['Gravy', 'Quarter']);

    expect(bulkItems[1]).toMatchObject({ flatPrice: 780, qty: 1 });
    expect(bulkItems[1].selectedModifiers.map(m => m.name)).toEqual(['Paste', 'Full']);
  });
});

describe('ModifierModal — Petpooja Style Variations & Sides workflow', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const bhaajiPav = {
    id: 'item_bhaaji_pav',
    name: 'Bhaaji Pav',
    price: 0,
    modifierGroups: [
      {
        id: 'grp_variation',
        name: 'Variation',
        required: true,
        maxSelect: 1,
        options: [
          { id: 'opt_oil', name: 'Oil', priceAdd: 300 },
          { id: 'opt_butter', name: 'Butter', priceAdd: 400 },
        ],
      },
      {
        id: 'grp_sides',
        name: 'Sides',
        required: false,
        maxSelect: 5,
        options: [
          { id: 'opt_onions', name: 'Onions', priceAdd: 25 },
          { id: 'opt_coriander', name: 'Coriander Chutney', priceAdd: 25 },
          { id: 'opt_curd', name: 'Curd', priceAdd: 25 },
          { id: 'opt_pudina', name: 'Pudina Chutney', priceAdd: 25 },
        ],
      },
    ],
  };

  it('selects Butter variation with Onions and Coriander Chutney sides accurately', () => {
    const onConfirm = vi.fn();
    render(
      <ModifierModal
        item={bhaajiPav}
        currency="INR"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    // Initial state: variation required
    expect(screen.getByRole('button', { name: /Select Variation/i }).disabled).toBe(true);

    // Select Butter variation (₹400)
    fireEvent.click(screen.getByRole('button', { name: /Butter/i }));
    expect(screen.getAllByText(/₹400\.00/).length).toBeGreaterThanOrEqual(1);

    // Select Onions (+₹25) and Coriander Chutney (+₹25)
    fireEvent.click(screen.getByRole('button', { name: /Onions/i }));
    fireEvent.click(screen.getByRole('button', { name: /Coriander Chutney/i }));

    // Total: 400 + 25 + 25 = ₹450.00
    const confirmBtn = screen.getByRole('button', { name: /Add to Cart · ₹450\.00/i });
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [mods, flatPrice, qty] = onConfirm.mock.calls[0];
    expect(mods.map(m => m.name)).toEqual(['Butter', 'Onions', 'Coriander Chutney']);
    expect(qty).toBe(1);
  });

  it('filters sides via search addon item input', () => {
    render(
      <ModifierModal
        item={bhaajiPav}
        currency="INR"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search addon item/i);
    fireEvent.change(searchInput, { target: { value: 'Pudina' } });

    // Pudina Chutney should be visible, while Onions should be filtered out
    expect(screen.getByRole('button', { name: /Pudina Chutney/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Onions/i })).toBeNull();
  });
});
