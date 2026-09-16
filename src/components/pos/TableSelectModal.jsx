import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTableStore } from '../../stores/tableStore';
import { X, Search, LayoutGrid, Layers, ArrowDownUp, Users } from 'lucide-react';

export default function TableSelectModal({ restaurantId, tableOrders = {}, onSelect, onClose }) {
  const { t } = useTranslation();
  const { tables, subscribe } = useTableStore();
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [minSeats, setMinSeats] = useState(0); // 0 = any, 2, 4, 6, 8
  const [selectedZone, setSelectedZone] = useState('all');
  const [freeFirst, setFreeFirst] = useState(false);
  // Default to compact mode on small screens or when table count is high
  const [viewMode, setViewMode] = useState(() => {
    return window.innerWidth < 768 ? 'compact' : 'compact';
  });

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = subscribe(restaurantId);
    return unsub;
  }, [restaurantId, subscribe]);

  // Overall counts
  const counts = useMemo(() => ({
    all: tables.length,
    free: tables.filter(t => t.status === 'free').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    reserved: tables.filter(t => t.status === 'reserved').length,
  }), [tables]);

  // Auto-detect zones/sections or table prefix clusters (e.g. 'T', 'G', 'B')
  const zones = useMemo(() => {
    const map = new Map();
    tables.forEach(t => {
      // Priority: t.section -> table name letter prefix -> t.floor
      const prefix = t.name ? t.name.match(/^[A-Za-z]+/)?.[0] : null;
      const zoneName = t.section || (prefix ? prefix.toUpperCase() : null) || t.floor;
      if (zoneName) {
        map.set(zoneName, (map.get(zoneName) || 0) + 1);
      }
    });

    // Only show zone filter tabs if at least 2 distinct clusters exist with tables
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
        // Status filter
        if (filterStatus !== 'all' && tbl.status !== filterStatus) return false;
        
        // Party size / capacity filter
        if (minSeats > 0 && (tbl.capacity || 2) < minSeats) return false;

        // Zone / Section / Prefix filter
        if (selectedZone !== 'all') {
          const prefix = tbl.name ? tbl.name.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() : null;
          const zoneName = tbl.section || prefix || tbl.floor;
          if (zoneName !== selectedZone) return false;
        }

        // Search query
        if (search.trim() && !tbl.name.toLowerCase().includes(search.toLowerCase())) return false;

        return true;
      })
      .sort((a, b) => {
        // Priority 1: Free First (if enabled)
        if (freeFirst) {
          const aRank = a.status === 'free' ? 0 : 1;
          const bRank = b.status === 'free' ? 0 : 1;
          if (aRank !== bRank) return aRank - bRank;
        }

        // Priority 2: Natural alphanumeric sorting (T1, T2, T3... instead of T1, T10, T2)
        return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [tables, filterStatus, minSeats, selectedZone, search, freeFirst]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 880, width: 'min(880px, 95vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        {/* Modal Header */}
        <div className="modal-header" style={{ padding: '14px 22px', borderBottom: '1px solid var(--color-separator)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🪑</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 className="modal-title" style={{ fontSize: 16.5, fontWeight: 800, color: 'var(--color-label)' }}>
                  {t('selectTable')}
                </h2>
                <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(0,0,0,0.06)', padding: '1px 7px', borderRadius: 999 }}>
                  {filteredTables.length} of {tables.length} tables
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--color-label-tertiary)', margin: 0 }}>
                Select an available table or tap an occupied table to load active order
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* View Density Switcher (Compact Keypad vs 3D Cards) */}
            <div className="density-toggle" style={{ padding: 2, background: 'var(--color-bg-secondary)' }}>
              <button
                type="button"
                className={`density-btn ${viewMode === 'compact' ? 'active' : ''}`}
                onClick={() => setViewMode('compact')}
                title="High-density compact keypad (ideal for 20+ tables)"
              >
                <LayoutGrid size={13} />
                <span>Compact</span>
              </button>
              <button
                type="button"
                className={`density-btn ${viewMode === 'visual' ? 'active' : ''}`}
                onClick={() => setViewMode('visual')}
                title="3D furniture card view"
              >
                <Layers size={13} />
                <span>Visual</span>
              </button>
            </div>

            <button className="btn btn-secondary btn-icon" onClick={onClose} id="table-modal-close" style={{ width: 32, height: 32, padding: 0, borderRadius: 8 }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Search & Filters Bar */}
        <div style={{ padding: '10px 22px 10px', borderBottom: '1px solid var(--color-separator-opaque)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--color-bg-secondary)' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-label-tertiary)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search table (e.g. T1, G8)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, height: 32, fontSize: 12, borderRadius: 8 }}
            />
          </div>

          {/* Quick Filter Status Pills */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`cart-addon-btn ${filterStatus === 'all' ? 'active' : ''}`}
              onClick={() => setFilterStatus('all')}
              style={{ height: 32, padding: '0 10px', fontSize: 11.5, borderRadius: 8 }}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              className={`cart-addon-btn ${filterStatus === 'free' ? 'active' : ''}`}
              onClick={() => setFilterStatus('free')}
              style={{ height: 32, padding: '0 10px', fontSize: 11.5, borderRadius: 8, color: '#15803d' }}
            >
              🟢 Free ({counts.free})
            </button>
            <button
              type="button"
              className={`cart-addon-btn ${filterStatus === 'occupied' ? 'active' : ''}`}
              onClick={() => setFilterStatus('occupied')}
              style={{ height: 32, padding: '0 10px', fontSize: 11.5, borderRadius: 8, color: '#be123c' }}
            >
              🔴 Occupied ({counts.occupied})
            </button>
            {counts.reserved > 0 && (
              <button
                type="button"
                className={`cart-addon-btn ${filterStatus === 'reserved' ? 'active' : ''}`}
                onClick={() => setFilterStatus('reserved')}
                style={{ height: 32, padding: '0 10px', fontSize: 11.5, borderRadius: 8, color: '#b45309' }}
              >
                ⭐ Reserved ({counts.reserved})
              </button>
            )}

            {/* Smart "Free Tables First" Toggle Button */}
            <button
              type="button"
              className={`cart-addon-btn ${freeFirst ? 'active' : ''}`}
              onClick={() => setFreeFirst(v => !v)}
              style={{
                height: 32,
                padding: '0 10px',
                fontSize: 11.5,
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: freeFirst ? 'var(--color-accent)' : undefined,
                color: freeFirst ? '#ffffff' : undefined,
              }}
              title="Prioritize available free tables at the top"
            >
              <ArrowDownUp size={12} />
              Free First
            </button>
          </div>
        </div>

        {/* Secondary Bar: Zone / Section Clusters & Party Size Filter */}
        {(zones.length > 0 || tables.some(t => t.capacity >= 6)) && (
          <div style={{
            padding: '6px 22px 8px',
            borderBottom: '1px solid var(--color-separator)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            overflowX: 'auto',
            background: 'var(--color-bg)',
            fontSize: 11.5,
          }}>
            {/* Zone / Prefix Tabs */}
            {zones.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-label-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Zone:
                </span>
                <button
                  type="button"
                  className={`dietary-chip ${selectedZone === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedZone('all')}
                  style={{ minHeight: 24, padding: '3px 9px', fontSize: 11 }}
                >
                  All Zones
                </button>
                {zones.map(z => (
                  <button
                    key={z.id}
                    type="button"
                    className={`dietary-chip ${selectedZone === z.id ? 'active' : ''}`}
                    onClick={() => setSelectedZone(z.id)}
                    style={{ minHeight: 24, padding: '3px 9px', fontSize: 11 }}
                  >
                    {z.label} ({z.count})
                  </button>
                ))}
              </div>
            ) : <div />}

            {/* Party Size / Seat Capacity Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 'auto' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--color-label-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <Users size={11} /> Seats:
              </span>
              {[
                { label: 'All', min: 0 },
                { label: '2+', min: 2 },
                { label: '4+', min: 4 },
                { label: '6+', min: 6 },
                { label: '8+', min: 8 },
              ].map(opt => (
                <button
                  key={opt.min}
                  type="button"
                  onClick={() => setMinSeats(opt.min)}
                  style={{
                    height: 24,
                    padding: '0 7px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    border: '1px solid',
                    borderColor: minSeats === opt.min ? 'var(--color-label)' : 'var(--color-separator)',
                    background: minSeats === opt.min ? 'var(--color-label)' : 'transparent',
                    color: minSeats === opt.min ? 'var(--color-bg)' : 'var(--color-label-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Modal Body: Tables Rendering */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'compact' ? '16px 20px 24px' : '22px 24px 28px' }}>
          {viewMode === 'compact' ? (
            /* High-Density Compact Grid (Optimized for 20+ Tables) */
            <div className="table-compact-grid">
              {filteredTables.map(table => {
                const activeOrder = tableOrders[table.id];

                return (
                  <button
                    key={table.id}
                    id={`table-select-${table.id}`}
                    type="button"
                    className={`table-compact-card ${table.status}`}
                    onClick={() => onSelect(table.id, table.name, activeOrder, table)}
                    title={`${table.name} · ${table.capacity || 4} seats · ${table.status}`}
                  >
                    <div className="table-compact-card-top">
                      <span className="table-compact-name">{table.name}</span>
                      <span className="table-compact-capacity">
                        🪑 {table.capacity || 4}p
                      </span>
                    </div>

                    <div className="table-compact-bottom">
                      <span className="table-compact-status-badge">
                        <span className={`table-compact-status-dot ${table.status}`} />
                        <span style={{
                          textTransform: 'capitalize',
                          color: table.status === 'free' ? '#15803d' : (table.status === 'occupied' ? '#be123c' : '#b45309'),
                        }}>
                          {table.status}
                        </span>
                      </span>

                      {table.status === 'occupied' && activeOrder?.total ? (
                        <span className="table-compact-order-total">
                          ₹{activeOrder.total}
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
                      className={`table-3d-card ${isRound ? 'round' : ''} ${table.status}`}
                      onClick={() => onSelect(table.id, table.name, activeOrder, table)}
                      title={`${table.name} · ${table.capacity} seats · ${table.status}`}
                    >
                      {/* Status Pill Badge */}
                      <span className={`table-3d-status-pill ${table.status}`}>
                        {table.status === 'free' && '🟢 Free'}
                        {table.status === 'occupied' && '🔴 Occupied'}
                        {table.status === 'reserved' && '⭐ Reserved'}
                      </span>

                      {/* Bold Table Code */}
                      <span className="table-3d-name">{table.name}</span>

                      {/* Capacity */}
                      <span className="table-3d-capacity">
                        🪑 {table.capacity} seats
                      </span>

                      {/* Live Active Order Total if Occupied */}
                      {table.status === 'occupied' && activeOrder?.total && (
                        <span className="table-3d-order-total">
                          ₹{activeOrder.total}
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
              <div style={{ fontSize: 32, marginBottom: 8 }}>🪑</div>
              <div style={{ fontWeight: 600 }}>No tables matching your criteria</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Try clearing search, changing zone, or adjusting party size.</div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ padding: '12px 22px', borderTop: '1px solid var(--color-separator)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: 'var(--color-label-tertiary)', marginRight: 'auto' }}>
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
          <button className="btn btn-secondary" onClick={onClose} style={{ height: 32, padding: '0 16px', fontSize: 12, borderRadius: 7 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
