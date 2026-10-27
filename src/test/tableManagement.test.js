import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTableStore } from '../stores/tableStore';
import { useOrderStore } from '../stores/orderStore';

describe('Table Management & Lifecycle Logic', () => {
  beforeEach(() => {
    useTableStore.setState({ tables: [], selectedTable: null });
    useOrderStore.setState({ activeOrders: [] });
  });

  it('addTable generates a deterministic doc ID upfront and stores proper initial dimensions', async () => {
    const tableData = {
      name: 'T1',
      capacity: 4,
      shape: 'rect',
      floor: 'Ground Floor',
    };

    const newTable = await useTableStore.getState().addTable('rest_demo_123', tableData);

    expect(newTable.id).toBeDefined();
    expect(typeof newTable.id).toBe('string');
    expect(newTable.name).toBe('T1');
    expect(newTable.status).toBe('free');
    expect(newTable.w).toBeGreaterThan(0);
    expect(newTable.h).toBeGreaterThan(0);

    const tables = useTableStore.getState().tables;
    expect(tables).toHaveLength(1);
    expect(tables[0].id).toBe(newTable.id);
  });

  it('freeTable resets status to free and currentOrderId to null', async () => {
    useTableStore.setState({
      tables: [{
        id: 't_1',
        name: 'T1',
        status: 'occupied',
        currentOrderId: 'ord_123',
        activeOrderId: 'ord_123',
      }]
    });

    await useTableStore.getState().freeTable('rest_demo_123', 't_1');

    const table = useTableStore.getState().tables.find(t => t.id === 't_1');
    expect(table.status).toBe('free');
    expect(table.currentOrderId).toBeNull();
    expect(table.activeOrderId).toBeNull();
  });

  it('updateOrderStatus with cancelled frees the associated table even as order is removed from activeOrders', async () => {
    const freeTableSpy = vi.spyOn(useTableStore.getState(), 'freeTable');

    useOrderStore.setState({
      activeOrders: [{
        id: 'ord_table_99',
        tableId: 't_99',
        tableName: 'T99',
        status: 'pending',
        type: 'dine-in',
        items: [{ id: 'item_1', name: 'Burger', price: 10, qty: 1 }],
      }]
    });

    useTableStore.setState({
      tables: [{
        id: 't_99',
        name: 'T99',
        status: 'occupied',
        currentOrderId: 'ord_table_99',
      }]
    });

    await useOrderStore.getState().updateOrderStatus('rest_demo_123', 'ord_table_99', 'cancelled');

    // The order should be cleared from activeOrders
    const active = useOrderStore.getState().activeOrders;
    expect(active.find(o => o.id === 'ord_table_99')).toBeUndefined();

    // freeTable must have been called for t_99
    expect(freeTableSpy).toHaveBeenCalledWith('rest_demo_123', 't_99');

    freeTableSpy.mockRestore();
  });

  it('preserves created tables and only removes the explicitly deleted table', async () => {
    const t1 = await useTableStore.getState().addTable('rest_demo_123', { name: 'T1', capacity: 2 });
    const t2 = await useTableStore.getState().addTable('rest_demo_123', { name: 'T2', capacity: 4 });
    const t3 = await useTableStore.getState().addTable('rest_demo_123', { name: 'T3', capacity: 6 });

    expect(useTableStore.getState().tables).toHaveLength(3);

    // Explicitly delete only T2
    await useTableStore.getState().deleteTable('rest_demo_123', t2.id);

    const remaining = useTableStore.getState().tables;
    expect(remaining).toHaveLength(2);
    expect(remaining.map(t => t.id)).toEqual([t1.id, t3.id]);
  });
});
