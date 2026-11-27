import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('POS Dynamic Table and Customer Pills in Cart Header', () => {
  const indexCss = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');
  const posJsx = fs.readFileSync(path.resolve(__dirname, '../routes/POS.jsx'), 'utf-8');

  it('verifies Table pill shows table number directly instead of icon when assigned', () => {
    // Directly renders table number without bulky armchair icon
    expect(posJsx).toContain('className="cart-unified-table-num"');
    expect(posJsx).toContain('{tableName ? (tableName.startsWith(\'Table\') ? tableName : `T${tableName.replace(/^T/i, \'\')}`) : \'Table\'}');

    // When empty, renders dynamic Table label
    expect(posJsx).toContain('className="cart-unified-chip cart-unified-chip--table is-empty"');
    expect(posJsx).toContain('<span className="cart-unified-label">Table</span>');
  });

  it('verifies Customer pill dynamically displays readable info without collapsing', () => {
    // Shows name or phone when customer is assigned
    expect(posJsx).toContain('{customer?.name || customerName || customer?.phone || customerPhone}');
    expect(posJsx).toContain('className="cart-unified-chip cart-unified-chip--customer is-assigned"');

    // When empty, renders compact icon-only Customer button (or Delivery Info in delivery mode)
    expect(posJsx).toContain("className={`cart-unified-chip cart-unified-chip--customer is-empty ${orderType !== 'delivery' ? 'is-icon-only' : ''}`}");
    expect(posJsx).toContain('orderType === \'delivery\'');
    expect(posJsx).toContain('<UserPlus size={16} className="cart-unified-icon" />');
    expect(posJsx).toContain('Delivery Info');
  });

  it('verifies handleOrderTypeChange auto-clears table on delivery and takeaway', () => {
    expect(posJsx).toContain('if (newType === \'delivery\' || newType === \'takeaway\') {');
    expect(posJsx).toContain('setTable(null, null);');
  });

  it('verifies CSS balances Table and Customer widths so neither collapses or breaks line', () => {
    // Table number typography
    expect(indexCss).toContain('.cart-unified-table-num');
    expect(indexCss).toMatch(/\.cart-unified-table-num\s*\{[^}]*font-weight:\s*850/);

    // Table assigned width is fixed auto so text never collapses
    expect(indexCss).toContain('.cart-unified-chip--table.is-assigned');
    expect(indexCss).toMatch(/\.cart-unified-chip--table\.is-assigned\s*\{[^}]*flex:\s*0 0 auto/);

    // Customer chip flexes into available space
    expect(indexCss).toContain('.cart-unified-chip--customer');
    expect(indexCss).toMatch(/\.cart-unified-chip--customer\s*\{[^}]*flex:\s*1/);
  });

  it('verifies subtle live breathing dot on active running orders button', () => {
    // POS.jsx renders pos-op-live-dot when orders are running but not ready
    expect(posJsx).toContain('className="pos-op-live-dot"');

    // index.css has liveBreath animation and styling
    expect(indexCss).toContain('@keyframes liveBreath');
    expect(indexCss).toContain('.pos-op-live-dot');
    expect(indexCss).toMatch(/\.pos-op-live-dot\s*\{[^}]*animation:\s*liveBreath/);
  });
});
