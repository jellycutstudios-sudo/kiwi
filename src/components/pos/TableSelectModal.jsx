import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTableStore } from '../../stores/tableStore';
import { X, Search } from 'lucide-react';

export default function TableSelectModal({ restaurantId, tableOrders = {}, onSelect, onClose }) {
  const { t } = useTranslation();
  const { tables, subscribe } = useTableStore();
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = subscribe(restaurantId);
    return unsub;
  }, [restaurantId, subscribe]);

  const counts = useMemo(() => ({
    all: tables.length,
    free: tables.filter(t => t.status === 'free').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    reserved: tables.filter(t => t.status === 'reserved').length,
  }), [tables]);

  const filteredTables = useMemo(() => {
    return tables.filter(tbl => {
      if (filterStatus !== 'all' && tbl.status !== filterStatus) return false;
      if (search.trim() && !tbl.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tables, filterStatus, search]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 780, width: 'min(780px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="modal-header" style={{ padding: '14px 22px', borderBottom: '1px solid var(--color-separator)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🪑</span>
            <div>
              <h2 className="modal-title" style={{ fontSize: 16.5, fontWeight: 800, color: 'var(--color-label)' }}>
                {t('selectTable')}
              </h2>
              <p style={{ fontSize: 11.5, color: 'var(--color-label-tertiary)', margin: 0 }}>
                Select an available table or view active orders
              </p>
            </div>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose} id="table-modal-close" style={{ width: 32, height: 32, padding: 0, borderRadius: 8 }}>
            <X size={16} />
          </button>
        </div>

        {/* Search & Filters Bar */}
        <div style={{ padding: '12px 22px 10px', borderBottom: '1px solid var(--color-separator-opaque)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--color-bg-secondary)' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-label-tertiary)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search table (e.g. T1, G8)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, height: 32, fontSize: 12, borderRadius: 7 }}
            />
          </div>

          {/* Quick Filter Pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`cart-addon-btn ${filterStatus === 'all' ? 'active' : ''}`}
              onClick={() => setFilterStatus('all')}
              style={{ height: 32, padding: '0 10px', fontSize: 11.5, borderRadius: 7 }}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              className={`cart-addon-btn ${filterStatus === 'free' ? 'active' : ''}`}
              onClick={() => setFilterStatus('free')}
              style={{ height: 32, padding: '0 10px', fontSize: 11.5, borderRadius: 7, color: '#15803d' }}
            >
              🟢 Free ({counts.free})
            </button>
            <button
              type="button"
              className={`cart-addon-btn ${filterStatus === 'occupied' ? 'active' : ''}`}
              onClick={() => setFilterStatus('occupied')}
              style={{ height: 32, padding: '0 10px', fontSize: 11.5, borderRadius: 7, color: '#be123c' }}
            >
              🔴 Occupied ({counts.occupied})
            </button>
            {counts.reserved > 0 && (
              <button
                type="button"
                className={`cart-addon-btn ${filterStatus === 'reserved' ? 'active' : ''}`}
                onClick={() => setFilterStatus('reserved')}
                style={{ height: 32, padding: '0 10px', fontSize: 11.5, borderRadius: 7, color: '#b45309' }}
              >
                ⭐ Reserved ({counts.reserved})
              </button>
            )}
          </div>
        </div>

        {/* 3D Tables Grid */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '22px 24px 28px' }}>
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
                    onClick={() => onSelect(table.id, table.name)}
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

          {filteredTables.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--color-label-tertiary)', padding: '40px 20px' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🪑</div>
              <div style={{ fontWeight: 600 }}>No tables matching your criteria</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Try clearing search or changing the filter.</div>
            </div>
          )}
        </div>

        {/* Footer */}
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
