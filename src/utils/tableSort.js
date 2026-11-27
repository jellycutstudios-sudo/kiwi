/**
 * Shared table floor grouping and sorting helpers used by both
 * TableMap (Floor Plan) and TableSelectModal (POS Table Picker)
 * so staff always see the exact same sections and table order.
 */

export function getTableFloor(table) {
  return table?.floor || 'Ground Floor';
}

export function compareTables(a, b) {
  const orderA = Number.isFinite(Number(a?.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
  const orderB = Number.isFinite(Number(b?.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return (a?.name || '').localeCompare(b?.name || '', undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}
