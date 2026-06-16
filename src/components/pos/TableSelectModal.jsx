import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTableStore } from '../../stores/tableStore';
import { X } from 'lucide-react';

export default function TableSelectModal({ restaurantId, onSelect, onClose }) {
  const { t } = useTranslation();
  const { tables, subscribe } = useTableStore();

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = subscribe(restaurantId);
    return unsub;
  }, [restaurantId, subscribe]);

  const statusConfig = {
    free:     { label: t('free'),     class: 'status-free',     selectable: true },
    occupied: { label: t('occupied'), class: 'status-occupied', selectable: false },
    reserved: { label: t('reserved'), class: 'status-reserved', selectable: true },
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2 className="modal-title">🪑 {t('selectTable')}</h2>
          <button className="btn btn-secondary btn-icon" onClick={onClose} id="table-modal-close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {/* Legend */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {Object.entries(statusConfig).map(([k, v]) => (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:'var(--space-1)', fontSize:'var(--text-caption1)' }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:`var(--status-${k})` }} />
                {v.label}
              </div>
            ))}
          </div>

          {/* Table grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(100px, 1fr))', gap:'var(--space-3)' }}>
            {tables.map(table => {
              const cfg = statusConfig[table.status] ?? statusConfig.free;
              return (
                <button
                  key={table.id}
                  id={`table-select-${table.id}`}
                  onClick={() => cfg.selectable && onSelect(table.id, table.name)}
                  disabled={!cfg.selectable}
                  style={{
                    padding: 'var(--space-4)',
                    borderRadius: table.shape === 'round' ? '50%' : 'var(--radius-lg)',
                    border: `2px solid var(--status-${table.status})`,
                    background: `var(--color-${table.status === 'free' ? 'green' : table.status === 'occupied' ? 'red' : 'orange'}-light)`,
                    cursor: cfg.selectable ? 'pointer' : 'not-allowed',
                    opacity: cfg.selectable ? 1 : 0.5,
                    transition: 'all var(--duration-fast)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-headline)', fontWeight: 'var(--weight-bold)' }}>{table.name}</div>
                  <div style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-secondary)', marginTop: 2 }}>
                    {table.capacity} seats
                  </div>
                  <div style={{ fontSize: 'var(--text-caption2)', marginTop: 2 }}>{cfg.label}</div>
                </button>
              );
            })}
          </div>

          {tables.length === 0 && (
            <div style={{ textAlign:'center', color:'var(--color-label-tertiary)', padding:'var(--space-8)' }}>
              No tables configured. Add tables in Floor Plan Editor.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
