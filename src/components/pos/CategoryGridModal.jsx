import { useState, useMemo, useEffect } from 'react';
import { X, Search, LayoutGrid, Check, Plus } from 'lucide-react';
import { hapticTap } from '../../utils/soundNotifications';

const POS_MODAL_CATEGORY_THEMES = [
  'pos-cat-theme-blue',
  'pos-cat-theme-purple',
  'pos-cat-theme-amber',
  'pos-cat-theme-crimson',
  'pos-cat-theme-teal',
  'pos-cat-theme-rose',
  'pos-cat-theme-indigo',
  'pos-cat-theme-cyan',
  'pos-cat-theme-orange',
  'pos-cat-theme-lime',
  'pos-cat-theme-fuchsia',
  'pos-cat-theme-emerald',
];

export default function CategoryGridModal({
  isOpen,
  onClose,
  categories = [],
  activeCat = 'all',
  onSelectCategory,
  onOpenCustomItem,
}) {
  const [search, setSearch] = useState('');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const totalItemsCount = useMemo(() => {
    return categories.reduce((sum, c) => sum + (c.items?.length || 0), 0);
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(c => c.name?.toLowerCase().includes(q));
  }, [categories, search]);

  if (!isOpen) return null;

  const handleSelect = (catId) => {
    hapticTap('light');
    if (onSelectCategory) {
      onSelectCategory(catId);
    }
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(10px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="All Menu Categories"
    >
      <div
        className="modal pos-cat-grid-modal animate-scale-up"
        style={{
          width: '940px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '20px',
          overflow: 'hidden',
          background: '#0d101a',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 32px 100px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Modal Header */}
        <div
          className="pos-cat-grid-header"
          style={{
            padding: '20px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            gap: '16px',
            flexWrap: 'wrap',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '11px',
                background: 'rgba(16, 185, 129, 0.16)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <LayoutGrid size={22} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '19px',
                    fontWeight: 800,
                    color: '#ffffff',
                    letterSpacing: '-0.02em',
                  }}
                >
                  All Menu Categories
                </h3>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 750,
                    padding: '2px 9px',
                    borderRadius: '999px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                  }}
                >
                  {categories.length}
                </span>
              </div>
              <p
                style={{
                  margin: '3px 0 0 0',
                  fontSize: '13px',
                  color: '#94a3b8',
                }}
              >
                1-tap jump to any category · Never scroll horizontally
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Quick search input */}
            {categories.length > 5 && (
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Search
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    color: '#94a3b8',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Find category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    height: '36px',
                    width: '190px',
                    padding: '0 30px 0 34px',
                    fontSize: '13px',
                    borderRadius: '9px',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    background: 'rgba(0, 0, 0, 0.35)',
                    color: '#ffffff',
                    outline: 'none',
                  }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 2,
                    }}
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary btn-icon"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#ffffff',
              }}
              title="Close (Esc)"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body: High-Contrast Premium Tiles Grid */}
        <div
          className="pos-cat-grid-body"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '22px 28px',
            overscrollBehavior: 'contain',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))',
              gap: '14px',
            }}
          >
            {/* 1. All Items Master Card */}
            <button
              type="button"
              className={`pos-cat-modal-tile pos-cat-theme-emerald ${activeCat === 'all' ? 'active' : ''}`}
              onClick={() => handleSelect('all')}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <span className="pos-cat-modal-title">
                  All Items
                </span>
                {activeCat === 'all' && (
                  <span className="pos-cat-modal-check">
                    <Check size={12} strokeWidth={3.5} />
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px' }}>
                <span className="pos-cat-modal-count">
                  {totalItemsCount} items
                </span>
                <span className="pos-cat-modal-action-hint">
                  {activeCat === 'all' ? 'Active' : 'Whole Menu'}
                </span>
              </div>
            </button>

            {/* Category Cards - Color-Coded Cashier Themes */}
            {filteredCategories.map((c, idx) => {
              const isActive = activeCat === c.id;
              const itemCount = c.items?.length || 0;
              const originalIdx = categories.findIndex(cat => cat.id === c.id);
              const themeClass = POS_MODAL_CATEGORY_THEMES[
                (originalIdx >= 0 ? originalIdx : idx) % POS_MODAL_CATEGORY_THEMES.length
              ];

              return (
                <button
                  key={c.id}
                  id={`cat-modal-tile-${c.id}`}
                  type="button"
                  className={`pos-cat-modal-tile ${themeClass} ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelect(c.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <span className="pos-cat-modal-title">
                      {c.name}
                    </span>
                    {isActive && (
                      <span className="pos-cat-modal-check">
                        <Check size={12} strokeWidth={3.5} />
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px' }}>
                    <span className="pos-cat-modal-count">
                      {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </span>
                    <span className="pos-cat-modal-action-hint">
                      {isActive ? 'Active' : 'Tap to open'}
                    </span>
                  </div>
                </button>
              );
            })}

            {/* Custom Item Tile */}
            {onOpenCustomItem && (
              <button
                type="button"
                className="pos-cat-modal-tile pos-cat-modal-tile--custom pos-cat-theme-amber"
                onClick={() => {
                  hapticTap('light');
                  onClose();
                  onOpenCustomItem();
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Plus size={18} strokeWidth={2.8} style={{ color: '#f59e0b' }} />
                  <span className="pos-cat-modal-title" style={{ color: '#fbbf24' }}>
                    Custom Item
                  </span>
                </div>
                <div style={{ marginTop: '14px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                    Punch off-menu special
                  </span>
                </div>
              </button>
            )}
          </div>

          {filteredCategories.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: '#94a3b8' }}>
              <p style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>No categories found matching "{search}"</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSearch('')}
                style={{ marginTop: '12px', borderRadius: '8px' }}
              >
                Clear Search
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className="pos-cat-grid-footer"
          style={{
            padding: '14px 28px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <span style={{ fontSize: '12.5px', color: '#64748b' }}>
            Tip: Tapping any category card selects it and closes this view automatically.
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            style={{ borderRadius: '8px', padding: '0 20px', height: '34px', fontSize: '13px' }}
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
