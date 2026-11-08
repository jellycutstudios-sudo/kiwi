import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTableStore } from '../../stores/tableStore';
import { formatCurrency } from '../../utils/formatCurrency';
import { X, Search, LayoutGrid, Layers, Armchair } from 'lucide-react';

export default function TableSelectModal({ restaurantId, currency = 'INR', tableOrders = {}, onSelect, onClose }) {
  const { t } = useTranslation();
  const { tables, subscribe } = useTableStore();
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedZone, setSelectedZone] = useState('all');
  const freeFirst = true; // Prioritize free tables first for fast POS seating
  // Default to compact mode (optimal for POS and touchscreens)
  const [viewMode, setViewMode] = useState('compact');

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = subscribe(restaurantId);
    return unsub;
  }, [restaurantId, subscribe]);

  // Derive effective status to guarantee 100% sync with active orders
  const getEffectiveStatus = useCallback((tbl) => {
    const activeOrder = tableOrders[tbl.id];
    const hasActiveOrder = activeOrder && !['billed', 'cancelled'].includes(activeOrder.status);
    if (hasActiveOrder) return 'occupied';
    if (tbl.status === 'reserved') return 'reserved';
    return tbl.status || 'free';
  }, [tableOrders]);

  // Overall counts based on real-time operational status
  const counts = useMemo(() => {
    let free = 0, occupied = 0, reserved = 0;
    tables.forEach(t => {
      const st = getEffectiveStatus(t);
      if (st === 'occupied') occupied++;
      else if (st === 'reserved') reserved++;
      else free++;
    });
    return { all: tables.length, free, occupied, reserved };
  }, [tables, getEffectiveStatus]);

  // Auto-detect zones/sections or table prefix clusters (e.g. 'T', 'G', 'B')
  const zones = useMemo(() => {
    const map = new Map();
    tables.forEach(t => {
      const prefix = t.name ? t.name.match(/^[A-Za-z]+/)?.[0] : null;
      const zoneName = t.section || (prefix ? prefix.toUpperCase() : null) || t.floor;
      if (zoneName) {
        map.set(zoneName, (map.get(zoneName) || 0) + 1);
      }
    });

    if (map.size >= 2) {
      return Array.from(map.entries()).map(([name, count]) => {
        let label = name;
        if (name.length === 1) {
          label = `${name}-Section`;
        }
        return { id: name, label, count };
      });
    }
    return [];
  }, [tables]);

  // Filter and sort tables
  const filteredTables = useMemo(() => {
    return tables
      .filter(tbl => {
        const effectiveStatus = getEffectiveStatus(tbl);
        if (filterStatus !== 'all' && effectiveStatus !== filterStatus) return false;

        if (selectedZone !== 'all') {
          const prefix = tbl.name ? tbl.name.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() : null;
          const zoneName = tbl.section || prefix || tbl.floor;
          if (zoneName !== selectedZone) return false;
        }

        if (search.trim() && !tbl.name.toLowerCase().includes(search.toLowerCase())) return false;

        return true;
      })
      .sort((a, b) => {
        if (freeFirst) {
          const aRank = getEffectiveStatus(a) === 'free' ? 0 : 1;
          const bRank = getEffectiveStatus(b) === 'free' ? 0 : 1;
          if (aRank !== bRank) return aRank - bRank;
        }
        return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [tables, filterStatus, selectedZone, search, freeFirst, getEffectiveStatus]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal table-select-modal">
        {/* Modal Header */}
        <div className="table-select-header">
          <div className="table-select-header-title-wrap">
            <Armchair size={20} color="var(--color-primary)" className="table-select-header-icon" />
            <div className="table-select-title-group">
              <h2 className="table-select-title">
                {t('selectTable')}
              </h2>
              <span className="table-select-count-badge">
                {counts.free} Free · {tables.length} Total
              </span>
            </div>
          </div>

          <div className="table-select-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* View Switcher: visible on desktop/wide screens only */}
            <div className="density-toggle table-select-density-toggle" style={{ padding: 2, background: 'var(--color-bg-secondary)' }}>
              <button
                type="button"
                className={`density-btn ${viewMode === 'compact' ? 'active' : ''}`}
                onClick={() => setViewMode('compact')}
                title="High-density keypad view"
              >
                <LayoutGrid size={13} />
                <span>Compact</span>
              </button>
              <button
                type="button"
                className={`density-btn ${viewMode === 'visual' ? 'active' : ''}`}
                onClick={() => setViewMode('visual')}
                title="Visual card view"
              >
                <Layers size={13} />
                <span>Visual</span>
              </button>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-icon table-select-close-btn"
              onClick={onClose}
              id="table-modal-close"
              title="Close modal"
              aria-label="Close"
              style={{ flexShrink: 0 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Minimal Search & Status Filter Controls */}
        <div className="table-select-controls">
          {/* Search Input */}
          <div className="table-select-search-wrap">
            <Search size={15} className="table-select-search-icon" />
            <input
              type="text"
              className="form-input table-select-search-input"
              placeholder="Search table (e.g. T1, G8)..."
              value={search}
              inputMode="search"
              enterKeyHint="search"
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="table-select-search-clear"
                onClick={() => setSearch('')}
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="table-select-status-pills">
            <button
              type="button"
              className={`table-filter-pill ${filterStatus === 'all' ? 'active' : ''}`}
              onClick={() => setFilterStatus('all')}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              className={`table-filter-pill free ${filterStatus === 'free' ? 'active' : ''}`}
              onClick={() => setFilterStatus('free')}
            >
              <span className="table-filter-dot free" />
              Free ({counts.free})
            </button>
            <button
              type="button"
              className={`table-filter-pill occupied ${filterStatus === 'occupied' ? 'active' : ''}`}
              onClick={() => setFilterStatus('occupied')}
            >
              <span className="table-filter-dot occupied" />
              Occupied ({counts.occupied})
            </button>
            {counts.reserved > 0 && (
              <button
                type="button"
                className={`table-filter-pill reserved ${filterStatus === 'reserved' ? 'active' : ''}`}
                onClick={() => setFilterStatus('reserved')}
              >
                <span className="table-filter-dot reserved" />
                Reserved ({counts.reserved})
              </button>
            )}
          </div>
        </div>

        {/* Optional Zone Chips Strip (Only if multiple zones exist) */}
        {zones.length > 0 && (
          <div className="table-select-zones-strip">
            <button
              type="button"
              className={`table-zone-chip ${selectedZone === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedZone('all')}
            >
              All Zones
            </button>
            {zones.map(z => (
              <button
                key={z.id}
                type="button"
                className={`table-zone-chip ${selectedZone === z.id ? 'active' : ''}`}
                onClick={() => setSelectedZone(z.id)}
              >
                {z.label} ({z.count})
              </button>
            ))}
          </div>
        )}

        {/* Modal Body: Tables Rendering */}
        <div className="modal-body table-select-body">
          <div key={`${selectedZone}_${filterStatus}_${viewMode}`} className="table-select-grid-animated">
          {viewMode === 'compact' ? (
            /* High-Density Compact Grid (Optimized for 20+ Tables) */
            <div className="table-compact-grid">
              {filteredTables.map(table => {
                const activeOrder = tableOrders[table.id];
                const baseStatus = getEffectiveStatus(table);
                const isFoodReady = activeOrder?.status === 'ready';
                const status = isFoodReady ? 'ready' : baseStatus;

                return (
                  <button
                    key={table.id}
                    id={`table-select-${table.id}`}
                    type="button"
                    className={`table-compact-card ${status}`}
                    onClick={() => onSelect(table.id, table.name, activeOrder, table)}
                    title={`${table.name} · ${table.capacity || 4} seats · ${isFoodReady ? 'Food Ready' : status}`}
                  >
                    <div className="table-compact-card-top">
                      <span className="table-compact-name">{table.name}</span>
                      <span className="table-compact-capacity">
                        {table.capacity || 4}p
                      </span>
                    </div>

                    <div className="table-compact-bottom">
                      <span className="table-compact-status-badge">
                        <span className={`table-compact-status-dot ${status}`} />
                        <span className={`table-compact-status-text ${status}`}>
                          {isFoodReady ? 'Ready' : status}
                        </span>
                      </span>

                      {activeOrder?.total ? (
                        <span className="table-compact-order-total">
                          {formatCurrency(activeOrder.total, currency)}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Visual 3D Furniture Mode (Traditional Card View) */
            <div className="table-3d-grid">
              {filteredTables.map(table => {
                const isRound = table.shape === 'round';
                const activeOrder = tableOrders[table.id];
                const status = getEffectiveStatus(table);

                return (
                  <div key={table.id} className="table-3d-item-wrapper">
                    {/* Surrounding 3D Chair Cushions */}
                    <div className={`table-3d-chair chair-top ${isRound ? 'round-chair' : ''}`} />
                    <div className={`table-3d-chair chair-bottom ${isRound ? 'round-chair' : ''}`} />
                    <div className={`table-3d-chair chair-left ${isRound ? 'round-chair' : ''}`} />
                    <div className={`table-3d-chair chair-right ${isRound ? 'round-chair' : ''}`} />

                    {/* 3D Realistic Tabletop Keycap */}
                    <button
                      id={`table-select-${table.id}`}
                      type="button"
                      className={`table-3d-card ${isRound ? 'round' : ''} ${status}`}
                      onClick={() => onSelect(table.id, table.name, activeOrder, table)}
                      title={`${table.name} · ${table.capacity} seats · ${status}`}
                    >
                      {/* Status Pill Badge */}
                      <span className={`table-3d-status-pill ${status}`}>
                        {status === 'free' && 'Free'}
                        {status === 'occupied' && 'Occupied'}
                        {status === 'reserved' && 'Reserved'}
                      </span>

                      {/* Bold Table Code */}
                      <span className="table-3d-name">{table.name}</span>

                      {/* Capacity */}
                      <span className="table-3d-capacity">
                        {table.capacity} seats
                      </span>

                      {/* Live Active Order Total if Occupied */}
                      {table.status === 'occupied' && activeOrder?.total && (
                        <span className="table-3d-order-total">
                          {formatCurrency(activeOrder.total, currency)}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {filteredTables.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--color-label-tertiary)', padding: '40px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <Armchair size={32} color="var(--color-label-tertiary)" />
              </div>
              <div style={{ fontWeight: 600 }}>No tables matching your criteria</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Try clearing search, changing zone, or adjusting party size.</div>
            </div>
          )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer table-select-footer" style={{ padding: '10px 18px', borderTop: '1px solid var(--color-separator)' }}>
          <div className="table-select-legend" style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: 'var(--color-label-tertiary)', marginRight: 'auto' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} /> Free
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e11d48' }} /> Occupied
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706' }} /> Reserved
            </span>
          </div>
          <button className="btn btn-secondary table-select-cancel-btn" onClick={onClose} style={{ height: 34, padding: '0 16px', fontSize: 13, borderRadius: 8 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
