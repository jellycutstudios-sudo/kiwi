import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Add Floor and Table Logic & Grid View Configuration', () => {
  const indexCss = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');
  const tableMapJsx = fs.readFileSync(path.resolve(__dirname, '../routes/TableMap.jsx'), 'utf-8');

  it('verifies Add Room (+ Add Floor) is exposed to authorized users inside the floor options menu', () => {
    // Add Room button must be gated by canEditLayout inside the clean More dropdown
    expect(tableMapJsx).toContain('canEditLayout && (');
    expect(tableMapJsx).toContain('id="tablemap-more-add-room-btn"');
    expect(tableMapJsx).toContain('handleAddFloor()');
    expect(tableMapJsx).toContain('Add Room');

    // Empty floor delete button must also be gated by canEditLayout
    expect(tableMapJsx).toContain('const isCanDelete = canEditLayout && floor !== \'Ground Floor\' && floorCount === 0;');
    expect(tableMapJsx).toContain('className="tm-floor-del-btn"');
    expect(tableMapJsx).toContain('onClick={(e) => { e.stopPropagation(); handleDeleteFloor(floor); }}');
  });

  it('verifies Table Cards include direct configure/edit button in grid view', () => {
    // Free tables can now be configured directly without navigating away to POS
    expect(tableMapJsx).toContain('className="tm-card-edit-btn"');
    expect(tableMapJsx).toContain('title={`Configure Table ${t.name}`}');
    expect(tableMapJsx).toContain('setSelectedEditTableId(t.id)');
    expect(tableMapJsx).toContain('e.stopPropagation()');

    // CSS styling exists for the edit button
    expect(indexCss).toContain('.tm-card-edit-btn');
    expect(indexCss).toContain('.tm-card-edit-btn:hover');
    expect(indexCss).toContain('[data-theme="dark"] .tm-card-edit-btn');
  });

  it('verifies Add Table workflow auto-opens the configuration modal', () => {
    // handleAddTable captures created table and opens modal immediately
    expect(tableMapJsx).toContain('const created = await addTable(restaurant.id,');
    expect(tableMapJsx).toContain('if (created?.id) {');
    expect(tableMapJsx).toContain('setSelectedEditTableId(created.id);');
  });

  it('verifies Table Edit Modal features rapid seating capacity presets', () => {
    // Capacity presets for 2, 4, 6, 8, 10, 12 seats
    expect(tableMapJsx).toContain('[2, 4, 6, 8, 10, 12].map(cap => (');
    expect(tableMapJsx).toContain('updateTable(restaurant.id, selectedEditTable.id, { capacity: cap })');
    expect(tableMapJsx).toContain('Number(selectedEditTable.capacity) >= 6 ? \'★ Wide Card (2 cols)\' : \'Standard Card (1 col)\'');

    // Obsolete 2D canvas shape and pixel dimensions removed from Table Edit modal
    expect(tableMapJsx).not.toContain('Horizontal\n                      </button>');
  });

  it('verifies real-time restaurant floors synchronization and empty floor persistence', () => {
    // Realtime snapshot listener on restaurants/{id} document
    expect(tableMapJsx).toContain('doc(db, \'restaurants\', restaurant.id)');
    expect(tableMapJsx).toContain('useAuthStore.getState().updateRestaurantState({ floors: data.floors });');

    // handleConfirmAddFloor and handleDeleteFloor synchronize authStore state
    expect(tableMapJsx).toContain('useAuthStore.getState().updateRestaurantState({');
    expect(tableMapJsx).toContain('floors: Array.from(new Set([...(restaurant.floors || []), cleanName]))');
    expect(tableMapJsx).toContain('floors: (restaurant.floors || []).filter(f => f !== floorToDelete)');
  });
});
