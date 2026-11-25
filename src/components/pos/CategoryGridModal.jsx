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
      className="modal-overlay pos-cat-grid-overlay"
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
        {/* Subtle Mobile Bottom-Sheet Handle */}
        <div className="pos-cat-sheet-handle" aria-hidden="true">
          <span />
        </div>
        {/* Modal Header */}
        <div
          className="pos-cat-grid-header"
          style={{
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            gap: '10px',
            flexWrap: 'wrap',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.16)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <LayoutGrid size={18} strokeWidth={2.4} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '17px',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '-0.02em',
                }}
              >
                Categories
              </h3>
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 750,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#94a3b8',
                }}
              >
                {categories.length}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Quick search input (shown when > 10 categories) */}
            {categories.length > 10 && (
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    color: '#94a3b8',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Find..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    height: '34px',
                    width: '130px',
                    padding: '0 26px 0 30px',
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
                      right: '6px',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 2,
                    }}
                    title="Clear search"
                  >
                    <X size={13} />
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
                touchAction: 'manipulation',
              }}
              title="Close (Esc)"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body: High-Contrast Compact Tiles Grid (Fits all categories without scrolling) */}
        <div
          className="pos-cat-grid-body"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 16px 18px',
            overscrollBehavior: 'contain',
          }}
        >
          <div className="pos-cat-modal-grid">
            {/* 1. All Items Full-Width Header Row */}
            <button
              type="button"
              className={`pos-cat-modal-tile pos-cat-modal-tile--all ${activeCat === 'all' ? 'active' : ''}`}
              onClick={() => handleSelect('all')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <span className="pos-cat-modal-dot" style={{ background: '#10b981' }} />
                <span className="pos-cat-modal-title">All Items</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <span className="pos-cat-modal-count">{totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'}</span>
                {activeCat === 'all' && (
                  <span className="pos-cat-modal-check">
                    <Check size={11} strokeWidth={3.5} />
                  </span>
                )}
              </div>
            </button>

            {/* 2. Organized Category Grid — Clean Uniform Cards with Subtle Color Dot */}
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
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span className="pos-cat-modal-dot" />
                      <span className="pos-cat-modal-title">{c.name}</span>
                    </div>
                    {isActive && (
                      <span className="pos-cat-modal-check">
                        <Check size={11} strokeWidth={3.5} />
                      </span>
                    )}
                  </div>
                  <span className="pos-cat-modal-count">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                </button>
              );
            })}

            {/* 3. Full-Width Custom Item Action Bar */}
            {onOpenCustomItem && (
              <button
                type="button"
                className="pos-cat-modal-tile pos-cat-modal-tile--custom"
                onClick={() => {
                  hapticTap('light');
                  onClose();
                  onOpenCustomItem();
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Plus size={16} strokeWidth={2.5} style={{ color: '#fbbf24', flexShrink: 0 }} />
                  <span className="pos-cat-modal-title" style={{ color: '#f8fafc' }}>
                    Custom Item
                  </span>
                </div>
                <span className="pos-cat-modal-count pos-cat-modal-count--amber">Off-menu</span>
              </button>
            )}
          </div>

          {filteredCategories.length === 0 && (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: '#94a3b8' }}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>No categories matching "{search}"</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSearch('')}
                style={{ marginTop: '10px', borderRadius: '8px' }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
