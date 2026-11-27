import { describe, it, expect } from 'vitest';
import { compareTables, getTableFloor } from '../utils/tableSort';

describe('tableSort', () => {
  it('defaults missing floor to Ground Floor', () => {
    expect(getTableFloor({ name: 'T1' })).toBe('Ground Floor');
    expect(getTableFloor({ name: 'R1', floor: 'Rooftop' })).toBe('Rooftop');
  });

  it('sorts by sortOrder first, then natural numeric name', () => {
    const tables = [
      { id: '1', name: 'Big' },
      { id: '2', name: 'T10' },
      { id: '3', name: 'T2', sortOrder: 10 },
      { id: '4', name: 'T1', sortOrder: 5 },
      { id: '5', name: 'G7' },
    ];

    const sorted = [...tables].sort(compareTables).map(t => t.name);
    expect(sorted).toEqual(['T1', 'T2', 'Big', 'G7', 'T10']);
  });
});
